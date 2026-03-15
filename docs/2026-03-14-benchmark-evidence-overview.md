# Benchmark Evidence Overview

Date: 2026-03-14  
Package: `@aionis/openclaw-adapter`
Status: current public evidence snapshot

## Reading This Page

This page separates three things:

1. **what is already proven**
2. **what is partially proven**
3. **what is not yet proven**

That distinction matters.

The value of this adapter is strongest when we stay precise about the claims.

## Already Proven

### 1. Real OpenClaw installation and loading work

Evidence:

- [Load smoke summary](../evidence/openclaw-load-smoke/summary.json)

Current signal:

- `plugin_status = loaded`
- `hook_count = 8`

Interpretation:

- OpenClaw can discover, install, and load the package as a real adapter

### 2. Tool-loop churn is reduced

Evidence:

- [Live-task benchmark summary](../evidence/openclaw-live-task-benchmark/20260314061733/summary.json)

Current signal:

- baseline `avg_executed_steps = 7.33`
- treatment `avg_executed_steps = 3`
- treatment `controlled_stop_rate = 0.6667`
- treatment `avg_broad_tool_calls = 0`

Interpretation:

- Aionis reduces repeated tool churn
- Aionis suppresses broad search and broad test drift
- Aionis gives OpenClaw structured escape paths through replay or handoff

### 3. Token reduction is proven on the current benchmark slices

Evidence:

- [GLM-5 semi-live token summary](../evidence/openclaw-semi-live-token-benchmark/20260314064242/summary.json)
- [Hard-stop / replay token summary](../evidence/openclaw-semi-live-token-benchmark/20260314070306/summary.json)
- [Loader-backed semi-live token summary](../evidence/openclaw-loader-backed-semi-live-token-benchmark/20260314073214/summary.json)

Current signal:

- `1893 -> 865.33`
- `1659 -> 1267`
- `1836 -> 968.25`

Interpretation:

- current token wins are real
- they survive both direct benchmark execution and a stronger loader-backed path
- they come from a mix of context shaping, policy shaping, focused execution, and hard-stop/replay behavior

### 4. Completion uplift is proven on the current benchmark slices

Evidence:

- [Completion benchmark summary](../evidence/openclaw-completion-benchmark/20260314072335/summary.json)
- [One-prompt multi-agent summary: issue #10864](../evidence/openclaw-one-prompt-multi-agent-benchmark/20260314115524/summary.json)
- [One-prompt multi-agent summary: dashboard auth drift](../evidence/openclaw-one-prompt-multi-agent-benchmark/20260314125034/summary.json)
- [One-prompt multi-agent summary: markdown fallback](../evidence/openclaw-one-prompt-multi-agent-benchmark/20260314130932/summary.json)
- [Google runtime benchmark summary](../evidence/openclaw-google-runtime-benchmark/20260314084010/summary.json)

Current signal:

- completion benchmark: `0 -> 1`
- one-prompt multi-agent issue `#10864`: `0 -> 1`
- one-prompt multi-agent dashboard auth drift: `0 -> 1`
- repeated Google runtime-backed A/B: `0 -> 0.8`
- realistic workflow scenario reviewer-ready rate on the real Lite path: `0.6667 -> 1`

Interpretation:

- Aionis improves completion on the current replay, focused-repo, handoff-resume, and one-prompt multi-agent slices
- Aionis also improves reviewer-ready completion on realistic workflow scenarios on the actual Lite path
- there is now repeated runtime-backed completion evidence, not only harness-only evidence

Evidence:

- [Real workflow scenario summary: dashboard auth drift (real Lite)](../evidence/openclaw-real-workflow-scenario/20260315063952/summary.json)
- [Real workflow scenario summary: pairing / approval recovery (real Lite)](../evidence/openclaw-real-workflow-scenario/20260315065630/summary.json)
- [Real workflow scenario summary: service token drift repair (real Lite)](../evidence/openclaw-real-workflow-scenario/20260315074101/summary.json)
- [Real workflow scenario summary: markdown parser fallback (real Lite)](../evidence/openclaw-real-workflow-scenario/20260315072548/summary.json)
- [Real workflow scenario benchmark](2026-03-15-openclaw-real-workflow-scenario-benchmark.md)

Supporting signal:

- one-prompt multi-agent markdown fallback: `0.3333 -> 1`

Interpretation:

- realistic workflow evidence is now positive on four workflow shapes under real Lite
- dashboard auth drift and pairing / approval recovery remain the strongest real-workflow signals on the actual runtime path
- service token drift repair is a positive additional real-workflow slice
- markdown parser fallback remains a supporting slice, not a headline slice
- these are continuity wins, not token wins

### 5. Real runtime activity is proven

Evidence:

- [Adapter activity probe](../evidence/openclaw-adapter-activity-probe/20260314082034/summary.json)
- [Gateway-backed feasibility summary](../evidence/openclaw-gateway-backed-feasibility/20260314080716/summary.json)

Current signal:

- runtime path reaches real provider/model execution
- adapter emits real Aionis calls during `openclaw agent --local`

Interpretation:

- the adapter is active on real runtime paths
- remaining GLM runtime blockers are provider-side, not integration-side

## Partially Proven

### 1. Runtime-backed token reduction

What we have:

- strong token evidence on scenario-backed and loader-backed paths
- a repeated Google runtime-backed A/B with only mild token improvement

What that means:

- runtime-backed completion uplift is already solid
- runtime-backed token reduction exists in parts of the evidence set, but should still be framed carefully by provider and scenario

### 2. Provider breadth

What we have:

- `GLM-5`
- `gemini-3-flash-preview`

What that means:

- the adapter is no longer single-provider evidence
- it is still not a universal provider claim

## Not Yet Proven

### 1. Planner-internal reasoning control

Not proven and not claimed.

The adapter controls the tool-loop boundary, not planner thoughts that never emit tools.

### 2. Universal benefit across all providers and task shapes

Not proven and not claimed.

The correct public claim is about the benchmarked slices, not every possible OpenClaw workload.

### 3. A fully stable `zai/glm-5` runtime-backed A/B

Not yet complete.

Current status:

- the path reaches `zai/glm-5`
- the current blocker is provider-side rate limiting

## Best Public Claim Today

The strongest accurate public statement is:

**Aionis gives OpenClaw an execution-control layer that reduces uncontrolled tool-loop churn, lowers token burn on the benchmarked slices, improves completion on the current replay, focused-repo, handoff-resume, and one-prompt multi-agent slices, and is proven active on real OpenClaw runtime paths.**
