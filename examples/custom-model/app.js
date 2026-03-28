import { createBrowserAgent, createWebLLMBridge } from "../../dist/lib.js";

const repoInput = document.getElementById("repo");
const modelIdInput = document.getElementById("model-id");
const wasmInput = document.getElementById("wasm");
const loadModelBtn = document.getElementById("load-model");
const modelStatus = document.getElementById("model-status");
const progressFill = document.getElementById("progress-fill");
const progressText = document.getElementById("progress-text");

const goalInput = document.getElementById("goal");
const modeSelect = document.getElementById("mode");
const runBtn = document.getElementById("run-agent");
const approveBtn = document.getElementById("approve-agent");
const stopBtn = document.getElementById("stop-agent");
const logEl = document.getElementById("log");

const searchInput = document.getElementById("demo-search");
const searchBtn = document.getElementById("demo-search-btn");
const openBtn = document.getElementById("demo-open-first");
const resultsEl = document.getElementById("demo-results");

const contacts = [
  { name: "Jane Doe", company: "Acme Labs", email: "jane@acme.test" },
  { name: "John Smith", company: "Northwind", email: "john@northwind.test" },
  { name: "Priya Nair", company: "Bluefin Tech", email: "priya@bluefin.test" },
  { name: "Carlos Vega", company: "Atlas Freight", email: "carlos@atlas.test" }
];

let engine = null;
let activeAgent = null;

function log(message) {
  const ts = new Date().toLocaleTimeString();
  logEl.textContent = `[${ts}] ${message}\n${logEl.textContent}`;
}

function setModelStatus(text) {
  modelStatus.textContent = text;
}

function repoURL() {
  return repoInput.value.trim().replace(/\/+$/, "");
}

function currentModelId() {
  return modelIdInput.value.trim();
}

function currentWasm() {
  return wasmInput.value.trim();
}

function renderResults(query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    resultsEl.textContent = "No query entered yet.";
    return;
  }
  const hit = contacts.find((row) => row.name.toLowerCase().includes(q));
  if (!hit) {
    resultsEl.textContent = `No match found for "${query}".`;
    return;
  }
  resultsEl.textContent = `${hit.name} • ${hit.company} • ${hit.email}`;
}

searchBtn.addEventListener("click", () => {
  renderResults(searchInput.value);
});

openBtn.addEventListener("click", () => {
  if (resultsEl.textContent.startsWith("No")) {
    resultsEl.textContent = "Open blocked: run a search first.";
    return;
  }
  resultsEl.textContent = `Opened profile: ${resultsEl.textContent}`;
});

async function loadCustomModel() {
  if (!navigator.gpu) {
    setModelStatus("WebGPU unavailable in this browser.");
    log("WebGPU is unavailable; custom model loading skipped.");
    return;
  }

  const repo = repoURL();
  const modelId = currentModelId();
  const wasm = currentWasm();

  if (!repo || !modelId || !wasm) {
    setModelStatus("Missing required model fields.");
    return;
  }

  loadModelBtn.disabled = true;
  setModelStatus("Loading model...");
  progressFill.style.width = "0%";
  progressText.textContent = "Starting";

  try {
    const webllm = await import("https://esm.run/@mlc-ai/web-llm");
    const modelEntry = {
      model: repo,
      model_id: modelId,
      model_lib: webllm.modelLibURLPrefix + webllm.modelVersion + "/" + wasm
    };

    const appConfig = {
      model_list: [...webllm.prebuiltAppConfig.model_list, modelEntry]
    };

    engine = await webllm.CreateMLCEngine(modelId, {
      appConfig,
      initProgressCallback({ progress, text }) {
        progressFill.style.width = `${Math.round(progress * 100)}%`;
        progressText.textContent = text || `${Math.round(progress * 100)}%`;
      }
    });

    window.__browserAgentWebLLM = createWebLLMBridge(engine);
    setModelStatus(`Loaded: ${modelId}`);
    log(`Custom model ready (${modelId})`);
  } catch (error) {
    engine = null;
    window.__browserAgentWebLLM = undefined;
    setModelStatus("Load failed. Check repo URL / wasm filename.");
    log(`Model load failed: ${String(error)}`);
  } finally {
    loadModelBtn.disabled = false;
  }
}

loadModelBtn.addEventListener("click", loadCustomModel);

runBtn.addEventListener("click", async () => {
  const goal = goalInput.value.trim();
  if (!goal) {
    log("Enter a goal before running the agent.");
    return;
  }

  if (!window.__browserAgentWebLLM) {
    log("Load a custom model first.");
    return;
  }

  if (activeAgent?.isRunning) {
    activeAgent.stop();
  }

  const modelId = currentModelId();

  activeAgent = createBrowserAgent(
    {
      goal,
      mode: modeSelect.value,
      planner: { kind: "webllm", modelId }
    },
    {
      onStart: () => log(`Agent started (${modeSelect.value})`),
      onStep: (result) => {
        if (result.reflection?.nextGoal) {
          log(`thinking: ${result.reflection.nextGoal}`);
        }
        log(`step: ${result.message}`);
      },
      onApprovalRequired: (action) => {
        log(`approval required: ${JSON.stringify(action)}`);
      },
      onDone: (result) => log(`done: ${result.message}`),
      onError: (error) => log(`error: ${String(error)}`),
      onMaxStepsReached: () => log("max steps reached")
    }
  );

  try {
    await activeAgent.start();
  } catch (error) {
    log(`start failed: ${String(error)}`);
  }
});

approveBtn.addEventListener("click", async () => {
  if (!activeAgent) {
    log("No active agent session.");
    return;
  }
  try {
    await activeAgent.resume();
    log("Approved pending action.");
  } catch (error) {
    log(`resume failed: ${String(error)}`);
  }
});

stopBtn.addEventListener("click", () => {
  if (!activeAgent) return;
  activeAgent.stop();
  log("Agent stopped.");
});

log("Custom model demo ready.");
