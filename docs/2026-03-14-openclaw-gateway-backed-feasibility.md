# OpenClaw Gateway-Backed Feasibility

Date: 2026-03-14  
Repo: `@aionis/openclaw-aionis-adapter`

## Goal

Verify that a real `openclaw agent --local` runtime path can be forced onto:

1. provider `zai`
2. model `glm-5`
3. a temporary benchmark profile

before claiming a full gateway-backed benchmark.

## Why this exists

The earlier blocker was provider selection. OpenClaw was resolving to Anthropic defaults.

That blocker is now gone.

The current runtime-backed blocker is different:

1. the embedded OpenClaw agent does reach `zai/glm-5`
2. but the live run currently ends in provider-side rate limiting before a useful tool-loop benchmark can complete

## Current artifact

- `evidence/openclaw-gateway-backed-feasibility/summary.json`
- `evidence/openclaw-gateway-backed-feasibility/20260314080716/summary.json`

## Current result

The feasibility smoke currently shows:

1. `provider = zai`
2. `model = glm-5`
3. `runtime_path_reached_model = true`
4. `outcome = rate_limited`

This is enough to support a narrower statement:

**The real OpenClaw local agent runtime can now be forced onto `zai/glm-5`, but current gateway-backed benchmarking is still blocked by provider-side rate limiting on this runtime path.**

## What this proves

1. the benchmark profile patch is working
2. OpenClaw is no longer silently falling back to Anthropic defaults
3. the next blocker is runtime/provider behavior, not model routing

## What this does not prove

1. that a full gateway-backed baseline vs treatment benchmark is complete
2. that the adapter improves token burn on the real runtime path
3. that the adapter is active on a successful live agent turn

## Next step

The next runtime-backed step should focus on one of:

1. reducing OpenClaw prompt surface further for this benchmark profile
2. retrying during a lower provider-load window
3. switching the runtime-backed proof from full comparison to a narrower installed-plugin activity probe
