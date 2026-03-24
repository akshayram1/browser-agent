import { createBrowserAgent, createWebLLMBridge } from "../../dist/lib.js";

const goalEl = document.getElementById("goal");
const modeEl = document.getElementById("mode");
const modelEl = document.getElementById("model");
const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const profileResultEl = document.getElementById("profile-result");
const profileNameEl = document.getElementById("profile-name");
const profileEmailEl = document.getElementById("profile-email");
const profileCompanyEl = document.getElementById("profile-company");
const profileSourceEl = document.getElementById("profile-source");

const startBtn    = document.getElementById("start");
const approveBtn  = document.getElementById("approve");
const stopBtn     = document.getElementById("stop");
const loadModelBtn   = document.getElementById("load-model");
const progressWrapEl = document.getElementById("progress-wrap");
const progressFillEl = document.getElementById("progress-fill");
const progressTextEl = document.getElementById("progress-text");
const webgpuWarnEl   = document.getElementById("webgpu-warn");
const sdotEl         = document.getElementById("sdot");
const modelStatusTextEl = document.getElementById("model-status-text");

let agent = null;
let loadedEngine = null;
const AGENT_SCOPE_SELECTOR = "#crm-root";
let isStarting = false;
let lastOpenedProfileName = "";

async function loadModel() {
  if (!navigator.gpu) {
    webgpuWarnEl.classList.add("visible");
    modelStatusTextEl.textContent = "WebGPU unavailable — using heuristic planner";
    installPlannerBridge();
    return;
  }

  const modelId = modelEl.value;
  loadModelBtn.disabled = true;
  modelEl.disabled = true;
  sdotEl.className = "sdot loading";
  modelStatusTextEl.textContent = "Loading model…";
  progressWrapEl.classList.add("visible");
  setStatus("loading WebLLM model");

  try {
    const webllm = await import("https://esm.run/@mlc-ai/web-llm");
    loadedEngine = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback({ progress, text }) {
        progressFillEl.style.width = `${Math.round(progress * 100)}%`;
        progressTextEl.textContent = text || `${Math.round(progress * 100)}%`;
      }
    });

    progressWrapEl.classList.remove("visible");
    sdotEl.className = "sdot ready";
    modelStatusTextEl.textContent = `${modelEl.options[modelEl.selectedIndex].text.split("—")[0].trim()} ready`;
    loadModelBtn.textContent = "Reload";
    loadModelBtn.disabled = false;
    modelEl.disabled = false;
    setStatus("WebLLM model loaded");
    log("WebLLM ready", { modelId });
    installPlannerBridge();
  } catch (error) {
    loadedEngine = null;
    progressWrapEl.classList.remove("visible");
    sdotEl.className = "sdot";
    modelStatusTextEl.textContent = "Load failed — check WebGPU support";
    loadModelBtn.disabled = false;
    modelEl.disabled = false;
    setStatus("WebLLM load failed");
    log("WebLLM load error", { message: String(error) });
    installPlannerBridge();
  }
}

loadModelBtn.addEventListener("click", loadModel);

