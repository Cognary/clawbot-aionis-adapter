import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';

import plugin from '../dist/plugin.js';

const execFile = promisify(execFileCb);
const ROOT = '/Volumes/ziel/openclaw-aionis-adapter';
const FIXTURE_PATH = path.join(ROOT, 'fixtures', 'semi-live-token-scenarios-v1.json');
const API_BASE_URL = process.env.GLM_BASE_URL ?? 'https://open.bigmodel.cn/api/paas/v4';
const API_KEY = process.env.ZHIPU_API_KEY ?? process.env.GLM_API_KEY;
const MODEL = process.env.GLM_MODEL ?? 'glm-5';
const MAX_GLM_RETRIES = Number(process.env.GLM_MAX_RETRIES ?? 3);
const GLM_REQUEST_TIMEOUT_MS = Number(process.env.GLM_REQUEST_TIMEOUT_MS ?? 30000);
const SCENARIO_FILTER = process.env.BENCH_SCENARIO_ID ?? '';

if (!API_KEY) {
  console.error('Missing ZHIPU_API_KEY or GLM_API_KEY');
  process.exit(1);
}

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

function sha1(value) {
  return crypto.createHash('sha1').update(String(value)).digest('hex');
}

function mean(items, key) {
  return items.reduce((sum, item) => sum + Number(item[key] ?? 0), 0) / Math.max(items.length, 1);
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

async function callGlm(messages, tools) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_GLM_RETRIES; attempt += 1) {
    let timer = null;
    try {
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), GLM_REQUEST_TIMEOUT_MS);
      const response = await fetch(`${API_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: MODEL,
          temperature: 0,
          thinking: { type: 'disabled' },
          response_format: { type: 'json_object' },
          messages,
        }),
      });
      clearTimeout(timer);
      timer = null;

      const data = await response.json();
      if (!response.ok) {
        const retryable = response.status >= 500 || response.status === 429;
        const error = new Error(`GLM request failed: ${response.status} ${JSON.stringify(data)}`);
        if (!retryable || attempt === MAX_GLM_RETRIES) throw error;
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        continue;
      }
      const content = data?.choices?.[0]?.message?.content;
      const usage = data?.usage ?? {};
      if (typeof content !== 'string') {
        throw new Error(`GLM response missing content: ${JSON.stringify(data)}`);
      }
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch (error) {
        throw new Error(`GLM returned non-JSON content: ${content}`);
      }
      if (!parsed || typeof parsed !== 'object') {
        throw new Error(`GLM returned invalid JSON object: ${content}`);
      }
      return {
        parsed,
        usage: {
          prompt_tokens: Number(usage.prompt_tokens ?? 0),
          completion_tokens: Number(usage.completion_tokens ?? 0),
          total_tokens: Number(usage.total_tokens ?? 0),
        },
        raw: data,
      };
    } catch (error) {
      lastError = error;
      if (timer) clearTimeout(timer);
      if (attempt === MAX_GLM_RETRIES) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw lastError ?? new Error('GLM request failed');
}

async function startScenarioStub(kind) {
  const counters = { pollCount: 0, commandCount: 0 };
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (kind === 'polling' && req.url === '/status') {
      counters.pollCount += 1;
      res.end(JSON.stringify({ state: 'running', version: 1, unchanged: true }));
      return;
    }
    if (kind === 'transport_retry' && req.url === '/command') {
      counters.commandCount += 1;
      res.statusCode = 503;
      res.end(JSON.stringify({ error: 'gateway_unavailable', attempt: counters.commandCount }));
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
      res.end(JSON.stringify({ scope: body.scope, layered_context: { merged_text: scenario.aionis.context_text } }));
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
      res.end(JSON.stringify({ scope: body.scope, dispatch: { decision: 'deterministic_replay_executed' } }));
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

async function executeHttpTool(baseUrl, params) {
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

async function executeActualTool({ scenario, toolName, params, runtimeBaseUrl }) {
  if (toolName === 'http_get' || toolName === 'http_command') {
    return executeHttpTool(runtimeBaseUrl, params);
  }
  const cwd = scenario.repo_path ?? ROOT;
  return executeShellCommand(String(params.command ?? ''), cwd);
}

function buildContext(scenario) {
  return {
    agentId: `agent-${scenario.id}`,
    sessionId: `sess-${scenario.id}`,
    sessionKey: `sess-${scenario.id}`,
    workspaceDir: scenario.repo_path ?? ROOT,
    runId: `run-${scenario.id}`,
    toolName: scenario.toolset?.[0]?.name ?? 'unknown',
    toolCallId: `call-${scenario.id}`,
    trigger: 'semi-live-token-benchmark',
  };
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

function buildMessages({ scenario, prependContext, history }) {
  const toolList = scenario.toolset.map((tool) => `- ${tool.name}: ${tool.description}`).join('\n');
  const historyText = history.length === 0
    ? 'No prior tool calls.'
    : history.map((item) => `Step ${item.step}: tool=${item.toolName}; summary=${item.summary}`).join('\n');

  return [
    {
      role: 'system',
      content: [
        'You are controlling an OpenClaw-style agent.',
        'Return a JSON object with keys: action, tool, note.',
        'action must be either "use" or "finish".',
        `tool must be one of: ${scenario.toolset.map((tool) => tool.name).join(', ')} or null when action is finish.`,
        'Do not invent new tools or parameters.',
        'Use finish only if the task success condition is already satisfied.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `Task: ${scenario.prompt}`,
        prependContext ? `Aionis context: ${prependContext}` : null,
        `Available tools:\n${toolList}`,
        `History:\n${historyText}`,
        'Return JSON only.',
      ].filter(Boolean).join('\n\n'),
    },
  ];
}

function lookupToolSpec(scenario, toolName) {
  return scenario.toolset.find((tool) => tool.name === toolName) ?? null;
}

function repoSuccessSatisfied(history) {
  const seen = new Set(history.map((item) => item.toolName));
  return seen.has('rg') && seen.has('node-test-focused');
}

function pollingSuccessSatisfied() {
  return false;
}

function transportSuccessSatisfied() {
  return false;
}

function isScenarioComplete(scenario, history) {
  if (scenario.kind === 'repo_drift') return repoSuccessSatisfied(history);
  if (scenario.kind === 'polling') return pollingSuccessSatisfied(history);
  if (scenario.kind === 'transport_retry') return transportSuccessSatisfied(history);
  return false;
}

async function runScenario({ scenario, mode }) {
  const runtime = (scenario.kind === 'polling' || scenario.kind === 'transport_retry')
    ? await startScenarioStub(scenario.kind)
    : null;
  const aionis = mode === 'treatment' ? await startAionisMock(scenario) : null;
  const host = mode === 'treatment' ? new MockOpenClawHost() : null;

  if (mode === 'treatment') {
    host.pluginConfig = {
      baseUrl: aionis.baseUrl,
      tenantId: 'tenant-semi-live',
      actor: 'semi-live-benchmark',
      ...scenario.plugin_config,
    };
    plugin.register(host);
  }

  const ctx = buildContext(scenario);
  let prependContext = null;
  if (mode === 'treatment') {
    await host.emit('session_start', { sessionId: ctx.sessionId, sessionKey: ctx.sessionKey }, ctx);
    const startResult = await host.emit('before_agent_start', {
      prompt: scenario.prompt,
      messages: scenario.toolset.map((tool) => ({ toolName: tool.name })),
    }, ctx);
    prependContext = startResult?.prependContext ?? null;
  }

  const history = [];
  const tokenBreakdown = [];
  const toolSequence = [];
  let executedSteps = 0;
  let controlledStop = false;
  let stopReason = null;
  let outcome = 'timed_out';
  let broadToolCalls = 0;
  let policyReroutes = 0;

  try {
    for (let step = 1; step <= scenario.max_model_steps; step += 1) {
      const messages = buildMessages({ scenario, prependContext, history });
      const { parsed, usage } = await callGlm(messages, scenario.toolset);
      tokenBreakdown.push({ scenario_id: scenario.id, mode, step, ...usage, model_decision: parsed });

      if (parsed.action === 'finish') {
        outcome = isScenarioComplete(scenario, history) ? 'completed' : 'timed_out';
        break;
      }

      let chosenTool = typeof parsed.tool === 'string' ? parsed.tool : null;
      if (!chosenTool) {
        outcome = 'crashed';
        stopReason = 'invalid_model_tool';
        break;
      }

      let toolSpec = lookupToolSpec(scenario, chosenTool);
      if (!toolSpec) {
        outcome = 'crashed';
        stopReason = 'unknown_model_tool';
        break;
      }

      if (mode === 'treatment') {
        for (let depth = 0; depth < 3; depth += 1) {
          const before = await host.emit('before_tool_call', {
            toolName: toolSpec.name,
            params: toolSpec.params,
            runId: ctx.runId,
            toolCallId: `${ctx.toolCallId}-${step}-${depth + 1}`,
          }, { ...ctx, toolName: toolSpec.name });

          if (before?.block) {
            const reroute = /^policy selected ([^ ]+) instead of /.exec(before.blockReason ?? '');
            if (reroute) {
              const redirected = lookupToolSpec(scenario, reroute[1]);
              if (!redirected) {
                outcome = 'crashed';
                stopReason = `missing_reroute:${reroute[1]}`;
                break;
              }
              policyReroutes += 1;
              toolSpec = redirected;
              continue;
            }
            controlledStop = true;
            stopReason = before.blockReason ?? null;
            outcome = 'controlled_stop';
            break;
          }
          break;
        }
      }

      if (controlledStop || outcome === 'crashed') break;

      const execution = await executeActualTool({
        scenario,
        toolName: toolSpec.name,
        params: toolSpec.params,
        runtimeBaseUrl: runtime?.baseUrl,
      });
      executedSteps += 1;
      if (toolSpec.name === 'grep' || toolSpec.name === 'node-test-broad') broadToolCalls += 1;
      const toolRecord = makeToolSequenceRecord(executedSteps, toolSpec.name, toolSpec.params, execution);
      toolSequence.push(toolRecord);
      history.push({
        step: executedSteps,
        toolName: toolSpec.name,
        summary: execution.error ? `error:${execution.error}` : JSON.stringify(execution.result ?? null).slice(0, 400),
      });

      if (mode === 'treatment') {
        await host.emit('after_tool_call', {
          toolName: toolSpec.name,
          params: toolSpec.params,
          runId: ctx.runId,
          toolCallId: `${ctx.toolCallId}-${step}`,
          result: execution.result,
          error: execution.error,
          durationMs: 10,
        }, { ...ctx, toolName: toolSpec.name });
      }

      if (isScenarioComplete(scenario, history)) {
        outcome = 'completed';
        break;
      }
    }

    if (mode === 'treatment') {
      await host.emit('agent_end', {
        messages: [],
        success: outcome === 'completed' || outcome === 'controlled_stop',
        error: outcome === 'completed' || outcome === 'controlled_stop' ? undefined : stopReason ?? outcome,
        durationMs: 0,
      }, ctx);
      await host.emit('session_end', { sessionId: ctx.sessionId, sessionKey: ctx.sessionKey }, ctx);
    }
  } finally {
    await aionis?.close();
    await runtime?.close();
  }

  const peaks = summarizeForPeak(toolSequence);
  const promptTokens = tokenBreakdown.reduce((sum, item) => sum + item.prompt_tokens, 0);
  const completionTokens = tokenBreakdown.reduce((sum, item) => sum + item.completion_tokens, 0);
  const totalTokens = tokenBreakdown.reduce((sum, item) => sum + item.total_tokens, 0);

  return {
    scenario_id: scenario.id,
    mode,
    model: MODEL,
    provider: 'glm',
    prompt_injected: Boolean(prependContext),
    outcome,
    controlled_stop: controlledStop,
    stop_reason: stopReason,
    executed_steps: executedSteps,
    tool_call_count: executedSteps,
    prompt_tokens_total: promptTokens,
    completion_tokens_total: completionTokens,
    total_tokens: totalTokens,
    replay_dispatch_count: aionis?.calls?.replayDispatch ?? 0,
    handoff_store_count: aionis?.calls?.handoffStore ?? 0,
    feedback_writes: aionis?.calls?.toolsFeedback ?? 0,
    evidence_writes: aionis?.calls?.write ?? 0,
    broad_tool_calls: broadToolCalls,
    policy_reroutes: policyReroutes,
    same_tool_streak_peak: peaks.sameToolPeak,
    duplicate_observation_streak_peak: peaks.duplicatePeak,
    token_breakdown: tokenBreakdown,
    tool_sequence: toolSequence,
  };
}

function summarize(cases) {
  const baseline = cases.filter((item) => item.mode === 'baseline');
  const treatment = cases.filter((item) => item.mode === 'treatment');
  return {
    benchmark: 'openclaw_semi_live_token_v1',
    provider: 'glm',
    model: MODEL,
    cases: treatment.length,
    baseline: {
      avg_total_tokens: mean(baseline, 'total_tokens'),
      avg_prompt_tokens_total: mean(baseline, 'prompt_tokens_total'),
      avg_completion_tokens_total: mean(baseline, 'completion_tokens_total'),
      avg_executed_steps: mean(baseline, 'executed_steps'),
      controlled_stop_rate: baseline.filter((item) => item.controlled_stop).length / Math.max(baseline.length, 1),
      completed_rate: baseline.filter((item) => item.outcome === 'completed').length / Math.max(baseline.length, 1),
      avg_broad_tool_calls: mean(baseline, 'broad_tool_calls'),
    },
    treatment: {
      avg_total_tokens: mean(treatment, 'total_tokens'),
      avg_prompt_tokens_total: mean(treatment, 'prompt_tokens_total'),
      avg_completion_tokens_total: mean(treatment, 'completion_tokens_total'),
      avg_executed_steps: mean(treatment, 'executed_steps'),
      controlled_stop_rate: treatment.filter((item) => item.controlled_stop).length / Math.max(treatment.length, 1),
      completed_rate: treatment.filter((item) => item.outcome === 'completed').length / Math.max(treatment.length, 1),
      replay_dispatch_rate: treatment.filter((item) => item.replay_dispatch_count > 0).length / Math.max(treatment.length, 1),
      handoff_store_rate: treatment.filter((item) => item.handoff_store_count > 0).length / Math.max(treatment.length, 1),
      avg_feedback_writes: mean(treatment, 'feedback_writes'),
      avg_evidence_writes: mean(treatment, 'evidence_writes'),
      avg_broad_tool_calls: mean(treatment, 'broad_tool_calls'),
      avg_policy_reroutes: mean(treatment, 'policy_reroutes'),
    },
  };
}

async function main() {
  const fixture = JSON.parse(await fs.readFile(FIXTURE_PATH, 'utf8'));
  const scenarios = SCENARIO_FILTER
    ? fixture.scenarios.filter((scenario) => scenario.id === SCENARIO_FILTER)
    : fixture.scenarios;
  if (scenarios.length === 0) {
    throw new Error(`No scenarios matched BENCH_SCENARIO_ID=${SCENARIO_FILTER}`);
  }
  const cases = [];
  const tokenBreakdown = [];
  const rawRunMetadata = [];

  for (const scenario of scenarios) {
    const baseline = await runScenario({ scenario, mode: 'baseline' });
    const treatment = await runScenario({ scenario, mode: 'treatment' });
    cases.push(baseline, treatment);
    tokenBreakdown.push(
      ...baseline.token_breakdown.map((item) => ({ ...item, scenario_kind: scenario.kind })),
      ...treatment.token_breakdown.map((item) => ({ ...item, scenario_kind: scenario.kind })),
    );
    rawRunMetadata.push(
      {
        scenario_id: scenario.id,
        mode: 'baseline',
        outcome: baseline.outcome,
        stop_reason: baseline.stop_reason,
        tool_sequence: baseline.tool_sequence,
      },
      {
        scenario_id: scenario.id,
        mode: 'treatment',
        outcome: treatment.outcome,
        stop_reason: treatment.stop_reason,
        tool_sequence: treatment.tool_sequence,
      },
    );
  }

  const summary = summarize(cases);
  const artifactDir = path.join(ROOT, 'artifacts', 'openclaw-semi-live-token-benchmark', nowStamp());
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(path.join(artifactDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  await fs.writeFile(path.join(artifactDir, 'cases.jsonl'), `${cases.map((row) => JSON.stringify(row)).join('\n')}\n`);
  await fs.writeFile(path.join(artifactDir, 'token-breakdown.jsonl'), `${tokenBreakdown.map((row) => JSON.stringify(row)).join('\n')}\n`);
  await fs.writeFile(path.join(artifactDir, 'raw-run-metadata.jsonl'), `${rawRunMetadata.map((row) => JSON.stringify(row)).join('\n')}\n`);

  console.log(JSON.stringify({ artifactDir, summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
