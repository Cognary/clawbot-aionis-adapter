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

### 5. Loader-backed semi-live token reduction also works

Artifact:
- `/Volumes/ziel/openclaw-aionis-adapter/artifacts/openclaw-loader-backed-semi-live-token-benchmark/20260314073214/summary.json`

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

This proves:
- the token reduction result survives a real OpenClaw plugin install and discovery path
- the adapter still reduces churn and token burn when executed from the installed plugin source path

### 6. Completion uplift is now proven on the current three-slice benchmark

Artifact:
- `/Volumes/ziel/openclaw-aionis-adapter/artifacts/openclaw-completion-benchmark/20260314072335/summary.json`

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

This proves:
- Aionis can improve completion on replay-eligible repeated workflows
- Aionis can improve completion on tight-budget focused real-repo tasks
- Aionis can improve completion on interrupted handoff-resume tasks

## What Is Not Yet Proven

### 1. Planner-internal reasoning control

Not proven and not claimed.

Reason:
- OpenClaw hook coverage is strong at the tool boundary
- it is not a native planner-thought-step control surface

### 2. Universal effect across all models and providers

Not proven and not claimed.

Current strongest provider-backed evidence is:
- `GLM-5`

## Current Best Public Claim

The current strongest accurate claim is:

**Aionis materially reduces uncontrolled tool-loop churn in OpenClaw and can reduce token burn by enforcing policy, cutting repeated no-progress turns, and escaping through replay or handoff.**
