import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import plugin from '../dist/plugin.js';

const execFile = promisify(execFileCb);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_PATH = path.join(ROOT, 'fixtures', 'one-prompt-multi-agent-benchmark-scenarios-v1.json');
const API_BASE_URL = process.env.GLM_BASE_URL ?? 'https://open.bigmodel.cn/api/paas/v4';
const API_KEY = process.env.ZHIPU_API_KEY ?? process.env.GLM_API_KEY;
const MODEL = process.env.GLM_MODEL ?? 'glm-5';
const MAX_GLM_RETRIES = Number(process.env.GLM_MAX_RETRIES ?? 3);
const GLM_REQUEST_TIMEOUT_MS = Number(process.env.GLM_REQUEST_TIMEOUT_MS ?? 30000);
const REPEATS = Math.max(Number(process.env.BENCH_REPEATS ?? 1), 1);
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
  on(eventName, handler) { this.handlers.set(eventName, handler); }
  async emit(eventName, event, ctx = {}) {
    const handler = this.handlers.get(eventName);
    if (!handler) throw new Error(`missing handler for ${eventName}`);
    return await handler(event, ctx);
  }
}

function nowStamp() { return new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14); }
function sha1(value) { return crypto.createHash('sha1').update(String(value)).digest('hex'); }
function mean(items, key) { return items.reduce((s, i) => s + Number(i[key] ?? 0), 0) / Math.max(items.length, 1); }
function sum(items, key) { return items.reduce((s, i) => s + Number(i[key] ?? 0), 0); }
function ratio(n, d) { return d > 0 ? n / d : 0; }
function excerpt(value, limit = 400) { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit); }
function resolvePlaceholders(value, variables) { return String(value).replace(/\$\{([A-Z_]+)\}/g, (_, key) => String(variables[key] ?? '')); }
function includesAny(text, candidates) { const hay = String(text ?? '').toLowerCase(); return candidates.some((c) => hay.includes(String(c).toLowerCase())); }
function arrayIncludesAny(values, candidates) { const normalized = values.map((v) => String(v).toLowerCase()); return candidates.some((c) => normalized.some((v) => v.includes(String(c).toLowerCase()))); }

function materializeToolset(toolset, variables) {
  return toolset.map((tool) => ({ ...tool, params: { ...tool.params, command: resolvePlaceholders(tool.params.command, variables) } }));
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
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ model: MODEL, temperature: 0, thinking: { type: 'disabled' }, response_format: { type: 'json_object' }, messages }),
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
      const parsed = JSON.parse(content);
      return { parsed, usage: { prompt_tokens: Number(data?.usage?.prompt_tokens ?? 0), completion_tokens: Number(data?.usage?.completion_tokens ?? 0), total_tokens: Number(data?.usage?.total_tokens ?? 0) } };
    } catch (error) {
      lastError = error;
      if (timer) clearTimeout(timer);
      if (attempt === MAX_GLM_RETRIES) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw lastError ?? new Error('GLM request failed');
}

async function executeShell(command, cwd) {
  try {
    const { stdout, stderr } = await execFile('bash', ['-lc', command], { cwd, env: { ...process.env, CI: '1' }, maxBuffer: 10 * 1024 * 1024 });
    return { result: `${stdout}${stderr}`.trim() || 'ok' };
  } catch (error) {
    return { error: `command_failed:${error.code ?? 'unknown'}`, result: `${error.stdout ?? ''}${error.stderr ?? ''}`.trim().slice(0, 4000) };
  }
}

async function startAionisMock() {
  const calls = { contextAssemble: 0, rulesEvaluate: 0, toolsSelect: 0, toolsFeedback: 0, write: 0, handoffStore: 0 };
  const handoffs = [];
  let currentStage = { context_text: '', selection_map: {} };
  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    res.setHeader('content-type', 'application/json');
    if (req.url === '/v1/memory/context/assemble') {
      calls.contextAssemble += 1;
      res.end(JSON.stringify({ scope: body.scope, layered_context: { merged_text: currentStage.context_text } }));
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
      const selected = currentStage.selection_map?.[requested] ?? requested;
      res.end(JSON.stringify({ scope: body.scope, selection: { selected, denied: selected === requested ? [] : [requested] }, decision: { decision_id: `decision-${calls.toolsSelect}`, decision_uri: `aionis://decision/${calls.toolsSelect}`, selected_tool: selected } }));
      return;
    }
    if (req.url === '/v1/memory/tools/feedback') { calls.toolsFeedback += 1; res.end(JSON.stringify({ ok: true })); return; }
    if (req.url === '/v1/memory/write') { calls.write += 1; res.end(JSON.stringify({ ok: true })); return; }
    if (req.url === '/v1/handoff/store') {
      calls.handoffStore += 1;
      handoffs.push({ anchor: body.anchor, summary: body.summary, handoff_text: body.handoff_text, file_path: body.file_path, repo_root: body.repo_root, handoff_kind: body.handoff_kind });
      res.end(JSON.stringify({ ok: true, handoff: { anchor: body.anchor ?? `handoff-${calls.handoffStore}` } }));
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
    setStage(config) { currentStage = config ?? { context_text: '', selection_map: {} }; },
    latestHandoff() { return handoffs.at(-1) ?? null; },
    async close() { await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve())); },
  };
}

