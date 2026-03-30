import { createBrowserAgent, createWebLLMBridge } from "../../dist/lib.js";

// ── DOM refs ──
const goalInput     = document.getElementById("goal-input");
const runBtn        = document.getElementById("run-btn");
const modeSelect    = document.getElementById("mode-select");
const modelSelect   = document.getElementById("model-select");
const loadBtn       = document.getElementById("load-btn");
const progressWrap  = document.getElementById("progress-wrap");
const progressFill  = document.getElementById("progress-fill");
const progressText  = document.getElementById("progress-text");
const webgpuWarn    = document.getElementById("webgpu-warn");
const sdot          = document.getElementById("sdot");
const modelStatusText = document.getElementById("model-status-text");
const agentStatus   = document.getElementById("agent-status");
const logArea       = document.getElementById("log-area");
const approvalBanner = document.getElementById("approval-banner");
const approvalDetail = document.getElementById("approval-detail");
const approveBtn    = document.getElementById("approve-btn");
const rejectBtn     = document.getElementById("reject-btn");

const searchInput   = document.getElementById("search-input");
const searchBtn     = document.getElementById("search-btn");
const searchStatus  = document.getElementById("search-status");
const contactsTbody = document.getElementById("contacts-tbody");
const contactCount  = document.getElementById("contact-count");
const profileCard   = document.getElementById("profile-card");
const profileName   = document.getElementById("profile-name");
const profileEmail  = document.getElementById("profile-email");
const profileCompany = document.getElementById("profile-company");
const submitBtn     = document.getElementById("submit-contact");
const submitResult  = document.getElementById("submit-result");

// ── State ──
let currentAgent = null;
let llmEngine = null;

let contacts = [
  { id: 1, name: "Jane Doe",    email: "jane@acme.com",    company: "Acme Corp" },
  { id: 2, name: "John Smith",  email: "john@globex.com",  company: "Globex" },
  { id: 3, name: "Alice Chen",  email: "alice@initech.io", company: "Initech" },
];
let nextId = 4;
let searchFilter = "";

// ── Logging ──
function log(msg, variant = "") {
  const entry = document.createElement("div");
  entry.className = "log-entry";
  const time = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const cls = variant === "ok" ? "log-ok" : variant === "err" ? "log-err" : variant === "info" ? "log-info" : "";
  entry.innerHTML = `<span class="log-time">${time}</span> <span class="${cls}">${msg}</span>`;
  logArea.prepend(entry);
}

function setAgentStatus(text) { agentStatus.textContent = text; }
function setRunning(on) {
  runBtn.disabled = on;
  runBtn.textContent = on ? "Running..." : "Run";
}

