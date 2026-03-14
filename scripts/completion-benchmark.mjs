import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';

import plugin from '../dist/plugin.js';

const execFile = promisify(execFileCb);
const ROOT = '/Volumes/ziel/openclaw-aionis-adapter';
const FIXTURE_PATH = path.join(ROOT, 'fixtures', 'completion-benchmark-scenarios-v1.json');
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

async function callGlm(messages) {
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
      if (typeof content !== 'string') throw new Error(`GLM response missing content: ${JSON.stringify(data)}`);
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error(`GLM returned non-JSON content: ${content}`);
      }
      return {
        parsed,
        usage: {
          prompt_tokens: Number(data?.usage?.prompt_tokens ?? 0),
          completion_tokens: Number(data?.usage?.completion_tokens ?? 0),
          total_tokens: Number(data?.usage?.total_tokens ?? 0),
        },
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

async function startTransportStub() {
  let count = 0;
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/command') {
      count += 1;
      res.statusCode = 503;
      res.end(JSON.stringify({ error: 'gateway_unavailable', attempt: count }));
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
  const handoffs = [];
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
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.url === '/v1/memory/write') {
      calls.write += 1;
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.url === '/v1/handoff/store') {
      calls.handoffStore += 1;
      handoffs.push({
        anchor: body.anchor,
        summary: body.summary,
        handoff_text: body.handoff_text,
        repo_root: body.repo_root,
        file_path: body.file_path,
      });
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
    handoffs,
    latestHandoff() {
      return handoffs.at(-1) ?? null;
    },
    async close() {
      await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    },
  };
}

async function executeShell(command, cwd) {
  try {
    const { stdout, stderr } = await execFile('bash', ['-lc', command], {
      cwd,
      env: { ...process.env, CI: '1' },
      maxBuffer: 10 * 1024 * 1024,
    });
    return { result: `${stdout}${stderr}`.trim() || 'ok' };
  } catch (error) {
    return {
      error: `command_failed:${error.code ?? 'unknown'}`,
      result: `${error.stdout ?? ''}${error.stderr ?? ''}`.trim().slice(0, 4000),
    };
  }
}

async function executeHttpCommand(baseUrl) {
  const response = await fetch(`${baseUrl}/command`);
  const text = await response.text();
  let parsed = text;
  try { parsed = JSON.parse(text); } catch {}
  if (!response.ok) return { error: `http_${response.status}`, result: parsed };
  return { result: parsed };
}

function buildMessages({ prompt, toolset, history, injectedContext }) {
  const toolList = toolset.map((tool) => `- ${tool.name}: ${tool.description}`).join('\n');
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
        `tool must be one of: ${toolset.map((tool) => tool.name).join(', ')} or null when action is finish.`,
        'Do not invent new tools or parameters.',
        'Use finish only if the task success condition is already satisfied.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `Task: ${prompt}`,
        injectedContext ? `Context: ${injectedContext}` : null,
        `Available tools:\n${toolList}`,
        `History:\n${historyText}`,
        'Return JSON only.',
      ].filter(Boolean).join('\n\n'),
    },
  ];
}

function makeContext(id, repoPath) {
  return {
    agentId: `agent-${id}`,
    sessionId: `sess-${id}`,
    sessionKey: `sess-${id}`,
    workspaceDir: repoPath ?? ROOT,
    runId: `run-${id}`,
    toolName: 'unknown',
    toolCallId: `call-${id}`,
    trigger: 'completion-benchmark',
  };
}

function lookupTool(toolset, name) {
  return toolset.find((tool) => tool.name === name) ?? null;
}

function completionSatisfied(kind, history) {
  const names = new Set(history.map((item) => item.toolName));
  if (kind === 'transport_retry_completion') return false;
  if (kind === 'repo_budget_completion' || kind === 'handoff_resume_completion') {
    return names.has('rg') && names.has('node-test-focused');
  }
  return false;
}

