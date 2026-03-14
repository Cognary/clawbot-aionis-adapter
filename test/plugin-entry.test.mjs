import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import plugin from '../dist/plugin.js';

async function withServer(handler, run) {
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    await handler(req, res, body ? JSON.parse(body) : null);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
}

test('plugin register attaches OpenClaw hook handlers', async () => {
  await withServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/v1/memory/context/assemble') {
      res.end(JSON.stringify({ scope: 'openclaw:test', layered_context: { merged_text: 'plugin context' } }));
      return;
    }
    if (req.url === '/v1/memory/rules/evaluate') {
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.url === '/v1/memory/tools/select') {
      res.end(JSON.stringify({
        scope: 'openclaw:test',
        selection: { selected: 'rg', denied: [] },
        decision: { decision_id: 'dec-plugin', selected_tool: 'rg' },
      }));
      return;
    }
    if (req.url === '/v1/memory/tools/feedback' || req.url === '/v1/memory/write' || req.url === '/v1/handoff/store') {
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'unexpected_route' }));
  }, async (baseUrl) => {
    const handlers = new Map();
    const logs = [];
    const api = {
      pluginConfig: {
        baseUrl,
        tenantId: 'tenant-plugin',
        actor: 'plugin-test',
        scopePrefix: 'openclaw',
        scopeMode: 'session',
      },
      logger: {
        info(msg) { logs.push(msg); },
        warn(msg) { logs.push(msg); },
        error(msg) { logs.push(msg); },
      },
      on(eventName, handler) {
        handlers.set(eventName, handler);
      },
    };

    await plugin.register(api);

    assert.equal(typeof plugin.id, 'string');
    assert.equal(handlers.has('before_agent_start'), true);
    assert.equal(handlers.has('before_tool_call'), true);
    assert.equal(handlers.has('after_tool_call'), true);
    assert.equal(handlers.has('agent_end'), true);
    assert.match(logs.join('\n'), /openclaw-adapter: registered/);
  });
});