function stageCtx(baseId, repoPath, agentName) {
  return { agentId: `agent-${baseId}-${agentName}`, sessionId: `sess-${baseId}`, sessionKey: `sess-${baseId}`, workspaceDir: repoPath, runId: `run-${baseId}-${agentName}`, toolName: 'unknown', toolCallId: `call-${baseId}-${agentName}`, trigger: 'one-prompt-multi-agent-benchmark' };
}

function lookupTool(toolset, name) { return toolset.find((tool) => tool.name === name) ?? null; }

function artifactSchema(agentName) {
  if (agentName === 'scout') return 'artifact must include boundary, target_files, and handoff_brief.';
  if (agentName === 'fixer') return 'artifact must include fix_summary, target_files, and residual_risk.';
  if (agentName === 'validator') return 'artifact must include validation_plan and focus_reason.';
  return 'artifact must include verdict (pass|fail|needs-more-work) and rationale.';
}

function buildMessages({ scenario, agent, toolset, history, carryover }) {
  const toolList = toolset.map((tool) => `- ${tool.name}: ${tool.description}`).join('\n');
  const historyText = history.length === 0 ? 'No prior tool calls.' : history.map((item) => `Step ${item.step}: tool=${item.toolName}; summary=${item.summary}`).join('\n');
  return [
    {
      role: 'system',
      content: [
        `You are the ${agent.name.toUpperCase()} agent in a one-prompt multi-agent OpenClaw workflow.`,
        'Return a JSON object with keys: action, tool, note, artifact.',
        'action must be either "use" or "finish".',
        `tool must be one of: ${toolset.map((tool) => tool.name).join(', ')} or null when action is finish.`,
        'Do not invent repo files or commands you have not seen.',
        artifactSchema(agent.name),
        'Return JSON only.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `Top-level task: ${scenario.top_level_prompt}`,
        `Current agent goal: ${agent.goal}`,
        carryover ? `Carryover context: ${carryover}` : null,
        `Available tools:\n${toolList}`,
        `History:\n${historyText}`,
      ].filter(Boolean).join('\n\n'),
    },
  ];
}

function buildSynthesisMessages({ scenario, agent, history, carryover }) {
  const historyText = history.length === 0 ? 'No tool evidence was collected.' : history.map((item) => `Step ${item.step}: tool=${item.toolName}; summary=${item.summary}`).join('\n');
  return [
    {
      role: 'system',
      content: [
        `You are the ${agent.name.toUpperCase()} agent in a one-prompt multi-agent OpenClaw workflow.`,
        'You may not request more tools. Return a JSON object with keys: action, tool, note, artifact.',
        'action must be "finish" and tool must be null.',
        artifactSchema(agent.name),
        'Use only the task, carryover, and collected evidence. Return JSON only.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `Top-level task: ${scenario.top_level_prompt}`,
        `Current agent goal: ${agent.goal}`,
        carryover ? `Carryover context: ${carryover}` : null,
        `Collected evidence:\n${historyText}`,
      ].filter(Boolean).join('\n\n'),
    },
  ];
}

function validateArtifact(agentName, artifact, expected) {
  if (!artifact || typeof artifact !== 'object') return false;
  if (agentName === 'scout') {
    return Boolean(typeof artifact.boundary === 'string' && includesAny(artifact.boundary, expected.boundary_terms) && Array.isArray(artifact.target_files) && arrayIncludesAny(artifact.target_files, expected.boundary_terms) && typeof artifact.handoff_brief === 'string');
  }
  if (agentName === 'fixer') {
    return Boolean(typeof artifact.fix_summary === 'string' && artifact.fix_summary.length > 20 && Array.isArray(artifact.target_files) && arrayIncludesAny(artifact.target_files, expected.boundary_terms) && typeof artifact.residual_risk === 'string');
  }
  if (agentName === 'validator') {
    const plan = artifact.validation_plan;
    const planText = Array.isArray(plan)
      ? plan.join(' ; ')
      : plan && typeof plan === 'object'
        ? JSON.stringify(plan)
        : String(plan ?? '');
    return Boolean(planText.length > 20 && includesAny(planText, expected.validation_terms) && typeof artifact.focus_reason === 'string' && artifact.focus_reason.length > 12);
  }
  return Boolean(artifact.verdict === 'pass' && typeof artifact.rationale === 'string' && artifact.rationale.length > 12);
}

