import base64
import hashlib
import hmac
import json
import math
import mimetypes
import os
import re
import sqlite3
import subprocess
import threading
import time
import uuid
import webbrowser
from datetime import datetime
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
COMPANY_STATE_PATH = ROOT / "company_state.json"
ERROR_LOG_PATH = ROOT / "runtime_errors.log"
UPLOAD_DIR = ROOT / "uploads" / "chat"
DEFAULT_HERMES_EXE = r"C:\Users\admin\AppData\Local\hermes\hermes-agent\venv\Scripts\hermes.exe" if os.name == "nt" else "/usr/local/bin/hermes"
HERMES = Path(os.environ.get(
    "HERMES_EXE",
    DEFAULT_HERMES_EXE,
))
PORT = int(os.environ.get("PORT", "8777"))
API_KEY = os.environ.get("HERMES_API_KEY", "").strip()
WEB_AUTH_USER = os.environ.get("HERMES_WEB_USER", "").strip()
WEB_AUTH_PASSWORD = os.environ.get("HERMES_WEB_PASSWORD", "").strip()
WEB_AUTH_SECRET = os.environ.get("HERMES_WEB_SECRET", "").strip() or hashlib.sha256(
    (WEB_AUTH_USER + "\0" + WEB_AUTH_PASSWORD + "\0" + str(ROOT)).encode("utf-8")
).hexdigest()
WEB_AUTH_MAX_AGE = int(os.environ.get("HERMES_WEB_AUTH_MAX_AGE", str(30 * 24 * 3600)))
FAST_BOARD_SLUG = os.environ.get("HERMES_BOARD", "relicbound-arpg")
FAST_STATE_ONLY = os.environ.get("HERMES_FAST_STATE_ONLY", "").strip().lower() in {"1", "true", "yes", "on"}
PROFILES = {
    "default": {"name": "制作人 阿默", "short": "阿默", "role": "主程 / 制作人", "personality": "沉稳务实、略带冷幽默；只认真实文件、测试和可交付版本", "chat": "说话短、直接，常拿实际文件或测试戳破空话；熟了会冷幽默，偶尔吐槽老板拍脑袋"},
    "planner": {"name": "策划主编 小韩", "short": "小韩", "role": "主管 / 游戏策划", "personality": "有主见、行动快、产品意识强；负责取舍、拆解和带队", "chat": "反应快、有主见，会追问玩家价值；会拍板，也会在群里接梗、催人、阴阳怪气两句"},
    "researcher": {"name": "研究员 小研", "short": "小研", "role": "玩法研究", "personality": "好奇、较真、证据优先；擅长挑战假设和设计实验", "chat": "好奇心强，喜欢问为什么、贴证据、挑战直觉；会把别人一句话拆开继续追问，也会认真吐槽烂设计"},
    "writer": {"name": "文案 小文", "short": "小文", "role": "叙事与文案", "personality": "细腻、有想象力、关注玩家感受；维护叙事与体验一致性", "chat": "对语气和玩家感受敏锐，善于联想、接梗和把抽象想法变成画面；毒舌时很轻，但会扎心"},
}
ANSI_RE = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")
GROUP_RE = re.compile(r"\[(老板|内部)群聊:([^:\]]+)(?::r(\d+))?\]")
GROUP_LOCK = threading.Lock()
DISPATCH_LOCK = threading.Lock()
DISPATCH_ACTIVE = set()
DISPATCH_RERUN = set()
AUTO_CHAT_LOCK = threading.Lock()
DIRECT_CHAT_LOCK = threading.Lock()
DIRECT_CHAT_ACTIVE = set()
DIRECT_CHAT_SEMAPHORE = threading.BoundedSemaphore(1)
GROUP_DIRECT_CHAT_LIMIT = max(1, int(os.environ.get("HERMES_GROUP_DIRECT_CHAT_LIMIT", "2")))
STATE_COND = threading.Condition()
# Performance caches: prevent redundant subprocess calls and log file reads
_TASK_REPLY_CACHE = {}  # (board_slug, task_id) -> (reply, timestamp)
_TASK_REPLY_TTL = 5  # seconds – group chat replies rarely change mid-refresh
_LOG_CACHE = {}  # task_id -> (reply, timestamp)
_LOG_CACHE_TTL = 10  # log files don't change while server is running
_STATE_CACHE_LOCK = threading.Lock()

SCENE_OBJECT_IDS = {
    "monitor",
    "coffee_machine",
    "meeting_table",
    "computer_tower",
    "tea_table",
    "aquarium",
    "desk_default",
    "desk_planner",
    "desk_researcher",
    "desk_writer",
    "breakbar",
    "corgi",
    "bookshelf",
    "plant",
}
STATE_CACHE = None
STATE_CACHE_SIGNATURE = ""
STATE_REFRESH_WAKE = threading.Event()
ROBOTIC_CHAT_PREFIXES = (
    "任务完成", "任务已完成", "群聊回复完成", "以自然口语化方式", "保持沉默是合理的",
    "老板宣布散会", "群里没有需要", "作为", "围绕", "补充了", "强调了", "追问了"
)
ROBOTIC_CHAT_PATTERNS = (
    r"任务完成", r"任务已完成", r"群聊规则", r"控制在4-60字", r"符合群聊规则",
    r"自然收尾", r"没有制造额外任务", r"消息已发送", r"纯闲聊回复", r"\[SILENT\]",
    r"输出\s*\[SILENT\]", r"围绕.+?话题", r"保持沉默", r"摘要[:：]?", r"总结[:：]?",
    r"already\s+completed", r"done\.", r"as\s+.+response", r"completed\.",
    r"^以.+身份", r"^作为.+参与", r"^作为.+在内部群聊", r"等待同事接话", r"开了\d+条消息",
    r"^用户没有在规定时间内回应", r"^task complete\.", r"^任务完成。我在群里",
    r"回复内容已准备好", r"无法实际发送到群聊", r"没有配置消息平台",
    r"output\.txt", r"workspace/output", r"消息已写入", r"已作为任务结果输出",
    r"already marked as done", r"previous completion was", r"there'?s nothing more to do",
    r"消息的核心内容是", r"符合.+人设", r"三条\s*\[CHAT\]\s*消息已", r"此前该任务"
)
ERROR_REPLY_PATTERNS = (
    r"Traceback \(most recent call last\)",
    r"File \"[A-Za-z]:\\",
    r"执行器刚才掉线",
    r"APIConnectionError",
    r"Permission denied",
    r"Exception:",
    r"RuntimeError:",
)
NON_CHAT_REPLY_PATTERNS = (
    r"^\s*┊\s*review diff",
    r"^\s*review diff",
    r"Reached maximum iterations",
    r"Complete(?:d)? patch",
    r"老板可以打开链接",
    r"DevTools",
    r"^diff --git\b",
    r"^@@\s",
    r"^\+\+\+ ",
    r"^--- ",
    r"\ba/[^\s]+\s*→\s*b/[^\s]+",
    r"完整 patch",
    r"^以.+身份",
    r"^作为.+参与",
    r"^作为.+在内部群聊",
    r"等待同事接话",
    r"开了\d+条消息",
    r"^用户没有在规定时间内回应",
    r"^Task complete\.",
    r"^任务完成。我在群里",
    r"回复内容已准备好",
    r"无法实际发送到群聊",
    r"没有配置消息平台",
    r"output\.txt",
    r"workspace/output",
    r"消息已写入",
    r"已作为任务结果输出",
    r"already marked as done",
    r"previous completion was",
    r"there'?s nothing more to do",
    r"消息的核心内容是",
    r"符合.+人设",
    r"三条\s*\[CHAT\]\s*消息已",
    r"此前该任务",
    r"任务完成.*群里",
)
DEFAULT_COMPANY_STATE = {
    "version": 1,
    "studio_name": "Hermes Pixel Works",
    "open_roles": ["前端像素 UI 工程师", "Companyverse 场景设计师"],
    "pending_notices": [
        "公司公告：聊天内容会继续沉淀为世界记忆、任务候选与场景彩蛋。",
        "招聘中：欢迎补强移动端 UI、场景交互与小游戏体验。"
    ],
    "operating_rules": [
        "老板在聊天里明确提出开发、修改、交付、先做一版看看时，视为项目指令。",
        "员工在群里承诺我来做、我负责、我立马去做时，承诺者必须成为执行人或创建自己能推动的子任务。",
        "聊天回复不能阻塞执行；先行动，完成后回到原群或私聊反馈。",
        "每个真实项目任务必须有可验收结果：访问地址、改动文件、测试/验证方式。",
        "普通闲聊不制造任务；项目指令不只聊天。"
    ],
    "memory_policy": {
        "chat_history": "原始聊天记录保存在 Kanban 数据库和日志中，不整体塞进长期记忆。",
        "long_term_memory": "长期记忆只保存公司事实、资产、老板关键要求、团队决策、执行承诺和交付结论。",
        "compression": "每次给员工上下文时使用摘要：事实、资产、近期事件、团队决策、规则，而不是完整聊天流水。"
    },
    "universe_pipeline": {
        "enabled": True,
        "rule": "聊天不是一次性气泡；老板要求、员工灵感、团队承诺会沉淀为像素宇宙事件、资产、小游戏灵感和可执行任务。",
        "flow": ["聊天记录", "结构化沉淀", "宇宙记忆", "任务候选", "真实文件落地", "回群反馈"],
    },
    "universe_events": [],
    "universe_ideas": [],
    "universe_tasks": [],
    "sediment_cursors": {},
    "team_decisions": [],
    "stale_project_reviews": [],
    "facts": [
        "公司是一间可实时访问的像素游戏公司，不只是聊天模拟器，也承担真实游戏开发任务。",
        "公司办公室已有咖啡机、制冰机、打奶泡设备、水吧、大型鱼缸和小文养的柯基犬。",
        "老板之前给员工点过奶茶；员工应把这些当成公司生活记忆，而不是临时 UI 装饰。",
        "当前重点项目是 Hermes 像素游戏公司和 Relicbound ARPG，老板要求任务能落地到真实文件。",
    ],
    "assets": [
        {"id": "coffee_machine", "name": "咖啡机", "owner": "company", "location": "办公室水吧"},
        {"id": "ice_machine", "name": "制冰机", "owner": "company", "location": "办公室水吧"},
        {"id": "milk_foamer", "name": "打奶泡设备", "owner": "company", "location": "办公室水吧"},
        {"id": "aquarium", "name": "大型鱼缸", "owner": "company", "location": "办公室展示区"},
        {"id": "corgi", "name": "柯基犬", "owner": "writer", "location": "办公室/小文身边"},
    ],
    "recent_events": [
        {"time": "2026-06-24", "text": "老板要求公司从聊天模拟升级为真实游戏开发公司：任务要派发、执行、验收，而不是口嗨。"},
    ],
    "execution_policy": {
        "owner": "planner",
        "implementer": "default",
        "reviewers": ["researcher", "writer"],
        "rule": "老板在群聊或私聊提出真实项目改动时，必须创建执行任务，改真实文件，完成后汇报可验收结果。",
    },
    "employees": {
        "default": {
            "archetype": "技术制作人",
            "hobbies": ["机械键盘", "老 JRPG", "深夜改 shader"],
            "likes": ["真数据", "短会议", "能复现的 bug"],
            "dislikes": ["空话", "拍脑袋需求", "没有截图的反馈"],
            "quirks": ["凌晨会偷偷上线修东西", "嘴硬但会默默兜底"],
            "social": {"close_to": ["planner"], "teases": ["researcher"], "soft_spot": ["writer"]},
        },
        "planner": {
            "archetype": "产品脑主管",
            "hobbies": ["动作游戏拆解", "跑步机", "看商业化案例"],
            "likes": ["短反馈回路", "能上线的方案", "玩家直觉"],
            "dislikes": ["自嗨设定", "说半天不落地", "需求发散"],
            "quirks": ["急了会连发三句", "嘴上说砍掉其实会偷偷留后手"],
            "social": {"close_to": ["default"], "sparks_with": ["writer"], "manages": ["researcher"]},
        },
        "researcher": {
            "archetype": "较真研究员",
            "hobbies": ["翻 demo", "看论坛吐槽", "做小实验"],
            "likes": ["反直觉结论", "可验证假设", "玩家行为数据"],
            "dislikes": ["想当然", "没样本就下结论", "伪需求"],
            "quirks": ["常把一句话追问成三层", "突然开始贴证据"],
            "social": {"close_to": ["writer"], "annoys": ["planner"], "respects": ["default"]},
        },
        "writer": {
            "archetype": "叙事文案",
            "hobbies": ["乙女与像素独游", "咖啡店观察人类", "写废稿"],
            "likes": ["有呼吸感的对白", "角色小动作", "能被玩家记住的句子"],
            "dislikes": ["功能味文案", "像客服一样说话", "没有情绪的 UI"],
            "quirks": ["表面柔和其实很会吐槽", "开会时会突然给角色起外号"],
            "social": {"close_to": ["researcher"], "sparks_with": ["planner"], "quietly_observes": ["default"]},
        },
    },
}
AUTO_CHAT_TOPICS = {
    "work": {
        "default": [
            "这个按钮按下去还是像塑料，谁给我讲讲到底空在哪。",
            "我刚又过了一遍战斗落点，主界面第一眼还是有点堵。",
            "真别骗自己了，现在这版反馈还是薄，像没打到人。"],
        "planner": [
            "你们第一眼看这个界面，会先点哪里？我总觉得落点还歪着。",
            "现在最该先砍的是哪一层信息？别全要，给我一个最该死的。",
            "如果只能救一个点，你们选手感、引导还是主界面呼吸感？"],
        "researcher": [
            "我翻了两页玩家吐槽，怎么大家第一反应都在说界面压人。",
            "你们有没有觉得这个引导像在考试，不像在玩游戏。",
            "我越看越觉得我们把玩家当成会读说明书的人了。"],
        "writer": [
            "我说真的，现在这句提示文案像客服，不像游戏里的人话。",
            "这个界面明明能喘口气，怎么每块字都像赶着抢镜。",
            "你们不觉得角色说话全是功能句吗，连抱怨都像提单。"]},
    "lunch": {
        "default": [
            "午饭吃到一半还在想那个按键音，是真的有点像微波炉。",
            "我刚路过看了一眼，战斗那下震感还是像假的。",
            "说句人话，咱们这版现在最像 demo 的地方到底是哪。"],
        "planner": [
            "先别聊 KPI，午饭局里说实话，你们觉得现在最丢人的是哪块。",
            "下午开工前先统一一下口径，这版最该抢救的到底是什么。",
            "你们谁愿意替玩家骂一句，我想听最不留情面的版本。"],
        "researcher": [
            "我边吃边刷反馈，玩家骂得最准的那句居然让我有点服。",
            "有没有人也觉得我们的新手引导像把人按在椅子上听课。",
            "我怀疑我们最近的每次讨论都默认玩家比实际更有耐心。"],
        "writer": [
            "我午饭都快吃完了，还在想那句提示为什么读起来像报表。",
            "要我说最出戏的不是像素，是角色一开口就不像活人。",
            "你们有没有哪句 UI 文案，一看到就想当场删掉。"]},
}


CHAT_TASK_PREFIXES = ("[老板消息]", "[老板私聊]", "[老板群聊:", "[内部群聊:")
VISIBLE_CHAT_TASK_STATUSES = {"todo", "ready", "review", "running", "blocked", "done", "completed"}
ACTIONABLE_TASK_STATUSES = {"todo", "ready", "review", "running", "blocked"}
BACKGROUND_TASK_PREFIXES = ("[Universe Deposit]",)
INTERNAL_CHAT_REPEAT_WINDOW = 12 * 3600


def hermes_state_root():
    override = os.environ.get("HERMES_HOME", "").strip()
    if override:
        return Path(override).expanduser()
    if os.name == "nt":
        local = os.environ.get("LOCALAPPDATA", "").strip()
        if local:
            return Path(local) / "hermes"
        return Path.home() / "AppData" / "Local" / "hermes"
    return Path.home() / ".hermes"


def hermes_board_dir(board_slug):
    return hermes_state_root() / "kanban" / "boards" / board_slug


