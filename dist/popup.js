// src/popup/index.ts
var goal = document.getElementById("goal");
var mode = document.getElementById("mode");
var planner = document.getElementById("planner");
var modelRow = document.getElementById("model-row");
var modelId = document.getElementById("modelId");
var status = document.getElementById("status");
var start = document.getElementById("start");
var approve = document.getElementById("approve");
var stop = document.getElementById("stop");
async function withActiveTab(fn) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("No active tab found");
  }
  return fn(tab.id);
}
function syncModelInputVisibility() {
  const isWebLLM = planner.value === "webllm";
  modelRow.classList.toggle("hidden", !isWebLLM);
}
planner.addEventListener("change", syncModelInputVisibility);
syncModelInputVisibility();
start.addEventListener("click", async () => {
  try {
    status.textContent = "Starting...";
    const plannerKind = planner.value;
    const plannerConfig = {
      kind: plannerKind
    };
    if (plannerKind === "webllm") {
      const trimmedModelId = modelId.value.trim();
      if (trimmedModelId) {
        plannerConfig.modelId = trimmedModelId;
      }
    }
    await withActiveTab(
      (tabId) => chrome.runtime.sendMessage({
        type: "START_AGENT",
        tabId,
        goal: goal.value.trim(),
        mode: mode.value,
        planner: plannerConfig
      })
    );
    status.textContent = "Agent started";
  } catch (error) {
    status.textContent = `Error: ${String(error)}`;
  }
});
approve.addEventListener("click", async () => {
  await withActiveTab((tabId) => chrome.runtime.sendMessage({ type: "APPROVE_ACTION", tabId }));
  status.textContent = "Approved pending action";
});
stop.addEventListener("click", async () => {
  await withActiveTab((tabId) => chrome.runtime.sendMessage({ type: "STOP_AGENT", tabId }));
  status.textContent = "Stopped";
});
chrome.runtime.sendMessage({ type: "GET_STATUS" }, (resp) => {
  if (resp?.status) {
    status.textContent = resp.status;
  }
});
//# sourceMappingURL=popup.js.map
