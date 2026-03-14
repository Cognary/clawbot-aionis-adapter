# OpenClaw Semi-Live Token Benchmark Plan

Date: 2026-03-14
Repo: `@aionis/openclaw-aionis-adapter`
Status: draft v1

## Goal

Design a **model-backed semi-live benchmark** that can answer one narrow question:

**Does `@aionis/openclaw-aionis-adapter` materially reduce token burn in OpenClaw on tool-loop-heavy tasks without improving results only by failing earlier?**

This benchmark exists because the current evidence base already shows:
- fewer executed steps
- fewer broad-tool calls
- higher controlled-stop rate
- replay / handoff escape activation

But it does **not yet directly prove token reduction**.

## Why Semi-Live

The benchmark must be:
- more realistic than trace-driven or fully deterministic harnesses
- stable enough to compare token counts across runs

That means:
- real model calls
- real OpenClaw runtime
- real adapter hooks
- real Aionis HTTP calls
- deterministic local targets where possible

It does **not** mean:
- unconstrained internet browsing
- arbitrary public web pages with changing content
- uncontrolled repo drift

Reason:
- token comparisons are meaningless if the environment changes between arms

## Benchmark Arms

1. `baseline_openclaw`
- same task
- same model/provider
- same timeout budget
- no adapter

2. `aionis_adapter`
- same task
- same model/provider
- same timeout budget
- adapter enabled

## Invariants

The benchmark is invalid unless these are held constant:

- same model name and provider
- same OpenClaw prompt template
- same repo or local stub target
- same tool availability
- same max wall-clock budget
- same max total run budget
- same number of allowed retries in the host
- same environment variables except adapter enablement

## Required Token Capture

Per run, persist:

1. `prompt_tokens_total`
2. `completion_tokens_total`
3. `total_tokens`
4. `tool_call_count`
5. `executed_steps`
6. `task_outcome`
7. `controlled_stop`
8. `stop_reason`
9. `wall_clock_ms`

Per step if available, persist:

1. `step_index`
2. `prompt_tokens_cumulative`
3. `completion_tokens_cumulative`
4. `tool_name`
5. `observation_hash`

## Primary Metrics

1. `avg_total_tokens`
- main metric
- lower is better only if outcome quality does not degrade

2. `avg_tokens_to_resolution_or_stop`
- measures cost to either complete or reach a structured stop

3. `avg_tokens_per_executed_step`
- helps distinguish token savings from mere step reduction

4. `controlled_stop_rate`
- ensures lower token burn is not coming from silent crashes

5. `completed_rate`
- ensures the adapter is not saving tokens by giving up too early

## Secondary Metrics

- `avg_executed_steps`
- `avg_tool_call_count`
- `avg_broad_tool_calls`
- `replay_dispatch_rate`
- `handoff_store_rate`
- `avg_feedback_writes`
- `avg_evidence_writes`
- `stop_reason_distribution`

## Fairness Rule

A token win only counts if at least one of the following is true:

1. `completed_rate` is not worse than baseline
2. `controlled_stop_rate` is higher and the stop is structured
3. the adapter reduces broad-tool churn while preserving equivalent task outcome quality

This benchmark must not claim victory when token savings come from:
- crashing earlier
- timing out earlier without explanation
- losing task outcome quality

## Scenario Set v1

### Scenario A: Keepalive Poll Churn with Model Mediation

Use case:
- OpenClaw is told to monitor a local endpoint until something meaningful changes
- the endpoint returns unchanged responses for many cycles

Why it matters:
- baseline can keep spending tokens on repeated observation / tool-selection turns
- adapter should stop repeated no-progress polling earlier

Expected signal:
- lower total tokens in treatment
- higher controlled-stop rate in treatment
- same or better diagnostic output

### Scenario B: Transport Retry Churn with Model Mediation

Use case:
- OpenClaw is told to execute a maintenance action against a flaky local gateway stub
- the gateway returns repeated transport-like failures

Why it matters:
- baseline can continue retrying and spend tokens re-planning the same failing action
- adapter should stop redundant retries and prefer replay or structured handoff

Expected signal:
- lower total tokens in treatment
- lower tokens after last meaningful progress
- replay dispatch or handoff evidence present

### Scenario C: Real-Repo Broad Search / Broad Test Drift

Use case:
- run against a real local repo
- task is narrow and code-focused
- OpenClaw has access to both broad and focused tool paths

Why it matters:
- this is the most likely real cost sink in coding tasks
- token burn grows when the agent repeatedly broad-scans the repo and re-runs broad tests

Expected signal:
- treatment reduces broad-tool count
- treatment reduces total tokens
- treatment preserves completion quality or exits through structured stop

## Provider Choice

Use a provider with stable usage accounting.

Preferred order:
1. OpenAI-compatible provider with reliable `usage`
2. DeepSeek if usage accounting is stable in the chosen OpenClaw path
3. avoid providers with inconsistent or missing token fields

## Implementation Shape

### Phase 1: Single-Provider v1

Build:
- `scripts/semi-live-token-benchmark.mjs`
- `fixtures/semi-live-token-scenarios-v1.json`
- a stable token collector for OpenClaw run logs or provider responses

The script should:
1. run baseline arm
2. run treatment arm
3. persist raw token evidence
4. compare outcomes and token totals

### Phase 2: Repeatability Pass

For each scenario, run at least `5` repetitions with the same model pin.

Publish only if:
- the direction of effect is consistent
- token savings are not offset by worse outcomes

## Artifact Contract

Each run must emit:
- `summary.json`
- `cases.jsonl`
- `token-breakdown.jsonl`
- `raw-run-metadata.jsonl`

Minimum `summary.json` fields:
- `benchmark`
- `provider`
- `model`
- `cases`
- `baseline.avg_total_tokens`
- `treatment.avg_total_tokens`
- `baseline.completed_rate`
- `treatment.completed_rate`
- `baseline.controlled_stop_rate`
- `treatment.controlled_stop_rate`

## Pass / Fail Criteria

### Minimum pass for v1

The benchmark is useful if it can show:
- treatment lowers `avg_total_tokens`
- treatment does not reduce `completed_rate`
- treatment increases `controlled_stop_rate` on churn scenarios
- treatment lowers broad-tool usage on repo scenarios

### Fail conditions

The benchmark is not valid if:
- token accounting is missing or inconsistent across arms
- baseline and treatment use different prompt templates
- model/provider differs across arms
- the adapter arm wins only by exiting as an unstructured failure

## What This Benchmark Can Prove

If successful, this benchmark can support the following claim:

**Aionis reduces token burn in OpenClaw on tool-loop-heavy tasks by enforcing policy, cutting repeated no-progress turns, and exiting through replay or handoff instead of blind churn.**

## What It Cannot Prove

This benchmark still cannot prove:
- planner-internal reasoning control
- universal token reduction on all OpenClaw tasks
- better task intelligence independent of the model

## Immediate Next Step

Implement `Phase 1` with one pinned provider and 3 scenarios:
- keepalive poll churn
- transport retry churn
- real-repo broad-search / broad-test drift
