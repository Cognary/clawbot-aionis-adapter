# Execution Continuity Validation

Date: 2026-03-15  
Package: `@aionis/openclaw-adapter`

## Question

After wiring `handoff/recover -> execution_state_v1 / execution_packet_v1 -> before_agent_start -> context/assemble`, does the new continuity contract stay positive on the real Lite workflow path?

This page is narrower than the main benchmark pages.

It is not a new publication family. It is a validation page for the new continuity path.

## Setup

Common setup for all three validation slices:

1. real OpenClaw workflow harness
2. real `@aionis/openclaw-adapter`
3. real Aionis Lite at `http://127.0.0.1:3321`
4. real Gemini workflow model
5. recovered handoff continuity passed into:
   - `before_agent_start`
   - `context/assemble`

Arms:

1. `baseline`
   - text-only native carryover
   - no recovered execution packet
2. `treatment`
   - recovered `execution_state_v1`
   - recovered `execution_packet_v1`
   - adapter forwards that packet into real `context/assemble`

These are single-run validations.

They are useful because they show the new continuity contract is live on the real workflow route, not only in unit or integration tests.

## Validation Slices

### 1. Dashboard auth drift

Evidence:

- [Summary JSON](../evidence/openclaw-real-workflow-scenario/20260315090950/summary.json)
- [Cases JSONL](../evidence/openclaw-real-workflow-scenario/20260315090950/cases.jsonl)

Result:

- baseline `reviewer_ready_rate = 0`
- treatment `reviewer_ready_rate = 1`
- baseline `workflow_completed_rate = 0`
- treatment `workflow_completed_rate = 1`

Interpretation:

- the new packet path stays positive on a realistic auth-boundary workflow
- the real Lite route consumes enough recovered continuity to finish a reviewer-ready run

### 2. Pairing / approval recovery

Evidence:

- [Summary JSON](../evidence/openclaw-real-workflow-scenario/20260315091709/summary.json)
- [Cases JSONL](../evidence/openclaw-real-workflow-scenario/20260315091709/cases.jsonl)

Result:

- baseline `reviewer_ready_rate = 0`
- treatment `reviewer_ready_rate = 1`
- baseline `workflow_completed_rate = 0`
- treatment `workflow_completed_rate = 1`

Interpretation:

- the continuity packet is not only valid on the auth drift path
- it also stays positive on the pairing / approval recovery workflow

### 3. Service token drift repair

Evidence:

- [Summary JSON](../evidence/openclaw-real-workflow-scenario/20260315092312/summary.json)
- [Cases JSONL](../evidence/openclaw-real-workflow-scenario/20260315092312/cases.jsonl)

Result:

- baseline `reviewer_ready_rate = 0`
- treatment `reviewer_ready_rate = 1`
- baseline `workflow_completed_rate = 0`
- treatment `workflow_completed_rate = 1`

Interpretation:

- the continuity packet also stays positive on a service-audit / repair workflow
- this gives the contract validation a third real workflow shape

## What This Proves

1. the new execution continuity contract is active on the actual Lite workflow route
2. the adapter can recover structured continuity and feed it into real `context/assemble`
3. the new path stays positive on more than one real workflow shape

## What This Does Not Prove

1. that every workflow slice will improve by the same amount
2. that this continuity path is already fully optimized
3. universal token reduction
4. planner-internal reasoning control

## Correct Reading

The right public reading is:

**The execution continuity kernel is no longer just an internal architecture change. It is now wired into the real OpenClaw + Lite workflow path and has positive real-path validation evidence.**

The wrong reading would be:

- this replaces the repeated benchmark publication sets
- this proves universal improvement
- this is a token benchmark
