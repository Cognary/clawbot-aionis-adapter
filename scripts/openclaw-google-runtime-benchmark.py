#!/usr/bin/env python3

import argparse
import json
import os
import shutil
import subprocess
import tempfile
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from statistics import mean
from typing import Any, Dict, List, Optional

ROOT = Path(__file__).resolve().parent.parent
ARTIFACT_ROOT = ROOT / "artifacts" / "openclaw-google-runtime-benchmark"
PROFILE_BASE = "bench-google-runtime"
MODEL = "google/gemini-3-flash-preview"
PLUGIN_ID = "openclaw-aionis-adapter"
QUESTION = (
    "Resume the previous run and reply with the exact resume token only. "
    "If the token is unknown from current context, reply UNKNOWN."
)
EXPECTED = "resume-alpha-19"


def ts() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")


def extract_json_block(text: str) -> Optional[Dict[str, Any]]:
    for idx, ch in enumerate(text):
        if ch != "{":
            continue
        block = text[idx:]
        try:
            return json.loads(block)
        except json.JSONDecodeError:
            continue
    return None


def as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return str(value)


class ContextHandler(BaseHTTPRequestHandler):
    lock = threading.Lock()
    requests: List[Dict[str, Any]] = []

    def log_message(self, fmt, *args):
        return

    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        try:
            body = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            body = {"_raw": raw}
        with self.lock:
            self.requests.append({"path": self.path, "body": body})

        if self.path == "/v1/memory/context/assemble":
            payload = {
                "layered_context": {
                    "merged_text": (
                        "Recovered execution context:\n"
                        "resume token = resume-alpha-19\n"
                        "Return the token exactly when asked."
                    )
                },
                "tools": {
                    "decision": {
                        "decision_id": "runtime-bench-decision",
                        "decision_uri": "aionis://decision/runtime-bench-decision",
                        "selected_tool": None,
                    },
                    "selection": {"selected": None, "denied": []},
                    "selection_summary": "resume token is already known",
                },
            }
        else:
            payload = {"ok": True}

        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


def write_config(
    state_dir: Path,
    workspace: Path,
    mode: str,
    base_url: Optional[str] = None,
) -> Dict[str, Any]:
    config = {
        "agents": {
            "defaults": {
                "workspace": str(workspace),
                "skipBootstrap": True,
                "timeoutSeconds": 30,
                "model": {"primary": MODEL},
            }
        },
        "tools": {"profile": "minimal"},
        "skills": {"allowBundled": []},
    }
    if mode == "treatment":
        config["plugins"] = {
            "entries": {
                PLUGIN_ID: {
                    "enabled": True,
                    "config": {
                        "baseUrl": base_url,
                        "tenantId": "bench",
                        "actor": "google-runtime-benchmark",
                        "replayDispatchEnabled": False,
                        "handoffFallbackEnabled": False,
                        "strictToolBlocking": False,
                    },
                }
            }
        }
    (state_dir / "openclaw.json").write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
    return config


