#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function usage() {
  console.error("Usage: node scripts/real-workflow-nightly-report.mjs <summary.json>");
  process.exit(1);
}

const summaryPath = process.argv[2];

if (!summaryPath) {
  usage();
}

const absoluteSummaryPath = path.resolve(summaryPath);

if (!fs.existsSync(absoluteSummaryPath)) {
  console.error(`summary.json not found: ${absoluteSummaryPath}`);
  process.exit(1);
}

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const nightlyDir = path.join(rootDir, "artifacts", "openclaw-real-workflow-nightly");
const latestJsonPath = path.join(nightlyDir, "latest.json");
const latestMdPath = path.join(nightlyDir, "latest.md");
const historyJsonlPath = path.join(nightlyDir, "history.jsonl");

fs.mkdirSync(nightlyDir, { recursive: true });

const summary = JSON.parse(fs.readFileSync(absoluteSummaryPath, "utf8"));
const artifactDir = path.dirname(absoluteSummaryPath);
const generatedAt = new Date().toISOString();

const baseline = summary.baseline ?? {};
const treatment = summary.treatment ?? {};
const delta = summary.delta ?? {};

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function round(value) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
}

function inferScenarioId() {
  if (process.env.BENCH_SCENARIO_ID) {
    return process.env.BENCH_SCENARIO_ID;
  }

  const entries = fs.existsSync(artifactDir) ? fs.readdirSync(artifactDir) : [];
  const runDir = entries.find(
    (entry) => entry.includes("-baseline-") || entry.includes("-treatment-"),
  );

  if (!runDir) {
    return null;
  }

  return runDir
    .replace(/-baseline-r\d+$/, "")
    .replace(/-treatment-r\d+$/, "");
}

const record = {
  generated_at: generatedAt,
  source_summary_path: absoluteSummaryPath,
  artifact_dir: artifactDir,
  benchmark: summary.benchmark ?? null,
  scenario_id: inferScenarioId(),
  continuity_mode: summary.continuity_mode ?? null,
  arm_selection: summary.arm_selection ?? null,
  provider: summary.provider ?? null,
  model: summary.model ?? null,
  repetitions: numberOrNull(summary.repetitions),
  baseline: {
    reviewer_ready_rate: round(baseline.reviewer_ready_rate),
    workflow_completed_rate: round(baseline.workflow_completed_rate),
    avg_total_tokens: round(baseline.avg_total_tokens),
    avg_wall_clock_ms: round(baseline.avg_wall_clock_ms),
    avg_tool_call_count: round(baseline.avg_tool_call_count),
    avg_broad_tool_call_count: round(baseline.avg_broad_tool_call_count),
    avg_rediscovery_reads: round(baseline.avg_rediscovery_reads),
    tokens_per_reviewer_ready_run: round(baseline.tokens_per_reviewer_ready_run),
  },
  treatment: {
    reviewer_ready_rate: round(treatment.reviewer_ready_rate),
    workflow_completed_rate: round(treatment.workflow_completed_rate),
    avg_total_tokens: round(treatment.avg_total_tokens),
    avg_wall_clock_ms: round(treatment.avg_wall_clock_ms),
    avg_tool_call_count: round(treatment.avg_tool_call_count),
    avg_broad_tool_call_count: round(treatment.avg_broad_tool_call_count),
    avg_rediscovery_reads: round(treatment.avg_rediscovery_reads),
    avg_handoff_store_count: round(treatment.avg_handoff_store_count),
    avg_context_assemble_count: round(treatment.avg_context_assemble_count),
    tokens_per_reviewer_ready_run: round(treatment.tokens_per_reviewer_ready_run),
  },
  delta: {
    reviewer_ready_gain: round(delta.reviewer_ready_gain),
    workflow_completion_gain: round(delta.workflow_completion_gain),
    avg_token_delta: round(delta.avg_token_delta),
    avg_rediscovery_delta: round(delta.avg_rediscovery_delta),
  },
};

