# Aionis OpenClaw Adapter

**Bring execution control to OpenClaw.**

`@aionis/openclaw-adapter` connects OpenClaw to Aionis so agent runs stop acting like an unbounded ReAct loop and start behaving like a controlled execution system.

What Aionis adds on top of OpenClaw:

- **externalized context** so each run starts with the right task state instead of rediscovering it
- **policy gating** so broad search, broad test, and repeated no-progress tool paths get suppressed
- **replay dispatch** so repeatable work can escape into a known path instead of starting over
- **handoff fallback** so failed or interrupted runs preserve a usable continuation point
- **loop control** so tool churn, duplicate observations, and no-progress streaks get stopped before they burn more time and tokens

This is not a generic memory plugin. It is an **execution-control adapter** for OpenClaw.

## Why It Matters

OpenClaw is powerful, but on complex tasks it can still fail in predictable ways:

- too many repeated tool calls
- broad repo scans when a focused path would do
- broad test runs when a targeted validation is enough
- no-progress retry loops that keep burning tokens
- interrupted runs that lose the exact execution state needed to continue

Aionis changes that operating model.

Instead of letting each run improvise from scratch, the adapter gives OpenClaw:

1. a compact execution context at run start
2. a policy layer before expensive tool calls
3. feedback and evidence capture after each tool call
4. structured escape hatches through replay or handoff

## What Is Proven Today

Current benchmark evidence supports five concrete claims:

1. **Tool-loop churn goes down**
2. **Token burn goes down on benchmarked slices**
3. **Completion goes up on current replay, focused-repo, handoff-resume, and one-prompt multi-agent slices**
4. **Reviewer-ready completion goes up on the current realistic workflow scenario**
5. **The adapter is active on real OpenClaw runtime paths, not just mock harnesses**

Headline results:

- **Live-task A/B**: average executed steps dropped from `7.33` to `3`, and broad tool calls dropped from `1.33` to `0`
- **GLM-5 semi-live token benchmark**: average total tokens dropped from `1893` to `865.33`
- **Hard-stop / replay token slice**: average total tokens dropped from `1659` to `1267`, with `controlled_stop_rate = 1`
- **Completion benchmark**: baseline `completed_rate = 0`, treatment `completed_rate = 1` on the current benchmark slices
- **One-prompt multi-agent A/B**:
  - issue `#10864`: baseline `completed_rate = 0`, treatment `completed_rate = 1`
  - dashboard auth drift: baseline `completed_rate = 0`, treatment `completed_rate = 1`
  - markdown fallback: baseline `completed_rate = 0.3333`, treatment `completed_rate = 1` (`supporting slice`)
- **Repeated Google runtime-backed A/B**: baseline `completed_rate = 0`, treatment `completed_rate = 0.8`
- **Real workflow scenario v1**: baseline `reviewer_ready_rate = 0`, treatment `reviewer_ready_rate = 1`

Supporting docs:

- [Benchmark Evidence Overview](docs/2026-03-14-benchmark-evidence-overview.md)
- [Benchmark Summary](docs/2026-03-14-openclaw-aionis-benchmark-summary.md)
- [Completion Benchmark](docs/2026-03-14-openclaw-completion-benchmark.md)
- [One-Prompt Multi-Agent Benchmark](docs/2026-03-14-openclaw-one-prompt-multi-agent-benchmark.md)
- [One-Prompt Multi-Agent Case Study](docs/2026-03-14-openclaw-one-prompt-multi-agent-case-study.md)
- [Loader-Backed Semi-Live Token Benchmark](docs/2026-03-14-openclaw-loader-backed-semi-live-token-benchmark.md)
- [Google Runtime Benchmark](docs/2026-03-14-openclaw-google-runtime-benchmark.md)
- [Google Runtime Case Study](docs/2026-03-14-openclaw-google-runtime-case-study.md)
- [Real Workflow Scenario v1](docs/2026-03-15-openclaw-real-workflow-scenario-benchmark.md)

Public evidence files:

