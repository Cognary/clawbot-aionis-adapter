#!/usr/bin/env python3
import json
import os
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path('/Volumes/ziel/openclaw-adapter')
ARTIFACT_DIR = ROOT / 'artifacts' / 'openclaw-load-smoke'


def run_openclaw(args, env):
    return subprocess.run(
        ['openclaw', *args],
        env=env,
        capture_output=True,
        text=True,
        timeout=45,
        check=False,
    )


def parse_json_with_leading_logs(text: str):
    idx = text.find('{')
    if idx < 0:
        raise RuntimeError(f'expected JSON payload in output, got: {text[:400]}')
    return json.loads(text[idx:])


def main() -> int:
    temp_home = pathlib.Path(tempfile.mkdtemp(prefix='openclaw-adapter-home.'))
    state_dir = temp_home / '.openclaw'
    state_dir.mkdir(parents=True, exist_ok=True)
    (state_dir / 'openclaw.json').write_text(json.dumps({'plugins': {'enabled': True}}, indent=2) + '\n')

    env = os.environ.copy()
    env['HOME'] = str(temp_home)
    env['OPENCLAW_STATE_DIR'] = str(state_dir)

    install = run_openclaw(['plugins', 'install', str(ROOT), '--link'], env)
    if install.returncode != 0:
      print(install.stdout)
      print(install.stderr, file=sys.stderr)
      raise RuntimeError(f'install failed: {install.returncode}')

    list_cp = run_openclaw(['plugins', 'list', '--json'], env)
    info_cp = run_openclaw(['plugins', 'info', 'openclaw-adapter', '--json'], env)
    if list_cp.returncode != 0:
      print(list_cp.stdout)
      print(list_cp.stderr, file=sys.stderr)
      raise RuntimeError(f'plugins list failed: {list_cp.returncode}')
    if info_cp.returncode != 0:
      print(info_cp.stdout)
      print(info_cp.stderr, file=sys.stderr)
      raise RuntimeError(f'plugins info failed: {info_cp.returncode}')

    list_json = parse_json_with_leading_logs(list_cp.stdout)
    info_json = parse_json_with_leading_logs(info_cp.stdout)
    plugin = next((item for item in list_json.get('plugins', []) if item.get('id') == 'openclaw-adapter'), None)
    if not plugin:
        raise RuntimeError('plugin not discovered by openclaw plugins list')
    if plugin.get('status') != 'loaded':
        raise RuntimeError(f"expected plugin status=loaded, got {plugin.get('status')}")
    if info_json.get('id') != 'openclaw-adapter':
        raise RuntimeError(f"unexpected plugin info id {info_json.get('id')}")

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    (ARTIFACT_DIR / 'install.stdout.log').write_text(install.stdout)
    (ARTIFACT_DIR / 'install.stderr.log').write_text(install.stderr)
    (ARTIFACT_DIR / 'list.stdout.log').write_text(list_cp.stdout)
    (ARTIFACT_DIR / 'list.stderr.log').write_text(list_cp.stderr)
    (ARTIFACT_DIR / 'info.stdout.log').write_text(info_cp.stdout)
    (ARTIFACT_DIR / 'info.stderr.log').write_text(info_cp.stderr)
    (ARTIFACT_DIR / 'plugins-list.json').write_text(json.dumps(list_json, indent=2) + '\n')
    (ARTIFACT_DIR / 'plugin-info.json').write_text(json.dumps(info_json, indent=2) + '\n')
    summary = {
        'ok': True,
        'state_dir': str(state_dir),
        'plugin_status': plugin.get('status'),
        'plugin_source': plugin.get('source'),
        'plugin_origin': plugin.get('origin'),
        'hook_count': plugin.get('hookCount'),
    }
    (ARTIFACT_DIR / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps({**summary, 'artifact_dir': str(ARTIFACT_DIR)}, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
