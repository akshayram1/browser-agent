import type { AgentMode, AgentSession, PlannerConfig } from "../shared/contracts";

const sessions = new Map<number, AgentSession>();

function normalizePlannerConfig(rawPlanner: unknown): PlannerConfig {
  if (typeof rawPlanner === "string" && (rawPlanner === "heuristic" || rawPlanner === "webllm")) {
    return { kind: rawPlanner };
  }

  if (typeof rawPlanner === "object" && rawPlanner !== null) {
    const record = rawPlanner as Record<string, unknown>;
    const kind = record.kind;
    if (kind === "heuristic" || kind === "webllm") {
      return {
        kind,
        modelId: typeof record.modelId === "string" && record.modelId.trim() ? record.modelId : undefined,
        systemPrompt: typeof record.systemPrompt === "string" && record.systemPrompt.trim() ? record.systemPrompt : undefined
      };
    }
  }

  return { kind: "heuristic" };
}

function makeSession(tabId: number, goal: string, mode: AgentMode, planner: PlannerConfig): AgentSession {
  return {
    id: crypto.randomUUID(),
    tabId: tabId,
    goal,
    mode,
    planner,
    history: [],
    isRunning: true
  };
}

async function tick(tabId: number) {
  const session = sessions.get(tabId);
  if (!session || !session.isRunning) {
    return;
  }

  const result = await chrome.tabs.sendMessage(tabId, {
    type: "AGENT_TICK",
    session
  });

  session.history.push(result.message);
  if (result.reflection?.memory !== undefined) {
    session.memory = result.reflection.memory;
  }
  session.lastError = result.status === "error" ? result.message : undefined;

  if (result.status === "needs_approval") {
    session.pendingAction = result.action;
    session.isRunning = false;
    return;
  }

  session.pendingAction = undefined;

  if (["done", "blocked", "error"].includes(result.status)) {
    session.isRunning = false;
    return;
  }

  setTimeout(() => tick(tabId), 500);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "START_AGENT") {
    const session = makeSession(message.tabId, message.goal, message.mode, normalizePlannerConfig(message.planner));
    sessions.set(message.tabId, session);
    tick(message.tabId).catch((error) => {
      const failed = sessions.get(message.tabId);
      if (failed) {
        failed.history.push(`Error: ${String(error)}`);
        failed.isRunning = false;
      }
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "APPROVE_ACTION") {
    const session = sessions.get(message.tabId);
    if (!session) {
      sendResponse({ ok: false, error: "No active session" });
      return true;
    }

    session.isRunning = true;
    tick(message.tabId).catch((error) => {
      session.history.push(`Error: ${String(error)}`);
      session.isRunning = false;
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "STOP_AGENT") {
    const session = sessions.get(message.tabId);
    if (session) {
      session.isRunning = false;
    }
    chrome.tabs.sendMessage(message.tabId, { type: "AGENT_STOP" }).catch(() => undefined);
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "GET_STATUS") {
    const lines = Array.from(sessions.values()).map(
      (session) =>
        `${session.isRunning ? "RUNNING" : "IDLE"} ${session.tabId}: ${session.goal.slice(0, 45)}${session.goal.length > 45 ? "..." : ""}`
    );

    sendResponse({ status: lines.length > 0 ? lines.join("\n") : "Idle" });
    return true;
  }

  return false;
});
