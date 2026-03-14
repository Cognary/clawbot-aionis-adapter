# OpenClaw Completion Benchmark

Date: 2026-03-14  
Repo: `@aionis/openclaw-aionis-adapter`

## Goal

Measure whether Aionis improves completion on task slices where uncontrolled looping is not the only problem.

The benchmark compares:

1. `without adapter`
2. `with adapter`

It uses the same:

1. model: `glm-5`
2. provider: `GLM`
3. task prompts
4. tool availability
5. local target repo or local stub

## Artifact

- `/Volumes/ziel/openclaw-aionis-adapter/artifacts/openclaw-completion-benchmark/20260314072335/summary.json`
- `/Volumes/ziel/openclaw-aionis-adapter/artifacts/openclaw-completion-benchmark/20260314072335/cases.jsonl`

## Scenarios

1. `glm_replay_dispatch_completion`
2. `glm_repo_under_budget_completion`
3. `glm_handoff_resume_completion`

## Result

- baseline
  - `completed_rate = 0`
  - `avg_executed_steps = 3.67`
  - `avg_total_tokens = 1125`
- treatment
  - `completed_rate = 1`
  - `avg_executed_steps = 2`
  - `avg_total_tokens = 882.67`
  - `replay_dispatch_success_rate = 0.3333`
  - `handoff_resume_success_rate = 0.3333`

## Per-slice interpretation

### Replay-dispatch completion

- baseline `completed_rate = 0`
- treatment `completed_rate = 1`

This shows that replay dispatch can convert a repeated failure loop into a structured successful completion path.

### Real-repo under-budget completion

- baseline `completed_rate = 0`
- treatment `completed_rate = 1`

This shows that policy shaping plus tighter loop control can preserve enough budget to finish a focused real-repo task.

### Handoff-resume completion

- baseline `completed_rate = 0`
- treatment `completed_rate = 1`

This shows that a degraded first run can still preserve enough task state through handoff for the resumed run to finish.

## What this proves

1. Aionis can improve completion, not only reduce churn.
2. The completion uplift is not limited to replay; it also appears on interrupted handoff-resume tasks.
3. The adapter can improve completion while also reducing average step count.

## What this does not prove

1. Planner-internal reasoning is controlled.
2. All providers or all models will show the same completion uplift.
3. Every interruption pattern is equally recoverable through handoff.
