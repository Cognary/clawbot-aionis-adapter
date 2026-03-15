# OpenClaw Real-Workflow Launchd Setup

Date: 2026-03-15  
Package: `@aionis/openclaw-adapter`

## Purpose

This document turns the controlled nightly validation entrypoint into an actual local scheduler on macOS.

Use this when:

1. Aionis Lite runs locally
2. model keys are already present in your local shell environment
3. you want the strongest real-workflow slice to run automatically each night

## Files

- Launchd template:
  - [com.aionis.openclaw-real-workflow-nightly.plist](/Users/lucio/Desktop/clawbot-aionis-adapter/examples/launchd/com.aionis.openclaw-real-workflow-nightly.plist)
- Validation entrypoint:
  - [real-workflow-nightly-validation.sh](/Users/lucio/Desktop/clawbot-aionis-adapter/scripts/real-workflow-nightly-validation.sh)

## Install

```bash
mkdir -p ~/Library/LaunchAgents
REPO_ROOT=/ABSOLUTE/PATH/TO/clawbot-aionis-adapter
sed "s#/ABSOLUTE/PATH/TO/clawbot-aionis-adapter#${REPO_ROOT}#g" \
  "$REPO_ROOT/examples/launchd/com.aionis.openclaw-real-workflow-nightly.plist" \
  > ~/Library/LaunchAgents/com.aionis.openclaw-real-workflow-nightly.plist
launchctl unload ~/Library/LaunchAgents/com.aionis.openclaw-real-workflow-nightly.plist 2>/dev/null || true
launchctl load ~/Library/LaunchAgents/com.aionis.openclaw-real-workflow-nightly.plist
```

## Run Once Immediately

```bash
launchctl kickstart -k gui/$(id -u)/com.aionis.openclaw-real-workflow-nightly
```

## Check Status

```bash
launchctl list | rg openclaw-real-workflow-nightly
tail -n 100 /Users/lucio/Desktop/clawbot-aionis-adapter/artifacts/openclaw-real-workflow-nightly.stdout.log
tail -n 100 /Users/lucio/Desktop/clawbot-aionis-adapter/artifacts/openclaw-real-workflow-nightly.stderr.log
```

## Notes

1. The template schedules the run daily at `02:00`.
2. It uses the strongest current slice:
   - `glm_dashboard_auth_drift_reviewer_ready_workflow`
3. It keeps the same bounded runtime settings used by the controlled nightly entrypoint.
4. If your model key is not available to launchd, the run will fail before benchmark execution. In that case, add the required key to the launch environment or wrap the script with your preferred secret-loading path.
5. Replace `REPO_ROOT` with the actual checkout path before loading the agent.
