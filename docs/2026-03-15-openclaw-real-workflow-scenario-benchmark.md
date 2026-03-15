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

### Workflow slice: dashboard auth drift (real Lite)

Evidence:

- [Summary JSON](../evidence/openclaw-real-workflow-scenario/20260315063952/summary.json)
- [Cases JSONL](../evidence/openclaw-real-workflow-scenario/20260315063952/cases.jsonl)

Headline result (`3` repeats):

- baseline `reviewer_ready_rate = 0.6667`
- treatment `reviewer_ready_rate = 1`
- baseline `workflow_completed_rate = 0.6667`
- treatment `workflow_completed_rate = 1`

Other signals:

- baseline `avg_total_tokens = 20283.67`
- treatment `avg_total_tokens = 22831.67`
- baseline `avg_rediscovery_reads = 1`
- treatment `avg_rediscovery_reads = 0.67`
- treatment `avg_handoff_store_count = 4`
- treatment `avg_context_assemble_count = 4`

### Workflow slice: pairing / approval recovery (real Lite)

Evidence:

- [Summary JSON](../evidence/openclaw-real-workflow-scenario/20260315065630/summary.json)
- [Cases JSONL](../evidence/openclaw-real-workflow-scenario/20260315065630/cases.jsonl)

Headline result (`3` repeats):

- baseline `reviewer_ready_rate = 0`
- treatment `reviewer_ready_rate = 1`
- baseline `workflow_completed_rate = 0`
- treatment `workflow_completed_rate = 1`

Other signals:

- baseline `avg_total_tokens = 15460`
- treatment `avg_total_tokens = 23506.33`
- baseline `avg_broad_tool_call_count = 1.67`
- treatment `avg_broad_tool_call_count = 1.67`
- treatment `avg_handoff_store_count = 4`
- treatment `avg_context_assemble_count = 4`

### Workflow slice: service token drift repair (real Lite)

Evidence:

- [Summary JSON](../evidence/openclaw-real-workflow-scenario/20260315074101/summary.json)
- [Cases JSONL](../evidence/openclaw-real-workflow-scenario/20260315074101/cases.jsonl)

Result (`3` repeats):

- baseline `reviewer_ready_rate = 0`
- treatment `reviewer_ready_rate = 0.6667`
- baseline `workflow_completed_rate = 0`
- treatment `workflow_completed_rate = 0.6667`

Other signals:

- baseline `avg_total_tokens = 17034.67`
- treatment `avg_total_tokens = 29591`
- baseline `avg_broad_tool_call_count = 1.67`
- treatment `avg_broad_tool_call_count = 1.33`
- treatment `avg_handoff_store_count = 4`
- treatment `avg_context_assemble_count = 4`

This slice is positive and realistic, but still weaker than the two strongest real-workflow slices that reached `1.0` reviewer-ready rate under treatment.

### Workflow slice: markdown parser fallback (real Lite, supporting)

Evidence:

- [Summary JSON](../evidence/openclaw-real-workflow-scenario/20260315072548/summary.json)
- [Cases JSONL](../evidence/openclaw-real-workflow-scenario/20260315072548/cases.jsonl)

Result (`3` repeats):

- baseline `reviewer_ready_rate = 0`
- treatment `reviewer_ready_rate = 0.6667`
- baseline `workflow_completed_rate = 0`
- treatment `workflow_completed_rate = 0.6667`

Other signals:

- baseline `avg_total_tokens = 10896`
- treatment `avg_total_tokens = 24172.67`
- baseline `avg_broad_tool_call_count = 1`
- treatment `avg_broad_tool_call_count = 1`
- treatment `avg_handoff_store_count = 3.33`
- treatment `avg_context_assemble_count = 3.33`

This slice is positive, but weaker than the first two real-workflow slices. It should be treated as supporting evidence, not a headline slice.

## Execution Continuity Contract Validation

After the first four real-Lite workflow publications, the adapter was updated to thread recovered `execution_state_v1` / `execution_packet_v1` into `before_agent_start -> context_assemble`.

These are not new headline benchmark slices. They are single-run, real-path validations that prove the new continuity contract is live on the actual workflow route.

### Validation slice: dashboard auth drift with continuity packet enabled

