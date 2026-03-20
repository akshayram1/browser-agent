import { executeAction } from "../core/executor";
import { collectSnapshot } from "../core/observer";
import { planNextAction } from "../core/planner";
import type {
  AgentAction,
  AgentSession,
  ContentResult,
  LibraryAgentConfig,
  LibraryAgentEvents,
  PlannerConfig
} from "../shared/contracts";
import { assessRisk } from "../shared/safety";

const DEFAULT_PLANNER: PlannerConfig = { kind: "heuristic" };

export class BrowserAgent {
  private session: AgentSession;
  private maxSteps: number;
  private stepDelayMs: number;
  private events: LibraryAgentEvents;
  private isStopped = false;
  private signal?: AbortSignal;

  constructor(config: LibraryAgentConfig, events: LibraryAgentEvents = {}) {
    this.session = {
      id: crypto.randomUUID(),
      tabId: null,
      goal: config.goal,
      mode: config.mode ?? "human-approved",
      planner: config.planner ?? DEFAULT_PLANNER,
      history: [],
      isRunning: false
    };

    this.maxSteps = config.maxSteps ?? 20;
    this.stepDelayMs = config.stepDelayMs ?? 500;
    this.events = events;
    this.signal = config.signal;
  }

  getSession(): AgentSession {
    return { ...this.session, history: [...this.session.history] };
  }

  get isRunning(): boolean {
    return this.session.isRunning;
  }

  get hasPendingAction(): boolean {
    return this.session.pendingAction != null;
  }

  async start(): Promise<ContentResult> {
    this.isStopped = false;
    this.session.isRunning = true;
    this.events.onStart?.(this.getSession());

    return this.runLoop();
  }

  async resume(): Promise<ContentResult> {
    if (this.session.pendingAction) {
      const approvalResult = await this.approvePendingAction();
      if (approvalResult.status === "error") {
        return approvalResult;
      }
    }
    this.session.isRunning = true;
    return this.runLoop();
  }

  private async runLoop(): Promise<ContentResult> {
    for (let step = 0; step < this.maxSteps; step += 1) {
      if (this.isStopped || !this.session.isRunning) {
        return { status: "done", message: "Stopped" };
      }

      if (this.signal?.aborted) {
        this.session.isRunning = false;
        return { status: "done", message: "Aborted" };
      }

      const result = await this.tick();
      this.session.history.push(result.message);
      this.events.onStep?.(result, this.getSession());

      if (result.status === "needs_approval") {
        this.session.pendingAction = result.action;
        this.session.isRunning = false;
        if (result.action) {
          this.events.onApprovalRequired?.(result.action, this.getSession());
        }
        return result;
      }

      if (["done", "blocked", "error"].includes(result.status)) {
        this.session.isRunning = false;
        this.events.onDone?.(result, this.getSession());
        return result;
      }

      await this.delay(this.stepDelayMs);
    }

    const result: ContentResult = { status: "done", message: "Reached max steps" };
    this.session.history.push(result.message);
    this.session.isRunning = false;
    this.events.onMaxStepsReached?.(this.getSession());
    this.events.onDone?.(result, this.getSession());
    return result;
  }

  async approvePendingAction(): Promise<ContentResult> {
    if (!this.session.pendingAction) {
      return { status: "error", message: "No pending action to approve" };
    }

    try {
      const message = await executeAction(this.session.pendingAction);
      const result: ContentResult = {
        status: "executed",
        message,
        action: this.session.pendingAction
      };
      this.session.history.push(message);
      this.session.pendingAction = undefined;
      this.session.isRunning = true;
      this.events.onStep?.(result, this.getSession());
      return result;
    } catch (error) {
      this.session.isRunning = false;
      this.events.onError?.(error, this.getSession());
      return { status: "error", message: String(error) };
    }
  }

  stop(): void {
    this.isStopped = true;
    this.session.isRunning = false;
  }

  private async tick(): Promise<ContentResult> {
    try {
      const snapshot = collectSnapshot();
      const action = await planNextAction(this.session.planner, {
        goal: this.session.goal,
        snapshot,
        history: this.session.history
      });

      return this.processAction(action);
    } catch (error) {
      this.session.isRunning = false;
      this.events.onError?.(error, this.getSession());
      return { status: "error", message: String(error) };
    }
  }

  private async processAction(action: AgentAction): Promise<ContentResult> {
    const risk = assessRisk(action);
    if (risk === "blocked") {
      return {
        status: "blocked",
        action,
        message: `Blocked action: ${JSON.stringify(action)}`
      };
    }

    if (this.session.mode === "human-approved" && risk === "review") {
      return {
        status: "needs_approval",
        action,
        message: `Approval needed for ${action.type}`
      };
    }

    if (action.type === "done") {
      return {
        status: "done",
        action,
        message: action.reason
      };
    }

    const message = await executeAction(action);
    return { status: "executed", action, message };
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export function createBrowserAgent(config: LibraryAgentConfig, events?: LibraryAgentEvents): BrowserAgent {
  return new BrowserAgent(config, events);
}

export type {
  AgentAction,
  AgentMode,
  AgentSession,
  ContentResult,
  LibraryAgentConfig,
  LibraryAgentEvents,
  PlannerConfig,
  PlannerInput,
  PlannerKind,
  RiskLevel
} from "../shared/contracts";
