#!/usr/bin/env python3

import json
import os
import shutil
import subprocess
import tempfile
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ARTIFACT_ROOT = ROOT / "artifacts" / "openclaw-adapter-activity-probe"
PROFILE = "bench-activity"
SESSION_ID = "adapter-activity-1"
MESSAGE = "Reply with ok only."
PLUGIN_ID = "openclaw-adapter"


def ts() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")


class ProbeHandler(BaseHTTPRequestHandler):
    requests = []
    lock = threading.Lock()

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
            self.requests.append(
                {
                    "path": self.path,
                    "headers": {k.lower(): v for k, v in self.headers.items()},
                    "body": body,
                }
            )

        if self.path == "/v1/memory/context/assemble":
            payload = {
                "layered_context": {"merged_text": "adapter-activity-probe-context"},
                "tools": {
                    "decision": {
                        "decision_id": "probe-decision",
                        "decision_uri": "aionis://decision/probe-decision",
                        "selected_tool": None,
                    },
                    "selection": {"selected": None, "denied": []},
                    "selection_summary": "probe context assemble",
                },
            }
        elif self.path == "/v1/handoff/store":
            payload = {"ok": True, "handoff_id": "probe-handoff"}
        else:
            payload = {"ok": True}

        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


def extract_json_block(text: str):
    for idx, ch in enumerate(text):
        if ch != "{":
            continue
        block = text[idx:]
        try:
            return json.loads(block)
        except json.JSONDecodeError:
            continue
    return None


def as_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return str(value)


def main() -> int:
    api_key = os.environ.get("ZAI_API_KEY")
    if not api_key:
        raise SystemExit("ZAI_API_KEY is required")

    run_id = ts()
    out_dir = ARTIFACT_ROOT / run_id
    out_dir.mkdir(parents=True, exist_ok=True)

    home_dir = Path(tempfile.mkdtemp(prefix="oc-home-"))
    state_dir = home_dir / f".openclaw-{PROFILE}"
    state_dir.mkdir(parents=True, exist_ok=True)

    server = ThreadingHTTPServer(("127.0.0.1", 0), ProbeHandler)
    port = server.server_address[1]
    base_url = f"http://127.0.0.1:{port}"
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    config = {
        "agents": {
            "defaults": {
                "skipBootstrap": True,
                "timeoutSeconds": 30,
                "model": {"primary": "zai/glm-5"},
                "models": {"zai/glm-5": {"params": {"tool_stream": False}}},
            }
        },
        "tools": {"profile": "minimal"},
        "plugins": {
            "entries": {
                PLUGIN_ID: {
                    "enabled": True,
                    "config": {
                        "baseUrl": base_url,
                        "tenantId": "bench",
                        "actor": "activity-probe",
                        "replayDispatchEnabled": False,
                        "handoffFallbackEnabled": True,
                        "strictToolBlocking": False,
                    },
                }
            }
        },
    }
    (state_dir / "openclaw.json").write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")

    env = os.environ.copy()
    env["HOME"] = str(home_dir)
    env["OPENCLAW_HOME"] = str(home_dir)
    env["ZAI_API_KEY"] = api_key

    install_cmd = ["openclaw", "--profile", PROFILE, "plugins", "install", str(ROOT), "--link"]
    install = subprocess.run(
        install_cmd,
        cwd=str(ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=30,
    )
    (out_dir / "install.log").write_text(install.stdout, encoding="utf-8")

    agent_cmd = [
        "openclaw",
        "--profile",
        PROFILE,
        "agent",
        "--local",
        "--session-id",
        SESSION_ID,
        "--message",
        MESSAGE,
        "--json",
        "--timeout",
        "30",
    ]
    timed_out = False
    try:
        agent = subprocess.run(
            agent_cmd,
            cwd=str(ROOT),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=40,
        )
        agent_stdout = agent.stdout
        agent_return_code = agent.returncode
    except subprocess.TimeoutExpired as exc:
        timed_out = True
        agent_stdout = as_text(exc.stdout)
        agent_return_code = None
    (out_dir / "agent.log").write_text(agent_stdout, encoding="utf-8")

    payload = extract_json_block(agent_stdout) or {}
    meta = payload.get("meta") or {}
    agent_meta = meta.get("agentMeta") or {}

    server.shutdown()
    server.server_close()
    thread.join(timeout=2)

    requests = list(ProbeHandler.requests)
    ProbeHandler.requests = []

    (out_dir / "requests.json").write_text(json.dumps(requests, indent=2) + "\n", encoding="utf-8")
    (out_dir / "config.json").write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")

    paths = [item.get("path") for item in requests]
    summary = {
        "benchmark_id": "openclaw_adapter_activity_probe_v1",
        "run_id": run_id,
        "profile": PROFILE,
        "session_id": SESSION_ID,
        "plugin_id": PLUGIN_ID,
        "install_return_code": install.returncode,
        "agent_return_code": agent_return_code,
        "agent_process_timed_out": timed_out,
        "provider": agent_meta.get("provider"),
        "model": agent_meta.get("model"),
        "runtime_path_reached_model": bool(agent_meta.get("provider") == "zai" and agent_meta.get("model") == "glm-5"),
        "mock_request_count": len(requests),
        "mock_paths": paths,
        "context_assemble_seen": "/v1/memory/context/assemble" in paths,
        "handoff_store_seen": "/v1/handoff/store" in paths,
        "payload_text": ((payload.get("payloads") or [{}])[0]).get("text"),
        "outcome": "adapter_active" if "/v1/memory/context/assemble" in paths else "adapter_inactive",
        "artifacts": {
            "install_log": str(out_dir / "install.log"),
            "agent_log": str(out_dir / "agent.log"),
            "requests": str(out_dir / "requests.json"),
            "config": str(out_dir / "config.json"),
        },
    }

    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    (ARTIFACT_ROOT / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")

    print(json.dumps(summary, indent=2))

    shutil.rmtree(home_dir, ignore_errors=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