function isUrlAllowed(url) {
  try {
    const parsed = new URL(url, window.location.href);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function isSelectorInScope(selector) {
  if (typeof selector !== "string" || selector.trim().length === 0) {
    return false;
  }
  try {
    const node = document.querySelector(selector);
    return Boolean(node?.closest(AGENT_SCOPE_SELECTOR));
  } catch {
    return false;
  }
}

function normalizeAction(rawAction) {
  const action = typeof rawAction === "object" && rawAction ? rawAction : null;
  if (!action || typeof action.type !== "string") {
    return { type: "done", reason: "Invalid model action shape" };
  }

  switch (action.type) {
    case "click":
      if (isSelectorInScope(action.selector)) {
        return { type: "click", selector: action.selector };
      }
      return { type: "done", reason: "Model selected out-of-scope click target" };

    case "type":
      if (isSelectorInScope(action.selector) && typeof action.text === "string") {
        return {
          type: "type",
          selector: action.selector,
          text: action.text,
          clearFirst: Boolean(action.clearFirst)
        };
      }
      return { type: "done", reason: "Invalid type action from model" };

    case "navigate":
      if (typeof action.url === "string" && isUrlAllowed(action.url)) {
        return { type: "navigate", url: action.url };
      }
      if (isSelectorInScope(action.selector)) {
        return { type: "click", selector: action.selector };
      }
      return { type: "done", reason: "Invalid navigate action from model" };

    case "extract":
      if (isSelectorInScope(action.selector)) {
        return {
          type: "extract",
          selector: action.selector,
          label: typeof action.label === "string" && action.label ? action.label : "extracted"
        };
      }
      return { type: "done", reason: "Out-of-scope extract action blocked" };

    case "wait": {
      const ms = Number(action.ms);
      return { type: "wait", ms: Number.isFinite(ms) ? Math.max(100, Math.min(ms, 5000)) : 300 };
    }

    case "done":
      return { type: "done", reason: typeof action.reason === "string" ? action.reason : "Done" };

    default:
      return { type: "done", reason: `Unsupported action type: ${action.type}` };
  }
}

function ruleBasedFallbackAction(input) {
  const goal = (input.goal || "").toLowerCase();
  if (goal.includes("jane") && lastOpenedProfileName === "Jane Doe") {
    return { type: "done", reason: "Goal complete: Jane Doe profile opened" };
  }
  if (goal.includes("john") && lastOpenedProfileName === "John Smith") {
    return { type: "done", reason: "Goal complete: John Smith profile opened" };
  }
  if (goal.includes("profile") && lastOpenedProfileName) {
    return { type: "done", reason: `Goal complete: ${lastOpenedProfileName} profile opened` };
  }

  if (goal.includes("jane")) {
    return { type: "click", selector: "#crm-root [data-agent-target='profile-jane']" };
  }
  if (goal.includes("john")) {
    return { type: "click", selector: "#crm-root [data-agent-target='profile-john']" };
  }
  if (goal.includes("open profile") || goal.includes("profile")) {
    return { type: "click", selector: "#crm-root .open-profile" };
  }
  return { type: "done", reason: "No deterministic fallback action matched goal" };
}

function makeFallbackBridge() {
  return {
    async plan(input) {
      const action = normalizeAction(ruleBasedFallbackAction(input));
      return { action };
    }
  };
}

function createScopedWebLLMBridge(engine) {
  const baseBridge = createWebLLMBridge(engine);
  return {
    async plan(input, modelId) {
      const result = await baseBridge.plan(input, modelId);
      return { ...result, action: normalizeAction(result.action) };
    },
    async retryInvalidJson(input, badOutput, modelId) {
      const result = await baseBridge.retryInvalidJson(input, badOutput, modelId);
      return { ...result, action: normalizeAction(result.action) };
    }
  };
}

function installPlannerBridge() {
  window.__browserAgentWebLLM = loadedEngine
    ? createScopedWebLLMBridge(loadedEngine)
    : makeFallbackBridge();
}

installPlannerBridge();

function log(message, payload) {
  const line = payload ? `${message} ${JSON.stringify(payload)}` : message;
  logEl.textContent = `${new Date().toLocaleTimeString()} ${line}\n${logEl.textContent}`;
}

function setStatus(text) {
  statusEl.textContent = `Status: ${text}`;
}

function renderOpenedProfile(button, trigger) {
  const name = button.dataset.name || "Unknown";
  const email = button.dataset.email || "Unknown";
  const company = button.dataset.company || "Unknown";
  lastOpenedProfileName = name;

  profileNameEl.textContent = `${name} profile opened`;
  profileEmailEl.textContent = `Email: ${email}`;
  profileCompanyEl.textContent = `Company: ${company}`;
  profileSourceEl.textContent = `Triggered by: ${trigger} at ${new Date().toLocaleTimeString()}`;
  profileResultEl.classList.add("visible");

  setStatus(`profile opened (${name})`);
  log("Profile opened", { name, trigger });
}

for (const chip of document.querySelectorAll(".chip[data-goal]")) {
  chip.addEventListener("click", () => {
    goalEl.value = chip.dataset.goal;
  });
}

for (const button of document.querySelectorAll(".open-profile")) {
  button.addEventListener("click", (event) => {
    const trigger = event.isTrusted ? "user" : "agent";
    renderOpenedProfile(button, trigger);
  });
}

startBtn.addEventListener("click", async () => {
  if (isStarting) {
    log("Start ignored: session is already running");
    return;
  }

  isStarting = true;
  startBtn.disabled = true;
  setStatus("starting");
  log("Creating BrowserAgent session");

  const requestedPlanner = "webllm";

  agent = createBrowserAgent(
    {
      goal: goalEl.value,
      mode: modeEl.value,
      planner: { kind: requestedPlanner, modelId: modelEl.value },
      maxSteps: 10,
      stepDelayMs: 300
    },
    {
      onStart: (session) => {
        setStatus(`running (${session.mode})`);
        log("onStart", { sessionId: session.id });
      },
      onStep: (result) => {
        log("onStep", result);
      },
      onApprovalRequired: (action) => {
        setStatus("approval required");
        log("onApprovalRequired", action);
      },
      onDone: (result) => {
        setStatus(`done (${result.status})`);
        log("onDone", result);
      },
      onError: (error) => {
        setStatus("error");
        log("onError", { message: String(error) });
      }
    }
  );

  try {
    lastOpenedProfileName = "";
    const result = await agent.start();
    log("start() returned", result);
  } finally {
    isStarting = false;
    startBtn.disabled = false;
  }
});

approveBtn.addEventListener("click", async () => {
  if (!agent) {
    log("No active agent session to approve");
    return;
  }

  const result = await agent.approvePendingAction();
  log("approvePendingAction()", result);

  if (result.status === "executed") {
    setStatus("approved and executed");
    const continuation = await agent.start();
    log("resume start()", continuation);
  }
});

stopBtn.addEventListener("click", () => {
  if (!agent) {
    return;
  }

  agent.stop();
  isStarting = false;
  startBtn.disabled = false;
  setStatus("stopped");
  log("stop() called");
});

setStatus("idle");
log("Demo ready (WebLLM mode)");
