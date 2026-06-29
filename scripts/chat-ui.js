var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q;
function msgTime(ts) {
  if (!ts) return "";
  return new Date(ts * 1e3).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
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
function isMobileView() {
  return innerWidth <= 700;
}
function avatarMarkup(id, label, size = "small") {
  return `<div class="mobile-avatar ${size}">${esc(label || (id || "?").slice(0, 1).toUpperCase())}</div>`;
}
function uiNoise(text) {
  return englishLeak(text) || /^(消息[:：]?|Done\.|As\s|Already completed|任务完成|任务已完成|完成。作为|作为.+?(发了|回复了)|\[Acknowledged\]|\d+\.)/i.test(cleanSpeechText(text)) || /(任务完成|任务已完成|群聊规则|控制在4-60字|符合群聊规则|自然收尾|没有制造额外任务|消息已发送|纯闲聊回复|输出\[SILENT\]|\[SILENT\]|围绕.+?话题|保持沉默|老板宣布散会|总结[:：]?|摘要[:：]?)/.test(cleanSpeechText(text));
}
function compactText(text, max = 42) {
  const cleaned = cleanSpeechText(text).replace(/^消息[:：]?\s*/, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.length > max ? cleaned.slice(0, max - 1) + "…" : cleaned;
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
    const thread = messages.filter((msg) => msg.agent === agent.id).sort((a, b) => (b.created || 0) - (a.created || 0))[0];
    return {
      kind: "private",
      key: `private-${agent.id}`,
      agent: agent.id,
      name: agent.short || agent.name,
      role: agent.role,
      preview: threadPreview(thread) || compactText(agent.social_summary || agent.task, 46),
      time: msgTime(thread == null ? void 0 : thread.created),
      rawTime: (thread == null ? void 0 : thread.created) || 0,
      badge: agent.status === "blocked" ? 1 : 0,
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
  const items = ((state == null ? void 0 : state.messages) || []).filter((msg) => msg.mode === "group");
  const latestFeed = ((state == null ? void 0 : state.team_feed) || []).filter((item) => (item == null ? void 0 : item.text) && !uiNoise(item.text)).slice(-1)[0];
  const latestMessage = items.slice().sort((a, b) => (b.created || 0) - (a.created || 0))[0];
  return [{
    kind: "group",
    key: "group-team",
    conversation: "team",
    name: "全员群聊",
    preview: compactText((latestFeed == null ? void 0 : latestFeed.text) || threadPreview(latestMessage) || ((_a2 = state == null ? void 0 : state.board) == null ? void 0 : _a2.name) || "团队频道", 54),
    time: msgTime((latestFeed == null ? void 0 : latestFeed.created) || (latestMessage == null ? void 0 : latestMessage.created)),
    rawTime: (latestFeed == null ? void 0 : latestFeed.created) || (latestMessage == null ? void 0 : latestMessage.created) || 0,
    badge: ((state == null ? void 0 : state.agents) || []).filter((agent) => agent.status === "blocked").length
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
  const unread = ((state == null ? void 0 : state.agents) || []).filter((agent) => agent.status === "blocked").length + (((state == null ? void 0 : state.team_feed) || []).length ? 1 : 0);
  document.querySelector("#mobileMsgBadge").textContent = String(Math.min(99, Math.max(1, unread)));
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
  document.querySelector("#mobileContactBadge").textContent = String(((state == null ? void 0 : state.agents) || []).length);
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
  const company = (state == null ? void 0 : state.company) || {}, notices = ((_a2 = company.pending_notices) == null ? void 0 : _a2.length) ? company.pending_notices : [], roles = ((_b2 = company.open_roles) == null ? void 0 : _b2.length) ? company.open_roles : [], relations = ((state == null ? void 0 : state.agents) || []).map((agent) => `${agent.short || agent.name}：${agent.relationship_summary || "暂无关系备注"}`);
  document.querySelector("#mobileWorldLabel").textContent = ((_c2 = state == null ? void 0 : state.world) == null ? void 0 : _c2.label) || "读取中";
  document.querySelector("#mobileWeatherChip").textContent = ((_d2 = state == null ? void 0 : state.world) == null ? void 0 : _d2.weather) || "天气";
  document.querySelector("#mobileCompanyBadge").textContent = String(Math.max(1, notices.length + roles.length));
  document.querySelector("#mobileCompanySummary").textContent = `${company.studio_name || "Hermes Pixel Works"} 正在推进「${((_e2 = state == null ? void 0 : state.board) == null ? void 0 : _e2.name) || "暂无项目"}」，当前为 ${(state == null ? void 0 : state.world) ? worldClockText(true) : "--:--"} · ${((_f2 = state == null ? void 0 : state.world) == null ? void 0 : _f2.next) || "等待下一阶段"}`;
  document.querySelector("#mobileNotices").innerHTML = [...notices, ...roles.map((role) => `开放岗位：${role}`)].map((item) => `<li>${esc(item)}</li>`).join("") || "<li>暂无招聘通知，工位保持满编。</li>";
  document.querySelector("#mobileRelations").innerHTML = relations.map((item) => `<li>${esc(item)}</li>`).join("");
}
function renderMobileChatScreen() {
  var _a2, _b2;
  const screen = document.querySelector("#mobileChatScreen"), body = document.querySelector("#mobileChatBody"), title = document.querySelector("#mobileChatTitle"), subtitle = document.querySelector("#mobileChatSubtitle");
  screen.classList.toggle("open", mobileState.chatOpen);
  if (mobileState.chatMode !== "group") closeMentionMenu("mobile");
  if (!mobileState.chatOpen) return;
  const all = (state == null ? void 0 : state.messages) || [];
  if (mobileState.chatMode === "private") {
    const agent = agentById(mobileState.agent) || agentById(selected) || ((_a2 = state == null ? void 0 : state.agents) == null ? void 0 : _a2[0]);
    const threadKey2 = `private:${(agent == null ? void 0 : agent.id) || "none"}`;
    title.textContent = (agent == null ? void 0 : agent.short) || "私聊";
    subtitle.textContent = agent ? `${agent.role} · ${activityText({ ...agents[agent.id], ...agent })}` : "连接中";
    const items = all.filter((msg) => msg.mode !== "group" && msg.agent === (agent == null ? void 0 : agent.id)).sort((a, b) => (a.created || 0) - (b.created || 0));
    if (!items.length) {
      body.innerHTML = '<div class="empty">还没有私聊。<br>先去戳一下这位员工。</div>';
      return;
    }
    const existing = new Set([...body.querySelectorAll(".msg-wrapper[data-msg-id]")].map((el) => el.dataset.msgId));
    const wanted = new Set(items.map((m) => String(m.id)));
    [...existing].forEach((id) => {
      if (!wanted.has(id)) {
        const el = body.querySelector(`.msg-wrapper[data-msg-id="${id}"]`);
        if (el) el.remove();
      }
    });
    items.forEach((m) => {
      let wrapper = body.querySelector(`.msg-wrapper[data-msg-id="${m.id}"]`);
      if (!wrapper) {
        wrapper = document.createElement("div");
        wrapper.className = "msg-wrapper";
        wrapper.dataset.msgId = m.id;
        body.appendChild(wrapper);
      }
      const reply = cleanSpeechText(m.reply || "");
      wrapper.innerHTML = [
        m.prompt ? `<div class="bubble mine">${messageTextHtml(m.prompt, m.attachments)}<span class="bubble-time">${msgTime(m.created)}</span></div>` : "",
        `<div class="bubble theirs ${reply ? "" : "pending"}"><span class="bubble-name">${esc(agent.short || agent.name || "员工")}<span class="bubble-time">${msgTime(m.completed || m.created)}</span></span>${esc(reply ? compactText(reply, 400) : m.status === "blocked" ? "遇到问题，正在整理需要你决定的事项..." : "正在处理并组织回复...")}</div>`
      ].join("");
    });
    return;
  }
  const threadKey = `group:${mobileState.conversation || "team"}`;
  title.textContent = mobileState.conversation === "team" ? "全员群聊" : "群聊讨论";
  subtitle.textContent = ((_b2 = state == null ? void 0 : state.board) == null ? void 0 : _b2.name) || "团队频道";
  const groups = /* @__PURE__ */ new Map();
  all.filter((msg) => msg.mode === "group" && (mobileState.conversation === "team" || msg.conversation === mobileState.conversation)).forEach((msg) => {
    const key = mobileState.conversation === "team" ? msg.conversation || "team" : mobileState.conversation || "team";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(msg);
  });
  if (!groups.size) {
    body.innerHTML = '<div class="empty">群里还很安静。<br>发个话题试试。</div>';
    return;
  }
  const existingConv = new Set([...body.querySelectorAll(".conv-group[data-conv-id]")].map((el) => el.dataset.convId));
  const wantedConv = /* @__PURE__ */ new Set([...groups.keys()]);
  [...existingConv].forEach((k) => {
    if (!wantedConv.has(k)) {
      const el = body.querySelector(`.conv-group[data-conv-id="${k}"]`);
      if (el) el.remove();
    }
  });
  [...groups.entries()].forEach(([key, msgs]) => {
    let container = body.querySelector(`.conv-group[data-conv-id="${key}"]`);
    if (!container) {
      container = document.createElement("div");
      container.className = "conv-group";
      container.dataset.convId = key;
      body.appendChild(container);
    }
    msgs.sort((a, b) => (a.created || 0) - (b.created || 0) || (a.round || 1) - (b.round || 1));
    const boss = msgs.find((m) => m.origin === "boss" && m.prompt) || msgs.find((m) => m.prompt);
    const html = [];
    if (boss) html.push(`<div class="msg-wrapper" data-msg-id="boss-${esc(key)}"><div class="bubble mine">${messageTextHtml(boss.prompt, boss.attachments)}<span class="bubble-time">${msgTime(boss.created)}</span></div></div>`);
    msgs.forEach((m) => {
      const speaker = (m.name || "员工").split(" ").slice(-1)[0], cl = validChatLines(m);
      if (cl.length) {
        html.push(`<div class="msg-wrapper" data-msg-id="${esc(m.id)}">${cl.map((line) => `<div class="bubble theirs" data-reply="${esc(speaker)}"><span class="bubble-name">${esc(speaker)}<span class="bubble-time">${msgTime(m.completed || m.created)}</span></span>${esc(line)}</div>`).join("")}</div>`);
      } else if (!m._local && m.status !== "done" && m.status !== "archived") {
        html.push(`<div class="msg-wrapper" data-msg-id="${esc(m.id)}"><div class="bubble theirs pending" data-reply="${esc(speaker)}"><span class="bubble-name">${esc(speaker)}</span>正在处理...</div></div>`);
      }
    });
    container.innerHTML = html.join("");
  });
}
function renderMobileShell() {
  if (!state) return;
  document.querySelectorAll(".mobile-page").forEach((page) => page.classList.toggle("active", page.dataset.page === mobileState.tab));
  document.querySelector("#mobileBottomNav").querySelectorAll("button").forEach((button) => button.classList.toggle("active", button.dataset.tab === mobileState.tab));
  renderMobileMessages();
  renderMobileContacts();
  renderMobileCompany();
  renderMobileChatScreen();
}
function openMobileChatPrivate(id) {
  mobileState.chatOpen = true;
  mobileState.chatMode = "private";
  mobileState.agent = id;
  scrollState.mobile.key = "";
  closeMentionMenu("mobile");
  selected = id;
  setChatMode("private");
  select(id, false);
  renderMobileShell();
}
function openMobileChatGroup(conversation = "team") {
  mobileState.chatOpen = true;
  mobileState.chatMode = "group";
  mobileState.conversation = conversation;
  scrollState.mobile.key = "";
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
  if (forceBottom || info.key !== threadKey) box.scrollTop = box.scrollHeight;
  else if (info.stick) box.scrollTop = box.scrollHeight;
  else box.scrollTop = Math.min(info.top, Math.max(0, box.scrollHeight - box.clientHeight));
  info.key = threadKey;
  info.top = box.scrollTop;
  info.stick = box.scrollHeight - box.clientHeight - box.scrollTop < 36;
}
function mergePendingMessages(realMessages) {
  const real = (realMessages || []).slice();
  pendingMessages = pendingMessages.filter((pending) => {
    if (real.some((msg) => msg.id === pending.id)) return false;
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
  const box = previewFor(kind), items = draftFor(kind);
  if (!box) return;
  box.innerHTML = items.map((item, i) => {
    var _a2;
    return `<span class="attach-chip">${((_a2 = item.type) == null ? void 0 : _a2.startsWith("image/")) ? `<img src="${item.data}" alt="">` : ""}<span>${esc(item.kind === "sticker" ? "表情" : item.name || "附件")}</span><button type="button" data-remove-attach="${i}">×</button></span>`;
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
function renderAttachments(items = []) {
  if (!items.length) return "";
  return `<div class="bubble-attachments">${items.map((item) => {
    if (String(item.type || "").startsWith("image/")) return `<a href="${esc(item.url || item.data)}" target="_blank"><img class="bubble-img" src="${esc(item.url || item.data)}" alt="${esc(item.name || "图片")}"></a>`;
    return `<a class="bubble-file" href="${esc(item.url || item.data)}" target="_blank">▣ ${esc(item.name || "文件")}</a>`;
  }).join("")}</div>`;
}
function messageTextHtml(text, attachments = []) {
  const clean = esc(text || "");
  const showText = text && !(text === "[表情包]" && attachments.length === 1) ? clean : "";
  return `${showText}${renderAttachments(attachments)}`;
}
function attachmentPrompt(items = []) {
  const stickers = items.filter((item) => item.kind === "sticker").map((item) => item.name || "表情包");
  if (stickers.length) return stickers.slice(0, 4).map((name) => `[${name}]`).join("");
  const images = items.filter((item) => String(item.type || "").startsWith("image/")).map((item) => item.name || "图片");
  if (images.length) return images.slice(0, 3).map((name) => `[图片:${name}]`).join("");
  return items.length ? items.slice(0, 3).map((item) => `[文件:${item.name || "文件"}]`).join("") : "";
}
function renderChat() {
  const box = document.querySelector("#chat"), all = (state == null ? void 0 : state.messages) || [];
  const dataHash = JSON.stringify(all.map((m) => [m.id, m.prompt, m.reply, m.status, m.mode, m.conversation, m.agent]));
  if (chatMode === "private") {
    const hash = `private:${selected || "none"}:${dataHash}`;
    if (hash === _prevPrivateHash && _lastRenderVersion && _renderedChatMode === "private") return;
    if (_renderedChatMode !== "private") box.innerHTML = "";
    const items = all.filter((m) => m.mode !== "group" && m.agent === selected);
    if (!items.length) {
      box.innerHTML = '<div class="empty">还没有私聊。<br>点击员工后可以直接交流。</div>';
      _prevPrivateHash = hash;
      _renderedChatMode = "private";
      _lastRenderVersion++;
      return;
    }
    const existing = new Set([...box.querySelectorAll(".msg-wrapper[data-msg-id]")].map((el) => el.dataset.msgId));
    const wanted = new Set(items.map((m) => String(m.id)));
    [...existing].forEach((id) => {
      if (!wanted.has(id)) {
        const el = box.querySelector(`.msg-wrapper[data-msg-id="${id}"]`);
        if (el) el.remove();
      }
    });
    items.forEach((m) => {
      let wrapper = box.querySelector(`.msg-wrapper[data-msg-id="${m.id}"]`);
      if (!wrapper) {
        wrapper = document.createElement("div");
        wrapper.className = "msg-wrapper";
        wrapper.dataset.msgId = m.id;
        box.appendChild(wrapper);
      }
      const reply = cleanSpeechText(m.reply || "");
      wrapper.innerHTML = [
        m.prompt ? `<div class="bubble mine">${messageTextHtml(m.prompt, m.attachments)}<span class="bubble-time">${msgTime(m.created)}</span></div>` : "",
        `<div class="bubble theirs ${reply ? "" : "pending"}"><span class="bubble-name">${esc(m.name || "员工")}<span class="bubble-time">${msgTime(m.completed || m.created)}</span></span>${reply ? esc(reply) : m.status === "blocked" ? "遇到问题，正在整理需要你决定的事项..." : "正在处理并组织回复..."}</div>`
      ].join("");
    });
    _prevPrivateHash = hash;
    _renderedChatMode = "private";
  } else {
    const hash = `group:${dataHash}`;
    if (hash === _prevGroupHash && _lastRenderVersion && _renderedChatMode === "group") return;
    if (_renderedChatMode !== "group") box.innerHTML = "";
    const items = all.filter((m) => m.mode === "group"), groups = /* @__PURE__ */ new Map();
    items.forEach((m) => {
      if (!groups.has(m.conversation)) groups.set(m.conversation, []);
      groups.get(m.conversation).push(m);
    });
    if (!groups.size) {
      box.innerHTML = '<div class="empty">群里还很安静。<br>发个话题，成员会接话、追问或互相讨论。</div>';
      _prevGroupHash = hash;
      _renderedChatMode = "group";
      _lastRenderVersion++;
      return;
    }
    const existingConv = new Set([...box.querySelectorAll(".conv-group[data-conv-id]")].map((el) => el.dataset.convId));
    const wantedConv = /* @__PURE__ */ new Set([...groups.keys()]);
    [...existingConv].forEach((k) => {
      if (!wantedConv.has(k)) {
        const el = box.querySelector(`.conv-group[data-conv-id="${k}"]`);
        if (el) el.remove();
      }
    });
    [...groups.entries()].forEach(([conv, msgs]) => {
      let container = box.querySelector(`.conv-group[data-conv-id="${conv}"]`);
      if (!container) {
        container = document.createElement("div");
        container.className = "conv-group";
        container.dataset.convId = conv;
        box.appendChild(container);
      }
      msgs.sort((a, b) => (a.created || 0) - (b.created || 0) || (a.round || 1) - (b.round || 1));
      const boss = msgs.find((m) => m.origin === "boss" && m.prompt) || msgs.find((m) => m.prompt);
      const html = [];
      if (boss) html.push(`<div class="msg-wrapper" data-msg-id="boss-${esc(conv)}"><div class="bubble mine">${messageTextHtml(boss.prompt, boss.attachments)}<span class="bubble-time">${msgTime(boss.created)}</span></div></div>`);
      msgs.forEach((m) => {
        const short = (m.name || "员工").split(" ").slice(-1)[0], cl = validChatLines(m);
        if (cl.length) {
          html.push(`<div class="msg-wrapper" data-msg-id="${esc(m.id)}">${cl.map((line) => `<div class="bubble theirs" data-reply="${esc(short)}"><span class="bubble-name">${esc(short)}<span class="bubble-time">${msgTime(m.completed || m.created)}</span></span>${esc(line)}</div>`).join("")}</div>`);
        } else if (!m._local && m.status !== "done" && m.status !== "archived") {
          html.push(`<div class="msg-wrapper" data-msg-id="${esc(m.id)}"><div class="bubble theirs pending" data-reply="${esc(short)}"><span class="bubble-name">${esc(short)}</span>正在处理...</div></div>`);
        }
      });
      container.innerHTML = html.join("");
    });
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
      draftFor(kind).push({ ...item });
      renderAttachmentPreview(kind);
      closeChatPanels();
      (_b2 = document.querySelector(kind === "mobile" ? "#mobileChatInput" : "#message")) == null ? void 0 : _b2.focus();
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
      renderAttachmentPreview(kind);
      closeChatPanels();
      (_d2 = document.querySelector(kind === "mobile" ? "#mobileChatInput" : "#message")) == null ? void 0 : _d2.focus();
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
  if (chatMode !== "group") return;
  const bubble = e.target.closest("[data-reply]");
  if (!bubble) return;
  applyMention("desktop", bubble.dataset.reply);
});
document.querySelector("#mobileChatBody").addEventListener("scroll", () => captureScroll(document.querySelector("#mobileChatBody"), "mobile", scrollState.mobile.key || `${mobileState.chatMode}:${mobileState.agent || mobileState.conversation || "team"}`));
document.querySelector("#mobileChatBody").addEventListener("click", (e) => {
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
(_l = document.querySelector("#mobileChatBack")) == null ? void 0 : _l.addEventListener("click", () => {
  mobileState.chatOpen = false;
  mobileState.tab = "company";
  renderMobileShell();
});
(_m = document.querySelector("#roomBack")) == null ? void 0 : _m.addEventListener("click", () => leaveRoom("button"));
(_n = document.querySelector("#roomHome")) == null ? void 0 : _n.addEventListener("click", () => goCompanyHome());
(_o = document.querySelector("#gameInteract")) == null ? void 0 : _o.addEventListener("click", () => leaveRoom("button"));
(_p = document.querySelector("#gameJump")) == null ? void 0 : _p.addEventListener("pointerdown", () => {
  gameJumpPressed = true;
});
(_q = document.querySelector("#gameJump")) == null ? void 0 : _q.addEventListener("pointerup", () => {
  gameJumpPressed = false;
});
const funBtn = document.querySelector("#funBtn");
const funDialogueEl = document.querySelector("#funDialogue");
let funDialogueTimeout = null;
if (funBtn) {
  funBtn.addEventListener("click", () => {
    funMode = !funMode;
    funBtn.classList.toggle("active", funMode);
    if (funMode) {
      funDialogueEl.classList.add("visible");
      const d = getFunnyDialogue();
      funDialogueEl.innerHTML = `<span class="fun-speaker">${d.speaker}</span>${d.text}`;
      clearTimeout(funDialogueTimeout);
      funDialogueTimeout = setTimeout(() => {
        funDialogueEl.classList.remove("visible");
      }, 5e3);
    } else {
      funDialogueEl.classList.remove("visible");
      clearTimeout(funDialogueTimeout);
    }
  });
}
;
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
