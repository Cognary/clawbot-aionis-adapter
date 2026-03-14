# OpenClaw Multi-Agent High-Token Benchmark Plan

Date: 2026-03-14  
Package: `@aionis/openclaw-adapter`

## Goal

Design a more realistic benchmark than the current single-run and slice-based tests.

The next benchmark should answer a stronger product question:

**When OpenClaw is used in a real multi-agent coding workflow on a large repo, does Aionis reduce wasted token burn and improve completion by making handoff, policy, replay, and loop control actually work across phases?**

## Why This Benchmark Exists

The current benchmark set already proves:

1. tool-loop churn reduction
2. token reduction on benchmarked slices
3. completion uplift on current replay, focused-repo, and handoff-resume slices
4. activity on real OpenClaw runtime paths

What it does not yet prove strongly enough is the workflow most users actually care about:

- a large repo
- a real coding issue
- multiple agent phases
- repeated search / retry / handoff pressure
- a token budget high enough for waste to matter

That is the gap this benchmark should close.

## Real Sources Used To Choose The Task

### 1. OpenClaw officially supports sub-agents and background agent runs

Source:
- [Sub-agents](https://docs.openclaw.ai/tools/subagents)

Why it matters:
- a multi-agent benchmark is product-aligned with the runtime
- this should not be a fake orchestration pattern imported from another system

### 2. OpenClaw explicitly documents tool-loop detection because repeated no-progress tool cycles are a real problem

Sources:
- [Tool-loop detection](https://docs.openclaw.ai/tools/loop-detection)
- [Tools](https://docs.openclaw.ai/tools)

Why it matters:
- the benchmark should create realistic pressure on the tool loop
- otherwise Aionis is being tested on the wrong surface

### 3. OpenClaw’s own loop is the authoritative path for model inference -> tool execution -> persistence

Source:
- [Agent Loop](https://docs.openclaw.ai/concepts/agent-loop)

Why it matters:
- the benchmark should stay close to the real OpenClaw loop, not a detached offline toy

### 4. Real OpenClaw issues already show the kind of operational churn we want to stress

Source:
- [Issue #10864: Orphan openclaw-completion processes accumulate and cause memory pressure](https://github.com/openclaw/openclaw/issues/10864)

Why it matters:
- this is the right class of problem: cross-cutting, operational, easy to burn tokens on, and large enough to force broad code search if the agent is not controlled

## Recommended Benchmark Shape

Use a **3-agent coding workflow**:

1. `Planner`
2. `Executor`
3. `Reviewer`

Keep the benchmark narrow enough to explain, but large enough to create real token pressure.

Do **not** start with a 5-agent swarm.

That would increase orchestration noise faster than it increases evidence quality.

## The Concrete Task

### Primary benchmark task

**Repository:** `openclaw/openclaw`  
**Issue anchor:** `#10864 Orphan openclaw-completion processes accumulate and cause memory pressure`

### Exact task statement

> Investigate the orphan `openclaw-completion` process accumulation issue, identify the most likely cleanup or lifecycle boundary responsible for the leak, implement a minimal fix or guard if feasible, add or update a focused regression test, and have a reviewer agent verify that the patch and test target the right boundary.

This is the concrete task I recommend using for the first multi-agent high-token A/B.

## Why This Specific Task Is Good

### 1. It is real

It is anchored to a real OpenClaw GitHub issue, not an invented benchmark prompt.

### 2. It is naturally high token

To solve it, agents are likely to touch:

- process lifecycle code
- agent loop boundaries
- completion or subprocess management paths
- cleanup and termination logic
- test files in multiple locations

Without strong control, this tends to create:

- broad search across the repo
- repeated grep / rg passes
- repeated no-progress reads
- repeated broad test attempts

That is exactly where Aionis should matter.

### 3. It is naturally multi-agent

The work cleanly decomposes into:

- `Planner`: localize the problem boundary and produce a patch plan
- `Executor`: implement the smallest viable fix and run focused validation
- `Reviewer`: verify the patch targets the right lifecycle boundary and the test is not fake coverage

### 4. It is benchmarkable

The task has hard outputs:

1. a concrete suspected root-cause boundary
2. a patch or guard change
3. a focused test or regression validation
4. a reviewer verdict

This gives better acceptance criteria than vague “research the codebase” prompts.

## Secondary Tasks

If the first task works, add two more tasks in the same benchmark suite.

### Task B: sub-agent context continuity bugfix

Use the benchmark to stress the exact problem surfaced by official sub-agent support: context handoff between parent and spawned work.

Candidate task shape:

> Fix or tighten a session/sub-agent context handoff path so a spawned agent can resume from the exact file or state boundary identified by the planner.

This stresses:

- handoff quality
- resumed execution
- reduced rediscovery cost

### Task C: approval-safe deterministic workflow slice

Use an OpenProse/Lobster-style multi-step coding task with a deterministic validation step.

Sources:
- [OpenProse](https://docs.openclaw.ai/prose)
- [Lobster](https://docs.openclaw.ai/tools/lobster)

Candidate task shape:

> Planner identifies a deterministic repair path, executor performs the repair, reviewer validates whether the work should be promoted into a replay-eligible path.

This stresses:

- replay eligibility
- replay dispatch value
- reviewer-driven confirmation

## Benchmark Arms

### Baseline

- OpenClaw multi-agent workflow
- no `@aionis/openclaw-adapter`
- same provider
- same model
- same prompt
- same tool access
- same timeout and token budget

### Treatment

- same workflow
- same provider
- same model
- same prompt
- same tool access
- with `@aionis/openclaw-adapter`

## Agent Roles

### Planner

Responsibilities:

1. read the issue statement
2. localize probable failure boundaries
3. identify target files and target tests
4. emit a structured handoff to executor

### Executor

Responsibilities:

1. implement the smallest viable fix
2. avoid broad tests unless justified
3. run focused validation
4. emit structured handoff to reviewer

### Reviewer

Responsibilities:

1. verify the patch actually targets the issue boundary
2. verify focused validation is legitimate
3. either pass, request a fix, or stop with a reason

## Success Criteria

A run counts as completed only if all of the following are true:

1. planner identifies a concrete boundary
2. executor produces a patch or explicit minimal guard change
3. executor runs a focused validation step
4. reviewer returns a pass or justified fail verdict
5. no stage exits with an ambiguous “needs more searching” final state

## Primary Metrics

### Outcome metrics

1. `completed_rate`
2. `review_pass_rate`
3. `handoff_resume_success_rate`
4. `replay_dispatch_rate`

### Cost metrics

1. `total_tokens`
2. `tokens_per_completed_task`
3. `wall_clock_ms`

### Loop-control metrics

1. `tool_call_count`
2. `broad_search_call_count`
3. `broad_test_call_count`
4. `same_tool_streak_peak`
5. `duplicate_observation_streak_peak`
6. `controlled_stop_rate`

## Most Important Metric

The most defensible single metric is:

**`tokens_per_completed_task`**

Why:
- it prevents fake wins from early stopping
- it combines cost with successful task completion
- it is closer to actual user value than raw tokens alone

## What We Expect Aionis To Change

On this task, Aionis should improve the workflow in four places:

1. **Planner -> Executor handoff**
   - less rediscovery
   - less repeated broad search

2. **Executor tool path**
   - more focused search
   - fewer broad test attempts

3. **Degraded run handling**
   - better structured stop instead of wandering
   - possible replay or handoff usage when needed

4. **Reviewer efficiency**
   - more compact context
   - less need to re-read planner and executor history

## Recommended Benchmark Name

`OpenClaw Multi-Agent Coding Benchmark v1`

### First concrete task in that benchmark

`Task 1: OpenClaw issue #10864 process-leak triage, patch, and review`

This is the concrete task I recommend starting with.

## What To Build Next

Implementation should include:

1. a multi-agent harness with explicit Planner / Executor / Reviewer stages
2. a baseline arm and treatment arm
3. token collection per stage
4. structured handoff artifacts between stages
5. reviewer verdict capture
6. a small number of repetitions instead of one lucky run

## Recommended Repetition Count

Start with:

- `3` repetitions for bring-up
- `5` repetitions once stable

Anything below that is too noisy for a claim about completion and token efficiency.
