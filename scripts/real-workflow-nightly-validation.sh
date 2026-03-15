#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export BENCH_SCENARIO_ID="${BENCH_SCENARIO_ID:-glm_dashboard_auth_drift_reviewer_ready_workflow}"
export BENCH_REPEATS="${BENCH_REPEATS:-3}"
export BENCH_AGENT_TIMEOUT_MS="${BENCH_AGENT_TIMEOUT_MS:-120000}"
export BENCH_ARM_TIMEOUT_MS="${BENCH_ARM_TIMEOUT_MS:-420000}"
export BENCH_AIONIS_BASE_URL="${BENCH_AIONIS_BASE_URL:-http://127.0.0.1:3321}"

cd "$ROOT_DIR"

echo "Running controlled real-workflow validation"
echo "scenario=$BENCH_SCENARIO_ID"
echo "repeats=$BENCH_REPEATS"
echo "agent_timeout_ms=$BENCH_AGENT_TIMEOUT_MS"
echo "arm_timeout_ms=$BENCH_ARM_TIMEOUT_MS"
echo "aionis_base_url=$BENCH_AIONIS_BASE_URL"

npm run bench:real-workflow

LATEST_ARTIFACT="$(ls -1dt "$ROOT_DIR"/artifacts/openclaw-real-workflow-scenario/* | head -n 1)"
SUMMARY_PATH="$LATEST_ARTIFACT/summary.json"

if [[ -f "$SUMMARY_PATH" ]]; then
  echo
  echo "summary_path=$SUMMARY_PATH"
  cat "$SUMMARY_PATH"
else
  echo
  echo "No summary.json was produced. Check artifact directory:"
  echo "$LATEST_ARTIFACT"
  exit 1
fi
