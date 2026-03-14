import { randomUUID } from "node:crypto";
import type {
  AionisHttpClientOptions,
  AionisLoopControlClient,
  AionisToolDecision,
} from "../types/aionis.js";

const DEFAULT_TIMEOUT_MS = 20_000;

export class AionisHttpClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AionisHttpClientError";
  }
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function extractToolDecision(payload: unknown): AionisToolDecision | undefined {
  if (!isRecord(payload)) return undefined;
  const decision = isRecord(payload.decision) ? payload.decision : undefined;
  const selection = isRecord(payload.selection) ? payload.selection : undefined;
  const denied = Array.isArray(selection?.denied)
    ? selection?.denied
        .map((item) => (isRecord(item) && typeof item.name === "string" ? item.name : null))
        .filter((item): item is string => Boolean(item))
    : [];

  return {
    decision_id: typeof decision?.decision_id === "string" ? decision.decision_id : undefined,
    decision_uri: typeof decision?.decision_uri === "string" ? decision.decision_uri : undefined,
    selected_tool:
      typeof decision?.selected_tool === "string"
        ? decision.selected_tool
        : typeof selection?.selected === "string"
          ? selection.selected
          : undefined,
    denied_tools: denied,
    explain: typeof payload.selection_summary === "string" ? payload.selection_summary : undefined,
  };
}

