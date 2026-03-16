import test from 'node:test';
import assert from 'node:assert/strict';

import { AionisHttpClientError, AionisLoopControlAdapter, attachToOpenClawHost } from '../dist/index.js';

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
        control_profile_v1: {
          version: 1,
          profile: 'triage',
          max_same_tool_streak: 1,
          max_no_progress_streak: 2,
          max_duplicate_observation_streak: 2,
          max_steps: 4,
          allow_broad_scan: false,
          allow_broad_test: false,
          escalate_on_blocker: true,
          reviewer_ready_required: false,
        },
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
  assert.equal(calls.contextAssemble[0].context.control_profile, 'triage');
  assert.equal(calls.contextAssemble[0].context.continuity_handoff_text ?? null, null);
});

test('control profile tightens loop thresholds after continuity recovery', async () => {
  const { client } = createFakeClient();
  const host = new MockOpenClawHost();
  const adapter = createAdapter(client);
  attachToOpenClawHost(host, adapter);

  const runCtx = { agentId: 'agent-1', sessionId: 'sess-1c', sessionKey: 'sess-key-1c', workspaceDir: '/repo/click', trigger: 'resume' };
  await host.emit(
    'before_agent_start',
    {
      prompt: 'resume narrow triage workflow',
      messages: [{ toolName: 'rg' }],
      continuity: {
        control_profile_v1: {
          version: 1,
          profile: 'triage',
          max_same_tool_streak: 1,
          max_no_progress_streak: 3,
          max_duplicate_observation_streak: 3,
          max_steps: 8,
          allow_broad_scan: true,
          allow_broad_test: false,
          escalate_on_blocker: true,
          reviewer_ready_required: false,
        },
      },
    },
    runCtx,
  );

  const toolCtx = { ...runCtx, runId: 'run-profile-1', toolName: 'rg', toolCallId: 'call-profile-1' };
  const event = { toolName: 'rg', params: { q: 'markdown' }, runId: 'run-profile-1', toolCallId: 'call-profile-1' };
  const first = await host.emit('before_tool_call', event, toolCtx);
  const second = await host.emit('before_tool_call', event, toolCtx);

  assert.equal(first?.block ?? false, false);
  assert.equal(second?.block, true);
  assert.match(String(second?.blockReason ?? ''), /same_tool_streak_exceeded|handoff stored after loop-control stop/);
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

test('before_tool_call turns no_tools_allowed into a controlled block', async () => {
  const { client, calls } = createFakeClient();
  client.toolsSelect = async () => {
    throw new AionisHttpClientError(
      'no candidates remain after deny filters',
      400,
      'no_tools_allowed',
      { error: 'no_tools_allowed' },
    );
  };

  const host = new MockOpenClawHost();
  const adapter = createAdapter(client);
  attachToOpenClawHost(host, adapter);

  const ctx = { agentId: 'agent-no-tools', sessionId: 'sess-no-tools', sessionKey: 'sess-key-no-tools', workspaceDir: '/repo/click', runId: 'run-no-tools', toolName: 'broad-auth-scan', toolCallId: 'call-no-tools' };
  const event = { toolName: 'broad-auth-scan', params: { q: 'auth mismatch' }, runId: 'run-no-tools', toolCallId: 'call-no-tools' };

  const result = await host.emit('before_tool_call', event, ctx);

  assert.equal(result?.block, true);
  assert.equal(result?.blockReason, 'handoff stored after loop-control stop');
  assert.equal(calls.handoffStore.length, 1);
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

test('enabled=false disables loop-control blocking and Aionis hot-path calls', async () => {
  const { client, calls } = createFakeClient();
  const host = new MockOpenClawHost();
  const adapter = createAdapter(client, {
    thresholds: {
      enabled: false,
      maxSteps: 0,
      maxSameToolStreak: 0,
      maxDuplicateObservationStreak: 0,
      maxNoProgressStreak: 0,
      maxEstimatedTokenBurn: 0,
      maxBroadTestInvocations: 0,
      maxBroadScanInvocations: 0,
    },
  });
  attachToOpenClawHost(host, adapter);

  const ctx = { agentId: 'agent-disabled', sessionId: 'sess-disabled', sessionKey: 'sess-key-disabled', workspaceDir: '/repo/click', trigger: 'user', runId: 'run-disabled', toolName: 'rg', toolCallId: 'call-disabled' };
  const beforeStart = await host.emit('before_agent_start', { prompt: 'disabled path', messages: [{ toolName: 'rg' }] }, ctx);
  const beforeTool = await host.emit('before_tool_call', { toolName: 'rg', params: { q: 'OptionParser' }, runId: 'run-disabled', toolCallId: 'call-disabled' }, ctx);
  await host.emit('after_tool_call', { toolName: 'rg', params: { q: 'OptionParser' }, runId: 'run-disabled', toolCallId: 'call-disabled', result: { matches: [] }, durationMs: 10 }, ctx);

  assert.equal(beforeStart, undefined);
  assert.equal(beforeTool, undefined);
  assert.equal(calls.contextAssemble.length, 0);
  assert.equal(calls.rulesEvaluate.length, 0);
  assert.equal(calls.toolsSelect.length, 0);
  assert.equal(calls.toolsFeedback.length, 0);
  assert.equal(calls.write.length, 0);
});

test('adapter fails open when Aionis hot-path calls throw', async () => {
  const { client, calls } = createFakeClient();
  client.contextAssemble = async () => {
    throw new Error('context assemble down');
  };
  client.rulesEvaluate = async () => {
    throw new Error('rules evaluate down');
  };
  client.toolsSelect = async () => {
    throw new Error('tools select down');
  };
  client.toolsFeedback = async () => {
    throw new Error('tools feedback down');
  };
  client.write = async () => {
    throw new Error('write down');
  };
  client.handoffStore = async () => {
    throw new Error('handoff down');
  };

  const host = new MockOpenClawHost();
  const adapter = createAdapter(client);
  attachToOpenClawHost(host, adapter);

  const runCtx = { agentId: 'agent-fail-open', sessionId: 'sess-fail-open', sessionKey: 'sess-key-fail-open', workspaceDir: '/repo/click', trigger: 'user' };
  const start = await host.emit('before_agent_start', { prompt: 'fail open path', messages: [{ toolName: 'rg' }] }, runCtx);
  const toolCtx = { ...runCtx, runId: 'run-fail-open', toolName: 'rg', toolCallId: 'call-fail-open' };
  const beforeTool = await host.emit('before_tool_call', { toolName: 'rg', params: { q: 'OptionParser' }, runId: 'run-fail-open', toolCallId: 'call-fail-open' }, toolCtx);
  await host.emit('after_tool_call', { toolName: 'rg', params: { q: 'OptionParser' }, runId: 'run-fail-open', toolCallId: 'call-fail-open', result: { matches: ['click/parser.py:42'] }, durationMs: 12 }, toolCtx);
  await host.emit('agent_end', { success: false, error: 'degraded run' }, runCtx);

  assert.equal(start, undefined);
  assert.equal(beforeTool, undefined);
  assert.equal(calls.contextAssemble.length, 0);
});
