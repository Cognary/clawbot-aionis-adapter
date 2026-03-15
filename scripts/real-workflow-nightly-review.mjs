#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function usage() {
  console.error("Usage: node scripts/real-workflow-nightly-review.mjs <latest.json>");
  process.exit(1);
}

const latestJsonPathArg = process.argv[2];

if (!latestJsonPathArg) {
  usage();
}

const latestJsonPath = path.resolve(latestJsonPathArg);

if (!fs.existsSync(latestJsonPath)) {
  console.error(`latest.json not found: ${latestJsonPath}`);
  process.exit(1);
}

const latestPayload = JSON.parse(fs.readFileSync(latestJsonPath, "utf8"));
const latest = latestPayload.latest ?? {};
const nightlyDir = path.dirname(latestJsonPath);
const reviewJsonPath = path.join(nightlyDir, "review.json");
const reviewMdPath = path.join(nightlyDir, "review.md");

function classifyStatus(record) {
  const regression = record.regression_signals ?? {};
  const delta = record.delta ?? {};

  if (regression.reviewer_ready_regressed || regression.workflow_completed_regressed) {
    return {
      status: "regress",
      reason: "completion_regressed",
      action: "triage before publishing or trusting this run",
    };
  }

  if ((delta.reviewer_ready_gain ?? 0) > 0 || (delta.workflow_completion_gain ?? 0) > 0) {
    return {
      status: "pass",
      reason: "completion_improved",
      action: "keep monitoring; this is a positive strongest-slice signal",
    };
  }

  if (regression.token_worse && regression.wall_clock_worse) {
    return {
      status: "watch",
      reason: "completion_flat_but_efficiency_worse",
      action: "review cost drift before treating this as healthy",
    };
  }

  if (regression.token_worse || regression.wall_clock_worse) {
    return {
      status: "watch",
      reason: "partial_efficiency_regression",
      action: "review efficiency drift and compare to recent history",
    };
  }

  return {
    status: "pass",
    reason: "no_regression_detected",
    action: "no immediate action required; continue scheduled validation",
  };
}

const decision = classifyStatus(latest);
const reviewPayload = {
  generated_at: new Date().toISOString(),
  source_latest_json: latestJsonPath,
  scenario_id: latest.scenario_id ?? null,
  status: decision.status,
  reason: decision.reason,
  action: decision.action,
  latest: {
    source_summary_path: latest.source_summary_path ?? null,
    baseline: latest.baseline ?? {},
    treatment: latest.treatment ?? {},
    delta: latest.delta ?? {},
    regression_signals: latest.regression_signals ?? {},
  },
  trend_window: latestPayload.trend_window ?? {},
};

fs.writeFileSync(reviewJsonPath, `${JSON.stringify(reviewPayload, null, 2)}\n`);

const reviewMd = `# Real Workflow Nightly Review

- generated_at: \`${reviewPayload.generated_at}\`
- scenario_id: \`${reviewPayload.scenario_id}\`
- status: \`${reviewPayload.status}\`
- reason: \`${reviewPayload.reason}\`
- action: ${reviewPayload.action}

## Latest Decision Inputs

| arm | reviewer_ready_rate | workflow_completed_rate | avg_total_tokens | avg_wall_clock_ms |
| --- | ---: | ---: | ---: | ---: |
| baseline | ${reviewPayload.latest.baseline.reviewer_ready_rate ?? "n/a"} | ${reviewPayload.latest.baseline.workflow_completed_rate ?? "n/a"} | ${reviewPayload.latest.baseline.avg_total_tokens ?? "n/a"} | ${reviewPayload.latest.baseline.avg_wall_clock_ms ?? "n/a"} |
| treatment | ${reviewPayload.latest.treatment.reviewer_ready_rate ?? "n/a"} | ${reviewPayload.latest.treatment.workflow_completed_rate ?? "n/a"} | ${reviewPayload.latest.treatment.avg_total_tokens ?? "n/a"} | ${reviewPayload.latest.treatment.avg_wall_clock_ms ?? "n/a"} |

## Delta

- reviewer_ready_gain: ${reviewPayload.latest.delta.reviewer_ready_gain ?? "n/a"}
- workflow_completion_gain: ${reviewPayload.latest.delta.workflow_completion_gain ?? "n/a"}
- avg_token_delta: ${reviewPayload.latest.delta.avg_token_delta ?? "n/a"}
- avg_rediscovery_delta: ${reviewPayload.latest.delta.avg_rediscovery_delta ?? "n/a"}

## Regression Flags

- reviewer_ready_regressed: ${reviewPayload.latest.regression_signals.reviewer_ready_regressed}
- workflow_completed_regressed: ${reviewPayload.latest.regression_signals.workflow_completed_regressed}
- token_worse: ${reviewPayload.latest.regression_signals.token_worse}
- wall_clock_worse: ${reviewPayload.latest.regression_signals.wall_clock_worse}
`;

fs.writeFileSync(reviewMdPath, reviewMd);

console.log(
  JSON.stringify(
    {
      review_json: reviewJsonPath,
      review_md: reviewMdPath,
      status: reviewPayload.status,
      reason: reviewPayload.reason,
    },
    null,
    2,
  ),
);
