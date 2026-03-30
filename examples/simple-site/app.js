import { createBrowserAgent, createWebLLMBridge } from "../../dist/lib.js";

// ── Contacts data ──
let contacts = [
  { id: 1, name: "Jane Doe", email: "jane@acme.com", company: "Acme Corp" },
  { id: 2, name: "John Smith", email: "john@globex.com", company: "Globex" },
  { id: 3, name: "Alice Chen", email: "alice@initech.io", company: "Initech" },
];
let nextId = 4;
let filter = "";

// ── DOM ──
const $ = id => document.getElementById(id);
const tbody = $("tbody"), countEl = $("count"), profileEl = $("profile");
const searchInput = $("search-input"), msgEl = $("msg");
const goalInput = $("goal"), runBtn = $("run-btn"), logEl = $("log");
const approvalEl = $("approval"), statusEl = $("status"), sdotEl = $("sdot");
let agent = null, llmEngine = null;

// ── Render contacts ──
function render() {
  const list = filter ? contacts.filter(c =>
    c.name.toLowerCase().includes(filter) || c.company.toLowerCase().includes(filter)
  ) : contacts;
  countEl.textContent = `(${contacts.length})`;
  tbody.innerHTML = list.length === 0
    ? `<tr><td colspan="4" style="text-align:center;color:var(--m);padding:20px">${filter ? "No matches." : "No contacts."}</td></tr>`
    : list.map(c => `<tr>
        <td style="font-weight:600">${c.name}</td><td style="color:var(--m)">${c.email}</td><td>${c.company}</td>
        <td><button class="tbl-btn view-btn" data-id="${c.id}">View</button></td>
      </tr>`).join("");
  tbody.querySelectorAll(".view-btn").forEach(b =>
    b.addEventListener("click", () => {
      const c = contacts.find(x => x.id === +b.dataset.id);
      if (!c) return;
      $("p-name").textContent = c.name;
      $("p-email").textContent = `Email: ${c.email}`;
      $("p-company").textContent = `Company: ${c.company}`;
      profileEl.classList.add("open");
      log("Opened " + c.name);
    })
  );
}
render();

// ── Search ──
$("search-btn").addEventListener("click", () => {
  filter = searchInput.value.trim().toLowerCase();
  render();
  const s = $("search-status");
  if (filter) { s.textContent = `${contacts.filter(c => c.name.toLowerCase().includes(filter) || c.company.toLowerCase().includes(filter)).length} results`; s.style.display = "block"; }
  else s.style.display = "none";
});
searchInput.addEventListener("keydown", e => { if (e.key === "Enter") $("search-btn").click(); });

// ── Submit form ──
$("submit-btn").addEventListener("click", () => {
  const name = $("name").value.trim();
  if (!name) { msgEl.className = "msg err"; msgEl.textContent = "Name is required."; return; }
  contacts.push({ id: nextId++, name, email: $("email").value.trim() || "—", company: $("company").value.trim() || "—" });
  render();
  ["name","email","phone","company","notes"].forEach(id => $(id).value = "");
  msgEl.className = "msg ok"; msgEl.textContent = `Added ${name}.`;
  log("Added " + name);
  setTimeout(() => msgEl.className = "msg", 3000);
});

// ── Logging ──
function log(msg) {
  const s = document.createElement("span");
  s.textContent = `${new Date().toLocaleTimeString("en",{hour12:false,hour:"2-digit",minute:"2-digit",second:"2-digit"})} ${msg}`;
  logEl.prepend(s);
}

// ── Flash ──
function flash(sel) {
  try { const el = document.querySelector(sel); if (!el) return; el.classList.remove("agent-act"); void el.offsetWidth; el.classList.add("agent-act"); setTimeout(() => el.classList.remove("agent-act"), 1200); } catch {}
}

