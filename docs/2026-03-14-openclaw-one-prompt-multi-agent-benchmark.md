# OpenClaw One-Prompt Multi-Agent Benchmark

Date: 2026-03-14  
Package: `@aionis/openclaw-adapter`

## Why This Benchmark Exists

The earlier structured multi-agent benchmark was not good enough.

It did not pull baseline and treatment far enough apart to support a product claim.

This benchmark fixes that by using a more realistic workflow shape:

1. a single high-level task prompt
2. a chained multi-agent workflow
3. weak baseline carryover
4. Aionis-backed handoff and context continuity in treatment

This makes the comparison sensitive to what Aionis is actually good at:

- continuity across agents
- suppressing broad rediscovery
- preserving execution state across tight stage budgets

## Workflow Shape

Each run uses four agents:

1. `scout`
2. `fixer`
3. `validator`
4. `reviewer`

The agents receive one top-level task and must carry the workflow forward with limited local budget.

The two benchmark arms are:

1. `baseline`
   - weak text carryover only
2. `treatment`
   - `handoff/store`
   - `context/assemble`
   - tool selection shaping through the adapter

## Real Task 1: Issue #10864

Task anchor:

- `openclaw/openclaw#10864`
- orphan `openclaw-completion` process accumulation

Question being tested:

- can a one-prompt multi-agent workflow complete a credible triage / fix / validation / review path without Aionis continuity?

Evidence:

- [Issue #10864 summary](../evidence/openclaw-one-prompt-multi-agent-benchmark/20260314115524/summary.json)
- [Issue #10864 cases](../evidence/openclaw-one-prompt-multi-agent-benchmark/20260314115524/cases.jsonl)

Result:

- baseline `completed_rate = 0`
- treatment `completed_rate = 1`
- baseline `avg_total_tokens = 2979.67`
- treatment `avg_total_tokens = 7254.33`

Interpretation:

- this is a **completion uplift** result
- it is **not** a token win result
- treatment spends more tokens because it completes the workflow instead of failing early

## Real Task 2: Dashboard Auth Drift

Task anchor:

- real Control UI / gateway auth drift problem
- centered on `AUTH_TOKEN_MISMATCH` / unauthorized behavior after restart or token rotation
- boundary confirmed in:
  - `docs/web/dashboard.md`
  - `docs/gateway/troubleshooting.md`
  - `ui/src/ui/gateway.ts`
  - changelog entry from contributor PR `#37382`

Question being tested:

- can a one-prompt multi-agent workflow isolate the browser auth boundary, propose a minimal remediation, define focused validation, and review the result under tight stage budgets?

Evidence:

- [Dashboard auth drift summary](../evidence/openclaw-one-prompt-multi-agent-benchmark/20260314125034/summary.json)
- [Dashboard auth drift cases](../evidence/openclaw-one-prompt-multi-agent-benchmark/20260314125034/cases.jsonl)

Result:

- baseline `completed_rate = 0`
- treatment `completed_rate = 1`
- baseline `avg_total_tokens = 4044`
- treatment `avg_total_tokens = 7480.67`

Interpretation:

- this is again a **completion uplift** result
- treatment is more expensive because it actually completes the multi-agent workflow
- treatment also suppresses broad tool usage:
  - baseline `avg_broad_tool_call_count = 1`
  - treatment `avg_broad_tool_call_count = 0`

## What This Benchmark Proves

The current one-prompt multi-agent evidence supports this claim:

**Aionis improves completion and continuity in realistic one-prompt multi-agent OpenClaw workflows when the workflow depends on strong handoff and compact execution state.**

That is a useful claim.

It is also narrower than saying:

- Aionis universally lowers multi-agent token burn
- Aionis solves all multi-agent failure modes

## What It Does Not Prove

This benchmark does **not** prove:

1. universal token reduction on multi-agent workflows
2. planner-internal reasoning control
3. universal benefit across all one-prompt task shapes

The correct public framing is:

- **completion and continuity win**
- not:
- **token win**
