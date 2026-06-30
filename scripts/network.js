var _a;
const AUTO_RETRY_ATTEMPTS = 3;
const AUTO_RETRY_DELAY_MS = 5e3;
const pendingRetryTimers = /* @__PURE__ */ new Map();
function applyServerState(data, source = "poll") {
  var _a2, _b, _c;
  if (data.error) throw Error(data.error);
  if (!_loadingCleared) {
    _loadingCleared = true;
    (_a2 = window._corgiLoadingDone) == null ? void 0 : _a2.call(window);
  }
  state = data;
  if ((_b = data.world) == null ? void 0 : _b.iso) {
    const parsed = Date.parse(data.world.iso);
    if (Number.isFinite(parsed)) {
      worldBaseMs = parsed;
      worldReceivedMs = Date.now();
    }
  }
  state.messages = mergePendingMessages(data.messages || []);
  syncFeed(data.team_feed);
  document.querySelector("#sync").textContent = (source === "sse" ? "长连接实时 · " : "实时连接 · ") + (/* @__PURE__ */ new Date()).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  updateWorldClockUi();
  document.querySelector("#project").textContent = "当前项目：" + (((_c = data.board) == null ? void 0 : _c.name) || "暂无");
  data.agents.forEach((d, i) => {
    if (!agents[d.id]) {
      const p = officeSpawnFor(d.id);
      agents[d.id] = { ...d, x: p.x, y: p.y, mode: "working", seed: i * 2, _spawned: true };
    }
    Object.assign(agents[d.id], d);
    const a = agents[d.id];
    const looksLikeBadBoot = !a._spawned && a.x < 70 && a.y < 70 || !Number.isFinite(a.x) || !Number.isFinite(a.y);
    if (looksLikeBadBoot) {
      const p = officeSpawnFor(d.id);
      a.x = p.x;
      a.y = p.y;
    }
    a._spawned = true;
  });
  if (chatMode === "group") setChatMode("group");
  else if (selected) select(selected, false);
  else select(latestPrivateAgentId(), false);
  renderMobileShell();
}
function redirectToLogin() {
  const sync = document.querySelector("#sync");
  if (sync) sync.textContent = "登录已过期 · 正在打开登录页";
  if (realtimeSource) {
    realtimeSource.close();
    realtimeSource = null;
  }
  const next = encodeURIComponent(location.pathname + location.search + location.hash);
  setTimeout(() => {
    location.href = "/login?next=" + next;
  }, 250);
}
function isAuthError(response, data) {
  return (response == null ? void 0 : response.status) === 401 || String((data == null ? void 0 : data.error) || "").includes("请先登录");
}
function apiUrl(path) {
  try {
    return new URL(path, window.location.origin || location.href).toString();
  } catch (err) {
    const cleanPath = String(path || "").startsWith("/") ? path : `/${String(path || "").replace(/^\/+/, "")}`;
    return `${location.protocol}//${location.host}${cleanPath}`;
  }
}
function safeRenderChatViews(mode) {
  if (!state) return;
  try {
    state.messages = mergePendingMessages(state.messages || []);
    if (mode === "group") mobileState.conversation = "team";
    renderChat();
    renderMobileShell();
  } catch (err) {
    console.warn("chat render failed", err);
    scheduleRefresh(120);
  }
}
function clearPendingRetryTimer(messageId) {
  const timer = pendingRetryTimers.get(messageId);
  if (timer) clearTimeout(timer);
  pendingRetryTimers.delete(messageId);
}
function updatePendingMessage(messageId, updater) {
  let updated = null;
  pendingMessages = pendingMessages.map((item) => {
    if (item.id !== messageId) return item;
    updated = typeof updater === "function" ? updater(item) : { ...item, ...updater };
    return updated;
  });
  return updated;
}
async function attemptPendingSend(messageId, manual = false) {
  var _a2;
  const current = pendingMessages.find((item) => item.id === messageId);
  if (!current || !current._sendPayload) return;
  clearPendingRetryTimer(messageId);
  const lockKey = current._lockKey || `${current._sendPayload.inputSelector || "chat"}:${current.mode}:${current.agent || "group"}`;
  if (sendLocks.has(lockKey)) return;
  sendLocks.add(lockKey);
  const active = updatePendingMessage(messageId, (item) => ({
    ...item,
    status: "todo",
    reply: null,
    _sendState: "sending",
    _manualRetryAt: manual ? Date.now() : item._manualRetryAt
  }));
  safeRenderChatViews((active == null ? void 0 : active.mode) || current.mode);
  try {
    const payload = active == null ? void 0 : active._sendPayload;
    const r = await fetch(apiUrl("/api/message"), { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ mode: payload.mode, agent: payload.agent, message: payload.message, attachments: payload.attachments, board: payload.board }) });
    const data = await r.json();
    if (isAuthError(r, data)) {
      redirectToLogin();
      return;
    }
    if (!r.ok) throw Error(data.error);
    clearPendingRetryTimer(messageId);
    pendingMessages = pendingMessages.filter((item) => item.id !== messageId);
    if (((_a2 = active == null ? void 0 : active._sendPayload) == null ? void 0 : _a2.mode) === "group") mobileState.conversation = "team";
    rememberPending(data.messages || []);
    beginFastRefresh();
    scheduleRefresh(80);
  } catch (err) {
    const latest = pendingMessages.find((item) => item.id === messageId) || current;
    const retriesUsed = latest._retryAttempts || 0;
    if (retriesUsed < AUTO_RETRY_ATTEMPTS) {
      const nextRetry = retriesUsed + 1;
      updatePendingMessage(messageId, (item) => ({
        ...item,
        status: "retrying",
        reply: `消息发送失败，${AUTO_RETRY_DELAY_MS / 1e3}秒后自动重试（${nextRetry}/${AUTO_RETRY_ATTEMPTS}）`,
        _sendState: "retry_wait",
        _retryAttempts: nextRetry,
        _lastError: err.message
      }));
      pendingRetryTimers.set(messageId, setTimeout(() => {
        attemptPendingSend(messageId, false);
      }, AUTO_RETRY_DELAY_MS));
    } else {
      updatePendingMessage(messageId, (item) => ({
        ...item,
        status: "blocked",
        reply: "消息未送达：" + err.message,
        _sendState: "failed",
        _lastError: err.message
      }));
    }
    safeRenderChatViews(latest.mode);
  } finally {
    sendLocks.delete(lockKey);
  }
}
function retryPendingMessage(messageId) {
  const current = pendingMessages.find((item) => item.id === messageId);
  if (!current) return;
  updatePendingMessage(messageId, (item) => ({
    ...item,
    status: "todo",
    reply: null,
    _sendState: "sending",
    _retryAttempts: 0
  }));
  safeRenderChatViews(current.mode);
  attemptPendingSend(messageId, true);
}
window.retryPendingMessage = retryPendingMessage;
function connectRealtime() {
  if (!window.EventSource || realtimeSource) return;
  realtimeSource = new EventSource(apiUrl("/api/events"));
  realtimeSource.addEventListener("open", () => {
    var _a2;
    realtimeConnected = true;
    clearTimeout(refreshTimer);
    clearTimeout(realtimeRetryTimer);
    document.querySelector("#sync").textContent = "长连接实时 · 已连接";
    (_a2 = window._corgiLoadingDone) == null ? void 0 : _a2.call(window);
  });
  realtimeSource.addEventListener("state", (event) => {
    realtimeConnected = true;
    try {
      applyServerState(JSON.parse(event.data), "sse");
    } catch (e) {
      console.warn(e);
    }
  });
  realtimeSource.addEventListener("error", () => {
    realtimeConnected = false;
    if (realtimeSource) {
      realtimeSource.close();
      realtimeSource = null;
    }
    document.querySelector("#sync").textContent = "长连接重连中 · 暂用普通同步";
    scheduleRefresh(600);
    clearTimeout(realtimeRetryTimer);
    realtimeRetryTimer = setTimeout(connectRealtime, 1800);
  });
}
async function refresh() {
  try {
    const r = await fetch(apiUrl("/api/state"), { cache: "no-store", credentials: "same-origin" });
    const data = await r.json();
    if (isAuthError(r, data)) {
      redirectToLogin();
      return;
    }
    applyServerState(data, "poll");
    setTimeout(() => {
      var _a2;
      return (_a2 = window._corgiLoadingDone) == null ? void 0 : _a2.call(window);
    }, 800);
  } catch (e) {
    document.querySelector("#sync").textContent = "连接暂时中断，正在重试";
  }
  scheduleRefresh();
}
connectRealtime();
refresh();
async function sendChatMessage(inputSelector, mode, agentId) {
  var _b, _c, _d;
  const input = document.querySelector(inputSelector), kind = draftKindFromInput(inputSelector), message = input.value.trim(), attachments = draftFor(kind).slice();
  if (!message && !attachments.length || mode === "private" && !agentId) return;
  const lockKey = `${inputSelector}:${mode}:${agentId || "group"}`;
  if (sendLocks.has(lockKey)) return;
  closeMentionMenu(inputSelector === "#mobileChatInput" ? "mobile" : "desktop");
  closeChatPanels();
  input.value = "";
  if (typeof autoResizeInput === "function") autoResizeInput(input);
  attachmentDrafts[kind] = [];
  renderAttachmentPreview(kind);
  input.disabled = true;
  const createdAt = Date.now() / 1e3, tempId = `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const prompt = message || attachmentPrompt(attachments) || "[附件]";
  const tempMessage = mode === "group" ? {
    id: tempId,
    agent: "planner",
    prompt,
    reply: null,
    status: "todo",
    created: createdAt,
    mode: "group",
    conversation: "local-" + tempId,
    round: 1,
    origin: "boss",
    chat_lines: [],
    name: (agents.planner == null ? void 0 : agents.planner.name) || "策划主编 小韩",
    attachments,
    _local: true,
    _retryAttempts: 0,
    _sendState: "sending",
    _lockKey: lockKey,
    _sendPayload: { mode, agent: agentId, message, attachments, board: ((_d = state == null ? void 0 : state.board) == null ? void 0 : _d.slug) || "default", inputSelector }
  } : {
    id: tempId,
    agent: agentId,
    prompt,
    reply: null,
    status: "todo",
    created: createdAt,
    mode: "private",
    conversation: null,
    round: null,
    chat_lines: [],
    name: ((_b = agents[agentId]) == null ? void 0 : _b.name) || ((_c = fallbackMentions.find((a) => a.id === agentId)) == null ? void 0 : _c.name) || "员工",
    attachments,
    _local: true,
    _retryAttempts: 0,
    _sendState: "sending",
    _lockKey: lockKey,
    _sendPayload: { mode, agent: agentId, message, attachments, board: ((_d = state == null ? void 0 : state.board) == null ? void 0 : _d.slug) || "default", inputSelector }
  };
  pendingMessages.push(tempMessage);
  safeRenderChatViews(mode);
  beginFastRefresh();
  scheduleRefresh(80);
  attemptPendingSend(tempId, false).finally(() => {
    input.disabled = false;
    input.focus();
  });
}
document.querySelector("#form").addEventListener("submit", async (e) => {
  e.preventDefault();
  await sendChatMessage("#message", chatMode, selected);
});
document.querySelector("#mobileChatForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  await sendChatMessage("#mobileChatInput", mobileState.chatMode, mobileState.chatMode === "private" ? mobileState.agent : selected);
});
(_a = document.querySelector("#fishMode")) == null ? void 0 : _a.addEventListener("click", () => {
  location.href = "/fish.html";
});
document.querySelector("#gameHub").addEventListener("click", () => {
  location.href = "/projects/companyverse/index.html";
});
document.querySelector("#mobileGameHub").addEventListener("click", () => {
  location.href = "/projects/companyverse/index.html";
});
updateRoomUI();
function reportBootIssue(message) {
  const ls = document.getElementById("loading-screen");
  const text = ls == null ? void 0 : ls.querySelector(".loading-text");
  if (text) text.textContent = message;
}
window.addEventListener("error", (event) => {
  var _a2;
  const msg = String(((_a2 = event == null ? void 0 : event.error) == null ? void 0 : _a2.message) || (event == null ? void 0 : event.message) || "页面脚本初始化失败");
  reportBootIssue("加载出错：" + msg);
});
window.addEventListener("unhandledrejection", (event) => {
  const reason = event == null ? void 0 : event.reason;
  const msg = String((reason == null ? void 0 : reason.message) || reason || "页面初始化 Promise 失败");
  reportBootIssue("加载出错：" + msg);
});
setTimeout(async () => {
  var _a2;
  const ls = document.getElementById("loading-screen");
  if (!ls || ls.style.display === "none" || !ls.classList.contains("visible")) return;
  const firstTryKey = "hermes-force-refresh-once";
  reportBootIssue("加载超时，正在刷新资源...");
  if (sessionStorage.getItem(firstTryKey)) return;
  sessionStorage.setItem(firstTryKey, "1");
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister().catch(() => {
      })));
    }
    if ((_a2 = window.caches) == null ? void 0 : _a2.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith("hermes-iphone-client-")).map((key) => caches.delete(key).catch(() => false)));
    }
  } catch (e) {
  }
  location.replace(location.pathname + location.search + (location.search ? "&" : "?") + "v=bootfix-20260629");
}, 8e3);
(function() {
  const ls = document.getElementById("loading-screen");
  const lc = document.getElementById("loading-canvas");
  if (!ls || !lc) return;
  const lctx = lc.getContext("2d");
  let yawnT = 0, yawnActive = true;
  function drawYawnCorgi(t) {
    lctx.fillStyle = "#15191a";
    lctx.fillRect(0, 0, 128, 128);
    const s = 4.2;
    const cx = 64, cy = 68;
    lctx.fillStyle = "#d99a4e";
    lctx.fillRect(cx - 16 * s, s * 5, 28 * s, 16 * s);
    lctx.fillRect(cx - 10 * s, s * 2, 16 * s, 14 * s);
    lctx.fillStyle = "#8b5a2b";
    lctx.fillRect(cx - 10 * s, s * 0, 6 * s, 6 * s);
    lctx.fillRect(cx + 4 * s, s * 0, 6 * s, 6 * s);
    lctx.fillStyle = "#f5b1a5";
    lctx.fillRect(cx - 8 * s, s * 1, 2 * s, 3 * s);
    lctx.fillRect(cx + 6 * s, s * 1, 2 * s, 3 * s);
    lctx.fillStyle = "#263238";
    lctx.fillRect(cx - 6 * s, s * 5, 4 * s, 2 * s);
    lctx.fillRect(cx + 2 * s, s * 5, 4 * s, 2 * s);
    lctx.fillStyle = "#263238";
    lctx.fillRect(cx - 1 * s, s * 7, 3 * s, 2 * s);
    lctx.fillStyle = "#f5b1a5";
    lctx.fillRect(cx - 5 * s, s * 8, 11 * s, 3 * s);
    lctx.fillStyle = "#e88a8a";
    lctx.fillRect(cx - 2 * s, s * 9, 6 * s, 2 * s);
    lctx.fillStyle = "#fff0cf";
    lctx.fillRect(cx - 12 * s, s * 18, 5 * s, 6 * s);
    lctx.fillRect(cx + 8 * s, s * 18, 5 * s, 6 * s);
    lctx.fillStyle = "#263238";
    lctx.fillRect(cx - 12 * s, s * 22, 5 * s, 2 * s);
    lctx.fillRect(cx + 8 * s, s * 22, 5 * s, 2 * s);
    lctx.fillStyle = "#8b5a2b";
    lctx.fillRect(cx + 12 * s, s * 6, 6 * s, 10 * s);
    const wag = Math.sin(t / 300) * 2;
    lctx.fillStyle = "#8b5a2b";
    lctx.fillRect(cx - 18 * s, s * 8 + wag, 4 * s, 8 * s);
    const sparkle = Math.sin(t / 400);
    if (sparkle > 0.5) {
      lctx.fillStyle = "#f2d06c";
      lctx.fillRect(cx + 4 * s, s * -2 + Math.floor(sparkle * 4), 2 * s, 2 * s);
      lctx.fillRect(cx + 6 * s, s * -1 + Math.floor(sparkle * 2), 2 * s, 2 * s);
    }
    if (t % 2e3 > 600) {
      lctx.fillStyle = "#d7e1dc";
      lctx.font = "bold 14px monospace";
      lctx.fillText("Z", cx + 18 * s, s * 6 + Math.floor((t % 2e3 - 600) / 200) * 8);
    }
    const barW = 60, barH = 4;
    const progress = (Math.sin(t / 1200) * 0.5 + 0.5) * 0.85;
    lctx.fillStyle = "#2a3a3a";
    lctx.fillRect(64 - barW / 2, 110, barW, barH);
    lctx.fillStyle = "#6ec3a0";
    lctx.fillRect(64 - barW / 2, 110, barW * progress, barH);
  }
  function loadFrame() {
    if (yawnActive) drawYawnCorgi(yawnT);
    yawnT++;
    if (yawnActive) requestAnimationFrame(loadFrame);
  }
  loadFrame();
  window._corgiLoadingDone = function() {
    yawnActive = false;
    ls.classList.add("fade-out");
    setTimeout(() => {
      ls.classList.remove("visible", "fade-out");
      ls.style.display = "none";
    }, 700);
  };
})();
