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

## v0.3

- Expanded WebLLM model catalog (new 7B/8B options + compatibility matrix)
- Improved model loading UX (recommended presets by speed/quality and device memory)
- Enhanced default system prompts for safer, clearer multi-step planning
- Prompt presets for common workflows (docs navigation, CRM form fill, task automation)

## v1.0

- Advanced prompt orchestration (goal-aware system prompt routing and contextual guardrails)
- Functionality expansion: richer action toolkit and stronger extraction/navigation reliability
- Adaptive planner behaviour (model-aware retries, fallback strategies, and recovery flows)
- Evaluation suite for prompt and model quality across benchmark browser tasks
