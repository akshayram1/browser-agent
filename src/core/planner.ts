import type { AgentAction, CandidateElement, PlannerConfig, PlannerInput } from "../shared/contracts";

type WebLLMBridge = {
  plan(input: PlannerInput, modelId?: string): Promise<AgentAction>;
};

type PageAgentBridge = {
  plan(input: PlannerInput): Promise<AgentAction>;
};

const URL_PATTERN = /(?:go to|navigate to|open)\s+(https?:\/\/\S+)/i;
const SEARCH_PATTERN = /search(?:\s+for)?\s+(.+)/i;
const FILL_PATTERN = /(?:fill|type|enter)\s+"?([^"]+)"?\s+(?:in(?:to)?|for|on)\s+(.+)/i;
const CLICK_PATTERN = /click(?:\s+(?:on|the))?\s+(.+)/i;

function findByText(candidates: CandidateElement[], text: string): CandidateElement | undefined {
  const lower = text.toLowerCase();
  return candidates.find(
    (c) =>
      c.text.toLowerCase().includes(lower) ||
      (c.placeholder?.toLowerCase().includes(lower) ?? false)
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
      return { type: "type", selector: target.selector, text, clearFirst: true, label: target.text || target.placeholder };
    }
  }

  const searchMatch = goal.match(SEARCH_PATTERN);
  if (searchMatch) {
    const input = findInput(snapshot.candidates);
    if (input) {
      return { type: "type", selector: input.selector, text: searchMatch[1].trim(), clearFirst: true, label: input.text || input.placeholder };
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
    return { type: "type", selector: firstInput.selector, text: searchTerm, clearFirst: true, label: firstInput.text || firstInput.placeholder };
  }

  if (firstButton && !history.some((h) => h.startsWith("Clicked"))) {
    return { type: "click", selector: firstButton.selector, label: firstButton.text };
  }

  return { type: "done", reason: "No further heuristic actions available" };
}

export async function planNextAction(config: PlannerConfig, input: PlannerInput): Promise<AgentAction> {
  if (config.kind === "heuristic") {
    return heuristicPlan(input);
  }

  if (config.kind === "page-agent") {
    const pageAgentBridge = (window as Window & { __browserAgentPageAgent?: PageAgentBridge }).__browserAgentPageAgent;
    if (!pageAgentBridge) {
      return {
        type: "done",
        reason: "page-agent bridge is not configured. Assign a PageAgentBridge to window.__browserAgentPageAgent."
      };
    }
    return pageAgentBridge.plan(input);
  }

  const bridge = (window as Window & { __browserAgentWebLLM?: WebLLMBridge }).__browserAgentWebLLM;
  if (!bridge) {
    return {
      type: "done",
      reason: "WebLLM bridge is not configured. Use heuristic mode or wire a local bridge implementation."
    };
  }

  return bridge.plan(input, config.modelId);
}
