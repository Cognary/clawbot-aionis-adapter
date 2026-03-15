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
const FIXTURE_PATH = path.join(ROOT, 'fixtures', 'real-workflow-scenarios-v1.json');
const MODEL_PROVIDER = process.env.BENCH_MODEL_PROVIDER ?? ((process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENAI_API_KEY) ? 'gemini' : 'glm');
const API_BASE_URL = MODEL_PROVIDER === 'gemini'
  ? (process.env.GEMINI_BASE_URL ?? process.env.GOOGLE_OPENAI_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta/openai')
  : (process.env.GLM_BASE_URL ?? 'https://open.bigmodel.cn/api/paas/v4');
const API_KEY = MODEL_PROVIDER === 'gemini'
  ? (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? process.env.GOOGLE_GENAI_API_KEY)
  : (process.env.ZHIPU_API_KEY ?? process.env.GLM_API_KEY);
const MODEL = MODEL_PROVIDER === 'gemini'
  ? (process.env.GEMINI_MODEL ?? 'gemini-2.5-flash')
  : (process.env.GLM_MODEL ?? 'glm-5');
const MAX_MODEL_RETRIES = Number(process.env.MODEL_MAX_RETRIES ?? process.env.GLM_MAX_RETRIES ?? process.env.GEMINI_MAX_RETRIES ?? 3);
const MODEL_REQUEST_TIMEOUT_MS = Number(process.env.MODEL_REQUEST_TIMEOUT_MS ?? process.env.GLM_REQUEST_TIMEOUT_MS ?? process.env.GEMINI_REQUEST_TIMEOUT_MS ?? 30000);
const REPEATS = Math.max(Number(process.env.BENCH_REPEATS ?? 1), 1);
const SCENARIO_FILTER = process.env.BENCH_SCENARIO_ID ?? '';

if (!API_KEY) {
  if (MODEL_PROVIDER === 'gemini') {
    console.error('Missing GEMINI_API_KEY, GOOGLE_API_KEY, or GOOGLE_GENAI_API_KEY');
  } else {
    console.error('Missing ZHIPU_API_KEY or GLM_API_KEY');
  }
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
function includesAny(text, candidates) { const hay = String(text ?? '').toLowerCase(); return candidates.some((c) => hay.includes(String(c).toLowerCase())); }
function arrayIncludesAny(values, candidates) { const normalized = values.map((v) => String(v).toLowerCase()); return candidates.some((c) => normalized.some((v) => v.includes(String(c).toLowerCase()))); }
function resolvePlaceholders(value, variables) { return String(value).replace(/\$\{([A-Z_]+)\}/g, (_, key) => String(variables[key] ?? '')); }
function flattenText(value) {
  if (Array.isArray(value)) return value.map((item) => flattenText(item)).join(' ; ');
  if (value && typeof value === 'object') return Object.values(value).map((item) => flattenText(item)).join(' ; ');
  return String(value ?? '');
}
function asStringArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === 'string') return [value];
  if (value && typeof value === 'object') return Object.values(value).map((item) => String(item));
  return [];
}

function matchesExpectedFileTerms(value, expectedTerms) {
  const candidates = asStringArray(value)
    .flatMap((item) => String(item).split(/[,\n]/))
    .map((item) => item.trim())
    .filter(Boolean);
  return candidates.length > 0 && arrayIncludesAny(candidates, expectedTerms);
}

function materializeToolset(toolset, variables) {
  return toolset.map((tool) => ({
    ...tool,
    params: { ...tool.params, command: resolvePlaceholders(tool.params.command, variables) },
  }));
}