def run_arm(mode: str, out_dir: Path, iteration: int) -> Dict[str, Any]:
    home_dir = Path(tempfile.mkdtemp(prefix="oc-%s-" % mode))
    profile = "%s-%s-%02d" % (PROFILE_BASE, mode, iteration)
    state_dir = home_dir / (".openclaw-%s" % profile)
    state_dir.mkdir(parents=True, exist_ok=True)
    workspace = Path(tempfile.mkdtemp(prefix="oc-ws-%s-" % mode))

    env = os.environ.copy()
    env["HOME"] = str(home_dir)
    env["OPENCLAW_HOME"] = str(home_dir)

    server = None
    thread = None
    base_url = None
    if mode == "treatment":
        server = ThreadingHTTPServer(("127.0.0.1", 0), ContextHandler)
        base_url = "http://127.0.0.1:%s" % server.server_address[1]
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()

    config = write_config(state_dir, workspace, mode, base_url=base_url)

    install_rc = None
    install_out = ""
    if mode == "treatment":
        try:
            install = subprocess.run(
                ["openclaw", "--profile", profile, "plugins", "install", str(ROOT), "--link"],
                cwd=str(ROOT),
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                timeout=60,
            )
            install_rc = install.returncode
            install_out = install.stdout
        except subprocess.TimeoutExpired as exc:
            install_rc = None
            install_out = as_text(exc.stdout)
            raise RuntimeError("plugin install timed out for profile %s" % profile)

    try:
        proc = subprocess.run(
            [
                "openclaw",
                "--profile",
                profile,
                "agent",
                "--local",
                "--session-id",
                "%s-session-%02d" % (mode, iteration),
                "--message",
                QUESTION,
                "--json",
                "--timeout",
                "30",
            ],
            cwd=str(ROOT),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=40,
        )
        stdout = proc.stdout
        return_code = proc.returncode
        timed_out = False
    except subprocess.TimeoutExpired as exc:
        stdout = as_text(exc.stdout)
        return_code = None
        timed_out = True

    payload = extract_json_block(stdout) or {}
    meta = payload.get("meta") or {}
    agent_meta = meta.get("agentMeta") or {}
    payload_text = ((payload.get("payloads") or [{}])[0]).get("text")
    normalized_text = (payload_text or "").strip()

    if server:
        server.shutdown()
        server.server_close()
    if thread:
        thread.join(timeout=2)

    requests = list(ContextHandler.requests)
    ContextHandler.requests = []

    arm_dir = out_dir / mode
    arm_dir.mkdir(parents=True, exist_ok=True)
    (arm_dir / "config.json").write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
    (arm_dir / "agent.log").write_text(stdout, encoding="utf-8")
    (arm_dir / "install.log").write_text(install_out, encoding="utf-8")
    (arm_dir / "requests.json").write_text(json.dumps(requests, indent=2) + "\n", encoding="utf-8")

    shutil.rmtree(home_dir, ignore_errors=True)
    shutil.rmtree(workspace, ignore_errors=True)

    return {
        "mode": mode,
        "install_return_code": install_rc,
        "agent_return_code": return_code,
        "agent_process_timed_out": timed_out,
        "provider": agent_meta.get("provider"),
        "model": agent_meta.get("model"),
        "payload_text": payload_text,
        "completed": normalized_text == EXPECTED,
        "usage": agent_meta.get("usage") or agent_meta.get("lastCallUsage") or {},
        "duration_ms": meta.get("durationMs"),
        "mock_request_count": len(requests),
        "mock_paths": [item.get("path") for item in requests],
        "artifacts": {
            "config": str(arm_dir / "config.json"),
            "agent_log": str(arm_dir / "agent.log"),
            "install_log": str(arm_dir / "install.log"),
            "requests": str(arm_dir / "requests.json"),
        },
    }


def total_tokens(arm: Dict[str, Any]) -> Optional[int]:
    usage = arm.get("usage") or {}
    return usage.get("total")


def build_single_summary(run_id: str, baseline: Dict[str, Any], treatment: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "benchmark_id": "openclaw_google_runtime_externalized_context_v1",
        "run_id": run_id,
        "scenario": "externalized_context_resume_token",
        "provider": "google",
        "model": "gemini-3-flash-preview",
        "question": QUESTION,
        "expected": EXPECTED,
        "baseline": baseline,
        "treatment": treatment,
        "delta": {
            "completion_gain": int(treatment.get("completed", False)) - int(baseline.get("completed", False)),
            "token_delta": (total_tokens(treatment) or 0) - (total_tokens(baseline) or 0),
        },
    }


def avg_int(values: List[Optional[int]]) -> Optional[float]:
    kept = [value for value in values if value is not None]
    return mean(kept) if kept else None


