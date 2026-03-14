import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';

import plugin from '../dist/plugin.js';

const execFile = promisify(execFileCb);
const ROOT = '/Volumes/ziel/openclaw-aionis-adapter';
const FIXTURE_PATH = path.join(ROOT, 'fixtures', 'live-task-scenarios-v1.json');

class MockOpenClawHost {
  constructor() {
    this.handlers = new Map();
    this.logs = [];
    this.pluginConfig = {};
    this.logger = {
      info: (msg) => this.logs.push({ level: 'info', msg }),
      warn: (msg) => this.logs.push({ level: 'warn', msg }),
      error: (msg) => this.logs.push({ level: 'error', msg }),
    };
  }

  on(eventName, handler) {
    this.handlers.set(eventName, handler);
  }

  async emit(eventName, event, ctx = {}) {
    const handler = this.handlers.get(eventName);
    if (!handler) throw new Error(`missing handler for ${eventName}`);
    return await handler(event, ctx);
  }
}

function nowStamp() {
  return new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

function mean(items, key) {
  return items.reduce((sum, item) => sum + Number(item[key] ?? 0), 0) / Math.max(items.length, 1);
}

function sha1(value) {
  return crypto.createHash('sha1').update(String(value)).digest('hex');
}

function summarizeForPeak(sequence) {
  let sameToolPeak = 0;
  let duplicatePeak = 0;
  let sameToolRun = 0;
  let duplicateRun = 0;
  let lastToolKey = null;
  let lastObservationHash = null;
  for (const item of sequence) {
    const toolKey = `${item.toolName}:${JSON.stringify(item.params ?? {})}`;
    sameToolRun = toolKey === lastToolKey ? sameToolRun + 1 : 1;
    sameToolPeak = Math.max(sameToolPeak, sameToolRun);
    lastToolKey = toolKey;

    const observationHash = item.observationHash ?? null;
    duplicateRun = observationHash && observationHash === lastObservationHash ? duplicateRun + 1 : 0;
    duplicatePeak = Math.max(duplicatePeak, duplicateRun);
    lastObservationHash = observationHash;
  }
  return { sameToolPeak, duplicatePeak };
}

async function startScenarioStub(kind) {
  let pollCount = 0;
  let commandCount = 0;

  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (kind === 'polling' && req.url === '/status') {
      pollCount += 1;
      res.end(JSON.stringify({ state: 'running', version: 1, unchanged: true }));
      return;
    }
    if (kind === 'transport_retry' && req.url === '/command') {
      commandCount += 1;
      res.statusCode = 503;
      res.end(JSON.stringify({ error: 'gateway_unavailable', attempt: commandCount }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'not_found', path: req.url }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    },
  };
}

async function startAionisMock(scenario) {
  const calls = {
    contextAssemble: 0,
    rulesEvaluate: 0,
    toolsSelect: 0,
    toolsFeedback: 0,
    write: 0,
    handoffStore: 0,
    replayCandidate: 0,
    replayDispatch: 0,
  };

  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    res.setHeader('content-type', 'application/json');

    if (req.url === '/v1/memory/context/assemble') {
      calls.contextAssemble += 1;
      res.end(JSON.stringify({
        scope: body.scope,
        layered_context: { merged_text: scenario.aionis.context_text },
      }));
      return;
    }

    if (req.url === '/v1/memory/rules/evaluate') {
      calls.rulesEvaluate += 1;
      res.end(JSON.stringify({ scope: body.scope, evaluation_summary: 'ok' }));
      return;
    }

    if (req.url === '/v1/memory/tools/select') {
      calls.toolsSelect += 1;
      const requested = Array.isArray(body.candidates) && body.candidates.length > 0 ? String(body.candidates[0]) : 'unknown';
      const selected = scenario.aionis.selection_map?.[requested] ?? requested;
      res.end(JSON.stringify({
        scope: body.scope,
        selection: { selected, denied: selected === requested ? [] : [requested] },
        decision: {
          decision_id: `${scenario.id}-decision-${calls.toolsSelect}`,
          decision_uri: `aionis://decision/${scenario.id}/${calls.toolsSelect}`,
          selected_tool: selected,
        },
      }));
      return;
    }

    if (req.url === '/v1/memory/tools/feedback') {
      calls.toolsFeedback += 1;
      res.end(JSON.stringify({ ok: true, decision_id: body.decision_id ?? null }));
      return;
    }

    if (req.url === '/v1/memory/write') {
      calls.write += 1;
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.url === '/v1/handoff/store') {
      calls.handoffStore += 1;
      res.end(JSON.stringify({ ok: true, handoff: { anchor: body.anchor ?? `${scenario.id}-handoff` } }));
      return;
    }

    if (req.url === '/v1/memory/replay/playbooks/candidate') {
      calls.replayCandidate += 1;
      res.end(JSON.stringify({
        scope: body.scope,
        playbook: { playbook_id: body.playbook_id, version: body.version ?? 1, status: 'active' },
        candidate: {
          eligible_for_deterministic_replay: Boolean(scenario.aionis.replay_eligible),
          recommended_mode: scenario.aionis.recommended_mode ?? 'simulate',
        },
      }));
      return;
    }

    if (req.url === '/v1/memory/replay/playbooks/dispatch') {
      calls.replayDispatch += 1;
      res.end(JSON.stringify({
        scope: body.scope,
        dispatch: { decision: 'deterministic_replay_executed' },
      }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'unexpected_route', path: req.url }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    calls,
    async close() {
      await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    },
  };
}

async function executeHttpTool(baseUrl, toolName, params) {
  const response = await fetch(`${baseUrl}${params.path}`);
  const text = await response.text();
  let parsed = text;
  try {
    parsed = JSON.parse(text);
  } catch {}
  if (!response.ok) {
    return { error: `http_${response.status}`, result: parsed };
  }
  return { result: parsed };
}

async function executeShellCommand(command, cwd) {
  try {
    const { stdout, stderr } = await execFile('bash', ['-lc', command], {
      cwd,
      env: { ...process.env, CI: '1' },
      maxBuffer: 10 * 1024 * 1024,
    });
    return { result: `${stdout}${stderr}`.trim() || 'ok' };
  } catch (error) {
    const stdout = error.stdout ?? '';
    const stderr = error.stderr ?? '';
    return {
      error: `command_failed:${error.code ?? 'unknown'}`,
      result: `${stdout}${stderr}`.trim().slice(0, 4000),
    };
  }
}

function buildContext(scenario) {
  return {
    agentId: `agent-${scenario.id}`,
    sessionId: `sess-${scenario.id}`,
    sessionKey: `sess-${scenario.id}`,
    workspaceDir: scenario.repo_path ?? ROOT,
    runId: `run-${scenario.id}`,
    toolName: scenario.tool?.name ?? scenario.plan?.[0]?.toolName ?? 'unknown',
    toolCallId: `call-${scenario.id}`,
    trigger: 'live-benchmark',
  };
}

async function executeActualTool({ scenario, toolName, params, runtimeBaseUrl }) {
  if (toolName === 'http_get' || toolName === 'http_command') {
    return executeHttpTool(runtimeBaseUrl, toolName, params);
  }
  const cwd = scenario.repo_path ?? ROOT;
  return executeShellCommand(String(params.command ?? ''), cwd);
}

function makeToolSequenceRecord(step, toolName, params, execution) {
  const observationText = execution.error
    ? `error:${execution.error}`
    : typeof execution.result === 'string'
      ? execution.result
      : JSON.stringify(execution.result ?? null);
  return {
    step,
    toolName,
    params,
    error: execution.error ?? null,
    observationHash: sha1(observationText.slice(0, 4000)),
  };
}

async function runBaselineScenario(scenario) {
  const runtime = (scenario.kind === 'polling' || scenario.kind === 'transport_retry')
    ? await startScenarioStub(scenario.kind)
    : null;

  const toolSequence = [];
  let broadToolCalls = 0;
  let executedSteps = 0;
  let outcome = 'completed';

  try {
    if (scenario.kind === 'repo_drift') {
      for (const [index, planned] of scenario.plan.entries()) {
        const execution = await executeActualTool({
          scenario,
          toolName: planned.toolName,
          params: planned.params,
          runtimeBaseUrl: runtime?.baseUrl,
        });
        executedSteps += 1;
        if (planned.toolName === 'grep' || planned.toolName === 'node-test-broad') broadToolCalls += 1;
        toolSequence.push(makeToolSequenceRecord(index + 1, planned.toolName, planned.params, execution));
      }
    } else {
      for (let step = 1; step <= scenario.iterations; step += 1) {
        const execution = await executeActualTool({
          scenario,
          toolName: scenario.tool.name,
          params: scenario.tool.params,
          runtimeBaseUrl: runtime?.baseUrl,
        });
        executedSteps += 1;
        toolSequence.push(makeToolSequenceRecord(step, scenario.tool.name, scenario.tool.params, execution));
      }
      outcome = 'timed_out';
    }
  } finally {
    await runtime?.close();
  }

  const peaks = summarizeForPeak(toolSequence);
  return {
    scenario_id: scenario.id,
    mode: 'baseline',
    outcome,
    executed_steps: executedSteps,
    controlled_stop: false,
    stop_reason: null,
    replay_dispatch_count: 0,
    handoff_store_count: 0,
    feedback_writes: 0,
    evidence_writes: 0,
    broad_tool_calls: broadToolCalls,
    policy_reroutes: 0,
    same_tool_streak_peak: peaks.sameToolPeak,
    duplicate_observation_streak_peak: peaks.duplicatePeak,
    tool_sequence: toolSequence,
  };
}

async function runTreatmentScenario(scenario) {
  const runtime = (scenario.kind === 'polling' || scenario.kind === 'transport_retry')
    ? await startScenarioStub(scenario.kind)
    : null;
  const aionis = await startAionisMock(scenario);
  const host = new MockOpenClawHost();
  host.pluginConfig = {
    baseUrl: aionis.baseUrl,
    tenantId: 'tenant-live-bench',
    actor: 'live-benchmark',
    ...scenario.plugin_config,
  };
  plugin.register(host);

  const ctx = buildContext(scenario);
  await host.emit('session_start', { sessionId: ctx.sessionId, sessionKey: ctx.sessionKey }, ctx);
  const agentStart = await host.emit('before_agent_start', {
    prompt: scenario.prompt,
    messages: [{ toolName: scenario.tool?.name ?? scenario.plan?.[0]?.toolName ?? 'unknown' }],
  }, ctx);

  const toolSequence = [];
  let executedSteps = 0;
  let broadToolCalls = 0;
  let policyReroutes = 0;
  let controlledStop = false;
  let stopReason = null;
  let outcome = 'completed';

  try {
    if (scenario.kind === 'repo_drift') {
      const completedFocused = new Set();
      for (const planned of scenario.plan) {
        let current = { toolName: planned.toolName, params: planned.params };
        for (let depth = 0; depth < 3; depth += 1) {
          const before = await host.emit('before_tool_call', {
            toolName: current.toolName,
            params: current.params,
            runId: ctx.runId,
            toolCallId: `${ctx.toolCallId}-${executedSteps + policyReroutes + depth + 1}`,
          }, { ...ctx, toolName: current.toolName });

          if (before?.block) {
            const reroute = /^policy selected ([^ ]+) instead of /.exec(before.blockReason ?? '');
            if (reroute) {
              const replacement = scenario.reroutes?.[reroute[1]];
              if (!replacement) throw new Error(`${scenario.id}: missing reroute for ${reroute[1]}`);
              policyReroutes += 1;
              current = replacement;
              continue;
            }
            controlledStop = true;
            stopReason = before.blockReason ?? null;
            outcome = 'controlled_stop';
            break;
          }

          const execution = await executeActualTool({
            scenario,
            toolName: current.toolName,
            params: current.params,
            runtimeBaseUrl: runtime?.baseUrl,
          });
          executedSteps += 1;
          if (current.toolName === 'grep' || current.toolName === 'node-test-broad') broadToolCalls += 1;
          toolSequence.push(makeToolSequenceRecord(executedSteps, current.toolName, current.params, execution));
          await host.emit('after_tool_call', {
            toolName: current.toolName,
            params: current.params,
            runId: ctx.runId,
            toolCallId: `${ctx.toolCallId}-${executedSteps}`,
            result: execution.result,
            error: execution.error,
            durationMs: 10,
          }, { ...ctx, toolName: current.toolName });

          if (current.toolName === 'rg' || current.toolName === 'node-test-focused') {
            completedFocused.add(current.toolName);
          }
          break;
        }

        if (controlledStop) break;
        if (completedFocused.has('rg') && completedFocused.has('node-test-focused')) {
          outcome = 'completed';
          break;
        }
      }
    } else {
      for (let step = 1; step <= scenario.iterations; step += 1) {
        const before = await host.emit('before_tool_call', {
          toolName: scenario.tool.name,
          params: scenario.tool.params,
          runId: ctx.runId,
          toolCallId: `${ctx.toolCallId}-${step}`,
        }, { ...ctx, toolName: scenario.tool.name });

        if (before?.block) {
          controlledStop = true;
          stopReason = before.blockReason ?? null;
          outcome = 'controlled_stop';
          break;
        }

        const execution = await executeActualTool({
          scenario,
          toolName: scenario.tool.name,
          params: scenario.tool.params,
          runtimeBaseUrl: runtime?.baseUrl,
        });
        executedSteps += 1;
        toolSequence.push(makeToolSequenceRecord(executedSteps, scenario.tool.name, scenario.tool.params, execution));
        await host.emit('after_tool_call', {
          toolName: scenario.tool.name,
          params: scenario.tool.params,
          runId: ctx.runId,
          toolCallId: `${ctx.toolCallId}-${step}`,
          result: execution.result,
          error: execution.error,
          durationMs: 10,
        }, { ...ctx, toolName: scenario.tool.name });
      }

      if (!controlledStop) outcome = 'timed_out';
    }

    await host.emit('agent_end', {
      messages: [],
      success: outcome === 'completed' || outcome === 'controlled_stop',
      error: outcome === 'completed' || outcome === 'controlled_stop' ? undefined : stopReason ?? outcome,
      durationMs: 0,
    }, ctx);
    await host.emit('session_end', { sessionId: ctx.sessionId, sessionKey: ctx.sessionKey }, ctx);
  } finally {
    await aionis.close();
    await runtime?.close();
  }

  const peaks = summarizeForPeak(toolSequence);
  return {
    scenario_id: scenario.id,
    mode: 'treatment',
    prompt_injected: typeof agentStart?.prependContext === 'string' && agentStart.prependContext.includes(scenario.aionis.context_text),
    outcome,
    executed_steps: executedSteps,
    controlled_stop: controlledStop,
    stop_reason: stopReason,
    replay_dispatch_count: aionis.calls.replayDispatch,
    handoff_store_count: aionis.calls.handoffStore,
    feedback_writes: aionis.calls.toolsFeedback,
    evidence_writes: aionis.calls.write,
    broad_tool_calls: broadToolCalls,
    policy_reroutes: policyReroutes,
    same_tool_streak_peak: peaks.sameToolPeak,
    duplicate_observation_streak_peak: peaks.duplicatePeak,
    tool_sequence: toolSequence,
    logs: host.logs,
  };
}

function summarize(cases) {
  const baseline = cases.filter((item) => item.mode === 'baseline');
  const treatment = cases.filter((item) => item.mode === 'treatment');
  return {
    benchmark: 'openclaw_live_task_v1',
    cases: treatment.length,
    baseline: {
      avg_executed_steps: mean(baseline, 'executed_steps'),
      controlled_stop_rate: baseline.filter((item) => item.controlled_stop).length / Math.max(baseline.length, 1),
      completed_rate: baseline.filter((item) => item.outcome === 'completed').length / Math.max(baseline.length, 1),
      avg_broad_tool_calls: mean(baseline, 'broad_tool_calls'),
      avg_same_tool_streak_peak: mean(baseline, 'same_tool_streak_peak'),
      avg_duplicate_observation_streak_peak: mean(baseline, 'duplicate_observation_streak_peak'),
    },
    treatment: {
      avg_executed_steps: mean(treatment, 'executed_steps'),
      controlled_stop_rate: treatment.filter((item) => item.controlled_stop).length / Math.max(treatment.length, 1),
      completed_rate: treatment.filter((item) => item.outcome === 'completed').length / Math.max(treatment.length, 1),
      replay_dispatch_rate: treatment.filter((item) => item.replay_dispatch_count > 0).length / Math.max(treatment.length, 1),
      handoff_store_rate: treatment.filter((item) => item.handoff_store_count > 0).length / Math.max(treatment.length, 1),
      avg_feedback_writes: mean(treatment, 'feedback_writes'),
      avg_evidence_writes: mean(treatment, 'evidence_writes'),
      avg_broad_tool_calls: mean(treatment, 'broad_tool_calls'),
      avg_policy_reroutes: mean(treatment, 'policy_reroutes'),
      avg_same_tool_streak_peak: mean(treatment, 'same_tool_streak_peak'),
      avg_duplicate_observation_streak_peak: mean(treatment, 'duplicate_observation_streak_peak'),
    },
  };
}

async function main() {
  const fixture = JSON.parse(await fs.readFile(FIXTURE_PATH, 'utf8'));
  const cases = [];
  const rawSequence = [];
  const stopReasons = {};

  for (const scenario of fixture.scenarios) {
    const baseline = await runBaselineScenario(scenario);
    const treatment = await runTreatmentScenario(scenario);

    if (scenario.expected.treatment_outcome && treatment.outcome !== scenario.expected.treatment_outcome) {
      throw new Error(`${scenario.id}: expected treatment outcome ${scenario.expected.treatment_outcome}, got ${treatment.outcome}`);
    }
    if (scenario.expected.treatment_stop_reason && treatment.stop_reason !== scenario.expected.treatment_stop_reason) {
      throw new Error(`${scenario.id}: expected treatment stop reason ${scenario.expected.treatment_stop_reason}, got ${treatment.stop_reason}`);
    }

    cases.push(baseline, treatment);
    rawSequence.push(
      { scenario_id: scenario.id, mode: 'baseline', tool_sequence: baseline.tool_sequence },
      { scenario_id: scenario.id, mode: 'treatment', tool_sequence: treatment.tool_sequence },
    );
    if (treatment.stop_reason) stopReasons[scenario.id] = treatment.stop_reason;
  }

  const summary = summarize(cases);
  const artifactDir = path.join(ROOT, 'artifacts', 'openclaw-live-task-benchmark', nowStamp());
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(path.join(artifactDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  await fs.writeFile(path.join(artifactDir, 'cases.jsonl'), `${cases.map((row) => JSON.stringify(row)).join('\n')}\n`);
  await fs.writeFile(path.join(artifactDir, 'raw-tool-sequence.jsonl'), `${rawSequence.map((row) => JSON.stringify(row)).join('\n')}\n`);
  await fs.writeFile(path.join(artifactDir, 'stop-reasons.json'), `${JSON.stringify(stopReasons, null, 2)}\n`);

  console.log(JSON.stringify({ artifactDir, summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
