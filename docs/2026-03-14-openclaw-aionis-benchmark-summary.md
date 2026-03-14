# OpenClaw Aionis Benchmark Summary

Date: 2026-03-14  
Repo: `@aionis/openclaw-aionis-adapter`

## One-line summary

`@aionis/openclaw-aionis-adapter` reduces uncontrolled tool-loop churn in OpenClaw, lowers token burn in `GLM-5` scenario-backed semi-live tasks, improves completion on the current replay, focused real-repo, and handoff-resume slices, and is now proven active on a real `openclaw agent --local` turn.

## Best current public claim

The strongest accurate claim right now is:

**Aionis materially reduces uncontrolled tool-loop churn in OpenClaw and can reduce token burn and improve completion by enforcing policy, cutting repeated no-progress turns, and escaping through replay or handoff. The installed adapter is also proven active on a real OpenClaw local agent turn.**

## Evidence ladder

### 1. Real plugin load works

Artifact:
- `/Volumes/ziel/openclaw-aionis-adapter/artifacts/openclaw-load-smoke/summary.json`

Result:
- `plugin_status = loaded`
- `hook_count = 8`

Why it matters:
- the adapter is not just a local library scaffold
- OpenClaw can discover and load it as a real plugin

### 2. Tool-loop churn goes down

Artifact:
- `/Volumes/ziel/openclaw-aionis-adapter/artifacts/openclaw-live-task-benchmark/20260314061733/summary.json`

Result:
- baseline `avg_executed_steps = 7.33`
- treatment `avg_executed_steps = 3`
- treatment `controlled_stop_rate = 0.6667`

Why it matters:
- Aionis is controlling the expensive part of OpenClaw failure: repeated tool churn

### 3. Token burn goes down

Artifacts:
- direct semi-live:
  - `/Volumes/ziel/openclaw-aionis-adapter/artifacts/openclaw-semi-live-token-benchmark/20260314064242/summary.json`
- loader-backed semi-live:
  - `/Volumes/ziel/openclaw-aionis-adapter/artifacts/openclaw-loader-backed-semi-live-token-benchmark/20260314073214/summary.json`

Results:
- direct semi-live:
  - baseline `avg_total_tokens = 1893`
  - treatment `avg_total_tokens = 865.33`
- loader-backed semi-live:
  - baseline `avg_total_tokens = 1836`
  - treatment `avg_total_tokens = 968.25`

Why it matters:
- token reduction survives both direct benchmark execution and a stronger loader-backed path

### 4. Hard-stop and replay are real, not only soft shaping

Artifact:
- `/Volumes/ziel/openclaw-aionis-adapter/artifacts/openclaw-semi-live-token-benchmark/20260314070306/summary.json`

Result:
- treatment `controlled_stop_rate = 1`
- treatment `replay_dispatch_rate = 1`

Why it matters:
- Aionis is not only improving prompts or context
- it can also stop and escape

### 5. Completion goes up on current slices

Artifact:
- `/Volumes/ziel/openclaw-aionis-adapter/artifacts/openclaw-completion-benchmark/20260314072335/summary.json`

Result:
- baseline `completed_rate = 0`
- treatment `completed_rate = 1`

Included slices:
1. replay-dispatch completion
2. real-repo under-budget completion
3. handoff-resume completion

Why it matters:
- Aionis is not only reducing waste
- on the current slices, it also improves final task completion

### 6. Real agent-turn adapter activity is proven

Artifact:
- `/Volumes/ziel/openclaw-aionis-adapter/artifacts/openclaw-adapter-activity-probe/20260314082034/summary.json`

Result:
- `provider = zai`
- `model = glm-5`
- `mock_paths = ["/v1/memory/context/assemble", "/v1/handoff/store"]`
- `outcome = adapter_active`

Why it matters:
- the installed adapter is active inside a real `openclaw agent --local` turn
- Aionis requests are emitted before the run finishes
- degraded runtime turns can already trigger adapter-driven handoff fallback

## What is proven

1. OpenClaw can load the adapter.
2. Aionis reduces tool-loop churn on scenario-backed live tasks.
3. Aionis reduces `GLM-5` token burn on the current semi-live tasks.
4. Aionis can save tokens through hard-stop and replay dispatch, not only through softer context shaping.
5. Aionis improves completion on the current replay, focused real-repo, and handoff-resume slices.
6. The installed adapter is active on a real OpenClaw local agent turn.

## What is not yet proven

1. planner-internal reasoning control
2. universal effect across all providers and models
3. fully live gateway-backed end-to-end task evidence

## Recommended public framing

Say:

- `tool-loop control`
- `policy enforcement`
- `replay and handoff escape`
- `lower token burn`
- `higher completion on current slices`
- `installed adapter activity on real local agent turns`

Do not say:

- `solves all ReAct failure modes`
- `controls planner thoughts`
- `works equally well on every model`
