import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';

import plugin from '../dist/plugin.js';

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
    return handler(event, ctx);
  }
}

async function withAionisMock(scenario, run) {
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
        tools: {
          selection: { selected: scenario.aionis.selected_tool, denied: [] },
          decision: { decision_id: `${scenario.id}-ctx-dec`, decision_uri: `aionis://decision/${scenario.id}/ctx`, selected_tool: scenario.aionis.selected_tool },
        },
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
      res.end(JSON.stringify({
        scope: body.scope,
        selection: { selected: scenario.aionis.selected_tool, denied: [] },
        decision: {
          decision_id: `${scenario.id}-decision-${calls.toolsSelect}`,
          decision_uri: `aionis://decision/${scenario.id}/${calls.toolsSelect}`,
          selected_tool: scenario.aionis.selected_tool,
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
      res.end(JSON.stringify({ ok: true, handoff: { anchor: body.anchor } }));
      return;
    }

    if (req.url === '/v1/memory/replay/playbooks/candidate') {
      calls.replayCandidate += 1;
      res.end(JSON.stringify({
        scope: body.scope,
        playbook: { playbook_id: body.playbook_id, version: 1, status: 'active' },
        candidate: {
          eligible_for_deterministic_replay: scenario.aionis.replay_eligible,
          recommended_mode: scenario.aionis.recommended_mode,
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
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    return await run({ baseUrl, calls });
  } finally {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
}

function buildContext(scenario) {
  return {
    agentId: `agent-${scenario.id}`,
    sessionId: `sess-${scenario.id}`,
    sessionKey: `sess-${scenario.id}`,
    workspaceDir: '/repo/click',
    runId: `run-${scenario.id}`,
    toolName: scenario.tool_name,
    toolCallId: `call-${scenario.id}`,
    trigger: 'benchmark',
  };
}

async function runTreatmentCase(scenario) {
  return withAionisMock(scenario, async ({ baseUrl, calls }) => {
    const host = new MockOpenClawHost();
    host.pluginConfig = {
      baseUrl,
      tenantId: 'tenant-bench',
      actor: 'bench-runner',
      ...scenario.plugin_config,
    };
    await plugin.register(host);

    const ctx = buildContext(scenario);
    const agentStart = await host.emit('before_agent_start', {
      prompt: scenario.prompt,
      messages: [{ toolName: scenario.tool_name }],
    }, ctx);

    let blockedAtStep = null;
    let blockReason = null;
    let executedSteps = 0;

    for (let step = 1; step <= scenario.iterations; step += 1) {
      const event = {
        toolName: scenario.tool_name,
        params: scenario.params,
        runId: ctx.runId,
        toolCallId: `${ctx.toolCallId}-${step}`,
      };
      const before = await host.emit('before_tool_call', event, ctx);
      if (before?.block) {
        blockedAtStep = step;
        blockReason = before.blockReason ?? null;
        break;
      }
      executedSteps += 1;
      await host.emit('after_tool_call', {
        ...event,
        result: scenario.result,
        durationMs: scenario.duration_ms,
      }, ctx);
    }

    return {
      scenario_id: scenario.id,
      mode: 'treatment',
      prompt_injected: typeof agentStart?.prependContext === 'string' && agentStart.prependContext.includes(scenario.aionis.context_text),
      blocked_at_step: blockedAtStep,
      block_reason: blockReason,
      executed_steps: executedSteps,
      replay_dispatch_count: calls.replayDispatch,
      handoff_store_count: calls.handoffStore,
      feedback_writes: calls.toolsFeedback,
      evidence_writes: calls.write,
      logs: host.logs,
    };
  });
}

function runBaselineCase(scenario) {
  return {
    scenario_id: scenario.id,
    mode: 'baseline',
    blocked_at_step: null,
    block_reason: null,
    executed_steps: scenario.iterations,
    replay_dispatch_count: 0,
    handoff_store_count: 0,
    feedback_writes: 0,
    evidence_writes: 0,
  };
}

function summarize(cases) {
  const baseline = cases.filter((item) => item.mode === 'baseline');
  const treatment = cases.filter((item) => item.mode === 'treatment');
  const avg = (items, key) => items.reduce((sum, item) => sum + Number(item[key] ?? 0), 0) / Math.max(items.length, 1);
  const controlledStops = treatment.filter((item) => item.blocked_at_step != null).length;
  return {
    benchmark: 'openclaw_tool_loop_ab_v1',
    cases: baseline.length,
    baseline: {
      avg_executed_steps: avg(baseline, 'executed_steps'),
      controlled_stop_rate: 0,
    },
    treatment: {
      avg_executed_steps: avg(treatment, 'executed_steps'),
      controlled_stop_rate: controlledStops / Math.max(treatment.length, 1),
      replay_dispatch_rate: treatment.filter((item) => item.replay_dispatch_count > 0).length / Math.max(treatment.length, 1),
      handoff_store_rate: treatment.filter((item) => item.handoff_store_count > 0).length / Math.max(treatment.length, 1),
      avg_feedback_writes: avg(treatment, 'feedback_writes'),
      avg_evidence_writes: avg(treatment, 'evidence_writes'),
    },
  };
}

async function main() {
  const fixturePath = path.join('/Volumes/ziel/openclaw-aionis-adapter', 'fixtures', 'openclaw-anti-loop-traces-v1.json');
  const fixture = JSON.parse(await fs.readFile(fixturePath, 'utf8'));
  const cases = [];

  for (const scenario of fixture.scenarios) {
    const baseline = runBaselineCase(scenario);
    const treatment = await runTreatmentCase(scenario);

    if (treatment.block_reason !== scenario.expected.treatment_block_reason) {
      throw new Error(`${scenario.id}: expected block reason ${scenario.expected.treatment_block_reason}, got ${treatment.block_reason}`);
    }
    if (treatment.blocked_at_step !== scenario.expected.blocked_at_step) {
      throw new Error(`${scenario.id}: expected blocked_at_step ${scenario.expected.blocked_at_step}, got ${treatment.blocked_at_step}`);
    }

    cases.push(baseline, treatment);
  }

  const summary = summarize(cases);
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const artifactDir = path.join('/Volumes/ziel/openclaw-aionis-adapter', 'artifacts', 'openclaw-anti-loop-ab', timestamp);
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(path.join(artifactDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  await fs.writeFile(path.join(artifactDir, 'cases.jsonl'), `${cases.map((item) => JSON.stringify(item)).join('\n')}\n`);
  await fs.writeFile(path.join(artifactDir, 'fixture.json'), `${JSON.stringify(fixture, null, 2)}\n`);

  console.log(JSON.stringify({ ok: true, artifact_dir: artifactDir, summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
