# OpenClaw Aionis Adapter

`openclaw-aionis-adapter` is a standalone OpenClaw integration layer for Aionis.

It is a dedicated adapter that uses OpenClaw's host hook surface to add:

1. tool-loop control
2. policy gating
3. decision/feedback persistence
4. replay dispatch escape hatches
5. handoff fallback

## Product Boundary

This package owns:

1. OpenClaw hook binding
2. adapter state machine
3. loop heuristics
4. Aionis call orchestration

This package does not own:

1. Aionis runtime bootstrap
2. OpenClaw planner internals
3. generic memory-slot concerns

## Positioning

Use this package when you want OpenClaw to run with explicit execution control rather than uncontrolled ReAct-style tool looping.
