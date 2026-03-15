import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { createAionisHttpLoopControlClient } from '../dist/index.js';

async function withServer(handler, run) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: body ? JSON.parse(body) : null,
    });
    await handler(req, res, requests[requests.length - 1]);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run({ baseUrl, requests });
  } finally {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
}

test('http client shapes context and replay requests against Aionis endpoints', async () => {
  let routeIndex = 0;
  await withServer((req, res) => {
    routeIndex += 1;
    res.setHeader('content-type', 'application/json');
    if (req.url === '/v1/memory/context/assemble') {
      res.end(JSON.stringify({
        scope: 'openclaw:test',
        layered_context: { merged_text: 'assembled context' },
        tools: {
          selection: { selected: 'rg', denied: [{ name: 'grep', reason: 'broad scan' }] },
          decision: { decision_id: 'dec-ctx', decision_uri: 'aionis://decision/ctx', selected_tool: 'rg' },
        },
      }));
      return;
    }
    if (req.url === '/v1/memory/replay/playbooks/candidate') {
      res.end(JSON.stringify({
        scope: 'openclaw:test',
        candidate: { eligible_for_deterministic_replay: true, recommended_mode: 'simulate' },
      }));
      return;
    }
    if (req.url === '/v1/memory/replay/playbooks/dispatch') {
      res.end(JSON.stringify({ scope: 'openclaw:test', dispatch: { decision: 'deterministic_replay_executed' } }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'unexpected_route' }));
  }, async ({ baseUrl, requests }) => {
    const client = createAionisHttpLoopControlClient({
      baseUrl,
      tenantId: 'tenant-test',
      actor: 'adapter-test',
      apiKey: 'test-key',
    });

    const context = await client.contextAssemble({
      scope: 'openclaw:test',
      queryText: 'narrow the failing click tests',
      context: { source: 'test' },
      toolCandidates: ['rg', 'pytest'],
    });
    assert.equal(context.layered_context.merged_text, 'assembled context');
    assert.equal(context.tools.selected_tool, 'rg');
    assert.deepEqual(context.tools.denied_tools, ['grep']);

    const candidate = await client.replayPlaybookCandidate({
      scope: 'openclaw:test',
      playbookId: 'pb-click-focus',
    });
    assert.equal(candidate.candidate.eligible_for_deterministic_replay, true);

    await client.replayPlaybookDispatch({
      scope: 'openclaw:test',
      playbookId: 'pb-click-focus',
      params: { target: 'focused-tests' },
      mode: 'simulate',
      maxSteps: 5,
    });

    assert.equal(requests.length, 3);
    assert.equal(requests[0].body.tenant_id, 'tenant-test');
    assert.equal(requests[0].body.actor, 'adapter-test');
    assert.equal(requests[0].body.scope, 'openclaw:test');
    assert.deepEqual(requests[0].body.tool_candidates, ['rg', 'pytest']);
    assert.equal(requests[1].body.playbook_id, 'pb-click-focus');
    assert.equal(requests[2].body.max_steps, 5);
    assert.equal(requests[2].headers['x-api-key'], 'test-key');
  });
});

test('http client includes continuity-delivered control profile in tools/select context', async () => {
  await withServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/v1/memory/tools/select') {
      res.end(JSON.stringify({
        selection: { selected: 'read-dashboard-doc', denied: [{ name: 'broad-auth-scan', reason: 'control_profile' }] },
        decision: { decision_id: 'dec-tools', decision_uri: 'aionis://decision/tools', selected_tool: 'read-dashboard-doc' },
      }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'unexpected_route' }));
  }, async ({ baseUrl, requests }) => {
    const client = createAionisHttpLoopControlClient({
      baseUrl,
      tenantId: 'tenant-test',
      actor: 'adapter-test',
    });

    const decision = await client.toolsSelect({
      scope: 'openclaw:test',
      runId: 'run-1',
      context: { source: 'test-tools-select' },
      candidates: ['broad-auth-scan', 'read-dashboard-doc'],
      controlProfileV1: {
        version: 1,
        profile: 'triage',
        max_same_tool_streak: 2,
        max_no_progress_streak: 2,
        max_duplicate_observation_streak: 2,
        max_steps: 8,
        allow_broad_scan: false,
        allow_broad_test: false,
        escalate_on_blocker: true,
        reviewer_ready_required: false,
      },
    });

    assert.equal(decision.selected_tool, 'read-dashboard-doc');
    assert.deepEqual(decision.denied_tools, ['broad-auth-scan']);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.context.control_profile_v1.profile, 'triage');
    assert.equal(requests[0].body.context.control_profile_v1.allow_broad_scan, false);
    assert.deepEqual(requests[0].body.candidates, ['broad-auth-scan', 'read-dashboard-doc']);
  });
});
