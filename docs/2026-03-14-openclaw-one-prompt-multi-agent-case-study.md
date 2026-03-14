# OpenClaw One-Prompt Multi-Agent Case Study

Date: 2026-03-14  
Package: `@aionis/openclaw-adapter`

## The Question

Can Aionis make a real difference on a more realistic OpenClaw workflow shape:

1. one high-level task prompt
2. multiple agents
3. weak baseline carryover
4. tight stage budgets

That is the shape where ordinary runtime-native carryover often starts to fail.

It is also the shape where Aionis should matter most:

- structured handoff
- compact context continuity
- better tool-path selection under budget

## Benchmark Shape

Each run uses the same four-agent workflow:

1. `scout`
2. `fixer`
3. `validator`
4. `reviewer`

The difference is:

1. `baseline`
   - weak text carryover only
2. `treatment`
   - `handoff/store`
   - `context/assemble`
   - tool selection shaping through the adapter

The benchmark is deliberately framed as a **completion and continuity** test.

It is **not** a token-saving benchmark.

## Strong Slice 1: Issue #10864

Task:

- investigate orphan `openclaw-completion` processes
- isolate the cleanup boundary
- propose the smallest viable fix
- define focused validation
- return reviewer verdict

Evidence:

- [Summary](../evidence/openclaw-one-prompt-multi-agent-benchmark/20260314115524/summary.json)
- [Cases](../evidence/openclaw-one-prompt-multi-agent-benchmark/20260314115524/cases.jsonl)

Result over `3` repetitions:

- baseline `completed_rate = 0`
- treatment `completed_rate = 1`

What happened:

- baseline failed to carry enough execution state across the chained workflow
- treatment completed the full workflow every time
- treatment also eliminated broad-tool drift on this slice

## Strong Slice 2: Dashboard Auth Drift

Task:

- investigate Control UI `AUTH_TOKEN_MISMATCH` / unauthorized drift
- isolate the browser auth boundary
- propose the smallest viable remediation
- define focused validation
- return reviewer verdict

Evidence:

- [Summary](../evidence/openclaw-one-prompt-multi-agent-benchmark/20260314125034/summary.json)
- [Cases](../evidence/openclaw-one-prompt-multi-agent-benchmark/20260314125034/cases.jsonl)

Result over `3` repetitions:

- baseline `completed_rate = 0`
- treatment `completed_rate = 1`

What happened:

- baseline lost continuity under tight stage budgets
- treatment consistently carried the auth boundary, remediation, and validation path through all four agents
- treatment also suppressed broad-tool use on this slice

## Supporting Slice 3: Markdown Parser Crash Fallback

Task:

- investigate the markdown parser crash fallback around malformed recursive markdown
- isolate the rendering boundary
- propose the smallest viable fallback or guard
- define focused validation
- return reviewer verdict

Local result over `3` repetitions:

- baseline `completed_rate = 0.3333`
- treatment `completed_rate = 1`

Interpretation:

- this is a positive result
- but it is not as strong as the first two slices
- so it should be treated as supporting evidence, not headline evidence

The reason is straightforward:

- baseline succeeded once on this narrower UI task
- that still leaves a meaningful completion uplift
- but it does not support the same `0 -> 1` claim as the first two slices

## What This Case Study Supports

The current strongest multi-agent claim is:

**Aionis improves completion and continuity on realistic one-prompt OpenClaw workflows where success depends on preserving structured execution state across multiple agents.**

That claim is supported most strongly by:

1. issue `#10864`
2. dashboard auth drift

## What It Does Not Support

This case study does **not** support:

1. universal token reduction on one-prompt multi-agent workflows
2. universal completion uplift on every task shape
3. planner-internal reasoning control

The right public framing is still:

- **completion / continuity win**
- not:
- **token win**