async function runOnePhase({ scenario, prompt, maxSteps, mode, toolset, repoPath, aionis, interrupted = false, injectedContext = null }) {
  const transport = scenario.kind === 'transport_retry_completion' ? await startTransportStub() : null;
  const host = mode === 'treatment' ? new MockOpenClawHost() : null;
  const ctx = makeContext(`${scenario.id}-${Math.random().toString(36).slice(2, 8)}`, repoPath);
  const history = [];
  const tokenBreakdown = [];
  let executedSteps = 0;
  let completed = false;
  let controlledStop = false;
  let stopReason = null;

  if (mode === 'treatment') {
    host.pluginConfig = {
      baseUrl: aionis.baseUrl,
      tenantId: 'tenant-completion-bench',
      actor: 'completion-benchmark',
      ...scenario.plugin_config,
    };
    plugin.register(host);
    await host.emit('session_start', { sessionId: ctx.sessionId, sessionKey: ctx.sessionKey }, ctx);
    const startResult = await host.emit('before_agent_start', {
      prompt,
      messages: toolset.map((tool) => ({ toolName: tool.name })),
    }, ctx);
    injectedContext = [injectedContext, startResult?.prependContext].filter(Boolean).join('\n');
  }

  try {
    for (let step = 1; step <= maxSteps; step += 1) {
      const { parsed, usage } = await callGlm(buildMessages({ prompt, toolset, history, injectedContext }));
      tokenBreakdown.push({ step, ...usage, model_decision: parsed });
      if (parsed.action === 'finish') {
        completed = true;
        break;
      }
      let tool = lookupTool(toolset, parsed.tool);
      if (!tool) break;

      if (mode === 'treatment') {
        const before = await host.emit('before_tool_call', {
          toolName: tool.name,
          params: tool.params,
          runId: ctx.runId,
          toolCallId: `${ctx.toolCallId}-${step}`,
        }, { ...ctx, toolName: tool.name });
        const reroute = /^policy selected ([^ ]+) instead of /.exec(before?.blockReason ?? '');
        if (reroute) {
          const redirected = lookupTool(toolset, reroute[1]);
          if (redirected) tool = redirected;
        } else if (before?.block) {
          controlledStop = true;
          stopReason = before.blockReason ?? null;
          break;
        }
      }

      let execution;
      if (scenario.kind === 'transport_retry_completion') {
        execution = await executeHttpCommand(transport.baseUrl);
      } else {
        execution = await executeShell(String(tool.params.command ?? ''), repoPath ?? ROOT);
      }
      executedSteps += 1;
      history.push({
        step: executedSteps,
        toolName: tool.name,
        summary: execution.error ? `error:${execution.error}` : JSON.stringify(execution.result ?? null).slice(0, 300),
        observationHash: sha1(execution.error ? `error:${execution.error}` : JSON.stringify(execution.result ?? null)),
      });

      if (mode === 'treatment') {
        await host.emit('after_tool_call', {
          toolName: tool.name,
          params: tool.params,
          runId: ctx.runId,
          toolCallId: `${ctx.toolCallId}-${step}`,
          result: execution.result,
          error: execution.error,
          durationMs: 10,
        }, { ...ctx, toolName: tool.name });
      }

      if (completionSatisfied(scenario.kind, history)) {
        completed = true;
        break;
      }

      if (interrupted) break;
    }

    if (mode === 'treatment') {
      await host.emit('agent_end', {
        messages: [],
        success: completed || controlledStop,
        error: completed || controlledStop ? undefined : interrupted ? 'interrupted' : stopReason ?? 'not_completed',
        durationMs: 0,
      }, ctx);
      await host.emit('session_end', { sessionId: ctx.sessionId, sessionKey: ctx.sessionKey }, ctx);
    }
  } finally {
    await transport?.close();
  }

  return {
    completed,
    controlledStop,
    stopReason,
    executedSteps,
    tokenBreakdown,
    history,
    replayDispatchCount: aionis?.calls?.replayDispatch ?? 0,
    handoffStoreCount: aionis?.calls?.handoffStore ?? 0,
  };
}

