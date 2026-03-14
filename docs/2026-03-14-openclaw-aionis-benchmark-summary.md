# OpenClaw Aionis Benchmark Summary

Date: 2026-03-14  
Package: `@aionis/openclaw-adapter`

## Executive Summary

`@aionis/openclaw-adapter` gives OpenClaw a control layer where it most often fails under cost and complexity pressure: the tool loop.

The current public evidence supports this product claim:

**Aionis reduces uncontrolled tool-loop churn in OpenClaw, lowers token burn on the benchmarked slices, improves completion on the current replay, focused-repo, and handoff-resume slices, and is active on real OpenClaw runtime paths.**

That is the right claim to make today.

It is strong enough to be useful, and narrow enough to stay true.

## What Aionis Is Actually Doing

Aionis is not improving OpenClaw by acting as a generic note store.

It changes the execution path in four concrete ways:

1. **externalized context**
   - runs begin with compact execution state instead of rediscovering the same task surface
2. **policy gating**
   - broad search, broad test, and repeated no-progress tool paths can be suppressed before they execute
3. **replay dispatch**
   - repeatable work can escape into a known path instead of starting from scratch
4. **handoff fallback**
   - degraded runs can stop cleanly and preserve a continuation point

## The Best Evidence, In Order

### 1. OpenClaw can install and load the adapter

Evidence:

- [Load smoke summary](../evidence/openclaw-load-smoke/summary.json)

What this proves:

- this is a real OpenClaw package, not only a local harness
- OpenClaw can discover and register it on the real plugin path

### 2. Tool-loop churn goes down

Evidence:

- [Live-task benchmark summary](../evidence/openclaw-live-task-benchmark/20260314061733/summary.json)

Headline result:

- baseline `avg_executed_steps = 7.33`
- treatment `avg_executed_steps = 3`
- treatment `controlled_stop_rate = 0.6667`

What this proves:

- Aionis cuts repeated tool churn on scenario-backed OpenClaw tasks
- Aionis suppresses broad search and broad test drift
- Aionis can escape through replay or handoff instead of letting the run degrade indefinitely

### 3. Token burn goes down on the current benchmark slices

Evidence:

- [GLM-5 semi-live token summary](../evidence/openclaw-semi-live-token-benchmark/20260314064242/summary.json)
- [Loader-backed semi-live token summary](../evidence/openclaw-loader-backed-semi-live-token-benchmark/20260314073214/summary.json)
- [Hard-stop / replay token summary](../evidence/openclaw-semi-live-token-benchmark/20260314070306/summary.json)

Headline results:

- direct semi-live: `1893 -> 865.33`
- loader-backed semi-live: `1836 -> 968.25`
- hard-stop / replay slice: `1659 -> 1267`

What this proves:

- token reduction is not limited to a single synthetic path
- token reduction survives a stronger loader-backed install/discovery path
- hard-stop and replay are part of the current savings story, not only soft context shaping

### 4. Completion goes up on the current benchmark slices

Evidence:

- [Completion benchmark summary](../evidence/openclaw-completion-benchmark/20260314072335/summary.json)
- [Google runtime benchmark summary](../evidence/openclaw-google-runtime-benchmark/20260314084010/summary.json)
- [Google runtime case study](2026-03-14-openclaw-google-runtime-case-study.md)

Headline results:

- completion benchmark: baseline `completed_rate = 0`, treatment `completed_rate = 1`
- repeated Google runtime-backed A/B: baseline `completed_rate = 0`, treatment `completed_rate = 0.8`

What this proves:

- on the current replay, focused-repo, and handoff-resume slices, Aionis improves completion
- this is no longer only harness-only evidence; there is also repeated runtime-backed completion evidence on a second provider path

### 5. The adapter is active on real OpenClaw runtime paths

Evidence:

- [Adapter activity probe](../evidence/openclaw-adapter-activity-probe/20260314082034/summary.json)
- [Gateway-backed feasibility summary](../evidence/openclaw-gateway-backed-feasibility/20260314080716/summary.json)

What this proves:

- the installed adapter emits real Aionis calls inside `openclaw agent --local`
- the runtime path reaches actual provider/model execution
- the remaining blocker on the `zai/glm-5` path is provider-side rate limiting, not missing adapter integration

## What This Does Not Yet Prove

The current evidence does **not** prove:

1. planner-internal reasoning control
2. identical behavior across all providers and models
3. that every complex OpenClaw failure mode is solved
4. that token reduction is universal across all runtime-backed paths

Those would be overclaims.

## Recommended Public Framing

Use language like:

- execution control for OpenClaw
- policy, replay, and handoff around tool use
- less uncontrolled tool churn
- lower token burn on benchmarked slices
- higher completion on current slices

Do not use language like:

- solves all ReAct failure modes
- controls planner thoughts
- universally lowers tokens on every model
- makes OpenClaw fully stable everywhere
