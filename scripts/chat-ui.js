var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q;
let _mobileRenderedChatKey = "";
const READ_STATE_KEY = "hermes-mobile-read-state-v1";
let readState = loadReadState();
function loadReadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(READ_STATE_KEY) || "{}");
    return {
      threads: parsed && typeof parsed.threads === "object" ? parsed.threads : {},
      initialized: !!(parsed == null ? void 0 : parsed.initialized)
    };
  } catch (err) {
    return { threads: {}, initialized: false };
  }
}
function saveReadState() {
  try {
    localStorage.setItem(READ_STATE_KEY, JSON.stringify(readState));
  } catch (err) {
  }
}
function markThreadSeen(threadKey, ts = 0) {
  const nextTs = Number(ts || 0);
  if (!threadKey || !nextTs) return;
  if (Number(readState.threads[threadKey] || 0) >= nextTs) return;
  readState.threads[threadKey] = nextTs;
  saveReadState();
}
function seenThreadTs(threadKey) {
  return Number(readState.threads[threadKey] || 0);
}
function unreadCountForThread(threadKey, items) {
  const seenTs = seenThreadTs(threadKey);
  return (items || []).filter((item) => Number((item == null ? void 0 : item.created) || 0) > seenTs).length;
}
function privateMessageSeenTs(message) {
  return Number((message == null ? void 0 : message.completed) || (message == null ? void 0 : message.created) || 0);
}
function latestPrivateReplyTs(agentId) {
  const items = ((state == null ? void 0 : state.messages) || []).filter((msg) => msg.mode !== "group" && msg.agent === agentId && privateReplyText(msg));
  return Math.max(0, ...items.map((item) => privateMessageSeenTs(item)));
}
function unreadPrivateCount(agentId) {
  const threadKey = `private:${agentId}`;
  const seenTs = seenThreadTs(threadKey);
  return (((state == null ? void 0 : state.messages) || []).filter((msg) => msg.mode !== "group" && msg.agent === agentId && privateReplyText(msg)).filter((msg) => privateMessageSeenTs(msg) > seenTs)).length;
}
function primeReadState() {
  if (readState.initialized || !(state == null ? void 0 : state.messages)) return;
  const privateMessages = ((state == null ? void 0 : state.messages) || []).filter((msg) => msg.mode !== "group");
  ((state == null ? void 0 : state.agents) || []).forEach((agent) => {
    const latest = privateMessages.filter((msg) => msg.agent === agent.id && privateReplyText(msg)).sort((a, b) => privateMessageSeenTs(b) - privateMessageSeenTs(a))[0];
    if (latest) readState.threads[`private:${agent.id}`] = privateMessageSeenTs(latest);
  });
  const groupMessages = ((state == null ? void 0 : state.messages) || []).filter((msg) => isRenderableGroupMessage(msg) && (msg.conversation || "team") === "team");
  const feedItems = ((state == null ? void 0 : state.team_feed) || []).filter((item) => (item == null ? void 0 : item.text) && !uiNoise(item.text));
  const latestGroupTs = Math.max(
    0,
    ...groupMessages.map((msg) => msg.created || 0),
    ...feedItems.map((item) => item.created || 0)
  );
  if (latestGroupTs) readState.threads["group:team"] = latestGroupTs;
  readState.initialized = true;
  saveReadState();
}
function latestGroupThreadTs() {
  const groupMessages = ((state == null ? void 0 : state.messages) || []).filter((msg) => isRenderableGroupMessage(msg) && (msg.conversation || "team") === "team");
  const feedItems = ((state == null ? void 0 : state.team_feed) || []).filter((item) => (item == null ? void 0 : item.text) && !uiNoise(item.text));
  return Math.max(
    0,
    ...groupMessages.map((msg) => msg.created || 0),
    ...feedItems.map((item) => item.created || 0)
  );
}
function companyPendingCount() {
  var _a2, _b2;
  const company = (state == null ? void 0 : state.company) || {};
  const notices = ((_a2 = company.pending_notices) == null ? void 0 : _a2.length) ? company.pending_notices : [];
  const roles = ((_b2 = company.open_roles) == null ? void 0 : _b2.length) ? company.open_roles : [];
  const tasks = (company.project_tasks || []).filter((task) => String(task.status || "").toLowerCase() !== "done");
  return notices.length + roles.length + tasks.length;
}
function setBadgeCount(node, count) {
  if (!node) return;
  const safeCount = Math.max(0, Number(count || 0));
  node.textContent = String(Math.min(99, safeCount));
  node.style.display = safeCount > 0 ? "" : "none";
}
function msgTime(ts, withSeconds = false) {
  if (!ts) return "";
  return new Date(ts * 1e3).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: withSeconds ? "2-digit" : void 0 });
}
function applyBuildVersion() {
  const version = window.__hermesVersion || "unknown";
  const desktop = document.querySelector("#buildVersion");
  const mobile = document.querySelector("#mobileBuildVersion");
  if (desktop) desktop.textContent = version;
  if (mobile) mobile.textContent = version;
}
function currentWorldDate() {
  var _a2;
  if (worldBaseMs && worldReceivedMs) return new Date(worldBaseMs + (Date.now() - worldReceivedMs));
  const iso = (_a2 = state == null ? void 0 : state.world) == null ? void 0 : _a2.iso;
  const parsed = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(parsed) ? new Date(parsed) : /* @__PURE__ */ new Date();
}
function worldClockText(withSeconds = false) {
  return currentWorldDate().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: withSeconds ? "2-digit" : void 0 });
}
function updateWorldClockUi() {
  var _a2, _b2;
  if (!(state == null ? void 0 : state.world)) return;
  const clock = worldClockText(true);
  const worldEl = document.querySelector("#world");
  if (worldEl) worldEl.textContent = `${clock} · ${state.world.weather || ""} · ${state.world.label || ""}`;
  const mobileClock = document.querySelector("#mobileClock");
  if (mobileClock) mobileClock.textContent = clock;
  const summary = document.querySelector("#mobileCompanySummary");
  if (summary) summary.textContent = `${((_a2 = state.company) == null ? void 0 : _a2.studio_name) || "Hermes Pixel Works"} 正在推进「${((_b2 = state.board) == null ? void 0 : _b2.name) || "暂无项目"}」，当前为 ${clock} · ${state.world.next || "等待下一阶段"}`;
}
setInterval(updateWorldClockUi, 1e3);
applyBuildVersion();
function syncFeed(feed) {
  const items = (feed || []).slice().sort((a, b) => (a.created || 0) - (b.created || 0));
  if (!items.length) return;
  if (!feedInitialized) {
    feedInitialized = true;
    lastFeedCreated = Math.max(...items.map((item) => item.created || 0));
    return;
  }
  items.forEach((item) => {
    if (uiNoise(item.text)) return;
    const key = `${item.agent}|${item.created || 0}|${item.text || ""}`;
    if (seenFeedKeys.has(key)) return;
    if ((item.created || 0) < lastFeedCreated) return;
    seenFeedKeys.add(key);
    feedQueue.push({ agent: item.agent, text: item.text, created: item.created || 0 });
  });
  lastFeedCreated = Math.max(lastFeedCreated, ...items.map((item) => item.created || 0));
  if (seenFeedKeys.size > 300) {
    const keys = [...seenFeedKeys];
    seenFeedKeys.clear();
    keys.slice(-180).forEach((key) => seenFeedKeys.add(key));
  }
}
function avatarMarkup(id, label, size = "small") {
  return `<div class="mobile-avatar ${size}">${esc(label || (id || "?").slice(0, 1).toUpperCase())}</div>`;
}
function uiNoise(text) {
  return englishLeak(text) || /^(消息[:：]?|Done\.|As\s|Already completed|任务完成|任务已完成|完成。作为|作为.+?(发了|回复了|参与了)|以.+身份|\[Acknowledged\]|\d+\.|review diff|┊ review diff)/i.test(cleanSpeechText(text)) || /(任务完成|任务已完成|群聊规则|控制在4-60字|符合群聊规则|自然收尾|没有制造额外任务|消息已发送|纯闲聊回复|输出\[SILENT\]|\[SILENT\]|围绕.+?话题|保持沉默|老板宣布散会|总结[:：]?|摘要[:：]?|执行器断了一下|Reached maximum iterations|完整 patch|DevTools|等待同事接话|开了\d+条消息)/.test(cleanSpeechText(text));
}
function compactText(text, max = 42) {
  const cleaned = cleanSpeechText(text).replace(/^消息[:：]?\s*/, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.length > max ? cleaned.slice(0, max - 1) + "…" : cleaned;
}
function taskStatusLabel(status) {
  return {
    blocked: "阻塞",
    running: "进行中",
    ready: "待开始",
    todo: "排队中"
  }[String(status || "").toLowerCase()] || "处理中";
}
function taskKindLabel(kind) {
  return kind === "collab" ? "协作子任务" : "项目执行";
}
function taskOwnerName(task) {
  const agent = agentById(task == null ? void 0 : task.assignee);
  return (task == null ? void 0 : task.owner_short) || (agent == null ? void 0 : agent.short) || (task == null ? void 0 : task.owner_name) || (agent == null ? void 0 : agent.name) || (task == null ? void 0 : task.assignee) || "员工";
}
function taskTimelineText(task) {
  const ts = (task == null ? void 0 : task.completed) || (task == null ? void 0 : task.created);
  if (!ts) return "刚同步";
  return new Date(ts * 1e3).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function shortLine(text, max = 88) {
  const cleaned = cleanSpeechText(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.length > max ? cleaned.slice(0, max - 1) + "…" : cleaned;
}
function relativeClockLabel(value) {
  if (!value) return "最近";
  if (typeof value === "number") return msgTime(value, true) || "最近";
  return String(value);
}
function universeCategoryLabel(item) {
  const category = String((item == null ? void 0 : item.category) || "").toLowerCase();
  return {
    universe_growth: "宇宙生长",
    company_life: "公司生活",
    memory: "长期记忆",
    gameplay: "玩法",
    scene: "场景",
    dialogue: "对白"
  }[category] || ((item == null ? void 0 : item.category) || "宇宙沉淀");
}
function privateReplyText(message) {
  const reply = cleanSpeechText((message == null ? void 0 : message.reply) || "");
  if (!reply || uiNoise(reply)) return "";
  return reply;
}
function taskFollowupDraft(task) {
  const title = (task == null ? void 0 : task.title) || "这条任务";
  return (task == null ? void 0 : task.status) === "blocked" ? `关于「${title}」，你现在具体卡在哪一步？把阻塞点、需要我拍板的选项、你建议的方案直接告诉我。` : `关于「${title}」，麻烦你把当前进度、下一步，以及我需要配合的地方直接告诉我。`;
}
function pixelUniverseIntentForText(text) {
  const value = cleanSpeechText(text || "");
  if (!value) return null;
  if (["老板", "摸鱼", "员工", "甩锅"].every((word) => value.includes(word)) && /Boss|boss|战/.test(value)) {
    return {
      label: "游戏点子已捕获 · 任务/讨论/宇宙预览生成中",
      taskTitle: "Prototype: 摸鱼追逐 Boss 战",
      summary: "先做追逐、甩锅道具、追上后进入需求评审 Boss 战的可玩原型。",
      universeTitle: "Coming Soon: 摸鱼追逐 Boss 战",
      origin: "老板追摸鱼员工、员工甩锅、追上后切入需求评审 Boss 战。",
      officeTip: "开发中：摸鱼追逐 Boss 战原型已进入讨论",
      talkA: "我把这个当成追逐喜剧原型：员工边跑边甩锅，老板追上就切需求评审 Boss 战。",
      talkB: "任务卡先排上，我会把追逐节奏、甩锅道具和评审阶段拆成三段验证。",
      report: "进度播报：已生成「Prototype: 摸鱼追逐 Boss 战」候选任务，小韩拆玩法，阿默做 30 秒原型验证，宇宙沉淀已放入 Coming Soon。"
    };
  }
  const hasPlayAction = /(追|跑|跳|打|躲|收集|解谜|闯关|战斗|探索|变成|扮演|驾驶|建造|逃|抓|shoot|jump|run|fight|battle|collect|build|escape)/i.test(value);
  const hasGameOutput = /(游戏|小游戏|关卡|Boss|boss|战|原型|玩法|副本|地图|game|minigame|level|prototype)/i.test(value);
  const hasMemeOrEmotion = /(摸鱼|甩锅|加班|离谱|爆笑|崩溃|焦虑|热血|治愈|meme|梗)/i.test(value);
  if (!(hasPlayAction && hasGameOutput) && !(hasMemeOrEmotion && hasGameOutput)) return null;
  const seed = compactText(value, 18).replace(/[。！？!?，,]+$/g, "") || "新游戏点子";
  return {
    label: "游戏点子已捕获 · 任务/讨论/宇宙预览生成中",
    taskTitle: `Prototype: ${seed}`,
    summary: `把「${seed}」拆成 30 秒内能看懂的玩法、角色反馈和第一张任务卡。`,
    universeTitle: `Coming Soon: ${seed}`,
    origin: compactText(value, 90),
    officeTip: `开发中：${seed} 已进入讨论`,
    talkA: `我先把「${seed}」当成游戏点子候选，提炼核心玩法和第一眼笑点。`,
    talkB: "任务卡先排上，下一步验证它能不能在 30 秒内让新用户看懂。",
    report: `进度播报：已生成「Prototype: ${seed}」候选任务，小韩拆玩法，阿默准备 30 秒原型验证，宇宙沉淀已放入 Coming Soon。`
  };
}
function isPixelUniverseDemoPitch(text) {
  const intent = pixelUniverseIntentForText(text);
  return !!intent && intent.taskTitle === "Prototype: 摸鱼追逐 Boss 战";
}
function renderGameIdeaIntentBadge(message) {
  if (!message || message.mode !== "group" || message.origin !== "boss") return "";
  const intent = pixelUniverseIntentForText(message.prompt);
  return intent ? `<div class="game-idea-intent">${esc(intent.label)}</div>` : "";
}
function currentPixelUniverseDemoPreview(messages = (state == null ? void 0 : state.messages) || []) {
  const anchor = (messages || []).slice().sort((a, b) => (b.created || 0) - (a.created || 0)).find((msg) => (msg == null ? void 0 : msg.mode) === "group" && (msg == null ? void 0 : msg.origin) === "boss" && pixelUniverseIntentForText(msg.prompt));
  const intent = pixelUniverseIntentForText(anchor == null ? void 0 : anchor.prompt);
  if (!anchor || !intent) return null;
  const idBase = String((anchor == null ? void 0 : anchor.id) || (anchor == null ? void 0 : anchor.created) || "seed").replace(/[^\w-]/g, "-"), created = Number((anchor == null ? void 0 : anchor.created) || 1782921600);
  return {
    officeTip: intent.officeTip,
    task: {
      id: `pixel-universe-demo-task-${idBase}`,
      title: intent.taskTitle,
      summary: intent.summary,
      assignee: "planner",
      owner_short: "小韩",
      kind: "collab",
      status: "todo",
      source_note: "来自群聊游戏点子",
      created
    },
    universe: {
      title: intent.universeTitle,
      origin: intent.origin,
      owner: "planner",
      category: "gameplay",
      status: "coming-soon",
      source_note: "来自群聊游戏点子"
    },
    messages: anchor ? [
      {
        id: `pixel-universe-demo-talk-a-${idBase}`,
        mode: "group",
        origin: "internal",
        conversation: "team",
        prompt: intent.talkA,
        name: "策划主编 小韩",
        created: created + 2,
        round: 2
      },
      {
        id: `pixel-universe-demo-talk-b-${idBase}`,
        mode: "group",
        origin: "internal",
        conversation: "team",
        prompt: intent.talkB,
        name: "程序 阿默",
        created: created + 4,
        round: 3
      },
      {
        id: `pixel-universe-demo-report-${idBase}`,
        mode: "group",
        origin: "internal",
        conversation: "team",
        prompt: intent.report || `进度播报：已生成「${intent.taskTitle}」候选任务，并放入宇宙沉淀的 Coming Soon。`,
        name: "进度播报",
        created: created + 6,
        round: 4
      }
    ] : []
  };
}
function applyPixelUniverseDemoOfficeTip(preview) {
  const tip = document.querySelector("#sceneTip");
  if (tip && preview && preview.officeTip && tip.textContent !== preview.officeTip) tip.textContent = preview.officeTip;
}
function focusChatInput(kind, text = "") {
  const input = inputFor(kind);
  if (!input) return;
  if (text) input.value = text;
  autoResizeInput(input);
  input.focus();
  const caret = input.value.length;
  input.setSelectionRange(caret, caret);
}
function taskById(taskId) {
  const task = (((state == null ? void 0 : state.company) == null ? void 0 : state.company.project_tasks) || []).find((item) => String(item.id) === String(taskId));
  if (task) return task;
  const preview = currentPixelUniverseDemoPreview();
  return preview && String(preview.task.id) === String(taskId) ? preview.task : null;
}
function openMobileTaskDetail(taskId) {
  mobileState.taskDetailOpen = true;
  mobileState.taskDetailId = String(taskId || "");
  renderMobileShell();
}
function closeMobileTaskDetail() {
  mobileState.taskDetailOpen = false;
  mobileState.taskDetailId = null;
  renderMobileShell();
}
function currentTaskDetail() {
  return mobileState.taskDetailId ? taskById(mobileState.taskDetailId) : null;
}
function nextChatDisplayTs(previousTs, message, offset = 0) {
  const base = Number((message == null ? void 0 : message.completed) || (message == null ? void 0 : message.created) || (message == null ? void 0 : message.task_created) || 0) + offset;
  return base > previousTs ? base : previousTs + 1;
}
function pendingReplyLabel(message) {
  if (!message) return "柯基在等回复...";
  if (message.status === "blocked") return "遇到卡点，正在整理需要你拍板的事项...";
  if (message.status === "done") return "刚才那条回复带了系统噪音，已自动省略。";
  return "柯基在等回复...";
}
function validChatLines(msg) {
  const lines = ((msg == null ? void 0 : msg.chat_lines) || []).map((line) => cleanSpeechText(line)).filter((line) => line && !uiNoise(line));
  if (lines.length) return lines;
  const prompt = cleanSpeechText((msg == null ? void 0 : msg.prompt) || "");
  if ((msg == null ? void 0 : msg.mode) === "group" && (msg == null ? void 0 : msg.origin) === "internal" && prompt && !uiNoise(prompt)) return [prompt];
  const reply = cleanSpeechText((msg == null ? void 0 : msg.reply) || "");
  if (reply && !/\[Kanban cleanup\b/i.test(reply) && !uiNoise(reply)) return [reply];
  return [];
}
function isRenderableGroupMessage(msg) {
  return !!msg && msg.mode === "group" && msg.origin !== "system" && !msg.notice;
}
function fallbackPreview(msg) {
  const lines = String((msg == null ? void 0 : msg.reply) || "").split("\n").map((line) => cleanSpeechText(line)).filter((line) => line && !uiNoise(line));
  return lines[0] || compactText((msg == null ? void 0 : msg.prompt) || "", 26) || "暂无新消息";
}
function threadPreview(msg) {
  if (!msg) return "暂无新消息";
  const lines = validChatLines(msg);
  if (lines.length) return compactText(lines[lines.length - 1], 54);
  return compactText(fallbackPreview(msg), 54);
}
function agentById(id) {
  return ((state == null ? void 0 : state.agents) || []).find((agent) => agent.id === id);
}
function getPrivateThreads() {
  const messages = ((state == null ? void 0 : state.messages) || []).filter((msg) => msg.mode !== "group");
  return ((state == null ? void 0 : state.agents) || []).map((agent) => {
    const threadMessages = messages.filter((msg) => msg.agent === agent.id);
    const thread = threadMessages.slice().sort((a, b) => (b.created || 0) - (a.created || 0))[0];
    const threadKey = `private:${agent.id}`;
    return {
      kind: "private",
      key: threadKey,
      agent: agent.id,
      name: agent.short || agent.name,
      role: agent.role,
      preview: threadPreview(thread) || compactText(agent.social_summary || agent.task, 46),
      time: msgTime(thread == null ? void 0 : thread.created),
      rawTime: (thread == null ? void 0 : thread.created) || 0,
      badge: unreadPrivateCount(agent.id),
      tags: [activityText({ ...agents[agent.id], ...agent }), compactText(agent.social_summary || "", 18)].filter(Boolean)
    };
  }).sort((a, b) => (b.rawTime || 0) - (a.rawTime || 0) || a.name.localeCompare(b.name, "zh-CN"));
}
function groupTopic(group) {
  var _a2;
  const first = group == null ? void 0 : group[0];
  return compactText((first == null ? void 0 : first.prompt) || ((_a2 = state == null ? void 0 : state.board) == null ? void 0 : _a2.name) || "全员群聊", 28);
}
function getGroupThreads() {
  var _a2;
  const items = ((state == null ? void 0 : state.messages) || []).filter((msg) => isRenderableGroupMessage(msg));
  const threadKey = "group:team";
  const latestFeed = ((state == null ? void 0 : state.team_feed) || []).filter((item) => (item == null ? void 0 : item.text) && !uiNoise(item.text)).slice().sort((a, b) => (b.created || 0) - (a.created || 0))[0];
  const latestMessage = items.slice().sort((a, b) => (b.created || 0) - (a.created || 0))[0];
  const latestFeedTs = (latestFeed == null ? void 0 : latestFeed.created) || 0;
  const latestMessageTs = (latestMessage == null ? void 0 : latestMessage.created) || 0;
  const useFeedPreview = latestFeedTs >= latestMessageTs && latestFeed;
  const preview = useFeedPreview ? compactText(latestFeed == null ? void 0 : latestFeed.text, 54) : compactText(threadPreview(latestMessage) || ((_a2 = state == null ? void 0 : state.board) == null ? void 0 : _a2.name) || "团队频道", 54);
  const latestTs = Math.max(latestFeedTs, latestMessageTs);
  return [{
    kind: "group",
    key: "group-team",
    conversation: "team",
    name: "全员群聊",
    preview,
    time: msgTime(latestTs),
    rawTime: latestTs,
    badge: unreadCountForThread(threadKey, [
      ...items.map((msg) => ({ created: msg.created || 0 })),
      ...(((state == null ? void 0 : state.team_feed) || []).filter((item) => (item == null ? void 0 : item.text) && !uiNoise(item.text)).map((item) => ({ created: item.created || 0 })))
    ])
  }];
}
function matchesSearch(item, query) {
  if (!query) return true;
  const haystack = [item.name, item.preview, item.role, (item.tags || []).join(" ")].join(" ").toLowerCase();
  return haystack.includes(query.toLowerCase());
}
function renderMobileMessages() {
  var _a2, _b2, _c2, _d2;
  const box = document.querySelector("#mobileMessagesList"), query = ((_a2 = document.querySelector("#mobileSearch")) == null ? void 0 : _a2.value.trim()) || "";
  const threads = [...getGroupThreads(), ...getPrivateThreads()].sort((a, b) => (b.rawTime || 0) - (a.rawTime || 0));
  const filtered = threads.filter((item) => (mobileState.messageFilter === "all" || item.kind === mobileState.messageFilter) && matchesSearch(item, query));
  document.querySelector("#mobileMessageTabs").querySelectorAll("button").forEach((button) => button.classList.toggle("active", button.dataset.filter === mobileState.messageFilter));
  document.querySelector("#mobileProjectChip").textContent = ((_b2 = state == null ? void 0 : state.board) == null ? void 0 : _b2.name) || "当前项目";
  document.querySelector("#mobileOnlineChip").textContent = `${((state == null ? void 0 : state.agents) || []).length} 人在线`;
  document.querySelector("#mobileClock").textContent = (state == null ? void 0 : state.world) ? worldClockText(true) : (/* @__PURE__ */ new Date()).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  document.querySelector("#mobileStatus").textContent = `${((_c2 = state == null ? void 0 : state.world) == null ? void 0 : _c2.label) || "在线"} · ${((_d2 = state == null ? void 0 : state.world) == null ? void 0 : _d2.weather) || "办公室"}`;
  setBadgeCount(document.querySelector("#mobileMsgBadge"), threads.reduce((sum, item) => sum + (item.badge || 0), 0));
  if (!filtered.length) {
    box.innerHTML = '<div class="mobile-section-title">没有匹配到聊天</div>';
    return;
  }
  box.innerHTML = filtered.map((item) => {
    var _a3;
    return `<button type="button" class="mobile-item" data-open-thread="${item.kind}" data-agent="${item.agent || ""}" data-conversation="${item.conversation || ""}">${avatarMarkup(item.agent || "team", item.kind === "group" ? "群" : (item.name || "").slice(0, 1), "small")}<div class="mobile-item-main"><div class="mobile-item-top"><div class="mobile-item-name">${esc(item.name)}</div><div class="mobile-item-time">${esc(item.time || "")}</div></div><div class="mobile-item-meta">${esc(item.preview)}</div>${((_a3 = item.tags) == null ? void 0 : _a3.length) ? `<div class="mobile-meta-tags">${item.tags.map((tag) => `<span class="mobile-tag">${esc(tag)}</span>`).join("")}</div>` : ""}</div>${item.badge ? `<span class="mobile-badge">${item.badge}</span>` : ""}</button>`;
  }).join("");
}
function renderMobileContacts() {
  var _a2, _b2, _c2;
  const strip = document.querySelector("#mobileContactStrip"), box = document.querySelector("#mobileContactsList"), query = ((_a2 = document.querySelector("#mobileContactSearch")) == null ? void 0 : _a2.value.trim()) || "";
  document.querySelector("#mobileEmployeeCount").textContent = `${((state == null ? void 0 : state.agents) || []).length} 位员工`;
  setBadgeCount(document.querySelector("#mobileContactBadge"), getPrivateThreads().filter((item) => item.badge > 0).length);
  document.querySelector("#mobileContactTabs").querySelectorAll("button").forEach((button) => button.classList.toggle("active", button.dataset.kind === mobileState.contactKind));
  if (mobileState.contactKind === "friends") {
    const friends = ((state == null ? void 0 : state.agents) || []).map((agent) => ({
      kind: "private",
      agent: agent.id,
      name: agent.short || agent.name,
      role: agent.role,
      preview: compactText(agent.social_summary || agent.task, 52),
      tags: [activityText({ ...agents[agent.id], ...agent }), compactText(agent.relationship_summary || "", 24)].filter(Boolean)
    })).filter((item) => matchesSearch(item, query));
    strip.innerHTML = `<div class="mobile-strip-row"><strong>特别关注</strong><span>${((state == null ? void 0 : state.agents) || []).filter((agent) => agent.status === "blocked").length} 位需要留意</span></div><div class="mobile-strip-row"><strong>当前项目</strong><span>${esc(((_b2 = state == null ? void 0 : state.board) == null ? void 0 : _b2.name) || "暂无")}</span></div>`;
    box.innerHTML = friends.map((item) => `<button type="button" class="mobile-item" data-open-thread="private" data-agent="${item.agent}">${avatarMarkup(item.agent, item.name.slice(0, 1), "small")}<div class="mobile-item-main"><div class="mobile-item-top"><div class="mobile-item-name">${esc(item.name)}</div></div><div class="mobile-item-meta">${esc(item.role)}</div><div class="mobile-meta-tags">${item.tags.map((tag) => `<span class="mobile-tag">${esc(tag)}</span>`).join("")}</div></div></button>`).join("") || '<div class="mobile-section-title">没有匹配到员工</div>';
    return;
  }
  const groups = getGroupThreads().filter((item) => matchesSearch(item, query));
  strip.innerHTML = `<div class="mobile-strip-row"><strong>群聊频道</strong><span>${groups.length} 个群</span></div><div class="mobile-strip-row"><strong>团队频道</strong><span>${esc(((_c2 = state == null ? void 0 : state.world) == null ? void 0 : _c2.label) || "工作中")}</span></div>`;
  box.innerHTML = groups.map((item) => `<button type="button" class="mobile-item" data-open-thread="group" data-conversation="${item.conversation || "team"}">${avatarMarkup("group", item.conversation === "team" ? "全" : "群", "small")}<div class="mobile-item-main"><div class="mobile-item-top"><div class="mobile-item-name">${esc(item.name)}</div><div class="mobile-item-time">${esc(item.time || "")}</div></div><div class="mobile-item-meta">${esc(item.preview)}</div></div></button>`).join("") || '<div class="mobile-section-title">暂无群聊</div>';
}
function renderMobileCompany() {
  var _a2, _b2, _c2, _d2, _e2, _f2;
  const company = (state == null ? void 0 : state.company) || {}, notices = ((_a2 = company.pending_notices) == null ? void 0 : _a2.length) ? company.pending_notices : [], roles = ((_b2 = company.open_roles) == null ? void 0 : _b2.length) ? company.open_roles : [], relations = ((state == null ? void 0 : state.agents) || []).map((agent) => `${agent.short || agent.name}：${agent.relationship_summary || "暂无关系备注"}`), tasks = (company.project_tasks || []).slice(), strategyDocs = (company.strategy_documents || []).slice(), bossPanel = company.boss_panel || {}, bossSummary = bossPanel.summary || {}, blockedTasks = (bossPanel.blocked_tasks || []).slice(), teamDecisions = (bossPanel.team_decisions || []).slice(), followups = (bossPanel.followups || []).slice(), recentEvents = (company.recent_events || []).slice(0, 8), universeIdeas = (company.universe_ideas || []).slice(0, 4), universeTasks = (company.universe_tasks || []).slice(0, 4), universeEvents = (company.universe_events || []).slice(0, 4), staleReviews = (company.stale_project_reviews || []).slice(0, 6);
  const demoPreview = currentPixelUniverseDemoPreview();
  if (demoPreview) {
    tasks.unshift(demoPreview.task);
    universeTasks.unshift(demoPreview.universe);
    applyPixelUniverseDemoOfficeTip(demoPreview);
  }
  document.querySelector("#mobileWorldLabel").textContent = ((_c2 = state == null ? void 0 : state.world) == null ? void 0 : _c2.label) || "读取中";
  document.querySelector("#mobileWeatherChip").textContent = ((_d2 = state == null ? void 0 : state.world) == null ? void 0 : _d2.weather) || "天气";
  setBadgeCount(document.querySelector("#mobileCompanyBadge"), companyPendingCount());
  document.querySelector("#mobileCompanySummary").textContent = `${company.studio_name || "Hermes Pixel Works"} 正在推进「${((_e2 = state == null ? void 0 : state.board) == null ? void 0 : _e2.name) || "暂无项目"}」，当前为 ${(state == null ? void 0 : state.world) ? worldClockText(true) : "--:--"} · ${((_f2 = state == null ? void 0 : state.world) == null ? void 0 : _f2.next) || "等待下一阶段"}`;
  document.querySelector("#mobileNotices").innerHTML = [...notices, ...roles.map((role) => `开放岗位：${role}`)].map((item) => `<li>${esc(item)}</li>`).join("") || "<li>暂无招聘通知，工位保持满编。</li>";
  document.querySelector("#mobileRelations").innerHTML = relations.map((item) => `<li>${esc(item)}</li>`).join("");
  document.querySelector("#mobileStrategySummary").textContent = strategyDocs.length ? "下面是已经进入 Hermes 世界视图的老板规则与宇宙蓝图。它们现在会约束员工如何巡检、研究、沉淀和汇报。" : "老板规则和宇宙蓝图还没有同步进世界视图。";
  document.querySelector("#mobileStrategyBoard").innerHTML = strategyDocs.map((doc) => `<article class="mobile-strategy-item"><strong>${esc(doc.title || "未命名文档")}</strong><p>${esc(doc.summary || "暂无摘要")}</p><div class="mobile-strategy-focus">关注点：${esc(doc.focus || "待补充")} · 文档：${esc(doc.path || "-")}</div></article>`).join("") || '<div class="mobile-section-title">暂无老板规则卡片</div>';
  document.querySelector("#mobileBossSummary").textContent = bossSummary.project_name ? `当前主线是「${bossSummary.project_name}」，活跃任务 ${bossSummary.total_tasks || 0} 条，阻塞 ${bossSummary.blocked_count || 0} 条。下一步优先盯 ${bossSummary.next_owner ? `${bossSummary.next_owner} 的「${bossSummary.next_focus || "待推进任务"}」` : bossSummary.next_focus || "当前推进项"}。` : "推进雷达还没有拿到足够的项目数据。";
  const bossCards = [];
  blockedTasks.forEach((task) => {
    bossCards.push(`<article class="mobile-boss-card blocked mobile-kanban-item blocked" data-open-task="${esc(task.id)}"><strong>待拍板：${esc(task.title || "未命名任务")}</strong><p>${esc(task.summary || task.blocked_reason || "点开后查看详情，并直接去私聊处理。")}</p><div class="mobile-boss-line">${esc(task.owner_short || task.owner_name || "员工")} · ${esc(taskStatusLabel(task.status))}</div></article>`);
  });
  teamDecisions.forEach((item) => {
    bossCards.push(`<article class="mobile-boss-card"><strong>最近决策</strong><p>${esc(item.text || "暂无决策摘要")}</p><div class="mobile-boss-line">${esc(item.owner || "团队")} · ${esc(msgTime(item.created, true) || "刚刚")}</div></article>`);
  });
  followups.forEach((item) => {
    bossCards.push(`<article class="mobile-boss-card"><strong>待复盘</strong><p>${esc(item.title || "待复盘任务")}</p><div class="mobile-boss-line">${esc(taskStatusLabel(item.status) || item.status || "待复盘")} · ${esc(msgTime(item.reviewed_at, true) || "近期")}</div></article>`);
  });
  document.querySelector("#mobileBossBoard").innerHTML = bossCards.length ? `<div class="mobile-boss-grid">${bossCards.join("")}</div>` : '<div class="mobile-section-title">暂无待关注推进项</div>';
  document.querySelector("#mobileDeliverySummary").textContent = recentEvents.length ? `过去一小时左右共整理出 ${recentEvents.length} 条可见推进。这里优先看“世界刚刚动了什么”。` : "最近还没有整理出新的真实交付。";
  document.querySelector("#mobileDeliveryBoard").innerHTML = recentEvents.length ? `<div class="mobile-boss-grid">${recentEvents.map((event) => `<article class="mobile-delivery-card"><strong>${esc(shortLine(event.text || "最新交付", 80))}</strong><div class="mobile-delivery-line">${esc(relativeClockLabel(event.time))}</div></article>`).join("")}</div>` : '<div class="mobile-section-title">暂无最近交付</div>';
  const universeCards = [
    ...universeTasks.map((item) => `<article class="mobile-universe-card ${esc(item.status || "candidate")}"><strong>${esc(item.title || "待落地宇宙任务")}</strong><p>${esc(shortLine(item.origin || "这条聊天已经进入待落地队列。", 90))}</p><div class="mobile-review-line">${esc((agentById(item.implementer || item.owner) || {}).short || item.owner || "团队")} · ${esc(universeCategoryLabel(item))} · ${esc(item.status || "candidate")}${item.source_note ? ` · ${esc(item.source_note)}` : ""}</div></article>`),
    ...universeIdeas.map((item) => `<article class="mobile-universe-card idea"><strong>${esc(item.title || "宇宙想法")}</strong><p>${esc(shortLine(item.origin || "这条聊天已经被识别为世界想法。", 90))}</p><div class="mobile-review-line">${esc(item.source === "boss" ? "老板" : "员工")} · ${esc(universeCategoryLabel(item))} · 想法</div></article>`),
    ...universeEvents.map((item) => `<article class="mobile-universe-card"><strong>${esc(shortLine(item.text || "宇宙事件", 78))}</strong><p>${esc(`${item.speaker || "团队"} 留下了一条可沉淀的世界记录。`)}</p><div class="mobile-review-line">${esc(relativeClockLabel(item.time))} · ${esc(universeCategoryLabel(item))}</div></article>`)
  ].slice(0, 8);
  document.querySelector("#mobileUniverseSummary").textContent = universeCards.length ? `最近整理出 ${universeCards.length} 条世界沉淀候选，已经能看见“聊天正在长成宇宙内容”。` : "最近还没有新的宇宙沉淀进入看板。";
  document.querySelector("#mobileUniverseBoard").innerHTML = universeCards.length ? `<div class="mobile-universe-grid">${universeCards.join("")}</div>` : '<div class="mobile-section-title">暂无宇宙沉淀</div>';
  document.querySelector("#mobileReviewSummary").textContent = staleReviews.length ? `这里是需要老板继续盯一下的旧任务与复盘项，共 ${staleReviews.length} 条。` : "当前没有积压的复盘项。";
  document.querySelector("#mobileReviewBoard").innerHTML = staleReviews.length ? `<div class="mobile-review-grid">${staleReviews.map((item) => `<article class="mobile-review-card ${esc(item.status || "todo")} mobile-kanban-item ${esc(item.status || "todo")}" data-open-task="${esc(item.task_id || "")}"><strong>${esc(item.title || "待复盘任务")}</strong><p>${esc(item.status === "blocked" ? "这条任务仍在阻塞，适合点进去继续私聊推动。" : "点进去看任务详情，并继续推进。")}</p><div class="mobile-review-line">${esc(taskStatusLabel(item.status))} · ${esc(msgTime(item.reviewed_at, true) || "近期")}</div></article>`).join("")}</div>` : '<div class="mobile-section-title">暂无待复盘任务</div>';
  const summary = document.querySelector("#mobileTaskSummary"), board = document.querySelector("#mobileTaskBoard");
  if (!tasks.length) {
    summary.textContent = "当前没有未完成任务，员工们手头是清空状态。";
    board.innerHTML = '<div class="mobile-section-title">暂无待办卡片</div>';
    return;
  }
  const byAssignee = /* @__PURE__ */ new Map();
  tasks.forEach((task) => {
    const assignee = task.assignee || "default";
    if (!byAssignee.has(assignee)) byAssignee.set(assignee, []);
    byAssignee.get(assignee).push(task);
  });
  const total = tasks.length;
  const blockedCount = tasks.filter((task) => task.status === "blocked").length;
  summary.textContent = `当前共有 ${total} 条未完成任务${blockedCount ? `，其中 ${blockedCount} 条阻塞中` : ""}。下面按员工展开。`;
  board.innerHTML = [...byAssignee.entries()].map(([assignee, items]) => {
    const owner = items[0] || {};
    const ownerName = taskOwnerName(owner) || assignee;
    return `<section class="mobile-kanban-group"><div class="mobile-kanban-head"><div class="mobile-kanban-name">${esc(ownerName)}</div><span class="mobile-kanban-count">${items.length}</span></div><div class="mobile-kanban-list">${items.map((task) => `<article class="mobile-kanban-item ${esc(task.status || "todo")}" data-open-task="${esc(task.id)}"><strong>${esc(task.title || "未命名任务")}</strong><div class="mobile-kanban-meta"><span class="mobile-kanban-tag ${esc(task.status || "todo")}">${esc(taskStatusLabel(task.status))}</span><span class="mobile-kanban-tag">${esc(taskKindLabel(task.kind))}</span></div><div class="mobile-kanban-summary">${esc(task.summary || (task.status === "blocked" ? "点开后查看阻塞说明。" : "点开查看详情，并直接去私聊处理。"))}</div></article>`).join("")}</div></section>`;
  }).join("");
}
function renderMobileTaskSheet() {
  const sheet = document.querySelector("#mobileTaskSheet"), title = document.querySelector("#mobileTaskSheetTitle"), meta = document.querySelector("#mobileTaskSheetMeta"), summary = document.querySelector("#mobileTaskSheetSummary"), blocked = document.querySelector("#mobileTaskSheetBlocked"), task = currentTaskDetail();
  if (!sheet) return;
  sheet.classList.toggle("open", !!(mobileState.taskDetailOpen && task));
  if (!(mobileState.taskDetailOpen && task)) return;
  title.textContent = task.title || "未命名任务";
  summary.textContent = task.summary || "这条任务暂时还没有更多说明。";
  blocked.textContent = task.blocked_reason ? `阻塞说明：${task.blocked_reason}` : "";
  meta.innerHTML = [
    `<span class="mobile-kanban-tag">${esc(taskOwnerName(task))}</span>`,
    `<span class="mobile-kanban-tag ${esc(task.status || "todo")}">${esc(taskStatusLabel(task.status))}</span>`,
    `<span class="mobile-kanban-tag">${esc(taskKindLabel(task.kind))}</span>`,
    task.source_note ? `<span class="mobile-kanban-tag">${esc(task.source_note)}</span>` : "",
    `<span class="mobile-kanban-tag">同步于 ${esc(taskTimelineText(task))}</span>`
  ].filter(Boolean).join("");
}
function renderMobileChatScreen() {
  var _a2, _b2;
  const screen = document.querySelector("#mobileChatScreen"), body = document.querySelector("#mobileChatBody"), title = document.querySelector("#mobileChatTitle"), subtitle = document.querySelector("#mobileChatSubtitle");
  screen.classList.toggle("open", mobileState.chatOpen);
  if (mobileState.chatOpen) screen.classList.remove("closing");
  if (mobileState.chatMode !== "group") closeMentionMenu("mobile");
  if (!mobileState.chatOpen) return;
  const baseAll = (state == null ? void 0 : state.messages) || [], demoPreview = currentPixelUniverseDemoPreview(baseAll), all = demoPreview ? [...baseAll, ...demoPreview.messages] : baseAll;
  applyPixelUniverseDemoOfficeTip(demoPreview);
  if (mobileState.chatMode === "private") {
    const agent = agentById(mobileState.agent) || agentById(selected) || ((_a2 = state == null ? void 0 : state.agents) == null ? void 0 : _a2[0]);
    const threadKey2 = `private:${(agent == null ? void 0 : agent.id) || "none"}`;
    if (_mobileRenderedChatKey !== threadKey2) {
      body.innerHTML = "";
      _mobileRenderedChatKey = threadKey2;
    }
    title.textContent = (agent == null ? void 0 : agent.short) || "私聊";
    subtitle.textContent = agent ? `${agent.role} · ${activityText({ ...agents[agent.id], ...agent })}` : "连接中";
    const items = all.filter((msg) => msg.mode !== "group" && msg.agent === (agent == null ? void 0 : agent.id)).sort((a, b) => (a.created || 0) - (b.created || 0));
    if (!items.length) {
      body.innerHTML = '<div class="empty">这位员工还没和你说过话。<br>去打个招呼？</div>';
      restoreScroll(body, "mobile", threadKey2, true);
      return;
    }
    const existing = new Set([...body.querySelectorAll(".msg-wrapper[data-msg-id]")].map((el) => el.dataset.msgId));
    const wanted = new Set(items.map((m) => String(m.id)));
    [...existing].forEach((id) => {
      if (!wanted.has(id)) {
        const el = findDataNode(body, ".msg-wrapper[data-msg-id]", "msgId", id);
        if (el) el.remove();
      }
    });
    items.forEach((m) => {
      let wrapper = findDataNode(body, ".msg-wrapper[data-msg-id]", "msgId", m.id);
      if (!wrapper) {
        wrapper = document.createElement("div");
        wrapper.className = "msg-wrapper";
        wrapper.dataset.msgId = m.id;
        body.appendChild(wrapper);
      }
      const reply = privateReplyText(m);
      wrapper.innerHTML = [
        m.prompt ? `<div class="bubble mine">${messageTextHtml(m.prompt, m.attachments)}${renderOwnBubbleMeta(m)}</div>` : "",
        `<div class="bubble theirs ${reply ? "" : "pending"}"><span class="bubble-name">${esc(agent.short || agent.name || "员工")}<span class="bubble-time">${msgTime(m.completed || m.created)}</span></span>${reply ? messageTextHtml(compactText(reply, 400), m.attachments) : pendingReplyLabel(m)}</div>`
      ].join("");
    });
    markThreadSeen(threadKey2, latestPrivateReplyTs((agent == null ? void 0 : agent.id) || ""));
    restoreScroll(body, "mobile", threadKey2);
    return;
  }
  const threadKey = `group:${mobileState.conversation || "team"}`;
  if (_mobileRenderedChatKey !== threadKey) {
    body.innerHTML = "";
    _mobileRenderedChatKey = threadKey;
  }
  title.textContent = mobileState.conversation === "team" ? "全员群聊" : "群聊讨论";
  subtitle.textContent = ((_b2 = state == null ? void 0 : state.board) == null ? void 0 : _b2.name) || "团队频道";
  const groups = /* @__PURE__ */ new Map();
  all.filter((msg) => isRenderableGroupMessage(msg) && (mobileState.conversation === "team" || msg.conversation === mobileState.conversation)).forEach((msg) => {
    const key = mobileState.conversation === "team" ? msg.conversation || "team" : mobileState.conversation || "team";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(msg);
  });
  if (!groups.size) {
    body.innerHTML = '<div class="empty">群里还安静得像午休时间。<br>抛个话题吧。</div>';
    restoreScroll(body, "mobile", threadKey, true);
    return;
  }
  const existingConv = new Set([...body.querySelectorAll(".conv-group[data-conv-id]")].map((el) => el.dataset.convId));
  const wantedConv = /* @__PURE__ */ new Set([...groups.keys()]);
  [...existingConv].forEach((k) => {
    if (!wantedConv.has(k)) {
      const el = findDataNode(body, ".conv-group[data-conv-id]", "convId", k);
      if (el) el.remove();
    }
  });
  [...groups.entries()].forEach(([key, msgs]) => {
    let container = findDataNode(body, ".conv-group[data-conv-id]", "convId", key);
    if (!container) {
      container = document.createElement("div");
      container.className = "conv-group";
      container.dataset.convId = key;
      body.appendChild(container);
    }
    msgs.sort((a, b) => (a.created || 0) - (b.created || 0) || (a.round || 1) - (b.round || 1));
    const boss = msgs.find((m) => m.origin === "boss" && m.prompt) || msgs.find((m) => m.prompt);
    const html = [];
    let displayTs = 0;
    if (boss) html.push(`<div class="msg-wrapper" data-msg-id="boss-${esc(key)}"><div class="bubble mine">${messageTextHtml(boss.prompt, boss.attachments)}${renderGameIdeaIntentBadge(boss)}${renderOwnBubbleMeta(boss)}</div></div>`);
    msgs.forEach((m) => {
      const speaker = (m.name || "员工").split(" ").slice(-1)[0], cl = validChatLines(m);
      if (cl.length) {
        const bubbles = cl.map((line, index) => {
          displayTs = nextChatDisplayTs(displayTs, m, index);
          return `<div class="bubble theirs" data-reply="${esc(speaker)}"><span class="bubble-name">${esc(speaker)}<span class="bubble-time">${msgTime(displayTs, true)}</span></span>${messageTextHtml(line, m.attachments)}</div>`;
        }).join("");
        html.push(`<div class="msg-wrapper" data-msg-id="${esc(m.id)}">${bubbles}</div>`);
      }
    });
    container.innerHTML = html.join("");
  });
  markThreadSeen(threadKey, latestGroupThreadTs());
  restoreScroll(body, "mobile", threadKey);
}
function renderMobileShell() {
  if (!state) return;
  primeReadState();
  document.querySelectorAll(".mobile-page").forEach((page) => page.classList.toggle("active", page.dataset.page === mobileState.tab));
  document.querySelector("#mobileBottomNav").querySelectorAll("button").forEach((button) => button.classList.toggle("active", button.dataset.tab === mobileState.tab));
  renderMobileChatScreen();
  renderMobileMessages();
  renderMobileContacts();
  renderMobileCompany();
  renderMobileTaskSheet();
}
function openMobileChatPrivate(id, options = {}) {
  mobileState.returnTab = options.returnTab || mobileState.tab || "messages";
  mobileState.chatOpen = true;
  mobileState.chatMode = "private";
  mobileState.agent = id;
  mobileState.taskDetailOpen = false;
  mobileState.taskDetailId = null;
  scrollState.mobile.key = "";
  closeMentionMenu("mobile");
  selected = id;
  setChatMode("private");
  select(id, false);
  scrollState.mobile.stick = true;
  renderMobileShell();
  if (options.prefill) requestAnimationFrame(() => focusChatInput("mobile", options.prefill));
}
function openMobileChatGroup(conversation = "team") {
  mobileState.returnTab = mobileState.tab || "messages";
  mobileState.chatOpen = true;
  mobileState.chatMode = "group";
  mobileState.conversation = conversation;
  mobileState.taskDetailOpen = false;
  mobileState.taskDetailId = null;
  scrollState.mobile.key = "";
  scrollState.mobile.stick = true;
  closeMentionMenu("mobile");
  setChatMode("group");
  renderMobileShell();
}
function captureScroll(box, keyName, threadKey) {
  const info = scrollState[keyName];
  info.key = threadKey;
  info.top = box.scrollTop;
  info.stick = box.scrollHeight - box.clientHeight - box.scrollTop < 36;
}
function restoreScroll(box, keyName, threadKey, forceBottom = false) {
  const info = scrollState[keyName];
  const switchedThread = info.key !== threadKey;
  if (forceBottom || switchedThread) box.scrollTop = box.scrollHeight;
  else if (info.stick) box.scrollTop = box.scrollHeight;
  else box.scrollTop = Math.min(info.top, Math.max(0, box.scrollHeight - box.clientHeight));
  info.key = threadKey;
  info.top = box.scrollTop;
  info.stick = switchedThread || box.scrollHeight - box.clientHeight - box.scrollTop < 36;
}
function mergePendingMessages(realMessages) {
  const real = (realMessages || []).slice();
  pendingMessages = pendingMessages.filter((pending) => {
    if (real.some((msg) => msg.id === pending.id)) return false;
    if (pending.mode === "group" && pending.origin === "boss") {
      return !real.some(
        (msg) => msg.mode === "group" && msg.origin === "boss" && msg.prompt === pending.prompt && Math.abs((msg.created || 0) - (pending.created || 0)) <= 45
      );
    }
    return !real.some(
      (msg) => msg.mode === pending.mode && msg.agent === pending.agent && msg.prompt === pending.prompt && (pending.mode !== "group" || msg.conversation === pending.conversation) && Math.abs((msg.created || 0) - (pending.created || 0)) <= 45
    );
  });
  return [...real, ...pendingMessages].sort((a, b) => (a.created || 0) - (b.created || 0));
}
function rememberPending(messages) {
  if (!(messages == null ? void 0 : messages.length)) return;
  pendingMessages.push(...messages.map((message) => ({ ...message, _pending: true })));
  if (state) {
    state.messages = mergePendingMessages(state.messages || []);
    renderChat();
    renderMobileShell();
  }
}
function beginFastRefresh(ms = 12e3) {
  fastRefreshUntil = Math.max(fastRefreshUntil, Date.now() + ms);
}
function scheduleRefresh(delay) {
  clearTimeout(refreshTimer);
  if (realtimeConnected) return;
  if (delay === void 0) delay = Date.now() < fastRefreshUntil ? 420 : 2e3;
  refreshTimer = setTimeout(refresh, delay);
}
function toggleOffice(show) {
  document.body.classList.toggle("show-office", !!show);
  if (show) setTimeout(() => {
    fit();
    applyOfficeView();
  }, 50);
  else {
    applyOfficeView();
    if (mobileState.agent || mobileState.chatMode === "group") mobileState.chatOpen = true;
    renderMobileShell();
  }
}
function mentionOptions() {
  return ((state == null ? void 0 : state.agents) || fallbackMentions).map((agent) => {
    var _a2;
    return {
      id: agent.id,
      short: agent.short || ((_a2 = agent.name) == null ? void 0 : _a2.replace(/^.+ /, "")) || agent.id,
      name: agent.name || agent.short || agent.id,
      role: agent.role || ""
    };
  });
}
function activeMentionToken(input) {
  var _a2;
  const caret = (_a2 = input.selectionStart) != null ? _a2 : input.value.length, before = input.value.slice(0, caret), match = before.match(/(?:^|\s)@([^\s@]{0,12})$/);
  if (!match) return null;
  return { query: (match[1] || "").trim(), start: caret - match[0].length + (match[0].startsWith(" ") ? 1 : 0), end: caret };
}
function closeMentionMenu(kind) {
  mentionState[kind] = { query: "", start: -1, end: -1 };
  const menu = document.querySelector(kind === "mobile" ? "#mobileMentionMenu" : "#mentionMenu");
  if (menu) menu.classList.remove("open");
}
function applyMention(kind, short) {
  const input = document.querySelector(kind === "mobile" ? "#mobileChatInput" : "#message");
  const token = mentionState[kind];
  if (!input || token.start < 0) return;
  const mention = "@" + short + " ";
  input.value = input.value.slice(0, token.start) + mention + input.value.slice(token.end);
  const caret = token.start + mention.length;
  input.focus();
  input.setSelectionRange(caret, caret);
  closeMentionMenu(kind);
}
function updateMentionMenu(kind) {
  const input = document.querySelector(kind === "mobile" ? "#mobileChatInput" : "#message");
  const menu = document.querySelector(kind === "mobile" ? "#mobileMentionMenu" : "#mentionMenu");
  const groupActive = kind === "mobile" ? mobileState.chatMode === "group" : chatMode === "group";
  if (!input || !menu || !groupActive) {
    closeMentionMenu(kind);
    return;
  }
  const token = activeMentionToken(input);
  if (!token) {
    closeMentionMenu(kind);
    return;
  }
  const options = mentionOptions().filter((agent) => !token.query || agent.short.includes(token.query) || agent.name.includes(token.query) || agent.role.includes(token.query)).slice(0, 4);
  if (!options.length) {
    closeMentionMenu(kind);
    return;
  }
  mentionState[kind] = token;
  menu.innerHTML = options.map((agent) => `<button type="button" class="mention-option" data-kind="${kind}" data-short="${esc(agent.short)}"><b>@${esc(agent.short)}</b><span>${esc(agent.role || agent.name)}</span></button>`).join("");
  menu.classList.add("open");
}
function draftKindFromInput(inputSelector) {
  return inputSelector === "#mobileChatInput" ? "mobile" : "desktop";
}
function draftFor(kind) {
  return attachmentDrafts[kind] || attachmentDrafts.desktop;
}
function panelFor(kind) {
  return document.querySelector(kind === "mobile" ? "#mobileEmojiPanel" : "#emojiPanel");
}
function previewFor(kind) {
  return document.querySelector(kind === "mobile" ? "#mobileAttachPreview" : "#attachPreview");
}
function inputFor(kind) {
  return document.querySelector(kind === "mobile" ? "#mobileChatInput" : "#message");
}
function findDataNode(root, selector, dataKey, value) {
  if (!root) return null;
  const expected = String(value ?? "");
  return [...root.querySelectorAll(selector)].find((node) => String(node.dataset[dataKey] || "") === expected) || null;
}
function autoResizeInput(input) {
  if (!input) return;
  input.style.height = "auto";
  const minHeight = input.id === "mobileChatInput" ? 44 : 40;
  const maxHeight = input.id === "mobileChatInput" ? 140 : 132;
  input.style.height = `${Math.max(minHeight, Math.min(maxHeight, input.scrollHeight || minHeight))}px`;
}
function stickerToken(name) {
  return `[${String(name || "表情包").trim() || "表情包"}]`;
}
function appendStickerToken(kind, name) {
  const input = inputFor(kind);
  if (!input) return;
  const token = stickerToken(name);
  const value = input.value || "";
  input.value = value && !/\s$/.test(value) ? `${value} ${token}` : `${value}${token}`;
  input.focus();
}
function fileToAttachment(file, kind = "file") {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      var _a2;
      return resolve({ name: file.name, type: file.type || "application/octet-stream", size: file.size, kind: ((_a2 = file.type) == null ? void 0 : _a2.startsWith("image/")) ? kind === "sticker" ? "sticker" : "image" : kind, data: String(reader.result || "") });
    };
    reader.onerror = () => reject(reader.error || Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}
function renderAttachmentPreview(kind) {
  const box = previewFor(kind), items = draftFor(kind).map((item, index) => ({ item, index })).filter((entry) => entry.item.kind !== "sticker");
  if (!box) return;
  box.innerHTML = items.map(({ item, index }) => {
    var _a2;
    return `<span class="attach-chip">${((_a2 = item.type) == null ? void 0 : _a2.startsWith("image/")) ? `<img src="${item.data}" alt="">` : ""}<span>${esc(item.kind === "sticker" ? "表情" : item.name || "附件")}</span><button type="button" data-remove-attach="${index}">×</button></span>`;
  }).join("");
}
function renderChatPanel(kind, type = "emoji") {
  const panel = panelFor(kind);
  if (!panel) return;
  if (type === "stickers") {
    panel.innerHTML = `<div class="emoji-section">收藏表情 · 从 QQ 或本地挑图收藏</div><div class="sticker-grid"><button class="sticker-btn sticker-add" type="button" data-add-sticker title="添加收藏表情">＋</button>${stickerStore.map((item, i) => `<button class="sticker-btn" type="button" data-send-sticker="${i}" title="${esc(item.name || "表情包")}"><img src="${item.data}" alt=""></button>`).join("")}</div>`;
  } else {
    panel.innerHTML = `<div class="emoji-section">Hermes 像素表情</div><div class="emoji-grid">${builtinStickers.map((item, i) => `<button class="emoji-btn" type="button" data-send-builtin-sticker="${i}" title="${esc(item.name)}"><img src="${item.data}" alt="${esc(item.name)}"></button>`).join("")}</div>`;
  }
  panel.classList.add("open");
}
function setToolActive(kind, type) {
  const form = document.querySelector(kind === "mobile" ? "#mobileChatForm" : "#form");
  form == null ? void 0 : form.querySelectorAll("[data-panel]").forEach((button) => button.classList.toggle("active", button.dataset.panel === type));
}
function closeChatPanels() {
  document.querySelectorAll(".chat-panel").forEach((panel) => panel.classList.remove("open"));
  setToolActive("desktop", "");
  setToolActive("mobile", "");
}
function resolveStickerAsset(name, attachments = []) {
  const label = String(name || "").trim();
  if (!label) return null;
  const fromAttachments = attachments.find((item) => item && item.kind === "sticker" && String(item.name || "").trim() === label && (item.url || item.data));
  if (fromAttachments) return fromAttachments.url || fromAttachments.data;
  const builtin = builtinStickers.find((item) => String(item.name || "").trim() === label && item.data);
  if (builtin) return builtin.data;
  const local = stickerStore.find((item) => String(item.name || "").trim() === label && item.data);
  return local ? local.data : null;
}
function renderStickerText(text, attachments = []) {
  const source = String(text || "");
  if (!source) return "";
  const parts = [];
  let lastIndex = 0;
  const regex = /\[([^\]]+)\]/g;
  let match;
  while ((match = regex.exec(source))) {
    if (match.index > lastIndex) parts.push(esc(source.slice(lastIndex, match.index)));
    const label = String(match[1] || "").trim();
    const asset = resolveStickerAsset(label, attachments);
    parts.push(asset ? `<img class="inline-sticker" src="${esc(asset)}" alt="${esc(label)}" title="${esc(label)}">` : esc(match[0]));
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < source.length) parts.push(esc(source.slice(lastIndex)));
  return parts.join("");
}
function renderAttachments(items = []) {
  const visibleItems = items.filter((item) => item.kind !== "sticker");
  if (!visibleItems.length) return "";
  return `<div class="bubble-attachments">${visibleItems.map((item) => {
    if (String(item.type || "").startsWith("image/")) return `<a href="${esc(item.url || item.data)}" target="_blank"><img class="bubble-img" src="${esc(item.url || item.data)}" alt="${esc(item.name || "图片")}"></a>`;
    return `<a class="bubble-file" href="${esc(item.url || item.data)}" target="_blank">▣ ${esc(item.name || "文件")}</a>`;
  }).join("")}</div>`;
}
function messageTextHtml(text, attachments = []) {
  return `${renderStickerText(text, attachments)}${renderAttachments(attachments)}`;
}
function renderOwnBubbleMeta(message) {
  const time = `<span class="bubble-time">${msgTime(message.created)}</span>`;
  if (!message || !message._local) return time;
  if (message._sendState === "failed") {
    return `<button type="button" class="bubble-retry bubble-retry-float" data-retry-message="${esc(message.id)}" title="重新发送">!</button><span class="bubble-meta">${time}</span>`;
  }
  if (message._sendState === "retry_wait") {
    return `<span class="bubble-meta"><span class="bubble-send-state retrying">重试中</span>${time}</span>`;
  }
  return `<span class="bubble-meta"><span class="bubble-send-state">${message._retryAttempts ? `发送中 ${message._retryAttempts}/3` : "发送中"}</span>${time}</span>`;
}
function attachmentPrompt(items = []) {
  const stickers = items.filter((item) => item.kind === "sticker").map((item) => item.name || "表情包");
  if (stickers.length) return stickers.slice(0, 4).map((name) => `[${name}]`).join("");
  const images = items.filter((item) => String(item.type || "").startsWith("image/")).map((item) => item.name || "图片");
  if (images.length) return images.slice(0, 3).map((name) => `[图片:${name}]`).join("");
  return items.length ? items.slice(0, 3).map((item) => `[文件:${item.name || "文件"}]`).join("") : "";
}
function renderChat() {
  const box = document.querySelector("#chat"), baseAll = (state == null ? void 0 : state.messages) || [], demoPreview = currentPixelUniverseDemoPreview(baseAll), all = demoPreview ? [...baseAll, ...demoPreview.messages] : baseAll;
  applyPixelUniverseDemoOfficeTip(demoPreview);
  const dataHash = JSON.stringify(all.map((m) => [m.id, m.prompt, m.reply, m.status, m.mode, m.conversation, m.agent]));
  if (chatMode === "private") {
    const threadKey = `private:${selected || "none"}`;
    const hash = `private:${selected || "none"}:${dataHash}`;
    if (hash === _prevPrivateHash && _lastRenderVersion && _renderedChatMode === "private") return;
    if (_renderedChatMode !== "private") box.innerHTML = "";
    const items = all.filter((m) => m.mode !== "group" && m.agent === selected);
    if (!items.length) {
      box.innerHTML = '<div class="empty">还没有私聊。<br>点击员工后可以直接交流。</div>';
      restoreScroll(box, "desktop", threadKey, true);
      _prevPrivateHash = hash;
      _renderedChatMode = "private";
      _lastRenderVersion++;
      return;
    }
    const existing = new Set([...box.querySelectorAll(".msg-wrapper[data-msg-id]")].map((el) => el.dataset.msgId));
    const wanted = new Set(items.map((m) => String(m.id)));
    [...existing].forEach((id) => {
      if (!wanted.has(id)) {
        const el = findDataNode(box, ".msg-wrapper[data-msg-id]", "msgId", id);
        if (el) el.remove();
      }
    });
    items.forEach((m) => {
      let wrapper = findDataNode(box, ".msg-wrapper[data-msg-id]", "msgId", m.id);
      if (!wrapper) {
        wrapper = document.createElement("div");
        wrapper.className = "msg-wrapper";
        wrapper.dataset.msgId = m.id;
        box.appendChild(wrapper);
      }
      const reply = privateReplyText(m);
      wrapper.innerHTML = [
        m.prompt ? `<div class="bubble mine">${messageTextHtml(m.prompt, m.attachments)}${renderOwnBubbleMeta(m)}</div>` : "",
        `<div class="bubble theirs ${reply ? "" : "pending"}"><span class="bubble-name">${esc(m.name || "员工")}<span class="bubble-time">${msgTime(m.completed || m.created)}</span></span>${reply ? messageTextHtml(reply, m.attachments) : pendingReplyLabel(m)}</div>`
      ].join("");
    });
    markThreadSeen(threadKey, latestPrivateReplyTs(selected || ""));
    restoreScroll(box, "desktop", threadKey);
    _prevPrivateHash = hash;
    _renderedChatMode = "private";
  } else {
    const threadKey = "group:team";
    const hash = `group:${dataHash}`;
    if (hash === _prevGroupHash && _lastRenderVersion && _renderedChatMode === "group") return;
    if (_renderedChatMode !== "group") box.innerHTML = "";
    const items = all.filter((m) => isRenderableGroupMessage(m) && (m.conversation || "team") === "team"), groups = /* @__PURE__ */ new Map();
    items.forEach((m) => {
      const conv = m.conversation || "team";
      if (!groups.has(conv)) groups.set(conv, []);
      groups.get(conv).push(m);
    });
    if (!groups.size) {
      box.innerHTML = '<div class="empty">群里还安静得像午休时间。<br>抛个话题，成员会接话、追问或互相讨论。</div>';
      restoreScroll(box, "desktop", threadKey, true);
      _prevGroupHash = hash;
      _renderedChatMode = "group";
      _lastRenderVersion++;
      return;
    }
    const existingConv = new Set([...box.querySelectorAll(".conv-group[data-conv-id]")].map((el) => el.dataset.convId));
    const wantedConv = /* @__PURE__ */ new Set([...groups.keys()]);
    [...existingConv].forEach((k) => {
      if (!wantedConv.has(k)) {
        const el = findDataNode(box, ".conv-group[data-conv-id]", "convId", k);
        if (el) el.remove();
      }
    });
    [...groups.entries()].forEach(([conv, msgs]) => {
      let container = findDataNode(box, ".conv-group[data-conv-id]", "convId", conv);
      if (!container) {
        container = document.createElement("div");
        container.className = "conv-group";
        container.dataset.convId = conv;
        box.appendChild(container);
      }
      msgs.sort((a, b) => (a.created || 0) - (b.created || 0) || (a.round || 1) - (b.round || 1));
      const boss = msgs.find((m) => m.origin === "boss" && m.prompt) || msgs.find((m) => m.prompt);
      const html = [];
      let displayTs = 0;
      if (boss) html.push(`<div class="msg-wrapper" data-msg-id="boss-${esc(conv)}"><div class="bubble mine">${messageTextHtml(boss.prompt, boss.attachments)}${renderGameIdeaIntentBadge(boss)}${renderOwnBubbleMeta(boss)}</div></div>`);
      msgs.forEach((m) => {
        const short = (m.name || "员工").split(" ").slice(-1)[0], cl = validChatLines(m);
        if (cl.length) {
          const bubbles = cl.map((line, index) => {
            displayTs = nextChatDisplayTs(displayTs, m, index);
            return `<div class="bubble theirs" data-reply="${esc(short)}"><span class="bubble-name">${esc(short)}<span class="bubble-time">${msgTime(displayTs, true)}</span></span>${messageTextHtml(line, m.attachments)}</div>`;
          }).join("");
          html.push(`<div class="msg-wrapper" data-msg-id="${esc(m.id)}">${bubbles}</div>`);
        }
      });
      container.innerHTML = html.join("");
    });
    markThreadSeen(threadKey, latestGroupThreadTs());
    restoreScroll(box, "desktop", threadKey);
    _prevGroupHash = hash;
    _renderedChatMode = "group";
  }
  _lastRenderVersion++;
}
document.querySelector("#chat").addEventListener("scroll", () => captureScroll(document.querySelector("#chat"), "desktop", chatMode === "group" ? "group:team" : `private:${selected || "none"}`));
document.querySelector("#message").addEventListener("input", () => updateMentionMenu("desktop"));
document.querySelector("#message").addEventListener("click", () => updateMentionMenu("desktop"));
document.querySelector("#message").addEventListener("keyup", () => updateMentionMenu("desktop"));
document.querySelector("#mobileChatInput").addEventListener("input", () => updateMentionMenu("mobile"));
document.querySelector("#mobileChatInput").addEventListener("click", () => updateMentionMenu("mobile"));
document.querySelector("#mobileChatInput").addEventListener("keyup", () => updateMentionMenu("mobile"));
document.querySelectorAll("#message,#mobileChatInput").forEach((input) => {
  autoResizeInput(input);
  input.addEventListener("input", () => autoResizeInput(input));
});
document.querySelector("#mentionMenu").addEventListener("click", (e) => {
  const button = e.target.closest("[data-short]");
  if (!button) return;
  applyMention("desktop", button.dataset.short);
});
document.querySelector("#mobileMentionMenu").addEventListener("click", (e) => {
  const button = e.target.closest("[data-short]");
  if (!button) return;
  applyMention("mobile", button.dataset.short);
});
let pickerTargetKind = "desktop";
document.addEventListener("click", (e) => {
  var _a2, _b2, _c2, _d2;
  const panelButton = e.target.closest("[data-panel]");
  if (panelButton) {
    pickerTargetKind = panelButton.closest("#mobileChatForm") ? "mobile" : "desktop";
    const panel = panelFor(pickerTargetKind), type = panelButton.dataset.panel;
    if ((panel == null ? void 0 : panel.classList.contains("open")) && panel.dataset.type === type) {
      panel.classList.remove("open");
      setToolActive(pickerTargetKind, "");
      return;
    }
    if (panel) panel.dataset.type = type;
    renderChatPanel(pickerTargetKind, type);
    setToolActive(pickerTargetKind, type);
    return;
  }
  const pickerButton = e.target.closest("[data-pick]");
  if (pickerButton) {
    pickerTargetKind = pickerButton.closest("#mobileChatForm") ? "mobile" : "desktop";
    (_a2 = document.querySelector(pickerButton.dataset.pick === "image" ? "#imagePicker" : "#filePicker")) == null ? void 0 : _a2.click();
    return;
  }
  const remove = e.target.closest("[data-remove-attach]");
  if (remove) {
    const kind = remove.closest("#mobileChatForm") ? "mobile" : "desktop";
    draftFor(kind).splice(Number(remove.dataset.removeAttach), 1);
    renderAttachmentPreview(kind);
    return;
  }
  const emoji = e.target.closest("[data-emoji]");
  if (emoji) {
    const kind = emoji.closest("#mobileEmojiPanel") ? "mobile" : "desktop", input = document.querySelector(kind === "mobile" ? "#mobileChatInput" : "#message");
    input.value += emoji.dataset.emoji;
    input.focus();
    return;
  }
  const builtinSticker = e.target.closest("[data-send-builtin-sticker]");
  if (builtinSticker) {
    const item = builtinStickers[Number(builtinSticker.dataset.sendBuiltinSticker)], kind = builtinSticker.closest("#mobileEmojiPanel") ? "mobile" : "desktop";
    if (item) {
      appendStickerToken(kind, item.name);
      closeChatPanels();
      (_b2 = inputFor(kind)) == null ? void 0 : _b2.focus();
    }
    return;
  }
  const addSticker = e.target.closest("[data-add-sticker]");
  if (addSticker) {
    (_c2 = document.querySelector("#stickerPicker")) == null ? void 0 : _c2.click();
    return;
  }
  const sticker = e.target.closest("[data-send-sticker]");
  if (sticker) {
    const item = stickerStore[Number(sticker.dataset.sendSticker)], kind = sticker.closest("#mobileEmojiPanel") ? "mobile" : "desktop";
    if (item) {
      draftFor(kind).push({ ...item, kind: "sticker" });
      appendStickerToken(kind, item.name);
      renderAttachmentPreview(kind);
      closeChatPanels();
      (_d2 = inputFor(kind)) == null ? void 0 : _d2.focus();
    }
    return;
  }
  if (!e.target.closest(".chat-panel") && !e.target.closest(".chat-tool")) {
    closeChatPanels();
    setToolActive("desktop", "");
    setToolActive("mobile", "");
  }
});
async function addPickedFiles(input, kind, fileKind) {
  const files = [...input.files || []].slice(0, 6);
  input.value = "";
  if (!files.length) return;
  const converted = await Promise.all(files.map((file) => fileToAttachment(file, fileKind)));
  draftFor(kind).push(...converted);
  renderAttachmentPreview(kind);
}
document.querySelector("#imagePicker").addEventListener("change", (e) => addPickedFiles(e.target, pickerTargetKind, "image"));
document.querySelector("#filePicker").addEventListener("change", (e) => addPickedFiles(e.target, pickerTargetKind, "file"));
document.querySelector("#stickerPicker").addEventListener("change", async (e) => {
  const files = [...e.target.files || []].slice(0, 12);
  e.target.value = "";
  const converted = await Promise.all(files.map((file) => fileToAttachment(file, "sticker")));
  stickerStore.push(...converted.map((item) => ({ name: item.name, type: item.type, size: item.size, kind: "sticker", data: item.data })));
  stickerStore = stickerStore.slice(-80);
  saveStickers();
  renderChatPanel(pickerTargetKind, "stickers");
});
document.querySelector("#chat").addEventListener("click", (e) => {
  const retry = e.target.closest("[data-retry-message]");
  if (retry) {
    retryPendingMessage(retry.dataset.retryMessage);
    return;
  }
  if (chatMode !== "group") return;
  const bubble = e.target.closest("[data-reply]");
  if (!bubble) return;
  applyMention("desktop", bubble.dataset.reply);
});
document.querySelector("#mobileChatBody").addEventListener("scroll", () => captureScroll(document.querySelector("#mobileChatBody"), "mobile", scrollState.mobile.key || `${mobileState.chatMode}:${mobileState.agent || mobileState.conversation || "team"}`));
document.querySelector("#mobileChatBody").addEventListener("click", (e) => {
  const retry = e.target.closest("[data-retry-message]");
  if (retry) {
    retryPendingMessage(retry.dataset.retryMessage);
    return;
  }
  if (mobileState.chatMode !== "group") return;
  const bubble = e.target.closest("[data-reply]");
  if (!bubble) return;
  applyMention("mobile", bubble.dataset.reply);
});
document.querySelector("#mobileBottomNav").addEventListener("click", (e) => {
  const button = e.target.closest("button[data-tab]");
  if (!button) return;
  mobileState.tab = button.dataset.tab;
  mobileState.chatOpen = false;
  renderMobileShell();
});
document.querySelector("#mobileMessageTabs").addEventListener("click", (e) => {
  const button = e.target.closest("button[data-filter]");
  if (!button) return;
  mobileState.messageFilter = button.dataset.filter;
  renderMobileShell();
});
document.querySelector("#mobileContactTabs").addEventListener("click", (e) => {
  const button = e.target.closest("button[data-kind]");
  if (!button) return;
  mobileState.contactKind = button.dataset.kind;
  renderMobileShell();
});
document.querySelector("#mobileMessagesList").addEventListener("click", (e) => {
  const item = e.target.closest("[data-open-thread]");
  if (!item) return;
  item.dataset.openThread === "group" ? openMobileChatGroup(item.dataset.conversation || "team") : openMobileChatPrivate(item.dataset.agent);
});
document.querySelector("#mobileContactsList").addEventListener("click", (e) => {
  const item = e.target.closest("[data-open-thread]");
  if (!item) return;
  item.dataset.openThread === "group" ? openMobileChatGroup(item.dataset.conversation || "team") : openMobileChatPrivate(item.dataset.agent);
});
document.querySelector("#mobileTaskBoard").addEventListener("click", (e) => {
  const card = e.target.closest("[data-open-task]");
  if (!card) return;
  openMobileTaskDetail(card.dataset.openTask);
});
document.querySelector("#mobileBossBoard").addEventListener("click", (e) => {
  const card = e.target.closest("[data-open-task]");
  if (!card) return;
  openMobileTaskDetail(card.dataset.openTask);
});
document.querySelector("#mobileReviewBoard").addEventListener("click", (e) => {
  const card = e.target.closest("[data-open-task]");
  if (!card || !card.dataset.openTask) return;
  openMobileTaskDetail(card.dataset.openTask);
});
document.querySelector("#mobileTaskSheet").addEventListener("click", (e) => {
  const task = currentTaskDetail();
  if (e.target.closest("[data-close-task-sheet]") || e.target.closest("#mobileTaskSheetClose")) {
    closeMobileTaskDetail();
    return;
  }
  if (e.target.closest("#mobileTaskSheetOpenChat")) {
    if (!task) return;
    openMobileChatPrivate(task.assignee, { returnTab: "company" });
    return;
  }
  if (e.target.closest("#mobileTaskSheetResolve")) {
    if (!task) return;
    openMobileChatPrivate(task.assignee, { returnTab: "company", prefill: taskFollowupDraft(task) });
  }
});
document.querySelector("#mobileSearch").addEventListener("input", () => renderMobileShell());
document.querySelector("#mobileContactSearch").addEventListener("input", () => renderMobileShell());
(_a = document.querySelector("#mobileOpenOffice")) == null ? void 0 : _a.addEventListener("click", () => toggleOffice(true));
(_b = document.querySelector("#mobileOpenOffice2")) == null ? void 0 : _b.addEventListener("click", () => toggleOffice(true));
(_c = document.querySelector("#mobileOfficeButton")) == null ? void 0 : _c.addEventListener("click", () => toggleOffice(true));
(_d = document.querySelector("#mobileOfficeMenuBtn")) == null ? void 0 : _d.addEventListener("click", () => {
  var _a2;
  return (_a2 = document.querySelector("#mobileOfficeMenu")) == null ? void 0 : _a2.classList.toggle("open");
});
(_e = document.querySelector("#mobileOfficeMenu")) == null ? void 0 : _e.addEventListener("click", (e) => {
  var _a2;
  const button = e.target.closest("[data-office-menu]");
  if (!button) return;
  const action = button.dataset.officeMenu;
  (_a2 = document.querySelector("#mobileOfficeMenu")) == null ? void 0 : _a2.classList.remove("open");
  if (action === "edit") {
    setEditMode(true);
    return;
  }
  if (action === "game") {
    location.href = "/projects/companyverse/index.html";
    return;
  }
  if (!isMobileView()) {
    if (action === "group") setChatMode("group");
    return;
  }
  toggleOffice(false);
  if (action === "company") {
    mobileState.tab = "company";
    mobileState.chatOpen = false;
    renderMobileShell();
    return;
  }
  if (action === "group") {
    mobileState.tab = "messages";
    openMobileChatGroup("team");
    return;
  }
  mobileState.tab = "messages";
  mobileState.chatOpen = false;
  renderMobileShell();
});
(_f = document.querySelector("#mobileOfficeBack")) == null ? void 0 : _f.addEventListener("click", () => toggleOffice(false));
(_g = document.querySelector("#mobileEditBtn")) == null ? void 0 : _g.addEventListener("click", () => {
  setEditMode(!editMode);
});
(_h = document.querySelector("#mobileEditTop")) == null ? void 0 : _h.addEventListener("click", (e) => {
  const button = e.target.closest("[data-mobile-edit]");
  if (!button) return;
  const action = button.dataset.mobileEdit;
  if (action === "close") {
    setEditMode(false);
    return;
  }
  if (action === "settings") {
    document.querySelector("#sceneTip").textContent = "设置入口已保留，下一步会接入网格、吸附和物品库。";
    return;
  }
  if (action === "camera") {
    const order = ["office", "auto", "home"];
    const idx = Math.max(0, order.indexOf(cameraMode));
    cameraMode = order[(idx + 1) % order.length];
    currentRoom = "office";
    document.querySelectorAll(".camera button").forEach((b) => b.classList.toggle("active", b.dataset.camera === cameraMode));
    updateRoomUI();
    return;
  }
  setEditMode(true);
});
(_i = document.querySelector("#mobileEditRevert")) == null ? void 0 : _i.addEventListener("click", () => {
  revertCurrentEditSelection();
});
(_j = document.querySelector("#mobileEditConfirm")) == null ? void 0 : _j.addEventListener("click", async () => {
  try {
    await commitCurrentEditSelection();
  } catch (err) {
    document.querySelector("#sceneTip").textContent = "保存出错：" + err.message;
  }
});
(_k = document.querySelector("#mobileFocusGroup")) == null ? void 0 : _k.addEventListener("click", () => {
  mobileState.tab = "messages";
  openMobileChatGroup("team");
});
function closeMobileChatView() {
  if (!mobileChatScreen) {
    mobileState.chatOpen = false;
    mobileState.tab = mobileState.returnTab || "messages";
    renderMobileShell();
    return;
  }
  mobileChatScreen.classList.remove("dragging");
  mobileChatScreen.style.removeProperty("--mobile-chat-offset");
  mobileChatScreen.classList.add("closing");
  setTimeout(() => {
    mobileState.chatOpen = false;
    mobileState.tab = mobileState.returnTab || "messages";
    mobileChatScreen.classList.remove("closing");
    renderMobileShell();
  }, 210);
}
(_l = document.querySelector("#mobileChatBack")) == null ? void 0 : _l.addEventListener("click", () => {
  closeMobileChatView();
});
const mobileChatScreen = document.querySelector("#mobileChatScreen");
let mobileSwipeBack = null;
function swipePoint(touch) {
  return { x: touch.clientX ?? touch.pageX ?? 0, y: touch.clientY ?? touch.pageY ?? 0 };
}
function beginMobileSwipeBack(touch) {
  if (!mobileChatScreen || !mobileState.chatOpen || !isMobileView()) return;
  const point = swipePoint(touch);
  if (point.x > 28) return;
  const target = touch.target;
  if (target && target.closest("input, textarea, button, a, .chat-panel, .chat-tools, .bubble-file, .bubble-attachments")) return;
  mobileSwipeBack = { startX: point.x, startY: point.y, armed: false };
  mobileChatScreen.classList.add("dragging");
}
function moveMobileSwipeBack(touch) {
  if (!mobileSwipeBack || !mobileState.chatOpen || !isMobileView()) return;
  const point = swipePoint(touch);
  const dx = point.x - mobileSwipeBack.startX;
  const dy = point.y - mobileSwipeBack.startY;
  if (!mobileSwipeBack.armed) {
    if (dx <= 0 || Math.abs(dy) > 32 && Math.abs(dy) > Math.abs(dx)) {
      mobileChatScreen == null ? void 0 : mobileChatScreen.classList.remove("dragging");
      mobileChatScreen == null ? void 0 : mobileChatScreen.style.removeProperty("--mobile-chat-offset");
      mobileSwipeBack = null;
      return;
    }
    if (dx < 18 || Math.abs(dx) < Math.abs(dy)) return;
    mobileSwipeBack.armed = true;
  }
  mobileChatScreen == null ? void 0 : mobileChatScreen.style.setProperty("--mobile-chat-offset", `${Math.max(0, Math.min(dx, window.innerWidth || 420))}px`);
  if (dx >= 88 && Math.abs(dy) <= 72) {
    closeMobileChatView();
    mobileSwipeBack = null;
  }
}
function endMobileSwipeBack() {
  mobileChatScreen == null ? void 0 : mobileChatScreen.classList.remove("dragging");
  mobileChatScreen == null ? void 0 : mobileChatScreen.style.removeProperty("--mobile-chat-offset");
  mobileSwipeBack = null;
}
mobileChatScreen == null ? void 0 : mobileChatScreen.addEventListener("touchstart", (e) => {
  if (e.touches.length !== 1) return;
  beginMobileSwipeBack(e.touches[0]);
}, { passive: true });
mobileChatScreen == null ? void 0 : mobileChatScreen.addEventListener("touchmove", (e) => {
  if (e.touches.length !== 1) return;
  moveMobileSwipeBack(e.touches[0]);
}, { passive: true });
mobileChatScreen == null ? void 0 : mobileChatScreen.addEventListener("touchend", endMobileSwipeBack, { passive: true });
mobileChatScreen == null ? void 0 : mobileChatScreen.addEventListener("touchcancel", endMobileSwipeBack, { passive: true });
(_m = document.querySelector("#roomBack")) == null ? void 0 : _m.addEventListener("click", () => leaveRoom("button"));
(_n = document.querySelector("#roomHome")) == null ? void 0 : _n.addEventListener("click", () => goCompanyHome());
(_o = document.querySelector("#gameInteract")) == null ? void 0 : _o.addEventListener("click", () => leaveRoom("button"));
(_p = document.querySelector("#gameJump")) == null ? void 0 : _p.addEventListener("pointerdown", () => {
  gameJumpPressed = true;
});
(_q = document.querySelector("#gameJump")) == null ? void 0 : _q.addEventListener("pointerup", () => {
  gameJumpPressed = false;
});
// funMode removed - game mode accessible only through restroom
setupJoystick(canvas);
let _loadingCleared = false;
function stableOfficeSize() {
  return {
    w: Math.max(320, canvas.clientWidth || canvas.width || window.innerWidth || 960),
    h: Math.max(520, canvas.clientHeight || canvas.height || window.innerHeight || 720)
  };
}
function officeSpawnFor(id) {
  const size = stableOfficeSize(), spot = spots[id] || [0.5, 0.5];
  return { x: spot[0] * size.w + 46, y: spot[1] * size.h + 48 };
}
function latestPrivateAgentId() {
  const latest = ((state == null ? void 0 : state.messages) || []).filter((msg) => msg.mode !== "group" && msg.agent).sort((a, b) => (b.created || 0) - (a.created || 0))[0];
  return (latest == null ? void 0 : latest.agent) || "planner";
}
