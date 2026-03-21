import type { AgentSession, ContentCommand, ContentResult } from "../shared/contracts";
import { assessRisk } from "../shared/safety";
import { executeAction } from "../core/executor";
import { collectSnapshot } from "../core/observer";
import { planNextAction } from "../core/planner";

let stopped = false;

async function runTick(session: AgentSession): Promise<ContentResult> {
  const snapshot = collectSnapshot();
  const action = await planNextAction(session.planner, {
    goal: session.goal,
    snapshot,
    history: session.history,
    lastError: session.lastError
  });

  const risk = assessRisk(action);
  if (risk === "blocked") {
    return { status: "blocked", action, message: `Blocked action: ${JSON.stringify(action)}` };
  }

  if (session.mode === "human-approved" && risk === "review") {
    return { status: "needs_approval", action, message: `Approval needed for ${action.type}` };
  }

  if (action.type === "done") {
    return { status: "done", action, message: action.reason };
  }

  const message = await executeAction(action);
  return { status: "executed", action, message };
}

async function executePendingAction(session: AgentSession): Promise<ContentResult> {
  if (!session.pendingAction) {
    return { status: "error", message: "No pending action to approve" };
  }

  const message = await executeAction(session.pendingAction);
  return { status: "executed", action: session.pendingAction, message };
}

chrome.runtime.onMessage.addListener((command: ContentCommand, _sender, sendResponse) => {
  if (command.type === "AGENT_STOP") {
    stopped = true;
    sendResponse({ status: "done", message: "Stopped by user" } satisfies ContentResult);
    return true;
  }

  if (command.type !== "AGENT_TICK") {
    return false;
  }

  const session = command.session;
  const exec = session.pendingAction ? executePendingAction(session) : runTick(session);

  exec
    .then((result) => {
      if (stopped) {
        sendResponse({ status: "done", message: "Stopped" } satisfies ContentResult);
        return;
      }
      sendResponse(result);
    })
    .catch((error) => {
      sendResponse({ status: "error", message: String(error) } satisfies ContentResult);
    });

  return true;
});
