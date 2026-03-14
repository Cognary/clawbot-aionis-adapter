# OpenClaw Google Runtime Benchmark

Date: 2026-03-14  
Repo: `@aionis/openclaw-aionis-adapter`

## Goal

Provide one stable runtime-backed live benchmark on a provider that is not currently blocked by the `zai/glm-5` rate-limit path.

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
- `/Volumes/ziel/openclaw-aionis-adapter/artifacts/openclaw-google-runtime-benchmark/20260314083138/summary.json`

## Result

Provider:

- `google/gemini-3-flash-preview`

Baseline:

- `payload_text = UNKNOWN`
- `completed = false`
- `total_tokens = 4310`

Treatment:

- `payload_text = resume-alpha-19`
- `completed = true`
- `total_tokens = 4311`
- `mock_paths = ["/v1/memory/context/assemble"]`

Delta:

- `completion_gain = +1`
- `token_delta = +1`

## What this proves

This is now the strongest runtime-backed live slice in the repo.

It proves:

1. a real OpenClaw local agent turn can complete a live provider-backed task with the installed adapter enabled
2. adapter-driven externalized context can lift completion on that live runtime path
3. this is not only a loader-backed or harness-only result

## What this does not prove

1. token reduction on this slice
2. planner-internal reasoning control
3. universal completion uplift across all runtime tasks
4. that the `zai/glm-5` live runtime rate-limit blocker is gone
