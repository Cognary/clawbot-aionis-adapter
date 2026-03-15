import test from 'node:test';
import assert from 'node:assert/strict';

import { AionisLoopControlAdapter, attachToOpenClawHost } from '../dist/index.js';

class MockOpenClawHost {
  constructor() {
    this.handlers = new Map();
    this.logger = {
      info() {},
      warn() {},
      error() {},
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

function createFakeClient() {
  const calls = {
    contextAssemble: [],
    rulesEvaluate: [],
    toolsSelect: [],
    toolsFeedback: [],
    write: [],
    handoffStore: [],
    replayPlaybookCandidate: [],
    replayPlaybookDispatch: [],
  };

  const client = {
    async contextAssemble(args) {
      calls.contextAssemble.push(args);
      return {
        layered_context: { merged_text: 'focused repo context' },
        tools: { selected_tool: 'rg', decision_id: 'dec-1', decision_uri: 'aionis://decision/1' },
      };
    },
    async rulesEvaluate(args) {
      calls.rulesEvaluate.push(args);
      return { ok: true };
    },
    async toolsSelect(args) {
      calls.toolsSelect.push(args);
      return { selected_tool: args.candidates[0], decision_id: 'dec-2', decision_uri: 'aionis://decision/2' };
    },
    async toolsFeedback(args) {
      calls.toolsFeedback.push(args);
      return { ok: true };
    },
    async write(args) {
      calls.write.push(args);
      return { ok: true };
    },
    async handoffStore(args) {
      calls.handoffStore.push(args);
      return { ok: true };
    },
    async replayPlaybookCandidate(args) {
      calls.replayPlaybookCandidate.push(args);
      return {
        candidate: {
          eligible_for_deterministic_replay: true,
          recommended_mode: 'simulate',
        },
      };
    },
    async replayPlaybookDispatch(args) {
      calls.replayPlaybookDispatch.push(args);
      return { dispatch: { decision: 'deterministic_replay_executed' } };
    },
  };

  return { client, calls };
}

function createAdapter(client, overrides = {}) {
  return new AionisLoopControlAdapter(client, {
    tenantId: 'tenant-dev',
    actor: 'adapter-test',
    scopeResolver: (ctx) => `openclaw:${ctx.sessionKey ?? ctx.sessionId ?? 'default'}`,
    thresholds: {
      enabled: true,
      maxSteps: 16,
      maxSameToolStreak: 2,
      maxDuplicateObservationStreak: 2,
      maxNoProgressStreak: 2,
      maxEstimatedTokenBurn: 1000,
      maxBroadTestInvocations: 1,
      maxBroadScanInvocations: 1,
      ...(overrides.thresholds ?? {}),
    },
    replayHintResolver: overrides.replayHintResolver,
    replayDispatchEnabled: overrides.replayDispatchEnabled ?? true,
    handoffFallbackEnabled: overrides.handoffFallbackEnabled ?? true,
    strictToolBlocking: overrides.strictToolBlocking ?? true,
  });
}

test('before_agent_start injects assembled context', async () => {
  const { client, calls } = createFakeClient();
  const host = new MockOpenClawHost();
  const adapter = createAdapter(client);
  attachToOpenClawHost(host, adapter);

  const result = await host.emit(
    'before_agent_start',
    { prompt: 'fix the failing click option parser', messages: [{ toolName: 'rg' }, { toolName: 'pytest' }] },
    { agentId: 'agent-1', sessionId: 'sess-1', sessionKey: 'sess-key-1', workspaceDir: '/repo/click', trigger: 'user' },
  );

  assert.equal(calls.contextAssemble.length, 1);
  assert.match(result.prependContext, /focused repo context/);
});

test('before_agent_start forwards recovered execution continuity into context assembly', async () => {
  const { client, calls } = createFakeClient();
  const host = new MockOpenClawHost();
  const adapter = createAdapter(client);
  attachToOpenClawHost(host, adapter);

  await host.emit(
    'before_agent_start',
    {
      prompt: 'resume the reviewer-ready auth workflow',
      messages: [{ toolName: 'rg' }],
      continuity: {
        handoffText: 'Resume from auth drift handoff',
        execution_state_v1: {
          state_id: 'state-auth-1',
          current_stage: 'triage',
          active_role: 'triage',
        },
        execution_packet_v1: {
          state_id: 'state-auth-1',
          stage: 'triage',
          role: 'triage',
          pending_validations: ['validate auth boundary'],
        },
      },
    },
    { agentId: 'agent-1', sessionId: 'sess-1b', sessionKey: 'sess-key-1b', workspaceDir: '/repo/click', trigger: 'resume' },
  );

  assert.equal(calls.contextAssemble.length, 1);
  assert.equal(calls.contextAssemble[0].executionStateV1?.state_id, 'state-auth-1');
  assert.equal(calls.contextAssemble[0].executionPacketV1?.stage, 'triage');
  assert.equal(calls.contextAssemble[0].context.continuity_handoff_text, 'Resume from auth drift handoff');
});

test('after_tool_call writes feedback and evidence', async () => {
  const { client, calls } = createFakeClient();
  const host = new MockOpenClawHost();
  const adapter = createAdapter(client);
  attachToOpenClawHost(host, adapter);

  const ctx = { agentId: 'agent-1', sessionId: 'sess-2', sessionKey: 'sess-key-2', workspaceDir: '/repo/click', runId: 'run-2', toolName: 'rg', toolCallId: 'call-1' };
  await host.emit('before_tool_call', { toolName: 'rg', params: { q: 'OptionParser' }, runId: 'run-2', toolCallId: 'call-1' }, ctx);
  await host.emit('after_tool_call', { toolName: 'rg', params: { q: 'OptionParser' }, runId: 'run-2', toolCallId: 'call-1', result: { matches: ['click/parser.py:42'] }, durationMs: 33 }, ctx);

  assert.equal(calls.rulesEvaluate.length, 1);
  assert.equal(calls.toolsSelect.length, 1);
  assert.equal(calls.toolsFeedback.length, 1);
  assert.equal(calls.write.length, 1);
  assert.equal(calls.toolsFeedback[0].selectedTool, 'rg');
});

test('threshold stop prefers replay dispatch when a playbook hint is available', async () => {
  const { client, calls } = createFakeClient();
  const host = new MockOpenClawHost();
  const adapter = createAdapter(client, {
    replayHintResolver: () => ({ playbookId: 'pb-click-rg-loop', mode: 'simulate', params: { target: 'focused-search' } }),
  });
  attachToOpenClawHost(host, adapter);

  const ctx = { agentId: 'agent-1', sessionId: 'sess-3', sessionKey: 'sess-key-3', workspaceDir: '/repo/click', runId: 'run-3', toolName: 'rg', toolCallId: 'call-3' };
  const event = { toolName: 'rg', params: { q: 'OptionParser' }, runId: 'run-3', toolCallId: 'call-3' };

  await host.emit('before_tool_call', event, ctx);
  await host.emit('before_tool_call', event, ctx);
  const stop = await host.emit('before_tool_call', event, ctx);

  assert.equal(stop.block, true);
  assert.equal(stop.blockReason, 'replay dispatch selected');
  assert.equal(calls.replayPlaybookCandidate.length, 1);
  assert.equal(calls.replayPlaybookDispatch.length, 1);
  assert.equal(calls.handoffStore.length, 0);
});

test('threshold stop falls back to handoff when replay path is unavailable', async () => {
  const { client, calls } = createFakeClient();
  client.replayPlaybookCandidate = async () => ({
    candidate: { eligible_for_deterministic_replay: false, mismatch_reasons: ['not deterministic'] },
  });

  const host = new MockOpenClawHost();
  const adapter = createAdapter(client, {
    replayHintResolver: () => ({ playbookId: 'pb-click-rg-loop' }),
  });
  attachToOpenClawHost(host, adapter);

  const ctx = { agentId: 'agent-1', sessionId: 'sess-4', sessionKey: 'sess-key-4', workspaceDir: '/repo/click', runId: 'run-4', toolName: 'pytest', toolCallId: 'call-4' };
  const event = { toolName: 'pytest', params: { args: ['tests/test_parser.py'] }, runId: 'run-4', toolCallId: 'call-4' };

  await host.emit('before_tool_call', event, ctx);
  await host.emit('before_tool_call', event, ctx);
  const stop = await host.emit('before_tool_call', event, ctx);

  assert.equal(stop.block, true);
  assert.equal(stop.blockReason, 'handoff stored after loop-control stop');
  assert.equal(calls.handoffStore.length, 1);
});

test('before_agent_start resets execution-local loop streaks across agents', async () => {
  const { client } = createFakeClient();
  const host = new MockOpenClawHost();
  const adapter = createAdapter(client);
  attachToOpenClawHost(host, adapter);

  const sessionCtx = { sessionId: 'sess-5', sessionKey: 'sess-key-5', workspaceDir: '/repo/click', trigger: 'user' };
  await host.emit('session_start', { sessionId: 'sess-5', sessionKey: 'sess-key-5' }, sessionCtx);

  const agentOneCtx = { ...sessionCtx, agentId: 'agent-1', runId: 'run-a', toolName: 'rg', toolCallId: 'call-a' };
  const event = { toolName: 'rg', params: { q: 'OptionParser' }, runId: 'run-a', toolCallId: 'call-a' };

  await host.emit('before_agent_start', { prompt: 'first agent prompt', messages: [{ toolName: 'rg' }] }, agentOneCtx);
  await host.emit('before_tool_call', event, agentOneCtx);
  await host.emit('before_tool_call', event, agentOneCtx);

  const agentTwoCtx = { ...sessionCtx, agentId: 'agent-2', runId: 'run-b', toolName: 'rg', toolCallId: 'call-b' };
  await host.emit('before_agent_start', { prompt: 'second agent prompt', messages: [{ toolName: 'rg' }] }, agentTwoCtx);
  const result = await host.emit('before_tool_call', { ...event, runId: 'run-b', toolCallId: 'call-b' }, agentTwoCtx);

  assert.equal(result?.block, undefined);
});
