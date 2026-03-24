import type { AgentMode, PlannerConfig, PlannerKind } from "../shared/contracts";

const goal = document.getElementById("goal") as HTMLTextAreaElement;
const mode = document.getElementById("mode") as HTMLSelectElement;
const planner = document.getElementById("planner") as HTMLSelectElement;
const modelRow = document.getElementById("model-row") as HTMLDivElement;
const modelId = document.getElementById("modelId") as HTMLInputElement;
const status = document.getElementById("status") as HTMLDivElement;

const start = document.getElementById("start") as HTMLButtonElement;
const approve = document.getElementById("approve") as HTMLButtonElement;
const stop = document.getElementById("stop") as HTMLButtonElement;

async function withActiveTab<T>(fn: (tabId: number) => Promise<T>) {
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
    const plannerKind = planner.value as PlannerKind;
    const plannerConfig: PlannerConfig = {
      kind: plannerKind
    };

    if (plannerKind === "webllm") {
      const trimmedModelId = modelId.value.trim();
      if (trimmedModelId) {
        plannerConfig.modelId = trimmedModelId;
      }
    }

    await withActiveTab((tabId) =>
      chrome.runtime.sendMessage({
        type: "START_AGENT",
        tabId,
        goal: goal.value.trim(),
        mode: mode.value as AgentMode,
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
