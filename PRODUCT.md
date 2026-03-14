# Aionis OpenClaw Adapter

`openclaw-adapter` turns OpenClaw from an unconstrained tool loop into a more controlled execution system.

The product thesis is simple:

**OpenClaw is strongest when generation is paired with explicit execution control.**

Aionis provides that control layer.

## Product Promise

This adapter helps OpenClaw do less of the wrong work.

In practice that means:

- fewer repeated tool calls
- fewer broad scans when focused work is enough
- fewer broad test runs when targeted validation is available
- fewer no-progress loops that keep burning tokens
- better escape paths when a run should replay or hand off instead of degrading further

## Why Aionis Is the Right Layer

Aionis is not being used here as a generic memory add-on.

It is being used for the parts of agent execution that matter most once a task becomes expensive:

1. **context assembly**
   - give the run a compact execution state at the start
2. **policy gating**
   - constrain bad tool decisions before they execute
3. **feedback and evidence persistence**
   - keep real execution history available after each tool call
4. **replay dispatch**
   - reuse known paths instead of re-deriving them
5. **handoff fallback**
   - preserve a continuation point instead of dropping state when a run should stop

## Product Boundary

This package owns:

1. OpenClaw hook binding
2. adapter state and loop heuristics
3. orchestration of Aionis calls around OpenClaw tool execution
4. replay/handoff decision paths at the tool-loop boundary

This package does not own:

1. OpenClaw planner internals
2. Aionis runtime bootstrap itself
3. a claim to control planner-internal reasoning that never emits a tool call

## Practical Positioning

Use this adapter when you want OpenClaw to behave more like an execution system and less like an unbounded ReAct loop.

Do not position it as:

- a generic plugin marketplace add-on
- a generic memory product
- a planner-replacement layer

Position it as:

- **execution control for OpenClaw**
- **policy + replay + handoff around tool use**
- **the layer that reduces churn, reduces wasted tokens, and improves completion on the benchmarked slices**

## Evidence Standard

The product claim is not speculative. Current evidence already supports:

1. tool-loop churn reduction
2. token reduction on benchmarked slices
3. completion uplift on current benchmark slices
4. real OpenClaw runtime activity

Supporting material:

- [README](README.md)
- [Benchmark Evidence Overview](docs/2026-03-14-benchmark-evidence-overview.md)
- [Benchmark Summary](docs/2026-03-14-openclaw-aionis-benchmark-summary.md)