async function runReplayScenario(scenario) {
  const baselineAionis = await startAionisMock(scenario);
  const treatmentAionis = await startAionisMock(scenario);
  try {
    const baseline = await runOnePhase({
      scenario,
      prompt: scenario.prompt,
      maxSteps: scenario.max_model_steps,
      mode: 'baseline',
      toolset: scenario.toolset,
      repoPath: null,
      aionis: baselineAionis,
    });
    const treatment = await runOnePhase({
      scenario,
      prompt: scenario.prompt,
      maxSteps: scenario.max_model_steps,
      mode: 'treatment',
      toolset: scenario.toolset,
      repoPath: null,
      aionis: treatmentAionis,
    });
    return {
      baseline: {
        completed: baseline.completed,
        executed_steps: baseline.executedSteps,
        total_tokens: baseline.tokenBreakdown.reduce((s, x) => s + x.total_tokens, 0),
      },
      treatment: {
        completed: treatment.completed || treatment.replayDispatchCount > 0,
        executed_steps: treatment.executedSteps,
        total_tokens: treatment.tokenBreakdown.reduce((s, x) => s + x.total_tokens, 0),
        replay_dispatch_count: treatment.replayDispatchCount,
        handoff_store_count: treatment.handoffStoreCount,
      },
      details: { baseline, treatment },
    };
  } finally {
    await baselineAionis.close();
    await treatmentAionis.close();
  }
}

async function runRepoBudgetScenario(scenario) {
  const baselineAionis = await startAionisMock(scenario);
  const treatmentAionis = await startAionisMock(scenario);
  try {
    const baseline = await runOnePhase({
      scenario,
      prompt: scenario.prompt,
      maxSteps: scenario.max_model_steps,
      mode: 'baseline',
      toolset: scenario.toolset,
      repoPath: scenario.repo_path,
      aionis: baselineAionis,
    });
    const treatment = await runOnePhase({
      scenario,
      prompt: scenario.prompt,
      maxSteps: scenario.max_model_steps,
      mode: 'treatment',
      toolset: scenario.toolset,
      repoPath: scenario.repo_path,
      aionis: treatmentAionis,
    });
    return {
      baseline: {
        completed: baseline.completed,
        executed_steps: baseline.executedSteps,
        total_tokens: baseline.tokenBreakdown.reduce((s, x) => s + x.total_tokens, 0),
      },
      treatment: {
        completed: treatment.completed,
        executed_steps: treatment.executedSteps,
        total_tokens: treatment.tokenBreakdown.reduce((s, x) => s + x.total_tokens, 0),
        replay_dispatch_count: treatment.replayDispatchCount,
        handoff_store_count: treatment.handoffStoreCount,
      },
      details: { baseline, treatment },
    };
  } finally {
    await baselineAionis.close();
    await treatmentAionis.close();
  }
}

