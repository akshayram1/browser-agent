# Roadmap

## v0.1

- Extension runtime loop
- Shared action contracts
- Heuristic + WebLLM planner switch
- Human-approved mode

## v0.2 (current)

- New actions: `scroll`, `focus`
- Improved heuristic planner with regex goal patterns
- Better page observation (visibility filtering, placeholder capture)
- Library API: `resume()`, `isRunning`, `hasPendingAction`, `AbortSignal`, `onMaxStepsReached`
- **page-agent planner bridge** (`window.__browserAgentPageAgent`)

## v0.3

- Site profile + policy engine (allowlist, blocked domains)
- Selector healing and fallback strategy
- Session memory and action replay log
- Drupal CRM starter skills

## v0.3

- Long-term encrypted memory in IndexedDB
- Goal decomposition planner (multi-step task graphs)
- Multi-tab workflows

## v1.0

- Stable plugin API for site skills
- Validation/eval harness with benchmark tasks
- Cross-browser packaging (Chromium + Firefox)
