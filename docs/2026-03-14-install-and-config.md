# Install and Config Guide

Date: 2026-03-14  
Repo: `@aionis/openclaw-adapter`

## Goal

Provide the minimum steps needed to install the adapter into OpenClaw and run it against a local Aionis service.

## Prerequisites

1. `openclaw` installed and working
2. a reachable Aionis runtime
   - example: `http://127.0.0.1:3321`
3. a model provider that OpenClaw can already use

## Start Aionis Lite

```bash
npx @aionis/sdk@0.2.19 dev
npx @aionis/sdk@0.2.19 health
```

## Install From npm

```bash
openclaw plugins install @aionis/openclaw-adapter
```

## Verify Load

```bash
openclaw plugins list --json
openclaw plugins info openclaw-aionis-adapter --json
```

Expected:

1. plugin id `openclaw-aionis-adapter` appears in the list
2. plugin source points at the installed package path

## Minimal OpenClaw Config

Reference file:

- `examples/openclaw.json`

Core shape:

```json
{
  "plugins": {
    "allow": ["openclaw-aionis-adapter"],
    "entries": {
      "openclaw-aionis-adapter": {
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

## Recommended First Run

```bash
openclaw agent --local --message "Inspect the task and proceed carefully." --json
```

## Recommended Verification

Run the adapter repo checks:

```bash
npm run test
npm run smoke:openclaw-load
npm run smoke:adapter-activity
```

## Boundary

This guide covers:

1. local install
2. local OpenClaw plugin registration
3. local Aionis runtime configuration

This guide does not cover:

1. npm package release flow
2. hosted Aionis deployment
3. provider-specific OpenClaw model troubleshooting
