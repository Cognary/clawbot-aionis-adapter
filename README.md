# OpenClaw Aionis Adapter

A standalone adapter for connecting OpenClaw to Aionis execution control.

## Quickstart

Install from local checkout:

```bash
cd /Volumes/ziel/openclaw-aionis-adapter
npm install
npm run build
openclaw plugins install . --link
```

Minimal config reference:

- `examples/openclaw.json`
- `docs/2026-03-14-install-and-config.md`

Expected Aionis endpoint:

- `http://127.0.0.1:3321`

Minimum plugin config:

```json
{
  "plugins": {
    "allow": ["openclaw-aionis-adapter"],
    "entries": {
      "openclaw-aionis-adapter": {
        "enabled": true,
        "config": {
          "baseUrl": "http://127.0.0.1:3321",
          "tenantId": "default",
          "actor": "openclaw",
          "scopeMode": "project",
          "strictToolBlocking": true,
          "replayDispatchEnabled": true,
          "handoffFallbackEnabled": true
        }
      }
    }
  }
}
```

## Release Status

Current package metadata is prepared for a first release surface:

1. `CHANGELOG.md` exists
2. install/config example exists
3. package `files` includes `CHANGELOG.md` and `examples/`

Current boundary:

1. package is still marked `private`
2. publish workflow is not set up in this repo yet

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
6. `npm run bench:loader-backed-semi-live-token`
7. `npm run smoke:gateway-backed-feasibility`
8. `npm run smoke:adapter-activity`
9. `npm run bench:google-runtime`
10. `npm run bench:google-runtime-ab`

`bench:live-task` is the first scenario-backed benchmark layer:

1. keepalive poll churn
2. transport retry churn
3. real-repo broad-search / broad-test drift

## Current Evidence

Benchmark overview:
- `docs/2026-03-14-benchmark-evidence-overview.md`
- `docs/2026-03-14-openclaw-aionis-benchmark-summary.md`
- `docs/2026-03-14-openclaw-completion-benchmark.md`
- `docs/2026-03-14-openclaw-loader-backed-semi-live-token-benchmark.md`
- `docs/2026-03-14-openclaw-adapter-activity-probe.md`
- `docs/2026-03-14-openclaw-gateway-backed-feasibility.md`
- `docs/2026-03-14-openclaw-google-runtime-benchmark.md`
- `docs/2026-03-14-openclaw-google-runtime-case-study.md`
- `docs/2026-03-14-openclaw-gateway-backed-benchmark-plan.md`

### Live-task A/B

Artifact:
- `evidence/openclaw-live-task-benchmark/20260314061733/summary.json`

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
- `evidence/openclaw-semi-live-token-benchmark/20260314064242/summary.json`

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
- `evidence/openclaw-semi-live-token-benchmark/20260314070306/summary.json`

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

### Loader-Backed Semi-Live Token Benchmark

Current artifact:
- `evidence/openclaw-loader-backed-semi-live-token-benchmark/20260314073214/summary.json`

Current result:

- baseline:
  - `avg_total_tokens = 1836`
  - `avg_executed_steps = 5.75`
  - `completed_rate = 0.25`
- treatment:
  - `avg_total_tokens = 968.25`
  - `avg_executed_steps = 2.25`
  - `completed_rate = 0.25`
  - `controlled_stop_rate = 0.25`
  - `replay_dispatch_rate = 0.25`
  - `handoff_store_rate = 0.5`
  - `avg_broad_tool_calls = 0`

This currently supports:

- the token reduction result survives a real OpenClaw install/discovery path
- the adapter still reduces churn and token burn when executed from the installed plugin source path

### Gateway-Backed Runtime Feasibility

Current artifact:
- `evidence/openclaw-gateway-backed-feasibility/summary.json`

Current result:

- `provider = zai`
- `model = glm-5`
- `runtime_path_reached_model = true`
- `outcome = rate_limited_timeout`

This currently supports:

- the real `openclaw agent --local` runtime path now reaches `zai/glm-5`
- the earlier Anthropic default-model blocker is resolved
- the remaining blocker for a full gateway-backed benchmark is provider-side runtime rate limiting

### Adapter Activity Probe

Current artifact:
- `evidence/openclaw-adapter-activity-probe/summary.json`

Current result:

- `provider = zai`
- `model = glm-5`
- `runtime_path_reached_model = true`
- `mock_paths = ["/v1/memory/context/assemble", "/v1/handoff/store"]`
- `outcome = adapter_active`

This probe is narrower than a full runtime-backed benchmark.

It is designed to show:

- the installed adapter is active inside a real `openclaw agent --local` turn
- the runtime emits real Aionis requests such as `context/assemble`

This helps separate:

- plugin activity proof
- from the still-open provider-side rate-limit blocker on the live runtime path

### Google Runtime-Backed Completion A/B

Current artifact:
- `evidence/openclaw-google-runtime-benchmark/20260314084010/summary.json`

Current result:

- provider:
  - `google/gemini-3-flash-preview`
- baseline:
  - `completed_rate = 0`
  - `avg_total_tokens = 4319`
  - `timed_out_count = 1`
- treatment:
  - `completed_rate = 0.8`
  - `avg_total_tokens = 4287`
  - `avg_mock_request_count = 1`
  - `timed_out_count = 0`
- delta:
  - `completion_gain = +0.8`
  - `avg_token_delta = -26.5`
  - `token_win_rate = 0.5`
  - `token_pair_count = 4`

This currently supports:

- a real OpenClaw local agent path now has a repeated `baseline vs adapter` runtime-backed completion benchmark
- adapter-driven externalized context lifts completion on a stable provider-backed path
- this repo no longer depends only on the `zai/glm-5` feasibility line for runtime evidence

### Completion-Oriented Benchmark

Current artifact:
- `evidence/openclaw-completion-benchmark/20260314072335/summary.json`

Current result:

- baseline:
  - `completed_rate = 0`
  - `avg_executed_steps = 3.67`
  - `avg_total_tokens = 1125`
- treatment:
  - `completed_rate = 1`
  - `avg_executed_steps = 2`
  - `avg_total_tokens = 882.67`
  - `replay_dispatch_success_rate = 0.3333`
  - `handoff_resume_success_rate = 0.3333`

This currently supports:

- Aionis can improve completion on replay-eligible repeated workflows
- Aionis can improve completion on tight-budget real-repo focused tasks
- Aionis can also improve completion on interrupted handoff-resume tasks

## Entry point

Use `createOpenClawAionisAdapter(...)` to attach the adapter to an OpenClaw host API implementation.