// ── Load AI ──
const PLANNER = { id: "omnibrowser-planner-1p5b-q4f16_1", repo: "https://huggingface.co/Akshayram1/omnibrowser-planner-1p5b-q4f16_1-MLC", wasm: "Qwen2-1.5B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm" };

$("load-btn").addEventListener("click", async () => {
  if (!navigator.gpu) { statusEl.textContent = "no WebGPU"; log("WebGPU unavailable — using heuristic"); return; }
  const modelId = $("model").value;
  $("load-btn").disabled = true;
  sdotEl.className = "sdot loading";
  statusEl.textContent = "loading...";
  log("Loading " + modelId);
  try {
    const webllm = await import("https://esm.run/@mlc-ai/web-llm");
    const opts = modelId === PLANNER.id ? { appConfig: { model_list: [...webllm.prebuiltAppConfig.model_list, { model: PLANNER.repo, model_id: PLANNER.id, model_lib: webllm.modelLibURLPrefix + webllm.modelVersion + "/" + PLANNER.wasm }] } } : {};
    llmEngine = await webllm.CreateMLCEngine(modelId, { ...opts, initProgressCallback({ text }) { statusEl.textContent = text?.slice(0, 50) || "loading..."; } });
    window.__browserAgentWebLLM = createWebLLMBridge(llmEngine);
    sdotEl.className = "sdot on";
    statusEl.textContent = "AI ready";
    $("load-btn").textContent = "Reload";
    log("Model loaded");
  } catch (e) {
    sdotEl.className = "sdot"; statusEl.textContent = "load failed";
    log("Error: " + e);
  }
  $("load-btn").disabled = false;
});

// ── Run agent ──
function resetForm() { ["name","email","phone","company","notes"].forEach(id => $(id).value = ""); msgEl.className = "msg"; }

const PROMPT = "You control a simple CRM page. Use ONLY selectors from candidates. For form controls, `value` is the current value; `placeholder` is hint text. If goal is done, return done. Check History — never repeat the same action.";

async function run(goal) {
  if (agent) agent.stop();
  resetForm();
  runBtn.disabled = true; runBtn.textContent = "Running...";
  approvalEl.classList.remove("on");
  log("Goal: " + goal);

  agent = createBrowserAgent(
    { goal, mode: $("mode").value, planner: llmEngine ? { kind: "webllm", modelId: $("model").value, systemPrompt: PROMPT } : { kind: "heuristic" }, maxSteps: 12, stepDelayMs: 600 },
    {
      onStep(r) {
        if (r.reflection?.nextGoal) log("→ " + r.reflection.nextGoal);
        log((r.status === "executed" ? "✓ " : "· ") + r.message);
        if (r.status === "executed" && r.action?.selector) flash(r.action.selector);
      },
      onApprovalRequired(action) {
        $("approval-text").textContent = `Approve ${action.type}?`;
        approvalEl.classList.add("on");
        log("Needs approval: " + action.type);
      },
      onDone(r) { log("Done: " + r.message); done(); },
      onMaxStepsReached() { log("Max steps"); done(); },
      onError(e) { log("Error: " + e); done(); }
    }
  );
  await agent.start();
  done();
}

function done() { runBtn.disabled = false; runBtn.textContent = "Run"; approvalEl.classList.remove("on"); }

// ── Controls ──
runBtn.addEventListener("click", () => { const g = goalInput.value.trim(); if (g) { goalInput.value = ""; run(g); } });
goalInput.addEventListener("keydown", e => { if (e.key === "Enter") runBtn.click(); });
document.querySelectorAll(".chip[data-goal]").forEach(c => c.addEventListener("click", () => run(c.dataset.goal)));
$("ap-yes").addEventListener("click", async () => { if (!agent) return; approvalEl.classList.remove("on"); runBtn.disabled = true; runBtn.textContent = "Running..."; await agent.resume(); done(); });
$("ap-no").addEventListener("click", () => { agent?.stop(); done(); log("Rejected"); });

log("Ready — pick a goal or type your own");
