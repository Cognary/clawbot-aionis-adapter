# Benchmark Evidence Overview

Date: 2026-03-14
Repo: `@aionis/openclaw-aionis-adapter`
Status: current evidence snapshot

## What Is Already Proven

### 1. Real OpenClaw loader integration works

Artifact:
- `/Volumes/ziel/openclaw-aionis-adapter/artifacts/openclaw-load-smoke/summary.json`

Current result:
- `plugin_status = loaded`
- `hook_count = 8`
- `plugin_source = /Volumes/ziel/openclaw-aionis-adapter/dist/plugin.js`

This proves:
- the package is not only a library scaffold
- real OpenClaw loader discovery and registration work

### 2. Tool-loop churn can be reduced

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

This proves:
- Aionis reduces uncontrolled tool-loop churn in OpenClaw
- Aionis suppresses broad search and broad test drift
- Aionis can escape via replay or handoff

### 3. GLM-5 token burn can be reduced on semi-live tasks

Artifact:
- `/Volumes/ziel/openclaw-aionis-adapter/artifacts/openclaw-semi-live-token-benchmark/20260314064242/summary.json`

Current result:
- baseline:
  - `avg_total_tokens = 1893`
  - `avg_executed_steps = 5.67`
  - `completed_rate = 0.3333`
- treatment:
  - `avg_total_tokens = 865.33`
  - `avg_executed_steps = 2`
  - `completed_rate = 0.3333`
  - `avg_broad_tool_calls = 0`

This proves:
- Aionis can reduce token burn in OpenClaw on scenario-backed semi-live tasks
- the current token win is driven by context shaping, policy shaping, and focused-path execution

### 4. Hard-stop and replay-driven token saving also works

Artifact:
- `/Volumes/ziel/openclaw-aionis-adapter/artifacts/openclaw-semi-live-token-benchmark/20260314070306/summary.json`

Current result:
- baseline:
  - `avg_total_tokens = 1659`
  - `avg_executed_steps = 6`
  - `controlled_stop_rate = 0`
- treatment:
  - `avg_total_tokens = 1267`
  - `avg_executed_steps = 3`
  - `controlled_stop_rate = 1`
  - `replay_dispatch_rate = 1`

This proves:
- Aionis is not limited to soft context shaping
- hard-stop plus replay-driven control can also reduce token burn

### 5. Completion uplift is now partially proven

Artifacts:
- replay-dispatch completion:
  - `/Volumes/ziel/openclaw-aionis-adapter/artifacts/openclaw-completion-benchmark/20260314071310/summary.json`
- real-repo under-budget completion:
  - `/Volumes/ziel/openclaw-aionis-adapter/artifacts/openclaw-completion-benchmark/20260314071206/summary.json`

Current results:
- replay-dispatch completion:
  - baseline `completed_rate = 0`
  - treatment `completed_rate = 1`
- real-repo under-budget completion:
  - baseline `completed_rate = 0`
  - treatment `completed_rate = 1`

This proves:
- Aionis can improve completion on replay-eligible repeated workflows
- Aionis can improve completion on tight-budget focused real-repo tasks

## What Is Not Yet Proven

### 1. Handoff-resume completion uplift

Not yet proven.

Current artifact:
- `/Volumes/ziel/openclaw-aionis-adapter/artifacts/openclaw-completion-benchmark/20260314071336/summary.json`

Current result:
- baseline `completed_rate = 0`
- treatment `completed_rate = 0`

Planned next step:
- improve the handoff-resume scenario or choose a sharper interrupted-task target

### 2. Planner-internal reasoning control

Not proven and not claimed.

Reason:
- OpenClaw hook coverage is strong at the tool boundary
- it is not a native planner-thought-step control surface

### 3. Universal effect across all models and providers

Not proven and not claimed.

Current strongest provider-backed evidence is:
- `GLM-5`

## Current Best Public Claim

The current strongest accurate claim is:

**Aionis materially reduces uncontrolled tool-loop churn in OpenClaw and can reduce token burn by enforcing policy, cutting repeated no-progress turns, and escaping through replay or handoff.**
