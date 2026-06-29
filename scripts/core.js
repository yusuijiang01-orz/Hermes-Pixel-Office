window.__hermesBootAlive = "core";
const canvas = document.querySelector("#office"), ctx = canvas.getContext("2d");
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    var _a;
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister().catch(() => {
      })));
      if ((_a = window.caches) == null ? void 0 : _a.keys) {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key.startsWith("hermes-iphone-client-")).map((key) => caches.delete(key).catch(() => false)));
      }
    } catch (e) {
    }
  }, { once: true });
}
const roles = { default: { color: "#4aa6a0", skin: "#e7b68b", hair: "#27353a" }, planner: { color: "#e7b34d", skin: "#efc49d", hair: "#4b302b" }, researcher: { color: "#e45a9c", skin: "#c98e69", hair: "#301f35" }, writer: { color: "#a878d1", skin: "#efbd9d", hair: "#3b5d50" } };
const spots = { default: [0.15, 0.34], planner: [0.57, 0.34], researcher: [0.15, 0.64], writer: [0.57, 0.64] }, agents = {};
let neighborhood = false;
let state = null, selected = null, last = 0, nextFeed = 3500, chatMode = "private", cameraMode = new URLSearchParams(location.search).get("camera") || "auto", homeView = new URLSearchParams(location.search).get("home") || "planner", currentRoom = new URLSearchParams(location.search).get("room") || "office";
let feedInitialized = false, lastFeedCreated = 0;
const seenFeedKeys = /* @__PURE__ */ new Set(), feedQueue = [];
const mobileState = { tab: "messages", messageFilter: "all", contactKind: "friends", chatOpen: false, chatMode: "private", agent: null, conversation: "team" };
const scrollState = { desktop: { key: "", stick: true, top: 0 }, mobile: { key: "", stick: true, top: 0 } };
const mentionState = { desktop: { query: "", start: -1, end: -1 }, mobile: { query: "", start: -1, end: -1 } };
function isMobileView() {
  return innerWidth <= 700;
}
function esc(value) {
  return String(value != null ? value : "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[ch]);
}
const officeView = { x: 0, y: 0, scale: 1, min: 0.72, max: 1.85, pan: false, lastX: 0, lastY: 0, pinch: false, pinchDist: 0, pinchScale: 1, pinchMid: { x: 0, y: 0 } };
const fallbackMentions = [
  { id: "default", short: "阿默", name: "制作人 阿默", role: "主程 / 制作人" },
  { id: "planner", short: "小韩", name: "策划主编 小韩", role: "主管 / 游戏策划" },
  { id: "researcher", short: "小研", name: "研究员 小研", role: "玩法研究" },
  { id: "writer", short: "小文", name: "文案 小文", role: "叙事与文案" }
];
let pendingMessages = [], refreshTimer = 0, fastRefreshUntil = 0, realtimeSource = null, realtimeConnected = false, realtimeRetryTimer = 0, worldBaseMs = 0, worldReceivedMs = 0;
const sendLocks = /* @__PURE__ */ new Set();
let _lastRenderVersion = 0, _prevPrivateHash = "", _prevGroupHash = "", _renderedChatMode = "";
const attachmentDrafts = { desktop: [], mobile: [] };
let stickerStore = [];
let funMode = false;
let funModeUntil = 0;
let funDialogueTimer = 0;
let funDialogueIndex = 0;
let funLastDialogue = 0;
const FUN_DIALOGUES = {
  default: [
    // 阿默的搞笑台词
    "代码能跑但不知道为什么能跑，这就是搞笑。",
    "我刚把咖啡机连上了GitHub，现在它会自动commit。",
    "制冰机刚报了个bug：冰块生成速度超出预期。",
    "我在后台修东西，修着修着就把微波炉也修了。",
    "柯基刚才踩了我的键盘，deploy了一个新版本。",
    "水吧的奶茶机我加了容错，现在它不会把珍珠煮成水泥了。",
    "我刚给鱼缸写了个监控脚本，鱼翻白眼会被记录到Jira。",
    "老板说搞笑，我就把老板办公室的门把手改成了笑脸。"
  ],
  planner: [
    // 小韩的搞笑台词
    "搞什么飞机？我查了一下，咱们公司没有飞机，只有奶茶机。",
    "我刚把站会改成了搞笑大会，效果很好，大家都笑了。",
    "水吧那台制冰机最近确实挺有节目效果的，每半小时响一次。",
    '我把搞笑模式加到了排期里，排在"修复已知bug"后面。',
    "柯基已经是我们团队第三个全职员工了，虽然还没发工资。",
    "鱼缸里的鱼今天翻了三次白眼，我建议给它加个绩效考核。",
    "微波炉加热吐司的时候，我会想起Relicbound的第一个Boss战。",
    '老板说搞笑，我就把看板上的"阻塞"全部改成了"搞笑中"。'
  ],
  researcher: [
    // 小研的搞笑台词
    "上次老板突然发搞笑，我第一反应是制冰机又卡住了。",
    "数据表明，办公室搞笑频率和咖啡消耗量呈正相关。",
    "我刚做了一个搞笑指数热力图，小文的工位最高。",
    "鱼缸翻白眼的频率可以作为公司压力的量化指标。",
    "制冰机的噪音分贝在搞笑模式下会上升15%。",
    "柯基的摇尾巴频率和搞笑模式的开关状态有显著相关性。",
    "奶茶机的使用频次在搞笑模式下下降了，因为大家都在笑。",
    "经过三轮A/B测试，搞笑模式下的bug率反而降低了。"
  ],
  writer: [
    // 小文的搞笑台词
    "昨天鱼缸里的鱼盯着我看了半小时，我怀疑它在等人物传记。",
    "程序员搞笑是代码能跑但不知道为什么能跑，对吧？",
    "老板你先抛个梗啊，别光说两个字就跑。",
    "柯基刚才在键盘上踩了两下，我把它当成了新剧情。",
    '微波炉的"嘭"声我已经改成搞笑音效了，现在听起来像放屁。',
    "我给鱼缸的鱼起了名字，每条都对应一个Relicbound的NPC。",
    '搞笑模式的UI文案我想好了："本办公室已启用欢乐协议"。',
    "制冰机和微波炉的声音撞了，玩家老以为按错了，这次我故意不改。"
  ]
};
function getFunnyDialogue() {
  const ids = ["default", "planner", "researcher", "writer"];
  const sid = ids[funDialogueIndex % 4];
  const lines = FUN_DIALOGUES[sid];
  const line = lines[funDialogueIndex % lines.length];
  funDialogueIndex++;
  return { speaker: ids[sid] === "default" ? "阿默" : ids[sid] === "planner" ? "小韩" : ids[sid] === "researcher" ? "小研" : "小文", short: ids[sid] === "default" ? "阿默" : ids[sid] === "planner" ? "小韩" : ids[sid] === "researcher" ? "小研" : "小文", text: line };
}
try {
  stickerStore = JSON.parse(localStorage.getItem("hermes-stickers") || "[]");
} catch (e) {
  stickerStore = [];
}
function saveStickers() {
  localStorage.setItem("hermes-stickers", JSON.stringify(stickerStore.slice(-80)));
}
function stickerData(name, svg) {
  return { name, type: "image/svg+xml", size: svg.length, kind: "sticker", data: "data:image/svg+xml;base64," + btoa(svg) };
}
function pixelSticker(name, face, main = "#f0c85a", accent = "#263238") {
  const moods = {
    smile: ["M18 25h4v4h-4z M38 25h4v4h-4z M24 42h12v4H24z"],
    laugh: ["M17 24h5v5h-5z M38 24h5v5h-5z M21 39h20v9H21z"],
    cry: ["M17 24h5v5h-5z M38 24h5v5h-5z M22 43h18v4H22z M13 31h5v12h-5z M44 31h5v12h-5z"],
    think: ["M18 25h4v4h-4z M38 25h4v4h-4z M31 37h8v4h-8z M26 45h13v4H26z"],
    angry: ["M16 22h9v4h-9z M37 22h9v4h-9z M20 42h22v4H20z"],
    cool: ["M14 24h16v8H14z M34 24h16v8H34z M30 27h4v3h-4z M24 43h14v4H24z"],
    shock: ["M18 24h5v5h-5z M39 24h5v5h-5z M27 39h9v12h-9z"],
    sleep: ["M18 27h5v4h-5z M37 27h5v4h-5z M25 43h13v4H25z M44 12h9v4h-5v4h5v4h-10v-4h5v-4h-4z"],
    thumb: ["M16 30h9v18h-9z M25 27h9V16h7v11h9v9h-5v12H25z"],
    coffee: ["M18 22h24v22H18z M42 27h8v10h-8z M23 26h14v4H23z M23 35h14v4H23z"]
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" shape-rendering="crispEdges"><rect width="64" height="64" fill="none"/><path fill="${accent}" d="M14 12h36v4h4v36h-4v4H14v-4h-4V16h4z"/><path fill="${main}" d="M18 16h28v4h4v28h-4v4H18v-4h-4V20h4z"/><path fill="#fff3c7" d="M22 18h18v4H22z"/><path fill="${accent}" d="${moods[face] || moods.smile}"/></svg>`;
  return stickerData(name, svg);
}
function sceneSticker(name, type, main = "#7bc6a4") {
  const base = '<rect width="64" height="64" fill="none"/>';
  const fish = `${base}<rect x="8" y="14" width="48" height="36" fill="#d7f1ee"/><path fill="#29464b" d="M8 14h48v4H8zM8 46h48v4H8zM8 14h4v36H8zM52 14h4v36h-4z"/><g><animateTransform attributeName="transform" type="translate" values="-6 0;8 0;-6 0" dur="1.8s" repeatCount="indefinite"/><path fill="${main}" d="M20 31h20v-5h8v16h-8v-5H20z"/><rect x="25" y="28" width="4" height="4" fill="#fff3c7"/><rect x="42" y="30" width="3" height="3" fill="#263238"/></g><path fill="#4e8b79" d="M16 40h4v6h-4zM45 38h4v8h-4z"/>`;
  const corgi2 = `${base}<g><animateTransform attributeName="transform" type="translate" values="0 0;0 -2;0 0" dur="1.1s" repeatCount="indefinite"/><path fill="#8b5a2b" d="M14 30h36v16H14z"/><path fill="#d99a4e" d="M18 22h28v24H18z"/><path fill="#fff3d7" d="M24 31h16v13H24z"/><path fill="#8b5a2b" d="M18 22h8v-8h6v8h4v-8h6v8h4v8H18z"/><rect x="25" y="28" width="4" height="4" fill="#263238"/><rect x="37" y="28" width="4" height="4" fill="#263238"/><rect x="31" y="35" width="5" height="4" fill="#263238"/></g>`;
  const tail = `${base}<g><animateTransform attributeName="transform" type="rotate" values="-7 32 34;7 32 34;-7 32 34" dur=".7s" repeatCount="indefinite"/><path fill="#d99a4e" d="M18 27h28v18H18z"/><path fill="#fff3d7" d="M25 33h14v12H25z"/><path fill="#8b5a2b" d="M44 30h10v5h-5v5h-5zM17 25h7v-8h5v8zM40 25h7v-8h5v8z"/><rect x="27" y="30" width="4" height="4" fill="#263238"/><rect x="36" y="30" width="4" height="4" fill="#263238"/></g><path fill="#5d6b70" d="M9 48h46v4H9z"/>`;
  const shadow = `${base}<ellipse cx="37" cy="50" rx="15" ry="5" fill="#314046"><animate attributeName="rx" values="10;18;10" dur="1.2s" repeatCount="indefinite"/></ellipse><g><animateTransform attributeName="transform" type="translate" values="-4 0;5 0;-4 0" dur="1.2s" repeatCount="indefinite"/><path fill="#d99a4e" d="M16 27h28v18H16z"/><path fill="#fff3d7" d="M24 34h12v11H24z"/><rect x="24" y="30" width="4" height="4" fill="#263238"/><rect x="35" y="30" width="4" height="4" fill="#263238"/></g>`;
  const tank = `${base}<rect x="8" y="12" width="48" height="36" fill="#c8efec"/><path fill="#29464b" d="M8 12h48v4H8zM8 44h48v4H8zM8 12h4v36H8zM52 12h4v36h-4z"/><g><animateTransform attributeName="transform" type="translate" values="4 0;-8 0;4 0" dur="1.4s" repeatCount="indefinite"/><path fill="#d99a4e" d="M30 30h14v-4h7v12h-7v-4H30z"/></g><g><animateTransform attributeName="transform" type="translate" values="-5 0;5 0;-5 0" dur=".9s" repeatCount="indefinite"/><path fill="#d99a4e" d="M17 43h20v8H17z"/><path fill="#fff3d7" d="M23 45h8v6h-8z"/><rect x="31" y="41" width="4" height="4" fill="#263238"/></g>`;
  const tea = `${base}<rect x="20" y="16" width="24" height="36" fill="#d99a4e"/><rect x="18" y="12" width="28" height="5" fill="#fff3d7"/><rect x="24" y="21" width="16" height="18" fill="#f2c174"/><rect x="26" y="42" width="4" height="4" fill="#263238"/><rect x="34" y="42" width="4" height="4" fill="#263238"/><path fill="#6ec3a0" d="M38 9h10v4H38z"><animate attributeName="x" values="36;40;36" dur="1s" repeatCount="indefinite"/></path>`;
  const bug = `${base}<rect x="18" y="20" width="28" height="28" fill="#5d6b70"/><rect x="22" y="24" width="20" height="20" fill="#10181c"/><rect x="27" y="29" width="4" height="4" fill="#e76f51"/><rect x="35" y="29" width="4" height="4" fill="#e76f51"/><path fill="#e5b94d" d="M14 16h6v6h-6zM44 16h6v6h-6zM12 38h6v6h-6zM46 38h6v6h-6z"/>`;
  const overtime = `${base}<rect x="14" y="16" width="36" height="28" fill="#263238"/><rect x="18" y="20" width="28" height="16" fill="#9ed0bf"><animate attributeName="fill" values="#9ed0bf;#f2d06c;#9ed0bf" dur="1.3s" repeatCount="indefinite"/></rect><rect x="24" y="48" width="16" height="5" fill="#5d6b70"/><path fill="#e76f51" d="M46 7h5v14h-5zM46 25h5v5h-5z"/>`;
  const phone = `${base}<rect x="20" y="10" width="24" height="44" fill="#263238"/><rect x="23" y="15" width="18" height="30" fill="#8fcfc2"><animate attributeName="fill" values="#8fcfc2;#f2d06c;#8fcfc2" dur="1.1s" repeatCount="indefinite"/></rect><rect x="29" y="48" width="6" height="3" fill="#d7e1dc"/><path fill="#e76f51" d="M43 12h6v6h-6z"/>`;
  const delivery = `${base}<rect x="10" y="30" width="42" height="15" fill="#d99a4e"/><rect x="14" y="24" width="22" height="8" fill="#f2c174"/><rect x="16" y="47" width="6" height="6" fill="#263238"/><rect x="39" y="47" width="6" height="6" fill="#263238"/><path fill="#6ec3a0" d="M43 22h10v7H43z"><animateTransform attributeName="transform" type="translate" values="0 0;3 0;0 0" dur=".7s" repeatCount="indefinite"/></path>`;
  const pr = `${base}<rect x="14" y="14" width="36" height="32" fill="#263238"/><rect x="18" y="18" width="28" height="20" fill="#d7e1dc"/><path fill="#e76f51" d="M20 22h24v4H20zM20 30h18v4H20z"/><path fill="#f2d06c" d="M27 46h10v8H27z"><animate attributeName="y" values="46;43;46" dur=".8s" repeatCount="indefinite"/></path>`;
  const idea = `${base}<path fill="#f2d06c" d="M24 12h16v5h5v15h-5v7H24v-7h-5V17h5z"><animate attributeName="fill" values="#f2d06c;#fff3c7;#f2d06c" dur="1s" repeatCount="indefinite"/></path><rect x="26" y="42" width="12" height="5" fill="#5d6b70"/><rect x="28" y="49" width="8" height="4" fill="#263238"/><rect x="30" y="23" width="4" height="9" fill="#263238"/>`;
  const board = `${base}<rect x="10" y="14" width="44" height="34" fill="#263238"/><rect x="14" y="18" width="36" height="26" fill="#f7f4ea"/><rect x="18" y="22" width="10" height="6" fill="#6ec3a0"/><rect x="31" y="22" width="10" height="6" fill="#f2d06c"/><rect x="18" y="32" width="22" height="6" fill="#e76f51"><animate attributeName="width" values="14;26;14" dur="1.4s" repeatCount="indefinite"/></rect>`;
  const map = { fish, corgi: corgi2, tail, shadow, tank, tea, bug, overtime, phone, delivery, pr, idea, board };
  return stickerData(name, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" shape-rendering="crispEdges">${map[type] || fish}</svg>`);
}
const builtinStickers = [
  pixelSticker("收到", "smile"),
  pixelSticker("笑死", "laugh"),
  pixelSticker("流泪", "cry", "#73bde6"),
  pixelSticker("思考", "think", "#e7b34d"),
  pixelSticker("生气", "angry", "#e76f51"),
  pixelSticker("墨镜", "cool", "#f0c85a"),
  pixelSticker("震惊", "shock", "#a878d1"),
  pixelSticker("困了", "sleep", "#93a8c7"),
  pixelSticker("赞", "thumb", "#78c59b"),
  pixelSticker("咖啡续命", "coffee", "#c4935b"),
  sceneSticker("锦鲤游过", "fish", "#e76f51"),
  sceneSticker("锦鲤保佑", "fish", "#f0c85a"),
  sceneSticker("鱼缸盯梢", "tank"),
  sceneSticker("柯基坐好", "corgi"),
  sceneSticker("柯基追尾巴", "tail"),
  sceneSticker("柯基追影子", "shadow"),
  sceneSticker("柯基追鱼", "tank"),
  sceneSticker("奶茶到了", "tea"),
  sceneSticker("Bug 出没", "bug"),
  sceneSticker("今晚加班", "overtime"),
  sceneSticker("手机摸鱼", "phone"),
  sceneSticker("外卖到门口", "delivery"),
  sceneSticker("PR 爆炸", "pr"),
  sceneSticker("灵感灯泡", "idea"),
  sceneSticker("看板推进", "board"),
  pixelSticker("阿默冷笑", "cool", "#8fcfc2"),
  pixelSticker("小韩拍板", "thumb", "#e7b34d"),
  pixelSticker("小研质疑", "think", "#b8d98b"),
  pixelSticker("小文扎心", "shock", "#d6a4e8"),
  pixelSticker("今日交付", "smile", "#78c59b")
];
function fit() {
  const d = Math.min(devicePixelRatio || 1, 2), w = canvas.clientWidth || canvas.getBoundingClientRect().width, h = canvas.clientHeight || canvas.getBoundingClientRect().height;
  canvas.width = w * d;
  canvas.height = h * d;
  ctx.setTransform(d, 0, 0, d, 0, 0);
  applyOfficeView();
}
addEventListener("resize", fit);
fit();
function canvasPointFromClient(clientX, clientY) {
  const r = canvas.getBoundingClientRect(), sx = (r.width || canvas.clientWidth) / (canvas.clientWidth || 1), sy = (r.height || canvas.clientHeight) / (canvas.clientHeight || 1);
  return { x: (clientX - r.left) / (sx || 1), y: (clientY - r.top) / (sy || 1) };
}
function isOfficeViewportActive() {
  return isMobileView() && document.body.classList.contains("show-office") && currentRoom === "office";
}
function clampOfficeView() {
  const stage = canvas.parentElement;
  if (!stage) return;
  const sw = stage.clientWidth, sh = stage.clientHeight, cw = canvas.clientWidth * officeView.scale, ch = canvas.clientHeight * officeView.scale;
  const minX = Math.min(0, sw - cw), minY = Math.min(0, sh - ch);
  officeView.x = Math.min(0, Math.max(minX, officeView.x));
  officeView.y = Math.min(0, Math.max(minY, officeView.y));
}
function applyOfficeView() {
  if (!isOfficeViewportActive()) {
    canvas.style.transform = "";
    return;
  }
  officeView.scale = Math.min(officeView.max, Math.max(officeView.min, officeView.scale));
  clampOfficeView();
  canvas.style.transform = `translate(${Math.round(officeView.x)}px,${Math.round(officeView.y)}px) scale(${officeView.scale})`;
}
const officeCorgiFrames = {};
const OFFICE_CORGI_ANIMS = {
  idle: ["idle_0", "idle_1", "idle_2", "idle_3", "idle_4", "idle_5", "idle_6", "idle_7"],
  walk: ["walk_0", "walk_1", "walk_2", "walk_3", "walk_4", "walk_5", "walk_6", "walk_7"],
  bark: ["bark_0", "bark_1", "bark_2", "bark_3", "bark_4", "bark_5", "bark_6", "bark_7"],
  sleep: ["sleep_0", "sleep_1", "sleep_2", "sleep_3", "sleep_4", "sleep_5", "sleep_6", "sleep_7"]
};
Object.values(OFFICE_CORGI_ANIMS).flat().forEach((id) => {
  const img = new Image();
  img.src = `/projects/companyverse/assets/corgi/${id}.png?v=office-corgi-2`;
  officeCorgiFrames[id] = img;
});
const officeCorgiState = { state: "idle", dir: 1, lastX: null, stepPhase: 0, lastT: 0, nextChange: 0, stateStarted: 0 };
function px(x, y, w, h, c) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
function drawOfficeCorgi(x, y, t = 0, scale = 0.3, label2 = true) {
  const dx = officeCorgiState.lastX == null ? 0 : x - officeCorgiState.lastX;
  const moving = Math.abs(dx) > 0.15, hour = (/* @__PURE__ */ new Date()).getHours();
  let state2 = officeCorgiState.state || "idle";
  if (hour >= 23 || hour < 7) {
    state2 = "sleep";
    officeCorgiState.nextChange = t + 12e3;
  } else if (moving) {
    state2 = "walk";
    officeCorgiState.nextChange = t + 2200;
  } else if (t > (officeCorgiState.nextChange || 0)) {
    const mood = Math.abs(Math.sin(t / 7300 + x * 0.013 + y * 0.017));
    state2 = mood > 0.9 ? "bark" : mood > 0.64 ? "idle" : "sleep";
    officeCorgiState.nextChange = t + (state2 === "bark" ? 1400 : state2 === "sleep" ? 16e3 : 9e3);
    officeCorgiState.stateStarted = t;
  }
  if (state2 === "bark" && t - (officeCorgiState.stateStarted || t) > 1500) {
    state2 = "idle";
    officeCorgiState.nextChange = t + 9e3;
  }
  if (moving) officeCorgiState.dir = dx < 0 ? -1 : 1;
  const dt = Math.min(64, Math.max(0, t - (officeCorgiState.lastT || t)));
  if (moving) officeCorgiState.stepPhase = (officeCorgiState.stepPhase + Math.abs(dx) * 0.72 + dt * 0.02) % 64;
  officeCorgiState.lastX = x;
  officeCorgiState.lastT = t;
  officeCorgiState.state = state2;
  const list = OFFICE_CORGI_ANIMS[state2] || OFFICE_CORGI_ANIMS.idle, rate = state2 === "bark" ? 120 : state2 === "sleep" ? 260 : state2 === "walk" ? 150 : 170;
  const id = state2 === "walk" ? list[Math.floor(officeCorgiState.stepPhase / 8) % list.length] : list[Math.floor(t / rate) % list.length], img = officeCorgiFrames[id];
  if (img && img.complete && img.naturalWidth) {
    const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
    px(x - dw * 0.42, y + dh * 0.34, dw * 0.74, 7, "rgba(28,38,38,.22)");
    ctx.save();
    if (officeCorgiState.dir < 0) {
      ctx.translate(Math.round(x + dw * 0.5), Math.round(y - dh * 0.5));
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, dw, dh);
    } else ctx.drawImage(img, Math.round(x - dw * 0.5), Math.round(y - dh * 0.5), dw, dh);
    ctx.restore();
    if (label2) {
      ctx.fillStyle = "#5b4d40";
      ctx.font = "900 10px Microsoft YaHei";
      ctx.textAlign = "center";
      ctx.fillText("小文柯基", x, y + dh * 0.5 + 12);
      ctx.textAlign = "left";
    }
    return;
  }
  const bob = Math.round(Math.sin((t || 0) / 180) * 2), wag = Math.round(Math.sin((t || 0) / 140) * 4);
  px(x - 25, y - 16 + bob, 34, 19, "#d99a4e");
  px(x - 17, y - 22 + bob, 24, 16, "#f0b45c");
  px(x - 13, y - 17 + bob, 14, 10, "#fff0cf");
  px(x - 19, y - 30 + bob, 7, 11, "#f0b45c");
  px(x + 1, y - 29 + bob, 7, 10, "#f0b45c");
  px(x - 17, y - 27 + bob, 3, 5, "#f5b1a5");
  px(x + 3, y - 26 + bob, 3, 5, "#f5b1a5");
  px(x - 9, y - 14 + bob, 3, 3, "#172026");
  px(x + 1, y - 14 + bob, 3, 3, "#172026");
  px(x - 5, y - 9 + bob, 4, 3, "#172026");
  px(x + 11, y - 9 + bob + wag, 11, 5, "#f0b45c");
  px(x - 22, y + 2 + bob, 6, 9, "#fff0cf");
  px(x - 5, y + 2 - bob, 6, 9, "#fff0cf");
  px(x - 22, y + 10 + bob, 7, 3, "#263238");
  px(x - 5, y + 10 - bob, 7, 3, "#263238");
}
function coffeeMachine(x, y, t) {
  px(x, y, 36, 46, "#303a3a");
  px(x + 5, y + 5, 26, 18, "#566d68");
  px(x + 10, y + 9, 16, 4, "#9ed0bf");
  px(x + 8, y + 28, 20, 12, "#171d1d");
  px(x + 13, y + 31, 10, 9, "#d7c3a0");
  px(x + 31, y + 20, 8, 18, "#43504d");
  px(x + 35, y + 23, 12, 5, "#6a7f78");
  if (Math.floor(t / 650) % 2) px(x + 18, y + 21, 3, 6, "#d7d2c2");
}
function iceMachine(x, y, t) {
  px(x, y, 38, 52, "#e9eee9");
  px(x + 6, y + 7, 26, 20, "#6f9290");
  px(x + 10, y + 12, 18, 9, "#b9e0dc");
  px(x + 7, y + 34, 24, 9, "#cfd9d5");
  for (let i = 0; i < 3; i++) {
    const drop = (t / 240 + i * 9) % 18;
    px(x + 12 + i * 7, y + 29 + drop * 0.25, 4, 4, "#d6f4f2");
  }
}
function milkFoamer(x, y, t) {
  px(x, y, 30, 44, "#d9d2c1");
  px(x + 6, y + 8, 18, 24, "#f5f2e8");
  px(x + 10, y + 4, 10, 6, "#8d7560");
  px(x + 24, y + 15, 8, 14, "#b08a68");
  for (let i = 0; i < 3; i++) px(x + 7 + i * 6, y + 6 - Math.sin(t / 260 + i) * 3, 4, 4, "#fff7df");
}
function microwave(x, y, t) {
  px(x, y, 32, 36, "#2c2c2c");
  px(x + 3, y + 4, 26, 18, "#1a1a1a");
  px(x + 7, y + 9, 18, 10, "#3a3a3a");
  for (let i = 0; i < 4; i++) {
    px(x + 6 + i * 6, y + 2, 4, 3, "#8c8c8c");
  }
  if (Math.floor(t / 300) % 2) {
    px(x + 27, y + 5, 3, 3, "#00cc00");
  } else {
    px(x + 27, y + 5, 3, 3, "#cc0000");
  }
  if (Math.floor(t / 600) % 2) {
    const glow = Math.floor(t / 60) % 3;
    for (let i = 0; i < 2; i++) {
      px(x + 8 + i * 6, y + 10 + glow, 4, 4, "#ffdd6644");
    }
  }
  ctx.fillStyle = "#5b4d40";
  ctx.font = "9px Microsoft YaHei";
  ctx.fillText("微波炉", x - 1, y + 48);
}
function breakBar(x, y, w, bh, t) {
  px(x, y, w, bh, "#efeadb");
  px(x, y, w, 8, "#b57f4e");
  px(x + 6, y + 12, w - 14, bh - 24, "#d9c6a5");
  const maxMW = x + w - 32;
  coffeeMachine(Math.min(x + 12, maxMW - 100), y + 20, t);
  iceMachine(Math.min(x + 62, maxMW - 50), y + 16, t);
  milkFoamer(Math.min(x + 116, maxMW - 84), y + 20, t);
  px(x + 14, y + bh - 16, w - 20, 5, "#9f744d");
  ctx.fillStyle = "#5b4d40";
  ctx.font = "10px Microsoft YaHei";
  ctx.fillText("水吧 · 咖啡 · 奶泡", x + 39, y + bh - 4);
}
function breakBarScaled(x, y, t, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  breakBar(-10, 0, 178, 88, t);
  ctx.restore();
}
function aquarium(x, y, w, h, t) {
  px(x - 12, y + h, w + 24, 22, "#596258");
  px(x - 8, y + h + 5, w + 16, 13, "#394a45");
  px(x - 4, y - 5, w + 8, h + 10, "#3b4b4b");
  px(x, y, w, h, "#5aa6a5");
  px(x + 6, y + 6, w - 12, h - 12, "#82c6c0aa");
  const weedCount = Math.max(4, Math.floor(w / 32)), weedGap = (w - 28) / Math.max(1, weedCount - 1);
  for (let i = 0; i < weedCount; i++) {
    const wx = x + 8 + i * weedGap;
    px(wx, y + h - 13 - Math.sin(t / 520 + i) * 3, Math.min(18, weedGap * 0.62), 8, i % 2 ? "#5e8d68" : "#8b7e57");
  }
  for (let i = 0; i < 5; i++) {
    const lane = Math.max(24, w - 36), phase = (t * (0.012 + i * 3e-3) + i * 37) % (lane * 2), forward = phase < lane, swim = forward ? phase : lane * 2 - phase;
    const dir = forward ? 1 : -1, fx = x + 12 + swim, fy = y + 14 + i * 11 % Math.max(16, h - 24) + Math.sin(t / 420 + i) * 4, body = i % 2 ? "#f0a24f" : "#e45f42", fin = i % 2 ? "#f7ca66" : "#f08b63";
    px(fx, fy, 16, 8, body);
    px(fx + (dir > 0 ? -5 : 15), fy + 2, 6, 4, fin);
    px(fx + (dir > 0 ? 12 : 2), fy + 2, 2, 2, "#222");
  }
  for (let i = 0; i < 9; i++) {
    const by = y + h - 8 - (t / 80 + i * 17) % (h - 18);
    px(x + 14 + i * 19, by, 3, 3, "#d7f3efaa");
  }
  ctx.fillStyle = "#38514c";
  ctx.font = "10px Microsoft YaHei";
  ctx.fillText("低噪承重鱼缸", x + w * 0.27, y + h + 18);
}
function corgi(x, y, t) {
  const wag = Math.round(Math.sin(t / 180) * 3), step = Math.sin(t / 900), sit = Math.floor(t / 4200) % 3 === 0;
  ctx.save();
  ctx.translate(x + step * 10, y);
  px(-20, -8, 38, 18, "#c88a3c");
  px(-12, -14, 22, 15, "#d89b4b");
  px(-8, -10, 13, 9, "#fff0cf");
  px(-13, -21, 6, 10, "#c88a3c");
  px(4, -21, 6, 10, "#c88a3c");
  px(-5, -7, 3, 3, "#1d2425");
  px(7, -7, 3, 3, "#1d2425");
  px(0, -2, 4, 3, "#232a2a");
  px(16, -5, 8, 4, "#fff0cf");
  px(23, -5 + wag, 8, 4, "#c88a3c");
  if (sit) {
    px(-14, 9, 8, 8, "#a56a30");
    px(5, 8, 10, 8, "#a56a30");
  } else {
    px(-15, 9, 7, 12, "#7a4f28");
    px(7, 9, 7, 12, "#7a4f28");
    px(-2, 9, 6, 11, "#fff0cf");
  }
  ctx.restore();
}
function drawGameRoom(w, h, t) {
  px(0, 0, w, h, "#12141a");
  px(0, h * 0.7, w, h * 0.3, "#2a2a34");
  for (let y = Math.floor(h * 0.7); y < h; y += 18) {
    for (let x = 0; x < w; x += 36) {
      px(x + y % 36 * 0.5, y, 33, 15, (x + y) % 72 ? "#2a2a34" : "#24242e");
    }
  }
  px(0, 0, w, h * 0.15, "#1a1a24");
  px(0, h * 0.15, w, 3, "#2a2a34");
  for (let i = 0; i < 5; i++) {
    const lx = w * 0.1 + i * w * 0.22, ly = 18;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const g = ctx.createRadialGradient(lx, ly + 10, 2, lx, ly + 10, 60);
    g.addColorStop(0, "rgba(244,201,93,0.25)");
    g.addColorStop(1, "rgba(244,201,93,0)");
    ctx.fillStyle = g;
    ctx.fillRect(lx - 60, 0, 120, 80);
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
    px(lx - 6, ly, 12, 4, "#f4c95d");
  }
  ctx.fillStyle = "#f4c95d";
  ctx.font = "bold 18px Microsoft YaHei";
  ctx.textAlign = "center";
  ctx.fillText("走廊", w / 2, h * 0.35);
  const leftDoorX = w * 0.22, leftDoorY = h * 0.28, leftDoorW = w * 0.24, leftDoorH = h * 0.38;
  px(leftDoorX, leftDoorY, leftDoorW, leftDoorH, "#3a3a48");
  px(leftDoorX + 4, leftDoorY + 4, leftDoorW - 8, leftDoorH - 8, "#2a3a3a");
  px(leftDoorX + leftDoorW - 30, leftDoorY + leftDoorH / 2 - 2, 8, 8, "#d7c6a0");
  ctx.fillStyle = "#88efc0";
  ctx.font = "bold 13px Microsoft YaHei";
  ctx.textAlign = "center";
  ctx.fillText("游戏模式", leftDoorX + leftDoorW / 2, leftDoorY + 18);
  ctx.fillStyle = "#6ec3a0";
  ctx.font = "11px Microsoft YaHei";
  ctx.fillText("进入", leftDoorX + leftDoorW / 2, leftDoorY + 36);
  const rightDoorX = w * 0.54, rightDoorY = h * 0.28, rightDoorW = w * 0.24, rightDoorH = h * 0.38;
  px(rightDoorX, rightDoorY, rightDoorW, rightDoorH, "#3a3a48");
  px(rightDoorX + 4, rightDoorY + 4, rightDoorW - 8, rightDoorH - 8, "#2a3a3a");
  px(rightDoorX + rightDoorW - 30, rightDoorY + rightDoorH / 2 - 2, 8, 8, "#d7c6a0");
  ctx.fillStyle = "#f4c95d";
  ctx.font = "bold 13px Microsoft YaHei";
  ctx.textAlign = "center";
  ctx.fillText("公司办公室", rightDoorX + rightDoorW / 2, rightDoorY + 18);
  ctx.fillStyle = "#f4c95d";
  ctx.font = "11px Microsoft YaHei";
  ctx.fillText("返回", rightDoorX + rightDoorW / 2, rightDoorY + 36);
  ctx.fillStyle = "#5a6a6a";
  ctx.font = "10px Microsoft YaHei";
  ctx.textAlign = "center";
  ctx.fillText("← 老板办公室    洗手间 →", w / 2, h * 0.72);
  for (let i = 0; i < 3; i++) {
    const px2 = w * 0.1 + i * w * 0.35, py = h * 0.85;
    px(px2, py, 6, 6, "#3a4a5a");
    px(px2 + 8, py, 6, 6, "#3a4a5a");
    px(px2 + 4, py + 8, 6, 6, "#3a4a5a");
  }
  ctx.textAlign = "left";
}
function drawBossOffice(w, h, t) {
  var _a;
  const night = (((_a = state == null ? void 0 : state.world) == null ? void 0 : _a.daylight) || 1) < 0.35;
  px(0, 0, w, h, night ? "#14191f" : "#1e2228");
  px(0, 20, w, h - 40, "#2a2e34");
  px(0, h * 0.72, w, h * 0.28, "#1a2428");
  for (let y = Math.floor(h * 0.72); y < h; y += 20) {
    for (let x = 0; x < w; x += 60) {
      px(x + y % 40 * 0.5, y, 58, 18, (x + y) % 80 ? "#1a2428" : "#151e22");
    }
  }
  if (!night) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const g = ctx.createRadialGradient(w / 2, 10, 5, w / 2, 10, 200);
    g.addColorStop(0, "rgba(244,201,93,0.15)");
    g.addColorStop(1, "rgba(244,201,93,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, 200);
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
  }
  px(w * 0.3, h * 0.1, w * 0.4, 60, "#3a3a48");
  px(w * 0.33, h * 0.12, w * 0.34, 54, "#2a3a3a");
  ctx.fillStyle = "#f4c95d";
  ctx.font = "bold 14px Microsoft YaHei";
  ctx.textAlign = "center";
  ctx.fillText("HERMES PIXEL WORKS", w / 2, h * 0.155);
  ctx.fillStyle = "#8a9a9a";
  ctx.font = "10px Microsoft YaHei";
  ctx.fillText("CEO OFFICE", w / 2, h * 0.185);
  ctx.textAlign = "left";
  const deskX = w * 0.25, deskY = h * 0.48, deskW = w * 0.5, deskH = h * 0.18;
  px(deskX, deskY, deskW, 12, "#5a4a3a");
  px(deskX + 6, deskY + 12, deskW - 12, deskH - 12, "#7a6a5a");
  px(w * 0.38, h * 0.22, 80, 55, "#2a3a3a");
  px(w * 0.39, h * 0.23, 78, 50, "#1a2a2a");
  px(w * 0.39, h * 0.23, 78, 50, "#3a6a5a");
  px(w * 0.4, h * 0.25, 55, 14, "#4a8a7a");
  px(w * 0.4, h * 0.27, 55, 14, "#5a9a8a");
  px(w * 0.4, h * 0.29, 40, 14, "#4a8a7a");
  px(w * 0.68, h * 0.3, 18, 14, "#3a4a4a");
  px(w * 0.69, h * 0.31, 12, 8, "#6a8a8a");
  px(w * 0.55, h * 0.38, 12, 10, "#d7c6a0");
  px(w * 0.56, h * 0.39, 10, 8, "#8a6a4a");
  px(w * 0.12, h * 0.55, 10, 30, "#5a7a5a");
  px(w * 0.1, h * 0.48, 14, 14, "#4a8a5a");
  px(w * 0.82, h * 0.25, 60, 120, "#4a3a2a");
  for (let row = 0; row < 5; row++) {
    const sy = h * 0.26 + row * 24;
    for (let col = 0; col < 4; col++) {
      px(w * 0.83 + col * 14, sy + 2, 10, 20, ["#8a4a3a", "#4a8a5a", "#4a5a8a", "#8a8a4a"][(col + row) % 4]);
    }
  }
  px(w * 0.48, h * 0.58, 36, 28, "#3a3a4a");
  px(w * 0.5, h * 0.6, 32, 24, "#4a4a5a");
  ctx.fillStyle = "#f5f3e8";
  ctx.font = "10px Microsoft YaHei";
  ctx.textAlign = "center";
  ctx.fillText("老板", w / 2, h * 0.72);
  ctx.textAlign = "left";
  ctx.fillStyle = "#f4c95d";
  ctx.font = "bold 11px Microsoft YaHei";
  ctx.textAlign = "center";
  ctx.fillText("← 返回办公室", w * 0.45, h * 0.7);
  ctx.fillText("洗手间 →", w * 0.75, h * 0.7);
}
function room(w, h, t = 0) {
  const glassY = Math.max(132, h * 0.22);
  const narrow = w < 560;
  px(0, 0, w, glassY, "#91c79b");
  for (let y = 0; y < glassY; y += 18) for (let x = 0; x < w; x += 28) px(x + y % 36, y, 3, 3, (x + y) % 3 ? "#76b184" : "#c9de8c");
  px(w * 0.02, 0, w * 0.15, glassY, "#d8c69e");
  px(w * 0.055, 0, w * 0.06, glassY, "#b8a37e");
  px(w * 0.22, 18, w * 0.2, glassY * 0.52, "#609da0");
  px(w * 0.235, 25, w * 0.17, glassY * 0.37, "#82bdba");
  px(w * 0.25, 34, 18, 5, "#d9eee1");
  for (const p of [[0.46, 0.07], [0.52, 0.13], [0.69, 0.08], [0.76, 0.15]]) {
    px(w * p[0] - 5, glassY * p[1] + 22, 10, 30, "#795d41");
    px(w * p[0] - 22, glassY * p[1], 44, 28, "#397b55");
    px(w * p[0] - 14, glassY * p[1] - 10, 28, 24, "#54a467");
  }
  px(w * 0.79, 12, w * 0.18, glassY - 24, "#f0ece0");
  px(w * 0.79, 12, w * 0.18, 8, "#c99056");
  px(w * 0.815, 38, w * 0.055, glassY - 58, "#688d89");
  px(w * 0.89, 38, w * 0.055, glassY - 58, "#688d89");
  ctx.fillStyle = "#3b514d";
  ctx.font = "bold 10px Microsoft YaHei";
  ctx.fillText("洗手间", w * 0.835, 31);
  ctx.strokeStyle = "#5a7a6a";
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  const doorX = w * 0.815, doorY = 38, doorW = w * 0.055, doorH = glassY - 58;
  ctx.strokeRect(doorX, doorY, doorW, doorH);
  px(doorX + 3, doorY + 3, doorW - 6, doorH - 6, "#688d89aa");
  px(doorX + doorW - 8, doorY + doorH / 2, 4, 4, "#d7c6a0");
  if (!editMode) {
    ctx.fillStyle = "rgba(100,200,150,0.06)";
    ctx.fillRect(doorX - 2, doorY - 2, doorW + 4, doorH + 4);
  }
  ;
  px(w * 5e-3, glassY - 35, 54, 24, "#e7d2a1");
  px(w * 0.012, glassY - 31, 40, 16, "#cf7358");
  ctx.fillStyle = "#fff";
  ctx.font = "8px monospace";
  ctx.fillText("DELIVERY", w * 0.014, glassY - 20);
  px(0, glassY, w, 10, "#2e4a4b");
  px(0, glassY - 8, w, 8, "#d4b16a");
  for (let x = 0; x < w; x += 120) {
    px(x + 4, glassY - 82, 112, 72, "#b9d9d2aa");
    px(x + 58, glassY - 82, 4, 72, "#567d7c");
  }
  px(0, glassY + 10, w, h - glassY - 10, "#d5c8aa");
  for (let y = glassY + 12; y < h; y += 26) {
    for (let x = 0; x < w; x += 92) {
      const off = Math.floor(y / 26) % 2 * 46;
      px(x + off, y, 89, 23, (x / 92 + y / 26) % 2 ? "#dfd1b2" : "#cdbd9d");
      px(x + off, y + 23, 89, 2, "#b5a585");
    }
  }
  px(8, glassY + 10, 8, h - glassY - 26, "#f4efe2");
  px(w - 16, glassY + 10, 8, h - glassY - 26, "#f4efe2");
  px(w * 0.4, glassY + 17, w * 0.2, 24, "#365550");
  ctx.fillStyle = "#f3d486";
  ctx.font = "bold 11px monospace";
  ctx.textAlign = "center";
  ctx.fillText("HERMES VILLA", w * 0.5, glassY + 33);
  ctx.textAlign = "left";
  px(w * 0.39, h * 0.48, w * 0.22, h * 0.19, "#8fa9a0");
  px(w * 0.405, h * 0.495, w * 0.19, h * 0.16, "#a9c0b5");
  px(w * 0.455, h * 0.535, w * 0.1, h * 0.08, "#4c6c6a");
  px(w * 0.46, h * 0.527, w * 0.09, h * 0.075, "#85aaa5");
  px(w * 0.44, h * 0.55, 10, 28, "#48605c");
  px(w * 0.555, h * 0.55, 10, 28, "#48605c");
  px(w * 0.485, h * 0.515, 34, 10, "#48605c");
  px(w * 0.485, h * 0.61, 34, 10, "#48605c");
  const kitchenX = narrow ? Math.max(210, w - 188) : w * 0.8, kitchenY = narrow ? glassY + 68 : h * 0.36, kitchenW = narrow ? 176 : w * 0.18, kitchenH = narrow ? 82 : 104;
  px(kitchenX, kitchenY, kitchenW, kitchenH, "#f2eee3");
  px(kitchenX, kitchenY, kitchenW, 9, "#b47c4d");
  px(kitchenX + 20, kitchenY + 24, 34, 32, "#3a4a49");
  px(kitchenX + 25, kitchenY + 29, 24, 18, "#92bbb4");
  px(kitchenX + kitchenW - 48, kitchenY + 24, 24, 48, "#f8fbf7");
  px(kitchenX + kitchenW - 45, kitchenY - 10, 18, 32, "#71b5c0");
  px(kitchenX + 72, kitchenY + 45, 16, 22, "#d79965");
  px(kitchenX + 76, kitchenY + 39, 8, 8, "#edc885");
  if (editMode) {
    drawSceneObjects(w, h, t);
    if (collisionWarning && Date.now() < collisionWarnUntil) {
      ctx.save();
      ctx.fillStyle = "rgba(255,60,60,0.9)";
      ctx.strokeStyle = "#ff4444";
      ctx.lineWidth = 2;
      const tw2 = ctx.measureText(collisionWarning).width + 20;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(w / 2 - tw2 / 2, h - 50, tw2, 24, 6) : ctx.rect(w / 2 - tw2 / 2, h - 50, tw2, 24);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px Microsoft YaHei";
      ctx.textAlign = "center";
      ctx.fillText(collisionWarning, w / 2, h - 33);
      ctx.textAlign = "left";
      ctx.restore();
    }
  } else drawSceneObjects(w, h, t);
  px(w * 0.76, h * 0.72, w * 0.22, h * 0.18, "#b9a98d");
  px(w * 0.79, h * 0.77, w * 0.15, 50, "#385f57");
  px(w * 0.8, h * 0.755, w * 0.13, 42, "#578276");
  px(w * 0.81, h * 0.77, 32, 18, "#d5b875");
  for (const p of [[0.75, 0.68], [0.95, 0.67], [0.74, 0.9]]) {
    px(w * p[0], h * p[1], 8, 42, "#896242");
    px(w * p[0] - 14, h * p[1] - 16, 36, 24, "#4d9364");
    px(w * p[0] - 7, h * p[1] - 27, 22, 20, "#72b478");
  }
  px(12, h - 28, 194, 18, "#365550");
  ctx.fillStyle = "#eef5ec";
  ctx.font = "11px monospace";
  ctx.fillText("VILLA OFFICE · LIVE", 20, h - 15);
}
const homeThemes = {
  default: { name: "阿默", wall: "#b7c6bf", floor: "#806952", rug: "#405f59", sofa: "#4f6c67", bed: "#50736c", note: "克制、实用的技术宅" },
  planner: { name: "小韩", wall: "#d8c5a1", floor: "#956f49", rug: "#a3533d", sofa: "#bd704d", bed: "#cf9d54", note: "明快、讲效率的行动派" },
  researcher: { name: "小研", wall: "#b7c8d1", floor: "#6e7a78", rug: "#805b83", sofa: "#536d79", bed: "#735d86", note: "资料很多的观察实验室" },
  writer: { name: "小文", wall: "#d7c7cc", floor: "#8a705f", rug: "#557564", sofa: "#846676", bed: "#657c70", note: "柔和、有故事感的阅读之家" }
};
function homeActivity(a) {
  var _a;
  const hour = Number((((_a = state == null ? void 0 : state.world) == null ? void 0 : _a.clock) || "00:00").split(":")[0]), remote = (a == null ? void 0 : a.presence) === "home_remote";
  if (a && !["home", "home_remote"].includes(a.presence)) return "away";
  if (hour < 7) return "sleep";
  if (remote) return "remote";
  const lists = { default: ["console", "tv", "phone"], planner: ["treadmill", "tv", "phone"], researcher: ["read", "console", "phone"], writer: ["read", "tv", "phone"] }, slot = Math.floor(Date.now() / 9e5 + ((a == null ? void 0 : a.seed) || 0)) % 3;
  return lists[(a == null ? void 0 : a.id) || homeView][slot];
}
function label(text, x, y, c = "#eef4ef") {
  ctx.fillStyle = c;
  ctx.font = "11px Microsoft YaHei";
  ctx.fillText(text, x, y);
}
function plant(x, y) {
  px(x, y, 18, 18, "#9b6947");
  px(x + 7, y - 24, 5, 26, "#477354");
  px(x - 7, y - 27, 14, 17, "#5d9669");
  px(x + 7, y - 31, 16, 19, "#397b57");
}
function wall(x, y, w, h) {
  px(x, y, w, h, "#3e3935");
  px(x + 7, y + 7, Math.max(0, w - 14), Math.max(0, h - 14), "#ece6d8");
}
function windowTop(x, w, night) {
  px(x, 24, w, 18, "#574e47");
  px(x + 7, 28, w - 14, 10, night ? "#38526a" : "#83c4d2");
  for (let i = x + 20; i < x + w - 8; i += 32) px(i, 28, 4, 10, "#e5eee8");
}
function bedTop(x, y, w, h, c) {
  px(x, y, w, h, "#59483d");
  px(x + 8, y + 8, w - 16, h - 16, c);
  px(x + 14, y + 13, w * 0.32, h - 26, "#eee8dc");
  px(x + w * 0.43, y + 13, w * 0.48, h - 26, "#c7b69c");
}
function sofaTop(x, y, w, h, c, vertical = false) {
  px(x, y, w, h, "#403a36");
  px(x + 7, y + 7, w - 14, h - 14, c);
  if (vertical) {
    px(x + 9, y + h * 0.46, w - 18, 5, "#d3b99a");
  } else {
    px(x + w * 0.46, y + 9, 5, h - 18, "#d3b99a");
  }
}
function tableTop(x, y, w, h, c = "#946f4f") {
  px(x, y, w, h, "#554238");
  px(x + 6, y + 6, w - 12, h - 12, c);
  px(x + 14, y + 14, 18, 5, "#d6c58e");
}
function tvTop(x, y, w, h, on) {
  px(x, y, w, h, "#202828");
  px(x + 7, y + 7, w - 14, h - 14, on ? "#6da9a1" : "#263839");
  if (on) {
    px(x + 14, y + 13, w * 0.28, h - 26, "#e5bc60");
    px(x + w * 0.48, y + 14, w * 0.35, 6, "#d7e8df");
  }
}
function kitchenTop(x, y, w, h) {
  px(x, y, w, h, "#d8ddd7");
  px(x + 8, y + 8, w - 16, h - 16, "#aebcb7");
  px(x + 16, y + 15, 32, 28, "#3d5655");
  px(x + w - 54, y + 14, 34, 34, "#6f7773");
  px(x + w - 48, y + 20, 22, 22, "#303636");
}
function utilityTop(x, y) {
  px(x, y, 58, 70, "#e2e6e2");
  px(x + 9, y + 9, 40, 40, "#778a87");
  ctx.strokeStyle = "#445653";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(x + 29, y + 29, 15, 0, Math.PI * 2);
  ctx.stroke();
  px(x + 66, y, 54, 70, "#d5ddda");
  px(x + 74, y + 9, 38, 44, "#8ca4a1");
}
function workstationTop(x, y, w = 170) {
  tableTop(x, y, w, 64, "#815d45");
  px(x + 18, y + 10, 58, 34, "#1e2829");
  px(x + 24, y + 15, 46, 23, "#91d7c8");
  px(x + 91, y + 12, 52, 29, "#253132");
  px(x + 97, y + 17, 40, 18, "#6f9e98");
  px(x + w - 25, y + 15, 12, 25, "#263030");
}
function homeShell(theme, night, sleep) {
  px(0, 0, 960, 600, sleep ? "#14191f" : "#263436");
  px(22, 22, 916, 556, "#3e3935");
  px(38, 38, 884, 524, sleep ? "#3a342f" : theme.floor);
  for (let y = 48; y < 552; y += 32) for (let x = 48; x < 912; x += 72) px(x + y % 64, y, 60, 2, sleep ? "#48403a" : "#a58d73");
  windowTop(105, 230, night);
  windowTop(625, 230, night);
}
function drawDefaultHome(activity, night) {
  wall(365, 40, 18, 236);
  wall(40, 276, 343, 18);
  bedTop(68, 92, 250, 130, "#50736c");
  px(76, 238, 80, 22, "#665142");
  label("睡眠区", 171, 264, "#6e5b4f");
  workstationTop(430, 86, 255);
  workstationTop(430, 165, 255);
  px(720, 72, 148, 190, "#222b2d");
  for (let y = 86; y < 244; y += 32) {
    px(734, y, 120, 22, "#38534f");
    px(746, y + 6, 8, 8, "#62d49a");
    px(770, y + 6, 58, 5, "#6c9690");
  }
  label("工作室 / 家庭服务器", 514, 278, "#584c43");
  sofaTop(86, 374, 270, 92, "#4f6c67");
  tableTop(404, 388, 150, 82);
  tvTop(626, 374, 222, 86, activity === "tv" || activity === "console");
  px(690, 474, 90, 28, "#292f31");
  px(705, 481, 60, 12, "#66ae9f");
  kitchenTop(410, 310, 205, 62);
  px(632, 302, 80, 74, "#e5e9e4");
  utilityTop(760, 492);
  plant(882, 508);
}
function drawPlannerHome(activity, night) {
  wall(600, 40, 18, 226);
  wall(600, 266, 322, 18);
  bedTop(660, 85, 205, 130, "#cf9d54");
  px(632, 92, 18, 138, "#b6794d");
  tableTop(324, 188, 250, 138, "#b47c4e");
  for (let y = 215; y < 300; y += 27) {
    px(355, y, 82, 8, "#eee5c9");
    px(455, y, 74, 8, "#d5c071");
  }
  label("今日计划", 414, 260, "#6b4e3d");
  px(75, 90, 168, 38, "#2f3838");
  px(93, 143, 132, 26, "#5d6866");
  px(105, 174, 12, 177, "#303737");
  px(202, 174, 12, 177, "#303737");
  label("跑步区", 129, 373, "#5e4b3e");
  sofaTop(82, 420, 270, 86, "#bd704d");
  tvTop(390, 431, 194, 70, activity === "tv");
  kitchenTop(640, 336, 230, 70);
  utilityTop(650, 438);
  plant(864, 474);
}
function drawResearcherHome(activity, night) {
  wall(40, 228, 560, 18);
  wall(600, 40, 18, 390);
  wall(600, 430, 322, 18);
  bedTop(668, 458, 205, 82, "#735d86");
  workstationTop(76, 82, 255);
  px(357, 70, 190, 138, "#4c4a45");
  for (let y = 82; y < 194; y += 27) for (let x = 369; x < 532; x += 32) px(x, y, 22, 17, ["#a85d65", "#668e83", "#d1aa55"][(x + y) % 3]);
  label("样本与实验台", 379, 221, "#5a5350");
  for (let x = 70; x < 550; x += 118) {
    px(x, 278, 92, 204, "#695348");
    for (let y = 292; y < 468; y += 24) for (let bx = x + 9; bx < x + 82; bx += 12) px(bx, y, 8, 16, ["#b46c62", "#729284", "#d4ad67"][(bx + y) % 3]);
  }
  label("资料迷宫", 275, 510, "#5d5049");
  sofaTop(655, 92, 210, 76, "#536d79");
  tableTop(690, 198, 140, 68);
  tvTop(674, 292, 172, 66, activity === "console");
  utilityTop(645, 360);
}
function drawWriterHome(activity, night) {
  wall(346, 40, 18, 236);
  wall(40, 276, 324, 18);
  bedTop(76, 88, 220, 132, "#657c70");
  plant(300, 238);
  label("卧室", 166, 260, "#65554d");
  for (let x = 410; x < 875; x += 74) {
    px(x, 70, 58, 170, "#674f45");
    for (let y = 82; y < 226; y += 22) for (let bx = x + 7; bx < x + 52; bx += 10) px(bx, y, 7, 15, ["#c46f62", "#718c77", "#d3ae68"][(bx + y) % 3]);
  }
  sofaTop(422, 330, 270, 92, "#846676");
  tableTop(724, 344, 120, 72, "#a87b5e");
  px(744, 356, 70, 8, "#efe2b9");
  px(758, 371, 40, 30, "#e4d5ad");
  px(90, 350, 210, 170, "#557564");
  px(112, 372, 168, 128, "#b7a38d");
  px(148, 393, 96, 82, "#d9c69c");
  label("阅读角", 166, 541, "#66574f");
  tvTop(412, 478, 210, 64, activity === "tv");
  kitchenTop(658, 478, 214, 62);
  plant(878, 500);
}
function drawHomeInterior(w, h, t) {
  var _a, _b, _c;
  const id = homeView, a = agents[id], theme = homeThemes[id], hour = Number((((_a = state == null ? void 0 : state.world) == null ? void 0 : _a.clock) || "00:00").split(":")[0]), activity = homeActivity(a), sleep = activity === "sleep", night = ((_c = (_b = state == null ? void 0 : state.world) == null ? void 0 : _b.daylight) != null ? _c : 1) < 0.35, lit = night && !sleep;
  const sx = w / 960, sy = h / 600;
  ctx.save();
  ctx.scale(sx, sy);
  homeShell(theme, night, sleep);
  ({ default: drawDefaultHome, planner: drawPlannerHome, researcher: drawResearcherHome, writer: drawWriterHome })[id](activity, night);
  if (lit) {
    ctx.globalCompositeOperation = "screen";
    const g = ctx.createRadialGradient(720, 310, 10, 720, 310, 300);
    g.addColorStop(0, "rgba(255,221,145,.32)");
    g.addColorStop(1, "rgba(255,221,145,0)");
    ctx.fillStyle = g;
    ctx.fillRect(350, 40, 600, 540);
    ctx.globalCompositeOperation = "source-over";
  }
  drawHomeResident(a || { id, name: theme.name }, activity, t);
  px(38, 46, 288, 30, sleep ? "#262b31dd" : "#31423ddd");
  label(`${theme.name}的家 · ${theme.note}`, 50, 66, sleep ? "#9ca8ae" : "#f3e6c5");
  px(656, 548, 256, 28, "#26322fdd");
  ctx.textAlign = "center";
  label(activityLabel(activity), 784, 567);
  ctx.textAlign = "left";
  ctx.restore();
}
function activityLabel(a) {
  return { away: "当前不在家", sleep: "已关灯休息", remote: "在家远程处理消息", tv: "坐在沙发看电视", console: "正在玩游戏", phone: "躺在沙发刷手机", treadmill: "晚间跑步", read: "安静阅读" }[a] || "在家休息";
}
const homeAnchors = { default: { sleep: [145, 154], remote: [520, 125], tv: [220, 418], console: [705, 445], phone: [250, 418] }, planner: { sleep: [735, 145], remote: [450, 245], tv: [220, 452], phone: [290, 450], treadmill: [158, 235] }, researcher: { sleep: [735, 492], remote: [185, 125], console: [758, 322], phone: [755, 126], read: [310, 376] }, writer: { sleep: [145, 145], remote: [510, 380], tv: [548, 374], phone: [620, 374], read: [194, 420] } };
function drawHomeResident(a, activity, t) {
  var _a;
  if (activity === "away") return;
  const r = roles[a.id] || roles.default, p = ((_a = homeAnchors[a.id]) == null ? void 0 : _a[activity]) || [480, 330], x = p[0], y = p[1];
  if (activity === "sleep") {
    px(x - 23, y - 13, 46, 26, r.skin);
    px(x - 25, y - 17, 50, 12, r.hair);
    px(x + 18, y - 15, 70, 30, themeColor(a.id));
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  px(-14, -12, 28, 24, r.color);
  px(-11, -20, 22, 18, r.skin);
  px(-12, -22, 24, 8, r.hair);
  px(-9, 12, 8, 10, "#202829");
  px(3, 12, 8, 10, "#202829");
  if (activity === "phone") {
    px(14, -10, 8, 15, "#213033");
    px(16, -8, 4, 10, "#78cfdd");
  }
  if (activity === "console") {
    px(-18, 5, 36, 9, "#283033");
    px(-12, 7, 5, 4, "#d5b450");
    px(9, 7, 4, 4, "#67b99d");
  }
  if (activity === "read") {
    px(-24, -3, 48, 28, "#e8d8ad");
    px(0, -2, 2, 25, "#9b6b52");
  }
  ctx.restore();
}
function themeColor(id) {
  var _a;
  return ((_a = homeThemes[id]) == null ? void 0 : _a.bed) || "#50736c";
}
function drawAtmosphere(w, h, t) {
  const world = state == null ? void 0 : state.world;
  if (!world) return;
  if (world.daylight < 0.75) {
    const alpha = (0.75 - world.daylight) * 0.48;
    px(0, 0, w, h, `rgba(15,29,54,${alpha})`);
  }
  if (world.weather === "小雨") {
    ctx.strokeStyle = "#d8eef0aa";
    ctx.lineWidth = 1;
    const wind = w < 560 ? 1.5 : 3.5;
    for (let i = 0; i < 58; i++) {
      const x = (i * 67 + t * 0.035) % w, y = (i * 53 + t * 0.18) % h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + wind, y + 18);
      ctx.stroke();
    }
  }
  if (world.weather.includes("多云")) {
    px(w * 0.12, 25, 80, 14, "#d7dfdcbb");
    px(w * 0.58, 48, 110, 16, "#d7dfdcaa");
  }
}
function desk(x, y, id) {
  const agent = agents[id], active = (agent == null ? void 0 : agent.status) === "working", accent = roles[id].color, hasPhone = ["office", "overtime"].includes(agent == null ? void 0 : agent.presence) && !["phone", "orderFood"].includes(agent == null ? void 0 : agent.mode);
  px(x + 28, y + 35, 48, 42, "#273231");
  px(x + 34, y + 30, 36, 42, "#40514e");
  px(x + 42, y + 69, 5, 12, "#26302f");
  px(x + 60, y + 69, 5, 12, "#26302f");
  px(x - 20, y - 12, 150, 62, "#514234");
  px(x - 16, y - 16, 142, 48, "#a87850");
  px(x - 12, y - 12, 134, 40, "#ba8959");
  px(x + 20, y - 35, 62, 41, "#182122");
  px(x + 25, y - 30, 52, 30, active ? "#a9eee0" : "#668985");
  px(x + 29, y - 26, 44, 22, active ? "#d2fff1" : "#789995");
  if (active) {
    px(x + 33, y - 22, 16, 3, accent);
    px(x + 33, y - 16, 34, 2, "#4f8179");
    px(x + 33, y - 11, 25, 2, "#4f8179");
  }
  px(x + 47, y + 7, 22, 7, "#e5dfce");
  px(x + 43, y + 9, 30, 2, "#817c70");
  px(x + 79, y + 8, 7, 10, "#333e3c");
  px(x + 81, y + 9, 3, 3, "#d9c269");
  px(x + 92, y + 3, 18, 35, "#263130");
  px(x + 96, y + 7, 10, 18, "#3b4a48");
  px(x + 99, y + 29, 3, 3, active ? "#6ee0a0" : "#72817d");
  if (hasPhone) {
    px(x - 7, y + 3, 12, 21, "#283534");
    px(x - 5, y + 5, 8, 14, "#78b8c0");
  }
  px(x + 113, y + 5, 15, 17, "#54705c");
  px(x + 116, y - 5, 5, 13, "#528b5f");
  px(x + 108, y - 9, 12, 12, "#68a66f");
  px(x + 120, y - 8, 10, 11, "#3d8156");
  px(x - 9, y + 32, 8, 36, "#65482f");
  px(x + 111, y + 32, 8, 36, "#65482f");
}
const savedNeeds = (() => {
  try {
    return JSON.parse(localStorage.getItem("hermes-villa-needs") || "{}");
  } catch (e) {
    return {};
  }
})();
let lastFrame = 0, lastSave = 0, lastPanel = 0;
let editMode = false, editSelected = null, editDragging = false, editDragOff = { x: 0, y: 0 }, editSelectedStart = null;
const SCENE_OBJECTS = [
  { id: "monitor", name: "显示器", desc: "屏幕还亮着，阿默昨晚的调试日志没关", w: 52, h: 34, getDefault: (w, h) => {
    return { x: w * 0.08, y: h * 0.18 };
  }, collides: true, draw: (x, y) => {
    px(x, y, 52, 34, "#2a3333");
    px(x + 3, y + 3, 46, 28, "#5a8a84");
    px(x + 7, y + 7, 38, 18, "#a9eee0");
    px(x + 20, y + 30, 12, 4, "#4a5555");
    px(x + 16, y + 34, 20, 3, "#3a4545");
  } },
  { id: "coffee_machine", name: "咖啡机", desc: "老板说它坏了三次，第四次修好后就没坏过", w: 36, h: 46, getDefault: (w, h) => {
    return { x: w * 0.72, y: h * 0.28 };
  }, collides: true, draw: (x, y) => {
    px(x, y, 36, 46, "#303a3a");
    px(x + 5, y + 5, 26, 18, "#566d68");
    px(x + 10, y + 9, 16, 4, "#9ed0bf");
    px(x + 8, y + 28, 20, 12, "#171d1d");
    px(x + 13, y + 31, 10, 9, "#d7c3a0");
    px(x + 31, y + 20, 8, 18, "#43504d");
    px(x + 35, y + 23, 12, 5, "#6a7f78");
  } },
  { id: "computer_tower", name: "电脑主机", desc: "风扇声比人还吵，但没人敢拔", w: 28, h: 52, getDefault: (w, h) => {
    return { x: w * 0.06, y: h * 0.22 };
  }, collides: true, draw: (x, y) => {
    px(x, y, 28, 52, "#263130");
    px(x + 4, y + 6, 20, 18, "#3b4a48");
    px(x + 8, y + 10, 12, 10, "#62d49a");
    px(x + 6, y + 30, 16, 3, "#4a5a58");
    px(x + 10, y + 36, 8, 2, "#5a6a68");
    px(x + 12, y + 42, 4, 4, "#3a4a48");
  } },
  { id: "tea_table", name: "茶几", desc: "小研放竞品分析报告的地方", w: 64, h: 32, getDefault: (w, h) => {
    return { x: w * 0.42, y: h * 0.78 };
  }, collides: true, draw: (x, y) => {
    px(x, y, 64, 4, "#8b6b4a");
    px(x + 4, y + 4, 56, 24, "#a08060");
    px(x + 8, y + 8, 24, 16, "#c4a878");
    px(x + 38, y + 10, 18, 12, "#d4b888");
    px(x + 2, y + 28, 6, 4, "#6b4b2a");
    px(x + 56, y + 28, 6, 4, "#6b4b2a");
  } },
  { id: "aquarium", name: "鱼缸", desc: "锦鲤翻白眼是它唯一的表情", w: 200, h: 74, getDefault: (w, h) => {
    return { x: w * 0.735, y: h * 0.665 };
  }, collides: true, draw: (x, y) => {
    aquarium(x, y, 200, 74, performance.now());
  } },
  { id: "desk_default", name: "阿默工位", desc: "键盘缝里藏着三种颜色的键帽", w: 150, h: 62, getDefault: (w, h) => {
    return { x: w * 0.15 - 20, y: h * 0.34 - 12 };
  }, collides: true, draw: (x, y) => {
    desk(x, y, "default");
  } },
  { id: "desk_planner", name: "小韩工位", desc: "桌面永远比别人的整洁一个维度", w: 150, h: 62, getDefault: (w, h) => {
    return { x: w * 0.57 - 20, y: h * 0.34 - 12 };
  }, collides: true, draw: (x, y) => {
    desk(x, y, "planner");
  } },
  { id: "desk_researcher", name: "小研工位", desc: "抽屉里塞满了打印出来的论坛帖子", w: 150, h: 62, getDefault: (w, h) => {
    return { x: w * 0.15 - 20, y: h * 0.64 - 12 };
  }, collides: true, draw: (x, y) => {
    desk(x, y, "researcher");
  } },
  { id: "desk_writer", name: "小文工位", desc: "桌上养着一只柯基，工位不算工位", w: 150, h: 62, getDefault: (w, h) => {
    return { x: w * 0.57 - 20, y: h * 0.64 - 12 };
  }, collides: true, draw: (x, y) => {
    desk(x, y, "writer");
  } },
  { id: "breakbar", name: "水吧", desc: "咖啡机、制冰机、打奶泡设备——老板说这是公司的门面", w: 178, h: 88, getDefault: (w, h) => {
    return { x: w * 0.785, y: h * 0.495 };
  }, collides: true, draw: (x, y) => {
    breakBar(x, y, 178, 88, performance.now());
  } },
  { id: "microwave", name: "微波炉", desc: "水吧角落的小微波炉，员工热饭和吐司都靠它", w: 32, h: 36, getDefault: (w, h) => {
    var _a;
    const p = ((_a = SCENE_OBJECTS.find((o) => o.id === "breakbar")) == null ? void 0 : _a.getDefault(w, h)) || { x: w * 0.785, y: h * 0.495 };
    return { x: p.x + 128, y: p.y + 20 };
  }, collides: false, draw: (x, y, t) => {
    microwave(x, y, t || performance.now());
  } },
  { id: "meeting_table", name: "会议桌", desc: "每次站在这里讨论都觉得自己在演职场剧", w: 170, h: 100, getDefault: (w, h) => {
    return { x: w * 0.455, y: h * 0.535 };
  }, collides: true, draw: (x, y) => {
    px(x, y, 170, 100, "#4c6c6a");
    px(x + 5, y + 5, 160, 90, "#85aaa5");
    px(x - 10, y + 10, 10, 30, "#48605c");
    px(x + 170, y + 10, 10, 30, "#48605c");
    px(x + 50, y - 10, 70, 10, "#48605c");
    px(x + 50, y + 100, 70, 10, "#48605c");
  } },
  { id: "corgi", name: "柯基", desc: "小文的正式员工，工位在鱼缸旁边", w: 50, h: 30, getDefault: (w, h) => {
    return { x: w * 0.675, y: h * 0.735 };
  }, collides: false, draw: (x, y, t) => {
    drawOfficeCorgi(x, y, t, innerWidth < 700 ? 0.24 : 0.3, true);
  } },
  { id: "bookshelf", name: "书架", desc: "小研的纸质备份，电子化也没丢", w: 48, h: 72, getDefault: (w, h) => {
    return { x: w * 0.38, y: h * 0.16 };
  }, collides: true, draw: (x, y) => {
    px(x, y, 48, 72, "#6b4b2a");
    px(x + 4, y + 4, 40, 10, "#8b6b4a");
    px(x + 4, y + 20, 40, 10, "#8b6b4a");
    px(x + 4, y + 36, 40, 10, "#8b6b4a");
    px(x + 4, y + 52, 40, 10, "#8b6b4a");
    for (let shelf = 0; shelf < 4; shelf++) {
      const sy = y + 6 + shelf * 16;
      for (let b = 0; b < 5; b++) {
        const bh = 10 + (b * 3 + shelf * 5) % 4;
        px(x + 6 + b * 8, sy + 10 - bh, 6, bh, ["#c46f62", "#718c77", "#d4ad67", "#8b6b8a", "#6b8b8b"][(b + shelf) % 5]);
      }
    }
  } },
  { id: "plant", name: "盆栽", desc: "不知道谁养的，反正活着", w: 24, h: 32, getDefault: (w, h) => {
    return { x: w * 0.92, y: h * 0.82 };
  }, collides: true, draw: (x, y) => {
    px(x + 4, y + 18, 16, 14, "#8b6b4a");
    px(x + 2, y + 14, 20, 4, "#6b4b2a");
    px(x + 8, y, 8, 16, "#5d9669");
    px(x + 6, y - 6, 12, 10, "#4d9364");
    px(x + 10, y + 4, 4, 6, "#397b57");
  } }
];
function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh, margin = 8) {
  return !(ax + aw + margin < bx || bx + bw + margin < ax || ay + ah + margin < by || by + bh + margin < ay);
}
function checkCollision(objId, newX, newY, w, h) {
  for (const other of SCENE_OBJECTS) {
    if (other.id === objId || !other.collides) continue;
    const op = scenePositions[other.id];
    if (!op) continue;
    if (rectsOverlap(newX, newY, w, h, op.x, op.y, other.w, other.h)) {
      return other.name;
    }
  }
  return null;
}
let scenePositions = {};
function defaultScenePositions(w = canvas.clientWidth || 960, h = canvas.clientHeight || 600) {
  const defaults = {};
  for (const obj of SCENE_OBJECTS) {
    const def = obj.getDefault(w, h);
    defaults[obj.id] = { x: def.x, y: def.y };
  }
  return defaults;
}
function sanitizeScenePositions(input, w = canvas.clientWidth || 960, h = canvas.clientHeight || 600) {
  const safe = defaultScenePositions(w, h);
  if (!input || typeof input !== "object") return safe;
  const known = new Map(SCENE_OBJECTS.map((obj) => [obj.id, obj]));
  for (const [id, pos] of Object.entries(input)) {
    const obj = known.get(id);
    if (!obj || !pos) continue;
    const x = Number(pos.x), y = Number(pos.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const maxX = Math.max(0, w - obj.w), maxY = Math.max(0, h - obj.h);
    safe[id] = { x: Math.min(maxX, Math.max(0, x)), y: Math.min(maxY, Math.max(0, y)) };
  }
  return safe;
}
function setScenePositions(next, { persist = false } = {}) {
  scenePositions = sanitizeScenePositions(next);
  if (persist) saveScenePositionsToStorage();
}
function loadScenePositions() {
  try {
    const s = localStorage.getItem("hermes-scene-positions");
    if (s) setScenePositions(JSON.parse(s));
    else setScenePositions({});
  } catch (e) {
    setScenePositions({});
  }
  fetch("/api/scene/load").then((r) => r.ok ? r.json() : null).then((d) => {
    if (d && d.ok && d.scene) setScenePositions(d.scene, { persist: true });
  }).catch(() => {
  });
}
function saveScenePositionsToStorage() {
  try {
    localStorage.setItem("hermes-scene-positions", JSON.stringify(sanitizeScenePositions(scenePositions)));
  } catch (e) {
  }
}
loadScenePositions();
function getSceneObjBounds(obj, w, h) {
  const def = obj.getDefault(w, h);
  const pos = scenePositions[obj.id] || def;
  return { x: pos.x, y: pos.y, w: obj.w, h: obj.h };
}
function drawSceneObject(obj, w, h, t) {
  const pos = scenePositions[obj.id] || obj.getDefault(w, h);
  if (obj.draw) obj.draw(pos.x, pos.y, t);
}
function drawSceneObjects(w, h, t) {
  for (const obj of SCENE_OBJECTS) drawSceneObject(obj, w, h, t);
}
function sceneObjectSnapshot(w = canvas.clientWidth || 960, h = canvas.clientHeight || 600) {
  const office = {};
  for (const obj of SCENE_OBJECTS) {
    const b = getSceneObjBounds(obj, w, h);
    office[obj.id] = {
      id: obj.id,
      name: obj.name,
      scene: "office",
      x: Math.round(b.x),
      y: Math.round(b.y),
      w: obj.w,
      h: obj.h,
      cx: Math.round(b.x + obj.w / 2),
      cy: Math.round(b.y + obj.h / 2),
      category: obj.id.startsWith("desk_") ? "desk" : obj.id === "corgi" ? "pet" : obj.id === "aquarium" ? "aquarium" : obj.id === "breakbar" || obj.id === "coffee_machine" || obj.id === "microwave" ? "facility" : "object",
      owner: { desk_default: "阿默", desk_planner: "小韩", desk_researcher: "小研", desk_writer: "小文", corgi: "小文" }[obj.id] || "company",
      interactable: true,
      dynamic: obj.id === "corgi" || obj.id === "aquarium" || obj.id === "breakbar",
      affordances: {
        aquarium: ["observe", "feed_fish", "corgi_watch"],
        corgi: ["pet", "follow_writer", "play"],
        breakbar: ["drink_water", "make_coffee", "ice", "milk_foam"],
        coffee_machine: ["make_coffee"],
        microwave: ["heat_food", "toast"],
        meeting_table: ["meeting"]
      }[obj.id] || ["inspect"]
    };
  }
  Object.values(agents).forEach((a) => {
    if (!a || a.hidden) return;
    office[`employee_${a.id}`] = {
      id: `employee_${a.id}`,
      name: a.name || a.id,
      scene: "office",
      x: Math.round((a.x || 0) - 18),
      y: Math.round((a.y || 0) - 48),
      w: 36,
      h: 64,
      cx: Math.round(a.x || 0),
      cy: Math.round((a.y || 0) - 16),
      category: "employee",
      owner: a.id,
      interactable: true,
      dynamic: true,
      affordances: ["chat", "assign_task", "observe_status"]
    };
  });
  return { office };
}
let lastWorldReport = 0, lastWorldReportHash = "";
function reportWorldObjects(t, w, h) {
  if (t - lastWorldReport < 3500) return;
  lastWorldReport = t;
  const world_objects = sceneObjectSnapshot(w, h);
  const hash = JSON.stringify(world_objects);
  if (hash === lastWorldReportHash) return;
  lastWorldReportHash = hash;
  fetch("/api/world/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ world_objects })
  }).catch(() => {
  });
}
function drawSelectionBox(w, h, t) {
  if (!editMode || !editSelected) return;
  const obj = SCENE_OBJECTS.find((o) => o.id === editSelected);
  if (!obj) return;
  const b = getSceneObjBounds(obj, w, h);
  const blocked = !!checkCollision(editSelected, b.x, b.y, obj.w, obj.h);
  drawSceneObject(obj, w, h, t);
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = blocked ? "#e85f54" : "#ffffff";
  ctx.lineWidth = 2;
  ctx.shadowColor = blocked ? "rgba(232,95,84,0.7)" : "rgba(255,255,255,0.6)";
  ctx.shadowBlur = 8;
  ctx.strokeRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
  ctx.shadowBlur = 0;
  ctx.setLineDash([]);
  ctx.textAlign = "center";
  const lh = 14;
  const nameY = b.y - lh - 6;
  const descLine = obj.desc ? obj.desc.slice(0, 18) : "";
  const nameTW = ctx.measureText(obj.name).width + 16;
  const descTW = descLine ? ctx.measureText(descLine).width + 16 : 0;
  const badgeW = Math.max(nameTW, descTW);
  const badgeH = obj.desc ? lh * 2 + 4 : lh;
  const bx2 = b.x + b.w / 2 - badgeW / 2;
  const by2 = nameY - badgeH + lh + 2;
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.strokeStyle = "#4a7a6a";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(bx2, by2, badgeW, badgeH, 4) : ctx.rect(bx2, by2, badgeW, badgeH);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#1a2429";
  ctx.font = "bold 11px Microsoft YaHei";
  ctx.fillText(obj.name, b.x + b.w / 2, by2 + lh - 1);
  if (descLine) {
    ctx.font = "9px Microsoft YaHei";
    ctx.fillStyle = "#5a6a68";
    ctx.fillText(descLine, b.x + b.w / 2, by2 + lh + 9);
  }
  ctx.textAlign = "left";
  ctx.restore();
}
function hitTestSceneObjects(mx, my, w, h) {
  for (let i = SCENE_OBJECTS.length - 1; i >= 0; i--) {
    const obj = SCENE_OBJECTS[i];
    const b = getSceneObjBounds(obj, w, h);
    if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) return obj.id;
  }
  return null;
}
let collisionWarning = "";
let collisionWarnUntil = 0;
function selectionBlocked() {
  if (!editSelected) return false;
  const obj = SCENE_OBJECTS.find((o) => o.id === editSelected);
  const pos = obj && scenePositions[editSelected];
  return !!(obj && pos && checkCollision(editSelected, pos.x, pos.y, obj.w, obj.h));
}
function syncMobileEditUi() {
  var _a, _b;
  document.body.classList.toggle("mobile-editing", editMode);
  document.body.classList.toggle("mobile-edit-selected", editMode && !!editSelected);
  (_a = document.getElementById("mobileEditCommit")) == null ? void 0 : _a.classList.toggle("blocked", selectionBlocked());
  (_b = document.getElementById("mobileEditBtn")) == null ? void 0 : _b.classList.toggle("active", editMode);
}
function revertCurrentEditSelection(message = "已撤销当前物品移动") {
  if (!(editSelectedStart == null ? void 0 : editSelectedStart.id)) return false;
  scenePositions[editSelectedStart.id] = { x: editSelectedStart.x, y: editSelectedStart.y };
  editSelected = null;
  editSelectedStart = null;
  editDragging = false;
  collisionWarning = "";
  syncMobileEditUi();
  document.querySelector("#sceneTip").textContent = message;
  return true;
}
async function persistScenePositions() {
  const clean = sanitizeScenePositions(scenePositions);
  setScenePositions(clean, { persist: true });
  const resp = await fetch("/api/scene/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scene: clean })
  });
  if (!resp.ok) {
    let detail = "";
    try {
      detail = (await resp.json()).error || resp.statusText;
    } catch (e) {
      detail = resp.statusText;
    }
    throw new Error(detail || `HTTP ${resp.status}`);
  }
  return clean;
}
async function commitCurrentEditSelection() {
  if (!editSelected) return false;
  if (selectionBlocked()) {
    document.querySelector("#sceneTip").textContent = "当前位置会重叠，先移到可放置区域再保存";
    return false;
  }
  await persistScenePositions();
  editSelected = null;
  editSelectedStart = null;
  editDragging = false;
  collisionWarning = "";
  syncMobileEditUi();
  document.querySelector("#sceneTip").textContent = "当前物品位置已保存，办公室已实时生效";
  return true;
}
function rememberEditStart(id, w, h) {
  const obj = SCENE_OBJECTS.find((o) => o.id === id);
  if (!obj) {
    editSelectedStart = null;
    return;
  }
  const b = getSceneObjBounds(obj, w, h);
  editSelectedStart = { id, x: b.x, y: b.y };
}
function setEditMode(next) {
  var _a;
  editMode = !!next;
  if (editMode) {
    currentRoom = "office";
    cameraMode = "office";
    neighborhood = false;
    document.querySelectorAll(".camera button").forEach((b) => b.classList.toggle("active", b.dataset.camera === "office"));
  }
  if (!editMode) {
    editSelected = null;
    editDragging = false;
    editSelectedStart = null;
    collisionWarning = "";
  }
  document.getElementById("editBar").classList.toggle("visible", editMode);
  document.getElementById("editToggle").classList.toggle("active", editMode);
  document.getElementById("editCancel").classList.toggle("active", editMode);
  (_a = document.getElementById("editFab")) == null ? void 0 : _a.classList.toggle("active", editMode);
  if (document.getElementById("editFab")) document.getElementById("editFab").textContent = editMode ? "完成编辑" : "编辑布局";
  canvas.style.cursor = editMode ? "grab" : "default";
  syncMobileEditUi();
  updateRoomUI();
  document.querySelector("#sceneTip").textContent = editMode ? "装修开始了——点一个东西，拖到想去的位置" : "点击员工聊天，点工位看他忙啥";
}
canvas.addEventListener("mousedown", (e) => {
  if (!editMode) return;
  collisionWarning = "";
  const p = canvasPointFromClient(e.clientX, e.clientY), mx = p.x, my = p.y;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const hit = hitTestSceneObjects(mx, my, w, h);
  if (hit) {
    editSelected = hit;
    rememberEditStart(hit, w, h);
    editDragging = true;
    const obj = SCENE_OBJECTS.find((o) => o.id === hit);
    const b = getSceneObjBounds(obj, w, h);
    editDragOff.x = mx - b.x;
    editDragOff.y = my - b.y;
    e.preventDefault();
  } else {
    editSelected = null;
    editSelectedStart = null;
  }
  syncMobileEditUi();
});
canvas.addEventListener("mousemove", (e) => {
  if (!editMode || !editDragging || !editSelected) return;
  const p = canvasPointFromClient(e.clientX, e.clientY), mx = p.x, my = p.y;
  const newX = mx - editDragOff.x, newY = my - editDragOff.y;
  const obj = SCENE_OBJECTS.find((o) => o.id === editSelected);
  if (obj) {
    const collideWith = checkCollision(editSelected, newX, newY, obj.w, obj.h);
    if (collideWith) {
      collisionWarning = "这里放不下，会挡住 " + collideWith + " 的路";
      collisionWarnUntil = Date.now() + 2e3;
    } else {
      collisionWarning = "";
    }
  }
  scenePositions[editSelected] = { x: newX, y: newY };
  syncMobileEditUi();
  e.preventDefault();
});
canvas.addEventListener("mouseup", () => {
  editDragging = false;
});
canvas.addEventListener("mouseleave", () => {
  editDragging = false;
});
canvas.addEventListener("touchstart", (e) => {
  if (!editMode) return;
  collisionWarning = "";
  const t = e.touches[0], p = canvasPointFromClient(t.clientX, t.clientY);
  const mx = p.x, my = p.y;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const hit = hitTestSceneObjects(mx, my, w, h);
  if (hit) {
    editSelected = hit;
    rememberEditStart(hit, w, h);
    editDragging = true;
    const obj = SCENE_OBJECTS.find((o) => o.id === hit);
    const b = getSceneObjBounds(obj, w, h);
    editDragOff.x = mx - b.x;
    editDragOff.y = my - b.y;
    e.preventDefault();
  } else {
    editSelected = null;
    editSelectedStart = null;
  }
  syncMobileEditUi();
}, { passive: false });
canvas.addEventListener("touchmove", (e) => {
  if (!editMode || !editDragging || !editSelected) return;
  const t = e.touches[0], p = canvasPointFromClient(t.clientX, t.clientY);
  const mx = p.x, my = p.y;
  const newX = mx - editDragOff.x, newY = my - editDragOff.y;
  const obj = SCENE_OBJECTS.find((o) => o.id === editSelected);
  if (obj) {
    const collideWith = checkCollision(editSelected, newX, newY, obj.w, obj.h);
    if (collideWith) {
      collisionWarning = "这里放不下，会挡住 " + collideWith + " 的路";
      collisionWarnUntil = Date.now() + 2e3;
    } else {
      collisionWarning = "";
    }
  }
  scenePositions[editSelected] = { x: newX, y: newY };
  syncMobileEditUi();
  e.preventDefault();
}, { passive: false });
canvas.addEventListener("touchend", () => {
  editDragging = false;
});
let officeTouch = { mode: "", lastX: 0, lastY: 0, dist: 0, scale: 1 };
function touchDistance(a, b) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}
function stagePointFromTouch(t) {
  const r = canvas.parentElement.getBoundingClientRect();
  return { x: t.clientX - r.left, y: t.clientY - r.top };
}
canvas.addEventListener("touchstart", (e) => {
  if (!isOfficeViewportActive() || currentRoom === "game") return;
  if (editMode && editDragging) return;
  if (e.touches.length === 2) {
    officeTouch.mode = "pinch";
    officeTouch.dist = touchDistance(e.touches[0], e.touches[1]);
    officeTouch.scale = officeView.scale;
    e.preventDefault();
    return;
  }
  if (e.touches.length === 1) {
    officeTouch.mode = "pan";
    officeTouch.lastX = e.touches[0].clientX;
    officeTouch.lastY = e.touches[0].clientY;
  }
}, { passive: false });
canvas.addEventListener("touchmove", (e) => {
  if (!isOfficeViewportActive() || currentRoom === "game") return;
  if (editMode && editDragging) return;
  if (officeTouch.mode === "pinch" && e.touches.length === 2) {
    const before = officeView.scale;
    const next = Math.min(officeView.max, Math.max(officeView.min, officeTouch.scale * (touchDistance(e.touches[0], e.touches[1]) / (officeTouch.dist || 1))));
    const p1 = stagePointFromTouch(e.touches[0]), p2 = stagePointFromTouch(e.touches[1]);
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const wx = (mid.x - officeView.x) / (before || 1), wy = (mid.y - officeView.y) / (before || 1);
    officeView.scale = next;
    officeView.x = mid.x - wx * next;
    officeView.y = mid.y - wy * next;
    applyOfficeView();
    e.preventDefault();
    return;
  }
  if (officeTouch.mode === "pan" && e.touches.length === 1) {
    const t = e.touches[0], dx = t.clientX - officeTouch.lastX, dy = t.clientY - officeTouch.lastY;
    officeTouch.lastX = t.clientX;
    officeTouch.lastY = t.clientY;
    officeView.x += dx;
    officeView.y += dy;
    applyOfficeView();
    e.preventDefault();
  }
}, { passive: false });
canvas.addEventListener("touchend", (e) => {
  if (!isOfficeViewportActive()) return;
  if (e.touches.length === 0) officeTouch.mode = "";
  else if (e.touches.length === 1) {
    officeTouch.mode = "pan";
    officeTouch.lastX = e.touches[0].clientX;
    officeTouch.lastY = e.touches[0].clientY;
  }
}, { passive: false });
document.getElementById("editToggle").addEventListener("click", () => {
  setEditMode(!editMode);
});
document.getElementById("editFab").addEventListener("click", () => {
  document.getElementById("editToggle").click();
});
document.getElementById("editCancel").addEventListener("click", () => {
  collisionWarning = "";
  if (revertCurrentEditSelection()) return;
  setEditMode(false);
  document.querySelector("#sceneTip").textContent = "已退出编辑模式";
});
document.getElementById("editSave").addEventListener("click", async () => {
  try {
    if (editSelected) await commitCurrentEditSelection();
    else {
      await persistScenePositions();
      document.querySelector("#sceneTip").textContent = "布局已保存，当前画面已实时生效";
    }
  } catch (err) {
    document.querySelector("#sceneTip").textContent = "保存出错：" + err.message;
  }
});
document.getElementById("editReset").addEventListener("click", () => {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  for (const obj of SCENE_OBJECTS) {
    const def = obj.getDefault(w, h);
    scenePositions[obj.id] = { x: def.x, y: def.y };
  }
  document.querySelector("#sceneTip").textContent = "已恢复出厂设置——小韩的默认布局回来了，再拖一次试试";
  setTimeout(() => {
    if (!editMode) document.querySelector("#sceneTip").textContent = "点击员工聊天，点工位看他忙啥";
  }, 2e3);
});
function drawAgent(a, t) {
  const r = roles[a.id], x = a.x, y = a.y, bob = a.moving ? Math.sin(t / 110 + a.seed) * 1.5 : 0, seated = ["working", "deskIdle", "phone", "orderFood"].includes(a.mode);
  ctx.save();
  ctx.translate(x, y + bob);
  if (seated) {
    px(-11, 7, 24, 24, r.color);
    px(-10, -12, 22, 20, r.skin);
    px(-11, -15, 24, 11, r.hair);
    px(-15, 2, 7, 5, r.skin);
    px(11, 2, 7, 5, r.skin);
    px(-10, 27, 8, 6, "#20292a");
    px(5, 27, 8, 6, "#20292a");
    if (a.mode === "working") {
      const tap = Math.floor(t / 260) % 2;
      px(-15 + tap, 0, 7, 4, r.skin);
      px(11 - tap, 0, 7, 4, r.skin);
    }
    if (a.mode === "phone" || a.mode === "orderFood") {
      px(13, -1, 7, 12, "#172124");
      px(14, 0, 5, 8, "#7fd6e4");
    }
  } else {
    px(-10, 20, 8, 12, "#202829");
    px(4, 20, 8, 12, "#202829");
    px(-12, 1, 26, 22, r.color);
    px(-10, -15, 22, 19, r.skin);
    px(-11, -17, 24, 8, r.hair);
    px(-7, -8, 3, 3, "#182024");
    px(5, -8, 3, 3, "#182024");
    if (["water", "tea", "pickupTea"].includes(a.mode)) {
      px(13, 2, 7, 10, a.mode === "water" ? "#78c9d3" : "#d4a56d");
    }
    if (["pickupFood", "eat"].includes(a.mode)) {
      px(13, 2, 12, 10, "#d17b59");
    }
  }
  const icon = { restroom: "WC", water: "水", tea: "茶", pickupTea: "茶", orderFood: "外卖", pickupFood: "餐", eat: "用餐", rest: "休息" }[a.mode];
  if (icon) {
    ctx.fillStyle = "#fffdf2";
    ctx.font = "bold 9px Microsoft YaHei";
    ctx.textAlign = "center";
    px(-18, -34, 36, 14, "#49645e");
    ctx.fillStyle = "#fff";
    ctx.fillText(icon, 0, -24);
    ctx.textAlign = "left";
  }
  if (a.status === "blocked") {
    ctx.fillStyle = "#db6657";
    ctx.font = "bold 16px monospace";
    ctx.fillText("!", -3, -23);
  }
  if (selected === a.id) {
    ctx.strokeStyle = "#efbd4e";
    ctx.lineWidth = 2;
    ctx.strokeRect(-19, -22, 40, 57);
  }
  ctx.restore();
  ctx.fillStyle = "#263432ee";
  ctx.fillRect(x - 43, y + 38, 86, 19);
  ctx.fillStyle = "#f5f3e8";
  ctx.font = "11px Microsoft YaHei";
  ctx.textAlign = "center";
  ctx.fillText(a.name.split(" ").slice(-1)[0], x, y + 51);
  ctx.textAlign = "left";
}
function cleanSpeechText(text) {
  return String(text || "").replace(/\[CHAT\]\s*/g, "").replace(/\s+/g, " ").trim();
}
function englishLeak(text) {
  const cleaned = cleanSpeechText(text);
  const asciiLetters = (cleaned.match(/[A-Za-z]/g) || []).length;
  const cjkChars = (cleaned.match(/[\u4e00-\u9fff]/g) || []).length;
  return asciiLetters >= 18 && asciiLetters > cjkChars * 2;
}
function wrapSpeechLines(text, maxWidth, maxLines) {
  const chars = [...cleanSpeechText(text)];
  const lines = [];
  let current = "";
  for (const ch of chars) {
    const next = current + ch;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
      continue;
    }
    if (current) {
      lines.push(current);
      current = ch.trimStart();
    } else {
      lines.push(ch);
      current = "";
    }
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && current) lines.push(current);
  const used = lines.join("").length;
  if (used < chars.length && lines.length) {
    let tail = lines[lines.length - 1].replace(/[。！？，、；：,.!? ]+$/, "");
    while (tail && ctx.measureText(tail + "…").width > maxWidth) tail = tail.slice(0, -1);
    lines[lines.length - 1] = (tail || lines[lines.length - 1].slice(0, 1)) + "…";
  }
  return lines.filter(Boolean);
}
function drawSpeech(a, t, w) {
  if (!a.speech) return;
  if (t > a.speech.until) {
    a.speech = null;
    return;
  }
  ctx.font = "11px Microsoft YaHei";
  const lines = wrapSpeechLines(a.speech.text, 176, 3);
  if (!lines.length) return;
  const textWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
  const bw = Math.min(Math.ceil(textWidth) + 20, w - 16);
  const bh = 16 + lines.length * 15;
  const bx = Math.max(8, Math.min(w - bw - 8, a.x - bw / 2));
  const by = Math.max(8, a.y - 76 - bh);
  px(bx, by, bw, bh, "#fffdf3");
  px(bx + 8, by + bh, 8, 7, "#fffdf3");
  ctx.strokeStyle = "#3d5551";
  ctx.lineWidth = 2;
  ctx.strokeRect(bx, by, bw, bh);
  ctx.fillStyle = "#273835";
  lines.forEach((line, i) => ctx.fillText(line, bx + 8, by + 18 + i * 15));
}
function homeOf(a, w, h) {
  const deskId = { default: "desk_default", planner: "desk_planner", researcher: "desk_researcher", writer: "desk_writer" }[a.id];
  const deskObj = SCENE_OBJECTS.find((o) => o.id === deskId);
  const deskPos = deskId && (scenePositions[deskId] || (deskObj == null ? void 0 : deskObj.getDefault(w, h)));
  if (deskPos) return [deskPos.x + 66, deskPos.y + 60];
  const s = spots[a.id];
  return [s[0] * w + 46, s[1] * h + 48];
}
function initNeeds(a, i) {
  if (a.needs) return;
  const old = savedNeeds[a.id];
  a.needs = old || { fatigue: 18 + i * 4, hunger: 20 + i * 3, thirst: 18 + i * 5, mood: 78 - i * 3, bladder: 12 + i * 5 };
  a.phase = "desk";
  a.phaseUntil = 0;
}
function finishPhase(a, t) {
  const n = a.needs;
  if (a.phase === "orderFood") {
    a.phase = "pickupFood";
    a.phaseUntil = t + 45e3;
    return;
  }
  if (a.phase === "pickupFood") {
    a.phase = "eat";
    a.phaseUntil = t + 28e3;
    return;
  }
  if (a.phase === "eat") {
    n.hunger = Math.max(4, n.hunger - 72);
    n.mood = Math.min(100, n.mood + 8);
  }
  if (a.phase === "water") n.thirst = Math.max(3, n.thirst - 62);
  if (a.phase === "tea" || a.phase === "pickupTea") {
    n.thirst = Math.max(5, n.thirst - 48);
    n.mood = Math.min(100, n.mood + 12);
  }
  if (a.phase === "rest") {
    n.fatigue = Math.max(8, n.fatigue - 46);
    n.mood = Math.min(100, n.mood + 7);
  }
  if (a.phase === "phone") n.mood = Math.min(100, n.mood + 16);
  if (a.phase === "restroom") n.bladder = Math.max(2, n.bladder - 85);
  a.phase = "return";
  a.phaseUntil = 0;
}
function chooseNeedAction(a, t) {
  const n = a.needs;
  if (n.bladder > 78) a.phase = "restroom";
  else if (n.hunger > 72) a.phase = "orderFood";
  else if (n.thirst > 67) a.phase = Math.random() < 0.38 ? "tea" : "water";
  else if (n.fatigue > 72) a.phase = "rest";
  else if (n.mood < 42) a.phase = Math.random() < 0.55 ? "phone" : "tea";
  else return false;
  a.phaseUntil = t + 22e3 + Math.random() * 18e3;
  return true;
}
function target(a, w, h, t) {
  const home = homeOf(a, w, h), status = a.status;
  a.hidden = false;
  if (a.presence === "home" || a.presence === "home_remote") {
    a.hidden = true;
    a.mode = homeActivity(a);
    return home;
  }
  if (neighborhood) {
    a.hidden = true;
    return home;
  }
  if (a.presence === "lunch") {
    a.mode = "eat";
    const offset = { default: [-0.04, 0], planner: [0.04, 0], researcher: [-0.04, 0.04], writer: [0.04, 0.04] }[a.id];
    return [w * (0.85 + offset[0]), h * (0.8 + offset[1])];
  }
  if (a.phase !== "desk" && a.phase !== "return" && t >= a.phaseUntil) finishPhase(a, t);
  if (a.phase === "desk") chooseNeedAction(a, t);
  if (a.phase === "phone" || a.phase === "orderFood") {
    a.mode = a.phase;
    return home;
  }
  if (a.phase === "water" || a.phase === "tea" || a.phase === "pickupTea") {
    a.mode = a.phase;
    return [w * 0.9, h * 0.43];
  }
  if (a.phase === "rest") {
    a.mode = "rest";
    return [w * 0.85, h * 0.81];
  }
  if (a.phase === "restroom") {
    a.mode = "restroom";
    return [w * 0.86, Math.max(75, h * 0.13)];
  }
  if (a.phase === "pickupFood") {
    a.mode = "pickupFood";
    return [w * 0.055, Math.max(90, h * 0.18)];
  }
  if (a.phase === "eat") {
    a.mode = "eat";
    return [w * 0.82, h * 0.8];
  }
  if (a.phase === "return") {
    a.mode = "walk";
    if (Math.hypot(home[0] - a.x, home[1] - a.y) < 4) a.phase = "desk";
    return home;
  }
  if (status === "meeting") {
    a.mode = "meeting";
    const seat = { default: [-0.05, 0.02], planner: [0.05, -0.02], researcher: [-0.05, -0.03], writer: [0.05, 0.03] }[a.id];
    return [w * (0.505 + seat[0]), h * (0.56 + seat[1])];
  }
  a.mode = status === "working" ? "working" : status === "blocked" ? "blocked" : "deskIdle";
  return home;
}
function updateNeeds(a, dt) {
  const n = a.needs, working = a.status === "working", home = a.presence === "home";
  n.hunger = Math.min(100, n.hunger + dt * (home ? 4e-3 : working ? 0.013 : 9e-3));
  n.thirst = Math.min(100, n.thirst + dt * (home ? 7e-3 : working ? 0.022 : 0.015));
  n.fatigue = Math.max(0, Math.min(100, n.fatigue + dt * (home ? -0.018 : working ? 9e-3 : 4e-3)));
  n.bladder = Math.min(100, n.bladder + dt * 0.014);
  const strain = Math.max(n.hunger, n.thirst, n.fatigue);
  n.mood = Math.max(5, Math.min(100, n.mood + dt * (home ? 6e-3 : strain > 70 ? -0.018 : 2e-3)));
}
let joystickActive = false, joystickDir = { x: 0, y: 0 }, gameJumpPressed = false, gameInteractPressed = false;
let touchStartPos = null;
function leaveRoom(reason = "button") {
  var _a;
  currentRoom = "office";
  cameraMode = "auto";
  joystickDir = { x: 0, y: 0 };
  gameJumpPressed = false;
  gameInteractPressed = false;
  touchStartPos = null;
  (_a = document.getElementById("virtualJoystick")) == null ? void 0 : _a.classList.remove("active");
  document.querySelectorAll(".camera button").forEach((b) => b.classList.toggle("active", b.dataset.camera === "auto"));
  updateRoomUI();
  const tip = document.getElementById("sceneTip");
  if (tip) tip.textContent = reason === "escape" ? "已用返回键回到办公室" : "已回到办公室";
}
function goCompanyHome() {
  leaveRoom("home");
  if (document.body.classList.contains("show-office")) toggleOffice(false);
}
function setupJoystick(canvas2) {
  const joystick = document.getElementById("virtualJoystick");
  const thumb = document.getElementById("joystickThumb");
  let startX = 0, startY = 0;
  canvas2.addEventListener("touchstart", (e) => {
    if (currentRoom !== "game") return;
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    touchStartPos = { x: touch.clientX, y: touch.clientY };
  }, { passive: true });
  canvas2.addEventListener("touchmove", (e) => {
    if (currentRoom !== "game" || !touchStartPos) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartPos.x;
    const dy = touch.clientY - touchStartPos.y;
    const dist = Math.min(Math.hypot(dx, dy), 30);
    const angle = Math.atan2(dy, dx);
    joystickDir.x = Math.cos(angle) * (dist / 30);
    joystickDir.y = Math.sin(angle) * (dist / 30);
    if (dist > 5) {
      joystick.classList.add("active");
      thumb.style.transform = "translate(calc(-50% + " + dist * Math.cos(angle) + "px), calc(-50% + " + dist * Math.sin(angle) + "px))";
    }
  }, { passive: true });
  canvas2.addEventListener("touchend", () => {
    if (currentRoom !== "game") return;
    touchStartPos = null;
    joystick.classList.remove("active");
    thumb.style.transform = "translate(-50%,-50%)";
    joystickDir = { x: 0, y: 0 };
  });
  const keys = {};
  document.addEventListener("keydown", (e) => {
    keys[e.key] = true;
    if (e.key === "Escape" || e.key === "Backspace") {
      if (currentRoom !== "office") {
        leaveRoom("escape");
        e.preventDefault();
        return;
      }
    }
    if (e.key === " " || e.key === "ArrowUp") {
      gameJumpPressed = true;
      e.preventDefault();
    }
    if (e.key === "e" || e.key === "Enter") {
      gameInteractPressed = true;
      e.preventDefault();
    }
    if (currentRoom === "game") {
      if (e.key === "w" || e.key === "ArrowUp") joystickDir.y = -1;
      if (e.key === "s" || e.key === "ArrowDown") joystickDir.y = 1;
      if (e.key === "a" || e.key === "ArrowLeft") joystickDir.x = -1;
      if (e.key === "d" || e.key === "ArrowRight") joystickDir.x = 1;
    }
  });
  document.addEventListener("keyup", (e) => {
    keys[e.key] = false;
    if (e.key === " " || e.key === "ArrowUp") gameJumpPressed = false;
    if (e.key === "e" || e.key === "Enter") gameInteractPressed = false;
    if (currentRoom === "game") {
      if (["w", "ArrowUp"].includes(e.key) && joystickDir.y < 0) joystickDir.y = 0;
      if (["s", "ArrowDown"].includes(e.key) && joystickDir.y > 0) joystickDir.y = 0;
      if (["a", "ArrowLeft"].includes(e.key) && joystickDir.x < 0) joystickDir.x = 0;
      if (["d", "ArrowRight"].includes(e.key) && joystickDir.x > 0) joystickDir.x = 0;
    }
  });
}
function updateRoomUI() {
  const indicator = document.getElementById("gameIndicator");
  const tip = document.getElementById("sceneTip");
  const fab = document.getElementById("editFab");
  const roomBack = document.getElementById("roomBack");
  const roomHome = document.getElementById("roomHome");
  const gameActions = document.getElementById("gameActions");
  const inRoom = currentRoom !== "office";
  roomBack == null ? void 0 : roomBack.classList.toggle("visible", inRoom);
  roomHome == null ? void 0 : roomHome.classList.toggle("visible", inRoom);
  gameActions == null ? void 0 : gameActions.classList.toggle("active", currentRoom === "game");
  if (currentRoom === "game") {
    indicator.classList.add("visible");
    fab.style.display = "none";
    if (tip) tip.textContent = "厕所/走廊模式：左上角“返回办公室”、Esc 或 × 都能退出。";
  } else if (currentRoom === "boss") {
    indicator.classList.add("visible");
    fab.style.display = "none";
    if (tip) tip.textContent = "老板办公室：左上角“返回办公室”、Esc 或 × 都能退出。";
  } else {
    indicator.classList.remove("visible");
    fab.style.display = "";
    const isInEditMode = editMode;
    if (tip) tip.textContent = isInEditMode ? "装修开始了——点一个东西，拖到想去的位置" : "点击员工聊天，点工位看他忙啥";
  }
  const camButtons = document.querySelectorAll(".camera button");
  camButtons.forEach((b) => {
    if (currentRoom === "boss" && b.dataset.camera === "boss") b.classList.add("active");
    else if (currentRoom === "boss") b.classList.remove("active");
  });
}