Evidence:

- [Summary JSON](../evidence/openclaw-real-workflow-scenario/20260315090950/summary.json)
- [Cases JSONL](../evidence/openclaw-real-workflow-scenario/20260315090950/cases.jsonl)

Single-run result:

- baseline `reviewer_ready_rate = 0`
- treatment `reviewer_ready_rate = 1`
- baseline `workflow_completed_rate = 0`
- treatment `workflow_completed_rate = 1`

Interpretation:

- this confirms that `handoff/recover -> execution_packet_v1 -> context_assemble` is active on the real Lite workflow path
- this is a continuity-path validation, not a new repeated publication set

### Validation slice: pairing / approval recovery with continuity packet enabled

Evidence:

- [Summary JSON](../evidence/openclaw-real-workflow-scenario/20260315091709/summary.json)
- [Cases JSONL](../evidence/openclaw-real-workflow-scenario/20260315091709/cases.jsonl)

Single-run result:

- baseline `reviewer_ready_rate = 0`
- treatment `reviewer_ready_rate = 1`
- baseline `workflow_completed_rate = 0`
- treatment `workflow_completed_rate = 1`

Interpretation:

- the new continuity contract is not only wired; it remains positive on a second real workflow shape
- this is still a validation slice, not a replacement for the stronger repeated `3`-run publication sets above

## Interpretation

These are **continuity wins**, not token wins.

The treatment runs are more expensive because they consistently complete the workflow and produce reviewer-ready packets. The baseline still succeeds occasionally on dashboard auth drift, but it does so less reliably. On pairing / approval recovery, baseline does not produce reviewer-ready output at all. Service token drift repair is also positive on the real Lite path, though weaker than the two strongest slices. The markdown parser fallback workflow is also positive, but its uplift is smaller, so it remains in the supporting tier.

That is the right way to read this benchmark:

- Aionis helps OpenClaw preserve enough structured execution state across agents to finish the workflow
- the value here is not cheaper failure
- the value is successful multi-agent completion on a realistic workflow using the actual `adapter + Lite` path

For the narrower page that focuses specifically on the new `execution_packet_v1` path, see:

- [Execution continuity validation](2026-03-15-openclaw-execution-continuity-validation.md)

## What This Proves

This benchmark proves:

1. Aionis can improve completion on a realistic reviewer-ready workflow, not only narrow harness slices
2. Aionis continuity is strong enough to carry the workflow through to a reviewer-ready packet with repeated evidence on the real Lite path
3. the product story holds across more than one realistic workflow shape under real runtime conditions
4. additional real workflow slices can stay positive on the real Lite path without being overstated as headline proof
5. supporting workflow slices can also stay positive on the real Lite path without being overstated as headline proof

## What It Does Not Prove

This benchmark does not prove:

1. universal token reduction
2. planner-internal reasoning control
3. universal improvement on every workflow shape

## Run Command

Primary workflow slice:

```bash
BENCH_REPEATS=3 BENCH_SCENARIO_ID=glm_dashboard_auth_drift_reviewer_ready_workflow \
  BENCH_AIONIS_BASE_URL=http://127.0.0.1:3321 npm run bench:real-workflow
```

Pairing / approval recovery slice:

```bash
BENCH_REPEATS=3 BENCH_SCENARIO_ID=glm_pairing_approval_recovery_reviewer_ready_workflow \
  BENCH_MODEL_PROVIDER=gemini BENCH_AIONIS_BASE_URL=http://127.0.0.1:3321 npm run bench:real-workflow
```

Service token drift repair slice:

```bash
BENCH_REPEATS=3 BENCH_SCENARIO_ID=gemini_service_token_drift_repair_reviewer_ready_workflow \
  BENCH_MODEL_PROVIDER=gemini BENCH_AIONIS_BASE_URL=http://127.0.0.1:3321 npm run bench:real-workflow
```

Markdown parser fallback slice:

```bash
BENCH_REPEATS=3 BENCH_SCENARIO_ID=gemini_markdown_parser_fallback_reviewer_ready_workflow \
  BENCH_MODEL_PROVIDER=gemini BENCH_AIONIS_BASE_URL=http://127.0.0.1:3321 npm run bench:real-workflow
```
