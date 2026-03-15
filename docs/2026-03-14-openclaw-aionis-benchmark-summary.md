# OpenClaw Aionis Benchmark Summary

Date: 2026-03-14  
Package: `@aionis/openclaw-adapter`

## Executive Summary

`@aionis/openclaw-adapter` gives OpenClaw a control layer where it most often fails under cost and complexity pressure: the tool loop.

The current public evidence supports this product claim:

**Aionis reduces uncontrolled tool-loop churn in OpenClaw, lowers token burn on the benchmarked slices, improves completion on the current replay, focused-repo, handoff-resume, one-prompt multi-agent, and realistic reviewer-ready workflow slices, and is active on real OpenClaw runtime paths.**

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
- [One-prompt multi-agent summary: issue #10864](../evidence/openclaw-one-prompt-multi-agent-benchmark/20260314115524/summary.json)
- [One-prompt multi-agent summary: dashboard auth drift](../evidence/openclaw-one-prompt-multi-agent-benchmark/20260314125034/summary.json)
- [One-prompt multi-agent summary: markdown fallback](../evidence/openclaw-one-prompt-multi-agent-benchmark/20260314130932/summary.json)
- [Google runtime benchmark summary](../evidence/openclaw-google-runtime-benchmark/20260314084010/summary.json)
- [Google runtime case study](2026-03-14-openclaw-google-runtime-case-study.md)
- [One-prompt multi-agent benchmark](2026-03-14-openclaw-one-prompt-multi-agent-benchmark.md)

Headline results:

- completion benchmark: baseline `completed_rate = 0`, treatment `completed_rate = 1`
- one-prompt multi-agent issue `#10864`: baseline `completed_rate = 0`, treatment `completed_rate = 1`
- one-prompt multi-agent dashboard auth drift: baseline `completed_rate = 0`, treatment `completed_rate = 1`
- one-prompt multi-agent markdown fallback: baseline `completed_rate = 0.3333`, treatment `completed_rate = 1` (`supporting slice`)
- repeated Google runtime-backed A/B: baseline `completed_rate = 0`, treatment `completed_rate = 0.8`

What this proves:

- on the current replay, focused-repo, handoff-resume, and one-prompt multi-agent slices, Aionis improves completion
- this is no longer only harness-only evidence; there is also repeated runtime-backed completion evidence on a second provider path

Important boundary:

- the strongest one-prompt multi-agent claims still come from `#10864` and dashboard auth drift
- markdown fallback is positive evidence, but weaker, so it should be treated as supporting evidence rather than headline evidence

### 5. The adapter is active on real OpenClaw runtime paths

Evidence:

- [Adapter activity probe](../evidence/openclaw-adapter-activity-probe/20260314082034/summary.json)
- [Gateway-backed feasibility summary](../evidence/openclaw-gateway-backed-feasibility/20260314080716/summary.json)

What this proves:

- the installed adapter emits real Aionis calls inside `openclaw agent --local`
- the runtime path reaches actual provider/model execution
- the remaining blocker on the `zai/glm-5` path is provider-side rate limiting, not missing adapter integration

### 6. Reviewer-ready workflow completion goes up on a more realistic workflow scenario

Evidence:

- [Real workflow scenario summary: dashboard auth drift (real Lite)](../evidence/openclaw-real-workflow-scenario/20260315063952/summary.json)
- [Real workflow scenario summary: pairing / approval recovery (real Lite)](../evidence/openclaw-real-workflow-scenario/20260315065630/summary.json)
- [Real workflow scenario benchmark](2026-03-15-openclaw-real-workflow-scenario-benchmark.md)

Headline results:

- dashboard auth drift: baseline `reviewer_ready_rate = 0.6667`, treatment `reviewer_ready_rate = 1`
- pairing / approval recovery: baseline `reviewer_ready_rate = 0`, treatment `reviewer_ready_rate = 1`

What this proves:

- Aionis can carry a realistic multi-agent workflow through to a reviewer-ready package on the actual Lite path
- this is a product-validating scenario family, not only a narrow benchmark slice
- the strongest treatment advantage here is continuity, not token reduction
- the second workflow slice extends this story onto a second workflow shape on the same real runtime path

## What This Does Not Yet Prove

The current evidence does **not** prove:

1. planner-internal reasoning control
2. identical behavior across all providers and models
3. that every complex OpenClaw failure mode is solved
4. that token reduction is universal across all runtime-backed paths
5. that every realistic workflow scenario will show the same magnitude of reviewer-ready uplift

Those would be overclaims.

## Recommended Public Framing

Use language like:

- execution control for OpenClaw
- policy, replay, and handoff around tool use
- less uncontrolled tool churn
- lower token burn on benchmarked slices
- higher completion on current slices
- reviewer-ready workflow completion on the current realistic workflow scenario

Do not use language like:

- solves all ReAct failure modes
- controls planner thoughts
- universally lowers tokens on every model
- makes OpenClaw fully stable everywhere