async function runHandoffResumeScenario(scenario) {
  const baselineAionis = await startAionisMock(scenario);
  const treatmentAionis = await startAionisMock(scenario);
  try {
    await runOnePhase({
      scenario,
      prompt: scenario.prompt_phase1,
      maxSteps: scenario.max_model_steps_phase1,
      mode: 'baseline',
      toolset: scenario.toolset,
      repoPath: scenario.repo_path,
      aionis: baselineAionis,
      interrupted: true,
    });
    await runOnePhase({
      scenario,
      prompt: scenario.prompt_phase1,
      maxSteps: scenario.max_model_steps_phase1,
      mode: 'treatment',
      toolset: scenario.toolset,
      repoPath: scenario.repo_path,
      aionis: treatmentAionis,
      interrupted: true,
    });

    const baselineResume = await runOnePhase({
      scenario,
      prompt: scenario.prompt_phase2,
      maxSteps: scenario.max_model_steps_phase2,
      mode: 'baseline',
      toolset: scenario.toolset,
      repoPath: scenario.repo_path,
      aionis: baselineAionis,
    });
    const recovered = treatmentAionis.latestHandoff();
    const treatmentResume = await runOnePhase({
      scenario,
      prompt: scenario.prompt_phase2,
      maxSteps: scenario.max_model_steps_phase2,
      mode: 'treatment',
      toolset: scenario.toolset,
      repoPath: scenario.repo_path,
      aionis: treatmentAionis,
      injectedContext: recovered?.handoff_text ?? null,
    });

    return {
      baseline: {
        completed: baselineResume.completed,
        executed_steps: baselineResume.executedSteps,
        total_tokens: baselineResume.tokenBreakdown.reduce((s, x) => s + x.total_tokens, 0),
      },
      treatment: {
        completed: treatmentResume.completed,
        executed_steps: treatmentResume.executedSteps,
        total_tokens: treatmentResume.tokenBreakdown.reduce((s, x) => s + x.total_tokens, 0),
        replay_dispatch_count: treatmentResume.replayDispatchCount,
        handoff_store_count: treatmentAionis.calls.handoffStore,
      },
      details: { baselineResume, treatmentResume, recovered_handoff: recovered },
    };
  } finally {
    await baselineAionis.close();
    await treatmentAionis.close();
  }
}

function summarize(cases) {
  return {
    benchmark: 'openclaw_completion_v1',
    provider: 'glm',
    model: MODEL,
    cases: cases.length,
    baseline: {
      completed_rate: cases.filter((c) => c.baseline.completed).length / Math.max(cases.length, 1),
      avg_executed_steps: mean(cases.map((c) => c.baseline), 'executed_steps'),
      avg_total_tokens: mean(cases.map((c) => c.baseline), 'total_tokens'),
    },
    treatment: {
      completed_rate: cases.filter((c) => c.treatment.completed).length / Math.max(cases.length, 1),
      avg_executed_steps: mean(cases.map((c) => c.treatment), 'executed_steps'),
      avg_total_tokens: mean(cases.map((c) => c.treatment), 'total_tokens'),
      replay_dispatch_success_rate: cases.filter((c) => (c.treatment.replay_dispatch_count ?? 0) > 0 && c.treatment.completed).length / Math.max(cases.length, 1),
      handoff_resume_success_rate: cases.filter((c) => (c.treatment.handoff_store_count ?? 0) > 0 && c.treatment.completed).length / Math.max(cases.length, 1),
    },
  };
}

async function main() {
  const fixture = JSON.parse(await fs.readFile(FIXTURE_PATH, 'utf8'));
  const scenarios = SCENARIO_FILTER ? fixture.scenarios.filter((s) => s.id === SCENARIO_FILTER) : fixture.scenarios;
  if (scenarios.length === 0) throw new Error(`No scenarios matched BENCH_SCENARIO_ID=${SCENARIO_FILTER}`);

  const cases = [];
  const raw = [];
  for (const scenario of scenarios) {
    let result;
    if (scenario.kind === 'transport_retry_completion') result = await runReplayScenario(scenario);
    else if (scenario.kind === 'repo_budget_completion') result = await runRepoBudgetScenario(scenario);
    else if (scenario.kind === 'handoff_resume_completion') result = await runHandoffResumeScenario(scenario);
    else throw new Error(`unsupported scenario kind: ${scenario.kind}`);

    cases.push({ scenario_id: scenario.id, ...result });
    raw.push({ scenario_id: scenario.id, details: result.details });
  }

  const summary = summarize(cases);
  const artifactDir = path.join(ROOT, 'artifacts', 'openclaw-completion-benchmark', nowStamp());
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(path.join(artifactDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  await fs.writeFile(path.join(artifactDir, 'cases.jsonl'), `${cases.map((row) => JSON.stringify(row)).join('\n')}\n`);
  await fs.writeFile(path.join(artifactDir, 'completion-events.jsonl'), `${raw.map((row) => JSON.stringify(row)).join('\n')}\n`);
  console.log(JSON.stringify({ artifactDir, summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
