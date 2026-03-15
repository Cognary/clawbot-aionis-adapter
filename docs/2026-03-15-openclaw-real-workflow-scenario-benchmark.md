# OpenClaw Real Workflow Scenario v1

Date: 2026-03-15  
Package: `@aionis/openclaw-adapter`

## Purpose

This benchmark is the second-layer product proof.

It is not a narrow harness slice. It is a realistic multi-agent workflow where a single high-level request must be turned into a reviewer-ready work package.

The goal is to answer a product question:

**Does Aionis help OpenClaw complete a realistic workflow that depends on continuity across agents, not just isolated benchmark steps?**

## Scenario

Top-level task:

> Investigate the Control UI dashboard auth drift after restart or token rotation, identify the most likely auth boundary causing `AUTH_TOKEN_MISMATCH` or unauthorized behavior, prepare the smallest safe remediation direction, define focused validation, and leave a reviewer-ready summary with rollback notes.

Repo:

- `openclaw/openclaw`

Agents:

1. `orchestrator`
2. `triage`
3. `patch`
4. `review`

## A/B Setup

### Baseline

- OpenClaw native multi-agent workflow
- text-only stage carryover
- no Aionis context assemble
- no Aionis handoff continuity

### Treatment

- same workflow
- `@aionis/openclaw-adapter` enabled
- Aionis context assemble at stage boundaries
- Aionis handoff store between agents
- policy gating kept active

## Completion Definition

A run is counted as `reviewer_ready` only when the workflow produces a reviewer-ready packet with:

1. issue hypothesis
2. target file set
3. remediation direction
4. focused validation plan
5. rollback notes
6. reviewer verdict

## Current Result

### Primary workflow slice: dashboard auth drift

Evidence:

- [Summary JSON](../evidence/openclaw-real-workflow-scenario/20260315040559/summary.json)
- [Cases JSONL](../evidence/openclaw-real-workflow-scenario/20260315040559/cases.jsonl)

Headline result (`3` repeats):

- baseline `reviewer_ready_rate = 0.3333`
- treatment `reviewer_ready_rate = 1`
- baseline `workflow_completed_rate = 0.3333`
- treatment `workflow_completed_rate = 1`

Other signals:

- baseline `avg_total_tokens = 8398.33`
- treatment `avg_total_tokens = 12264`
- baseline `avg_rediscovery_reads = 1.67`
- treatment `avg_rediscovery_reads = 0.67`
- treatment `avg_handoff_store_count = 5`
- treatment `avg_context_assemble_count = 4`

### Supporting workflow slice: pairing / approval recovery (`Gemini`)

Evidence:

- [Summary JSON](../evidence/openclaw-real-workflow-scenario/20260315052250/summary.json)
- [Cases JSONL](../evidence/openclaw-real-workflow-scenario/20260315052250/cases.jsonl)

Headline result (`3` repeats):

- baseline `reviewer_ready_rate = 0`
- treatment `reviewer_ready_rate = 0.6667`
- baseline `workflow_completed_rate = 0`
- treatment `workflow_completed_rate = 0.6667`

Other signals:

- baseline `avg_total_tokens = 14751.33`
- treatment `avg_total_tokens = 21894.33`
- baseline `avg_broad_tool_call_count = 2`
- treatment `avg_broad_tool_call_count = 0`
- treatment `avg_handoff_store_count = 4`
- treatment `avg_context_assemble_count = 4`

## Interpretation

This is a **continuity win**, not a token win.

The treatment runs are more expensive because they consistently complete the workflow and produce reviewer-ready packets. The baseline still succeeds occasionally, but it does so much less reliably.

That is the right way to read this benchmark:

- Aionis helps OpenClaw preserve enough structured execution state across agents to finish the workflow
- the value here is not cheaper failure
- the value is successful multi-agent completion on a realistic workflow

## What This Proves

This benchmark proves:

1. Aionis can improve completion on a realistic reviewer-ready workflow, not only narrow harness slices
2. Aionis continuity is strong enough to carry the workflow through to a reviewer-ready packet with repeated evidence
3. the product story holds across more than one realistic workflow shape, including a second supporting Gemini slice

## What It Does Not Prove

This benchmark does not prove:

1. universal token reduction
2. planner-internal reasoning control
3. universal improvement on every workflow shape

## Run Command

Primary workflow slice:

```bash
BENCH_REPEATS=3 BENCH_SCENARIO_ID=glm_dashboard_auth_drift_reviewer_ready_workflow npm run bench:real-workflow
```

Supporting Gemini slice:

```bash
BENCH_REPEATS=3 BENCH_SCENARIO_ID=glm_pairing_approval_recovery_reviewer_ready_workflow \
  BENCH_MODEL_PROVIDER=gemini npm run bench:real-workflow
```