// ── Contacts rendering ──
function renderContacts() {
  const filtered = searchFilter
    ? contacts.filter(c =>
        c.name.toLowerCase().includes(searchFilter) ||
        c.email.toLowerCase().includes(searchFilter) ||
        c.company.toLowerCase().includes(searchFilter))
    : contacts;

  contactsTbody.innerHTML = "";
  if (filtered.length === 0) {
    contactsTbody.innerHTML = `<tr><td colspan="4" class="empty-state">${searchFilter ? "No contacts match your search." : "No contacts yet."}</td></tr>`;
  } else {
    filtered.forEach(c => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="contact-name">${c.name}</td>
        <td class="contact-email">${c.email}</td>
        <td><span class="badge">${c.company}</span></td>
        <td>
          <button class="table-btn open-profile-btn" data-id="${c.id}">View</button>
          <button class="table-btn danger delete-btn" data-id="${c.id}">Delete</button>
        </td>`;
      contactsTbody.appendChild(tr);
    });
  }
  contactCount.textContent = `${contacts.length} contact${contacts.length !== 1 ? "s" : ""}`;

  // Attach handlers
  contactsTbody.querySelectorAll(".open-profile-btn").forEach(btn => {
    btn.addEventListener("click", () => openProfile(Number(btn.dataset.id)));
  });
  contactsTbody.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      contacts = contacts.filter(c => c.id !== Number(btn.dataset.id));
      profileCard.classList.remove("visible");
      renderContacts();
    });
  });
}

function openProfile(id) {
  const c = contacts.find(x => x.id === id);
  if (!c) return;
  profileName.textContent = c.name;
  profileEmail.textContent = `Email: ${c.email}`;
  profileCompany.textContent = `Company: ${c.company}`;
  profileCard.classList.add("visible");
  log(`Profile opened: ${c.name}`, "ok");
}

renderContacts();

// ── Search ──
function doSearch() {
  searchFilter = searchInput.value.trim().toLowerCase();
  renderContacts();
  if (searchFilter) {
    const count = contacts.filter(c =>
      c.name.toLowerCase().includes(searchFilter) ||
      c.email.toLowerCase().includes(searchFilter) ||
      c.company.toLowerCase().includes(searchFilter)).length;
    searchStatus.textContent = `Found ${count} result${count !== 1 ? "s" : ""} for "${searchInput.value.trim()}"`;
    searchStatus.style.display = "block";
  } else {
    searchStatus.style.display = "none";
  }
}
searchBtn.addEventListener("click", doSearch);
searchInput.addEventListener("keydown", e => { if (e.key === "Enter") doSearch(); });

// ── Submit contact form ──
submitBtn.addEventListener("click", () => {
  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  if (!name) {
    submitResult.className = "submit-result error";
    submitResult.textContent = "Please enter a name.";
    return;
  }
  contacts.push({
    id: nextId++,
    name,
    email: email || "—",
    company: document.getElementById("company").value.trim() || "—"
  });
  renderContacts();
  ["name", "email", "phone", "company", "notes"].forEach(id => { document.getElementById(id).value = ""; });
  submitResult.className = "submit-result success";
  submitResult.textContent = `Added ${name} to contacts.`;
  log(`Contact added: ${name}`, "ok");
  setTimeout(() => { submitResult.className = "submit-result"; }, 3000);
});

// ── Flash element when agent acts ──
function flash(selector) {
  try {
    const el = document.querySelector(selector);
    if (!el) return;
    el.classList.remove("agent-act");
    void el.offsetWidth;
    el.classList.add("agent-act");
    setTimeout(() => el.classList.remove("agent-act"), 1200);
  } catch {}
}

// ── Model loading ──
const PLANNER_MODEL = {
  id:   "omnibrowser-planner-1p5b-q4f16_1",
  repo: "https://huggingface.co/Akshayram1/omnibrowser-planner-1p5b-q4f16_1-MLC",
  wasm: "Qwen2-1.5B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm"
};

async function loadModel() {
  if (!navigator.gpu) {
    webgpuWarn.classList.add("visible");
    modelStatusText.textContent = "WebGPU unavailable — heuristic planner";
    log("WebGPU not available, using heuristic planner", "info");
    return;
  }

  const modelId = modelSelect.value;
  loadBtn.disabled = true;
  modelSelect.disabled = true;
  sdot.className = "sdot loading";
  modelStatusText.textContent = "Loading...";
  progressWrap.classList.add("visible");

  try {
    const webllm = await import("https://esm.run/@mlc-ai/web-llm");
    const engineOptions = modelId === PLANNER_MODEL.id ? {
      appConfig: {
        model_list: [
          ...webllm.prebuiltAppConfig.model_list,
          { model: PLANNER_MODEL.repo, model_id: PLANNER_MODEL.id, model_lib: webllm.modelLibURLPrefix + webllm.modelVersion + "/" + PLANNER_MODEL.wasm }
        ]
      }
    } : {};

    llmEngine = await webllm.CreateMLCEngine(modelId, {
      ...engineOptions,
      initProgressCallback({ progress, text }) {
        progressFill.style.width = `${Math.round(progress * 100)}%`;
        progressText.textContent = text || `${Math.round(progress * 100)}%`;
      }
    });

    progressWrap.classList.remove("visible");
    sdot.className = "sdot ready";
    const label = modelSelect.options[modelSelect.selectedIndex].text.split("—")[0].trim();
    modelStatusText.textContent = `${label} ready`;
    loadBtn.textContent = "Reload";
    loadBtn.disabled = false;
    modelSelect.disabled = false;
    log(`WebLLM ready: ${label}`, "ok");

    window.__browserAgentWebLLM = createWebLLMBridge(llmEngine);
  } catch (err) {
    llmEngine = null;
    progressWrap.classList.remove("visible");
    sdot.className = "sdot";
    modelStatusText.textContent = "Load failed";
    loadBtn.disabled = false;
    modelSelect.disabled = false;
    log(`Model load error: ${err}`, "err");
  }
}

loadBtn.addEventListener("click", loadModel);

// ── Reset form fields before each run ──
function resetForms() {
  ["name", "email", "phone", "company", "notes"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  submitResult.className = "submit-result";
  submitResult.textContent = "";
}

// ── System prompt for the WebLLM model ──
const SYSTEM_PROMPT = [
  "You are controlling a CRM demo page.",
  "ONLY use selectors exactly as listed in the candidates. NEVER invent selectors.",
  "CRM selectors: #search-input, #search-btn, #name, #email, #phone, #company, #notes, #submit-contact.",
  "For form controls, candidate `value` is the current filled value. `placeholder` is only hint text.",
  "CRITICAL: If a candidate shows 'state: active', do NOT click it again.",
  "CRITICAL: Check History. If you already acted on a selector, do NOT repeat — move to next step or return done.",
  "If the goal is already achieved, return done immediately.",
].join(" ");

// ── Run agent ──
async function runAgent(goal) {
  if (currentAgent) currentAgent.stop();
  resetForms();
  setRunning(true);
  setAgentStatus("running");
  approvalBanner.classList.remove("visible");

  if (!llmEngine) log("Running with heuristic planner", "info");

  currentAgent = createBrowserAgent(
    {
      goal,
      mode: modeSelect.value,
      planner: llmEngine
        ? { kind: "webllm", modelId: modelSelect.value, systemPrompt: SYSTEM_PROMPT }
        : { kind: "heuristic" },
      maxSteps: 12,
      stepDelayMs: 600
    },
    {
      onStep(result) {
        if (result.reflection?.nextGoal) {
          log(result.reflection.nextGoal, "info");
        }
        const icon = result.status === "executed" ? "+" : result.status === "error" ? "!" : "-";
        log(`[${icon}] ${result.message}`, result.status === "executed" ? "ok" : result.status === "error" ? "err" : "");
        if (result.status === "executed" && result.action?.selector) flash(result.action.selector);
      },
      onApprovalRequired(action) {
        setAgentStatus("approval needed");
        approvalDetail.textContent = JSON.stringify(action, null, 2);
        approvalBanner.classList.add("visible");
        log(`Approval needed: ${action.type}`, "info");
      },
      onDone(result) {
        setAgentStatus("done");
        log(`Done: ${result.message}`, "ok");
        setRunning(false);
        approvalBanner.classList.remove("visible");
      },
      onMaxStepsReached() {
        log("Reached max steps", "info");
        setRunning(false);
      },
      onError(err) {
        log(`Error: ${err}`, "err");
        setRunning(false);
      }
    }
  );

  await currentAgent.start();
  setRunning(false);
}

// ── Controls ──
runBtn.addEventListener("click", () => {
  const g = goalInput.value.trim();
  if (!g) return;
  goalInput.value = "";
  runAgent(g);
});
goalInput.addEventListener("keydown", e => { if (e.key === "Enter") runBtn.click(); });

document.querySelectorAll(".chip[data-goal]").forEach(chip => {
  chip.addEventListener("click", () => runAgent(chip.dataset.goal));
});

approveBtn.addEventListener("click", async () => {
  if (!currentAgent) return;
  approvalBanner.classList.remove("visible");
  setRunning(true);
  setAgentStatus("running");
  await currentAgent.resume();
  setRunning(false);
});

rejectBtn.addEventListener("click", () => {
  if (!currentAgent) return;
  currentAgent.stop();
  approvalBanner.classList.remove("visible");
  setAgentStatus("stopped");
  setRunning(false);
  log("Agent stopped by user", "info");
});

// ── Init ──
log("Simple Site demo ready");
