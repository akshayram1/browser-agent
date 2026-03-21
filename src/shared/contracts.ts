export type AgentMode = "autonomous" | "human-approved";
export type PlannerKind = "heuristic" | "webllm" | "page-agent";
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
  /** Associated <label> text resolved via for/id, wrapping label, or aria-labelledby */
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
  /** Carried between ticks by the background/runner so the planner can see the last error */
  lastError?: string;
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
};
