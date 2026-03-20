# Embedding OmniBrowser Agent in Your Website

You can keep the extension flow and also embed OmniBrowser Agent as a library in your own web app.

## Install

```bash
npm install @akshaychame/omnibrowser-agent
```

## Basic usage

```ts
import { createBrowserAgent } from "@akshaychame/omnibrowser-agent";

const agent = createBrowserAgent(
  {
    goal: "Search contact Jane Doe and open profile",
    mode: "human-approved",
    planner: { kind: "heuristic" },
    maxSteps: 15,
    stepDelayMs: 400
  },
  {
    onStep: (result) => console.log("step", result),
    onApprovalRequired: (action) => {
      console.log("approval required", action);
      // Show your own modal/button then call approvePendingAction()
    },
    onDone: (result) => console.log("done", result),
    onError: (error) => console.error(error)
  }
);

await agent.start();
```

## Approve a pending action

```ts
await agent.approvePendingAction();
```

## Stop running session

```ts
agent.stop();
```

## WebLLM mode in embedded app

To use planner mode `webllm`, provide a local bridge in your app:

```ts
window.__browserAgentWebLLM = {
  async plan(input, modelId) {
    // call your local WebLLM engine and return one AgentAction JSON
    return { type: "done", reason: `Implement bridge with model ${modelId ?? "default"}` };
  }
};
```

Then configure:

```ts
planner: { kind: "webllm", modelId: "Llama-3.2-1B-Instruct-q4f16_1-MLC" }
```

## page-agent mode in embedded app

To use planner mode `page-agent`, install [page-agent](https://github.com/alibaba/page-agent) in your project and wire the bridge:

```bash
npm install page-agent
```

```ts
import { PageAgent } from "page-agent";

const pa = new PageAgent({
  baseURL: "https://api.openai.com/v1",
  model: "gpt-4o",
  apiKey: "sk-..."
});

window.__browserAgentPageAgent = {
  async plan(input) {
    const result = await pa.execute(input.goal);
    return { type: "done", reason: result.data };
  }
};
```

Then configure:

```ts
planner: { kind: "page-agent" }
```

Use page-agent mode when your goals are complex, multi-step, or ambiguous — it uses LLM reasoning to determine the next action rather than regex heuristics.

## Notes

- For production, mount this inside an authenticated app shell and add your own permission checks.
- `human-approved` mode is recommended for CRM/finance/admin actions.
- `page-agent` is not bundled with this library — it must be installed separately by the consumer.
