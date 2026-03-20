# OmniBrowser Agent Architecture (v0.2)

## Goals

- Local-first runtime in browser
- Privacy-first defaults
- Open-source composable planner/executor contracts
- Human-approved mode for risky actions

## Runtime Components

1. Popup UI (`src/popup`)
   - Starts/stops sessions
   - Picks mode (`autonomous`, `human-approved`)
   - Picks planner (`heuristic`, `webllm`, `page-agent`)

2. Background Service Worker (`src/background`)
   - Session state machine per tab
   - Tick loop orchestration
   - Approval handling

3. Content Agent (`src/content`)
   - `pageObserver`: page snapshot extraction
   - `planner`: next-action decision (heuristic / WebLLM / page-agent)
   - `safety`: risk gating (`safe`, `review`, `blocked`)
   - `executor`: DOM action execution

## Contracts

- Shared in `src/shared/contracts.ts`
- Action protocol:
  - click
  - type
  - navigate
  - extract
  - wait
  - done

## Safety Model

- Block invalid URL protocols
- Review risky actions (submit/delete/pay-like selectors)
- In `human-approved` mode, review-level actions require manual approval

## Planner Bridges

All planner bridges follow the same pattern: an object attached to `window` that implements a `plan()` method returning an `AgentAction`. The core library has zero runtime dependencies — bridge implementations are provided by the consumer.

### WebLLM bridge

```ts
window.__browserAgentWebLLM = {
  async plan(input, modelId) { /* ... */ }
};
```

### page-agent bridge

Uses [alibaba/page-agent](https://github.com/alibaba/page-agent) (MIT) as the planning backend. The library calls `window.__browserAgentPageAgent.plan(input)`.

```ts
window.__browserAgentPageAgent = {
  async plan(input) { /* ... */ }
};
```

## Limitations (v0.2)

- No persistent long-term memory yet
- No task DSL/skills registry yet
- Risk scoring is simple keyword heuristic
- No robust selector healing yet
