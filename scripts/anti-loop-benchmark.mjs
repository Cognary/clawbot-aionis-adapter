import fs from 'node:fs/promises';
import path from 'node:path';

import { AionisLoopControlAdapter } from '../dist/index.js';

class MockOpenClawHost {
  constructor() {
    this.handlers = new Map();
    this.logger = { info() {}, warn() {}, error() {} };
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


function createFakeClient() {
  const calls = {
    replayDispatch: 0,
    handoffStore: 0,
    writes: 0,
    feedback: 0,
  };
  return {
    calls,
    client: {
      async contextAssemble() {
        return { layered_context: { merged_text: 'benchmark context' } };
      },
      async rulesEvaluate() {
        return { ok: true };
      },
      async toolsSelect(args) {
        return { selected_tool: args.candidates[0] };
      },
      async toolsFeedback() {
        calls.feedback += 1;
        return { ok: true };
      },
      async write() {
        calls.writes += 1;
        return { ok: true };
      },
      async replayPlaybookCandidate() {
        return { candidate: { eligible_for_deterministic_replay: true, recommended_mode: 'simulate' } };
      },
      async replayPlaybookDispatch() {
        calls.replayDispatch += 1;
        return { dispatch: { decision: 'deterministic_replay_executed' } };
      },
      async handoffStore() {
        calls.handoffStore += 1;
        return { ok: true };
      },
    },
  };
}

async function main() {
  const { attachToOpenClawHost } = await import('../dist/index.js');
  const { client, calls } = createFakeClient();
  const host = new MockOpenClawHost();
  const adapter = new AionisLoopControlAdapter(client, {
    tenantId: 'tenant-bench',
    actor: 'bench-runner',
    scopeResolver: (ctx) => `openclaw:${ctx.sessionKey ?? ctx.sessionId ?? 'bench'}`,
    thresholds: {
      enabled: true,
      maxSteps: 20,
      maxSameToolStreak: 3,
      maxDuplicateObservationStreak: 2,
      maxNoProgressStreak: 2,
      maxEstimatedTokenBurn: 1000,
      maxBroadTestInvocations: 1,
      maxBroadScanInvocations: 1,
    },
    replayHintResolver: () => ({ playbookId: 'pb-bench-rg-loop', mode: 'simulate', params: { target: 'focused-search' } }),
    replayDispatchEnabled: true,
    handoffFallbackEnabled: true,
    strictToolBlocking: true,
  });
  attachToOpenClawHost(host, adapter);

  const ctx = {
    agentId: 'agent-bench',
    sessionId: 'sess-bench',
    sessionKey: 'sess-bench',
    workspaceDir: '/repo/click',
    runId: 'run-bench',
    toolName: 'rg',
    toolCallId: 'call-bench',
  };
  const event = {
    toolName: 'rg',
    params: { q: 'OptionParser' },
    runId: 'run-bench',
    toolCallId: 'call-bench',
  };

  let adapterBlockedAt = null;
  const baselineMaxIterations = 12;
  const adapterIterations = [];

  for (let i = 1; i <= baselineMaxIterations; i += 1) {
    const result = await host.emit('before_tool_call', event, ctx);
    adapterIterations.push({ step: i, result });
    if (result?.block) {
      adapterBlockedAt = i;
      break;
    }
    await host.emit('after_tool_call', {
      ...event,
      result: { matches: ['click/parser.py:42'] },
      durationMs: 30,
    }, ctx);
  }

  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const artifactDir = path.join('/Volumes/ziel/openclaw-aionis-adapter', 'artifacts', 'anti-loop-benchmark', timestamp);
  await fs.mkdir(artifactDir, { recursive: true });

  const summary = {
    benchmark: 'synthetic_repeated_tool_loop_v1',
    baseline: {
      iterations_without_stop: baselineMaxIterations,
      stop_reason: null,
    },
    adapter: {
      blocked_at_step: adapterBlockedAt,
      stop_reason: adapterBlockedAt ? adapterIterations[adapterBlockedAt - 1].result.blockReason : null,
      replay_dispatch_count: calls.replayDispatch,
      handoff_store_count: calls.handoffStore,
      feedback_writes: calls.feedback,
      evidence_writes: calls.writes,
    },
  };

  await fs.writeFile(path.join(artifactDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, artifact_dir: artifactDir, summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
