# Controlled Real-Workflow Nightly Validation

Date: 2026-03-15  
Package: `@aionis/openclaw-adapter`

## Purpose

This entrypoint exists to keep the strongest real-workflow validation reproducible without blocking an interactive session.

It is intentionally narrow:

1. one strongest scenario by default
2. fixed repeat count
3. fixed per-agent timeout
4. fixed per-arm timeout

The default target is:

- `glm_dashboard_auth_drift_reviewer_ready_workflow`

This is the highest-value real-workflow slice for ongoing regression detection because it is both realistic and already part of the published evidence family.

## Default Command

```bash
npm run bench:real-workflow-nightly
```

Default environment:

- `BENCH_SCENARIO_ID=glm_dashboard_auth_drift_reviewer_ready_workflow`
- `BENCH_REPEATS=3`
- `BENCH_AGENT_TIMEOUT_MS=120000`
- `BENCH_ARM_TIMEOUT_MS=420000`
- `BENCH_AIONIS_BASE_URL=http://127.0.0.1:3321`

The command still uses the current model/provider environment already present on the machine.

## Why This Exists

Repeated real-workflow validation is valuable, but it is too slow and too failure-prone to leave unconstrained in an interactive session.

The harness now has explicit upper bounds:

1. per-agent timeout
2. per-arm timeout

This keeps nightly validation useful for regression detection without allowing a single run to stall indefinitely.

## Fixed-Format Output

Each successful nightly run now also writes a fixed-format report bundle under:

- `artifacts/openclaw-real-workflow-nightly/latest.json`
- `artifacts/openclaw-real-workflow-nightly/latest.md`
- `artifacts/openclaw-real-workflow-nightly/history.jsonl`

The intent is simple:

1. `latest.json`
   - machine-readable latest nightly result
2. `latest.md`
   - human-readable one-page summary
3. `history.jsonl`
   - append-only trend log for later regression analysis

Current report fields include:

1. scenario id
2. source `summary.json` path
3. baseline/treatment reviewer-ready rate
4. baseline/treatment workflow completion rate
5. baseline/treatment token and wall-clock averages
6. deltas for reviewer-ready, completion, token, and rediscovery
7. simple regression flags

The history file is deduplicated by `source_summary_path`, so re-running the report step for the same artifact does not append duplicates.

## Correct Reading

This path is for:

1. local scheduled validation
2. post-change regression checks
3. repeatable strongest-slice monitoring

It is not a new publication family by itself.

If a run fails or times out, the output should be treated as an operational regression signal that needs triage before any evidence is published.
