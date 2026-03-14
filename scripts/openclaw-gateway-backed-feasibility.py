#!/usr/bin/env python3

import json
import os
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parent.parent
ARTIFACT_ROOT = ROOT / "artifacts" / "openclaw-gateway-backed-feasibility"
PROFILE = "benchzai-runtime"
SESSION_ID = "gateway-feasibility-1"
MESSAGE = "Reply with ok only."


def ts() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")


def extract_json_block(text: str) -> Optional[dict]:
    for idx, ch in enumerate(text):
        if ch != "{":
            continue
        block = text[idx:]
        try:
            return json.loads(block)
        except json.JSONDecodeError:
            continue
    return None


def classify_outcome(raw_output: str, payload: Optional[dict]) -> str:
    payload_text = ""
    if payload:
        payloads = payload.get("payloads") or []
        if payloads and isinstance(payloads[0], dict):
            payload_text = str(payloads[0].get("text") or "")
    haystack = f"{raw_output}\n{payload_text}".lower()
    if "api rate limit reached" in haystack:
        if payload and payload.get("meta", {}).get("aborted") is True:
            return "rate_limited_timeout"
        return "rate_limited"
    if payload and payload.get("meta", {}).get("aborted") is True:
        return "timeout"
    if payload and payload.get("meta", {}).get("agentMeta"):
        return "success"
    return "unknown"


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
    }
    (state_dir / "openclaw.json").write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")

    env = os.environ.copy()
    env["HOME"] = str(home_dir)
    env["OPENCLAW_HOME"] = str(home_dir)
    env["ZAI_API_KEY"] = api_key

    cmd = [
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

    proc = subprocess.run(
        cmd,
        cwd=str(ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=40,
    )

    raw_stdout = proc.stdout
    (out_dir / "stdout.log").write_text(raw_stdout, encoding="utf-8")
    (out_dir / "config.json").write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")

    payload = extract_json_block(raw_stdout)
    meta = (payload or {}).get("meta") or {}
    agent_meta = meta.get("agentMeta") or {}
    prompt_report = meta.get("systemPromptReport") or {}

    summary = {
        "benchmark_id": "openclaw_gateway_backed_feasibility_v1",
        "run_id": run_id,
        "profile": PROFILE,
        "session_id": SESSION_ID,
        "message": MESSAGE,
        "return_code": proc.returncode,
        "provider": agent_meta.get("provider"),
        "model": agent_meta.get("model"),
        "runtime_path_reached_model": bool(agent_meta.get("provider") == "zai" and agent_meta.get("model") == "glm-5"),
        "outcome": classify_outcome(raw_stdout, payload),
        "aborted": meta.get("aborted"),
        "duration_ms": meta.get("durationMs"),
        "system_prompt_chars": (prompt_report.get("systemPrompt") or {}).get("chars"),
        "tool_count": len((prompt_report.get("tools") or {}).get("entries") or []),
        "skills_count": len((prompt_report.get("skills") or {}).get("entries") or []),
        "payload_text": ((payload or {}).get("payloads") or [{}])[0].get("text"),
        "raw_output_excerpt": raw_stdout[:2000],
        "artifacts": {
            "stdout_log": str(out_dir / "stdout.log"),
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
