# OpenClaw Adapter Activity Probe

Date: 2026-03-14  
Repo: `@aionis/openclaw-adapter`

## Goal

Prove that the installed adapter is active on a real `openclaw agent --local` turn, even if the provider later rate-limits the run.

This is narrower than a full runtime-backed benchmark.

## Why this matters

The loader-backed proof already shows:

1. OpenClaw can discover and load the plugin
2. the installed plugin source path can be used in benchmark harnesses

What it does not prove by itself is:

1. that a real `agent --local` turn actually executes the adapter hooks
2. that the adapter emits Aionis traffic during that real runtime path

## Current artifact

- `evidence/openclaw-adapter-activity-probe/summary.json`
- `evidence/openclaw-adapter-activity-probe/20260314082034/summary.json`

## Probe shape

The probe does:

1. install the adapter with `openclaw plugins install <repo> --link`
2. write a temporary profile config enabling `plugins.entries.openclaw-aionis-adapter`
3. point the adapter at a local mock Aionis HTTP server
4. run `openclaw agent --local --json`
5. record which Aionis endpoints the runtime actually hits

## Current result

The current probe shows:

1. `provider = zai`
2. `model = glm-5`
3. `runtime_path_reached_model = true`
4. `mock_request_count = 2`
5. `mock_paths = ["/v1/memory/context/assemble", "/v1/handoff/store"]`
6. `outcome = adapter_active`

## Success condition

The probe is a success if the installed runtime turn produces at least:

1. `/v1/memory/context/assemble`

and preferably also:

2. `/v1/handoff/store`

## What this would prove

This now allows a stronger statement:

**The installed adapter is active inside a real OpenClaw local agent turn and emits real Aionis requests before the model finishes the task.**

## Boundary

This still does not prove:

1. that a full runtime-backed baseline vs treatment benchmark has completed
2. that the provider-side rate limit blocker is gone
3. that token or completion gains have already been reproduced on the live runtime path