function carryoverForBaseline(agentName, artifact) {
  if (!artifact) return null;
  if (agentName === 'scout') return excerpt(artifact.handoff_brief ?? artifact.boundary ?? '', 140);
  if (agentName === 'fixer') return excerpt(artifact.fix_summary ?? '', 120);
  if (agentName === 'validator') return excerpt(Array.isArray(artifact.validation_plan) ? artifact.validation_plan.join('; ') : '', 120);
  return null;
}

function handoffText(agentName, artifact) {
  if (agentName === 'scout') return `Boundary: ${artifact.boundary}\nTarget files: ${(artifact.target_files ?? []).join(', ')}\nBrief: ${artifact.handoff_brief}`;
  if (agentName === 'fixer') return `Fix summary: ${artifact.fix_summary}\nTarget files: ${(artifact.target_files ?? []).join(', ')}\nResidual risk: ${artifact.residual_risk}`;
  if (agentName === 'validator') { const plan = Array.isArray(artifact.validation_plan) ? artifact.validation_plan.join('; ') : typeof artifact.validation_plan === 'object' ? JSON.stringify(artifact.validation_plan) : String(artifact.validation_plan ?? ''); return `Validation plan: ${plan}\nReason: ${artifact.focus_reason}`; }
  return `Verdict: ${artifact.verdict}\nRationale: ${artifact.rationale}`;
}

async function storeHandoff(baseUrl, scenario, agentName, artifact, repoPath) {
  const summary = agentName === 'scout' ? artifact.boundary : agentName === 'fixer' ? artifact.fix_summary : agentName === 'validator' ? (Array.isArray(artifact.validation_plan) ? artifact.validation_plan.join('; ') : typeof artifact.validation_plan === 'object' ? JSON.stringify(artifact.validation_plan) : String(artifact.validation_plan ?? '')) : artifact.rationale;
  const targetFiles = Array.isArray(artifact.target_files) ? artifact.target_files : [];
  const response = await fetch(`${baseUrl}/v1/handoff/store`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ anchor: `${scenario.id}-${agentName}`, summary, handoff_text: handoffText(agentName, artifact), handoff_kind: `${agentName}_stage`, repo_root: repoPath, file_path: targetFiles[0] })
  });
  if (!response.ok) throw new Error(`handoff/store failed: ${response.status}`);
}

