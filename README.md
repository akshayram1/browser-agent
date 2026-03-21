# omnibrowser-agent

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.2.2-green.svg)](package.json)

Local-first open-source browser AI operator using in-browser planning and page actions.

## Why this project

- Privacy-first: run agent logic in browser
- No per-request cloud token costs
- Dual delivery:
  - Browser extension mode
  - Embeddable library mode for web apps
- Hybrid control modes:
  - Autonomous
  - Human-approved

## Stack

- MV3 browser extension runtime
- TypeScript + esbuild
- Pluggable planner bridges: WebLLM (local, in-browser)

## Project structure

- `src/background` session orchestration
- `src/content` page observer/planner/executor
- `src/popup` control panel
- `src/lib` embeddable runtime API
- `src/shared` contracts and safety

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Build extension:

```bash
npm run build
```

3. Load extension in Chromium:

- Open `chrome://extensions`
- Enable Developer Mode
- Click **Load unpacked**
- Select `dist`

## How to use

1. Open a target website tab
2. Open extension popup
3. Enter goal (for example: `search contact John Doe in CRM and open profile`)
4. Select mode/planner
5. Click Start
6. If mode is `human-approved`, click **Approve pending action** on review steps

## Use as a web library

```ts
import { createBrowserAgent } from "@akshayram1/omnibrowser-agent";

const agent = createBrowserAgent({
  goal: "Open CRM and find customer John Smith",
  mode: "human-approved",
  planner: { kind: "heuristic" }
}, {
  onStep: (result) => console.log(result.message),
  onApprovalRequired: (action) => console.log("Needs approval:", action),
  onDone: (result) => console.log("Done:", result.message),
  onMaxStepsReached: (session) => console.log("Max steps hit", session.history)
});

await agent.start();

// Resume after approval:
await agent.resume();

// Inspect state at any time:
console.log(agent.isRunning, agent.hasPendingAction);

// Stop at any time:
agent.stop();
```

### Supported actions

| Action     | Description                              |
|------------|------------------------------------------|
| `click`    | Click an element by CSS selector         |
| `type`     | Type text into an input or textarea      |
| `navigate` | Navigate to a URL                        |
| `extract`  | Extract text from an element             |
| `scroll`   | Scroll a container or the page           |
| `focus`    | Focus an element (useful for dropdowns)  |
| `wait`     | Pause for a given number of milliseconds |
| `done`     | Signal task completion                   |

### AbortSignal support

```ts
const controller = new AbortController();
const agent = createBrowserAgent({ goal: "...", signal: controller.signal });
agent.start();

// Cancel from outside:
controller.abort();
```

See full integration guide in `docs/EMBEDDING.md`.

## Example site (embedded usage)

1. Build library assets:

```bash
npm run build
```

2. Serve the repository root (required for browser ESM import paths):

```bash
python3 -m http.server 4173
```

3. Open:

- `http://localhost:4173/examples/simple-site/`

The example uses `createBrowserAgent` from `dist/lib.js` and includes UI buttons for start/approve/stop.
It is preconfigured to use `webllm` planner mode and loads `@mlc-ai/web-llm` from CDN in the example page.

## Changelog

### v0.2.2

- SDK/extension separation: core logic moved to `src/core/` shared between extension and npm library
- 22 unit tests across planner and safety modules
- Action verification in executor (disabled-check, value-verify, empty-check)
- `CandidateElement.label` from associated `<label>` elements
- Retry loop with `lastError` fed back to planner on failure
- `parseAction` utility exported from the library

### v0.2.0

- **New actions**: `scroll` and `focus`
- **Smarter safety**: risk assessment now checks element label/text rather than CSS selector strings
- **Improved heuristic planner**: handles navigate, fill, click, and search goal patterns with regex matching
- **Better page observation**: filters hidden/invisible elements, includes `placeholder` in candidate data, captures up to 60 candidates
- **Library API**: added `resume()`, `isRunning` and `hasPendingAction` getters, `onMaxStepsReached` event, and `AbortSignal` support
- **Executor**: uses `InputEvent` for proper framework compatibility, added keyboard event dispatch
- **License**: added author name

### v0.1.0

- Extension runtime loop
- Shared action contracts
- Heuristic + WebLLM planner switch
- Human-approved mode

## Planner modes

| Mode | Description |
|---|---|
| `heuristic` | Zero-dependency regex-based planner. Works offline. Good for simple, predictable goals. |
| `webllm` | Delegates to a local WebLLM bridge on `window.__browserAgentWebLLM`. Fully private, no API calls, runs on-device via WebGPU. |

## Notes

- Local inference has no API usage charges, but uses device CPU/GPU/memory.
- `webllm` mode expects a bridge implementation attached to `window.__browserAgentWebLLM`. See `docs/EMBEDDING.md` for a complete example.

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md).

## License

MIT © Akshay Chame
