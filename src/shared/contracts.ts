export type AgentMode = "autonomous" | "human-approved";
export type PlannerKind = "heuristic" | "webllm";
export type RiskLevel = "safe" | "review" | "blocked";

export type AgentAction =
  | { type: "click"; selector: string; label?: string }
  | { type: "type"; selector: string; text: string; clearFirst?: boolean; label?: string }
  | { type: "navigate"; url: string }
  | { type: "extract"; selector: string; label: string }
  | { type: "scroll"; selector?: string; deltaY: number }
  | { type: "focus"; selector: string }
  | { type: "wait"; ms: number }
  | { type: "done"; reason: string };

export interface CandidateElement {
  selector: string;
  role: string;
  text: string;
  placeholder?: string;
  /** Associated <label> text resolved via for/id, aria-labelledby, aria-label, or wrapping <label> */
  label?: string;
}

export interface PageSnapshot {
  url: string;
  title: string;
  textPreview: string;
  candidates: CandidateElement[];
}

export interface PlannerInput {
  goal: string;
  snapshot: PageSnapshot;
  history: string[];
  /** Error message from the previous step, fed back so the planner can recover */
  lastError?: string;
  /** Accumulated working memory written by the planner across steps */
  memory?: string;
}

/**
 * What the planner returns: the next action plus optional reflection fields.
 *
 * Inspired by page-agent's evaluate → remember → plan → act loop.
 * - `evaluation`  — what happened in the previous step
 * - `memory`      — facts to carry into the next step
 * - `nextGoal`    — what the planner intends to do next (shown as a thought bubble in UI)
 */
export interface PlannerResult {
  action: AgentAction;
  evaluation?: string;
  memory?: string;
  nextGoal?: string;
}

export interface PlannerConfig {
  kind: PlannerKind;
  modelId?: string;
}

export interface AgentSession {
  id: string;
  tabId: number | null;
  goal: string;
  mode: AgentMode;
  planner: PlannerConfig;
  history: string[];
  isRunning: boolean;
  pendingAction?: AgentAction;
  /** Carried between ticks — last error for retry feedback */
  lastError?: string;
  /** Working memory accumulated by the planner across steps */
  memory?: string;
}

export interface LibraryAgentConfig {
  goal: string;
  mode?: AgentMode;
  planner?: PlannerConfig;
  maxSteps?: number;
  stepDelayMs?: number;
  signal?: AbortSignal;
}

export interface LibraryAgentEvents {
  onStart?: (session: AgentSession) => void;
  onStep?: (result: ContentResult, session: AgentSession) => void;
  onApprovalRequired?: (action: AgentAction, session: AgentSession) => void;
  onDone?: (result: ContentResult, session: AgentSession) => void;
  onError?: (error: unknown, session: AgentSession) => void;
  onMaxStepsReached?: (session: AgentSession) => void;
}

export type ContentCommand =
  | { type: "AGENT_TICK"; session: AgentSession }
  | { type: "AGENT_STOP" };

export type ContentResult = {
  status: "executed" | "needs_approval" | "blocked" | "done" | "error";
  message: string;
  action?: AgentAction;
  /** Reflection fields from the planner — evaluation, memory, and next goal */
  reflection?: {
    evaluation?: string;
    memory?: string;
    nextGoal?: string;
  };
};
