import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function runOpenClaw(args, env) {
  return execFileAsync('openclaw', args, {
    env: {
      ...process.env,
      ...env,
    },
    maxBuffer: 10 * 1024 * 1024,
  });
}

function parseJsonWithLeadingLogs(text) {
  const firstBrace = text.indexOf('{');
  if (firstBrace < 0) {
    throw new Error(`expected JSON payload in output, got: ${text.slice(0, 400)}`);
  }
  return JSON.parse(text.slice(firstBrace));
}

async function main() {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'openclaw-adapter-home.'));
  const stateDir = path.join(tempHome, '.openclaw');
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(path.join(stateDir, 'openclaw.json'), `${JSON.stringify({ plugins: { enabled: true } }, null, 2)}\n`);

  const env = {
    HOME: tempHome,
    OPENCLAW_STATE_DIR: stateDir,
  };

  const install = await runOpenClaw(['plugins', 'install', '/Volumes/ziel/openclaw-adapter', '--link'], env);
  const list = await runOpenClaw(['plugins', 'list', '--json'], env);
  const info = await runOpenClaw(['plugins', 'info', 'openclaw-adapter', '--json'], env);

  const listJson = parseJsonWithLeadingLogs(list.stdout);
  const infoJson = parseJsonWithLeadingLogs(info.stdout);
  const plugin = Array.isArray(listJson.plugins)
    ? listJson.plugins.find((item) => item.id === 'openclaw-adapter')
    : undefined;

  if (!plugin) throw new Error('plugin not discovered by openclaw plugins list');
  if (plugin.status !== 'loaded') {
    throw new Error(`expected plugin status=loaded, got ${plugin.status}`);
  }
  if (infoJson.id !== 'openclaw-adapter') {
    throw new Error(`unexpected plugin info id ${infoJson.id}`);
  }

  const artifactDir = path.join('/Volumes/ziel/openclaw-adapter', 'artifacts', 'openclaw-load-smoke');
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(path.join(artifactDir, 'install.stdout.log'), install.stdout);
  await fs.writeFile(path.join(artifactDir, 'install.stderr.log'), install.stderr);
  await fs.writeFile(path.join(artifactDir, 'list.stdout.log'), list.stdout);
  await fs.writeFile(path.join(artifactDir, 'list.stderr.log'), list.stderr);
  await fs.writeFile(path.join(artifactDir, 'info.stdout.log'), info.stdout);
  await fs.writeFile(path.join(artifactDir, 'info.stderr.log'), info.stderr);
  await fs.writeFile(path.join(artifactDir, 'plugins-list.json'), `${JSON.stringify(listJson, null, 2)}\n`);
  await fs.writeFile(path.join(artifactDir, 'plugin-info.json'), `${JSON.stringify(infoJson, null, 2)}\n`);
  await fs.writeFile(path.join(artifactDir, 'summary.json'), `${JSON.stringify({
    ok: true,
    state_dir: stateDir,
    plugin_status: plugin.status,
    plugin_source: plugin.source,
    plugin_origin: plugin.origin,
    hook_count: plugin.hookCount ?? null,
  }, null, 2)}\n`);

  console.log(JSON.stringify({
    ok: true,
    state_dir: stateDir,
    artifact_dir: artifactDir,
    plugin_status: plugin.status,
    plugin_source: plugin.source,
    hook_count: plugin.hookCount ?? null,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
