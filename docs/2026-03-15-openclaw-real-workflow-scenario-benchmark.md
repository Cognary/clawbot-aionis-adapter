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

Evidence:

- [Summary JSON](../evidence/openclaw-real-workflow-scenario/20260314172725/summary.json)
- [Cases JSONL](../evidence/openclaw-real-workflow-scenario/20260314172725/cases.jsonl)

Headline result:

- baseline `reviewer_ready_rate = 0`
- treatment `reviewer_ready_rate = 1`
- baseline `workflow_completed_rate = 0`
- treatment `workflow_completed_rate = 1`

Other signals:

- baseline `avg_total_tokens = 4584`
- treatment `avg_total_tokens = 11865`
- treatment `avg_handoff_store_count = 5`
- treatment `avg_context_assemble_count = 4`

## Interpretation

This is a **continuity win**, not a token win.

The treatment run is more expensive because it actually completes the workflow and produces a reviewer-ready packet. The baseline run fails before it reaches that point.

That is the right way to read this benchmark:

- Aionis helps OpenClaw preserve enough structured execution state across agents to finish the workflow
- the value here is not cheaper failure
- the value is successful multi-agent completion on a realistic workflow

## What This Proves

This benchmark proves:

1. Aionis can improve completion on a realistic one-prompt multi-agent workflow
2. Aionis continuity is strong enough to carry the workflow through to a reviewer-ready packet
3. the product story holds outside narrow benchmark slices

## What It Does Not Prove

This benchmark does not prove:

1. universal token reduction
2. planner-internal reasoning control
3. universal improvement on every workflow shape

## Run Command

```bash
BENCH_REPEATS=1 npm run bench:real-workflow
```
