(() => {
  const DEFAULT_API = "https://pix.lovenom.eu.org";
  const STORAGE_KEYS = { base: "hermesApiBase", key: "hermesApiKey" };
  let config = { apiBase: DEFAULT_API, apiKey: "" };
  if (!/(^|\.)amazon\./i.test(location.hostname)) return;
  if (document.getElementById("hermes-amz-panel")) return;

  let state = null;
  let mode = "group";
  let agent = "planner";
  let pending = [];
  let timer = 0;
  let embedParent = null;
  let embedNext = null;
  let sidecarTimer = 0;
  let userReading = false;
  let lastMessagesHtml = "";
  let realtimeSource = null;
  let realtimeConnected = false;
  let realtimeRetryTimer = 0;
  let attachments = [];
  let savedStickers = [];
  try { savedStickers = JSON.parse(localStorage.getItem("hermes-amz-stickers") || "[]"); } catch {}

  const slot = document.createElement("div");
  slot.id = "hermes-amz-slot";

  const panel = document.createElement("section");
  panel.id = "hermes-amz-panel";
  panel.innerHTML = `
    <div class="hermes-amz-head">
      <div><div class="hermes-amz-title">Compare similar customer questions</div><div class="hermes-amz-status">Connecting...</div></div>
      <div class="hermes-amz-actions"><button type="button" data-follow>Latest</button><button type="button" data-login>Login</button><button type="button" data-hide>Hide</button><button type="button" data-refresh>Refresh</button></div>
    </div>
    <div class="hermes-amz-auth">
      <input data-api-base placeholder="Hermes URL">
      <input data-login-user placeholder="User" autocomplete="username">
      <input data-login-pass placeholder="Password" type="password" autocomplete="current-password">
      <button type="button" data-do-login>Connect</button>
      <button type="button" data-open-login>Web</button>
    </div>
    <div class="hermes-amz-tabs">
      <button type="button" class="active" data-mode="group">Q&A</button>
      <button type="button" data-mode="private" data-agent="planner">Seller</button>
      <button type="button" data-mode="private" data-agent="default">Tech</button>
      <button type="button" data-mode="private" data-agent="writer">Copy</button>
    </div>
    <div class="hermes-amz-msgs"></div>
    <form class="hermes-amz-compose">
      <div class="hermes-amz-tools">
        <button type="button" data-panel="emoji">Emoji</button>
        <button type="button" data-panel="stickers">Saved</button>
        <button type="button" data-pick="image">Photo</button>
        <button type="button" data-pick="file">File</button>
      </div>
      <div class="hermes-amz-preview"></div>
      <div class="hermes-amz-row"><input placeholder="Ask about this item" maxlength="2000"><button type="submit">➤</button></div>
      <input class="hermes-amz-image-picker" type="file" accept="image/*" multiple hidden>
      <input class="hermes-amz-file-picker" type="file" multiple hidden>
      <input class="hermes-amz-sticker-picker" type="file" accept="image/*" multiple hidden>
      <div class="hermes-amz-pop"></div>
    </form>
  `;

  const railToggle = document.createElement("button");
  railToggle.id = "hermes-amz-rail-toggle";
  railToggle.type = "button";
  railToggle.textContent = "◀";
  railToggle.title = "Show panel";
  railToggle.setAttribute("aria-label", "Show Hermes panel");

  slot.appendChild(panel);
  slot.appendChild(railToggle);

  function firstVisible(selectors) {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width > 40 && rect.height > 20) return el;
    }
    return null;
  }

  function getBuyBox() {
    return firstVisible([
      "#desktop_buybox",
      "#buybox",
      "#newAccordionRow",
      "#apex_desktop",
      "[data-feature-name='desktop_buybox']",
      "[cel_widget_id='desktop_buybox']",
      "#corePrice_feature_div",
      "#corePriceDisplay_desktop_feature_div"
    ]);
  }

  function getRightCol() {
    const direct = firstVisible([
      "#rightCol",
      "#rightCol_feature_div",
      "#ppd #rightCol",
      "[data-feature-name='rightCol']"
    ]);
    if (direct) return direct;

    const buyBox = getBuyBox();
    if (!buyBox) return null;
    const column = buyBox.closest("#rightCol, #rightCol_feature_div, #apex_desktop, #ppd, .a-fixed-right-grid-col");
    return column || buyBox.parentElement;
  }

  function findEmbedTarget() {
    return (
      getRightCol() ||
      getBuyBox()?.parentElement ||
      firstVisible(["#centerCol", "#dp", "#ppd", "main"]) ||
      document.body
    );
  }

  function placeInTarget(target) {
    if (!target) return false;
    const buyBox = getBuyBox();
    const rightCol = getRightCol();
    if (target === rightCol && buyBox?.parentElement === rightCol) {
      rightCol.insertBefore(slot, buyBox.nextSibling);
      embedParent = rightCol;
      embedNext = slot.nextSibling;
      return true;
    }
    target.appendChild(slot);
    embedParent = target;
    embedNext = null;
    return true;
  }

  function mountEmbedded() {
    const target = findEmbedTarget();
    if (!target) return false;
    placeInTarget(target);
    slot.classList.remove("hermes-rail-slot");
    panel.classList.remove("hermes-embedded-hidden");
    return true;
  }

  function mountRail() {
    document.body.appendChild(slot);
    slot.classList.add("hermes-rail-slot");
    slot.classList.remove("hermes-sidecar-slot");
  }

  function getSidecarBox() {
    const rightCol = getRightCol();
    const buyBox = getBuyBox();
    const anchor = buyBox || rightCol;
    if (!rightCol || !anchor) return null;
    const anchorRect = anchor.getBoundingClientRect();
    const rightRect = rightCol.getBoundingClientRect();
    const gap = 16;
    const left = Math.round(rightRect.right + gap + window.scrollX);
    const top = Math.round(Math.max(82, anchorRect.top) + window.scrollY);
    const available = Math.floor(window.innerWidth - rightRect.right - gap - 24);
    if (available < 280) return null;
    return {
      left,
      top,
      width: Math.min(360, available),
      height: Math.min(620, Math.max(430, window.innerHeight - Math.max(82, anchorRect.top) - 30))
    };
  }

  function positionSidecar() {
    if (!slot.classList.contains("hermes-sidecar-slot")) return false;
    const box = getSidecarBox();
    if (!box) return false;
    slot.style.setProperty("--hermes-left", `${box.left}px`);
    slot.style.setProperty("--hermes-top", `${box.top}px`);
    slot.style.setProperty("--hermes-width", `${box.width}px`);
    slot.style.setProperty("--hermes-height", `${box.height}px`);
    return true;
  }

  function mountSidecar() {
    const box = getSidecarBox();
    if (!box) return false;
    document.body.appendChild(slot);
    slot.classList.add("hermes-sidecar-slot");
    slot.classList.remove("hermes-rail-slot");
    panel.classList.remove("hermes-embedded-hidden");
    positionSidecar();
    return true;
  }

  function restorePanel() {
    if (mountSidecar()) return true;
    if (embedParent && document.contains(embedParent)) {
      if (embedParent.id === "rightCol") placeInTarget(embedParent);
      else if (embedNext && document.contains(embedNext)) embedParent.insertBefore(slot, embedNext);
      else embedParent.appendChild(slot);
      slot.classList.remove("hermes-rail-slot", "hermes-sidecar-slot");
      return true;
    }
    if (mountEmbedded()) return true;
    mountRail();
    return false;
  }

  const mounted = mountSidecar() || mountEmbedded();
  if (!mounted) mountRail();

  const statusEl = panel.querySelector(".hermes-amz-status");
  const msgs = panel.querySelector(".hermes-amz-msgs");
  const input = panel.querySelector(".hermes-amz-row input");
  const preview = panel.querySelector(".hermes-amz-preview");
  const pop = panel.querySelector(".hermes-amz-pop");
  const authBar = panel.querySelector(".hermes-amz-auth");
  const apiBaseInput = panel.querySelector("[data-api-base]");
  const loginUserInput = panel.querySelector("[data-login-user]");
  const loginPassInput = panel.querySelector("[data-login-pass]");

  function esc(value) {
    const d = document.createElement("div");
    d.textContent = value || "";
    return d.innerHTML;
  }

  function normalizeBase(value) {
    return String(value || DEFAULT_API).trim().replace(/\/+$/, "") || DEFAULT_API;
  }

  function api(path) {
    return normalizeBase(config.apiBase) + path;
  }

  function apiHeaders(json = false) {
    const headers = {};
    if (json) headers["Content-Type"] = "application/json";
    if (config.apiKey) headers["X-Hermes-Api-Key"] = config.apiKey;
    return headers;
  }

  function apiEventUrl(path) {
    const url = new URL(api(path));
    if (config.apiKey) url.searchParams.set("api_key", config.apiKey);
    return url.toString();
  }

  function storageGet(keys) {
    return new Promise(resolve => {
      try {
        if (chrome?.storage?.local) chrome.storage.local.get(keys, resolve);
        else resolve({});
      } catch {
        resolve({});
      }
    });
  }

  function storageSet(values) {
    return new Promise(resolve => {
      try {
        if (chrome?.storage?.local) chrome.storage.local.set(values, resolve);
        else resolve();
      } catch {
        resolve();
      }
    });
  }

  function setAuthOpen(open) {
    authBar.classList.toggle("open", open);
    apiBaseInput.value = normalizeBase(config.apiBase);
    loginUserInput.value = loginUserInput.value || "admin";
  }

  function authError(data, response) {
    return response?.status === 401 || /请先登录|API KEY|用户名或密码/.test(String(data?.error || ""));
  }

  async function loadConfig() {
    const stored = await storageGet([STORAGE_KEYS.base, STORAGE_KEYS.key]);
    config.apiBase = normalizeBase(stored[STORAGE_KEYS.base] || localStorage.getItem(STORAGE_KEYS.base) || DEFAULT_API);
    config.apiKey = String(stored[STORAGE_KEYS.key] || localStorage.getItem(STORAGE_KEYS.key) || "");
    apiBaseInput.value = config.apiBase;
    if (!config.apiKey) setAuthOpen(true);
  }

  async function saveConfig() {
    config.apiBase = normalizeBase(apiBaseInput.value);
    await storageSet({ [STORAGE_KEYS.base]: config.apiBase, [STORAGE_KEYS.key]: config.apiKey });
    localStorage.setItem(STORAGE_KEYS.base, config.apiBase);
    localStorage.setItem(STORAGE_KEYS.key, config.apiKey);
  }

  function shortName(message) {
    return (message.name || "员工").split(" ").slice(-1)[0];
  }

  function chatLines(message) {
    if (message.mode === "group") return message.chat_lines?.length ? message.chat_lines : (message.reply ? [message.reply] : []);
    return message.reply ? [message.reply] : [];
  }

  function stickerData(name, svg) {
    return { name, type: "image/svg+xml", size: svg.length, kind: "sticker", data: "data:image/svg+xml;base64," + btoa(svg) };
  }

  function pixelSticker(name, face, main = "#f0c85a", accent = "#263238") {
    const moods = {
      smile: "M18 25h4v4h-4z M38 25h4v4h-4z M24 42h12v4H24z",
      laugh: "M17 24h5v5h-5z M38 24h5v5h-5z M21 39h20v9H21z",
      cry: "M17 24h5v5h-5z M38 24h5v5h-5z M22 43h18v4H22z M13 31h5v12h-5z M44 31h5v12h-5z",
      think: "M18 25h4v4h-4z M38 25h4v4h-4z M31 37h8v4h-8z M26 45h13v4H26z",
      angry: "M16 22h9v4h-9z M37 22h9v4h-9z M20 42h22v4H20z",
      cool: "M14 24h16v8H14z M34 24h16v8H34z M30 27h4v3h-4z M24 43h14v4H24z",
      shock: "M18 24h5v5h-5z M39 24h5v5h-5z M27 39h9v12h-9z",
      sleep: "M18 27h5v4h-5z M37 27h5v4h-5z M25 43h13v4H25z M44 12h9v4h-5v4h5v4h-10v-4h5v-4h-4z",
      thumb: "M26 34h4v6h-4z M30 38h10v2h-10z M30 40h10v8h-10z",
      coffee: "M18 22h24v22H18z M42 27h8v10h-8z M23 26h14v4H23z M23 35h14v4H23z"
    };
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" shape-rendering="crispEdges"><rect width="64" height="64" fill="none"/><path fill="${accent}" d="M14 12h36v4h4v36h-4v4H14v-4h-4V16h4z"/><path fill="${main}" d="M18 16h28v4h4v28h-4v4H18v-4h-4V20h4z"/><path fill="#fff3c7" d="M22 18h18v4H22z"/><path fill="${accent}" d="${moods[face] || moods.smile}"/></svg>`;
    return stickerData(name, svg);
  }

  function sceneSticker(name, type, main = "#7bc6a4") {
    const base = '<rect width="64" height="64" fill="none"/>';
    const fish = `${base}<rect x="8" y="14" width="48" height="36" fill="#d7f1ee"/><path fill="#29464b" d="M8 14h48v4H8zM8 46h48v4H8zM8 14h4v36H8zM52 14h4v36h-4z"/><g><animateTransform attributeName="transform" type="translate" values="-6 0;8 0;-6 0" dur="1.8s" repeatCount="indefinite"/><path fill="${main}" d="M20 31h20v-5h8v16h-8v-5H20z"/><rect x="25" y="28" width="4" height="4" fill="#fff3c7"/><rect x="42" y="30" width="3" height="3" fill="#263238"/></g><path fill="#4e8b79" d="M16 40h4v6h-4zM45 38h4v8h-4z"/>`;
    const corgi = `${base}<g><animateTransform attributeName="transform" type="translate" values="0 0;0 -2;0 0" dur="1.1s" repeatCount="indefinite"/><path fill="#8b5a2b" d="M14 30h36v16H14z"/><path fill="#d99a4e" d="M18 22h28v24H18z"/><path fill="#fff3d7" d="M24 31h16v13H24z"/><path fill="#8b5a2b" d="M18 22h8v-8h6v8h4v-8h6v8h4v8H18z"/><rect x="25" y="28" width="4" height="4" fill="#263238"/><rect x="37" y="28" width="4" height="4" fill="#263238"/><rect x="31" y="35" width="5" height="4" fill="#263238"/></g>`;
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
    const map = { fish, corgi, tail, shadow, tank, tea, bug, overtime, phone, delivery, pr, idea, board };
    return stickerData(name, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" shape-rendering="crispEdges">${map[type] || fish}</svg>`);
  }

  const builtinStickers = [
    pixelSticker("收到", "smile"), pixelSticker("笑死", "laugh"), pixelSticker("流泪", "cry", "#73bde6"), pixelSticker("思考", "think", "#e7b34d"),
    pixelSticker("生气", "angry", "#e76f51"), pixelSticker("墨镜", "cool"), pixelSticker("震惊", "shock", "#a878d1"), pixelSticker("困了", "sleep", "#93a8c7"),
    pixelSticker("赞", "thumb", "#78c59b"), pixelSticker("咖啡续命", "coffee", "#c4935b"),
    sceneSticker("锦鲤游过", "fish", "#e76f51"), sceneSticker("锦鲤保佑", "fish", "#f0c85a"), sceneSticker("鱼缸盯梢", "tank"),
    sceneSticker("柯基坐好", "corgi"), sceneSticker("柯基追尾巴", "tail"), sceneSticker("柯基追影子", "shadow"), sceneSticker("柯基追鱼", "tank"),
    sceneSticker("奶茶到了", "tea"), sceneSticker("Bug 出没", "bug"), sceneSticker("今晚加班", "overtime"),
    sceneSticker("手机摸鱼", "phone"), sceneSticker("外卖到门口", "delivery"), sceneSticker("PR 爆炸", "pr"), sceneSticker("灵感灯泡", "idea"), sceneSticker("看板推进", "board"),
    pixelSticker("阿默冷笑", "cool", "#8fcfc2"), pixelSticker("小韩拍板", "thumb", "#e7b34d"), pixelSticker("小研质疑", "think", "#b8d98b"), pixelSticker("小文扎心", "shock", "#d6a4e8"), pixelSticker("今日交付", "smile", "#78c59b")
  ];

  function renderAttachments(items = []) {
    if (!items.length) return "";
    return `<div class="hermes-amz-attachments">${items.map(item => {
      if ((item.type || "").startsWith("image/")) return `<img src="${esc(item.url || item.data)}" alt="${esc(item.name || "image")}">`;
      return `<a href="${esc(item.url || item.data)}" target="_blank">File · ${esc(item.name || "attachment")}</a>`;
    }).join("")}</div>`;
  }

  function messageHtml(text, items = []) {
    const showText = text && !(text === "[表情包]" && items.length === 1) ? esc(text) : "";
    return showText + renderAttachments(items);
  }

  function attachmentPrompt(items = []) {
    const stickers = items.filter(item => item.kind === "sticker").map(item => item.name || "表情包");
    if (stickers.length) return stickers.slice(0, 4).map(name => `[${name}]`).join("");
    const images = items.filter(item => String(item.type || "").startsWith("image/")).map(item => item.name || "图片");
    if (images.length) return images.slice(0, 3).map(name => `[图片:${name}]`).join("");
    return items.length ? items.slice(0, 3).map(item => `[文件:${item.name || "文件"}]`).join("") : "";
  }

  function renderPreview() {
    preview.innerHTML = attachments.map((item, index) => `<span class="hermes-amz-chip">${item.type?.startsWith("image/") ? `<img src="${item.data}" alt="">` : ""}${esc(item.name || (item.kind === "sticker" ? "表情包" : "附件"))}<button type="button" data-remove-attach="${index}">×</button></span>`).join("");
  }

  function saveStickers() {
    localStorage.setItem("hermes-amz-stickers", JSON.stringify(savedStickers.slice(-60)));
  }

  function showPop(type) {
    if (type === "stickers") {
      pop.innerHTML = `<div class="hermes-amz-pop-title">收藏表情</div><div class="hermes-amz-sticker-grid"><button type="button" data-add-sticker title="添加收藏表情">＋</button>${savedStickers.map((item, index) => `<button type="button" data-saved-sticker="${index}" title="${esc(item.name || "表情包")}"><img src="${item.data}" alt="${esc(item.name || "表情包")}"></button>`).join("")}</div>`;
    } else {
      pop.innerHTML = `<div class="hermes-amz-pop-title">Hermes 像素表情</div><div class="hermes-amz-sticker-grid">${builtinStickers.map((item, index) => `<button type="button" data-builtin-sticker="${index}" title="${esc(item.name)}"><img src="${item.data}" alt="${esc(item.name)}"></button>`).join("")}</div>`;
    }
    pop.classList.add("open");
  }

  function fileToAttachment(file, kind = "file") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, type: file.type || "application/octet-stream", size: file.size, kind: file.type?.startsWith("image/") ? (kind === "sticker" ? "sticker" : "image") : kind, data: String(reader.result || "") });
      reader.onerror = () => reject(reader.error || new Error("read file failed"));
      reader.readAsDataURL(file);
    });
  }

  function merged(real) {
    pending = pending.filter(item => !real.some(message => message.id === item.id));
    return [...real, ...pending].sort((a, b) => (a.created || 0) - (b.created || 0));
  }

  function nearBottom() {
    return msgs.scrollHeight - msgs.clientHeight - msgs.scrollTop < 44;
  }

  function updateFollowButton() {
    panel.querySelector("[data-follow]").classList.toggle("hermes-visible", userReading);
  }

  function followLatest() {
    userReading = false;
    msgs.scrollTop = msgs.scrollHeight;
    updateFollowButton();
  }

  function render() {
    if (!state) return;
    const shouldFollow = !userReading && nearBottom();
    const previousTop = msgs.scrollTop;
    const all = merged(state.messages || []);
    let html = "";
    if (mode === "group") {
      const items = all.filter(message => message.mode === "group").slice(-18);
      const shown = new Set();
      if (!items.length) html = '<div class="hermes-amz-msg hermes-amz-them hermes-amz-pending">No customer questions yet.</div>';
      for (const message of items) {
        if (message.origin === "boss" && !shown.has(message.conversation)) {
          shown.add(message.conversation);
          html += `<div class="hermes-amz-msg hermes-amz-me">${messageHtml(message.prompt, message.attachments)}</div>`;
        }
        const lines = chatLines(message);
        if (lines.length) {
          for (const line of lines) html += `<div class="hermes-amz-msg hermes-amz-them"><span class="hermes-amz-name">${esc(shortName(message))}</span>${esc(line)}</div>`;
        } else if (message.status !== "done" && message.status !== "archived") {
          html += `<div class="hermes-amz-msg hermes-amz-them hermes-amz-pending"><span class="hermes-amz-name">${esc(shortName(message))}</span>Typing...</div>`;
        }
      }
    } else {
      const items = all.filter(message => message.mode !== "group" && message.agent === agent).slice(-12);
      if (!items.length) html = '<div class="hermes-amz-msg hermes-amz-them hermes-amz-pending">No seller messages yet.</div>';
      for (const message of items) {
        html += `<div class="hermes-amz-msg hermes-amz-me">${messageHtml(message.prompt, message.attachments)}</div><div class="hermes-amz-msg hermes-amz-them ${message.reply ? "" : "hermes-amz-pending"}"><span class="hermes-amz-name">${esc(shortName(message))}</span>${esc(message.reply || "Preparing answer...")}</div>`;
      }
    }
    if (html !== lastMessagesHtml) {
      msgs.innerHTML = html;
      lastMessagesHtml = html;
    }
    if (shouldFollow) msgs.scrollTop = msgs.scrollHeight;
    else msgs.scrollTop = Math.min(previousTop, Math.max(0, msgs.scrollHeight - msgs.clientHeight));
    updateFollowButton();
  }

  function applyServerState(data, source = "poll") {
    if (data.error) throw new Error(data.error);
    state = data;
    statusEl.textContent = `${source === "sse" ? "Live" : "Sync"} · ${state.board?.name || "Product Q&A"} · ${state.world?.clock || ""}`;
    render();
  }

  function schedulePoll(delay = 2500) {
    clearTimeout(timer);
    if (!realtimeConnected) timer = setTimeout(refresh, delay);
  }

  async function refresh() {
    try {
      const response = await fetch(api("/api/state"), { cache: "no-store", headers: apiHeaders() });
      const data = await response.json();
      if (authError(data, response)) {
        statusEl.textContent = "Login required";
        setAuthOpen(true);
        return;
      }
      applyServerState(data, "poll");
    } catch (err) {
      statusEl.textContent = "Local assistant offline";
    }
    schedulePoll();
  }

  function connectRealtime() {
    if (!window.EventSource || realtimeSource) return;
    realtimeSource = new EventSource(apiEventUrl("/api/events"));
    realtimeSource.addEventListener("open", () => {
      realtimeConnected = true;
      clearTimeout(timer);
      clearTimeout(realtimeRetryTimer);
      statusEl.textContent = "Live · connected";
    });
    realtimeSource.addEventListener("state", event => {
      realtimeConnected = true;
      try {
        applyServerState(JSON.parse(event.data), "sse");
      } catch {
        statusEl.textContent = "Live · parse error";
      }
    });
    realtimeSource.addEventListener("error", () => {
      realtimeConnected = false;
      if (realtimeSource) {
        realtimeSource.close();
        realtimeSource = null;
      }
      statusEl.textContent = "Live reconnecting · fallback sync";
      schedulePoll(600);
      clearTimeout(realtimeRetryTimer);
      realtimeRetryTimer = setTimeout(connectRealtime, 1800);
    });
  }

  async function send(text, items = []) {
    const payload = { mode, message: text || attachmentPrompt(items), attachments: items, board: state?.board?.slug };
    if (mode === "private") payload.agent = agent;
    const response = await fetch(api("/api/message"), {
      method: "POST",
      headers: apiHeaders(true),
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (authError(data, response)) {
      statusEl.textContent = "Login required";
      setAuthOpen(true);
      return;
    }
    pending.push(...(data.messages || []));
    userReading = false;
    render();
    schedulePoll(180);
  }

  panel.querySelector(".hermes-amz-tabs").addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    panel.querySelectorAll(".hermes-amz-tabs button").forEach(item => item.classList.toggle("active", item === button));
    mode = button.dataset.mode;
    agent = button.dataset.agent || agent;
    input.placeholder = mode === "group" ? "Ask about this item" : "Message seller";
    render();
  });

  panel.querySelector("form").addEventListener("submit", async event => {
    event.preventDefault();
    const text = input.value.trim();
    const items = attachments.slice();
    if (!text && !items.length) return;
    input.value = "";
    attachments = [];
    renderPreview();
    pop.classList.remove("open");
    await send(text, items);
  });

  panel.querySelector(".hermes-amz-tools").addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.panel) {
      if (pop.classList.contains("open") && pop.dataset.type === button.dataset.panel) {
        pop.classList.remove("open");
        return;
      }
      pop.dataset.type = button.dataset.panel;
      showPop(button.dataset.panel);
      return;
    }
    if (button.dataset.pick === "image") panel.querySelector(".hermes-amz-image-picker").click();
    if (button.dataset.pick === "file") panel.querySelector(".hermes-amz-file-picker").click();
  });

  pop.addEventListener("click", event => {
    const builtin = event.target.closest("[data-builtin-sticker]");
    const saved = event.target.closest("[data-saved-sticker]");
    if (builtin) {
      attachments.push({ ...builtinStickers[Number(builtin.dataset.builtinSticker)] });
      renderPreview();
      pop.classList.remove("open");
      input.focus();
      return;
    }
    if (saved) {
      attachments.push({ ...savedStickers[Number(saved.dataset.savedSticker)] });
      renderPreview();
      pop.classList.remove("open");
      input.focus();
      return;
    }
    if (event.target.closest("[data-add-sticker]")) panel.querySelector(".hermes-amz-sticker-picker").click();
  });

  preview.addEventListener("click", event => {
    const remove = event.target.closest("[data-remove-attach]");
    if (!remove) return;
    attachments.splice(Number(remove.dataset.removeAttach), 1);
    renderPreview();
  });

  async function addFiles(inputEl, kind) {
    const files = Array.from(inputEl.files || []).slice(0, 6);
    inputEl.value = "";
    const converted = await Promise.all(files.map(file => fileToAttachment(file, kind)));
    if (kind === "sticker") {
      savedStickers.push(...converted.map(item => ({ name: item.name, type: item.type, size: item.size, kind: "sticker", data: item.data })));
      savedStickers = savedStickers.slice(-60);
      saveStickers();
      showPop("stickers");
      return;
    }
    attachments.push(...converted);
    renderPreview();
  }

  panel.querySelector(".hermes-amz-image-picker").addEventListener("change", event => addFiles(event.target, "image"));
  panel.querySelector(".hermes-amz-file-picker").addEventListener("change", event => addFiles(event.target, "file"));
  panel.querySelector(".hermes-amz-sticker-picker").addEventListener("change", event => addFiles(event.target, "sticker"));

  function collapsePanel() {
    if (!slot.classList.contains("hermes-rail-slot")) {
      embedParent = slot.parentElement;
      embedNext = slot.nextSibling;
      mountRail();
    }
    panel.classList.add("hermes-hidden");
    slot.classList.add("hermes-collapsed");
    slot.setAttribute("title", "Click to restore Hermes panel");
    panel.classList.remove("hermes-embedded-hidden");
    panel.querySelector("[data-hide]").textContent = "Show";
    railToggle.setAttribute("aria-expanded", "false");
  }

  function expandPanel() {
    panel.classList.remove("hermes-hidden", "hermes-embedded-hidden");
    slot.classList.remove("hermes-collapsed");
    slot.removeAttribute("title");
    restorePanel();
    panel.querySelector("[data-hide]").textContent = "Hide";
    railToggle.setAttribute("aria-expanded", "true");
  }

  function togglePanel(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    }
    if (panel.classList.contains("hermes-hidden")) expandPanel();
    else collapsePanel();
  }

  panel.querySelector("[data-hide]").addEventListener("click", togglePanel, true);
  panel.addEventListener("click", event => {
    if (panel.classList.contains("hermes-hidden")) expandPanel();
  }, true);
  railToggle.addEventListener("click", togglePanel, true);
  slot.addEventListener("click", event => {
    if (!panel.classList.contains("hermes-hidden")) return;
    togglePanel(event);
  }, true);
  document.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("#hermes-amz-rail-toggle") || target.closest("#hermes-amz-slot.hermes-collapsed") || target.closest("#hermes-amz-panel [data-hide]")) togglePanel(event);
  }, true);
  panel.querySelector("[data-refresh]").addEventListener("click", refresh);
  panel.querySelector("[data-follow]").addEventListener("click", followLatest);
  panel.querySelector("[data-login]").addEventListener("click", () => setAuthOpen(!authBar.classList.contains("open")));
  panel.querySelector("[data-open-login]").addEventListener("click", () => {
    config.apiBase = normalizeBase(apiBaseInput.value);
    window.open(api("/login"), "_blank", "noopener,noreferrer");
  });
  panel.querySelector("[data-do-login]").addEventListener("click", async () => {
    config.apiBase = normalizeBase(apiBaseInput.value);
    statusEl.textContent = "Logging in...";
    try {
      const response = await fetch(api("/api/plugin/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUserInput.value.trim(), password: loginPassInput.value })
      });
      const data = await response.json();
      if (!response.ok || !data.api_key) throw new Error(data.error || "Login failed");
      config.apiKey = data.api_key;
      loginPassInput.value = "";
      await saveConfig();
      setAuthOpen(false);
      if (realtimeSource) {
        realtimeSource.close();
        realtimeSource = null;
      }
      realtimeConnected = false;
      statusEl.textContent = "Login OK";
      connectRealtime();
      refresh();
    } catch (err) {
      statusEl.textContent = err.message || "Login failed";
      setAuthOpen(true);
    }
  });
  msgs.addEventListener("scroll", () => {
    userReading = !nearBottom();
    updateFollowButton();
  }, { passive: true });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      collapsePanel();
    }
  });
  window.addEventListener("resize", () => {
    clearTimeout(sidecarTimer);
    sidecarTimer = setTimeout(() => {
      if (slot.classList.contains("hermes-sidecar-slot") && !positionSidecar()) restorePanel();
    }, 120);
  });

  loadConfig().then(() => {
    connectRealtime();
    refresh();
  });
})();
