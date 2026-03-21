import type { AgentAction } from "./contracts";

const VALID_TYPES = new Set([
  "click", "type", "navigate", "extract", "scroll", "focus", "wait", "done",
]);

/**
 * Parse an AgentAction from raw LLM output.
 *
 * Handles:
 * - Bare JSON objects:  {"type":"click","selector":"#btn"}
 * - Markdown fences:   ```json\n{"type":"click",...}\n```
 * - JSON embedded in prose: "Sure! {"type":"click",...}"
 *
 * Returns a "done" action with the parse error as the reason if parsing fails,
 * so the caller always gets a valid AgentAction.
 */
export function parseAction(raw: string): AgentAction {
  // Strip markdown code fences if present
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1].trim() : raw.trim();

  // Extract the first {...} block from the candidate string
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
