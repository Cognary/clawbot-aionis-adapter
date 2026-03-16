# Changelog

## 0.1.2

Release-surface alignment for the current execution-continuity line.

Included:

1. split OpenClaw config guidance into minimal and advanced examples
2. clarified that threshold knobs are advanced controls, not first-install requirements
3. aligned the published adapter surface with the current Phase 2 install baseline

## 0.1.1

Manifest and install-surface alignment release.

Included:

1. plugin id unified to `openclaw-adapter`
2. OpenClaw config examples updated to use `plugins.allow` and `plugins.entries.openclaw-adapter`
3. install/verify docs updated to match the npm package and plugin id actually intended for users
4. local install smoke verified against the packed tarball with no manifest/package name mismatch warning

## 0.1.0

Initial standalone adapter release surface.

Included:

1. real OpenClaw plugin entry and manifest
2. Aionis HTTP client for context, policy, replay, feedback, evidence, and handoff endpoints
3. tool-loop control adapter with policy gating, no-progress tracking, replay dispatch, and handoff fallback
4. load smoke, activity probe, live-task benchmark, token benchmark, completion benchmark, and runtime-backed Google benchmark
5. install and configuration examples for OpenClaw local-agent use