export class AionisHttpLoopControlClient implements AionisLoopControlClient {
  constructor(private readonly options: AionisHttpClientOptions) {}

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-request-id": randomUUID(),
      ...(this.options.defaultHeaders ?? {}),
    };
    if (this.options.apiKey) headers["x-api-key"] = this.options.apiKey;
    if (this.options.authBearer) headers.authorization = `Bearer ${this.options.authBearer}`;

    try {
      const res = await fetch(joinUrl(this.options.baseUrl, path), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await res.text();
      const payload = text ? JSON.parse(text) : {};
      if (!res.ok) {
        const message = isRecord(payload) && typeof payload.message === "string"
          ? payload.message
          : isRecord(payload) && typeof payload.error === "string"
            ? payload.error
            : `request failed with status ${res.status}`;
        const code = isRecord(payload) && typeof payload.error === "string" ? payload.error : undefined;
        throw new AionisHttpClientError(message, res.status, code, payload);
      }
      return payload as T;
    } catch (error) {
      if (error instanceof AionisHttpClientError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`aionis request timed out for ${path}`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private withIdentity<T extends Record<string, unknown>>(scope: string, body: T): T & Record<string, unknown> {
    return {
      tenant_id: this.options.tenantId,
      actor: this.options.actor,
      scope,
      ...body,
    };
  }

  async contextAssemble(args: {
    scope: string;
    queryText: string;
    context: Record<string, unknown>;
    toolCandidates?: string[];
  }): Promise<{ layered_context?: { merged_text?: string }; tools?: AionisToolDecision } | null> {
    const payload = await this.post<Record<string, unknown>>("/v1/memory/context/assemble", this.withIdentity(args.scope, {
      query_text: args.queryText,
      context: args.context,
      tool_candidates: args.toolCandidates,
      include_rules: true,
      return_layered_context: true,
    }));
    return {
      layered_context: isRecord(payload.layered_context) ? { merged_text: typeof payload.layered_context.merged_text === "string" ? payload.layered_context.merged_text : undefined } : undefined,
      tools: extractToolDecision(isRecord(payload.tools) ? payload.tools : payload),
    };
  }

  async rulesEvaluate(args: {
    scope: string;
    context: Record<string, unknown>;
    candidates: string[];
  }): Promise<Record<string, unknown> | null> {
    return this.post<Record<string, unknown>>("/v1/memory/rules/evaluate", this.withIdentity(args.scope, {
      context: {
        ...args.context,
        tool_candidates: args.candidates,
      },
    }));
  }

  async toolsSelect(args: {
    scope: string;
    runId: string;
    context: Record<string, unknown>;
    candidates: string[];
  }): Promise<AionisToolDecision | null> {
    const payload = await this.post<Record<string, unknown>>("/v1/memory/tools/select", this.withIdentity(args.scope, {
      run_id: args.runId,
      context: args.context,
      candidates: args.candidates,
      strict: true,
    }));
    return extractToolDecision(payload) ?? null;
  }

  async toolsDecision(args: {
    scope: string;
    decisionId?: string;
    decisionUri?: string;
    runId?: string;
  }): Promise<Record<string, unknown> | null> {
    return this.post<Record<string, unknown>>("/v1/memory/tools/decision", this.withIdentity(args.scope, {
      decision_id: args.decisionId,
      decision_uri: args.decisionUri,
      run_id: args.runId,
    }));
  }

  async toolsFeedback(args: {
    scope: string;
    runId?: string;
    decisionId?: string;
    decisionUri?: string;
    context: Record<string, unknown>;
    candidates: string[];
    selectedTool: string;
    outcome: "positive" | "negative" | "neutral";
    note?: string;
    inputText: string;
  }): Promise<Record<string, unknown> | null> {
    return this.post<Record<string, unknown>>("/v1/memory/tools/feedback", this.withIdentity(args.scope, {
      run_id: args.runId,
      decision_id: args.decisionId,
      decision_uri: args.decisionUri,
      context: args.context,
      candidates: args.candidates,
      selected_tool: args.selectedTool,
      outcome: args.outcome,
      note: args.note,
      input_text: args.inputText,
    }));
  }

  async write(args: {
    scope: string;
    inputText: string;
    metadata?: Record<string, unknown>;
  }): Promise<Record<string, unknown> | null> {
    return this.post<Record<string, unknown>>("/v1/memory/write", this.withIdentity(args.scope, {
      input_text: args.inputText,
      metadata: args.metadata,
    }));
  }

  async handoffStore(args: {
    scope: string;
    anchor: string;
    filePath: string;
    summary: string;
    handoffText: string;
    repoRoot?: string | null;
    symbol?: string | null;
    handoffKind?: "patch_handoff" | "review_handoff" | "task_handoff";
    title?: string | null;
    risk?: string | null;
    acceptanceChecks?: string[];
    tags?: string[];
    targetFiles?: string[];
    nextAction?: string | null;
    mustChange?: string[];
    mustRemove?: string[];
    mustKeep?: string[];
  }): Promise<Record<string, unknown> | null> {
    return this.post<Record<string, unknown>>("/v1/handoff/store", this.withIdentity(args.scope, {
      anchor: args.anchor,
      file_path: args.filePath,
      repo_root: args.repoRoot,
      symbol: args.symbol,
      handoff_kind: args.handoffKind,
      title: args.title,
      summary: args.summary,
      handoff_text: args.handoffText,
      risk: args.risk,
      acceptance_checks: args.acceptanceChecks,
      tags: args.tags,
      target_files: args.targetFiles,
      next_action: args.nextAction,
      must_change: args.mustChange,
      must_remove: args.mustRemove,
      must_keep: args.mustKeep,
    }));
  }

  async replayPlaybookCandidate(args: {
    scope: string;
    playbookId: string;
    version?: number;
    deterministicGate?: Record<string, unknown>;
  }): Promise<{
    playbook?: { playbook_id?: string; version?: number; status?: string; name?: string | null; uri?: string };
    candidate?: {
      eligible_for_deterministic_replay?: boolean;
      recommended_mode?: "simulate" | "strict" | "guided";
      next_action?: string;
      mismatch_reasons?: string[];
    };
    cost_signals?: Record<string, unknown>;
  } | null> {
    const payload = await this.post<Record<string, unknown>>("/v1/memory/replay/playbooks/candidate", this.withIdentity(args.scope, {
      playbook_id: args.playbookId,
      version: args.version,
      deterministic_gate: args.deterministicGate,
    }));
    return {
      playbook: isRecord(payload.playbook) ? {
        playbook_id: typeof payload.playbook.playbook_id === "string" ? payload.playbook.playbook_id : undefined,
        version: typeof payload.playbook.version === "number" ? payload.playbook.version : undefined,
        status: typeof payload.playbook.status === "string" ? payload.playbook.status : undefined,
        name: typeof payload.playbook.name === "string" ? payload.playbook.name : undefined,
        uri: typeof payload.playbook.uri === "string" ? payload.playbook.uri : undefined,
      } : undefined,
      candidate: isRecord(payload.candidate) ? {
        eligible_for_deterministic_replay: Boolean(payload.candidate.eligible_for_deterministic_replay),
        recommended_mode:
          payload.candidate.recommended_mode === "strict" || payload.candidate.recommended_mode === "guided" || payload.candidate.recommended_mode === "simulate"
            ? payload.candidate.recommended_mode
            : undefined,
        next_action: typeof payload.candidate.next_action === "string" ? payload.candidate.next_action : undefined,
        mismatch_reasons: Array.isArray(payload.candidate.mismatch_reasons)
          ? payload.candidate.mismatch_reasons.filter((item): item is string => typeof item === "string")
          : undefined,
      } : undefined,
      cost_signals: isRecord(payload.cost_signals) ? payload.cost_signals : undefined,
    };
  }

  async replayPlaybookDispatch(args: {
    scope: string;
    playbookId: string;
    version?: number;
    params?: Record<string, unknown>;
    mode?: "simulate" | "strict" | "guided";
    maxSteps?: number;
    deterministicGate?: Record<string, unknown>;
  }): Promise<Record<string, unknown> | null> {
    return this.post<Record<string, unknown>>("/v1/memory/replay/playbooks/dispatch", this.withIdentity(args.scope, {
      playbook_id: args.playbookId,
      version: args.version,
      params: args.params,
      mode: args.mode,
      max_steps: args.maxSteps,
      deterministic_gate: args.deterministicGate,
    }));
  }
}

export function createAionisHttpLoopControlClient(options: AionisHttpClientOptions): AionisLoopControlClient {
  return new AionisHttpLoopControlClient(options);
}
