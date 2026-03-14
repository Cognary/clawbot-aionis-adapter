# Install and Config Guide

Date: 2026-03-14  
Package: `@aionis/openclaw-adapter`

## What You Are Setting Up

This guide connects three things into one working path:

1. **Aionis Lite** as the execution-control backend
2. **OpenClaw** as the agent runtime
3. **`@aionis/openclaw-adapter`** as the control layer between them

The goal is not just to load another plugin. The goal is to make OpenClaw runs behave with:

- externalized execution context
- pre-tool policy gating
- replay dispatch when work is reusable
- handoff fallback when work should stop cleanly instead of degrading

## Before You Start

You need:

1. `openclaw` already installed and working
2. a model/provider that OpenClaw can already call successfully
3. local shell access to run `npx` and `openclaw`

## Step 1: Start Aionis Lite

```bash
npx @aionis/sdk@0.2.19 dev
npx @aionis/sdk@0.2.19 health
```

Expected base URL:

- `http://127.0.0.1:3321`

If you want a deeper check before wiring OpenClaw to it:

```bash
npx @aionis/sdk@0.2.19 doctor
npx @aionis/sdk@0.2.19 selfcheck
```

## Step 2: Install the Adapter into OpenClaw

```bash
openclaw plugins install @aionis/openclaw-adapter
```

Then verify OpenClaw sees the installed adapter:

```bash
openclaw plugins list --json
openclaw plugins info openclaw-adapter --json
```

What you should confirm:

1. plugin id is `openclaw-adapter`
2. plugin status is `loaded`
3. plugin version matches the npm release you installed

## Step 3: Add the Adapter Config

Reference example:

- [examples/openclaw.json](../examples/openclaw.json)

Minimal configuration:

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

What these switches mean in practice:

- `strictToolBlocking`: block obviously bad tool paths instead of only warning
- `replayDispatchEnabled`: allow reusable work to escape into replay
- `handoffFallbackEnabled`: preserve a structured continuation point when the right move is to stop

## Step 4: Run a First Controlled Turn

```bash
openclaw agent --local --message "Inspect the task, avoid broad scans, and proceed carefully." --json
```

With the adapter enabled, OpenClaw can now ask Aionis for:

1. run-start context
2. tool policy before execution
3. feedback/evidence persistence after execution
4. replay or handoff decisions when the run degrades

## Step 5: Verify the Integration

Core checks:

```bash
npm run test
npm run smoke:openclaw-load
npm run smoke:adapter-activity
```

What these checks prove:

1. the adapter package builds and passes unit coverage
2. OpenClaw can install and discover the adapter
3. the adapter is active in a real `openclaw agent --local` turn, not just in a synthetic harness

## Recommended Operating Model

For first deployments, keep the setup narrow:

1. use project-scoped execution context
2. keep `strictToolBlocking` enabled
3. keep replay and handoff enabled together
4. start with a provider/model pair you already know works in OpenClaw before you benchmark more aggressive scenarios

## What This Guide Covers

This guide covers:

1. local Aionis Lite startup
2. npm-based adapter install
3. minimal OpenClaw config
4. first-turn validation

This guide does not cover:

1. hosted Aionis deployment
2. provider-specific model tuning inside OpenClaw
3. benchmark interpretation and evidence review

For that, use:

- [README](../README.md)
- [Benchmark Evidence Overview](2026-03-14-benchmark-evidence-overview.md)
- [Benchmark Summary](2026-03-14-openclaw-aionis-benchmark-summary.md)
