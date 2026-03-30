import type { CandidateElement, PlannerInput } from "../shared/contracts";

const MAX_TEXT_PREVIEW_LENGTH = 800;

const DEFAULT_SYSTEM_PROMPT = [
  "You are OmniBrowser Agent, an on-page web automation planner.",
  "Choose exactly one next action using the provided page snapshot.",
  "",
  "Output rules:",
  '- Reply with only one valid JSON object (no markdown fences, no prose).',
  '- JSON shape must be: { "evaluation": string, "memory": string, "nextGoal": string, "action": AgentAction }.',
  '- Keep evaluation/memory/nextGoal concise but informative.',
  "",
  "Valid AgentAction shapes:",
  '- {"type":"click","selector":"<css>","label":"<optional>"}',
  '- {"type":"type","selector":"<css>","text":"<text>","clearFirst":true|false,"label":"<optional>"}',
  '- {"type":"navigate","url":"https://..."}',
  '- {"type":"extract","selector":"<css>","label":"<label>"}',
  '- {"type":"scroll","selector":"<optional css>","deltaY":number}',
  '- {"type":"focus","selector":"<css>"}',
  '- {"type":"wait","ms":number}',
  '- {"type":"done","reason":"<reason>"}',
  "",
  "IMPORTANT: You MUST use selectors exactly as listed in the candidates. NEVER invent or guess selectors.",
  "If you cannot find a matching candidate for a target element, use the closest match from the candidates list.",
  "When previous step failed, recover by trying a different candidate selector or fallback strategy.",
  "NEVER use navigate for in-page tab switches or buttons — use click with the button's selector instead.",
  "",
  "Loop prevention rules (CRITICAL):",
  "- If a candidate shows 'state: active', it is already selected/active — do NOT click it again.",
  "- Check the History before acting. If the same selector was already clicked or typed in a recent step, do NOT repeat it — proceed to the next logical step or return done.",
  "- If the goal is already achieved (value is set, element clicked, task complete), return done immediately.",
  "- NEVER click a navigation tab or button more than once per goal unless the page changed to a different section."
].join("\n");

function formatCandidate(candidate: CandidateElement, index: number): string {
  const parts = [
    `${candidate.role || "element"}`,
    `selector: ${JSON.stringify(candidate.selector)}`,
    `text: ${JSON.stringify(candidate.text || "")}`
  ];

  if (candidate.label) {
    parts.push(`label: ${JSON.stringify(candidate.label)}`);
  }
  if (candidate.placeholder) {
    parts.push(`placeholder: ${JSON.stringify(candidate.placeholder)}`);
  }
  if (candidate.active) {
    parts.push(`state: active`);
  }

  return `[${index + 1}] ${parts.join(" | ")}`;
}

export function buildSystemPrompt(customPrompt?: string): string {
  if (!customPrompt?.trim()) {
    return DEFAULT_SYSTEM_PROMPT;
  }

  return `${DEFAULT_SYSTEM_PROMPT}\n\nAdditional instructions:\n${customPrompt.trim()}`;
}

export function buildUserMessage(input: PlannerInput): string {
  const { goal, snapshot, history, memory, lastError } = input;
  const candidates = snapshot.candidates.map(formatCandidate).join("\n");
  const historyLines = history.length > 0
    ? history.map((step, index) => `${index + 1}. ${step}`).join("\n")
    : "(none)";

  return [
    `Goal: ${goal}`,
    "",
    "Page snapshot:",
    `- URL: ${snapshot.url}`,
    `- Title: ${snapshot.title}`,
    `- Text preview (first ${MAX_TEXT_PREVIEW_LENGTH} chars): ${JSON.stringify(snapshot.textPreview.slice(0, MAX_TEXT_PREVIEW_LENGTH))}`,
    "",
    `Interactive candidates (${snapshot.candidates.length}):`,
    candidates || "(none)",
    "",
    "History:",
    historyLines,
    "",
    `Working memory: ${memory ? JSON.stringify(memory) : "(none)"}`,
    `Last error: ${lastError ? JSON.stringify(lastError) : "(none)"}`,
    "If Last error is present, recover and choose a different valid action."
  ].join("\n");
}
