#!/usr/bin/env python3
import json
import os
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path('/Volumes/ziel/openclaw-aionis-adapter')
ARTIFACT_ROOT = ROOT / 'artifacts' / 'openclaw-loader-backed-semi-live-token-benchmark'


def run(args, env, cwd=None, timeout=180):
    return subprocess.run(
        args,
        env=env,
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )


def parse_json_with_leading_logs(text: str):
    for marker in ('{', '['):
        idx = text.find(marker)
        if idx >= 0:
            try:
                return json.loads(text[idx:])
            except Exception:
                pass
    raise RuntimeError(f'expected JSON payload in output, got: {text[:500]}')


def main() -> int:
    temp_home = pathlib.Path(tempfile.mkdtemp(prefix='openclaw-loader-bench-home.'))
    state_dir = temp_home / '.openclaw'
    state_dir.mkdir(parents=True, exist_ok=True)
    (state_dir / 'openclaw.json').write_text(json.dumps({'plugins': {'enabled': True}}, indent=2) + '\n')

    env = os.environ.copy()
    env['HOME'] = str(temp_home)
    env['OPENCLAW_STATE_DIR'] = str(state_dir)

    install = run(['openclaw', 'plugins', 'install', str(ROOT), '--link'], env, timeout=60)
    if install.returncode != 0:
        print(install.stdout)
        print(install.stderr, file=sys.stderr)
        raise RuntimeError(f'install failed: {install.returncode}')

    info_cp = run(['openclaw', 'plugins', 'info', 'openclaw-aionis-adapter', '--json'], env, timeout=60)
    if info_cp.returncode != 0:
        print(info_cp.stdout)
        print(info_cp.stderr, file=sys.stderr)
        raise RuntimeError(f'plugin info failed: {info_cp.returncode}')
    info_json = parse_json_with_leading_logs(info_cp.stdout)
    plugin_source = info_json.get('source')
    if not plugin_source:
        raise RuntimeError('plugin info did not return source path')

    bench_env = env.copy()
    bench_env['PLUGIN_MODULE_PATH'] = str(plugin_source)
    bench_env['BENCHMARK_ID'] = 'openclaw_loader_backed_semi_live_token_v1'
    bench_env['BENCH_ARTIFACT_SUBDIR'] = 'openclaw-loader-backed-semi-live-token-benchmark'

    bench = run(['npm', 'run', 'bench:semi-live-token'], bench_env, cwd=str(ROOT), timeout=480)
    if bench.returncode != 0:
        print(bench.stdout)
        print(bench.stderr, file=sys.stderr)
        raise RuntimeError(f'loader-backed benchmark failed: {bench.returncode}')

    bench_json = parse_json_with_leading_logs(bench.stdout)
    artifact_dir = pathlib.Path(bench_json['artifactDir'])
    summary_json = json.loads((artifact_dir / 'summary.json').read_text())

    ARTIFACT_ROOT.mkdir(parents=True, exist_ok=True)
    (ARTIFACT_ROOT / 'install.stdout.log').write_text(install.stdout)
    (ARTIFACT_ROOT / 'install.stderr.log').write_text(install.stderr)
    (ARTIFACT_ROOT / 'info.stdout.log').write_text(info_cp.stdout)
    (ARTIFACT_ROOT / 'info.stderr.log').write_text(info_cp.stderr)
    (ARTIFACT_ROOT / 'plugin-info.json').write_text(json.dumps(info_json, indent=2) + '\n')
    (ARTIFACT_ROOT / 'benchmark.stdout.log').write_text(bench.stdout)
    (ARTIFACT_ROOT / 'benchmark.stderr.log').write_text(bench.stderr)
    summary = {
        'ok': True,
        'plugin_source': plugin_source,
        'artifact_dir': str(artifact_dir),
        'benchmark': summary_json.get('benchmark'),
        'provider': summary_json.get('provider'),
        'model': summary_json.get('model'),
        'cases': summary_json.get('cases'),
        'baseline': summary_json.get('baseline'),
        'treatment': summary_json.get('treatment'),
    }
    (ARTIFACT_ROOT / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
