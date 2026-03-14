import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

import plugin from '../dist/plugin.js';

const execFile = promisify(execFileCb);
const ROOT = '/Volumes/ziel/openclaw-aionis-adapter';
const FIXTURE_PATH = path.join(ROOT, 'fixtures', 'multi-agent-benchmark-scenarios-v1.json');
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

function sum(items, key) {
  return items.reduce((acc, item) => acc + Number(item[key] ?? 0), 0);
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function excerpt(value, limit = 600) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function resolvePlaceholders(value, variables) {
  return String(value).replace(/\$\{([A-Z_]+)\}/g, (_, key) => String(variables[key] ?? ''));
}

function materializeToolset(toolset, variables) {
  return toolset.map((tool) => ({
    ...tool,
    params: {
      ...tool.params,
      command: resolvePlaceholders(tool.params.command, variables),
    },
  }));
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
  const calls = {
    contextAssemble: 0,
    rulesEvaluate: 0,
    toolsSelect: 0,
    toolsFeedback: 0,
    write: 0,
    handoffStore: 0,
  };
  const handoffs = [];
  let currentStage = { context_text: '', selection_map: {} };

  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    res.setHeader('content-type', 'application/json');

    if (req.url === '/v1/memory/context/assemble') {
      calls.contextAssemble += 1;
      res.end(JSON.stringify({
        scope: body.scope,
        layered_context: { merged_text: currentStage.context_text },
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
      const selected = currentStage.selection_map?.[requested] ?? requested;
      res.end(JSON.stringify({
        scope: body.scope,
        selection: { selected, denied: selected === requested ? [] : [requested] },
        decision: {
          decision_id: `decision-${calls.toolsSelect}`,
          decision_uri: `aionis://decision/${calls.toolsSelect}`,
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
    handoffs,
    setStage(config) {
      currentStage = config ?? { context_text: '', selection_map: {} };
    },
    latestHandoff() {
      return handoffs.at(-1) ?? null;
    },
    async close() {
      await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    },
  };
}

function makeStageContext(baseId, repoPath, stageName) {
  return {
    agentId: `agent-${baseId}-${stageName}`,
    sessionId: `sess-${baseId}`,
    sessionKey: `sess-${baseId}`,
    workspaceDir: repoPath,
    runId: `run-${baseId}-${stageName}`,
    toolName: 'unknown',
    toolCallId: `call-${baseId}-${stageName}`,
    trigger: 'multi-agent-benchmark',
  };
}

function lookupTool(toolset, name) {
  return toolset.find((tool) => tool.name === name) ?? null;
}

function artifactInstructions(stageName) {
  if (stageName === 'planner') {
    return [
      'When you finish, artifact must include suspected_boundary (string), target_files (array of 1-4 repo-relative file paths), target_validation (array of 1-3 focused validation paths or commands).',
      'The boundary must name a concrete cleanup, lifecycle, or child-process bridge boundary, not a vague repo area.',
    ].join(' ');
  }
  if (stageName === 'executor') {
    return [
      'When you finish, artifact must include patch_summary (string), target_files (array of 1-4 repo-relative file paths), validation_commands (array of 1-3 focused validations), residual_risk (string).',
      'Do not claim you changed files. Propose the smallest viable fix or guard backed by the repo evidence you actually saw.',
    ].join(' ');
  }
  return [
    'When you finish, artifact must include verdict (pass|fail|needs-more-work), rationale (string), accepted_files (array), accepted_validation (array).',
    'Use pass only if the executor output targets the right cleanup boundary and the validation is focused rather than broad.',
  ].join(' ');
}

function buildStageMessages({ scenario, stageName, prompt, toolset, history, injectedContext, priorArtifacts }) {
  const toolList = toolset.map((tool) => `- ${tool.name}: ${tool.description}`).join('\n');
  const historyText = history.length === 0
    ? 'No prior tool calls.'
    : history.map((item) => `Step ${item.step}: tool=${item.toolName}; summary=${item.summary}`).join('\n');
  const priorText = priorArtifacts.length === 0
    ? 'No prior agent artifacts.'
    : priorArtifacts.map((item) => `${item.stage.toUpperCase()} artifact: ${JSON.stringify(item.artifact)}`).join('\n');

  return [
    {
      role: 'system',
      content: [
        `You are the ${stageName.toUpperCase()} agent in a 3-agent OpenClaw coding workflow for a real repository issue.`,
        'Return a JSON object with keys: action, tool, note, artifact.',
        'action must be either "use" or "finish".',
        `tool must be one of: ${toolset.map((tool) => tool.name).join(', ')} or null when action is finish.`,
        'Do not invent tools, parameters, or repo files you have not seen.',
        artifactInstructions(stageName),
        'Return JSON only.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `Issue anchor: ${scenario.issue_anchor}`,
        `Issue statement: ${scenario.issue_statement}`,
        `Stage goal: ${prompt}`,
        injectedContext ? `Injected Aionis context: ${injectedContext}` : null,
        `Prior artifacts:\n${priorText}`,
        `Available tools:\n${toolList}`,
        `History:\n${historyText}`,
      ].filter(Boolean).join('\n\n'),
    },
  ];
}

function buildSynthesisMessages({ scenario, stageName, prompt, history, injectedContext, priorArtifacts }) {
  const historyText = history.length === 0
    ? 'No tool evidence was collected.'
    : history.map((item) => `Step ${item.step}: tool=${item.toolName}; summary=${item.summary}`).join('\n');
  const priorText = priorArtifacts.length === 0
    ? 'No prior agent artifacts.'
    : priorArtifacts.map((item) => `${item.stage.toUpperCase()} artifact: ${JSON.stringify(item.artifact)}`).join('\n');

  return [
    {
      role: 'system',
      content: [
        `You are the ${stageName.toUpperCase()} agent in a 3-agent OpenClaw coding workflow for a real repository issue.`,
        'You may not request more tools. Return a final JSON object with keys: action, tool, note, artifact.',
        'action must be "finish" and tool must be null.',
        artifactInstructions(stageName),
        'Use only the repo evidence already collected. Return JSON only.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `Issue anchor: ${scenario.issue_anchor}`,
        `Issue statement: ${scenario.issue_statement}`,
        `Stage goal: ${prompt}`,
        injectedContext ? `Injected Aionis context: ${injectedContext}` : null,
        `Prior artifacts:
${priorText}`,
        `Collected evidence:
${historyText}`,
      ].filter(Boolean).join('\n\n'),
    },
  ];
}


function includesAny(text, candidates) {
  const haystack = String(text ?? '').toLowerCase();
  return candidates.some((candidate) => haystack.includes(String(candidate).toLowerCase()));
}

function arrayIncludesAny(values, candidates) {
  const normalized = values.map((value) => String(value).toLowerCase());
  return candidates.some((candidate) => normalized.some((value) => value.includes(String(candidate).toLowerCase())));
}

function validatePlannerArtifact(artifact, scenario) {
  if (!artifact || typeof artifact !== 'object') return false;
  const targetFiles = Array.isArray(artifact.target_files) ? artifact.target_files : [];
  const targetValidation = Array.isArray(artifact.target_validation) ? artifact.target_validation : [];
  return Boolean(
    typeof artifact.suspected_boundary === 'string' && artifact.suspected_boundary.trim().length > 20 &&
    targetFiles.length > 0 &&
    targetValidation.length > 0 &&
    (arrayIncludesAny(targetFiles, scenario.expected.boundary_files) || arrayIncludesAny(targetFiles, scenario.expected.boundary_terms ?? []) || includesAny(artifact.suspected_boundary, scenario.expected.boundary_files) || includesAny(artifact.suspected_boundary, scenario.expected.boundary_terms ?? []))
  );
}

function validateExecutorArtifact(artifact, scenario) {
  if (!artifact || typeof artifact !== 'object') return false;
  const targetFiles = Array.isArray(artifact.target_files) ? artifact.target_files : [];
  const validationCommands = Array.isArray(artifact.validation_commands) ? artifact.validation_commands : [];
  return Boolean(
    typeof artifact.patch_summary === 'string' && artifact.patch_summary.trim().length > 20 &&
    typeof artifact.residual_risk === 'string' && artifact.residual_risk.trim().length > 10 &&
    targetFiles.length > 0 &&
    validationCommands.length > 0 &&
    (arrayIncludesAny(targetFiles, scenario.expected.boundary_files) || arrayIncludesAny(targetFiles, scenario.expected.boundary_terms ?? [])) &&
    (arrayIncludesAny(validationCommands, scenario.expected.validation_files) || arrayIncludesAny(validationCommands, scenario.expected.validation_terms ?? []))
  );
}

function validateReviewerArtifact(artifact, scenario) {
  if (!artifact || typeof artifact !== 'object') return false;
  const acceptedFiles = Array.isArray(artifact.accepted_files) ? artifact.accepted_files : [];
  const acceptedValidation = Array.isArray(artifact.accepted_validation) ? artifact.accepted_validation : [];
  return Boolean(
    artifact.verdict === 'pass' &&
    typeof artifact.rationale === 'string' && artifact.rationale.trim().length > 20 &&
    acceptedFiles.length > 0 &&
    acceptedValidation.length > 0 &&
    (arrayIncludesAny(acceptedFiles, scenario.expected.boundary_files) || arrayIncludesAny(acceptedFiles, scenario.expected.boundary_terms ?? [])) &&
    (arrayIncludesAny(acceptedValidation, scenario.expected.validation_files) || arrayIncludesAny(acceptedValidation, scenario.expected.validation_terms ?? []))
  );
}

function validateStageArtifact(stageName, artifact, scenario) {
  if (stageName === 'planner') return validatePlannerArtifact(artifact, scenario);
  if (stageName === 'executor') return validateExecutorArtifact(artifact, scenario);
  return validateReviewerArtifact(artifact, scenario);
}

function naiveStageSummary(stageName, artifact) {
  if (stageName === 'planner') {
    return 'Previous planner finished. Continue investigating issue #10864 without broad rediscovery if possible.';
  }
  if (stageName === 'executor') {
    return 'Previous executor proposed a fix. Review whether it targets the cleanup boundary and uses focused validation.';
  }
  return `Reviewer summary: ${artifact?.rationale ?? 'no rationale'}.`;
}

function handoffText(stageName, artifact) {
  if (stageName === 'planner') {
    return [
      `Planner boundary: ${artifact.suspected_boundary}`,
      `Target files: ${(artifact.target_files ?? []).join(', ')}`,
      `Focused validation: ${(artifact.target_validation ?? []).join(', ')}`,
    ].join('\n');
  }
  if (stageName === 'executor') {
    return [
      `Executor patch summary: ${artifact.patch_summary}`,
      `Target files: ${(artifact.target_files ?? []).join(', ')}`,
      `Validation commands: ${(artifact.validation_commands ?? []).join(', ')}`,
      `Residual risk: ${artifact.residual_risk}`,
    ].join('\n');
  }
  return [
    `Reviewer verdict: ${artifact.verdict}`,
    `Rationale: ${artifact.rationale}`,
    `Accepted files: ${(artifact.accepted_files ?? []).join(', ')}`,
    `Accepted validation: ${(artifact.accepted_validation ?? []).join(', ')}`,
  ].join('\n');
}

async function storeHandoff(baseUrl, scenario, stageName, artifact, repoPath) {
  const summary = stageName === 'planner'
    ? artifact.suspected_boundary
    : stageName === 'executor'
      ? artifact.patch_summary
      : artifact.rationale;
  const response = await fetch(`${baseUrl}/v1/handoff/store`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      anchor: `${scenario.id}-${stageName}`,
      summary,
      handoff_text: handoffText(stageName, artifact),
      handoff_kind: `${stageName}_stage`,
      repo_root: repoPath,
      file_path: Array.isArray(artifact.target_files) ? artifact.target_files[0] : Array.isArray(artifact.accepted_files) ? artifact.accepted_files[0] : undefined,
    }),
  });
  if (!response.ok) throw new Error(`handoff/store failed: ${response.status}`);
}

async function runStage({ scenario, stageName, mode, stageDef, host, aionis, ctx, repoPath, runDir, injectedContext, priorArtifacts }) {
  const toolset = materializeToolset(stageDef.toolset, { REPO_PATH: repoPath, RUN_DIR: runDir });
  const history = [];
  const tokenBreakdown = [];
  let executedSteps = 0;
  let broadToolCalls = 0;
  let controlledStop = false;
  let stopReason = null;
  let artifact = null;
  let note = null;

  if (mode === 'treatment') {
    aionis.setStage(scenario.aionis?.[stageName] ?? { context_text: '', selection_map: {} });
    const startResult = await host.emit('before_agent_start', {
      prompt: stageDef.prompt,
      messages: toolset.map((tool) => ({ toolName: tool.name })),
    }, ctx);
    injectedContext = [injectedContext, startResult?.prependContext].filter(Boolean).join('\n');
  }

  for (let step = 1; step <= Number(scenario.max_steps?.[stageName] ?? 1); step += 1) {
    const { parsed, usage } = await callGlm(buildStageMessages({
      scenario,
      stageName,
      prompt: stageDef.prompt,
      toolset,
      history,
      injectedContext,
      priorArtifacts,
    }));
    tokenBreakdown.push({ step, ...usage, model_decision: parsed });

    if (parsed.action === 'finish') {
      if (validateStageArtifact(stageName, parsed.artifact, scenario)) {
        artifact = parsed.artifact;
        note = parsed.note ?? null;
        break;
      }
      history.push({
        step: `feedback-${step}`,
        toolName: 'stage-feedback',
        summary: 'Finish rejected: artifact missing required focused boundary or validation details.',
        observationHash: sha1(`feedback-${step}`),
      });
      continue;
    }

    let tool = lookupTool(toolset, parsed.tool);
    if (!tool) {
      history.push({
        step: `feedback-${step}`,
        toolName: 'stage-feedback',
        summary: `Unknown tool ${parsed.tool ?? 'null'} requested.`,
        observationHash: sha1(`unknown-${step}-${parsed.tool}`),
      });
      continue;
    }

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

    const execution = await executeShell(String(tool.params.command ?? ''), repoPath);
    executedSteps += 1;
    if (tool.name.includes('broad')) broadToolCalls += 1;
    history.push({
      step: executedSteps,
      toolName: tool.name,
      summary: execution.error ? `error:${execution.error}:${excerpt(execution.result, 220)}` : excerpt(execution.result, 220),
      observationHash: sha1(execution.error ? `error:${execution.error}:${execution.result}` : execution.result),
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
  }

  if (!artifact) {
    const { parsed, usage } = await callGlm(buildSynthesisMessages({
      scenario,
      stageName,
      prompt: stageDef.prompt,
      history,
      injectedContext,
      priorArtifacts,
    }));
    tokenBreakdown.push({ step: 'synthesis', ...usage, model_decision: parsed });
    if (parsed.action === 'finish' && validateStageArtifact(stageName, parsed.artifact, scenario)) {
      artifact = parsed.artifact;
      note = parsed.note ?? null;
    }
  }

  await fs.writeFile(path.join(runDir, `${stageName}.history.json`), `${JSON.stringify(history, null, 2)}\n`);
  if (artifact) {
    await fs.writeFile(path.join(runDir, `${stageName}.json`), `${JSON.stringify(artifact, null, 2)}\n`);
  }

  return {
    stage: stageName,
    success: Boolean(artifact),
    artifact,
    note,
    executed_steps: executedSteps,
    broad_tool_calls: broadToolCalls,
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

  const stageResults = [];
  const priorArtifacts = [];
  const baseId = `${scenario.id}-${mode}-r${repetition}`;
  const host = mode === 'treatment' ? new MockOpenClawHost() : null;
  const aionis = mode === 'treatment' ? await startAionisMock() : null;

  if (mode === 'treatment') {
    host.pluginConfig = {
      baseUrl: aionis.baseUrl,
      tenantId: 'tenant-multi-agent-bench',
      actor: 'multi-agent-benchmark',
      ...scenario.plugin_config,
    };
    plugin.register(host);
    await host.emit('session_start', { sessionId: `sess-${baseId}`, sessionKey: `sess-${baseId}` }, makeStageContext(baseId, repoPath, 'session'));
  }

  let carryoverContext = null;
  try {
    for (const stageName of ['planner', 'executor', 'reviewer']) {
      const ctx = makeStageContext(baseId, repoPath, stageName);
      const result = await runStage({
        scenario,
        stageName,
        mode,
        stageDef: scenario.stages[stageName],
        host,
        aionis,
        ctx,
        repoPath,
        runDir,
        injectedContext: carryoverContext,
        priorArtifacts,
      });
      stageResults.push(result);

      if (mode === 'treatment') {
        await host.emit('agent_end', {
          messages: result.artifact ? [{ role: 'assistant', content: JSON.stringify(result.artifact) }] : [],
          success: result.success || result.controlled_stop,
          error: result.success || result.controlled_stop ? undefined : result.stop_reason ?? `stage_${stageName}_failed`,
          durationMs: 0,
        }, ctx);
      }

      if (!result.success) break;

      priorArtifacts.push({ stage: stageName, artifact: result.artifact });
      if (mode === 'treatment') {
        await storeHandoff(aionis.baseUrl, scenario, stageName, result.artifact, repoPath);
        carryoverContext = aionis.latestHandoff()?.handoff_text ?? null;
      } else {
        carryoverContext = naiveStageSummary(stageName, result.artifact);
      }
    }
  } finally {
    if (mode === 'treatment') {
      await host.emit('session_end', { sessionId: `sess-${baseId}`, sessionKey: `sess-${baseId}` }, makeStageContext(baseId, repoPath, 'session'));
      await aionis.close();
    }
  }

  const planner = stageResults.find((stage) => stage.stage === 'planner');
  const executor = stageResults.find((stage) => stage.stage === 'executor');
  const reviewer = stageResults.find((stage) => stage.stage === 'reviewer');
  const completed = Boolean(planner?.success && executor?.success && reviewer?.success && reviewer?.artifact?.verdict === 'pass');

  return {
    completed,
    planner_success: Boolean(planner?.success),
    executor_success: Boolean(executor?.success),
    reviewer_pass: Boolean(reviewer?.success && reviewer?.artifact?.verdict === 'pass'),
    total_tokens: sum(stageResults, 'total_tokens'),
    prompt_tokens: sum(stageResults, 'prompt_tokens'),
    completion_tokens: sum(stageResults, 'completion_tokens'),
    tool_call_count: sum(stageResults, 'executed_steps'),
    broad_tool_call_count: sum(stageResults, 'broad_tool_calls'),
    handoff_store_count: aionis?.calls?.handoffStore ?? 0,
    context_assemble_count: aionis?.calls?.contextAssemble ?? 0,
    rules_evaluate_count: aionis?.calls?.rulesEvaluate ?? 0,
    tools_select_count: aionis?.calls?.toolsSelect ?? 0,
    tools_feedback_count: aionis?.calls?.toolsFeedback ?? 0,
    memory_write_count: aionis?.calls?.write ?? 0,
    stage_results: stageResults,
  };
}

function summarize(cases) {
  const baselineCases = cases.map((row) => row.baseline);
  const treatmentCases = cases.map((row) => row.treatment);
  const baselineCompleted = baselineCases.filter((row) => row.completed);
  const treatmentCompleted = treatmentCases.filter((row) => row.completed);
  return {
    benchmark: 'openclaw_multi_agent_issue10864_v1',
    provider: 'glm',
    model: MODEL,
    repetitions: REPEATS,
    cases: cases.length,
    baseline: {
      completed_rate: ratio(baselineCompleted.length, baselineCases.length),
      planner_success_rate: ratio(baselineCases.filter((row) => row.planner_success).length, baselineCases.length),
      executor_success_rate: ratio(baselineCases.filter((row) => row.executor_success).length, baselineCases.length),
      review_pass_rate: ratio(baselineCases.filter((row) => row.reviewer_pass).length, baselineCases.length),
      avg_total_tokens: mean(baselineCases, 'total_tokens'),
      avg_tool_call_count: mean(baselineCases, 'tool_call_count'),
      avg_broad_tool_call_count: mean(baselineCases, 'broad_tool_call_count'),
      tokens_per_completed_task: baselineCompleted.length > 0 ? sum(baselineCompleted, 'total_tokens') / baselineCompleted.length : null,
    },
    treatment: {
      completed_rate: ratio(treatmentCompleted.length, treatmentCases.length),
      planner_success_rate: ratio(treatmentCases.filter((row) => row.planner_success).length, treatmentCases.length),
      executor_success_rate: ratio(treatmentCases.filter((row) => row.executor_success).length, treatmentCases.length),
      review_pass_rate: ratio(treatmentCases.filter((row) => row.reviewer_pass).length, treatmentCases.length),
      avg_total_tokens: mean(treatmentCases, 'total_tokens'),
      avg_tool_call_count: mean(treatmentCases, 'tool_call_count'),
      avg_broad_tool_call_count: mean(treatmentCases, 'broad_tool_call_count'),
      avg_handoff_store_count: mean(treatmentCases, 'handoff_store_count'),
      avg_context_assemble_count: mean(treatmentCases, 'context_assemble_count'),
      avg_tools_select_count: mean(treatmentCases, 'tools_select_count'),
      tokens_per_completed_task: treatmentCompleted.length > 0 ? sum(treatmentCompleted, 'total_tokens') / treatmentCompleted.length : null,
    },
    delta: {
      completion_gain: ratio(treatmentCompleted.length, treatmentCases.length) - ratio(baselineCompleted.length, baselineCases.length),
      avg_token_delta: mean(treatmentCases, 'total_tokens') - mean(baselineCases, 'total_tokens'),
      avg_broad_tool_delta: mean(treatmentCases, 'broad_tool_call_count') - mean(baselineCases, 'broad_tool_call_count'),
    },
  };
}

async function main() {
  const fixture = JSON.parse(await fs.readFile(FIXTURE_PATH, 'utf8'));
  const scenarios = SCENARIO_FILTER ? fixture.scenarios.filter((scenario) => scenario.id === SCENARIO_FILTER) : fixture.scenarios;
  if (scenarios.length === 0) throw new Error(`No scenarios matched BENCH_SCENARIO_ID=${SCENARIO_FILTER}`);

  const artifactDir = path.join(ROOT, 'artifacts', 'openclaw-multi-agent-benchmark', nowStamp());
  await fs.mkdir(artifactDir, { recursive: true });

  const cases = [];
  const raw = [];
  for (const scenario of scenarios) {
    for (let repetition = 1; repetition <= REPEATS; repetition += 1) {
      const baseline = await runArm({ scenario, mode: 'baseline', repetition, artifactDir });
      const treatment = await runArm({ scenario, mode: 'treatment', repetition, artifactDir });
      const row = { scenario_id: scenario.id, repetition, baseline, treatment };
      cases.push(row);
      raw.push(row);
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
