# omnibrowser-agent

[![npm](https://img.shields.io/npm/v/@akshayram1/omnibrowser-agent)](https://www.npmjs.com/package/@akshayram1/omnibrowser-agent)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Local-first browser AI operator. Plans and executes DOM actions entirely in the browser — no API keys, no cloud costs, no data leaving your machine.

[Live Demo](https://omnibrowser-agent.vercel.app/examples/chatbot/) · [GitHub](https://github.com/akshayram1/omnibrowser-agent) · [Embedding Guide](https://github.com/akshayram1/omnibrowser-agent/blob/main/docs/EMBEDDING.md) · [Roadmap](https://github.com/akshayram1/omnibrowser-agent/blob/main/docs/ROADMAP.md)

---

## Architecture

```
  Chrome Extension          npm Library
  (popup + bg worker)       createBrowserAgent()
         |                        |
         +----------+-------------+
                    |
             Orchestration
          (session & tick loop)
                    |
         +----------+----------+
         |          |          |
     observer   planner    executor
    (DOM snap) (heuristic  (click/type/
               /webllm)    navigate...)
         |          |          |
         +----------+----------+
                    |
                 safety
           (safe/review/blocked)
```

### One tick

```
goal + history + memory
        |
        v
observer.collectSnapshot()  -->  PageSnapshot (url, title, candidates[])
        |
        v
planner.planNextAction()    -->  PlannerResult { action, evaluation?, memory?, nextGoal? }
        |
        v
safety.assessRisk(action)   -->  safe | review | blocked
        |
   blocked --> stop
   review  --> pause (human-approved) --> user calls resume()
   safe    --> executor.executeAction()
        |
        v
   session.history.push(result) --> next tick
```

---

## Install

```bash
npm install @akshayram1/omnibrowser-agent
```

---

## Quick start

```ts
import { createBrowserAgent } from "@akshayram1/omnibrowser-agent";

const agent = createBrowserAgent({
  goal: "Search for contact Jane Doe and open her profile",
  mode: "human-approved",        // or "autonomous"
  planner: { kind: "heuristic" } // or "webllm"
}, {
  onStep:             (result, session) => console.log(result.message),
  onApprovalRequired: (action, session) => console.log("Review:", action),
  onDone:             (result, session) => console.log("Done:", result.message),
  onError:            (err,    session) => console.error(err),
  onMaxStepsReached:  (session)         => console.log("Max steps hit"),
});

await agent.start();

// After onApprovalRequired fires:
await agent.resume();

// Cancel at any time:
agent.stop();
```

---

## Planner modes

| Mode        | Description                                         | When to use                                   |
|-------------|-----------------------------------------------------|-----------------------------------------------|
| `heuristic` | Zero-dependency regex planner. Works fully offline. | Simple, predictable goals — navigate, fill, click |
| `webllm`    | On-device LLM via WebGPU. Fully private, no API calls. | Open-ended, multi-step, language-heavy goals |

### WebLLM with a custom system prompt

```ts
const agent = createBrowserAgent({
  goal: "Fill the checkout form",
  planner: {
    kind: "webllm",
    systemPrompt: "You are a careful checkout assistant. Never submit before all required fields are filled."
  }
});
```

### Recommended WebLLM models

| Model ID | Size | Notes |
|----------|------|-------|
| `Llama-3.2-1B-Instruct-q4f16_1-MLC` | ~600 MB | fastest |
| `Llama-3.2-3B-Instruct-q4f16_1-MLC` | ~1.5 GB | fast |
| `Phi-3.5-mini-instruct-q4f16_1-MLC` | ~2 GB | quality |
| `Mistral-7B-Instruct-v0.3-q4f16_1-MLC` | ~4.1 GB | balanced |
| `Qwen2.5-7B-Instruct-q4f16_1-MLC` | ~4.3 GB | strong |
| `Llama-3.1-8B-Instruct-q4f16_1-MLC` | ~4.8 GB | strong |
| `Qwen3-8B-q4f16_1-MLC` | ~5 GB | latest Qwen |
| `gemma-2-9b-it-q4f16_1-MLC` | ~5.5 GB | Google Gemma |
| `DeepSeek-R1-Distill-Llama-8B-q4f16_1-MLC` | ~5 GB | reasoning |
| `Llama-3.1-70B-Instruct-q3f16_1-MLC` | ~35 GB | most capable (needs 24+ GB VRAM) |

---

## Agent modes

| Mode             | Behaviour                                                                 |
|------------------|---------------------------------------------------------------------------|
| `autonomous`     | All `safe` and `review` actions execute without pause                     |
| `human-approved` | `review`-rated actions pause and emit `onApprovalRequired` — call `resume()` to continue |

---

## Supported actions

| Action     | Description                        | Risk           |
|------------|------------------------------------|----------------|
| `navigate` | Navigate to a URL (http/https only) | safe           |
| `click`    | Click an element by CSS selector   | safe / review  |
| `type`     | Type text into an input            | safe / review  |
| `scroll`   | Scroll a container or the page     | safe           |
| `focus`    | Focus an element                   | safe           |
| `wait`     | Pause for N milliseconds           | safe           |
| `extract`  | Extract text from an element       | review         |
| `done`     | Signal task completion             | safe           |

---

## AbortSignal support

```ts
const controller = new AbortController();
const agent = createBrowserAgent({ goal: "...", signal: controller.signal });
agent.start();

controller.abort(); // cancel from outside
```

---

## WebLLM bridge wiring

```ts
import * as webllm from "@mlc-ai/web-llm";
import { createBrowserAgent, parsePlannerResult } from "@akshayram1/omnibrowser-agent";

const engine = await webllm.CreateMLCEngine("Phi-3.5-mini-instruct-q4f16_1-MLC");

window.__browserAgentWebLLM = {
  async plan(input) {
    const { goal, history, lastError, memory, systemPrompt } = input;
    const resp = await engine.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt || "You are a browser automation agent. Output only JSON." },
        { role: "user",   content: `Goal: "${goal}"\nHistory: ${history.slice(-4).join(" -> ")}${memory ? "\nMemory: " + memory : ""}${lastError ? "\nLast error: " + lastError : ""}` }
      ],
      temperature: 0,
      max_tokens: 200
    });
    return parsePlannerResult(resp.choices[0].message.content);
  }
};

const agent = createBrowserAgent({ goal: "Fill the checkout form", planner: { kind: "webllm" } });
await agent.start();
```

---

## Chrome Extension

1. `npm run build`
2. Open `chrome://extensions`, enable **Developer Mode**, click **Load unpacked**, select `dist/`.
3. Open any tab, enter a goal in the popup, pick a mode, and click **Start**.

---

## Project structure

```
src/
├── background/      Extension service worker — session management
├── content/         Extension content script — runs in page context
├── core/            Shared engine (planner, observer, executor)
├── lib/             npm library entry — createBrowserAgent()
├── popup/           Extension popup UI
└── shared/          Types, safety, and parse utilities
```

---

## License

MIT © Akshay Chame