record.regression_signals = {
  reviewer_ready_regressed:
    record.treatment.reviewer_ready_rate !== null &&
    record.baseline.reviewer_ready_rate !== null &&
    record.treatment.reviewer_ready_rate < record.baseline.reviewer_ready_rate,
  workflow_completed_regressed:
    record.treatment.workflow_completed_rate !== null &&
    record.baseline.workflow_completed_rate !== null &&
    record.treatment.workflow_completed_rate < record.baseline.workflow_completed_rate,
  token_worse:
    record.delta.avg_token_delta !== null && record.delta.avg_token_delta > 0,
  wall_clock_worse:
    record.treatment.avg_wall_clock_ms !== null &&
    record.baseline.avg_wall_clock_ms !== null &&
    record.treatment.avg_wall_clock_ms > record.baseline.avg_wall_clock_ms,
};

let history = [];
if (fs.existsSync(historyJsonlPath)) {
  history = fs
    .readFileSync(historyJsonlPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

const existingIndex = history.findIndex(
  (entry) => entry.source_summary_path === record.source_summary_path,
);

if (existingIndex >= 0) {
  history[existingIndex] = record;
} else {
  history.push(record);
}

fs.writeFileSync(
  historyJsonlPath,
  `${history.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
);

history.sort((a, b) => String(a.generated_at).localeCompare(String(b.generated_at)));

const latestFive = history.slice(-5).map((entry) => ({
  generated_at: entry.generated_at,
  scenario_id: entry.scenario_id,
  reviewer_ready_gain: entry.delta?.reviewer_ready_gain ?? null,
  avg_token_delta: entry.delta?.avg_token_delta ?? null,
  baseline_reviewer_ready_rate: entry.baseline?.reviewer_ready_rate ?? null,
  treatment_reviewer_ready_rate: entry.treatment?.reviewer_ready_rate ?? null,
}));

const latestPayload = {
  latest: record,
  trend_window: {
    total_runs_recorded: history.length,
    latest_five_runs: latestFive,
  },
};

fs.writeFileSync(latestJsonPath, `${JSON.stringify(latestPayload, null, 2)}\n`);

const latestMd = `# Real Workflow Nightly Latest

- generated_at: \`${record.generated_at}\`
- scenario_id: \`${record.scenario_id}\`
- source_summary_path: \`${record.source_summary_path}\`

## Latest

| arm | reviewer_ready_rate | workflow_completed_rate | avg_total_tokens | avg_wall_clock_ms |
| --- | ---: | ---: | ---: | ---: |
| baseline | ${record.baseline.reviewer_ready_rate ?? "n/a"} | ${record.baseline.workflow_completed_rate ?? "n/a"} | ${record.baseline.avg_total_tokens ?? "n/a"} | ${record.baseline.avg_wall_clock_ms ?? "n/a"} |
| treatment | ${record.treatment.reviewer_ready_rate ?? "n/a"} | ${record.treatment.workflow_completed_rate ?? "n/a"} | ${record.treatment.avg_total_tokens ?? "n/a"} | ${record.treatment.avg_wall_clock_ms ?? "n/a"} |

## Delta

- reviewer_ready_gain: ${record.delta.reviewer_ready_gain ?? "n/a"}
- workflow_completion_gain: ${record.delta.workflow_completion_gain ?? "n/a"}
- avg_token_delta: ${record.delta.avg_token_delta ?? "n/a"}
- avg_rediscovery_delta: ${record.delta.avg_rediscovery_delta ?? "n/a"}

## Regression Signals

- reviewer_ready_regressed: ${record.regression_signals.reviewer_ready_regressed}
- workflow_completed_regressed: ${record.regression_signals.workflow_completed_regressed}
- token_worse: ${record.regression_signals.token_worse}
- wall_clock_worse: ${record.regression_signals.wall_clock_worse}

## Latest Five Runs

${latestFive
  .map(
    (entry) =>
      `- ${entry.generated_at}: \`${entry.scenario_id}\` reviewer_ready_gain=${entry.reviewer_ready_gain ?? "n/a"} avg_token_delta=${entry.avg_token_delta ?? "n/a"} baseline=${entry.baseline_reviewer_ready_rate ?? "n/a"} treatment=${entry.treatment_reviewer_ready_rate ?? "n/a"}`,
  )
  .join("\n")}
`;

fs.writeFileSync(latestMdPath, latestMd);

console.log(JSON.stringify({
  latest_json: latestJsonPath,
  latest_md: latestMdPath,
  history_jsonl: historyJsonlPath,
  recorded: existingIndex < 0,
  replaced: existingIndex >= 0,
}, null, 2));
