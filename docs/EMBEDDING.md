# Embedding OmniBrowser Agent in Your Website

You can keep the extension flow and also embed OmniBrowser Agent as a library in your own web app.

## Install

```bash
npm install @akshayram1/omnibrowser-agent
```

## Basic usage

```ts
import { createBrowserAgent } from "@akshayram1/omnibrowser-agent";

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

To use planner mode `webllm`, load the WebLLM engine and wire the bridge before starting the agent:

```ts
import * as webllm from "@mlc-ai/web-llm";
import { createBrowserAgent, createWebLLMBridge } from "@akshayram1/omnibrowser-agent";

const engine = await webllm.CreateMLCEngine("Llama-3.2-1B-Instruct-q4f16_1-MLC");

window.__browserAgentWebLLM = createWebLLMBridge(engine);

const agent = createBrowserAgent({
  goal: "Fill the contact form",
  planner: { kind: "webllm", modelId: "Llama-3.2-1B-Instruct-q4f16_1-MLC" }
});

await agent.start();
```

## Notes

- For production, mount this inside an authenticated app shell and add your own permission checks.
- `human-approved` mode is recommended for CRM/finance/admin actions.
- Bring your own WebLLM engine instance, then wire `createWebLLMBridge(engine)` to `window.__browserAgentWebLLM`.
