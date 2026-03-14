# OpenClaw Gateway-Backed Benchmark Plan

Date: 2026-03-14  
Repo: `@aionis/openclaw-aionis-adapter`

## Goal

Move one step above the current loader-backed benchmark by exercising a real OpenClaw runtime path instead of only install/discovery plus local plugin invocation.

The target is a benchmark that goes through:

1. real OpenClaw plugin install
2. real OpenClaw runtime startup
3. real OpenClaw agent or gateway invocation
4. measurable baseline vs treatment comparison

## Why this is the next step

Current evidence already proves:

1. the plugin can load through real OpenClaw discovery
2. the adapter reduces churn
3. the adapter reduces token burn
4. the adapter improves completion on the current slices

What is still missing is a stronger runtime-backed proof where OpenClaw itself is the execution shell, not only the plugin loader.

There are now two narrower runtime-backed proofs already in place:

1. `gateway-backed feasibility`
2. `adapter activity probe`

## Recommended first path

Use:

1. `openclaw agent --local --json`
2. or `openclaw gateway run` plus `openclaw gateway call`

Recommendation:

**Prefer `openclaw agent --local --json` first.**

Reason:

1. it is simpler than running a long-lived gateway service
2. it is closer to a real OpenClaw task turn
3. it still exercises more real runtime behavior than the current local benchmark scripts

## Proposed benchmark arms

1. `baseline_openclaw_local`
2. `openclaw_local_with_aionis_adapter`

Keep constant:

1. model
2. provider
3. prompt
4. workspace
5. tool availability
6. timeout budget

## Phase 1 scope

Start with a single task slice:

### `focused_repo_under_budget_runtime`

Task:

1. locate adapter registration
2. validate plugin entry
3. stay within a small step budget

Success condition:

1. task completes
2. no broad repo sweep after the focused path becomes known

Primary metrics:

1. `completed`
2. `total_tokens`
3. `tool_call_count`
4. `executed_steps`
5. `controlled_stop`
6. `stop_reason`

## Execution shape

### Baseline

1. install or load OpenClaw without the adapter enabled
2. run the local agent turn
3. capture JSON result, logs, and usage

### Treatment

1. install and enable `openclaw-aionis-adapter`
2. point adapter config at benchmark Aionis mock or Lite instance
3. run the same local agent turn
4. capture JSON result, logs, and usage

## Required harness pieces

1. temporary OpenClaw home/state directory
2. plugin install and enable step
3. OpenClaw config patching for the benchmark profile
4. agent invocation wrapper
5. usage extraction
6. artifact capture

## Expected blockers

### 1. Provider configuration

`openclaw agent --local` may require explicit provider/model config beyond shell env.

Mitigation:

1. use a temporary benchmark profile
2. patch the local config directly for `GLM-5`

Current feasibility result:

1. a patched benchmark profile now reaches `provider = zai` and `model = glm-5`
2. current blocker:
   - the runtime-backed local agent path is now failing at provider-side rate limiting
   - this happens before a stable tool-loop comparison can complete
3. reference:
   - `docs/2026-03-14-openclaw-gateway-backed-feasibility.md`

### 1b. Installed adapter activity

Current result:

1. a real `openclaw agent --local` turn now emits:
   - `/v1/memory/context/assemble`
   - `/v1/handoff/store`
2. reference:
   - `docs/2026-03-14-openclaw-adapter-activity-probe.md`

### 2. Usage extraction

The runtime may not expose token data in the same shape as the direct benchmark harness.

Mitigation:

1. prefer JSON result if usage is present
2. otherwise parse session logs or usage-cost output

### 3. Runtime nondeterminism

A full runtime-backed path will be noisier than the current harness.

Mitigation:

1. start with a single task slice
2. repeat at least 3 runs
3. do not overclaim from one noisy run

## Deliverables

1. `scripts/openclaw-gateway-backed-benchmark.py`
2. `fixtures/openclaw-gateway-backed-scenarios-v1.json`
3. artifact directory:
   - `summary.json`
   - `cases.jsonl`
   - runtime stdout/stderr logs
   - config snapshot

## Success bar

This benchmark is useful if it shows:

1. the adapter still lowers step count or token burn on a real OpenClaw runtime path
2. completion is not worse
3. logs clearly show that the installed adapter was active

## What this benchmark would prove

If successful, it would allow a stronger statement:

**The Aionis adapter improves OpenClaw behavior on a real runtime-backed task path, not only on loader-backed and harness-driven paths.**

## What it still would not prove

1. planner-thought control
2. universal effect across all tasks
3. universal effect across all models
