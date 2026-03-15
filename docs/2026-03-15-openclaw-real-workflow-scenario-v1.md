# OpenClaw Real Workflow Scenario V1

Date: 2026-03-15  
Package: `@aionis/openclaw-adapter`

## Goal

This scenario is the **second layer** of evidence.

It is not meant to replace benchmark-grade slices.

It exists to answer a different question:

**Does the product still show a clear difference when used in a more realistic way: one high-level task, multiple agents, longer workflow, and fewer artificial benchmark constraints?**

This scenario should be:

1. closer to how a real user would actually use OpenClaw
2. still grounded enough to compare `without adapter` vs `with adapter`
3. structured enough that completion and quality can be judged without hand-waving

## Official Sources Used

This scenario is based on official OpenClaw workflow shapes and real repository problems.

Official workflow references:

1. [Sub-Agents](https://docs.openclaw.ai/tools/subagents)
2. [Agent Loop](https://docs.openclaw.ai/concepts/agent-loop)
3. [Tool-loop detection](https://docs.openclaw.ai/tools/loop-detection)
4. [Lobster](https://docs.openclaw.ai/tools/lobster)

Real repo/task anchors:

1. [openclaw/openclaw#10864](https://github.com/openclaw/openclaw/issues/10864)
2. local dashboard auth drift anchors already used in current benchmark evidence:
   - `docs/web/dashboard.md`
   - `docs/gateway/troubleshooting.md`
   - `ui/src/ui/gateway.ts`

## Candidate Scenarios

### Candidate A: Dashboard Auth Drift Incident-to-Patch Workflow

High-level prompt:

> Investigate the dashboard auth drift issue after restart or token rotation, isolate the most likely browser auth boundary, prepare the smallest safe patch direction, define focused validation, and leave a reviewer-ready summary with rollback notes.

Why it is strong:

1. very close to a real maintainer/operator workflow
2. spans docs, troubleshooting, UI code, and review output
3. naturally creates rediscovery pressure across agents
4. can be judged by output quality, not only by raw completion

Risk:

1. no single public GitHub issue anchor as clean as `#10864`
2. some evaluation still relies on local repo anchors rather than a public issue thread

### Candidate B: Issue #10864 Incident-to-Patch Workflow

High-level prompt:

> Investigate why orphan `openclaw-completion` processes accumulate, identify the most likely lifecycle boundary, prepare the smallest viable fix or guard, define focused validation, and leave a reviewer-ready verdict with operator impact notes.

Why it is strong:

1. clean public GitHub issue anchor
2. already proven as a strong one-prompt multi-agent completion slice
3. clearly benefits from continuity and compact execution state

Risk:

1. more runtime-internal than typical end-user maintenance work
2. can drift toward analysis-heavy behavior rather than truly product-like workflow output

### Candidate C: Lobster-Gated Workflow Build

High-level prompt:

> Build a reviewer-ready Lobster workflow for a repetitive OpenClaw maintenance task, wire approvals, validate the pipeline shape, and leave a safe execution handoff.

Why it is interesting:

1. very real product workflow
2. ties into an official OpenClaw deterministic workflow mechanism
3. good for later cross-surface product storytelling

Why it is not the best V1:

1. Lobster deliberately reduces orchestration burden itself
2. that can hide the specific delta created by Aionis
3. it is better as a later integration scenario, not the first second-layer proof

## Recommendation

Use **Candidate A** as the primary real workflow scenario.

Use **Candidate B** as the fallback scenario if we need a cleaner public issue anchor.

### Why Candidate A is the right V1

It is the best compromise between:

1. realistic maintainer workflow
2. strong cross-agent continuity pressure
3. bounded execution surface
4. reviewer-ready output shape

It is closer to what a real user or maintainer would actually ask:

- investigate
- patch
- validate
- summarize
- leave rollback guidance

That makes it a better **product-validating scenario** than a narrower benchmark slice.

## Recommended V1 Scenario

### Specific Task

The concrete V1 task should be:

> Investigate the Control UI dashboard auth drift after restart or token rotation, identify the most likely auth boundary causing `AUTH_TOKEN_MISMATCH` or unauthorized behavior, prepare the smallest safe remediation direction, define focused validation, and leave a reviewer-ready summary with rollback notes.

This is the task I recommend using.

## Workflow Shape

This should be run as a **single top-level prompt** with a real multi-agent workflow behind it.

### Agents

Use four roles:

1. `orchestrator`
2. `triage`
3. `patch`
4. `review`

### Role responsibilities

#### 1. orchestrator

Responsible for:

- receiving the single high-level user task
- spawning sub-agents
- collecting outputs
- deciding whether the package is reviewer-ready

#### 2. triage

Responsible for:

- finding the likely boundary
- narrowing the affected files
- producing the shortest credible issue hypothesis

#### 3. patch

Responsible for:

- proposing the smallest safe remediation direction
- mapping the exact code surface
- avoiding broad rediscovery

#### 4. review

Responsible for:

- checking consistency across hypothesis, remediation, validation, and rollback notes
- producing the reviewer-ready verdict

## A/B Shape

### Baseline

Run the same workflow with:

- OpenClaw native multi-agent behavior
- normal sub-agent/session behavior
- no Aionis adapter

### Treatment

Run the same workflow with:

- `@aionis/openclaw-adapter` enabled
- same model
- same repo
- same tools
- same timeout budget
- same agent roles

### Important fairness rule

Do **not** weaken baseline artificially.

Baseline should keep:

- normal OpenClaw multi-agent runtime behavior
- normal sub-agent sessions
- normal transcript-based continuity

Treatment should add:

- `context/assemble`
- structured handoff continuity
- tool-path shaping
- replay/handoff escape where applicable

That keeps the scenario realistic.

## Inputs And Outputs

### Input

One user prompt only.

No stage-by-stage prompting.

No manual operator steering during the run unless the scenario explicitly requires approval.

### Required final output packet

A run counts as complete only if it produces all of:

1. issue hypothesis
2. target file set
3. smallest safe remediation direction
4. focused validation plan
5. rollback notes
6. reviewer-ready verdict

This is important.

The scenario is not just:

- “did the model say something plausible?”

It is:

- “did the workflow produce a coherent reviewer-ready work package?”

## Metrics

This scenario should be judged by workflow usefulness first, not by token cost alone.

### Primary metrics

1. `reviewer_ready_rate`
2. `workflow_completed_rate`
3. `wall_clock_ms`
4. `total_tokens`
5. `tokens_per_reviewer_ready_run`

### Secondary metrics

1. `broad_tool_call_count`
2. `subagent_count`
3. `handoff_store_count`
4. `context_assemble_count`
5. `tool_feedback_count`
6. `repeated_file_rediscovery_count`

### Interpretation rule

This scenario is successful if treatment shows:

1. higher `reviewer_ready_rate`
2. or higher `workflow_completed_rate`
3. without relying on obvious over-exploration

Token savings are useful, but not the primary success condition here.

## Why This Scenario Should Pull Aionis Apart From Baseline

This workflow has the right failure pressure:

1. multiple isolated agents
2. cross-file investigation
3. partial findings that must survive handoff
4. a final reviewer-quality deliverable

That is exactly where Aionis should matter:

- compact execution continuity
- reduced rediscovery
- more stable tool path selection
- cleaner multi-agent handoff

## What This Scenario Can Prove

If it works, this scenario can support a product claim like:

**Aionis improves reviewer-ready completion and continuity in realistic multi-agent OpenClaw maintenance workflows.**

That is the right second-layer claim.

## What It Should Not Claim

This scenario should not be used to claim:

1. universal token reduction
2. universal benefit on every multi-agent workflow
3. planner-internal reasoning control

## Recommended Next Step

Implement this scenario first:

1. one top-level prompt
2. four-agent workflow
3. dashboard auth drift task
4. reviewer-ready output contract
5. repeated `baseline` vs `treatment`

If that stabilizes, then add the `#10864` incident-to-patch workflow as the second real workflow scenario.
