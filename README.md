# OpenClaw Aionis Adapter

A standalone adapter for connecting OpenClaw to Aionis execution control.

## What it is

This project provides:

1. a reusable `AionisLoopControlAdapter`
2. an `OpenClaw` host binding
3. loop-control heuristics for high-cost tool paths
4. replay and handoff escape-hatch orchestration

## What it is not

1. not a generic memory package
2. not a planner-internal reasoning controller

## Current hook coverage

1. `session_start`
2. `session_end`
3. `before_agent_start`
4. `before_tool_call`
5. `after_tool_call`
6. `agent_end`
7. `tool_result_persist`
8. `before_message_write`

## Current capabilities

1. pre-tool policy gating
2. repeated-tool blocking
3. duplicate/no-progress tracking
4. broad scan and broad test suppression
5. replay dispatch escape hatch
6. handoff fallback
7. structured stop reasons

## Boundary

This adapter controls the tool loop boundary.
It does not control planner-internal reasoning steps that never emit tools.

## Project structure

1. `src/adapter/`
2. `src/binding/`
3. `src/types/`

## Verification

1. `npm run test`
2. `npm run smoke:openclaw-load`
3. `npm run bench:openclaw-ab`
4. `npm run bench:live-task`
5. `npm run bench:semi-live-token`

`bench:live-task` is the first scenario-backed benchmark layer:

1. keepalive poll churn
2. transport retry churn
3. real-repo broad-search / broad-test drift

## Entry point

Use `createOpenClawAionisAdapter(...)` to attach the adapter to an OpenClaw host API implementation.
