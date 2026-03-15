# Execution Continuity A/B

Date: 2026-03-15  
Package: `@aionis/openclaw-adapter`

## Question

Once the new execution continuity contract is wired into the real Lite path, does it actually beat the older legacy handoff path?

This page is narrower than the main workflow benchmark pages.

It compares two treatment paths only:

1. `legacy continuity`
   - recovered handoff text only
2. `packet continuity`
   - recovered `execution_state_v1` and `execution_packet_v1`
   - no raw handoff text injected into the model prompt

## Setup

Common setup:

1. real OpenClaw workflow harness
2. real `@aionis/openclaw-adapter`
3. real Aionis Lite at `http://127.0.0.1:3321`
4. real Gemini workflow model
5. `3` repeats per arm
6. `treatment-only` comparison to avoid baseline noise

The goal is not to re-prove that Aionis beats baseline.

The goal is to compare:

- the older continuity path already in use
- the newer `execution_packet_v1` path

## Results

### 1. Dashboard auth drift

Evidence:

- [Summary JSON](../evidence/openclaw-real-workflow-continuity-ab/20260315102630/summary.json)
- [Runs JSONL](../evidence/openclaw-real-workflow-continuity-ab/20260315102630/runs.jsonl)

Result:

- legacy continuity:
  - `reviewer_ready_rate = 1`
  - `avg_total_tokens = 24750.67`
  - `avg_wall_clock_ms = 64654.33`
- packet continuity:
  - `reviewer_ready_rate = 1`
  - `avg_total_tokens = 22974`
  - `avg_wall_clock_ms = 64220.67`

Interpretation:

- completion stays flat at the top line
- the packet path uses fewer tokens
- the packet path is also slightly faster

### 2. Pairing / approval recovery

Evidence:

- [Summary JSON](../evidence/openclaw-real-workflow-continuity-ab/20260315103311/summary.json)
- [Runs JSONL](../evidence/openclaw-real-workflow-continuity-ab/20260315103311/runs.jsonl)

Result:

- legacy continuity:
  - `reviewer_ready_rate = 1`
  - `avg_total_tokens = 22704`
  - `avg_wall_clock_ms = 62025`
- packet continuity:
  - `reviewer_ready_rate = 1`
  - `avg_total_tokens = 22091.33`
  - `avg_wall_clock_ms = 61313.33`

Interpretation:

- completion again stays flat at the top line
- the packet path again uses fewer tokens
- the packet path again finishes faster

### 3. Service token drift repair

Evidence:

- [Summary JSON](../evidence/openclaw-real-workflow-continuity-ab/20260315104415/summary.json)
- [Runs JSONL](../evidence/openclaw-real-workflow-continuity-ab/20260315104415/runs.jsonl)

Result:

- legacy continuity:
  - `reviewer_ready_rate = 1`
  - `avg_total_tokens = 24974.67`
  - `avg_wall_clock_ms = 68372.67`
- packet continuity:
  - `reviewer_ready_rate = 1`
  - `avg_total_tokens = 23043`
  - `avg_wall_clock_ms = 65621.33`

Interpretation:

- completion still stays flat at `1.0`
- the packet path again uses fewer tokens
- the packet path again finishes faster

## What Changed

The first packet-vs-legacy compare was noisy because the packet arm still carried legacy handoff text through two extra paths:

1. raw handoff text was still passed into `context/assemble`
2. raw carryover text was still injected directly into the model prompt

That was not a clean `legacy vs packet` comparison.

The benchmark was then tightened so that the packet arm uses:

1. recovered `execution_state_v1`
2. recovered `execution_packet_v1`
3. no raw legacy handoff text unless structured continuity is absent

This made the A/B clean enough to measure the actual continuity contract.

## What This Proves

1. the new continuity contract is not only wired into the real Lite path
2. on three repeated real workflow slices, it now matches legacy completion
3. on those same slices, it improves token use and wall-clock over the old continuity path

## What This Does Not Prove

1. that every workflow shape will show the same packet advantage
2. that packet shaping is fully optimized
3. universal token reduction across all real runtime scenarios

## Correct Reading

The right reading is:

**The new `execution_packet_v1` continuity path is now competitive with, and currently better than, the legacy continuity path on repeated real Lite workflow A/B for three core scenarios.**

The wrong reading would be:

- the kernel work is finished
- every continuity path is now solved
- all workflow scenarios will show the same margin
