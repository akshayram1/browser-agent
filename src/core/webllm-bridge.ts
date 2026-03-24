import type { PlannerInput, PlannerResult } from "../shared/contracts";
import { parsePlannerResult } from "../shared/parse-action";
import { buildSystemPrompt, buildUserMessage } from "./prompt";

export const INVALID_JSON_RETRY_MESSAGE = "Invalid JSON. Reply with only a valid JSON object.";

type ChatRole = "system" | "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

type CompletionRequest = {
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  model?: string;
};

type CompletionResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

export type WebLLMEngineLike = {
  chat: {
    completions: {
      create(request: CompletionRequest): Promise<CompletionResponse>;
    };
  };
};

export type BrowserAgentWebLLMBridge = {
  plan(input: PlannerInput, modelId?: string): Promise<PlannerResult>;
  retryInvalidJson(input: PlannerInput, badOutput: string, modelId?: string): Promise<PlannerResult>;
};

function isParseFailure(result: PlannerResult): boolean {
  if (result.action.type !== "done") {
    return false;
  }

  const reason = result.action.reason;
  return /(No JSON|JSON parse error|Parsed value is not an object|Unknown or missing action type)/.test(reason);
}

function contentToText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    const chunks = content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (typeof part === "object" && part !== null && "text" in part && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .filter(Boolean);

    return chunks.join("\n");
  }

  return "";
}

function normalizeBridgeResult(raw: PlannerResult): PlannerResult {
  if (!isParseFailure(raw)) {
    return raw;
  }

  return {
    action: {
      type: "done",
      reason: "WebLLM returned invalid JSON twice. Unable to continue."
    }
  };
}

async function createCompletion(engine: WebLLMEngineLike, messages: ChatMessage[], modelId?: string): Promise<string> {
  const response = await engine.chat.completions.create({
    messages,
    temperature: 0,
    max_tokens: 700,
    ...(modelId ? { model: modelId } : {})
  });

  return contentToText(response.choices?.[0]?.message?.content).trim();
}

function buildBaseMessages(input: PlannerInput): ChatMessage[] {
  return [
    { role: "system", content: buildSystemPrompt(input.systemPrompt) },
    { role: "user", content: buildUserMessage(input) }
  ];
}

async function retryInvalidJsonWithHistory(
  engine: WebLLMEngineLike,
  baseMessages: ChatMessage[],
  badOutput: string,
  modelId?: string
): Promise<PlannerResult> {
  const retryMessages: ChatMessage[] = [
    ...baseMessages,
    { role: "assistant", content: badOutput },
    { role: "user", content: INVALID_JSON_RETRY_MESSAGE }
  ];

  const retryRaw = await createCompletion(engine, retryMessages, modelId);
  return normalizeBridgeResult(parsePlannerResult(retryRaw));
}

export function createWebLLMBridge(engine: WebLLMEngineLike): BrowserAgentWebLLMBridge {
  return {
    async plan(input: PlannerInput, modelId?: string): Promise<PlannerResult> {
      const baseMessages = buildBaseMessages(input);
      const raw = await createCompletion(engine, baseMessages, modelId);
      const parsed = parsePlannerResult(raw);

      if (!isParseFailure(parsed)) {
        return parsed;
      }

      return retryInvalidJsonWithHistory(engine, baseMessages, raw, modelId);
    },

    async retryInvalidJson(input: PlannerInput, badOutput: string, modelId?: string): Promise<PlannerResult> {
      const baseMessages = buildBaseMessages(input);
      return retryInvalidJsonWithHistory(engine, baseMessages, badOutput, modelId);
    }
  };
}
