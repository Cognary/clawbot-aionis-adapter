# OpenClaw Completion-Oriented Benchmark Plan

Date: 2026-03-14
Repo: `@aionis/openclaw-aionis-adapter`
Status: draft v1

## Goal

Design a benchmark that measures whether `@aionis/openclaw-aionis-adapter` can improve **task completion rate**, not just reduce loop churn or token burn.

Target question:

**Can Aionis improve completion uplift in OpenClaw by steering tasks onto focused paths, reusing deterministic replay when available, and preserving recoverable execution state when baseline drifts or stalls?**

## Arms

1. `baseline_openclaw`
- same model
- same provider
- same task
- no adapter

2. `aionis_adapter`
- same model
- same provider
- same task
- adapter enabled

## Benchmark Positioning

This benchmark is distinct from:
- tool-loop churn benchmark
- semi-live token benchmark

Those two measure:
- wasted steps
- uncontrolled retries
- token burn

This benchmark measures:
- **whether more tasks actually finish successfully**

## Fairness Rules

The benchmark is invalid unless both arms keep constant:
- model
- provider
- prompt template
- repo/workspace
- tool availability
- timeout budget
- wall-clock budget
- retry budget

## Primary Metrics

1. `completed_rate`
- main metric

2. `median_time_to_completion_ms`
- secondary completion efficiency metric

3. `median_total_tokens_to_completion`
- optional if usage accounting is available

4. `replay_dispatch_success_rate`
- completion via deterministic replay

5. `handoff_resume_success_rate`
- completion after structured fallback and resume

## Secondary Metrics

- `controlled_stop_rate`
- `avg_executed_steps`
- `avg_broad_tool_calls`
- `avg_policy_reroutes`
- `feedback_write_count`
- `evidence_write_count`

## Scenario Selection Principles

Use scenarios where baseline plausibly fails or drifts, but treatment has a realistic way to succeed.

Good scenarios:
1. repeated known workflow with deterministic replay available
2. focused real-repo repair where broad-tool drift wastes the budget
3. cross-session continuation where handoff prevents context loss

Bad scenarios:
1. pure poll/monitor churn where completion is not the natural objective
2. tasks with no meaningful success condition
3. tasks where neither arm has a credible path to completion

## Scenario Matrix v1

### Scenario A: Replay-Eligible Repeated Workflow

Task:
- run a repeated, known local workflow where a deterministic playbook already exists

Why it matters:
- baseline must rediscover the path each time
- treatment can dispatch replay directly

Expected result:
- treatment completion rate higher than baseline
- treatment time to completion lower

### Scenario B: Real-Repo Focused Repair Under Budget

Task:
- a narrow bug-localization or plugin-entry repair task in a real local repo
- budget is intentionally tight enough that broad search and broad test drift hurts baseline

Why it matters:
- this is where policy + loop control should translate into real completion uplift

Expected result:
- treatment completes more often under the same budget
- treatment uses fewer broad-tool calls

### Scenario C: Structured Handoff and Resume

Task:
- force a mid-task interruption, then resume in a second run

Why it matters:
- baseline loses execution state and often fails to finish the resumed task
- treatment can recover handoff state and continue

Expected result:
- treatment resume completion rate higher than baseline

## Artifacts

Each run should emit:
- `summary.json`
- `cases.jsonl`
- `completion-events.jsonl`
- `resume-events.jsonl` when handoff is involved

## Minimum Pass Criteria

This benchmark is useful only if:
- `completed_rate` is measurably higher in treatment
- the gain is repeatable across at least 5 runs per scenario
- gains are not explained by looser validation or easier prompts

## What It Can Prove

If successful, this benchmark can support:

**Aionis improves completion in OpenClaw on replay-eligible, budget-constrained, and resumable tasks by keeping execution on focused paths and preserving recoverable state.**

## What It Cannot Prove

This benchmark still cannot prove:
- universal completion uplift on all OpenClaw tasks
- planner-internal reasoning superiority
- model-independent task intelligence gains

## Immediate Next Step

Implement v1 with 3 scenarios:
- replay-eligible repeated workflow
- real-repo focused repair under budget
- structured handoff and resume
