import type { PlannerInput, PlannerResult } from "../shared/contracts";
import { parsePlannerResult } from "../shared/parse-action";
import { buildSystemPrompt, buildUserMessage } from "./prompt";

export const INVALID_JSON_RETRY_MESSAGE = [
  "Your reply was not valid JSON. Output ONLY a JSON object — no explanation, no markdown, no extra text.",
  'Required format: {"evaluation":"...","memory":"...","nextGoal":"...","action":{"type":"click","selector":"EXACT_SELECTOR","label":"..."}}',
].join("\n");

const BARE_ACTION_RETRY_MESSAGE = [
  "Still not valid JSON. Output ONLY the action object. No evaluation, memory, or nextGoal fields.",
  'Example: {"type":"type","selector":"EXACT_SELECTOR_FROM_LIST","text":"value","clearFirst":true}',
  'Example: {"type":"click","selector":"EXACT_SELECTOR_FROM_LIST","label":"button text"}',
].join("\n");

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

function failureResult(attempts: number): PlannerResult {
  return {
    action: {
      type: "done",
      reason: `WebLLM returned invalid JSON after ${attempts} attempt${attempts === 1 ? "" : "s"}. Unable to continue.`
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
  // Attempt 2: improved message with format example
  const attempt2Messages: ChatMessage[] = [
    ...baseMessages,
    { role: "assistant", content: badOutput },
    { role: "user", content: INVALID_JSON_RETRY_MESSAGE }
  ];

  const raw2 = await createCompletion(engine, attempt2Messages, modelId);
  const result2 = parsePlannerResult(raw2);
  if (!isParseFailure(result2)) return result2;

  // Attempt 3: ask for bare action only (simpler target for small models)
  const attempt3Messages: ChatMessage[] = [
    ...attempt2Messages,
    { role: "assistant", content: raw2 },
    { role: "user", content: BARE_ACTION_RETRY_MESSAGE }
  ];

  const raw3 = await createCompletion(engine, attempt3Messages, modelId);
  const result3 = parsePlannerResult(raw3);
  if (!isParseFailure(result3)) return result3;

  return failureResult(3);
}

export function createWebLLMBridge(engine: WebLLMEngineLike): BrowserAgentWebLLMBridge {
  return {
    async plan(input: PlannerInput, modelId?: string): Promise<PlannerResult> {
      const baseMessages = buildBaseMessages(input);

      // Attempt 1: normal
      const raw1 = await createCompletion(engine, baseMessages, modelId);
      const result1 = parsePlannerResult(raw1);
      if (!isParseFailure(result1)) return result1;

      // Attempts 2 & 3 with progressively simpler asks
      return retryInvalidJsonWithHistory(engine, baseMessages, raw1, modelId);
    },

    async retryInvalidJson(input: PlannerInput, badOutput: string, modelId?: string): Promise<PlannerResult> {
      const baseMessages = buildBaseMessages(input);
      return retryInvalidJsonWithHistory(engine, baseMessages, badOutput, modelId);
    }
  };
}
