import type { AgentAction, CandidateElement, RiskLevel } from "./contracts";

const RISKY_KEYWORDS = /\b(delete|remove|pay|purchase|submit|confirm|checkout|transfer|withdraw|send)\b/i;

function elementTextRisky(text?: string): boolean {
  return text != null && RISKY_KEYWORDS.test(text);
}

function candidateText(selector: string, candidates?: CandidateElement[]): string | undefined {
  const match = candidates?.find((c) => c.selector === selector);
  return match ? ([match.label, match.text, match.placeholder].filter(Boolean).join(" ") || undefined) : undefined;
}

export function assessRisk(action: AgentAction, candidates?: CandidateElement[]): RiskLevel {
  switch (action.type) {
    case "navigate": {
      try {
        const next = new URL(action.url);
        if (!["http:", "https:"].includes(next.protocol)) {
          return "blocked";
        }
      } catch {
        return "blocked";
      }
      return "safe";
    }
    case "click": {
      const text = action.label ?? candidateText(action.selector, candidates) ?? action.selector;
      return elementTextRisky(text) ? "review" : "safe";
    }
    case "type": {
      const text = action.label ?? candidateText(action.selector, candidates) ?? action.selector;
      return elementTextRisky(text) ? "review" : "safe";
    }
    case "focus":
    case "scroll":
    case "wait":
      return "safe";
    case "extract":
      return "review";
    case "done":
      return "safe";
    default:
      return "review";
  }
}