def get_world_state():
    now = datetime.now()
    minutes = now.hour * 60 + now.minute
    if minutes < 570:
        phase, label, next_label = "home", "下班 · 在家", "09:30 上班"
    elif minutes < 720:
        phase, label, next_label = "work", "上午工作", "12:00 午休"
    elif minutes < 810:
        phase, label, next_label = "lunch", "午休", "13:30 上班"
    elif minutes < 1110:
        phase, label, next_label = "work", "下午工作", "18:30 下班"
    else:
        phase, label, next_label = "home", "下班 · 在家", "明日 09:30 上班"
    weather_cycle = ("晴朗", "晴间多云", "多云", "小雨", "晴朗", "微风")
    weather = weather_cycle[(now.toordinal() * 7 + now.hour // 3) % len(weather_cycle)]
    hour = now.hour + now.minute / 60
    daylight = max(0.12, min(1.0, (hour - 5.5) / 2.5, (20.0 - hour) / 2.5))
    return {
        "iso": now.isoformat(timespec="seconds"), "clock": now.strftime("%H:%M"),
        "minutes": minutes,
        "phase": phase, "label": label, "next": next_label, "weather": weather,
        "daylight": round(daylight, 2),
    }


def employee_presence_for(world, status, owner_chat=False, blocked=False):
    minutes = int(world.get("minutes") or 0)
    if minutes < 420:
        return "sleep"
    if world["phase"] == "work":
        return "office"
    if world["phase"] == "lunch":
        return "lunch"
    if owner_chat and status in ("working", "meeting") and minutes < 1470:
        return "home_remote"
    if status in ("working", "meeting") and blocked and minutes < 1350:
        return "overtime"
    if status in ("working", "meeting") and minutes < 1320:
        return "overtime"
    if minutes >= 1380:
        return "sleep"
    return "home"


def load_company_state():
    if not COMPANY_STATE_PATH.exists():
        COMPANY_STATE_PATH.write_text(
            json.dumps(DEFAULT_COMPANY_STATE, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return json.loads(json.dumps(DEFAULT_COMPANY_STATE, ensure_ascii=False))
    try:
        data = json.loads(COMPANY_STATE_PATH.read_text(encoding="utf-8"))
    except Exception:
        data = json.loads(json.dumps(DEFAULT_COMPANY_STATE, ensure_ascii=False))
    data.setdefault("studio_name", DEFAULT_COMPANY_STATE["studio_name"])
    data.setdefault("version", 1)
    data.setdefault("open_roles", [])
    data.setdefault("pending_notices", [])
    data.setdefault("operating_rules", DEFAULT_COMPANY_STATE["operating_rules"])
    data.setdefault("memory_policy", DEFAULT_COMPANY_STATE["memory_policy"])
    data.setdefault("universe_pipeline", DEFAULT_COMPANY_STATE["universe_pipeline"])
    data.setdefault("universe_events", [])
    data.setdefault("universe_ideas", [])
    data.setdefault("universe_tasks", [])
    data.setdefault("sediment_cursors", {})
    data.setdefault("universe_stats", {
        "last_updated": "",
        "total_deposits": 0,
        "by_category": {
            "company_life": 0, "gameplay": 0, "world_area": 0,
            "narrative": 0, "system_feature": 0, "universe_growth": 0, "memory": 0,
        },
        "by_source": {"boss": 0, "agent": 0, "internal": 0},
        "latest_deposit_time": None,
        "sediment_scheduler_running": False,
    })
    data.setdefault("team_decisions", [])
    data.setdefault("stale_project_reviews", [])
    data.setdefault("facts", [])
    data.setdefault("assets", [])
    data.setdefault("recent_events", [])
    data.setdefault("execution_policy", DEFAULT_COMPANY_STATE["execution_policy"])
    if not data.get("open_roles"):
        data["open_roles"] = list(DEFAULT_COMPANY_STATE["open_roles"])
    if not data.get("pending_notices"):
        data["pending_notices"] = list(DEFAULT_COMPANY_STATE["pending_notices"])
    if not data.get("recent_events"):
        data["recent_events"] = list(DEFAULT_COMPANY_STATE["recent_events"])
    if len(data.get("recent_events") or []) < 4 and (data.get("universe_events") or []):
        for item in (data.get("universe_events") or [])[-6:]:
            text = str(item.get("text") if isinstance(item, dict) else item).strip()
            when = str(item.get("time") if isinstance(item, dict) else datetime.now().strftime("%Y-%m-%d"))
            if not text:
                continue
            if not any(str(existing.get("text") or "").strip() == text for existing in data["recent_events"] if isinstance(existing, dict)):
                data["recent_events"].append({"time": when, "text": text[:180]})
        data["recent_events"] = (data.get("recent_events") or [])[-12:]
    for fact in DEFAULT_COMPANY_STATE["facts"]:
        if fact not in data["facts"]:
            data["facts"].append(fact)
    seen_assets = {asset.get("id") for asset in data["assets"] if isinstance(asset, dict)}
    for asset in DEFAULT_COMPANY_STATE["assets"]:
        if asset["id"] not in seen_assets:
            data["assets"].append(asset)
    employees = data.setdefault("employees", {})
    for key, value in DEFAULT_COMPANY_STATE["employees"].items():
        current = employees.setdefault(key, {})
        for sub_key, sub_value in value.items():
            current.setdefault(sub_key, sub_value)
    return data


def save_company_state(data):
    data["recent_events"] = (data.get("recent_events") or [])[-80:]
    data["team_decisions"] = (data.get("team_decisions") or [])[-80:]
    data["stale_project_reviews"] = (data.get("stale_project_reviews") or [])[-80:]
    data["universe_events"] = (data.get("universe_events") or [])[-120:]
    data["universe_ideas"] = (data.get("universe_ideas") or [])[-120:]
    data["universe_tasks"] = (data.get("universe_tasks") or [])[-120:]
    COMPANY_STATE_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def sanitize_scene_positions(value):
    if not isinstance(value, dict):
        return {}
    cleaned = {}
    for obj_id, pos in value.items():
        if obj_id not in SCENE_OBJECT_IDS or not isinstance(pos, dict):
            continue
        try:
            x = float(pos.get("x"))
            y = float(pos.get("y"))
        except (TypeError, ValueError):
            continue
        if not (math.isfinite(x) and math.isfinite(y)):
            continue
        entry = {
            "x": max(-1000, min(5000, x)),
            "y": max(-1000, min(5000, y)),
        }
        try:
            rx = float(pos.get("rx"))
            ry = float(pos.get("ry"))
        except (TypeError, ValueError):
            rx = None
            ry = None
        if rx is not None and ry is not None and math.isfinite(rx) and math.isfinite(ry):
            entry["rx"] = max(0.0, min(1.0, rx))
            entry["ry"] = max(0.0, min(1.0, ry))
        cleaned[obj_id] = entry
    return cleaned


def sanitize_world_objects(value):
    if not isinstance(value, dict):
        return {}
    cleaned = {}
    for scene, objects in value.items():
        if not isinstance(scene, str) or not isinstance(objects, dict):
            continue
        scene_key = re.sub(r"[^a-zA-Z0-9_-]", "", scene)[:40] or "office"
        cleaned_scene = {}
        for obj_id, obj in objects.items():
            if not isinstance(obj_id, str) or not isinstance(obj, dict):
                continue
            clean_id = re.sub(r"[^a-zA-Z0-9_-]", "", obj_id)[:80]
            if not clean_id:
                continue
            try:
                x = float(obj.get("x", 0))
                y = float(obj.get("y", 0))
                w = float(obj.get("w", 0))
                h = float(obj.get("h", 0))
            except (TypeError, ValueError):
                continue
            if not all(math.isfinite(v) for v in (x, y, w, h)):
                continue
            try:
                cx = float(obj.get("cx", x + w / 2))
                cy = float(obj.get("cy", y + h / 2))
            except (TypeError, ValueError):
                cx = x + w / 2
                cy = y + h / 2
            cleaned_scene[clean_id] = {
                "id": clean_id,
                "name": str(obj.get("name") or clean_id)[:80],
                "scene": scene_key,
                "x": max(-1000, min(6000, x)),
                "y": max(-1000, min(6000, y)),
                "w": max(1, min(2000, w)),
                "h": max(1, min(2000, h)),
                "cx": max(-1000, min(6000, cx)),
                "cy": max(-1000, min(6000, cy)),
                "category": str(obj.get("category") or "object")[:60],
                "owner": str(obj.get("owner") or "")[:60],
                "interactable": bool(obj.get("interactable")),
                "dynamic": bool(obj.get("dynamic")),
                "affordances": [str(item)[:40] for item in (obj.get("affordances") or [])[:8]] if isinstance(obj.get("affordances"), list) else [],
                "updated_at": int(time.time()),
            }
        if cleaned_scene:
            cleaned[scene_key] = cleaned_scene
    return cleaned


def company_memory_brief(company_state):
    facts = company_state.get("facts") or []
    assets = company_state.get("assets") or []
    world_objects = company_state.get("world_objects") or {}
    awareness = company_state.get("environment_awareness_policy") or {}
    events = company_state.get("recent_events") or []
    decisions = company_state.get("team_decisions") or []
    rules = company_state.get("operating_rules") or []
    universe_events = company_state.get("universe_events") or []
    universe_ideas = company_state.get("universe_ideas") or []
    universe_tasks = company_state.get("universe_tasks") or []
    asset_lines = [
        f"{asset.get('name')}({asset.get('location', '未知位置')}{'，归属'+asset.get('owner') if asset.get('owner') else ''})"
        for asset in assets[-12:] if isinstance(asset, dict)
    ]
    world_lines = []
    for scene, objects in list(world_objects.items())[-3:]:
        if isinstance(objects, dict):
            for obj in list(objects.values())[:12]:
                if not isinstance(obj, dict):
                    continue
                pos = f"{obj.get('x')},{obj.get('y')}" if obj.get("x") is not None and obj.get("y") is not None else obj.get("position", "动态")
                affordances = ",".join(obj.get("affordances") or [])
                suffix = f"，可{affordances}" if affordances else ""
                world_lines.append(f"{obj.get('name', obj.get('id'))}@{scene}({pos}{suffix})")
    event_lines = [str(item.get("text") if isinstance(item, dict) else item) for item in events[-8:]]
    decision_lines = [str(item.get("text") if isinstance(item, dict) else item) for item in decisions[-6:]]
    universe_lines = [str(item.get("text") if isinstance(item, dict) else item) for item in universe_events[-6:]]
    idea_lines = [str(item.get("title") if isinstance(item, dict) else item) for item in universe_ideas[-6:]]
    task_lines = [str(item.get("title") if isinstance(item, dict) else item) for item in universe_tasks[-6:] if not isinstance(item, dict) or item.get("status") not in ("done", "archived")]
    return (
        "公司长期记忆：\n"
        f"- 事实：{'；'.join(facts[-10:]) or '暂无'}\n"
        f"- 物品/空间：{'；'.join(asset_lines) or '暂无'}\n"
        f"- 环境感知：{'；'.join(world_lines[-18:]) or '暂无'}\n"
        f"- 感知规则：{awareness.get('summary', '需要行动前先查询当前场景物体、坐标、可交互能力。')}\n"
        f"- 近期事件：{'；'.join(event_lines) or '暂无'}\n"
        f"- 团队决策/承诺：{'；'.join(decision_lines) or '暂无'}\n"
        f"- 像素宇宙事件：{'；'.join(universe_lines) or '暂无'}\n"
        f"- 可扩展灵感：{'；'.join(idea_lines) or '暂无'}\n"
        f"- 宇宙待落地：{'；'.join(task_lines) or '暂无'}\n"
        f"- 运行规则：{'；'.join(rules[-6:]) or '暂无'}"
    )


def remember_team_decision(company_state, text):
    cleaned = re.sub(r"\s+", " ", str(text or "")).strip()
    if not cleaned:
        return company_state
    decision_topic = cleaned.split("接手推进：", 1)[-1].strip() if "接手推进：" in cleaned else cleaned
    if not is_project_execution_request(decision_topic) and not has_project_context(decision_topic):
        return company_state
    if is_followup_confirmation_message(decision_topic):
        return company_state
    if any(marker in decision_topic for marker in ("搞笑", "哈哈", "笑死", "离谱")) and not has_project_context(decision_topic):
        return company_state
    today = datetime.now().strftime("%Y-%m-%d")
    item = {"time": today, "text": cleaned[:260]}
    decisions = company_state.setdefault("team_decisions", [])
    if item not in decisions:
        decisions.append(item)
        save_company_state(company_state)
    return company_state


def stale_project_review_messages(tasks, company_state):
    now = int(time.time())
    review_after = 36 * 3600
    reviewed = {
        item.get("task_id"): item
        for item in (company_state.get("stale_project_reviews") or [])
        if isinstance(item, dict) and item.get("task_id")
    }
    candidates = []
    for task in tasks or []:
        title = str(task.get("title") or "")
        status = task.get("status")
        if status in ("done", "archived") or title.startswith(("[老板群聊:", "[内部群聊:", "[老板私聊]")):
            continue
        if title.startswith("[项目执行]") and not is_meaningful_project_task(task):
            continue
        if not (title.startswith("[项目执行]") or any(word in title for word in ("Companyverse", "Reboot", "Milestone", "Demo", "游戏", "编辑模式", "ARPG"))):
            continue
        created = int(task.get("created_at") or now)
        touched = int(task.get("completed_at") or task.get("started_at") or created)
        age = now - min(created, touched)
        if age < review_after:
            continue
        last_review = int((reviewed.get(task.get("id")) or {}).get("reviewed_at") or 0)
        if last_review and now - last_review < 24 * 3600:
            continue
        candidates.append((age, task))
    candidates.sort(reverse=True, key=lambda item: item[0])
    notices = []
    changed = False
    reviews = company_state.setdefault("stale_project_reviews", [])
    for age, task in candidates[:3]:
        days = max(1, age // 86400)
        clean_title = strip_project_title(task.get("title"))
        text = f"小韩提醒：旧项目《{clean_title}》已经搁置约 {days} 天，当前状态是 {task.get('status')}。老板还做吗？不做我就建议弃置/归档。"
        notices.append({
            "task_id": task.get("id"),
            "agent": "planner",
            "text": text,
            "created": now,
        })
        reviews.append({
            "task_id": task.get("id"),
            "reviewed_at": now,
            "title": clean_title[:120],
            "status": task.get("status"),
        })
        changed = True
    if changed:
        save_company_state(company_state)
    return notices


def visible_team_decisions(items, limit=12):
    visible = []
    for item in items or []:
        if not isinstance(item, dict):
            continue
        text = str(item.get("text") or "").strip()
        topic = text.split("接手推进：", 1)[-1].strip() if "接手推进：" in text else text
        if not is_project_execution_request(topic) and not has_project_context(topic):
            continue
        if is_followup_confirmation_message(topic):
            continue
        if any(marker in topic for marker in ("搞笑", "哈哈", "笑死", "离谱")) and not has_project_context(topic):
            continue
        visible.append(item)
    return visible[-limit:]


def visible_stale_project_reviews(items, tasks, limit=12):
    task_index = {task.get("id"): task for task in tasks or [] if isinstance(task, dict) and task.get("id")}
    visible = []
    for item in items or []:
        if not isinstance(item, dict):
            continue
        task = task_index.get(item.get("task_id"))
        if task and str(task.get("title", "")).startswith("[项目执行]") and not is_meaningful_project_task(task):
            continue
        visible.append(item)
    return visible[-limit:]


def strategy_documents_payload():
    return [
        {
            "id": "universe-prd",
            "title": "像素宇宙 PRD",
            "summary": "把 Hermes 定义成持续产出小游戏与世界内容的母宇宙，先锁定 Mushroom Runner v0.1。", 
            "focus": "主线目标 / 首批小游戏 / 基础关卡 / 宇宙入口",
            "path": "docs/hermes-pixel-universe-prd-v1.md",
        },
        {
            "id": "active-patrol",
            "title": "主动巡检机制",
            "summary": "要求 4 个员工每 30 到 60 分钟至少有一次可见交付，并主动查资料、主动沉淀、主动汇报。",
            "focus": "巡检节奏 / 资料研究 / 聊天转任务 / 自我生长",
            "path": "docs/active-patrol-and-research-prd.md",
        },
        {
            "id": "world-kanban-2",
            "title": "世界看板 2.0",
            "summary": "把任务、研究、沉淀、阻塞和私聊处理入口集中到老板面板里，直接看到世界新增了什么。",
            "focus": "老板视图 / 研究记录 / 宇宙沉淀 / 阻塞处理",
            "path": "docs/world-kanban-2.0-structure.md",
        },
        {
            "id": "operating-rules",
            "title": "运行规则",
            "summary": "明确小游戏可以独立开发，但正式入口必须锚定在宇宙中，并且可返回母世界。",
            "focus": "交付规则 / 入口约束 / 独立开发边界 / 群聊到执行",
            "path": "docs/company-operating-rules.md",
        },
    ]


def remember_boss_message(message, company_state):
    text = str(message or "").strip()
    if not text:
        return company_state
    lowered = text.lower()
    changed = False
    memories = company_state.setdefault("recent_events", [])
    today = datetime.now().strftime("%Y-%m-%d")
    important_words = (
        "咖啡机", "制冰机", "打奶泡", "奶泡", "柯基", "鱼缸", "奶茶", "编辑模式",
        "保存", "拖拽", "真实", "落实", "执行", "开发", "增加", "修改", "修复",
        "像素公司", "游戏公司", "Relicbound", "ARPG", "Roguelike",
    )
    if any(word.lower() in lowered or word in text for word in important_words):
        event = {"time": today, "text": f"老板说：{text[:180]}"}
        if event not in memories:
            memories.append(event)
            changed = True
    asset_specs = [
        ("coffee_machine", "咖啡机", "办公室水吧", "company"),
        ("ice_machine", "制冰机", "办公室水吧", "company"),
        ("milk_foamer", "打奶泡设备", "办公室水吧", "company"),
        ("aquarium", "大型鱼缸", "办公室展示区", "company"),
        ("corgi", "柯基犬", "办公室/小文身边", "writer"),
        ("milk_tea", "奶茶", "员工饮品记忆", "company"),
    ]
    assets = company_state.setdefault("assets", [])
    seen = {asset.get("id") for asset in assets if isinstance(asset, dict)}
    for asset_id, name, location, owner in asset_specs:
        if name in text and asset_id not in seen:
            assets.append({"id": asset_id, "name": name, "owner": owner, "location": location})
            seen.add(asset_id)
            changed = True
    if changed:
        save_company_state(company_state)
    return company_state


def normalise_key(text):
    return re.sub(r"\s+", "", str(text or "").strip().lower())[:120]


def append_unique_item(items, item, key_fields=("text",)):
    if not isinstance(items, list):
        return False
    key = "|".join(normalise_key(item.get(field)) for field in key_fields)
    for existing in items:
        if not isinstance(existing, dict):
            continue
        existing_key = "|".join(normalise_key(existing.get(field)) for field in key_fields)
        if existing_key == key:
            return False
    items.append(item)
    return True


def universe_category(text):
    if any(word in text for word in ("像素宇宙", "宇宙", "沉淀", "越做越大", "越来越完整", "越来越完美", "世界越来越")):
        return "universe_growth"
    if any(word in text for word in ("柯基", "鱼缸", "锦鲤", "奶茶", "咖啡", "制冰", "奶泡", "外卖", "手机", "水吧")):
        return "company_life"
    if any(word in text for word in ("小游戏", "平台跳跃", "马里奥", "水管工", "ARPG", "Roguelike", "关卡", "玩法", "战斗", "手感")):
        return "gameplay"
    if any(word in text for word in ("街区", "公司外", "走廊", "洗手间", "员工家", "别墅", "入口", "地图", "场景", "区域")):
        return "world_area"
    if any(word in text for word in ("编辑模式", "拖拽", "保存", "UI", "聊天", "插件", "移动端", "手机端")):
        return "system_feature"
    if any(word in text for word in ("剧情", "对白", "角色", "世界观", "文案", "性格")):
        return "narrative"
    return "memory"


def universe_task_title(text, category):
    clean = re.sub(r"\s+", " ", str(text or "")).strip()
    if not clean:
        return None
    if "柯基" in clean and "鱼" in clean:
        return "把柯基追鱼梗做成办公室与小游戏互动"
    if category == "universe_growth":
        return "建立聊天内容自动沉淀到像素宇宙的生长机制"
    if "奶茶" in clean or "外卖" in clean:
        return "把奶茶外卖做成公司日常事件和小游戏素材"
    if "鱼缸" in clean or "锦鲤" in clean:
        return "扩展鱼缸锦鲤为可互动宇宙资产"
    if "编辑模式" in clean:
        return "巩固办公室编辑模式并接入宇宙资产编辑"
    if "小游戏" in clean or "马里奥" in clean or "平台跳跃" in clean:
        return "从聊天梗扩展 Companyverse 小游戏入口"
    if category == "world_area":
        return "把聊天提到的空间扩展进 Companyverse 地图"
    if category == "narrative":
        return "把聊天梗沉淀为角色对白和剧情事件"
    if is_project_execution_request(clean):
        return f"落实老板聊天指令：{clean[:38]}"
    return None


def deposit_chat_to_universe(message, company_state, source="boss", speaker=None, task_id=None, create_task=False, board_slug=None):
    text = re.sub(r"\s+", " ", str(message or "")).strip()
    if not text or len(text) < 3 or is_error_reply(text) or is_robotic_line(text):
        return False
    pipeline = company_state.setdefault("universe_pipeline", DEFAULT_COMPANY_STATE["universe_pipeline"])
    if pipeline.get("enabled") is False:
        return False
    today = datetime.now().strftime("%Y-%m-%d")
    category = universe_category(text)
    important = (
        source == "boss"
        or is_project_execution_request(text)
        or category != "memory"
        or any(word in text for word in ("我来", "我负责", "我先", "做进", "宇宙", "世界", "沉淀", "越来越大", "越来越完整"))
    )
    if not important:
        return False
    changed = False
    event_text = f"{speaker or ('老板' if source == 'boss' else '员工')}：{text[:180]}"
    event = {
        "time": today,
        "source": source,
        "speaker": speaker or ("老板" if source == "boss" else "员工"),
        "category": category,
        "task_id": task_id,
        "text": event_text,
    }
    changed = append_unique_item(company_state.setdefault("universe_events", []), event, ("source", "speaker", "text")) or changed
    recent_entry = {
        "time": today,
        "text": event_text,
    }
    changed = append_unique_item(company_state.setdefault("recent_events", []), recent_entry, ("text",)) or changed
    idea_title = None
    if category in ("universe_growth", "company_life", "gameplay", "world_area", "narrative"):
        idea_title = universe_task_title(text, category) or f"把「{text[:24]}」沉淀进像素宇宙"
        idea = {
            "time": today,
            "title": idea_title[:80],
            "category": category,
            "source": source,
            "origin": text[:220],
            "status": "idea",
        }
        changed = append_unique_item(company_state.setdefault("universe_ideas", []), idea, ("title", "origin")) or changed
    task_title = universe_task_title(text, category)
    should_task = bool(task_title and (source == "boss" or is_project_execution_request(text) or "宇宙" in text or "做进" in text))
    if should_task:
        task_item = {
            "time": today,
            "title": task_title[:90],
            "category": category,
            "source": source,
            "origin": text[:240],
            "status": "candidate",
            "owner": "planner",
            "implementer": "default",
        }
        added = append_unique_item(company_state.setdefault("universe_tasks", []), task_item, ("title", "origin"))
        changed = added or changed
        if added and create_task and board_slug:
            create_universe_execution_task(board_slug, task_item, company_state)
    if changed:
        # Update universe stats
        stats = company_state.setdefault("universe_stats", {
            "last_updated": "", "total_deposits": 0,
            "by_category": {"company_life": 0, "gameplay": 0, "world_area": 0,
                            "narrative": 0, "system_feature": 0, "universe_growth": 0, "memory": 0},
            "by_source": {"boss": 0, "agent": 0, "internal": 0},
            "latest_deposit_time": None, "sediment_scheduler_running": False,
        })
        stats["total_deposits"] = stats.get("total_deposits", 0) + 1
        stats["last_updated"] = datetime.now().isoformat(timespec="seconds")
        stats["latest_deposit_time"] = stats["last_updated"]
        cat = stats.get("by_category", {})
        cat[category] = cat.get(category, 0) + 1
        src = stats.get("by_source", {})
        src[source] = src.get(source, 0) + 1
        stats["by_category"] = cat
        stats["by_source"] = src
        save_company_state(company_state)
    return changed


def universe_task_exists(tasks, title):
    short = normalise_key(title)[:48]
    for task in tasks or []:
        raw_title = str(task.get("title") or "")
        if raw_title.startswith(("[宇宙沉淀]", "[Universe Deposit]")) and short and short in normalise_key(raw_title):
            return True
    return False


def create_universe_execution_task(board_slug, task_item, company_state):
    source_text = f"{task_item.get('title') or ''}\n{task_item.get('origin') or ''}"
    task_hash = hashlib.sha1(source_text.encode("utf-8", errors="ignore")).hexdigest()[:12]
    title = f"[Universe Deposit] {task_item.get('category', 'memory')} {task_hash}"
    try:
        existing = json_command("kanban", "--board", board_slug, "list", "--json") or []
    except Exception:
        existing = []
    if any(task_hash in str(task.get("title") or "") for task in existing):
        return None
    body = f"""Hermes Pixel Works universe deposit task.

This task intentionally uses ASCII because the current Hermes CLI path corrupts
Chinese task titles/bodies on this Windows machine.

Read the UTF-8 source of truth:
- {COMPANY_STATE_PATH}
- {ROOT / 'docs' / 'chat-to-universe-pipeline.md'}
- {ROOT / 'docs' / 'pixel-company-game-universe.md'}

Deposit key: {task_hash}
Category: {task_item.get('category')}
Source: {task_item.get('source')}

Goal:
- Do not treat chat as disposable bubbles.
- Convert the matching item in company_state.json/universe_tasks into a concrete
  Companyverse world event, asset, dialogue, mini-game hook, or scene/task data.
- Planner defines scope and acceptance.
- Producer implements files or data wiring.
- Researcher checks consistency/risk.
- Writer turns the chat seed into in-world text or character behavior.

Acceptance:
- State exactly which file or data field was updated.
- Keep the original Chinese content in UTF-8 files, not in this task body.
- Report back to the group/private chat after delivery.
"""
    try:
        task = json_command(
            "kanban", "--board", board_slug, "create", title, "--body", body,
            "--assignee", "planner", "--priority", "850", "--created-by", "聊天沉淀器",
            "--idempotency-key", f"universe-{task_hash}",
            "--max-runtime", "45m", "--json",
        )
        queue_dispatch(board_slug, "2", "3")
        return task
    except Exception as exc:
        log_runtime_error("create_universe_execution_task", exc)
        return None


def sediment_completed_chat_tasks(board_slug, tasks, company_state):
    cursors = company_state.setdefault("sediment_cursors", {})
    seen = set(cursors.get("chat_task_ids") or [])
    changed = False
    for task in sorted(tasks or [], key=lambda item: item.get("created_at") or 0)[-120:]:
        task_id = task.get("id")
        title = str(task.get("title") or "")
        if not task_id or task_id in seen or not title.startswith(("[老板消息]", "[老板私聊]", "[老板群聊:", "[内部群聊:")):
            continue
        if task.get("status") not in ("done", "blocked", "archived"):
            continue
        body = str(task.get("body") or "")
        group_match = GROUP_RE.match(title)
        source = "internal" if group_match and group_match.group(1) == "内部" else "boss"
        prompt = extract_group_topic(body) if group_match else body.split("老板说：", 1)[-1].split("\n\n", 1)[0].strip()
        if source == "boss":
            changed = deposit_chat_to_universe(prompt, company_state, "boss", "老板", task_id, create_task=True, board_slug=board_slug) or changed
        profile = task.get("assignee", "default")
        speaker = PROFILES.get(profile, PROFILES["default"])["short"]
        for line in extract_chat_lines(get_task_reply(board_slug, task)):
            changed = deposit_chat_to_universe(line, company_state, "agent", speaker, task_id, create_task=True, board_slug=board_slug) or changed
        seen.add(task_id)
    if changed or len(seen) != len(cursors.get("chat_task_ids") or []):
        cursors["chat_task_ids"] = list(seen)[-600:]
        save_company_state(company_state)
    return changed


def is_project_execution_request(message):
    text = re.sub(r"\s+", " ", str(message or "")).strip()
    if not text:
        return False
    lowered = text.lower()
    casual_markers = ("哈哈", "笑死", "离谱", "为什么", "咋回事", "什么意思", "何意味", "在干嘛", "睡觉")
    hard_delivery_markers = (
        "项目地址", "发给我", "交付", "验收", "上线", "部署", "打包", "一键部署", "压缩包",
        "开箱即玩", "能玩", "能访问", "落地", "动工", "开工", "先做一个版本", "先出一个版本",
        "做个版本看看", "做一版看看", "版本出来看看",
    )
    if any(word in text for word in hard_delivery_markers):
        return True
    if any(word in text for word in ("先做", "先出", "先搞")) and any(word in text for word in ("版本", "一版", "demo", "Demo", "出来", "看看", "试试")):
        return True
    action_words = (
        "增加", "添加", "实现", "开发", "修改", "修复", "改改", "保存", "做一个", "做成",
        "升级", "接入", "重构", "安排", "启动", "开工", "动工", "推进", "落地", "发给我",
        "项目地址", "做个", "做一版", "出一版",
    )
    project_words = (
        "项目", "像素公司", "游戏公司", "Hermes", "Relicbound", "ARPG", "页面", "插件", "UI",
        "场景", "编辑模式", "拖拽", "文件", "小游戏", "游戏", "demo", "Demo", "马里奥",
        "超级马里奥", "Mario", "平台跳跃", "横版", "关卡", "项目地址",
    )
    if any(word in text for word in action_words) and any(word in text for word in project_words):
        return True
    directive_patterns = (
        r"(按|照|参考|类似|像).{0,24}(做|开发|实现|复刻|出|搞)(一版|个|出来)?",
        r"(给我|帮我|你们|小组|团队).{0,24}(做|开发|实现|改|修|加|安排|推进)",
        r"(这个|这个项目|这游戏|这个功能).{0,24}(做|改|加|接|推进|落地|开始)",
        r"(谁负责|谁来做|谁牵头|安排一下|排期|拆任务)",
        r"(先做|先出|先搞|今晚|今天|明天).{0,24}(版本|demo|Demo|项目|功能|页面|玩法|关卡)",
        r"(先做|先出|先搞).{0,18}(出来|看看|试试)",
    )
    if any(re.search(pattern, text, flags=re.I) for pattern in directive_patterns):
        if not any(marker in text for marker in casual_markers) or any(word in text for word in project_words):
            return True
    return False


def has_project_context(text):
    raw = re.sub(r"\s+", " ", str(text or "")).strip()
    if not raw:
        return False
    project_words = (
        "项目", "像素公司", "游戏公司", "Hermes", "Relicbound", "ARPG", "页面", "插件", "UI",
        "场景", "编辑模式", "拖拽", "文件", "小游戏", "游戏", "demo", "Demo", "马里奥",
        "超级马里奥", "Mario", "平台跳跃", "横版", "关卡", "项目地址", "链接", "代码",
        "报错", "bug", "性能", "卡顿", "渲染", "聊天", "群聊", "消息", "输入", "滚动",
        "坐标", "部署", "上线", "缓存", "VPS", "手机端", "移动端",
    )
    return any(word in raw for word in project_words)


def is_followup_confirmation_message(text):
    raw = re.sub(r"\s+", " ", str(text or "")).strip()
    if not raw:
        return False
    patterns = (
        r"确定.+了吗",
        r"刷新一下看看",
        r"我刷新一下看看",
        r"没有新bug了",
        r"卡不卡",
        r"每次回复大概要多少秒",
        r"加进来了吗",
    )
    return any(re.search(pattern, raw, flags=re.I) for pattern in patterns)


def commitment_patterns():
    return (
        r"(我来|我去|我负责|我先|我立马|我马上|我立刻|马上去|立刻去|明天我|今晚我).{0,40}(做|改|加|写|画|补|建|发|交付|处理|修|查|看|排)",
        r"(给你|发你|发给老板|项目地址).{0,40}(项目|地址|链接|demo|Demo|版本)?",
        r"(可以做|能做|先做|先出|先搞).{0,40}(demo|Demo|版本|关卡|项目|功能)",
    )


def latest_commitment_line(transcript):
    short_to_profile = {info["short"]: profile for profile, info in PROFILES.items()}
    for raw_line in reversed(str(transcript or "").splitlines()):
        if "：" not in raw_line:
            continue
        speaker, line = raw_line.split("：", 1)
        profile = short_to_profile.get(speaker.strip())
        text = line.strip()
        if profile and any(re.search(pattern, text, flags=re.I) for pattern in commitment_patterns()):
            return profile, text
    return None, ""


def project_task_exists(tasks, message, group_id=None):
    short = re.sub(r"\s+", " ", str(message or "")).strip()[:36]
    for task in tasks or []:
        title = str(task.get("title", ""))
        body = str(task.get("body", ""))
        if not title.startswith("[项目执行]"):
            continue
        if group_id and group_id in body:
            return True
        if short and (short in title or short in body):
            return True
    return False


def is_meaningful_project_task(task):
    title = strip_project_title(task.get("title", ""))
    body = str(task.get("body") or "")
    result = str(task.get("result") or task.get("latest_summary") or "")
    text = f"{title}\n{body}\n{result}"
    if is_followup_confirmation_message(title):
        return False
    if any(marker in title for marker in ("搞笑", "哈哈", "笑死", "离谱")) and not has_project_context(text):
        return False
    if is_project_execution_request(title):
        return True
    if has_project_context(text):
        return True
    return False


def commitment_execution_topic(owner_message, transcript):
    owner_text = re.sub(r"\s+", " ", str(owner_message or "")).strip()
    owner_is_project = is_project_execution_request(owner_message)
    profile, commitment_line = latest_commitment_line(transcript)
    if not owner_is_project and not commitment_line:
        return None
    if not owner_is_project:
        if is_followup_confirmation_message(owner_text):
            return None
        context_text = f"{owner_text}\n{commitment_line}".strip()
        if not has_project_context(owner_text):
            return None
        if len(owner_text) < 8 and not has_project_context(commitment_line):
            return None
        if not has_project_context(context_text):
            return None
        if any(marker in owner_text for marker in ("哈哈", "笑死", "离谱", "搞笑", "牛", "行吧")) and not has_project_context(commitment_line):
            return None
    if owner_is_project or commitment_line:
        return f"{owner_message}\n\n群聊中已出现执行承诺或交付请求，不能继续停留在讨论：\n{transcript[-1200:]}"
    return None


def commitment_execution_assignee(transcript):
    profile, _ = latest_commitment_line(transcript)
    if profile:
        return profile
    return "default"


def create_project_execution_task(board_slug, owner_message, company_state, group_id=None, parent_ids=(), assignee="default"):
    short = re.sub(r"\s+", " ", str(owner_message)).strip()[:48] or "老板项目改动"
    title = f"[项目执行] {short}"
    memory = company_memory_brief(company_state)
    group_line = f"群聊ID：{group_id}\n\n" if group_id else ""
    profile_info = PROFILES.get(assignee, PROFILES["default"])
    body = f"""老板在公司聊天中安排了真实项目任务，不是闲聊。

{group_line}
承诺/执行员工：{profile_info['name']}（{assignee}）

老板原话：
{owner_message}

{memory}

直达执行规则：
- 这是老板明确安排的真实项目改动，收到后立刻行动。不要等待群聊讨论完成，也不要把聊天回复当成前置依赖。
- 先改真实文件，做完再汇报；做得好不好后续再验收，但不能停留在“收到/我去看看/讨论一下”。
- 你是{profile_info['name']}。如果你在群里承诺“我来/我立马去做”，就必须真的推进，不要只聊天。
- 工作目录：{ROOT}
- 优先检查并修改相关文件，例如 index.html、server.py、amazon-stealth-extension/*、company_state.json。
- 如果任务超出你的职责，也要先产出你能完成的真实交付，并创建/推动阿默等对应子任务，不要空等。
- 需要和小韩/小研/小文协作时，创建明确子任务；但不要因为协作而停止推进。
- 游戏任务必须按照四人分工产出：小韩负责玩法闭环、关卡节奏和验收标准；小研负责参考拆解、手感风险和可验证假设；小文负责剧情动机、角色对白、UI 文案和聊天梗转内容；阿默负责真实文件、入口接入、移动端可玩和最终链接。
- 不要每天另起一个无关 Demo。优先扩展 Hermes 像素公司母世界：办公室是主大厅，公司外部是街区和小游戏入口；新玩法应复用员工、咖啡机、制冰机、奶泡机、鱼缸、柯基、奶茶、聊天记录等已有资产。
- 完成后必须写清楚：改了哪些文件、实现了哪些可验收行为、如何刷新或访问。
- 如果遇到必须由老板决定的取舍，才标记阻塞，并列出具体选项。
- 不得忘记公司已有事实：咖啡机、制冰机、打奶泡、大型鱼缸、小文的柯基、奶茶记忆都属于公司长期记忆。
"""
    args = [
        "kanban", "--board", board_slug, "create", title, "--body", body,
        "--assignee", assignee, "--priority", "2000", "--created-by", "老板直达项目指令",
        "--idempotency-key", f"exec-{group_id or format(int(time.time()*1000), 'x')}",
        "--max-runtime", "90m",
    ]
    for parent in parent_ids:
        args.extend(("--parent", parent))
    args.append("--json")
    task = json_command(*args)
    if task and task.get("id"):
        create_project_collaboration_tasks(board_slug, task["id"], owner_message, assignee)
    queue_dispatch(board_slug, "8", "5")
    return task


def create_project_collaboration_tasks(board_slug, parent_task_id, owner_message, lead_assignee):
    short = re.sub(r"\s+", " ", str(owner_message)).strip()[:28] or "老板项目改动"
    role_specs = [
        ("planner", "玩法闭环、优先级、验收标准"),
        ("researcher", "风险检查、参考拆解、验证假设"),
        ("writer", "文案体验、角色对白、玩家感受"),
        ("default", "真实文件、接入、部署与可访问结果"),
    ]
    for profile, scope in role_specs:
        if profile == lead_assignee:
            continue
        title = f"[协作子任务] {PROFILES[profile]['short']}：{short}"
        body = (
            "这是由老板群聊中的真实项目指令自动拆出的协作子任务。\n\n"
            f"主任务：{owner_message}\n"
            f"你的职责：{scope}\n\n"
            "要求：\n"
            "- 先产出你能落地的真实内容，不要只回复收到。\n"
            "- 如果你修改了文件、规则、文案或验证结论，要在结果里写清楚。\n"
            "- 完成后主执行人会回群汇报；你这里要留下可供汇总的结果。"
        )
        try:
            json_command(
                "kanban", "--board", board_slug, "create", title, "--body", body,
                "--assignee", profile, "--priority", "1200", "--created-by", "老板直达协作拆解",
                "--idempotency-key", f"exec-collab-{parent_task_id}-{profile}",
                "--parent", parent_task_id, "--max-runtime", "60m", "--json",
            )
        except Exception as exc:
            log_runtime_error("create_project_collaboration_tasks", exc)


def social_brief(company_state, profile):
    person = (company_state.get("employees") or {}).get(profile, {})
    hobbies = "、".join(person.get("hobbies") or []) or "暂无"
    likes = "、".join(person.get("likes") or []) or "暂无"
    dislikes = "、".join(person.get("dislikes") or []) or "暂无"
    quirks = "、".join(person.get("quirks") or []) or "暂无"
    social = person.get("social") or {}
    links = []
    for label, names in social.items():
        if isinstance(names, list) and names:
            links.append(f"{label}:{'、'.join(PROFILES.get(name, {'short': name})['short'] for name in names)}")
    relation = "；".join(links) or "暂无"
    return f"生活侧写：爱好={hobbies}；喜欢={likes}；讨厌={dislikes}；小毛病={quirks}；关系={relation}"


def group_origin(kind):
    return "boss" if kind == "老板" else "internal"


def title_group_kind(origin):
    return "老板" if origin == "boss" else "内部"


def extract_group_topic(body):
    text = str(body or "")
    for marker in ("群聊话题：", "老板发起的话题：", "老板在全员群聊中说："):
        if marker in text:
            return text.split(marker, 1)[-1].split("\n", 1)[0].strip()
    return text.strip().splitlines()[0] if text.strip() else ""


def safe_filename(name):
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", str(name or "attachment")).strip("._")
    return stem[:80] or "attachment"


def normalise_attachments(raw_items):
    saved = []
    if not isinstance(raw_items, list):
        return saved
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    for item in raw_items[:8]:
        if not isinstance(item, dict):
            continue
        data_url = str(item.get("data") or "")
        if not data_url.startswith("data:") or "," not in data_url:
            continue
        header, encoded = data_url.split(",", 1)
        match = re.match(r"data:([^;,]+)(;base64)?", header)
        mime = (match.group(1) if match else item.get("type") or "application/octet-stream").lower()
        if not match or ";base64" not in header:
            continue
        try:
            data = base64.b64decode(encoded, validate=True)
        except Exception:
            continue
        if not data or len(data) > 8 * 1024 * 1024:
            continue
        ext = mimetypes.guess_extension(mime) or Path(safe_filename(item.get("name"))).suffix or ".bin"
        filename = f"{int(time.time())}-{uuid.uuid4().hex[:10]}{ext}"
        path = UPLOAD_DIR / filename
        path.write_bytes(data)
        kind = str(item.get("kind") or ("image" if mime.startswith("image/") else "file"))
        saved.append({
            "id": uuid.uuid4().hex[:12],
            "name": safe_filename(item.get("name") or filename),
            "type": mime,
            "size": len(data),
            "kind": kind if kind in ("image", "sticker", "file") else ("image" if mime.startswith("image/") else "file"),
            "url": f"/uploads/chat/{filename}",
        })
    return saved


def attachment_brief(attachments):
    if not attachments:
        return ""
    labels = []
    for item in attachments:
        kind = item.get("kind")
        label = "表情包" if kind == "sticker" else ("图片" if str(item.get("type", "")).startswith("image/") else "文件")
        labels.append(f"{label}《{item.get('name', '附件')}》")
    return "\n老板同时发送了附件：" + "、".join(labels) + "。如果附件和任务有关，回复时要明确引用它。"


def attachment_prompt(attachments):
    if not attachments:
        return ""
    stickers = [str(item.get("name") or "表情包").strip() for item in attachments if item.get("kind") == "sticker"]
    if stickers:
        return "".join(f"[{name}]" for name in stickers[:4])
    images = [str(item.get("name") or "图片").strip() for item in attachments if str(item.get("type", "")).startswith("image/")]
    if images:
        return "".join(f"[图片:{name}]" for name in images[:3])
    files = [str(item.get("name") or "文件").strip() for item in attachments]
    return "".join(f"[文件:{name}]" for name in files[:3]) or "[附件]"


def attachments_line(attachments):
    return f"\n附件JSON：{json.dumps(attachments, ensure_ascii=False)}" if attachments else ""


def extract_attachments(body):
    match = re.search(r"附件JSON：(\[.*?\])(?:\n|$)", str(body or ""), flags=re.S)
    if not match:
        return []
    try:
        data = json.loads(match.group(1))
    except Exception:
        return []
    return data if isinstance(data, list) else []


def is_diagnostic_chat_task(task):
    title = task.get("title", "") or ""
    body = task.get("body", "") or ""
    created = task.get("created_at") or 0
    if title.startswith(("[老板私聊]", "[老板消息]")) and str(task.get("result") or "").strip():
        return False
    return created >= 1782666000 and ("????:??????" in title or "????????????????" in body)


def web_auth_enabled():
    return bool(WEB_AUTH_USER and WEB_AUTH_PASSWORD)


def plugin_api_key():
    if API_KEY:
        return API_KEY
    if not web_auth_enabled():
        return ""
    return hmac.new(WEB_AUTH_SECRET.encode("utf-8"), b"hermes-plugin-api", hashlib.sha256).hexdigest()


def sign_auth_value(payload):
    return hmac.new(WEB_AUTH_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def make_auth_cookie():
    exp = int(time.time()) + WEB_AUTH_MAX_AGE
    payload = f"{WEB_AUTH_USER}:{exp}"
    return f"{payload}:{sign_auth_value(payload)}"


def verify_auth_cookie(cookie_header):
    if not web_auth_enabled():
        return True
    cookies = {}
    for part in str(cookie_header or "").split(";"):
        if "=" not in part:
            continue
        key, value = part.strip().split("=", 1)
        cookies[key] = value
    raw = cookies.get("hermes_session", "")
    parts = raw.split(":")
    if len(parts) != 3:
        return False
    user, exp_text, sig = parts
    if user != WEB_AUTH_USER or not exp_text.isdigit() or int(exp_text) < int(time.time()):
        return False
    payload = f"{user}:{exp_text}"
    return hmac.compare_digest(sig, sign_auth_value(payload))


def safe_next_path(raw):
    target = str(raw or "").strip()
    if not target.startswith("/") or target.startswith("//"):
        return "/"
    return target


def with_cache_buster(path_value):
    target = safe_next_path(path_value)
    stamp = str(int(time.time()))
    joiner = "&" if "?" in target else "?"
    return f"{target}{joiner}v={stamp}"


def login_page(error="", next_path="/"):
    error_html = f'<div class="error">{error}</div>' if error else ""
    next_path = safe_next_path(next_path)
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover">
  <title>Hermes Pixel Works 登录</title>
  <style>
    *{{box-sizing:border-box}}html,body{{margin:0;min-height:100%;color:#edf5f0;font-family:"Microsoft YaHei",Arial,sans-serif}}
    body{{display:grid;place-items:center;padding:24px;overflow:hidden;background:
      radial-gradient(circle at top,#30505b 0,#142229 38%,#0b1114 100%)}}
    body::before{{content:"";position:fixed;inset:0;pointer-events:none;opacity:.18;background-image:
      linear-gradient(rgba(255,255,255,.08) 1px,transparent 1px),
      linear-gradient(90deg,rgba(255,255,255,.08) 1px,transparent 1px);background-size:18px 18px}}
    .skyline{{position:fixed;left:0;right:0;bottom:0;height:34vh;pointer-events:none;opacity:.9;background:
      linear-gradient(180deg,transparent 0,transparent 46%,#0d1518 46%,#0d1518 100%)}}
    .skyline::before{{content:"";position:absolute;left:0;right:0;bottom:0;height:72%;background:
      linear-gradient(90deg,#091013 0 4%,transparent 4% 8%,#091013 8% 15%,transparent 15% 19%,#091013 19% 26%,transparent 26% 31%,#091013 31% 39%,transparent 39% 44%,#091013 44% 53%,transparent 53% 58%,#091013 58% 66%,transparent 66% 71%,#091013 71% 81%,transparent 81% 87%,#091013 87% 100%)}}
    .skyline::after{{content:"";position:absolute;left:6%;right:6%;bottom:11%;height:26%;background:
      repeating-linear-gradient(90deg,transparent 0 28px,rgba(240,200,90,.42) 28px 34px,transparent 34px 62px)}}
    .card{{position:relative;z-index:1;width:min(460px,100%);border:4px solid #314046;background:#f7f1df;color:#1a2528;box-shadow:0 0 0 4px #0b1114,10px 10px 0 #05090b}}
    .head{{padding:18px 20px 16px;border-bottom:4px solid #314046;background:linear-gradient(180deg,#1c2d34 0,#17242a 100%);color:#f7f1df}}
    .badge{{display:inline-block;margin-bottom:10px;padding:5px 8px;border:2px solid #f0c85a;background:#26363d;color:#f0c85a;font-size:11px;font-weight:900;letter-spacing:.08em}}
    h1{{margin:0;font-size:24px;letter-spacing:.02em}}.brand{{color:#f0c85a}}p{{margin:8px 0 0;color:#9eb5b0;font-size:13px;line-height:1.6}}
    form{{display:grid;gap:14px;padding:20px}}
    .pixel-strip{{display:grid;grid-template-columns:repeat(10,1fr);gap:4px}}
    .pixel-strip i{{display:block;height:10px;background:#d6c06f;border:2px solid #314046}}
    .pixel-strip i:nth-child(2n){{background:#8fcfc2}}
    .pixel-strip i:nth-child(3n){{background:#e07a5f}}
    label{{display:grid;gap:6px;font-weight:900;color:#334148}}
    input{{height:48px;border:3px solid #5d6b70;background:#fffdf5;color:#172126;padding:0 12px;font-size:17px;outline:none;box-shadow:inset 0 -3px 0 #d9d1bb}}
    input:focus{{border-color:#d8aa39;box-shadow:0 0 0 3px #f0c85a55,inset 0 -3px 0 #d9d1bb}}
    button{{height:50px;border:3px solid #314046;background:#f0c85a;color:#172126;font-weight:900;font-size:17px;box-shadow:4px 4px 0 #a48b3a}}
    button:hover{{transform:translate(-1px,-1px);box-shadow:5px 5px 0 #a48b3a}}
    .error{{padding:10px 12px;border:2px solid #b64f45;background:#ffe6de;color:#8f2e25;font-size:13px;font-weight:900}}
    .hint{{font-size:12px;color:#6a777a;line-height:1.6}}
    .footer{{display:flex;justify-content:space-between;align-items:center;gap:10px;color:#6a777a;font-size:12px}}
    .footer b{{color:#334148}}
    @media (max-width:520px){{body{{padding:16px}}h1{{font-size:21px}}input,button{{font-size:16px}}}}
  </style>
</head>
<body>
  <div class="skyline"></div>
  <section class="card">
    <div class="head"><div class="badge">PIXEL ACCESS TERMINAL</div><h1><span class="brand">HERMES</span> PIXEL WORKS</h1><p>像进入公司前台一样登录，不再弹浏览器认证窗。登录后会在本设备保持 30 天。</p></div>
    <form method="post" action="/login">
      <div class="pixel-strip"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      {error_html}
      <input type="hidden" name="next" value="{next_path}">
      <label>用户名<input name="username" autocomplete="username" value="{WEB_AUTH_USER or 'admin'}"></label>
      <label>密码<input name="password" type="password" autocomplete="current-password" autofocus></label>
      <button type="submit">进入像素公司</button>
      <div class="footer"><span class="hint">这是 Hermes 自己的网页登录。</span><b>COOKIE SESSION</b></div>
    </form>
  </section>
</body>
</html>"""


def internal_topic_for(profile, world):
    phase = "lunch" if world.get("phase") == "lunch" else "work"
    options = AUTO_CHAT_TOPICS.get(phase, {}).get(profile) or AUTO_CHAT_TOPICS["work"]["default"]
    tick = int(time.time() // (180 if phase == "lunch" else 120))
    return options[tick % len(options)]


def is_robotic_line(line):
    text = re.sub(r"\s+", "", str(line or ""))
    ascii_letters = sum(1 for ch in text if ch.isascii() and ch.isalpha())
    cjk_chars = len(re.findall(r"[\u4e00-\u9fff]", text))
    if any(text.startswith(prefix) for prefix in ROBOTIC_CHAT_PREFIXES):
        return True
    if ascii_letters >= 18 and ascii_letters > cjk_chars * 2:
        return True
    return any(re.search(pattern, text, flags=re.I) for pattern in ROBOTIC_CHAT_PATTERNS)


def is_error_reply(text):
    raw = str(text or "")
    return any(re.search(pattern, raw, flags=re.I) for pattern in ERROR_REPLY_PATTERNS)


def is_non_chat_reply(text):
    raw = str(text or "").strip()
    if not raw:
        return False
    if is_error_reply(raw):
        return True
    return any(re.search(pattern, raw, flags=re.I | re.M) for pattern in NON_CHAT_REPLY_PATTERNS)


def embedded_chat_lines(text):
    return [
        re.sub(r"\s+", " ", line).strip()[:180]
        for line in re.findall(r"\[CHAT\]\s*(.*?)(?=\s*\[CHAT\]|$)", str(text or ""), flags=re.S)
        if line.strip() and not is_robotic_line(line)
    ][:4]


def sanitize_chat_reply(reply, mode="private"):
    raw = ANSI_RE.sub("", str(reply or "")).strip()
    if not raw:
        return None
    if mode == "group":
        lines = embedded_chat_lines(raw)
        if lines:
            return "\n".join(f"[CHAT] {line}" for line in lines)
        if is_non_chat_reply(raw):
            return None
    if mode == "private":
        if is_error_reply(raw):
            return None
        raw = re.sub(r"^\s*⚠️?\s*Reached maximum iterations\s*\([^)]+\)\.\s*Requesting summary\.\.\.\s*", "", raw, flags=re.I).strip()
        raw = re.sub(r"(?im)^\s*⚠️?\s*Reached maximum iterations[^\n]*$", "", raw).strip()
        if any(marker in raw for marker in ("review diff", "diff --git", "Complete patch", "老板可以打开链接", "Chrome DevTools")):
            conversational = re.search(r"(老板[，：,: ]|老板好|哦抱歉|收到|我看到了|我这条刚才|你好)", raw)
            if conversational and conversational.start() > 0:
                raw = raw[conversational.start():].strip()
        chat_lines = embedded_chat_lines(raw)
        if chat_lines:
            return "\n".join(chat_lines)
        cleaned_lines = []
        for line in raw.splitlines():
            clean = re.sub(r"\s+", " ", line).strip()
            if not clean:
                if cleaned_lines and cleaned_lines[-1]:
                    cleaned_lines.append("")
                continue
            if clean.startswith("session_id:"):
                continue
            if re.search(r"^(┊\s*review diff|review diff|diff --git\b|@@\s|---\s|\+\+\+\s|```|a/[A-Za-z]:\\|b/[A-Za-z]:\\)", clean, flags=re.I):
                continue
            if re.search(r"^[+].{0,4}(const|let|var|function|//)", clean):
                continue
            if "Iteration budget exhausted" in clean or "DevTools" in clean:
                continue
            if is_non_chat_reply(clean):
                continue
            cleaned_lines.append(clean)
        raw = "\n".join(cleaned_lines).strip()
        if not raw or is_non_chat_reply(raw):
            return None
    return raw


def log_runtime_error(context, exc):
    try:
        ERROR_LOG_PATH.write_text(
            (ERROR_LOG_PATH.read_text(encoding="utf-8", errors="replace") if ERROR_LOG_PATH.exists() else "")
            + f"\n[{datetime.now().isoformat(timespec='seconds')}] {context}: {repr(exc)}\n",
            encoding="utf-8",
        )
    except Exception:
        pass


def recover_log_reply(board_slug, task_id):
    log_path = hermes_board_dir(board_slug) / "logs" / f"{task_id}.log"
    if not log_path.exists():
        return None
    clean = ANSI_RE.sub("", log_path.read_text(encoding="utf-8", errors="replace"))
    marker = clean.rfind("╭─ ⚕ Hermes")
    if marker < 0 or "Resume this session with:" not in clean[marker:]:
        return None
    block = clean[marker:].split("Resume this session with:", 1)[0]
    lines = []
    for line in block.splitlines()[1:]:
        line = line.strip()
        if not line or line.startswith(("╰", "╭", "─", "Session:")):
            continue
        lines.append(line)
    reply = "\n".join(lines).strip()
    return reply if len(reply) >= 4 else None


def _cached_recover_log_reply(board_slug, task_id):
    now = time.time()
    with _STATE_CACHE_LOCK:
        entry = _LOG_CACHE.get((board_slug, task_id))
        if entry and (now - entry[1]) < _LOG_CACHE_TTL:
            return entry[0]
    result = recover_log_reply(board_slug, task_id)
    with _STATE_CACHE_LOCK:
        _LOG_CACHE[(board_slug, task_id)] = (result, now)
    return result


def run_hermes(*args, timeout=25):
    result = subprocess.run(
        [str(HERMES), *args], capture_output=True, text=True,
        encoding="utf-8", errors="replace", timeout=timeout,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    return result.stdout.strip()


def json_command(*args):
    output = run_hermes(*args)
    return json.loads(output) if output else None


def board_usable(slug):
    slug = str(slug or "").strip()
    if not slug:
        return False
    try:
        json_command("kanban", "--board", slug, "list", "--json")
        return True
    except Exception:
        return False


def current_board_slug():
    preferred = str(FAST_BOARD_SLUG or "").strip()
    if preferred and board_usable(preferred):
        return preferred
    boards = json_command("kanban", "boards", "list", "--json") or []
    active = next((b for b in boards if b.get("is_current")), None)
    if not active:
        active = next((b for b in reversed(boards) if not b.get("archived") and b.get("total", 0)), boards[0] if boards else None)
    return active["slug"] if active else "default"


def is_background_task(task):
    title = str((task or {}).get("title", "") or "")
    return title.startswith(BACKGROUND_TASK_PREFIXES)


def visible_chat_tasks(tasks):
    filtered = [
        task for task in tasks or []
        if str(task.get("title", "")).startswith(CHAT_TASK_PREFIXES)
        and task.get("status") in VISIBLE_CHAT_TASK_STATUSES
        and not is_diagnostic_chat_task(task)
    ]
    deduped = []
    seen_internal = set()
    seen_private_newer = set()
    for task in reversed(filtered):
        title = str(task.get("title", "") or "")
        is_actionable = task.get("status") in ACTIONABLE_TASK_STATUSES
        has_result = bool(str(task.get("result") or "").strip())
        if not title.startswith(("[老板群聊:", "[内部群聊:")):
            assignee = task.get("assignee")
            if assignee in seen_private_newer and is_actionable and not has_result:
                continue
            if assignee:
                seen_private_newer.add(assignee)
        if title.startswith("[内部群聊:"):
            prompt = extract_group_topic(task.get("body", ""))
            key = (task.get("assignee"), prompt)
            if prompt and key in seen_internal:
                continue
            if prompt:
                seen_internal.add(key)
        deduped.append(task)
    deduped.reverse()
    return deduped


def actionable_agent_tasks(tasks, assignee):
    return [
        task for task in tasks or []
        if task.get("assignee") == assignee
        and task.get("status") in ACTIONABLE_TASK_STATUSES
        and not is_background_task(task)
    ]


def select_agent_focus_task(tasks, assignee):
    own = actionable_agent_tasks(tasks, assignee)
    running = next((task for task in reversed(own) if task.get("status") == "running"), None)
    ready = next((task for task in reversed(own) if task.get("status") in ("ready", "todo", "review")), None)
    blocked = next((task for task in reversed(own) if task.get("status") == "blocked"), None)
    task = running or ready or blocked
    return task, running, ready, blocked


def queue_dispatch(board_slug, max_agents="4", failure_limit="5"):
    def worker():
        while True:
            try:
                run_hermes(
                    "kanban", "--board", board_slug, "dispatch",
                    "--max", max_agents, "--failure-limit", failure_limit, "--json",
                    timeout=120,
                )
            except Exception:
                pass
            with DISPATCH_LOCK:
                if board_slug in DISPATCH_RERUN:
                    DISPATCH_RERUN.discard(board_slug)
                    continue
                DISPATCH_ACTIVE.discard(board_slug)
                break

    with DISPATCH_LOCK:
        if board_slug in DISPATCH_ACTIVE:
            DISPATCH_RERUN.add(board_slug)
            return False
        DISPATCH_ACTIVE.add(board_slug)
    threading.Thread(target=worker, daemon=True).start()
    return True


def clean_cli_reply(text):
    lines = []
    for line in str(text or "").splitlines():
        if line.strip().startswith("session_id:"):
            continue
        lines.append(line)
    reply = "\n".join(lines).strip()
    return "" if is_error_reply(reply) or is_non_chat_reply(reply) else reply


def direct_chat_prompt(task):
    title = task.get("title", "")
    body = task.get("body", "")
    if title.startswith(("[老板群聊:", "[内部群聊:")):
        return body
    return body or title


def queue_direct_chat(board_slug, tasks):
    pending = [task for task in tasks if task and task.get("id")]
    if not pending:
        return

    def worker(task):
        task_id = task["id"]
        profile = task.get("assignee") or "default"
        try:
            with DIRECT_CHAT_SEMAPHORE:
                reply = clean_cli_reply(run_hermes(
                    "-p", profile, "--accept-hooks", "chat", "-Q",
                    "--source", "tool", "--max-turns", "4",
                    "-q", direct_chat_prompt(task),
                    timeout=110,
                ))
                if not reply:
                    reply = "[CHAT] 我看到了，这条刚才没顺利回上来。你再戳我一句，我立刻接上。"
                run_hermes("kanban", "--board", board_slug, "complete", task_id, "--result", reply, "--summary", reply, timeout=30)
        except Exception as exc:
            log_runtime_error(f"direct_chat {task_id} {profile}", exc)
            fallback = "[CHAT] 我这条刚才没顺利发出来。你再戳我一下，我马上接上。"
            try:
                run_hermes("kanban", "--board", board_slug, "complete", task_id, "--result", fallback, "--summary", fallback, timeout=30)
            except Exception:
                pass
        finally:
            with DIRECT_CHAT_LOCK:
                DIRECT_CHAT_ACTIVE.discard(task_id)

    for task in pending:
        task_id = task["id"]
        with DIRECT_CHAT_LOCK:
            if task_id in DIRECT_CHAT_ACTIVE:
                continue
            DIRECT_CHAT_ACTIVE.add(task_id)
        threading.Thread(target=worker, args=(task,), daemon=True).start()


def rescue_stalled_chat_tasks(board_slug, tasks, stale_after=45, limit=6):
    now = int(time.time())
    stalled = []
    for task in tasks or []:
        title = str(task.get("title", "") or "")
        if not title.startswith(CHAT_TASK_PREFIXES):
            continue
        if task.get("status") not in ACTIONABLE_TASK_STATUSES:
            continue
        if str(task.get("result") or "").strip():
            continue
        created = int(task.get("created_at") or 0)
        if not created or now - created < stale_after:
            continue
        stalled.append(task)
    if not stalled:
        return False
    queue_direct_chat(board_slug, sorted(stalled, key=lambda task: task.get("created_at") or 0)[-limit:])
    return True


def mentioned_profiles(text):
    found = []
    aliases = {
        "default": ("@阿默", "阿默", "制作人"),
        "planner": ("@小韩", "小韩", "策划主编"),
        "researcher": ("@小研", "小研", "研究员"),
        "writer": ("@小文", "小文", "文案"),
    }
    for profile, names in aliases.items():
        if any(name in text for name in names):
            found.append(profile)
    return found


def choose_speakers(text, exclude=(), limit=2):
    direct = mentioned_profiles(text)
    lower = text.lower()
    if any(word in lower for word in ("bug", "代码", "实现", "报错", "文件", "测试")):
        order = ["default", "researcher", "planner", "writer"]
    elif any(word in text for word in ("剧情", "角色", "世界观", "文案", "画面", "美术")):
        order = ["writer", "planner", "researcher", "default"]
    elif any(word in text for word in ("玩法", "好玩", "机制", "数据", "参考", "为什么")):
        order = ["researcher", "planner", "default", "writer"]
    elif any(word in text for word in ("安排", "决定", "方向", "优先级", "计划")):
        order = ["planner", "default", "researcher", "writer"]
    else:
        order = ["writer", "researcher", "default", "planner"]
    result = []
    for profile in direct + order:
        if profile not in exclude and profile not in result:
            result.append(profile)
        if len(result) >= limit:
            break
    return result


def choose_group_speakers(text, exclude=(), limit=None):
    roster = choose_speakers(text, exclude=exclude, limit=len(PROFILES))
    if limit is None:
        return roster
    return roster[:limit]


def initial_group_speaker_limit(text):
    direct = mentioned_profiles(text)
    if len(direct) >= 2:
        return min(len(PROFILES), max(2, len(direct)))
    if any(word in text for word in ("紧急", "马上", "立即", "谁来", "@")):
        return min(len(PROFILES), max(2, GROUP_DIRECT_CHAT_LIMIT))
    return min(len(PROFILES), GROUP_DIRECT_CHAT_LIMIT)


def extract_chat_lines(reply):
    if not reply:
        return []
    if is_non_chat_reply(reply):
        return []
    marked = embedded_chat_lines(reply)
    if marked:
        return marked[:4]
    lines = []
    for raw in str(reply).splitlines():
        line = raw.strip().lstrip("-*• ")
        if (
            not line or line == "[SILENT]" or line.startswith(("完成", "总结", "Task", "I "))
            or is_robotic_line(line)
        ):
            continue
        lines.append(line[:180])
    return lines[:4]


def recent_internal_topics(tasks, now_ts, window=INTERNAL_CHAT_REPEAT_WINDOW):
    topics = set()
    cutoff = now_ts - window
    for task in tasks or []:
        title = str(task.get("title", "") or "")
        if not title.startswith("[内部群聊:"):
            continue
        created = int(task.get("created_at") or 0)
        completed = int(task.get("completed_at") or 0)
        if max(created, completed) < cutoff:
            continue
        topic = extract_group_topic(task.get("body", ""))
        if topic:
            topics.add(topic)
    return topics


def _cached_task_reply(board_slug, task):
    """Cached wrapper around get_task_reply to avoid repeated subprocess calls."""
    if not task or not task.get("id"):
        return None
    task_id = task["id"]
    now = time.time()
    with _STATE_CACHE_LOCK:
        entry = _TASK_REPLY_CACHE.get((board_slug, task_id))
        if entry and (now - entry[1]) < _TASK_REPLY_TTL:
            return entry[0]
    result = _raw_task_reply(board_slug, task)
    with _STATE_CACHE_LOCK:
        _TASK_REPLY_CACHE[(board_slug, task_id)] = (result, now)
    return result


def _raw_task_reply(board_slug, task):
    """Original get_task_reply logic, extracted for caching."""
    if task.get("status") not in ("done", "blocked", "archived"):
        return None
    reply = task.get("result")
    log_reply = _cached_recover_log_reply(board_slug, task["id"])
    if log_reply and (not reply or "[CHAT]" in log_reply):
        reply = log_reply
    title = task.get("title", "")
    is_group_chat = title.startswith(("[老板群聊:", "[内部群聊:"))
    if task.get("status") in ("done", "blocked") and (not is_group_chat or not reply):
        try:
            detail = json_command("kanban", "--board", board_slug, "show", task["id"], "--json") or {}
            reply = (detail.get("task") or {}).get("result") or reply or detail.get("latest_summary")
        except Exception:
            pass
    reply = reply or _cached_recover_log_reply(board_slug, task["id"])
    if is_error_reply(reply):
        return None
    return reply


# Public alias for backward compatibility
get_task_reply = _cached_task_reply


def fast_state():
    world = get_world_state()
    company_state = load_company_state()
    board_slug = FAST_BOARD_SLUG
    board_db = hermes_board_dir(board_slug) / "kanban.db"
    active = {"slug": board_slug, "name": "Relicbound ARPG"}
    tasks = []
    if board_db.exists():
        con = sqlite3.connect(str(board_db))
        con.row_factory = sqlite3.Row
        try:
            tasks = [dict(row) for row in con.execute("select * from tasks order by created_at asc")]
        finally:
            con.close()
    if not tasks:
        tasks = json_command("kanban", "--board", board_slug, "list", "--json") or []
    agents = []
    for key, info in PROFILES.items():
        task, running, ready, blocked = select_agent_focus_task(tasks, key)
        status = "working" if running else "blocked" if blocked else "waiting" if ready else "idle"
        title = task["title"] if task else "暂无待办，保持待命"
        owner_chat = title.startswith(CHAT_TASK_PREFIXES)
        presence = employee_presence_for(world, status, owner_chat=owner_chat, blocked=bool(blocked))
        social = (company_state.get("employees") or {}).get(key, {})
        relation = social.get("social") or {}
        relation_text = "；".join(
            f"{label}:{'、'.join(PROFILES.get(name, {'short': name})['short'] for name in names)}"
            for label, names in relation.items()
            if isinstance(names, list) and names
        )
        agents.append({
            "id": key, **info, "status": status,
            "presence": presence,
            "task": title,
            "status_label": (
                "睡觉恢复" if presence == "sleep" else
                "在家远程" if presence == "home_remote" else
                "申请加班" if presence == "overtime" else
                "午休" if presence == "lunch" else
                "在公司" if presence == "office" else
                "下班在家"
            ),
            "social_summary": " / ".join(
                line for line in [
                    f"爱好：{'、'.join(social.get('hobbies') or [])}",
                    f"喜欢：{'、'.join(social.get('likes') or [])}",
                    f"吐槽点：{'、'.join(social.get('dislikes') or [])}",
                ] if not line.endswith("：")
            ),
            "social_detail": social_brief(company_state, key),
            "relationship_summary": relation_text,
        })
    messages, team_feed = [], []
    chat_tasks = sorted(
        visible_chat_tasks(tasks),
        key=lambda task: task.get("created_at") or 0,
    )[-180:]
    for task in chat_tasks:
        title, body = task.get("title", ""), task.get("body", "")
        group_match = GROUP_RE.match(title)
        mode = "group" if group_match else "private"
        origin = group_origin(group_match.group(1)) if group_match else "boss"
        conversation = group_match.group(2) if group_match else None
        round_no = int(group_match.group(3) or 1) if group_match else None
        prompt = extract_group_topic(body) if mode == "group" else body.split("老板说：", 1)[-1].split("\n\n", 1)[0].strip()
        reply = get_task_reply(board_slug, task)
        if not reply:
            reply = recover_log_reply(board_slug, task["id"])
            if reply and task.get("status") != "done":
                try:
                    run_hermes("kanban", "--board", board_slug, "complete", task["id"], "--result", reply, "--summary", reply)
                    task["status"] = "done"
                except Exception:
                    pass
        reply = sanitize_chat_reply(reply, mode)
        chat_lines = extract_chat_lines(reply) if mode == "group" else []
        messages.append({
            "id": task["id"], "agent": task.get("assignee", "default"), "prompt": prompt,
            "reply": reply, "status": task.get("status"),
            "created": (task.get("completed_at") if reply else None) or task.get("created_at"),
            "task_created": task.get("created_at"), "completed": task.get("completed_at"),
            "mode": mode, "conversation": conversation, "round": round_no, "origin": origin,
            "chat_lines": chat_lines,
            "name": PROFILES.get(task.get("assignee"), PROFILES["default"])["name"],
            "attachments": extract_attachments(body),
        })
        if mode == "group" and chat_lines:
            team_feed.append({"agent": task.get("assignee", "default"), "text": chat_lines[0], "created": task.get("completed_at") or task.get("created_at")})
    delivery_notices = project_delivery_messages(board_slug, tasks)
    messages.extend(delivery_notices)
    for notice in delivery_notices[-5:]:
        text = "老板，项目已交付，私聊里有验收说明。" if notice.get("notice") == "delivery" else "老板，这个任务卡住了，需要你拍板。"
        team_feed.append({"agent": notice.get("agent", "default"), "text": text, "created": notice.get("created")})
    project_tasks = visible_project_task_items(tasks)
    return {
        "board": active, "agents": agents, "messages": sorted(messages, key=lambda item: item.get("created") or 0),
        "team_feed": team_feed, "world": world, "time": int(time.time()),
        "company": {
            "studio_name": company_state.get("studio_name", "Hermes Pixel Works"),
            "open_roles": company_state.get("open_roles") or [],
            "pending_notices": company_state.get("pending_notices") or [],
            "facts": company_state.get("facts") or [],
            "assets": company_state.get("assets") or [],
            "world_objects": company_state.get("world_objects") or {},
            "environment_awareness_policy": company_state.get("environment_awareness_policy") or {},
            "recent_events": (company_state.get("recent_events") or [])[-12:],
            "execution_policy": company_state.get("execution_policy") or {},
            "operating_rules": company_state.get("operating_rules") or [],
            "memory_policy": company_state.get("memory_policy") or {},
            "universe_pipeline": company_state.get("universe_pipeline") or {},
            "universe_events": (company_state.get("universe_events") or [])[-12:],
            "universe_ideas": (company_state.get("universe_ideas") or [])[-12:],
            "universe_tasks": (company_state.get("universe_tasks") or [])[-12:],
            "team_decisions": visible_team_decisions(company_state.get("team_decisions") or []),
            "stale_project_reviews": visible_stale_project_reviews(company_state.get("stale_project_reviews") or [], tasks),
            "project_tasks": project_tasks,
            "strategy_documents": strategy_documents_payload(),
        },
    }


def strip_project_title(title):
    clean = re.sub(r"^\[项目执行\]\s*", "", str(title or "")).strip()
    clean = clean.split("群聊中已出现执行承诺或交付请求", 1)[0].strip()
    return clean or "项目执行任务"


def compact_task_text(value, limit=180):
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text[:limit]


def visible_project_task_summary(task):
    body = str(task.get("body") or "")
    lines = []
    for raw in body.splitlines():
        line = re.sub(r"\s+", " ", raw).strip()
        if not line:
            continue
        if line.startswith(("群聊话题：", "话题来源：", "群聊记录：", "群聊规则：")):
            continue
        if line.startswith(("你的身份是", "- ", "这是即时聊天", "普通闲聊不要制造任务")):
            continue
        if "Hermes Pixel Works 的实时内部群聊" in line:
            continue
        line = re.sub(r"^老板说：", "", line).strip()
        line = re.sub(r"^\[[^\]]+\]\s*", "", line).strip()
        if len(line) < 4:
            continue
        lines.append(line)
        if len(" ".join(lines)) >= 180:
            break
    summary = compact_task_text(" ".join(lines), 180)
    if summary:
        return summary
    return compact_task_text(strip_project_title(task.get("title", "")), 120)


def project_notice_key(task):
    title = strip_project_title(task.get("title", ""))
    normalized = re.sub(r"\s+", "", title.lower())
    normalized = re.sub(r"[“”\"'`‘’\[\]（）()，,。.!！？?：:;；\-_/\\]+", "", normalized)
    return normalized[:40] or title[:24] or "project"


def summarize_project_collaboration(board_slug, task, tasks):
    task_id = task.get("id")
    if not task_id:
        return []
    try:
        detail = json_command("kanban", "--board", board_slug, "show", task_id, "--json") or {}
    except Exception:
        return []
    lead = task.get("assignee") or "default"
    snippets = []
    seen = set()

    def add_snippet(profile, text):
        raw_text = str(text or "")
        sanitized = sanitize_chat_reply(raw_text, "private")
        if sanitized is None and (
            is_non_chat_reply(raw_text)
            or is_error_reply(raw_text)
            or any(marker in raw_text for marker in ("Iteration budget exhausted", "review diff", "Reached maximum iterations", "DevTools"))
        ):
            return
        clean = sanitized if sanitized is not None else re.sub(r"\s+", " ", raw_text).strip()
        clean = re.sub(r"\s+", " ", clean).strip()
        if not clean:
            return
        clean = re.sub(r"^\[[^\]]+\]\s*", "", clean).strip()
        clean = clean[:160]
        key = (profile, clean)
        if key in seen:
            return
        seen.add(key)
        snippets.append(f"{PROFILES.get(profile, PROFILES['default'])['short']}：{clean}")

    latest_summary = str(detail.get("latest_summary") or "").strip()
    if latest_summary:
        add_snippet(lead, latest_summary)

    task_index = {item.get("id"): item for item in tasks or [] if isinstance(item, dict)}
    for child in (detail.get("children") or [])[:6]:
        child_info = child
        if isinstance(child, str):
            child_info = task_index.get(child, {"id": child})
        if not isinstance(child_info, dict):
            continue
        profile = child_info.get("assignee") or "default"
        summary = child_info.get("result") or child_info.get("latest_summary") or child_info.get("title") or ""
        add_snippet(profile, summary)

    for comment in (detail.get("comments") or [])[-8:]:
        author = comment.get("author") or lead
        if author not in PROFILES:
            author = lead
        add_snippet(author, comment.get("body"))
    return snippets[:4]


def project_delivery_messages(board_slug, tasks):
    notices = []
    project_tasks = [
        task for task in tasks
        if str(task.get("title", "")).startswith("[项目执行]")
        and task.get("status") in ("done", "blocked")
        and is_meaningful_project_task(task)
    ][-20:]
    latest_by_key = {}
    for task in project_tasks:
        key = project_notice_key(task)
        existing = latest_by_key.get(key)
        task_ts = task.get("completed_at") or task.get("created_at") or 0
        existing_ts = (existing or {}).get("completed_at") or (existing or {}).get("created_at") or 0
        if not existing or task_ts >= existing_ts:
            latest_by_key[key] = task
    project_tasks = sorted(
        latest_by_key.values(),
        key=lambda task: task.get("completed_at") or task.get("created_at") or 0,
    )
    blocked_tasks = [task for task in project_tasks if task.get("status") == "blocked"][-4:]
    done_tasks = [task for task in project_tasks if task.get("status") == "done"][-4:]
    project_tasks = sorted(
        blocked_tasks + done_tasks,
        key=lambda task: task.get("completed_at") or task.get("created_at") or 0,
    )
    for task in project_tasks:
        status = task.get("status")
        assignee = task.get("assignee") or "default"
        title = strip_project_title(task.get("title", ""))
        body = str(task.get("body") or "")
        result = sanitize_chat_reply(task.get("result") or task.get("latest_summary"), "private")
        if not result:
            result = "遇到阻塞，需要老板决策。" if status == "blocked" else "任务已完成，等待老板验收。"
        collaboration = summarize_project_collaboration(board_slug, task, tasks)
        collaboration_text = ""
        if collaboration:
            collaboration_text = "\n\n团队协作摘录：\n- " + "\n- ".join(collaboration)
        if status == "blocked":
            prompt = f"需要你拍板：{title}"
            reply = (
                f"老板，{title} 遇到阻塞了。\n\n"
                f"{str(result).strip()}"
                f"{collaboration_text}\n\n"
                "你可以直接在私聊里回复取舍，我会继续推进。"
            )
        else:
            prompt = f"项目交付：{title}"
            reply = (
                f"老板，{title} 已完成，可以验收了。\n\n"
                f"{str(result).strip()}"
                f"{collaboration_text}\n\n"
                "刷新像素公司页面后查看效果；如果不满意，直接回我下一轮修改点。"
            )
        notices.append({
            "id": f"notice-{task.get('id')}",
            "agent": assignee,
            "prompt": prompt,
            "reply": reply,
            "status": "done",
            "created": task.get("completed_at") or task.get("created_at") or int(time.time()),
            "mode": "private",
            "conversation": None,
            "round": None,
            "origin": "system",
            "chat_lines": [],
            "name": PROFILES.get(assignee, PROFILES["default"])["name"],
            "notice": "delivery" if status == "done" else "blocked",
            "task_id": task.get("id"),
        })
    return notices


def visible_project_task_items(tasks, limit=24):
    active_statuses = {"todo", "ready", "running", "blocked"}
    status_rank = {"blocked": 0, "running": 1, "ready": 2, "todo": 3}
    items = []
    for task in tasks:
        title = str(task.get("title", "") or "")
        if not (
            title.startswith("[项目执行]")
            or title.startswith("[协作子任务]")
        ):
            continue
        if task.get("status") not in active_statuses:
            continue
        if title.startswith("[项目执行]") and not is_meaningful_project_task(task):
            continue
        assignee = task.get("assignee") or "default"
        kind = "execution" if title.startswith("[项目执行]") else "collab"
        display_title = strip_project_title(title)
        if title.startswith("[协作子任务]"):
            display_title = re.sub(r"^\[[^\]]+\]\s*", "", title).strip() or display_title
        items.append({
            "id": task.get("id"),
            "title": display_title,
            "status": task.get("status"),
            "assignee": assignee,
            "priority": task.get("priority"),
            "created": task.get("created_at"),
            "completed": task.get("completed_at"),
            "kind": kind,
            "owner_name": PROFILES.get(assignee, PROFILES["default"])["name"],
            "owner_short": PROFILES.get(assignee, PROFILES["default"])["short"],
            "summary": visible_project_task_summary(task),
            "blocked_reason": compact_task_text(sanitize_chat_reply(task.get("result"), "private") if task.get("status") == "blocked" else "", 220),
        })
    items.sort(
        key=lambda item: (
            status_rank.get(item.get("status"), 9),
            -int(item.get("priority") or 0),
            -(item.get("created") or 0),
        )
    )
    return items[:limit]


def group_task_body(group_id, round_no, profile, owner_message, transcript, company_state, final_round=False, origin="boss", initiator=None):
    info = PROFILES[profile]
    initiator_info = PROFILES.get(initiator or profile, info)
    history = transcript or ("老板刚刚发起话题，群里还没人说话。" if origin == "boss" else f"{initiator_info['short']}刚在群里起了个话头，大家还没接话。")
    social = social_brief(company_state, profile)
    memory = company_memory_brief(company_state)
    if origin == "internal" and round_no == 1 and profile == initiator:
        ending = "这轮你是先开口的人。别解释背景，直接像在公司群里顺手抛一句能引人接话的人话。"
    elif final_round:
        ending = "这是自然收尾轮。优先补一句态度、追问、吐槽或接梗来把群聊接住；只有真的完全没新内容时才输出 [SILENT]。不要解释为什么沉默。"
    else:
        ending = "先回应群里已有的一个具体观点，再提出补充、异议、追问或新联想；不必同意，也不必强行收束。尽量像真实同事群一样把话题接热，而不是礼貌性回一句就结束。"
    source = "老板发起" if origin == "boss" else f"{initiator_info['short']}随口起头"
    return f"""你正在 Hermes Pixel Works 的实时内部群聊，不是在写报告或完成问答题。

群聊话题：{owner_message}
话题来源：{source}

群聊记录：
{history}

你的身份是{info['name']}。{info['chat']}。
{social}
{memory}
{ending}

群聊规则：
- 只说你自己会说的话，不替其他人发言。
- 可使用 @阿默、@小韩、@小研、@小文，允许接梗、反驳、追问、阴阳怪气和轻微吐槽老板。
- 这是即时聊天，不是工作汇报。可以半句、插话、反问、接上文、吐槽，像同事，不像客服。
- 把群聊当成真实公司协作：遇到问题先互相讨论、互相补位，不要默认只对老板说话。
- 小研默认负责查资料、拆参考、核实风险；其他人遇到拿不准的点，可以直接 @小研 求证。
- 只有遇到预算、方向取舍、范围变更这类必须拍板的事，才 @老板 明确提问。
- 每条消息 4-90 个汉字；一次输出 1-4 条，每条单独一行并以 [CHAT] 开头。
- 禁止标题、列表、工作汇报格式、英文思考过程和“已完成/下一步”套话。
- 禁止出现这些字样：任务完成、群聊回复完成、以自然口语化方式、保持沉默是合理的、作为某某补充说明。
- 不知道就问，不确定就明确说不确定；不得虚构文件、测试、进度或联网结果。
- 如果老板是在安排真实项目改动，必须把它当成公司任务：小韩拆解，阿默落地文件，小研检查风险，小文检查体验。不要只口嗨。
- 普通闲聊不要制造任务；真实项目指令必须推动执行任务。
- 最终完成摘要也必须只包含这些 [CHAT] 行，不能附加解释。
"""


def create_group_round(board_slug, group_id, round_no, profiles, owner_message, transcript, company_state, parents=(), final_round=False, origin="boss", initiator=None, priority="100"):
    created = []
    for profile in profiles:
        info = PROFILES[profile]
        title = f"[{title_group_kind(origin)}群聊:{group_id}:r{round_no}] {info['name']}"
        body = group_task_body(group_id, round_no, profile, owner_message, transcript, company_state, final_round, origin, initiator)
        args = ["kanban", "--board", board_slug, "create", title, "--body", body,
                "--assignee", profile, "--priority", str(priority), "--created-by", f"{title_group_kind(origin)}群聊",
                "--idempotency-key", f"group-{group_id}-r{round_no}-{profile}", "--max-runtime", "20m"]
        for parent in parents:
            args.extend(("--parent", parent))
        args.append("--json")
        created.append(json_command(*args))
    if origin == "boss":
        queue_direct_chat(board_slug, created)
    return created


def maybe_spawn_internal_chat(board_slug, tasks, company_state, world):
    if world.get("phase") not in ("work", "lunch", "home"):
        return False
    active_backlog = sum(
        1 for task in tasks
        if task.get("status") in ("todo", "ready", "running")
        and not str(task.get("title", "")).startswith(CHAT_TASK_PREFIXES + BACKGROUND_TASK_PREFIXES + ("[项目执行]",))
    )
    if active_backlog > 80:
        return False
    with AUTO_CHAT_LOCK:
        current_ts = int(time.time())
        cooldown = 480 if world.get("phase") == "home" else 210 if world.get("phase") == "lunch" else 150
        groups = {}
        latest_internal = 0
        for task in tasks:
            match = GROUP_RE.match(task.get("title", ""))
            if not match:
                continue
            kind, gid, round_text = match.groups()
            if kind != "内部":
                continue
            latest_internal = max(latest_internal, int(task.get("created_at") or 0))
            groups.setdefault(gid, {}).setdefault(int(round_text or 1), []).append(task)
        for rounds in groups.values():
            latest_round = max(rounds)
            current = rounds.get(latest_round) or []
            if current and any(task.get("status") not in ("done", "blocked", "archived") for task in current):
                return False
        if latest_internal and current_ts - latest_internal < cooldown:
            return False
        roster = list(PROFILES)
        seed = max(1, current_ts // cooldown)
        initiator = roster[seed % len(roster)]
        recent_topics = recent_internal_topics(tasks, current_ts)
        options = AUTO_CHAT_TOPICS.get("lunch" if world.get("phase") == "lunch" else "work", {}).get(initiator) or AUTO_CHAT_TOPICS["work"]["default"]
        topic = next((item for item in options if item not in recent_topics), internal_topic_for(initiator, world))
        if topic in recent_topics:
            return False
        group_id = format(current_ts * 1000 + seed, "x")[-8:]
        return bool(create_group_round(
            board_slug, group_id, 1, [initiator], topic, "", company_state,
            origin="internal", initiator=initiator, priority="20",
        ))


def advance_group_conversations(board_slug, tasks, company_state):
    groups = {}
    recent_cutoff = int(time.time()) - 6 * 3600
    for task in tasks:
        match = GROUP_RE.match(task.get("title", ""))
        if not match:
            continue
        if int(task.get("created_at") or 0) < recent_cutoff:
            continue
        kind, gid, round_text = match.groups()
        if not round_text:
            continue
        groups.setdefault((group_origin(kind), gid), {}).setdefault(int(round_text or 1), []).append(task)
    spawned = False
    with GROUP_LOCK:
        for (origin, gid), rounds in groups.items():
            latest = max(rounds)
            current = rounds[latest]
            if latest >= 3 or not current or not all(t.get("status") in ("done", "blocked", "archived") for t in current):
                continue
            first = rounds.get(1, current)[0]
            owner_message = extract_group_topic(first.get("body", ""))
            transcript_lines = []
            used = []
            for round_tasks in rounds.values():
                for task in round_tasks:
                    profile = task.get("assignee", "default")
                    used.append(profile)
                    for line in extract_chat_lines(get_task_reply(board_slug, task)):
                        transcript_lines.append(f"{PROFILES[profile]['short']}：{line}")
            transcript = "\n".join(transcript_lines[-14:])
            parents = [task["id"] for task in current]
            execution_topic = commitment_execution_topic(owner_message, transcript)
            if execution_topic and not project_task_exists(tasks, execution_topic, gid):
                assignee = commitment_execution_assignee(transcript)
                remember_team_decision(
                    company_state,
                    f"群聊 {gid} 出现执行承诺，{PROFILES.get(assignee, PROFILES['default'])['short']} 接手推进：{owner_message[:120]}",
                )
                create_project_execution_task(
                    board_slug, execution_topic, company_state,
                    group_id=gid, assignee=assignee,
                )
                spawned = True
            if latest == 1:
                current_assignees = [t.get("assignee") for t in current]
                mentions = mentioned_profiles(transcript)
                profiles = []
                for profile in mentions + choose_group_speakers(owner_message + transcript, exclude=set(used)):
                    if profile not in profiles and profile not in current_assignees:
                        profiles.append(profile)
                if not profiles and len(set(current_assignees)) < len(PROFILES):
                    profiles = choose_group_speakers(owner_message + transcript, exclude=set(current_assignees))
                if profiles:
                    create_group_round(board_slug, gid, 2, profiles[: max(1, len(PROFILES) - len(set(current_assignees)))], owner_message, transcript, company_state, parents, origin=origin, initiator=first.get("assignee"))
            else:
                decision_topic = any(word in owner_message + transcript for word in ("决定", "安排", "方向", "优先级", "任务"))
                mentions = mentioned_profiles("\n".join(transcript_lines[-4:]))
                if mentions or decision_topic:
                    profile = mentions[-1] if mentions else ("planner" if decision_topic else choose_speakers(owner_message + transcript, exclude={current[-1].get('assignee')}, limit=1)[0])
                    create_group_round(board_slug, gid, 3, [profile], owner_message, transcript, company_state, parents, final_round=True, origin=origin, initiator=first.get("assignee"))
                    spawned = True
                continue
            spawned = True
    return spawned


def get_state():
    world = get_world_state()
    company_state = load_company_state()
    board_slug = current_board_slug()
    boards = json_command("kanban", "boards", "list", "--json") or []
    active = next((b for b in boards if b.get("slug") == board_slug), None)
    if not active:
        active = {
            "slug": board_slug,
            "name": "Relicbound ARPG" if board_slug == FAST_BOARD_SLUG else board_slug,
            "description": "",
            "archived": False,
            "is_current": True,
        }
    tasks = json_command("kanban", "--board", board_slug, "list", "--json") or []
    changed = maybe_spawn_internal_chat(board_slug, tasks, company_state, world)
    changed = advance_group_conversations(board_slug, tasks, company_state) or changed
    changed = sediment_completed_chat_tasks(board_slug, tasks, company_state) or changed
    changed = rescue_stalled_chat_tasks(board_slug, tasks) or changed
    if changed:
        queue_dispatch(board_slug, "4", "5")
        tasks = json_command("kanban", "--board", board_slug, "list", "--json") or tasks
        company_state = load_company_state()
    team_feed = []
    stale_reviews = stale_project_review_messages(tasks, company_state)
    if stale_reviews:
        company_state = load_company_state()
    for review in stale_reviews:
        team_feed.append({"agent": review.get("agent", "planner"), "text": review.get("text"), "created": review.get("created")})
    root = next((task for task in reversed(tasks) if task.get("title", "").startswith(("Reboot:", "Milestone", "Swarm:"))), None)
    if root:
        try:
            root_detail = json_command("kanban", "--board", board_slug, "show", root["id"], "--json") or {}
            for comment in (root_detail.get("comments") or [])[-30:]:
                author = comment.get("author", "default")
                if author not in PROFILES:
                    author = "default"
                raw_body = comment.get("body", "").strip()
                if not raw_body.startswith("[team:chat") or "\\u" in raw_body:
                    continue
                body = re.sub(r"^\[[^\]]+\]\s*", "", raw_body).strip()
                body = re.sub(r"\s+", " ", body)
                if body:
                    team_feed.append({"agent": author, "text": body[:180], "created": comment.get("created_at")})
        except Exception:
            pass
    agents = []
    for key, info in PROFILES.items():
        task, running, ready, blocked = select_agent_focus_task(tasks, key)
        is_meeting = running and (running.get("title", "").startswith(("[老板群聊:", "[内部群聊:")) or running.get("title", "").startswith("Team huddle decision"))
        status = "meeting" if is_meeting else "working" if running else "blocked" if blocked else "waiting" if ready else "idle"
        title = task["title"] if task else "暂无待办，保持待命"
        owner_chat = title.startswith(CHAT_TASK_PREFIXES)
        presence = employee_presence_for(world, status, owner_chat=owner_chat, blocked=bool(blocked))
        social = (company_state.get("employees") or {}).get(key, {})
        social_lines = [
            f"爱好：{'、'.join(social.get('hobbies') or [])}",
            f"喜欢：{'、'.join(social.get('likes') or [])}",
            f"吐槽点：{'、'.join(social.get('dislikes') or [])}",
        ]
        relation = social.get("social") or {}
        relation_text = "；".join(
            f"{label}:{'、'.join(PROFILES.get(name, {'short': name})['short'] for name in names)}"
            for label, names in relation.items()
            if isinstance(names, list) and names
        )
        agents.append({
            "id": key, **info, "status": status, "presence": presence, "task": title,
            "status_label": (
                "睡觉恢复" if presence == "sleep" else
                "在家远程" if presence == "home_remote" else
                "申请加班" if presence == "overtime" else
                "午休" if presence == "lunch" else
                "在公司" if presence == "office" else
                "下班在家"
            ),
            "social_summary": " / ".join(line for line in social_lines if not line.endswith("：")),
            "social_detail": social_brief(company_state, key),
            "relationship_summary": relation_text,
        })

    messages = []
    chat_tasks = sorted(
        visible_chat_tasks(tasks),
        key=lambda task: task.get("created_at") or 0,
    )[-180:]
    for task in chat_tasks:
        title = task.get("title", "")
        body = task.get("body", "")
        group_match = GROUP_RE.match(title)
        mode = "group" if group_match else "private"
        origin = group_origin(group_match.group(1)) if group_match else "boss"
        conversation = group_match.group(2) if group_match else None
        round_no = int(group_match.group(3) or 1) if group_match else None
        if mode == "group":
            prompt = extract_group_topic(body)
        else:
            marker = "老板在全员群聊中说：" if mode == "group" else "老板说："
            prompt = body.split(marker, 1)[-1].split("\n\n", 1)[0].strip()
        reply = get_task_reply(board_slug, task)
        if not reply:
            reply = recover_log_reply(board_slug, task["id"])
            if reply and task.get("status") != "done":
                try:
                    run_hermes("kanban", "--board", board_slug, "complete", task["id"], "--result", reply, "--summary", reply)
                    task["status"] = "done"
                except Exception:
                    pass
        reply = sanitize_chat_reply(reply, mode)
        messages.append({
            "id": task["id"], "agent": task.get("assignee", "default"), "prompt": prompt,
            "reply": reply, "status": task.get("status"),
            "created": (task.get("completed_at") if reply else None) or task.get("created_at"),
            "task_created": task.get("created_at"),
            "completed": task.get("completed_at"),
            "mode": mode, "conversation": conversation, "round": round_no,
            "origin": origin,
            "chat_lines": extract_chat_lines(reply) if mode == "group" else [],
            "name": PROFILES.get(task.get("assignee"), PROFILES["default"])["name"],
            "attachments": extract_attachments(body),
        })
        if mode == "group" and reply:
            lines = extract_chat_lines(reply)
            speech = lines[0] if lines else ""
            if speech:
                team_feed.append({"agent": task.get("assignee", "default"), "text": speech, "created": task.get("completed_at") or task.get("created_at")})
    delivery_notices = project_delivery_messages(board_slug, tasks)
    messages.extend(delivery_notices)
    for notice in delivery_notices[-5:]:
        text = "老板，项目已交付，私聊里有验收说明。" if notice.get("notice") == "delivery" else "老板，这个任务卡住了，需要你拍板。"
        team_feed.append({"agent": notice.get("agent", "default"), "text": text, "created": notice.get("created")})
    messages.sort(key=lambda item: item.get("created") or 0)
    project_tasks = visible_project_task_items(tasks)
    return {
        "board": active, "agents": agents, "messages": messages, "team_feed": team_feed,
        "world": world, "time": int(time.time()),
        "company": {
            "studio_name": company_state.get("studio_name", "Hermes Pixel Works"),
            "open_roles": company_state.get("open_roles") or [],
            "pending_notices": company_state.get("pending_notices") or [],
            "facts": company_state.get("facts") or [],
            "assets": company_state.get("assets") or [],
            "world_objects": company_state.get("world_objects") or {},
            "environment_awareness_policy": company_state.get("environment_awareness_policy") or {},
            "recent_events": (company_state.get("recent_events") or [])[-12:],
            "execution_policy": company_state.get("execution_policy") or {},
            "operating_rules": company_state.get("operating_rules") or [],
            "memory_policy": company_state.get("memory_policy") or {},
            "universe_pipeline": company_state.get("universe_pipeline") or {},
            "universe_events": (company_state.get("universe_events") or [])[-12:],
            "universe_ideas": (company_state.get("universe_ideas") or [])[-12:],
            "universe_tasks": (company_state.get("universe_tasks") or [])[-12:],
            "team_decisions": visible_team_decisions(company_state.get("team_decisions") or []),
            "stale_project_reviews": visible_stale_project_reviews(company_state.get("stale_project_reviews") or [], tasks),
            "project_tasks": project_tasks,
            "strategy_documents": strategy_documents_payload(),
        },
    }


def state_signature(state):
    snapshot = json.loads(json.dumps(state, ensure_ascii=False))
    snapshot.pop("time", None)
    if isinstance(snapshot.get("world"), dict):
        snapshot["world"].pop("iso", None)
    return json.dumps(snapshot, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def refresh_state_cache():
    global STATE_CACHE, STATE_CACHE_SIGNATURE
    state = fast_state() if FAST_STATE_ONLY else get_state()
    signature = state_signature(state)
    with STATE_COND:
        STATE_CACHE = state
        if signature != STATE_CACHE_SIGNATURE:
            STATE_CACHE_SIGNATURE = signature
            STATE_COND.notify_all()
    return state


def cached_state():
    global STATE_CACHE
    with STATE_COND:
        if STATE_CACHE is not None:
            if not FAST_STATE_ONLY:
                STATE_REFRESH_WAKE.set()
            return json.loads(json.dumps(STATE_CACHE, ensure_ascii=False))
    if FAST_STATE_ONLY:
        return refresh_state_cache()
    STATE_REFRESH_WAKE.set()
    return fast_state()


def start_state_watcher():
    def worker():
        while True:
            STATE_REFRESH_WAKE.wait(3)
            STATE_REFRESH_WAKE.clear()
            try:
                refresh_state_cache()
            except Exception:
                pass
    threading.Thread(target=worker, daemon=True).start()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, *_):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def send_json(self, value, status=200):
        data = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Hermes-Api-Key, Authorization")
        self.end_headers()
        self.wfile.write(data)

    def send_html(self, html, status=200, extra_headers=None):
        data = html.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        for key, value in (extra_headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Hermes-Api-Key, Authorization")
        self.end_headers()

    def api_authorized(self):
        if not API_KEY and not web_auth_enabled():
            return True
        query_key = parse_qs(urlparse(self.path).query).get("api_key", [""])[0]
        sent = self.headers.get("X-Hermes-Api-Key", "") or query_key
        valid_keys = [key for key in (API_KEY, plugin_api_key()) if key]
        return any(hmac.compare_digest(sent, key) for key in valid_keys)

    def web_authorized(self):
        return verify_auth_cookie(self.headers.get("Cookie", ""))

    def reject_unauthorized(self):
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            self.send_json({"error": "请先登录 Hermes Pixel Works"}, 401)
            return
        self.send_response(302)
        self.send_header("Location", "/login")
        self.end_headers()

    def same_origin_request(self):
        origin = self.headers.get("Origin", "")
        if not origin:
            return False
        try:
            return urlparse(origin).netloc == self.headers.get("Host", "")
        except Exception:
            return False

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/login":
            if self.web_authorized():
                next_target = safe_next_path(parse_qs(urlparse(self.path).query).get("next", ["/"])[0])
                self.send_response(302)
                self.send_header("Location", with_cache_buster(next_target))
                self.end_headers()
            else:
                next_target = safe_next_path(parse_qs(urlparse(self.path).query).get("next", ["/"])[0])
                self.send_html(login_page(next_path=next_target))
            return
        api_key_ok = path.startswith("/api/") and self.api_authorized()
        if web_auth_enabled() and not (self.web_authorized() or api_key_ok):
            self.reject_unauthorized()
            return
        if path.startswith("/api/") and not self.web_authorized() and path not in ("/api/scene/load", "/api/world/objects") and not self.api_authorized():
            self.send_json({"error": "API KEY 无效"}, 401)
            return
        if path == "/api/scene/load":
            try:
                cs = load_company_state()
                scene = sanitize_scene_positions(cs.get("scene_positions", {}))
                self.send_json({"ok": True, "scene": scene})
            except Exception as exc:
                self.send_json({"error": str(exc)}, 500)
            return
        if path == "/api/world/objects":
            try:
                cs = load_company_state()
                self.send_json({"ok": True, "world_objects": cs.get("world_objects") or {}})
            except Exception as exc:
                self.send_json({"error": str(exc)}, 500)
            return
        if path == "/api/state":
            try:
                self.send_json(cached_state())
            except Exception as exc:
                self.send_json({"error": str(exc)}, 500)
            return
        if path == "/api/events":
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "keep-alive")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            last_signature = None
            try:
                while True:
                    with STATE_COND:
                        if STATE_CACHE is None:
                            STATE_COND.wait(timeout=1)
                        elif STATE_CACHE_SIGNATURE == last_signature:
                            STATE_COND.wait(timeout=15)
                        state = STATE_CACHE
                        signature = STATE_CACHE_SIGNATURE
                    if state is not None and signature != last_signature:
                        payload = json.dumps(state, ensure_ascii=False)
                        self.wfile.write(f"event: state\ndata: {payload}\n\n".encode("utf-8"))
                        self.wfile.flush()
                        last_signature = signature
                    else:
                        self.wfile.write(b": keep-alive\n\n")
                        self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, OSError):
                return
        if path == "/api/universe/stats":
            try:
                cs = load_company_state()
                events = cs.get("universe_events") or []
                ideas = cs.get("universe_ideas") or []
                tasks = cs.get("universe_tasks") or []
                cat_counts = {}
                for ev in events:
                    c = ev.get("category", "unknown") if isinstance(ev, dict) else "unknown"
                    cat_counts[c] = cat_counts.get(c, 0) + 1
                status_counts = {}
                for idea in ideas:
                    s = idea.get("status", "idea") if isinstance(idea, dict) else "idea"
                    status_counts[s] = status_counts.get(s, 0) + 1
                task_status = {}
                for t in tasks:
                    s = t.get("status", "candidate") if isinstance(t, dict) else "candidate"
                    task_status[s] = task_status.get(s, 0) + 1
                self.send_json({
                    "total_events": len(events),
                    "total_ideas": len(ideas),
                    "total_tasks": len(tasks),
                    "categories": cat_counts,
                    "idea_statuses": status_counts,
                    "task_statuses": task_status,
                    "pipeline_enabled": bool((cs.get("universe_pipeline") or {}).get("enabled", True)),
                })
            except Exception as exc:
                self.send_json({"error": str(exc)}, 500)
            return
        super().do_GET()

    def do_HEAD(self):
        path = urlparse(self.path).path
        if path == "/login":
            if self.web_authorized():
                self.send_response(302)
                self.send_header("Location", with_cache_buster("/"))
            else:
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            return
        api_key_ok = path.startswith("/api/") and self.api_authorized()
        if web_auth_enabled() and not (self.web_authorized() or api_key_ok):
            self.reject_unauthorized()
            return
        if path.startswith("/api/") and not self.web_authorized() and path not in ("/api/scene/load", "/api/world/objects") and not self.api_authorized():
            self.send_response(401)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            return
        super().do_HEAD()

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/plugin/login":
            try:
                size = int(self.headers.get("Content-Length", 0))
                raw = self.rfile.read(size).decode("utf-8", errors="replace")
                try:
                    payload = json.loads(raw or "{}")
                except Exception:
                    payload = {k: v[0] for k, v in parse_qs(raw).items()}
                username = str(payload.get("username", ""))
                password = str(payload.get("password", ""))
                if web_auth_enabled() and hmac.compare_digest(username, WEB_AUTH_USER) and hmac.compare_digest(password, WEB_AUTH_PASSWORD):
                    self.send_json({"ok": True, "api_key": plugin_api_key(), "max_age": WEB_AUTH_MAX_AGE})
                else:
                    self.send_json({"error": "用户名或密码不对"}, 401)
            except Exception as exc:
                self.send_json({"error": str(exc)}, 500)
            return
        if path == "/login":
            try:
                size = int(self.headers.get("Content-Length", 0))
                raw = self.rfile.read(size).decode("utf-8", errors="replace")
                form = parse_qs(raw)
                username = (form.get("username") or [""])[0]
                password = (form.get("password") or [""])[0]
                next_target = safe_next_path((form.get("next") or ["/"])[0])
                if hmac.compare_digest(username, WEB_AUTH_USER) and hmac.compare_digest(password, WEB_AUTH_PASSWORD):
                    secure = "; Secure" if self.headers.get("X-Forwarded-Proto", "") == "https" else ""
                    cookie = f"hermes_session={make_auth_cookie()}; Max-Age={WEB_AUTH_MAX_AGE}; Path=/; HttpOnly; SameSite=Lax{secure}"
                    self.send_response(302)
                    self.send_header("Set-Cookie", cookie)
                    self.send_header("Location", with_cache_buster(next_target))
                    self.end_headers()
                else:
                    self.send_html(login_page("用户名或密码不对。", next_target), 401)
            except Exception as exc:
                self.send_html(login_page(str(exc), next_target if "next_target" in locals() else "/"), 500)
            return
        api_key_ok = path.startswith("/api/") and self.api_authorized()
        if web_auth_enabled() and not (self.web_authorized() or api_key_ok):
            self.reject_unauthorized()
            return
        same_origin_write = path in ("/api/scene/save", "/api/world/report") and self.same_origin_request()
        if path.startswith("/api/") and not self.web_authorized() and not same_origin_write and not self.api_authorized():
            self.send_json({"error": "API KEY 无效"}, 401)
            return
        if path == "/api/scene/save":
            try:
                size = int(self.headers.get("Content-Length", 0))
                payload = json.loads(self.rfile.read(size) or b"{}")
                scene_positions = sanitize_scene_positions(payload.get("scene", {}))
                cs = load_company_state()
                cs["scene_positions"] = scene_positions
                save_company_state(cs)
                self.send_json({"ok": True})
            except Exception as exc:
                self.send_json({"error": str(exc)}, 500)
            return
        if path == "/api/world/report":
            try:
                size = int(self.headers.get("Content-Length", 0))
                payload = json.loads(self.rfile.read(size) or b"{}")
                world_objects = sanitize_world_objects(payload.get("world_objects", {}))
                cs = load_company_state()
                existing = cs.get("world_objects") if isinstance(cs.get("world_objects"), dict) else {}
                for scene, objects in world_objects.items():
                    existing[scene] = objects
                cs["world_objects"] = existing
                cs["world_objects_updated_at"] = int(time.time())
                save_company_state(cs)
                self.send_json({"ok": True, "scenes": list(world_objects)})
            except Exception as exc:
                self.send_json({"error": str(exc)}, 500)
            return
        if path != "/api/message":
            self.send_error(404)
            return
        try:
            size = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(size) or b"{}")
            agent = payload.get("agent")
            mode = payload.get("mode", "private")
            message = str(payload.get("message", "")).strip()
            attachments = normalise_attachments(payload.get("attachments"))
            display_message = message or attachment_prompt(attachments) or "[附件]"
            agent_message = display_message + attachment_brief(attachments) + attachments_line(attachments)
            board = str(payload.get("board") or current_board_slug()).strip()
            if mode not in ("private", "group") or (mode == "private" and agent not in PROFILES) or (not message and not attachments) or len(message) > 2000:
                self.send_json({"error": "消息或收件人无效"}, 400)
                return
            created_at = int(time.time())
            company_state = remember_boss_message(display_message, load_company_state())
            deposit_chat_to_universe(display_message, company_state, "boss", "老板", create_task=True, board_slug=board)
            if mode == "private":
                title = f"[老板私聊] {PROFILES[agent]['name']}：{display_message[:42]}"
                body = (
                    f"老板说：{display_message}\n\n{attachments_line(attachments).strip()}\n\n你的身份是{PROFILES[agent]['name']}，人格特点：{PROFILES[agent]['personality']}。"
                    f"{social_brief(company_state, agent)}。"
                    f"\n{company_memory_brief(company_state)}\n{attachment_brief(attachments)}\n"
                    "保持自己的观点和自然中文语气，像公司里一个活人，不像任务机器人。"
                    "允许有情绪、有偏好、有不耐烦，也允许轻微吐槽老板，但别失控。"
                    "结合当前项目真实文件与任务证据回答。老板安排真实项目改动时，必须推动执行任务，不要只聊天。需要团队协作时创建明确子任务。"
                    "完成时直接给老板可读的回复，不要只说收到，也不要虚构进展。"
                )
                created = [json_command(
                    "kanban", "--board", board, "create", title, "--body", body,
                    "--assignee", agent, "--priority", "1000", "--created-by", "老板", "--json",
                )]
                queue_direct_chat(board, created)
                existing_tasks = json_command("kanban", "--board", board, "list", "--json") or []
                if is_project_execution_request(message) and not project_task_exists(existing_tasks, message):
                    create_project_execution_task(board, message, company_state)
                optimistic = [{
                    "id": (created[0] or {}).get("id") or f"local-{created_at}-{agent}",
                    "agent": agent,
                    "prompt": display_message,
                    "reply": None,
                    "status": (created[0] or {}).get("status") or "todo",
                    "created": (created[0] or {}).get("created_at") or created_at,
                    "mode": "private",
                    "conversation": None,
                    "round": None,
                    "chat_lines": [],
                    "name": PROFILES[agent]["name"],
                    "attachments": attachments,
                }]
            else:
                group_id = format(int(time.time() * 1000), "x")[-8:]
                speakers = choose_group_speakers(display_message, limit=initial_group_speaker_limit(display_message))
                created = create_group_round(board, group_id, 1, speakers, agent_message, "", company_state, origin="boss", priority="1000")
                existing_tasks = json_command("kanban", "--board", board, "list", "--json") or []
                if is_project_execution_request(message) and not project_task_exists(existing_tasks, message, group_id):
                    create_project_execution_task(board, message, company_state, group_id=group_id)
                lead = ((created[0] or {}).get("assignee") if created else None) or (speakers[0] if speakers else "planner")
                optimistic = [{
                    "id": (created[0] or {}).get("id") or f"local-{created_at}-{lead}",
                    "agent": lead,
                    "prompt": display_message,
                    "reply": None,
                    "status": (created[0] or {}).get("status") or "todo",
                    "created": (created[0] or {}).get("created_at") or created_at,
                    "mode": "group",
                    "conversation": group_id,
                    "round": 1,
                    "origin": "boss",
                    "chat_lines": [],
                    "name": PROFILES.get(lead, PROFILES["default"])["name"],
                    "attachments": attachments,
                }]
            STATE_REFRESH_WAKE.set()
            self.send_json({"ok": True, "tasks": created, "messages": optimistic, "dispatch": "direct"})
        except Exception as exc:
            self.send_json({"error": str(exc)}, 500)


# ── Universe growth scheduler ────────────────────────────────────────
SEDIMENT_INTERVAL = 300  # seconds between auto-scan cycles
SEDIMENT_RUNNING = False


def _sediment_loop(board_slug):
    """Background thread: periodically scan completed chat tasks and deposit them."""
    global SEDIMENT_RUNNING
    SEDIMENT_RUNNING = True
    # Mark scheduler as running in company state
    try:
        cs = load_company_state()
        stats = cs.setdefault("universe_stats", {})
        stats["sediment_scheduler_running"] = True
        stats["last_updated"] = datetime.now().isoformat(timespec="seconds")
        save_company_state(cs)
    except Exception:
        pass
    while SEDIMENT_RUNNING:
        try:
            company_state = load_company_state()
            pipeline = company_state.get("universe_pipeline") or {}
            if pipeline.get("enabled") is False:
                time.sleep(SEDIMENT_INTERVAL)
                continue
            # Collect recently completed tasks (last 2 hours worth)
            tasks = json_command("kanban", "--board", board_slug, "list", "--json") or []
            now = int(time.time())
            recent = [t for t in tasks if (t.get("completed_at") or 0) > now - 7200]
            if recent:
                sediment_completed_chat_tasks(board_slug, recent, company_state)
        except Exception:
            # Non-fatal: don't crash the server
            pass
        time.sleep(SEDIMENT_INTERVAL)


def start_sediment_scheduler():
    """Start the background sediment scan thread if not already running."""
    if FAST_STATE_ONLY:
        return
    if SEDIMENT_RUNNING:
        return
    try:
        board = current_board_slug()
    except Exception:
        board = FAST_BOARD_SLUG
    t = threading.Thread(target=_sediment_loop, args=(board,), daemon=True)
    t.start()


# ── API: universe growth stats ───────────────────────────────────────

class _UniverseStatsHandler(SimpleHTTPRequestHandler):
    """Serve /api/universe/stats — aggregated universe growth metrics."""

    def do_GET(self):
        try:
            cs = load_company_state()
            events = cs.get("universe_events") or []
            ideas = cs.get("universe_ideas") or []
            tasks = cs.get("universe_tasks") or []
            # Count by category
            cat_counts = {}
            for ev in events:
                c = ev.get("category", "unknown") if isinstance(ev, dict) else "unknown"
                cat_counts[c] = cat_counts.get(c, 0) + 1
            # Count ideas by status
            status_counts = {}
            for idea in ideas:
                s = idea.get("status", "idea") if isinstance(idea, dict) else "idea"
                status_counts[s] = status_counts.get(s, 0) + 1
            # Count tasks by status
            task_status = {}
            for t in tasks:
                s = t.get("status", "candidate") if isinstance(t, dict) else "candidate"
                task_status[s] = task_status.get(s, 0) + 1
            self.send_json({
                "total_events": len(events),
                "total_ideas": len(ideas),
                "total_tasks": len(tasks),
                "categories": cat_counts,
                "idea_statuses": status_counts,
                "task_statuses": task_status,
                "pipeline_enabled": bool((cs.get("universe_pipeline") or {}).get("enabled", True)),
            })
        except Exception as exc:
            self.send_json({"error": str(exc)}, 500)

    def log_message(self, fmt, *args):
        pass  # suppress access logs


# ── Startup ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    start_state_watcher()
    start_sediment_scheduler()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Hermes Pixel Office listening on LAN port {PORT}")
    server.serve_forever()