async function runAgent({ scenario, agent, mode, host, aionis, repoPath, runDir, carryover, baseId }) {
  const toolset = materializeToolset(agent.toolset, { REPO_PATH: repoPath, RUN_DIR: runDir });
  const history = [];
  const tokenBreakdown = [];
  let executedSteps = 0;
  let broadToolCalls = 0;
  let rediscoveryReads = 0;
  let artifact = null;
  let note = null;
  let controlledStop = false;
  let stopReason = null;
  let injectedContext = carryover;
  const ctx = stageCtx(baseId, repoPath, agent.name);

  if (mode === 'treatment') {
    aionis.setStage(scenario.aionis?.[agent.name] ?? { context_text: '', selection_map: {} });
    const startResult = await host.emit('before_agent_start', { prompt: scenario.top_level_prompt, messages: toolset.map((tool) => ({ toolName: tool.name })) }, ctx);
    injectedContext = [carryover, startResult?.prependContext].filter(Boolean).join('\n');
  }

  const seenHashes = new Set();
  for (let step = 1; step <= Number(agent.max_steps ?? 1); step += 1) {
    const { parsed, usage } = await callGlm(buildMessages({ scenario, agent, toolset, history, carryover: injectedContext }));
    tokenBreakdown.push({ step, ...usage, model_decision: parsed });
    if (parsed.action === 'finish') {
      if (validateArtifact(agent.name, parsed.artifact, scenario.expected)) {
        artifact = parsed.artifact;
        note = parsed.note ?? null;
        break;
      }
      history.push({ step: `feedback-${step}`, toolName: 'stage-feedback', summary: 'Finish rejected: artifact too weak or missing required fields.', observationHash: sha1(`feedback-${step}`) });
      continue;
    }

    let tool = lookupTool(toolset, parsed.tool);
    if (!tool) {
      history.push({ step: `feedback-${step}`, toolName: 'stage-feedback', summary: `Unknown tool ${parsed.tool ?? 'null'} requested.`, observationHash: sha1(`unknown-${step}`) });
      continue;
    }

    if (mode === 'treatment') {
      const before = await host.emit('before_tool_call', { toolName: tool.name, params: tool.params, runId: ctx.runId, toolCallId: `${ctx.toolCallId}-${step}` }, { ...ctx, toolName: tool.name });
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

    const execution = await executeShell(String(tool.params.command ?? ''), repoPath);
    executedSteps += 1;
    if (tool.name.includes('broad')) broadToolCalls += 1;
    const summary = execution.error ? `error:${execution.error}:${excerpt(execution.result, 220)}` : excerpt(execution.result, 220);
    const observationHash = sha1(summary);
    if (seenHashes.has(observationHash)) rediscoveryReads += 1;
    seenHashes.add(observationHash);
    history.push({ step: executedSteps, toolName: tool.name, summary, observationHash });

    if (mode === 'treatment') {
      await host.emit('after_tool_call', { toolName: tool.name, params: tool.params, runId: ctx.runId, toolCallId: `${ctx.toolCallId}-${step}`, result: execution.result, error: execution.error, durationMs: 10 }, { ...ctx, toolName: tool.name });
    }
  }

  if (!artifact) {
    const { parsed, usage } = await callGlm(buildSynthesisMessages({ scenario, agent, history, carryover: injectedContext }));
    tokenBreakdown.push({ step: 'synthesis', ...usage, model_decision: parsed });
    if (parsed.action === 'finish' && validateArtifact(agent.name, parsed.artifact, scenario.expected)) {
      artifact = parsed.artifact;
      note = parsed.note ?? null;
    }
  }

  await fs.writeFile(path.join(runDir, `${agent.name}.history.json`), `${JSON.stringify(history, null, 2)}\n`);
  if (artifact) await fs.writeFile(path.join(runDir, `${agent.name}.json`), `${JSON.stringify(artifact, null, 2)}\n`);

  if (mode === 'treatment') {
    await host.emit('agent_end', { messages: artifact ? [{ role: 'assistant', content: JSON.stringify(artifact) }] : [], success: Boolean(artifact) || controlledStop, error: Boolean(artifact) || controlledStop ? undefined : stopReason ?? `${agent.name}_failed`, durationMs: 0 }, ctx);
  }

  return {
    agent: agent.name,
    success: Boolean(artifact),
    artifact,
    note,
    executed_steps: executedSteps,
    broad_tool_calls: broadToolCalls,
    rediscovery_reads: rediscoveryReads,
    controlled_stop: controlledStop,
    stop_reason: stopReason,
    prompt_tokens: sum(tokenBreakdown, 'prompt_tokens'),
    completion_tokens: sum(tokenBreakdown, 'completion_tokens'),
    total_tokens: sum(tokenBreakdown, 'total_tokens'),
    token_breakdown: tokenBreakdown,
    history,
  };
}

async function runArm({ scenario, mode, repetition, artifactDir }) {
  const repoPath = scenario.repo_path;
  const runDir = path.join(artifactDir, `${scenario.id}-${mode}-r${repetition}`);
  await fs.mkdir(runDir, { recursive: true });
  const baseId = `${scenario.id}-${mode}-r${repetition}`;
  const host = mode === 'treatment' ? new MockOpenClawHost() : null;
  const aionis = mode === 'treatment' ? await startAionisMock() : null;
  const stageResults = [];
  let carryover = null;

  if (mode === 'treatment') {
    host.pluginConfig = { baseUrl: aionis.baseUrl, tenantId: 'tenant-one-prompt-multi-agent', actor: 'one-prompt-multi-agent-benchmark', ...scenario.plugin_config };
    plugin.register(host);
    await host.emit('session_start', { sessionId: `sess-${baseId}`, sessionKey: `sess-${baseId}` }, stageCtx(baseId, repoPath, 'session'));
  }

  try {
    for (const agent of scenario.agents) {
      const result = await runAgent({ scenario, agent, mode, host, aionis, repoPath, runDir, carryover, baseId });
      stageResults.push(result);
      if (!result.success) break;
      if (mode === 'treatment') {
        await storeHandoff(aionis.baseUrl, scenario, agent.name, result.artifact, repoPath);
        carryover = aionis.latestHandoff()?.handoff_text ?? null;
      } else {
        carryover = carryoverForBaseline(agent.name, result.artifact);
      }
    }
  } finally {
    if (mode === 'treatment') {
      await host.emit('session_end', { sessionId: `sess-${baseId}`, sessionKey: `sess-${baseId}` }, stageCtx(baseId, repoPath, 'session'));
      await aionis.close();
    }
  }

  const completed = stageResults.length === scenario.agents.length && stageResults.every((stage) => stage.success) && stageResults.at(-1)?.artifact?.verdict === 'pass';
  return {
    completed,
    total_tokens: sum(stageResults, 'total_tokens'),
    prompt_tokens: sum(stageResults, 'prompt_tokens'),
    completion_tokens: sum(stageResults, 'completion_tokens'),
    tool_call_count: sum(stageResults, 'executed_steps'),
    broad_tool_call_count: sum(stageResults, 'broad_tool_calls'),
    rediscovery_reads: sum(stageResults, 'rediscovery_reads'),
    handoff_store_count: aionis?.calls?.handoffStore ?? 0,
    context_assemble_count: aionis?.calls?.contextAssemble ?? 0,
    tools_select_count: aionis?.calls?.toolsSelect ?? 0,
    stage_results: stageResults,
  };
}

function summarize(cases) {
  const baselineRows = cases.map((row) => row.baseline);
  const treatmentRows = cases.map((row) => row.treatment);
  const baselineCompleted = baselineRows.filter((row) => row.completed);
  const treatmentCompleted = treatmentRows.filter((row) => row.completed);
  return {
    benchmark: 'openclaw_one_prompt_multi_agent_v1',
    provider: 'glm',
    model: MODEL,
    repetitions: REPEATS,
    cases: cases.length,
    baseline: {
      completed_rate: ratio(baselineCompleted.length, baselineRows.length),
      avg_total_tokens: mean(baselineRows, 'total_tokens'),
      avg_tool_call_count: mean(baselineRows, 'tool_call_count'),
      avg_broad_tool_call_count: mean(baselineRows, 'broad_tool_call_count'),
      avg_rediscovery_reads: mean(baselineRows, 'rediscovery_reads'),
      tokens_per_completed_task: baselineCompleted.length > 0 ? sum(baselineCompleted, 'total_tokens') / baselineCompleted.length : null,
    },
    treatment: {
      completed_rate: ratio(treatmentCompleted.length, treatmentRows.length),
      avg_total_tokens: mean(treatmentRows, 'total_tokens'),
      avg_tool_call_count: mean(treatmentRows, 'tool_call_count'),
      avg_broad_tool_call_count: mean(treatmentRows, 'broad_tool_call_count'),
      avg_rediscovery_reads: mean(treatmentRows, 'rediscovery_reads'),
      avg_handoff_store_count: mean(treatmentRows, 'handoff_store_count'),
      avg_context_assemble_count: mean(treatmentRows, 'context_assemble_count'),
      tokens_per_completed_task: treatmentCompleted.length > 0 ? sum(treatmentCompleted, 'total_tokens') / treatmentCompleted.length : null,
    },
    delta: {
      completion_gain: ratio(treatmentCompleted.length, treatmentRows.length) - ratio(baselineCompleted.length, baselineRows.length),
      avg_token_delta: mean(treatmentRows, 'total_tokens') - mean(baselineRows, 'total_tokens'),
      avg_rediscovery_delta: mean(treatmentRows, 'rediscovery_reads') - mean(baselineRows, 'rediscovery_reads'),
    },
  };
}

async function main() {
  const fixture = JSON.parse(await fs.readFile(FIXTURE_PATH, 'utf8'));
  const scenarios = SCENARIO_FILTER ? fixture.scenarios.filter((scenario) => scenario.id === SCENARIO_FILTER) : fixture.scenarios;
  if (scenarios.length === 0) throw new Error(`No scenarios matched BENCH_SCENARIO_ID=${SCENARIO_FILTER}`);
  const artifactDir = path.join(ROOT, 'artifacts', 'openclaw-one-prompt-multi-agent-benchmark', nowStamp());
  await fs.mkdir(artifactDir, { recursive: true });
  const cases = [];
  for (const scenario of scenarios) {
    for (let repetition = 1; repetition <= REPEATS; repetition += 1) {
      const baseline = await runArm({ scenario, mode: 'baseline', repetition, artifactDir });
      const treatment = await runArm({ scenario, mode: 'treatment', repetition, artifactDir });
      cases.push({ scenario_id: scenario.id, repetition, baseline, treatment });
    }
  }
  const summary = summarize(cases);
  await fs.writeFile(path.join(artifactDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  await fs.writeFile(path.join(artifactDir, 'cases.jsonl'), `${cases.map((row) => JSON.stringify(row)).join('\n')}\n`);
  console.log(JSON.stringify({ artifactDir, summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