async function callModel(messages) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_MODEL_RETRIES; attempt += 1) {
    let timer = null;
    try {
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), MODEL_REQUEST_TIMEOUT_MS);
      const requestBody = {
        model: MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages,
      };
      if (MODEL_PROVIDER !== 'gemini') {
        requestBody.thinking = { type: 'disabled' };
      }
      const response = await fetch(`${API_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(requestBody),
      });
      clearTimeout(timer);
      timer = null;
      const data = await response.json();
      if (!response.ok) {
        const retryable = response.status >= 500 || response.status === 429;
        const error = new Error(`${MODEL_PROVIDER.toUpperCase()} request failed: ${response.status} ${JSON.stringify(data)}`);
        if (!retryable || attempt === MAX_MODEL_RETRIES) throw error;
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        continue;
      }
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new Error(`${MODEL_PROVIDER.toUpperCase()} response missing content: ${JSON.stringify(data)}`);
      const parsed = JSON.parse(content);
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
      if (attempt === MAX_MODEL_RETRIES) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw lastError ?? new Error(`${MODEL_PROVIDER.toUpperCase()} request failed`);
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
      res.end(JSON.stringify({
        scope: body.scope,
        selection: { selected, denied: selected === requested ? [] : [requested] },
        decision: { decision_id: `decision-${calls.toolsSelect}`, decision_uri: `aionis://decision/${calls.toolsSelect}`, selected_tool: selected },
      }));
      return;
    }
    if (req.url === '/v1/memory/tools/feedback') { calls.toolsFeedback += 1; res.end(JSON.stringify({ ok: true })); return; }
    if (req.url === '/v1/memory/write') { calls.write += 1; res.end(JSON.stringify({ ok: true })); return; }
    if (req.url === '/v1/handoff/store') {
      calls.handoffStore += 1;
      handoffs.push({
        anchor: body.anchor,
        summary: body.summary,
        handoff_text: body.handoff_text,
        file_path: body.file_path,
        repo_root: body.repo_root,
        handoff_kind: body.handoff_kind,
      });
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
  return {
    agentId: `agent-${baseId}-${agentName}`,
    sessionId: `sess-${baseId}`,
    sessionKey: `sess-${baseId}`,
    workspaceDir: repoPath,
    runId: `run-${baseId}-${agentName}`,
    toolName: 'unknown',
    toolCallId: `call-${baseId}-${agentName}`,
    trigger: 'real-workflow-scenario-benchmark',
  };
}

function lookupTool(toolset, name) { return toolset.find((tool) => tool.name === name) ?? null; }

function artifactSchema(agentName) {
  if (agentName === 'orchestrator') return 'artifact must include workflow_plan, target_surface, and exit_criteria. workflow_plan may be a string, list, or keyed object, but it must clearly describe staged execution.';
  if (agentName === 'triage') return 'artifact must include issue_hypothesis, auth_boundary, target_files, and evidence_points. target_files should be repo-relative file paths whenever possible.';
  if (agentName === 'patch') return 'artifact must include remediation_direction, target_files, validation_plan, and rollback_notes. validation_plan may be a list or a keyed object.';
  return 'artifact must include verdict (pass|fail|needs-more-work), reviewer_ready_packet, and rationale. reviewer_ready_packet must include issue_hypothesis, target_files, remediation_direction, validation_plan, rollback_notes, and reviewer_verdict.';
}

