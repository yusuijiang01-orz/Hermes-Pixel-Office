window.__hermesBootAlive = "shared";
window.HermesShared = window.HermesShared || {
  ready: {}
};
window.HermesShared.markBoot = function(stage) {
  window.__hermesBootAlive = stage;
};
window.HermesShared.isMobileView = function() {
  return innerWidth <= 700;
};
window.HermesShared.reportBootIssue = function(message) {
  const ls = document.getElementById("loading-screen");
  const text = ls == null ? void 0 : ls.querySelector(".loading-text");
  if (text) text.textContent = message;
};
window.HermesShared.signalReady = function(stage) {
  this.ready[stage] = true;
  document.dispatchEvent(new Event(`hermes:${stage}-ready`));
};
window.HermesShared.onReady = function(stage, callback) {
  if (this.ready[stage]) {
    callback();
    return;
  }
  document.addEventListener(`hermes:${stage}-ready`, callback, { once: true });
};
function isMobileView() {
  return window.HermesShared.isMobileView();
}
function reportBootIssue(message) {
  window.HermesShared.reportBootIssue(message);
}
