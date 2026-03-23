import { createBrowserAgent } from "https://unpkg.com/@akshayram1/omnibrowser-agent/dist/lib.js";

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

const startBtn = document.getElementById("start");
const approveBtn = document.getElementById("approve");
const stopBtn = document.getElementById("stop");

let agent = null;
let enginePromise = null;
const AGENT_SCOPE_SELECTOR = "#crm-root";
const PLANNER_TIMEOUT_MS = 7000;
let isStarting = false;
let lastOpenedProfileName = "";

async function loadWebLLMModule() {
  const sources = [
    "https://esm.run/@mlc-ai/web-llm@0.2.82",
    "https://esm.run/@mlc-ai/web-llm",
    "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.82/+esm"
  ];

  let lastError = null;
  for (const source of sources) {
    try {
      log("Trying WebLLM source", { source });
      return await import(source);
    } catch (error) {
      lastError = error;
      log("WebLLM source failed", { source, message: String(error) });
    }
  }

  throw lastError ?? new Error("Failed to load WebLLM module from all configured CDN sources");
}

async function loadEngine(modelId) {
  if (enginePromise) {
    return enginePromise;
  }

  enginePromise = (async () => {
    setStatus(`loading WebLLM model: ${modelId}`);
    log("Loading WebLLM from CDN", { modelId });

    const webllm = await loadWebLLMModule();
    const engine = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback: (report) => {
        const progress = Math.round((report.progress ?? 0) * 100);
        setStatus(`loading model ${progress}%`);
      }
    });

    setStatus("WebLLM model loaded");
    log("WebLLM ready", { modelId });
    return engine;
  })().catch((error) => {
    enginePromise = null;
    setStatus("WebLLM load failed");
    log("WebLLM load error", {
      message: String(error),
      hint: "Check WebGPU support and try Chrome/Edge latest version."
    });
    throw error;
  });

  return enginePromise;
}

function parseActionFromModel(content) {
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("WebLLM response was empty");
  }

  const direct = content.trim();
  if (direct.startsWith("{") && direct.endsWith("}")) {
    return JSON.parse(direct);
  }

  const start = content.indexOf("{");
  if (start === -1) {
    throw new Error("WebLLM response did not include JSON action");
  }

  let depth = 0;
  for (let index = start; index < content.length; index += 1) {
    const char = content[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(content.slice(start, index + 1));
      }
    }
  }

  throw new Error("WebLLM returned incomplete JSON object");
}

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

async function createPlannerResponse(engine, messages, useJsonMode) {
  const payload = {
    temperature: 0,
    messages,
    max_tokens: 64
  };

  if (useJsonMode) {
    payload.response_format = { type: "json_object" };
  }

  return engine.chat.completions.create(payload);
}

function withTimeout(promise, ms, label) {
  let timerId = null;

  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => reject(new Error(`${label} after ${ms}ms`)), ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timerId) {
      clearTimeout(timerId);
    }
  });
}

window.__browserAgentWebLLM = {
  async plan(input, modelId) {
    const resolvedModel = modelId || modelEl.value;
    const engine = await loadEngine(resolvedModel);

    const scopedCandidates = (input.snapshot.candidates || [])
      .filter((candidate) => isSelectorInScope(candidate.selector))
      .slice(0, 12)
      .map((candidate) => ({
        selector: candidate.selector,
        role: candidate.role,
        text: candidate.text
      }));

    const compactText = (input.snapshot.textPreview || "").slice(0, 260);
    const compactHistory = (input.history || []).slice(-2);

    const prompt = [
      "Return exactly one JSON action.",
      "Allowed action types: click, type, navigate, extract, wait, done.",
      "Use this exact schema: click{type,selector}, type{type,selector,text,clearFirst?}, navigate{type,url}, extract{type,selector,label}, wait{type,ms}, done{type,reason}.",
      "If type is navigate you must include a valid http/https url in url field.",
      "Only use selectors that are inside #crm-root.",
      "Do not output markdown.",
      "IMPORTANT: For type actions, the text field must be the exact value specified in the goal — never use placeholder text from the page.",
      "EXAMPLES:",
      'Goal: put notes as employee → {"type":"type","selector":"#notes","text":"employee","clearFirst":true}',
      'Goal: fill name as John Smith → {"type":"type","selector":"#name","text":"John Smith","clearFirst":true}',
      'Goal: type company as Acme → {"type":"type","selector":"#company","text":"Acme","clearFirst":true}',
      'Goal: click submit → {"type":"click","selector":"#submit-contact"}',
      "END EXAMPLES.",
      "Goal:",
      input.goal,
      "Page:",
      `${input.snapshot.title} | ${input.snapshot.url}`,
      "Text preview:",
      compactText,
      "Candidates:",
      JSON.stringify(scopedCandidates),
      "History:",
      JSON.stringify(compactHistory)
    ].join("\n");

    const messages = [
      {
        role: "system",
        content:
          "You are a browser planner. Choose one safe next step toward the goal. Return exactly one JSON object and nothing else."
      },
      { role: "user", content: prompt }
    ];

    try {
      const response = await withTimeout(
        createPlannerResponse(engine, messages, true),
        PLANNER_TIMEOUT_MS,
        "WebLLM planner timeout"
      );
      const content = response.choices?.[0]?.message?.content ?? "";
      const action = normalizeAction(parseActionFromModel(content));
      log("WebLLM planned action", { action });
      return action;
    } catch (error) {
      log("WebLLM planning failed", { message: String(error) });
    }

    const fallback = normalizeAction(ruleBasedFallbackAction(input));
    log("Using deterministic fallback action", fallback);
    return fallback;
  }
};

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