function buildMessages({ scenario, agent, toolset, history, carryover }) {
  const toolList = toolset.map((tool) => `- ${tool.name}: ${tool.description}`).join('\n');
  const historyText = history.length === 0 ? 'No prior tool calls.' : history.map((item) => `Step ${item.step}: tool=${item.toolName}; summary=${item.summary}`).join('\n');
  return [
    {
      role: 'system',
      content: [
        `You are the ${agent.name.toUpperCase()} agent in a realistic OpenClaw workflow scenario.`,
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
        `You are the ${agent.name.toUpperCase()} agent in a realistic OpenClaw workflow scenario.`,
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
  if (agentName === 'orchestrator') {
    const workflowPlan = flattenText(artifact.workflow_plan);
    const targetSurface = flattenText(artifact.target_surface);
    const exitCriteria = asStringArray(artifact.exit_criteria);
    return Boolean(
      workflowPlan.length > 24 &&
      (includesAny(targetSurface, expected.boundary_terms) || includesAny(targetSurface, expected.file_terms)) &&
      exitCriteria.length >= 1
    );
  }
  if (agentName === 'triage') {
    const evidencePoints = asStringArray(artifact.evidence_points);
    const authBoundary = flattenText(artifact.auth_boundary);
    return Boolean(
      typeof artifact.issue_hypothesis === 'string' && includesAny(artifact.issue_hypothesis, expected.boundary_terms) &&
      authBoundary.length > 24 &&
      matchesExpectedFileTerms(artifact.target_files, expected.file_terms) &&
      evidencePoints.length >= 2
    );
  }
  if (agentName === 'patch') {
    const validationText = flattenText(artifact.validation_plan);
    const rollbackText = flattenText(artifact.rollback_notes);
    return Boolean(
      flattenText(artifact.remediation_direction).length > 20 &&
      matchesExpectedFileTerms(artifact.target_files, expected.file_terms) &&
      validationText.length > 20 && includesAny(validationText, expected.validation_terms) &&
      rollbackText.length > 20 && includesAny(rollbackText, expected.rollback_terms)
    );
  }

  const packet = artifact.reviewer_ready_packet;
  const validationText = flattenText(packet?.validation_plan);
  const rollbackText = flattenText(packet?.rollback_notes);
  const verdict = String(artifact.verdict ?? '').toLowerCase();
  const reviewerVerdict = String(packet?.reviewer_verdict ?? '').toLowerCase();
  const normalizedReviewerVerdict = reviewerVerdict.replace(/[_\s-]+/g, ' ').trim();
  return Boolean(
    ['pass', 'needs-more-work', 'ready-for-implementation'].includes(verdict) &&
    typeof artifact.rationale === 'string' && artifact.rationale.length > 16 &&
    packet && typeof packet === 'object' &&
    typeof packet.issue_hypothesis === 'string' && includesAny(packet.issue_hypothesis, expected.boundary_terms) &&
    matchesExpectedFileTerms(packet.target_files, expected.file_terms) &&
    flattenText(packet.remediation_direction).length > 20 &&
    validationText.length > 20 && includesAny(validationText, expected.validation_terms) &&
    rollbackText.length > 20 && includesAny(rollbackText, expected.rollback_terms) &&
    (
      ['pass', 'approve', 'approved', 'needs-more-work', 'ready-for-implementation'].includes(reviewerVerdict) ||
      ['pass with conditions', 'conditional pass', 'ready with conditions'].includes(normalizedReviewerVerdict) ||
      reviewerVerdict.length > 20
    )
  );
}

function carryoverForBaseline(agentName, artifact) {
  if (!artifact) return null;
  if (agentName === 'orchestrator') {
    return excerpt(`Previous planner note: stay on the auth drift surface and produce a reviewer-ready packet. Target surface: ${flattenText(artifact.target_surface)}`, 220);
  }
  if (agentName === 'triage') {
    return excerpt(`Previous triage note: suspected auth boundary is ${artifact.auth_boundary}.`, 220);
  }
  if (agentName === 'patch') {
    return excerpt(`Previous patch note: remediation direction is ${flattenText(artifact.remediation_direction)}.`, 220);
  }
  return excerpt(String(artifact.rationale ?? ''), 220);
}

function handoffText(agentName, artifact) {
  if (agentName === 'orchestrator') return `Workflow plan: ${flattenText(artifact.workflow_plan)}\nTarget surface: ${flattenText(artifact.target_surface)}\nExit criteria: ${asStringArray(artifact.exit_criteria).join('; ')}`;
  if (agentName === 'triage') return `Issue hypothesis: ${artifact.issue_hypothesis}\nAuth boundary: ${artifact.auth_boundary}\nTarget files: ${asStringArray(artifact.target_files).join(', ')}`;
  if (agentName === 'patch') {
    const plan = flattenText(artifact.validation_plan);
    return `Remediation: ${artifact.remediation_direction}\nValidation: ${plan}\nRollback: ${artifact.rollback_notes}`;
  }
  return `Verdict: ${artifact.verdict}\nRationale: ${artifact.rationale}`;
}

async function storeHandoff(baseUrl, scenario, agentName, artifact, repoPath) {
  const summary = agentName === 'orchestrator'
    ? artifact.workflow_plan
    : agentName === 'triage'
      ? artifact.issue_hypothesis
      : agentName === 'patch'
        ? artifact.remediation_direction
        : artifact.rationale;
  const targetFiles = Array.isArray(artifact.target_files)
    ? artifact.target_files
    : Array.isArray(artifact.target_surface)
      ? artifact.target_surface
      : typeof artifact.target_surface === 'string'
        ? [artifact.target_surface]
        : artifact.target_surface && typeof artifact.target_surface === 'object'
          ? Object.values(artifact.target_surface).map((item) => String(item))
          : []
    ;
  const packetTargetFiles = Array.isArray(artifact.reviewer_ready_packet?.target_files)
        ? artifact.reviewer_ready_packet.target_files
        : [];
  const response = await fetch(`${baseUrl}/v1/handoff/store`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      anchor: `${scenario.id}-${agentName}`,
      summary,
      handoff_text: handoffText(agentName, artifact),
      handoff_kind: 'task_handoff',
      repo_root: repoPath,
      file_path: targetFiles[0] ?? packetTargetFiles[0] ?? 'unknown',
    }),
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
  const seenHashes = new Set();
  const ctx = stageCtx(baseId, repoPath, agent.name);

  if (mode === 'treatment') {
    aionis.setStage(scenario.aionis?.[agent.name] ?? { context_text: '', selection_map: {} });
    const startResult = await host.emit('before_agent_start', {
      prompt: scenario.top_level_prompt,
      messages: toolset.map((tool) => ({ toolName: tool.name })),
    }, ctx);
    injectedContext = [carryover, startResult?.prependContext].filter(Boolean).join('\n');
  }

  for (let step = 1; step <= Number(agent.max_steps ?? 1); step += 1) {
    const { parsed, usage } = await callModel(buildMessages({ scenario, agent, toolset, history, carryover: injectedContext }));
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
  }

  if (!artifact) {
    const { parsed, usage } = await callModel(buildSynthesisMessages({ scenario, agent, history, carryover: injectedContext }));
    tokenBreakdown.push({ step: 'synthesis', ...usage, model_decision: parsed });
    if (parsed.action === 'finish' && validateArtifact(agent.name, parsed.artifact, scenario.expected)) {
      artifact = parsed.artifact;
      note = parsed.note ?? null;
    }
  }

  await fs.writeFile(path.join(runDir, `${agent.name}.history.json`), `${JSON.stringify(history, null, 2)}\n`);
  if (artifact) await fs.writeFile(path.join(runDir, `${agent.name}.json`), `${JSON.stringify(artifact, null, 2)}\n`);

  if (mode === 'treatment') {
    await host.emit('agent_end', {
      messages: artifact ? [{ role: 'assistant', content: JSON.stringify(artifact) }] : [],
      success: Boolean(artifact) || controlledStop,
      error: Boolean(artifact) || controlledStop ? undefined : stopReason ?? `${agent.name}_failed`,
      durationMs: 0,
    }, ctx);
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

function isReviewerReady(reviewArtifact) {
  if (!reviewArtifact?.reviewer_ready_packet) return false;
  const verdict = String(reviewArtifact.verdict ?? '').toLowerCase();
  return verdict === 'pass' || verdict === 'needs-more-work' || verdict === 'ready-for-implementation';
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
  const t0 = Date.now();

  if (mode === 'treatment') {
    host.pluginConfig = {
      baseUrl: aionis.baseUrl,
      tenantId: 'tenant-real-workflow',
      actor: 'real-workflow-benchmark',
      ...scenario.plugin_config,
    };
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

  const reviewArtifact = stageResults.at(-1)?.artifact ?? null;
  const workflowCompleted = stageResults.length === scenario.agents.length && stageResults.every((stage) => stage.success);
  const reviewerReady = workflowCompleted && isReviewerReady(reviewArtifact);

  return {
    workflow_completed: workflowCompleted,
    reviewer_ready: reviewerReady,
    total_tokens: sum(stageResults, 'total_tokens'),
    prompt_tokens: sum(stageResults, 'prompt_tokens'),
    completion_tokens: sum(stageResults, 'completion_tokens'),
    tool_call_count: sum(stageResults, 'executed_steps'),
    broad_tool_call_count: sum(stageResults, 'broad_tool_calls'),
    rediscovery_reads: sum(stageResults, 'rediscovery_reads'),
    handoff_store_count: aionis?.calls?.handoffStore ?? 0,
    context_assemble_count: aionis?.calls?.contextAssemble ?? 0,
    tools_select_count: aionis?.calls?.toolsSelect ?? 0,
    wall_clock_ms: Date.now() - t0,
    final_review_artifact: reviewArtifact,
    stage_results: stageResults,
  };
}

function summarize(cases) {
  const baselineRows = cases.map((row) => row.baseline);
  const treatmentRows = cases.map((row) => row.treatment);
  const baselineReady = baselineRows.filter((row) => row.reviewer_ready);
  const treatmentReady = treatmentRows.filter((row) => row.reviewer_ready);
  const baselineCompleted = baselineRows.filter((row) => row.workflow_completed);
  const treatmentCompleted = treatmentRows.filter((row) => row.workflow_completed);
  return {
    benchmark: 'openclaw_real_workflow_scenario_v1',
    provider: MODEL_PROVIDER,
    model: MODEL,
    repetitions: REPEATS,
    cases: cases.length,
    baseline: {
      reviewer_ready_rate: ratio(baselineReady.length, baselineRows.length),
      workflow_completed_rate: ratio(baselineCompleted.length, baselineRows.length),
      avg_total_tokens: mean(baselineRows, 'total_tokens'),
      avg_wall_clock_ms: mean(baselineRows, 'wall_clock_ms'),
      avg_tool_call_count: mean(baselineRows, 'tool_call_count'),
      avg_broad_tool_call_count: mean(baselineRows, 'broad_tool_call_count'),
      avg_rediscovery_reads: mean(baselineRows, 'rediscovery_reads'),
      tokens_per_reviewer_ready_run: baselineReady.length > 0 ? sum(baselineReady, 'total_tokens') / baselineReady.length : null,
    },
    treatment: {
      reviewer_ready_rate: ratio(treatmentReady.length, treatmentRows.length),
      workflow_completed_rate: ratio(treatmentCompleted.length, treatmentRows.length),
      avg_total_tokens: mean(treatmentRows, 'total_tokens'),
      avg_wall_clock_ms: mean(treatmentRows, 'wall_clock_ms'),
      avg_tool_call_count: mean(treatmentRows, 'tool_call_count'),
      avg_broad_tool_call_count: mean(treatmentRows, 'broad_tool_call_count'),
      avg_rediscovery_reads: mean(treatmentRows, 'rediscovery_reads'),
      avg_handoff_store_count: mean(treatmentRows, 'handoff_store_count'),
      avg_context_assemble_count: mean(treatmentRows, 'context_assemble_count'),
      tokens_per_reviewer_ready_run: treatmentReady.length > 0 ? sum(treatmentReady, 'total_tokens') / treatmentReady.length : null,
    },
    delta: {
      reviewer_ready_gain: ratio(treatmentReady.length, treatmentRows.length) - ratio(baselineReady.length, baselineRows.length),
      workflow_completion_gain: ratio(treatmentCompleted.length, treatmentRows.length) - ratio(baselineCompleted.length, baselineRows.length),
      avg_token_delta: mean(treatmentRows, 'total_tokens') - mean(baselineRows, 'total_tokens'),
      avg_rediscovery_delta: mean(treatmentRows, 'rediscovery_reads') - mean(baselineRows, 'rediscovery_reads'),
    },
  };
}

async function main() {
  const fixture = JSON.parse(await fs.readFile(FIXTURE_PATH, 'utf8'));
  const scenarios = SCENARIO_FILTER ? fixture.scenarios.filter((scenario) => scenario.id === SCENARIO_FILTER) : fixture.scenarios;
  if (scenarios.length === 0) throw new Error(`No scenarios matched BENCH_SCENARIO_ID=${SCENARIO_FILTER}`);
  const artifactDir = path.join(ROOT, 'artifacts', 'openclaw-real-workflow-scenario', nowStamp());
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
