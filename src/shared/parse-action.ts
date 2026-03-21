import type { AgentAction, PlannerResult } from "./contracts";

const VALID_TYPES = new Set([
  "click", "type", "navigate", "extract", "scroll", "focus", "wait", "done",
]);

/**
 * Parse an AgentAction from raw LLM output.
 *
 * Handles bare JSON, markdown fences, and JSON embedded in prose.
 * Returns a "done" action if parsing fails, so the caller always gets a valid AgentAction.
 */
export function parseAction(raw: string): AgentAction {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1].trim() : raw.trim();

  const objectMatch = candidate.match(/\{[\s\S]*\}/);
  if (!objectMatch) {
    return { type: "done", reason: `No JSON object found in: ${raw.slice(0, 120)}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(objectMatch[0]);
  } catch {
    return { type: "done", reason: `JSON parse error for: ${objectMatch[0].slice(0, 120)}` };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { type: "done", reason: "Parsed value is not an object" };
  }

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.type !== "string" || !VALID_TYPES.has(obj.type)) {
    return { type: "done", reason: `Unknown or missing action type: ${String(obj.type)}` };
  }

  return obj as unknown as AgentAction;
}

/**
 * Parse a full PlannerResult from raw LLM output.
 *
 * Accepts the reflection+action format:
 *   { "evaluation": "...", "memory": "...", "next_goal": "...", "action": { ... } }
 *
 * Also accepts a bare AgentAction for backward compatibility with simple bridges.
 */
export function parsePlannerResult(raw: string): PlannerResult {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1].trim() : raw.trim();

  const objectMatch = candidate.match(/\{[\s\S]*\}/);
  if (!objectMatch) {
    return { action: { type: "done", reason: `No JSON found in: ${raw.slice(0, 120)}` } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(objectMatch[0]);
  } catch {
    return { action: { type: "done", reason: `JSON parse error: ${objectMatch[0].slice(0, 120)}` } };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { action: { type: "done", reason: "Parsed value is not an object" } };
  }

  const obj = parsed as Record<string, unknown>;

  // Full reflection format: { evaluation, memory, next_goal, action }
  if (typeof obj.action === "object" && obj.action !== null) {
    const action = parseAction(JSON.stringify(obj.action));
    return {
      action,
      evaluation: typeof obj.evaluation === "string" ? obj.evaluation : undefined,
      memory:     typeof obj.memory     === "string" ? obj.memory     : undefined,
      nextGoal:   typeof obj.next_goal  === "string" ? obj.next_goal  : undefined,
    };
  }

  // Fallback: bare AgentAction (no reflection fields)
  return { action: parseAction(objectMatch[0]) };
}
