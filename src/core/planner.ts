import type { AgentAction, CandidateElement, PlannerConfig, PlannerInput, PlannerResult } from "../shared/contracts";

type WebLLMBridge = {
  // Bridge may return PlannerResult (new), AgentAction (legacy), or raw LLM text.
  plan(input: PlannerInput, modelId?: string): Promise<PlannerResult | AgentAction | string>;
  // Optional retry hook that keeps chat history and asks for corrected JSON.
  retryInvalidJson?(input: PlannerInput, badOutput: string, modelId?: string): Promise<PlannerResult | AgentAction | string>;
};

const URL_PATTERN = /(?:go to|navigate to|open)\s+(https?:\/\/\S+)/i;
const SEARCH_PATTERN = /search(?:\s+for)?\s+(.+)/i;
const FILL_PATTERN = /(?:fill|type|enter)\s+"?([^"]+)"?\s+(?:in(?:to)?|for|on)\s+(.+)/i;
/** Matches "fill the name field with Jane Doe" — field first, text after "with" */
const FILL_WITH_PATTERN = /(?:fill|type|enter)\s+(?:the\s+)?(.+?)\s+(?:field\s+)?with\s+"?([^"]+)"?\s*$/i;
const CLICK_PATTERN = /click(?:\s+(?:on|the))?\s+(.+)/i;

function findByText(candidates: CandidateElement[], text: string): CandidateElement | undefined {
  const lower = text.toLowerCase();
  return candidates.find(
    (c) =>
      c.text.toLowerCase().includes(lower) ||
      (c.placeholder?.toLowerCase().includes(lower) ?? false) ||
      (c.label?.toLowerCase().includes(lower) ?? false)
  );
}

function findInput(candidates: CandidateElement[]): CandidateElement | undefined {
  return candidates.find(
    (c) => c.role === "input" || c.role === "textarea" || c.selector.includes("input") || c.selector.includes("textarea")
  );
}

function findButton(candidates: CandidateElement[]): CandidateElement | undefined {
  return candidates.find(
    (c) => c.role === "button" || c.role === "a" || c.selector.includes("button") || c.selector.includes("a")
  );
}

function heuristicPlan(input: PlannerInput): AgentAction {
  const { goal, snapshot, history } = input;

  const navMatch = goal.match(URL_PATTERN);
  if (navMatch) {
    return { type: "navigate", url: navMatch[1] };
  }

  const fillMatch = goal.match(FILL_PATTERN);
  if (fillMatch) {
    const [, text, fieldHint] = fillMatch;
    const target = findByText(snapshot.candidates, fieldHint) ?? findInput(snapshot.candidates);
    if (target) {
      return { type: "type", selector: target.selector, text, clearFirst: true, label: target.label || target.text || target.placeholder };
    }
  }

  // "fill the name field with Jane Doe" — field first, text after "with"
  const fillWithMatch = goal.match(FILL_WITH_PATTERN);
  if (fillWithMatch) {
    const [, fieldHint, text] = fillWithMatch;
    const target = findByText(snapshot.candidates, fieldHint) ?? findInput(snapshot.candidates);
    if (target) {
      return { type: "type", selector: target.selector, text, clearFirst: true, label: target.label || target.text || target.placeholder };
    }
  }

  const searchMatch = goal.match(SEARCH_PATTERN);
  if (searchMatch) {
    const input = findInput(snapshot.candidates);
    if (input) {
      return { type: "type", selector: input.selector, text: searchMatch[1].trim(), clearFirst: true, label: input.label || input.text || input.placeholder };
    }
  }

  const clickMatch = goal.match(CLICK_PATTERN);
  if (clickMatch) {
    const target = findByText(snapshot.candidates, clickMatch[1].trim());
    if (target) {
      return { type: "click", selector: target.selector, label: target.text };
    }
  }

  const firstInput = findInput(snapshot.candidates);
  const firstButton = findButton(snapshot.candidates);

  if (firstInput && !history.some((h) => h.startsWith("Typed"))) {
    const searchTerm = goal.replace(/.*(?:search|find|look up)\s+/i, "").trim();
    return { type: "type", selector: firstInput.selector, text: searchTerm, clearFirst: true, label: firstInput.label || firstInput.text || firstInput.placeholder };
  }

  if (firstButton && !history.some((h) => h.startsWith("Clicked"))) {
    return { type: "click", selector: firstButton.selector, label: firstButton.text };
  }

  return { type: "done", reason: "No further heuristic actions available" };
}

/** Normalize whatever a bridge returns into a PlannerResult. */
function toPlannerResult(raw: PlannerResult | AgentAction): PlannerResult {
  // New format: has an `action` key that is an object
  if ("action" in raw && typeof (raw as PlannerResult).action === "object") {
    return raw as PlannerResult;
  }
  // Legacy format: bare AgentAction
  return { action: raw as AgentAction };
}

async function parsePlannerText(raw: string): Promise<{ result: PlannerResult; parseFailed: boolean }> {
  const { parsePlannerResult, PARSE_FAILURE_PATTERN } = await import("../shared/parse-action");
  const result = parsePlannerResult(raw);
  const parseFailed = result.action.type === "done" && PARSE_FAILURE_PATTERN.test(result.action.reason);
  return { result, parseFailed };
}


async function normalizeBridgeResponse(
  raw: PlannerResult | AgentAction | string
): Promise<{ result: PlannerResult; parseFailed: boolean; rawText?: string }> {
  if (typeof raw === "string") {
    const { result, parseFailed } = await parsePlannerText(raw);
    return { result, parseFailed, rawText: raw };
  }

  return { result: toPlannerResult(raw), parseFailed: false };
}

export async function planNextAction(config: PlannerConfig, input: PlannerInput): Promise<PlannerResult> {
  if (config.kind === "heuristic") {
    return { action: heuristicPlan(input) };
  }

  const bridge = (window as Window & { __browserAgentWebLLM?: WebLLMBridge }).__browserAgentWebLLM;
  if (!bridge) {
    return {
      action: {
        type: "done",
        reason: "WebLLM bridge is not configured. Use heuristic mode or wire a WebLLM bridge implementation."
      }
    };
  }

  const plannerInput = { ...input, systemPrompt: config.systemPrompt };
  const firstAttempt = await normalizeBridgeResponse(await bridge.plan(plannerInput, config.modelId));

  if (!firstAttempt.parseFailed) {
    // Fallback: if the model returned a wait or premature done but the heuristic
    // can produce a concrete action, prefer the heuristic.  This catches cases
    // where the small WebLLM model stalls instead of acting.
    const action = firstAttempt.result.action;
    if (action.type === "wait" || action.type === "done") {
      const heuristic = heuristicPlan(input);
      if (heuristic.type !== "done") {
        return { action: heuristic };
      }
    }
    return firstAttempt.result;
  }

  if (bridge.retryInvalidJson && firstAttempt.rawText) {
    const retryAttempt = await normalizeBridgeResponse(
      await bridge.retryInvalidJson(plannerInput, firstAttempt.rawText, config.modelId)
    );

    if (!retryAttempt.parseFailed) {
      return retryAttempt.result;
    }
  }

  return {
    action: {
      type: "done",
      reason: "WebLLM output could not be parsed after retry."
    }
  };
}
