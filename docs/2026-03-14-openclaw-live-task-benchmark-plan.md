# OpenClaw Live-Task Benchmark Plan

Date: 2026-03-14
Repo: `@aionis/openclaw-adapter`
Status: draft v1

## Goal

Design a benchmark that is closer to real OpenClaw behavior than the current trace-driven tool-loop A/B, while still being repeatable enough to compare:

- `without adapter`
- `with @aionis/openclaw-adapter`

The benchmark should answer one narrow question:

**Can Aionis materially reduce uncontrolled tool-loop churn in OpenClaw on tasks that resemble real reported failure modes?**

It should not claim planner-internal reasoning control.

## Source Problems

This benchmark is based on real OpenClaw issues and official OpenClaw docs, not synthetic problem statements.

### 1. Keepalive / polling loops can run without a clear circuit breaker

Source:
- [openclaw/openclaw#45759](https://github.com/openclaw/openclaw/issues/45759)

Observed problem:
- long-running polling / keepalive work can keep iterating without a strong stop policy
- failure mode is operational churn, not one-shot failure

Benchmark implication:
- at least one scenario must model repeated successful-but-unhelpful tool results
- success means the adapter stops the loop with a structured reason and escape hatch

### 2. Gateway / RPC / websocket instability causes repeated retries and broken command execution

Source:
- [openclaw/openclaw#45750](https://github.com/openclaw/openclaw/issues/45750)

Observed problem:
- command execution can degrade under intermittent gateway / websocket failure
- repeated retries are plausible and expensive

Benchmark implication:
- at least one scenario must model repeated transport-like failure or unavailable-tool outputs
- success means the adapter stops retry churn and records feedback/evidence instead of blindly retrying

### 3. Orphaned completion processes and repeated background work can accumulate operational pressure

Source:
- [openclaw/openclaw#10864](https://github.com/openclaw/openclaw/issues/10864)

Observed problem:
- repeated or unbounded execution can leak process pressure and memory pressure over time

Benchmark implication:
- benchmark should count executed steps, repeated-tool streaks, and controlled stop timing
- the test should reward early controlled exit, not just final task completion

### 4. OpenClaw's own docs already frame tool-loop detection as the right enforcement layer

Source:
- [OpenClaw tool loop detection docs](https://docs.openclaw.ai/configuration/tool-loop-detection)

Observed product reality:
- OpenClaw already exposes configuration around repeated tool calls, same-parameter loops, and no-progress loop detection
- those controls are optional and local to tool-loop behavior

Benchmark implication:
- the adapter benchmark should stay honest and benchmark tool-boundary control
- it should not pretend to solve planner-internal thought loops

## Benchmark Positioning

This benchmark is a **live-task benchmark**, but not a fully uncontrolled internet benchmark.

That means:
- real OpenClaw runtime
- real plugin loading path
- real adapter hooks
- real Aionis HTTP calls
- deterministic task fixtures and deterministic external stubs where needed

It does **not** mean:
- arbitrary live internet pages with unstable content
- free-running LLM tasks with no replayable acceptance criteria

Reason:
- if the environment is too unstable, we will not know whether results came from Aionis, OpenClaw, the model, or the internet

## Benchmark Design

### Arms

1. `baseline_openclaw`
- OpenClaw runs the task without the adapter
- same model, same prompt, same environment, same tools

2. `aionis_adapter`
- OpenClaw runs the same task with `@aionis/openclaw-adapter`
- same model, same prompt, same environment, same tools

### Invariants

- same task text
- same repo or workspace
- same tool availability
- same timeout budget
- same model/provider
- same network stub or same local service target
- same max total wall-clock budget

### Primary Metrics

1. `executed_steps`
- lower is better when paired with same or better task outcome

2. `controlled_stop_rate`
- fraction of cases where the system stopped with a structured reason instead of drifting

3. `same_tool_streak_peak`
- peak repeated-tool streak before stop or completion

4. `duplicate_observation_streak_peak`
- peak no-progress loop signature

5. `replay_dispatch_rate`
- fraction of cases that escape through replay

6. `handoff_store_rate`
- fraction of cases that escape through handoff

7. `feedback_write_count`
- evidence that post-step learning loop is actually active

8. `task_outcome`
- `completed`, `controlled_stop`, `timed_out`, `crashed`

### Secondary Metrics

- wall-clock duration
- adapter block count
- broad-scan suppression count
- broad-test suppression count
- evidence write count
- stop reason distribution

## Scenario Matrix

### Scenario A: Keepalive Poll Churn

Mapped source:
- [openclaw/openclaw#45759](https://github.com/openclaw/openclaw/issues/45759)

Task shape:
- OpenClaw is asked to monitor a local endpoint or local job status until a meaningful state change appears
- the stub endpoint intentionally returns repeated unchanged responses for many cycles before any useful change

Why this is realistic:
- mirrors long-poll / keepalive / monitor loops where every iteration is technically valid but not useful

Expected baseline behavior:
- continues polling until global timeout or many repeated tool calls

Expected adapter behavior:
- detects repeated no-progress polling
- triggers controlled stop
- records reason code
- optionally stores handoff if no replay path exists

Acceptance:
- adapter reaches controlled stop materially earlier than baseline
- no loss of diagnostic context

### Scenario B: Transport Retry Churn

Mapped source:
- [openclaw/openclaw#45750](https://github.com/openclaw/openclaw/issues/45750)

Task shape:
- OpenClaw is asked to execute a command-oriented maintenance task against a local stub service
- the stub intermittently returns transport-like failures or temporary unavailability

Why this is realistic:
- mirrors gateway / websocket / RPC flakiness that causes repeated retries instead of meaningful progress

Expected baseline behavior:
- retries the same tool or same command path repeatedly

Expected adapter behavior:
- recognizes repeated failure without progress
- blocks further redundant retries at threshold
- writes feedback and evidence
- chooses replay dispatch if a known deterministic path exists, otherwise handoff

Acceptance:
- adapter reduces repeated retries and produces structured stop reason

### Scenario C: Broad Search and Broad Test Drift in a Real Repo

Mapped source:
- official tool-loop control surface in docs
- also consistent with common coding-agent failure modes even when not tied to a single issue

Task shape:
- run against a real local repo, starting with a bug-localization or focused repair task
- allowed tools include both broad and focused options
- example broad paths:
  - `grep -R`
  - broad `pytest`
- example focused paths:
  - `rg`
  - focused `pytest <targets>`

Why this is realistic:
- this is the most common expensive tool-loop failure in code tasks

Expected baseline behavior:
- tool drift toward broad scan or broad test sweep

Expected adapter behavior:
- policy reroutes broad search to focused search
- blocks repeated broad test loops
- if no progress persists, exits via replay or handoff

Acceptance:
- lower broad-tool count
- fewer executed steps
- same or better task outcome quality

## Implementation Plan

### Phase 1: Deterministic Live Harness

Use real OpenClaw runtime and real adapter package, but deterministic local targets.

Build:
- `scripts/live-task-benchmark.mjs`
- `fixtures/live-task-scenarios-v1.json`
- local stub services:
  - polling stub
  - flaky transport stub
- real local repo case for broad-search / broad-test drift

Why first:
- stable enough to debug
- close enough to real runtime to validate hooks and stop behavior

### Phase 2: Semi-Live Model Harness

Move the same scenarios onto a real model-backed run with strict model/provider pinning.

Add:
- pinned model version
- same prompt template across arms
- same OpenClaw config across arms except adapter enablement

Why second:
- this is where we validate whether the adapter still helps when model variance is present

### Phase 3: Public Benchmark Slice

Only publish scenarios that remain stable under repetition.

Public claim threshold:
- at least 5 runs per scenario
- same direction of effect across runs
- adapter advantage visible in executed steps or controlled stop rate

## Required Instrumentation

The harness must persist per run:
- selected tool sequence
- params hash per tool call
- result signature hash per observation
- stop reason
- replay dispatch count
- handoff store count
- feedback write count
- evidence write count
- wall-clock duration

Artifacts:
- `summary.json`
- `cases.jsonl`
- `raw-tool-sequence.jsonl`
- `stop-reasons.json`

## Pass / Fail Criteria

### Minimum pass for v1

The benchmark is useful if it can show all of the following:
- baseline drifts or retries materially longer than treatment
- treatment stops for a structured reason instead of timing out blindly
- treatment writes feedback/evidence
- at least one scenario escapes through replay or handoff

### Fail conditions

The benchmark is not valid if:
- only synthetic mock host is used
- Aionis HTTP calls are stubbed out entirely
- baseline and treatment use different task text or different tools
- stop reasons are not persisted

## What This Benchmark Can Prove

If successful, this benchmark can support the following claim:

**Aionis materially reduces uncontrolled tool-loop churn in OpenClaw by enforcing policy, detecting repeated no-progress behavior, and escaping through replay or handoff.**

## What It Cannot Prove

This benchmark will still not prove:
- planner-internal reasoning control
- universal improvement on every OpenClaw task
- global superiority across all providers, models, or environments

## Immediate Next Step

Implement `Phase 1` in this repo and keep the first live-task matrix limited to 3 scenarios:
- keepalive poll churn
- transport retry churn
- real-repo broad-search/broad-test drift
