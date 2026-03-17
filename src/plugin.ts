import { AionisLoopControlAdapter } from "./adapter/loop-control-adapter.js";
import { attachToOpenClawHost } from "./binding/openclaw-hook-binding.js";
import { createAionisHttpLoopControlClient } from "./client/aionis-http-client.js";
import type { OpenClawHostApi } from "./types/openclaw.js";
import type { AdapterConfig } from "./types/config.js";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function createScopeResolver(scopePrefix: string, scopeMode: string, fixedScope: string) {
  return (ctx: { sessionKey?: string; sessionId?: string; workspaceDir?: string }) => {
    if (scopeMode === "fixed") return fixedScope;
    if (scopeMode === "session") {
      const key = ctx.sessionKey ?? ctx.sessionId ?? "default";
      return `${scopePrefix}:${key}`;
    }
    const workspace = ctx.workspaceDir?.trim();
    if (!workspace) return `${scopePrefix}:default`;
    const normalized = workspace.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    return `${scopePrefix}:${normalized || "workspace"}`;
  };
}

function createReplayHintResolver(rawCfg: Record<string, unknown>): AdapterConfig["replayHintResolver"] {
  const playbookId = asString(rawCfg.replayPlaybookId);
  if (!playbookId) return undefined;
  const mode = asString(rawCfg.replayMode) as "simulate" | "strict" | "guided" | "";
  const maxSteps = asNumber(rawCfg.replayMaxSteps, 0) || undefined;
  const version = asNumber(rawCfg.replayVersion, 0) || undefined;
  return () => ({
    playbookId,
    version,
    mode: mode || undefined,
    maxSteps,
    params: { source: "openclaw-adapter.plugin" },
    deterministicGate: {
      enabled: true,
      prefer_deterministic_execution: true,
    },
  });
}

function resolveConfig(rawCfg: Record<string, unknown>): AdapterConfig & { baseUrl: string; apiKey?: string; authBearer?: string } {
  const baseUrl = asString(rawCfg.baseUrl, process.env.AIONIS_BASE_URL ?? "http://127.0.0.1:3321");
  const tenantId = asString(rawCfg.tenantId, process.env.AIONIS_TENANT_ID ?? "default");
  const actor = asString(rawCfg.actor, process.env.AIONIS_ACTOR ?? "openclaw-adapter");
  const scopePrefix = asString(rawCfg.scopePrefix, process.env.AIONIS_SCOPE_PREFIX ?? "openclaw");
  const scopeMode = asString(rawCfg.scopeMode, "project") || "project";
  const fixedScope = asString(rawCfg.scope, `${scopePrefix}:default`);
  return {
    baseUrl,
    apiKey: asString(rawCfg.apiKey) || process.env.AIONIS_API_KEY || undefined,
    authBearer: asString(rawCfg.authBearer) || process.env.AIONIS_AUTH_BEARER || undefined,
    tenantId,
    actor,
    scopeResolver: createScopeResolver(scopePrefix, scopeMode, fixedScope),
    replayHintResolver: createReplayHintResolver(rawCfg),
    thresholds: {
      enabled: asBoolean(rawCfg.enabled, true),
      maxSteps: asNumber(rawCfg.maxSteps, 16),
      maxSameToolStreak: asNumber(rawCfg.maxSameToolStreak, 4),
      maxDuplicateObservationStreak: asNumber(rawCfg.maxDuplicateObservationStreak, 3),
      maxNoProgressStreak: asNumber(rawCfg.maxNoProgressStreak, 3),
      maxEstimatedTokenBurn: asNumber(rawCfg.maxEstimatedTokenBurn, 60000),
      maxBroadTestInvocations: asNumber(rawCfg.maxBroadTestInvocations, 1),
      maxBroadScanInvocations: asNumber(rawCfg.maxBroadScanInvocations, 1),
    },
    strictToolBlocking: asBoolean(rawCfg.strictToolBlocking, false),
    replayDispatchEnabled: asBoolean(rawCfg.replayDispatchEnabled, true),
    handoffFallbackEnabled: asBoolean(rawCfg.handoffFallbackEnabled, true),
  };
}

const plugin = {
  id: "openclaw-adapter",
  name: "Aionis OpenClaw Adapter",
  description: "Tool-loop control adapter for Aionis-backed policy, replay, handoff, and evidence capture.",
  version: "0.1.1",
  register(api: OpenClawHostApi & { pluginConfig?: Record<string, unknown>; logger: { info: (msg: string) => void; warn: (msg: string) => void } }) {
    const rawCfg = asRecord((api as { pluginConfig?: unknown }).pluginConfig);
    const resolved = resolveConfig(rawCfg);
    const client = createAionisHttpLoopControlClient({
      baseUrl: resolved.baseUrl,
      tenantId: resolved.tenantId,
      actor: resolved.actor,
      apiKey: resolved.apiKey,
      authBearer: resolved.authBearer,
    });
    const adapter = new AionisLoopControlAdapter(client, resolved);
    attachToOpenClawHost(api, adapter);
    api.logger.info(`openclaw-adapter: registered base=${resolved.baseUrl} tenant=${resolved.tenantId} replayDispatch=${resolved.replayDispatchEnabled} handoffFallback=${resolved.handoffFallbackEnabled}`);
  },
};

export default plugin;