def rate(values: List[bool]) -> float:
    return sum(1 for value in values if value) / len(values) if values else 0.0


def build_repeated_summary(run_id: str, cases: List[Dict[str, Any]]) -> Dict[str, Any]:
    baseline_cases = [case["baseline"] for case in cases]
    treatment_cases = [case["treatment"] for case in cases]

    baseline_completed = [bool(arm.get("completed")) for arm in baseline_cases]
    treatment_completed = [bool(arm.get("completed")) for arm in treatment_cases]
    token_deltas = []
    for case in cases:
        baseline_total = total_tokens(case["baseline"])
        treatment_total = total_tokens(case["treatment"])
        if baseline_total is None or treatment_total is None:
            continue
        token_deltas.append(treatment_total - baseline_total)

    return {
        "benchmark_id": "openclaw_google_runtime_externalized_context_ab_v1",
        "run_id": run_id,
        "scenario": "externalized_context_resume_token",
        "provider": "google",
        "model": "gemini-3-flash-preview",
        "question": QUESTION,
        "expected": EXPECTED,
        "repetitions": len(cases),
        "baseline": {
            "completed_rate": rate(baseline_completed),
            "avg_total_tokens": avg_int([total_tokens(arm) for arm in baseline_cases]),
            "avg_duration_ms": avg_int([arm.get("duration_ms") for arm in baseline_cases]),
            "completion_count": sum(1 for value in baseline_completed if value),
            "timed_out_count": sum(1 for arm in baseline_cases if arm.get("agent_process_timed_out")),
        },
        "treatment": {
            "completed_rate": rate(treatment_completed),
            "avg_total_tokens": avg_int([total_tokens(arm) for arm in treatment_cases]),
            "avg_duration_ms": avg_int([arm.get("duration_ms") for arm in treatment_cases]),
            "avg_mock_request_count": avg_int([arm.get("mock_request_count") for arm in treatment_cases]),
            "completion_count": sum(1 for value in treatment_completed if value),
            "timed_out_count": sum(1 for arm in treatment_cases if arm.get("agent_process_timed_out")),
        },
        "delta": {
            "completion_gain": rate(treatment_completed) - rate(baseline_completed),
            "avg_token_delta": mean(token_deltas) if token_deltas else None,
            "token_win_rate": rate([delta < 0 for delta in token_deltas]),
            "token_pair_count": len(token_deltas),
        },
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repeats", type=int, default=1)
    return parser.parse_args()


def main() -> int:
    if not os.environ.get("GEMINI_API_KEY"):
        raise SystemExit("GEMINI_API_KEY is required")

    args = parse_args()
    if args.repeats < 1:
        raise SystemExit("--repeats must be >= 1")

    run_id = ts()
    out_dir = ARTIFACT_ROOT / run_id
    out_dir.mkdir(parents=True, exist_ok=True)

    cases: List[Dict[str, Any]] = []
    for iteration in range(1, args.repeats + 1):
        case_dir = out_dir / ("run-%02d" % iteration)
        case_dir.mkdir(parents=True, exist_ok=True)
        baseline = run_arm("baseline", case_dir, iteration)
        treatment = run_arm("treatment", case_dir, iteration)
        case = {
            "iteration": iteration,
            "baseline": baseline,
            "treatment": treatment,
            "delta": {
                "completion_gain": int(treatment.get("completed", False)) - int(baseline.get("completed", False)),
                "token_delta": (total_tokens(treatment) or 0) - (total_tokens(baseline) or 0),
            },
        }
        cases.append(case)

    if args.repeats == 1:
        summary = build_single_summary(run_id, cases[0]["baseline"], cases[0]["treatment"])
    else:
        summary = build_repeated_summary(run_id, cases)

    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    (out_dir / "cases.jsonl").write_text(
        "".join(json.dumps(case) + "\n" for case in cases),
        encoding="utf-8",
    )
    (ARTIFACT_ROOT / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
