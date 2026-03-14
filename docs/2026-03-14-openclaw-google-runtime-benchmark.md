# OpenClaw Google Runtime Benchmark

Date: 2026-03-14  
Repo: `@aionis/openclaw-aionis-adapter`

## Goal

Provide a repeated runtime-backed live benchmark on a provider that is not currently blocked by the `zai/glm-5` rate-limit path.

This benchmark uses:

1. real `openclaw agent --local`
2. real installed adapter
3. real provider-backed model execution
4. a narrow externalized-context resume slice

## Scenario

`externalized_context_resume_token`

Prompt:

`Resume the previous run and reply with the exact resume token only. If the token is unknown from current context, reply UNKNOWN.`

Expected token:

`resume-alpha-19`

## Artifact

- `/Volumes/ziel/openclaw-aionis-adapter/artifacts/openclaw-google-runtime-benchmark/summary.json`
- `/Volumes/ziel/openclaw-aionis-adapter/artifacts/openclaw-google-runtime-benchmark/20260314084010/summary.json`

## Result

Provider:

- `google/gemini-3-flash-preview`

Repetitions:

- `5`

Baseline:

- `completed_rate = 0`
- `avg_total_tokens = 4319`
- `timed_out_count = 1`

Treatment:

- `completed_rate = 0.8`
- `avg_total_tokens = 4287`
- `avg_mock_request_count = 1`
- `timed_out_count = 0`

Delta:

- `completion_gain = +0.8`
- `avg_token_delta = -26.5`
- `token_win_rate = 0.5`
- `token_pair_count = 4`

## What this proves

This is now the strongest stable runtime-backed completion benchmark in the repo.

It proves:

1. a real OpenClaw local agent path can be measured in repeated `baseline vs adapter` runs
2. adapter-driven externalized context can lift completion on that live runtime path
3. this is not only a loader-backed or harness-only result
4. this repo now has stable runtime-backed evidence on a second provider even while the `zai/glm-5` path remains rate-limited

## What this does not prove

1. strong token reduction on this slice
2. planner-internal reasoning control
3. universal completion uplift across all runtime tasks
4. that the `zai/glm-5` live runtime rate-limit blocker is gone
