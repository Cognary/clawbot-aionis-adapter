# OpenClaw Aionis Adapter

A standalone adapter for connecting OpenClaw to Aionis execution control.

## What it is

This project provides:

1. a reusable `AionisLoopControlAdapter`
2. an `OpenClaw` host binding
3. loop-control heuristics for high-cost tool paths
4. replay and handoff escape-hatch orchestration

## What it is not

1. not a generic memory package
2. not a planner-internal reasoning controller

## Current hook coverage

1. `session_start`
2. `session_end`
3. `before_agent_start`
4. `before_tool_call`
5. `after_tool_call`
6. `agent_end`
7. `tool_result_persist`
8. `before_message_write`

## Current capabilities

1. pre-tool policy gating
2. repeated-tool blocking
3. duplicate/no-progress tracking
4. broad scan and broad test suppression
5. replay dispatch escape hatch
6. handoff fallback
7. structured stop reasons

## Boundary

This adapter controls the tool loop boundary.
It does not control planner-internal reasoning steps that never emit tools.

## Project structure

1. `src/adapter/`
2. `src/binding/`
3. `src/types/`

## Verification

1. `npm run test`
2. `npm run smoke:openclaw-load`
3. `npm run bench:openclaw-ab`
4. `npm run bench:live-task`
5. `npm run bench:semi-live-token`

`bench:live-task` is the first scenario-backed benchmark layer:

1. keepalive poll churn
2. transport retry churn
3. real-repo broad-search / broad-test drift

## Current Evidence

### Live-task A/B

Artifact:
- `/Volumes/ziel/openclaw-aionis-adapter/artifacts/openclaw-live-task-benchmark/20260314061733/summary.json`

Current result:

- baseline:
  - `avg_executed_steps = 7.33`
  - `controlled_stop_rate = 0`
  - `avg_broad_tool_calls = 1.33`
- treatment:
  - `avg_executed_steps = 3`
  - `controlled_stop_rate = 0.6667`
  - `replay_dispatch_rate = 0.3333`
  - `handoff_store_rate = 0.3333`
  - `avg_broad_tool_calls = 0`

This currently supports:

- Aionis reduces uncontrolled tool-loop churn
- Aionis suppresses broad repo search and broad test drift
- Aionis can escape through replay or handoff

### GLM-5 Semi-Live Token Benchmark

Artifact:
- `/Volumes/ziel/openclaw-aionis-adapter/artifacts/openclaw-semi-live-token-benchmark/20260314064242/summary.json`

Current 3-scenario result:

- baseline:
  - `avg_total_tokens = 1893`
  - `avg_executed_steps = 5.67`
  - `completed_rate = 0.3333`
- treatment:
  - `avg_total_tokens = 865.33`
  - `avg_executed_steps = 2`
  - `completed_rate = 0.3333`
  - `avg_broad_tool_calls = 0`

This currently supports:

- Aionis can reduce token burn in semi-live OpenClaw tasks
- the current token win comes from context and policy shaping plus focused-path execution
- this result does not yet prove that hard stops or replay are the dominant source of token savings

### Hard-Stop / Replay-Driven Token Slice

Artifact:
- `/Volumes/ziel/openclaw-aionis-adapter/artifacts/openclaw-semi-live-token-benchmark/20260314070306/summary.json`

Single-scenario result:

- baseline:
  - `avg_total_tokens = 1659`
  - `avg_executed_steps = 6`
  - `controlled_stop_rate = 0`
- treatment:
  - `avg_total_tokens = 1267`
  - `avg_executed_steps = 3`
  - `controlled_stop_rate = 1`
  - `replay_dispatch_rate = 1`

This currently supports:

- Aionis can also save tokens through hard-stop and replay-driven control
- the adapter is not limited to soft context shaping

## Entry point

Use `createOpenClawAionisAdapter(...)` to attach the adapter to an OpenClaw host API implementation.
