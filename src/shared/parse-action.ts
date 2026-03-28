import type { AgentAction, PlannerResult } from "./contracts";

export const PARSE_FAILURE_PATTERN = /(No JSON|JSON parse error|Parsed value is not an object|Unknown or missing action type|Missing required field)/;

const VALID_TYPES = new Set([
  "click", "type", "navigate", "extract", "scroll", "focus", "wait", "done",
]);

/**
 * Extract the first complete JSON object from text using bracket counting.
 * More robust than regex: handles prose before/after JSON, and repairs
 * truncated output (e.g. when the model hits a token limit mid-JSON).
 */
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\" && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  // Truncated JSON (hit token limit mid-output) — close remaining open braces.
  if (depth > 0) {
    return text.slice(start) + "}".repeat(depth);
  }

  return null;
}

/**
 * Parse an AgentAction from raw LLM output.
 *
 * Handles bare JSON, markdown fences, and JSON embedded in prose.
 * Returns a "done" action if parsing fails, so the caller always gets a valid AgentAction.
 */
export function parseAction(raw: string): AgentAction {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1].trim() : raw.trim();

  const jsonStr = extractFirstJsonObject(candidate);
  if (!jsonStr) {
    return { type: "done", reason: `No JSON object found in: ${raw.slice(0, 120)}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return { type: "done", reason: `JSON parse error for: ${jsonStr.slice(0, 120)}` };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { type: "done", reason: "Parsed value is not an object" };
  }

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.type !== "string" || !VALID_TYPES.has(obj.type)) {
    return { type: "done", reason: `Unknown or missing action type: ${String(obj.type)}` };
  }

  const t = obj.type;
  if ((t === "click" || t === "type" || t === "extract" || t === "focus") && typeof obj.selector !== "string") {
    return { type: "done", reason: `Missing required field 'selector' for action type: ${t}` };
  }
  if (t === "extract" && typeof obj.label !== "string") {
    return { type: "done", reason: `Missing required field 'label' for action type: extract` };
  }
  if (t === "type" && typeof obj.text !== "string") {
    return { type: "done", reason: `Missing required field 'text' for action type: type` };
  }
  if (t === "navigate" && typeof obj.url !== "string") {
    return { type: "done", reason: `Missing required field 'url' for action type: navigate` };
  }
  if (t === "scroll" && typeof obj.deltaY !== "number") {
    return { type: "done", reason: `Missing required field 'deltaY' for action type: scroll` };
  }
  if (t === "wait" && typeof obj.ms !== "number") {
    return { type: "done", reason: `Missing required field 'ms' for action type: wait` };
  }
  if (t === "done" && typeof obj.reason !== "string") {
    return { type: "done", reason: `Missing required field 'reason' for action type: done` };
  }

  return obj as unknown as AgentAction;
}

/**
 * Parse a full PlannerResult from raw LLM output.
 *
 * Accepts the reflection+action format:
 *   { "evaluation": "...", "memory": "...", "nextGoal": "...", "action": { ... } }
 * Also supports legacy `next_goal` key for backward compatibility.
 *
 * Also accepts a bare AgentAction for backward compatibility with simple bridges.
 */
export function parsePlannerResult(raw: string): PlannerResult {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1].trim() : raw.trim();

  const jsonStr = extractFirstJsonObject(candidate);
  if (!jsonStr) {
    return { action: { type: "done", reason: `No JSON found in: ${raw.slice(0, 120)}` } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return { action: { type: "done", reason: `JSON parse error: ${jsonStr.slice(0, 120)}` } };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { action: { type: "done", reason: "Parsed value is not an object" } };
  }

  const obj = parsed as Record<string, unknown>;

  // Full reflection format: { evaluation, memory, nextGoal, action }
  if (typeof obj.action === "object" && obj.action !== null) {
    const action = parseAction(JSON.stringify(obj.action));
    return {
      action,
      evaluation: typeof obj.evaluation === "string" ? obj.evaluation : undefined,
      memory:     typeof obj.memory     === "string" ? obj.memory     : undefined,
      nextGoal:
        typeof obj.nextGoal === "string"
          ? obj.nextGoal
          : typeof obj.next_goal === "string"
            ? obj.next_goal
            : undefined,
    };
  }

  // Fallback: bare AgentAction (no reflection fields)
  return { action: parseAction(jsonStr) };
}
