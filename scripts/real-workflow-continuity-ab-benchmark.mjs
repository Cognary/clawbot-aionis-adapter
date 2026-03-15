import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFile = promisify(execFileCb);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODEL_PROVIDER = process.env.BENCH_MODEL_PROVIDER ?? ((process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENAI_API_KEY) ? 'gemini' : 'glm');
const REPEATS = Math.max(Number(process.env.BENCH_REPEATS ?? 3), 1);
const LIVE_AIONIS_BASE_URL = (process.env.BENCH_AIONIS_BASE_URL ?? '').trim();
const SCENARIOS = (process.env.BENCH_CONTINUITY_AB_SCENARIOS
  ?? 'glm_dashboard_auth_drift_reviewer_ready_workflow,glm_pairing_approval_recovery_reviewer_ready_workflow')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

if (!LIVE_AIONIS_BASE_URL) {
  console.error('Missing BENCH_AIONIS_BASE_URL');
  process.exit(1);
}

function nowStamp() {
  return new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

function mean(items, key) {
  return items.reduce((sum, item) => sum + Number(item[key] ?? 0), 0) / Math.max(items.length, 1);
}

function ratio(n, d) {
  return d > 0 ? n / d : 0;
}

async function runScenarioArm(scenarioId, continuityMode) {
  const env = {
    ...process.env,
    BENCH_SCENARIO_ID: scenarioId,
    BENCH_REPEATS: String(REPEATS),
    BENCH_AIONIS_BASE_URL: LIVE_AIONIS_BASE_URL,
    BENCH_MODEL_PROVIDER: MODEL_PROVIDER,
    BENCH_CONTINUITY_MODE: continuityMode,
    BENCH_ARM_SELECTION: 'treatment-only',
  };

  const { stdout } = await execFile('node', ['scripts/real-workflow-scenario-benchmark.mjs'], {
    cwd: ROOT,
    env,
    maxBuffer: 20 * 1024 * 1024,
  });
  const parsed = JSON.parse(stdout);
  const summaryPath = path.join(parsed.artifactDir, 'summary.json');
  const casesPath = path.join(parsed.artifactDir, 'cases.jsonl');
  const [summaryText, casesText] = await Promise.all([
    fs.readFile(summaryPath, 'utf8'),
    fs.readFile(casesPath, 'utf8'),
  ]);
  return {
    scenario_id: scenarioId,
    continuity_mode: continuityMode,
    artifact_dir: parsed.artifactDir,
    summary: JSON.parse(summaryText),
    cases: casesText.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)),
  };
}

function summarizeComparisons(rows) {
  const legacyRows = rows.filter((row) => row.continuity_mode === 'legacy');
  const packetRows = rows.filter((row) => row.continuity_mode === 'packet');
  const legacyTreatment = legacyRows.map((row) => row.summary.treatment);
  const packetTreatment = packetRows.map((row) => row.summary.treatment);
  const legacyReady = legacyTreatment.filter((row) => row.reviewer_ready_rate >= 1);
  const packetReady = packetTreatment.filter((row) => row.reviewer_ready_rate >= 1);

  return {
    benchmark: 'openclaw_real_workflow_continuity_ab_v1',
    provider: MODEL_PROVIDER,
    repeats: REPEATS,
    scenarios: SCENARIOS,
    arm_selection: 'treatment-only',
    legacy_continuity: {
      avg_reviewer_ready_rate: mean(legacyTreatment, 'reviewer_ready_rate'),
      avg_workflow_completed_rate: mean(legacyTreatment, 'workflow_completed_rate'),
      avg_total_tokens: mean(legacyTreatment, 'avg_total_tokens'),
      avg_wall_clock_ms: mean(legacyTreatment, 'avg_wall_clock_ms'),
      full_success_rate: ratio(legacyReady.length, legacyTreatment.length),
    },
    packet_continuity: {
      avg_reviewer_ready_rate: mean(packetTreatment, 'reviewer_ready_rate'),
      avg_workflow_completed_rate: mean(packetTreatment, 'workflow_completed_rate'),
      avg_total_tokens: mean(packetTreatment, 'avg_total_tokens'),
      avg_wall_clock_ms: mean(packetTreatment, 'avg_wall_clock_ms'),
      full_success_rate: ratio(packetReady.length, packetTreatment.length),
    },
    delta: {
      reviewer_ready_gain: mean(packetTreatment, 'reviewer_ready_rate') - mean(legacyTreatment, 'reviewer_ready_rate'),
      workflow_completion_gain: mean(packetTreatment, 'workflow_completed_rate') - mean(legacyTreatment, 'workflow_completed_rate'),
      avg_token_delta: mean(packetTreatment, 'avg_total_tokens') - mean(legacyTreatment, 'avg_total_tokens'),
      avg_wall_clock_delta_ms: mean(packetTreatment, 'avg_wall_clock_ms') - mean(legacyTreatment, 'avg_wall_clock_ms'),
    },
  };
}

async function main() {
  const artifactDir = path.join(ROOT, 'artifacts', 'openclaw-real-workflow-continuity-ab', nowStamp());
  await fs.mkdir(artifactDir, { recursive: true });

  const rows = [];
  for (const scenarioId of SCENARIOS) {
    rows.push(await runScenarioArm(scenarioId, 'legacy'));
    rows.push(await runScenarioArm(scenarioId, 'packet'));
  }

  const summary = summarizeComparisons(rows);
  await fs.writeFile(path.join(artifactDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  await fs.writeFile(path.join(artifactDir, 'runs.jsonl'), `${rows.map((row) => JSON.stringify({
    scenario_id: row.scenario_id,
    continuity_mode: row.continuity_mode,
    artifact_dir: row.artifact_dir,
    summary: row.summary,
  })).join('\n')}\n`);

  console.log(JSON.stringify({ artifactDir, summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
