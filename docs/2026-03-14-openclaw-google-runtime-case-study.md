# Google Runtime-Backed Completion Case Study

Date: 2026-03-14  
Repo: `@aionis/openclaw-aionis-adapter`

## Question

Can adapter-driven externalized context improve completion on a real `openclaw agent --local` path, using a stable provider that is not blocked by the current `zai/glm-5` rate-limit issue?

## Setup

Provider:

- `google/gemini-3-flash-preview`

Task:

- `externalized_context_resume_token`

Prompt:

- `Resume the previous run and reply with the exact resume token only. If the token is unknown from current context, reply UNKNOWN.`

Expected answer:

- `resume-alpha-19`

Arms:

1. `baseline`
   - real `openclaw agent --local`
   - no adapter
   - empty workspace context
2. `treatment`
   - real `openclaw agent --local`
   - installed `@aionis/openclaw-aionis-adapter`
   - adapter receives externalized context from `/v1/memory/context/assemble`

Repetitions:

- `5`

Artifact:

- `/Volumes/ziel/openclaw-aionis-adapter/artifacts/openclaw-google-runtime-benchmark/20260314084010/summary.json`

## Result

Baseline:

- `completed_rate = 0`
- `avg_total_tokens = 4319`
- `avg_duration_ms = 8585.25`
- `timed_out_count = 1`

Treatment:

- `completed_rate = 0.8`
- `avg_total_tokens = 4287`
- `avg_duration_ms = 8220.8`
- `avg_mock_request_count = 1`
- `timed_out_count = 0`

Delta:

- `completion_gain = +0.8`
- `avg_token_delta = -26.5`
- `token_win_rate = 0.5`
- `token_pair_count = 4`

## Interpretation

This is a runtime-backed completion result, not just a loader-backed or harness-only result.

The adapter changes the outcome because the model no longer has to guess whether prior execution context exists. The treatment arm receives a concrete recovered token through `context/assemble`, and the local agent path completes in `4/5` runs.

The baseline arm does not complete in any of the `5` runs.

The token result is secondary:

- paired runs show a mild average reduction
- the main effect is completion uplift

## What This Proves

1. a real OpenClaw local agent path can be measured in repeated `baseline vs adapter` runs
2. adapter-driven externalized context can materially improve completion on that path
3. this repo now has stable runtime-backed evidence on a second provider even while `zai/glm-5` remains rate-limited

## What This Does Not Prove

1. strong token reduction on this slice
2. planner-internal reasoning control
3. universal completion uplift across all OpenClaw tasks
4. that the `zai/glm-5` runtime-backed blocker is resolved