- [Evidence Index](evidence/README.md)
- [Live-task benchmark summary](evidence/openclaw-live-task-benchmark/20260314061733/summary.json)
- [GLM-5 semi-live token summary](evidence/openclaw-semi-live-token-benchmark/20260314064242/summary.json)
- [Hard-stop / replay token summary](evidence/openclaw-semi-live-token-benchmark/20260314070306/summary.json)
- [Completion benchmark summary](evidence/openclaw-completion-benchmark/20260314072335/summary.json)
- [One-prompt multi-agent summary: issue #10864](evidence/openclaw-one-prompt-multi-agent-benchmark/20260314115524/summary.json)
- [One-prompt multi-agent summary: dashboard auth drift](evidence/openclaw-one-prompt-multi-agent-benchmark/20260314125034/summary.json)
- [One-prompt multi-agent summary: markdown fallback](evidence/openclaw-one-prompt-multi-agent-benchmark/20260314130932/summary.json)
- [One-prompt multi-agent case study](docs/2026-03-14-openclaw-one-prompt-multi-agent-case-study.md)
- [Repeated Google runtime summary](evidence/openclaw-google-runtime-benchmark/20260314084010/summary.json)
- [Real workflow scenario summary](evidence/openclaw-real-workflow-scenario/20260314172725/summary.json)

## 5-Minute Quickstart

### 1. Start Aionis Lite

```bash
npx @aionis/sdk@0.2.19 dev
npx @aionis/sdk@0.2.19 health
```

Expected Aionis base URL:

- `http://127.0.0.1:3321`

### 2. Install the Adapter into OpenClaw

```bash
openclaw plugins install @aionis/openclaw-adapter
openclaw plugins info openclaw-adapter --json
```

You should see:

- plugin id: `openclaw-adapter`
- status: `loaded`

### 3. Add the Minimal OpenClaw Config

Reference example:

- [examples/openclaw.json](examples/openclaw.json)
- [Install and Config Guide](docs/2026-03-14-install-and-config.md)

```json
{
  "plugins": {
    "allow": ["openclaw-adapter"],
    "entries": {
      "openclaw-adapter": {
        "enabled": true,
        "config": {
          "baseUrl": "http://127.0.0.1:3321",
          "tenantId": "default",
          "actor": "openclaw",
          "scopeMode": "project",
          "strictToolBlocking": true,
          "replayDispatchEnabled": true,
          "handoffFallbackEnabled": true
        }
      }
    }
  }
}
```

### 4. Run a First Turn

```bash
openclaw agent --local --message "Inspect the task, avoid broad scans, and proceed carefully." --json
```

## How Aionis Changes an OpenClaw Run

### Before the run

Aionis assembles a compact execution context so the model starts from the right task state instead of re-reading the same surface area.

### Before a tool call

Aionis applies policy gating. This is where the adapter can suppress:

- repeated calls to the same tool
- broad repo search when a focused query is enough
- broad test runs when a targeted test is available
- obviously no-progress paths that should stop or reroute

### After a tool call

Aionis writes back:

- tool feedback
- evidence
- loop state updates

That lets later steps reason from actual execution history, not just the transient conversation buffer.

### When the run degrades

The adapter can escape through:

- **replay dispatch** when the task matches a reusable path
- **handoff** when the right behavior is to preserve a structured continuation point

## What This Product Is

This package gives you:

1. a reusable `AionisLoopControlAdapter`
2. an OpenClaw host binding
3. policy and loop heuristics for expensive tool paths
4. replay and handoff orchestration around OpenClaw runs

Current hook coverage:

1. `session_start`
2. `session_end`
3. `before_agent_start`
4. `before_tool_call`
5. `after_tool_call`
6. `agent_end`
7. `tool_result_persist`
8. `before_message_write`

## What It Does Not Claim

This adapter currently controls the **tool-loop boundary**.

It does **not** claim to:

- control planner-internal reasoning steps that never emit a tool call
- solve every OpenClaw failure mode
- guarantee token wins on every provider and every task shape

The current evidence is strong on:

- tool-loop control
- token reduction on benchmarked slices
- completion uplift on current benchmark slices, including one-prompt multi-agent workflows
- real OpenClaw runtime activity

## Verification and Benchmark Commands

Core checks:

1. `npm test`
2. `npm run smoke:openclaw-load`
3. `npm run smoke:adapter-activity`

Benchmarks:

1. `npm run bench:openclaw-ab`
2. `npm run bench:live-task`
3. `npm run bench:semi-live-token`
4. `npm run bench:loader-backed-semi-live-token`
5. `npm run bench:completion`
6. `npm run bench:google-runtime`
7. `npm run bench:google-runtime-ab`
8. `npm run bench:real-workflow`

## Repo Guide

- [Install and Config Guide](docs/2026-03-14-install-and-config.md)
- [Product Positioning](PRODUCT.md)
- [Changelog](CHANGELOG.md)
- [Benchmark Evidence Overview](docs/2026-03-14-benchmark-evidence-overview.md)
- [Benchmark Summary](docs/2026-03-14-openclaw-aionis-benchmark-summary.md)
- [One-Prompt Multi-Agent Benchmark](docs/2026-03-14-openclaw-one-prompt-multi-agent-benchmark.md)
- [One-Prompt Multi-Agent Case Study](docs/2026-03-14-openclaw-one-prompt-multi-agent-case-study.md)
- [Real Workflow Scenario v1](docs/2026-03-15-openclaw-real-workflow-scenario-benchmark.md)
