# OpenClaw Loader-Backed Semi-Live Token Benchmark

Date: 2026-03-14  
Repo: `@aionis/openclaw-aionis-adapter`

## Goal

Measure token burn reduction on a benchmark path that first goes through real OpenClaw plugin install and discovery.

This benchmark does **not** claim full live gateway execution.  
It does claim a stronger setup than direct local module import:

1. install the adapter through `openclaw plugins install --link`
2. discover the installed plugin through `openclaw plugins info`
3. execute the semi-live benchmark against the installed plugin source path

## Artifact

- `/Volumes/ziel/openclaw-aionis-adapter/artifacts/openclaw-loader-backed-semi-live-token-benchmark/20260314073214/summary.json`
- `/Volumes/ziel/openclaw-aionis-adapter/artifacts/openclaw-loader-backed-semi-live-token-benchmark/summary.json`

## Result

- baseline
  - `avg_total_tokens = 1836`
  - `avg_executed_steps = 5.75`
  - `completed_rate = 0.25`
  - `controlled_stop_rate = 0`
- treatment
  - `avg_total_tokens = 968.25`
  - `avg_executed_steps = 2.25`
  - `completed_rate = 0.25`
  - `controlled_stop_rate = 0.25`
  - `replay_dispatch_rate = 0.25`
  - `handoff_store_rate = 0.5`
  - `avg_broad_tool_calls = 0`

## What this proves

1. The token reduction result survives a more realistic OpenClaw plugin install/discovery path.
2. The adapter still reduces broad-tool churn and step count when it is executed from the installed plugin source path.
3. The current semi-live token evidence is not limited to direct local `dist/plugin.js` import.

## What this does not prove

1. Full live gateway task execution through the whole OpenClaw runtime.
2. Planner-internal reasoning control.
3. Universal effect across all providers or models.
