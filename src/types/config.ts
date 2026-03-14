import type { ReplayPlaybookHint } from "./aionis.js";

export type LoopStopReasonCode =
  | "max_steps_exceeded"
  | "same_tool_streak_exceeded"
  | "duplicate_observation_exceeded"
  | "no_progress_exceeded"
  | "budget_exceeded"
  | "policy_denied_only_path"
  | "replay_dispatch_selected"
  | "handoff_store_selected";

export type AdapterThresholds = {
  enabled: boolean;
  maxSteps: number;
  maxSameToolStreak: number;
  maxDuplicateObservationStreak: number;
  maxNoProgressStreak: number;
  maxEstimatedTokenBurn: number;
  maxBroadTestInvocations: number;
  maxBroadScanInvocations: number;
};

export type AdapterConfig = {
  tenantId: string;
  actor: string;
  scopeResolver: (ctx: {
    agentId?: string;
    sessionKey?: string;
    sessionId?: string;
    workspaceDir?: string;
  }) => string;
  replayHintResolver?: (ctx: {
    agentId?: string;
    sessionKey?: string;
    sessionId?: string;
    runId?: string;
    workspaceDir?: string;
    toolName?: string;
    toolParams?: Record<string, unknown>;
  }) => ReplayPlaybookHint | null | undefined;
  thresholds: AdapterThresholds;
  strictToolBlocking: boolean;
  replayDispatchEnabled: boolean;
  handoffFallbackEnabled: boolean;
};

export const DEFAULT_THRESHOLDS: AdapterThresholds = {
  enabled: true,
  maxSteps: 16,
  maxSameToolStreak: 4,
  maxDuplicateObservationStreak: 3,
  maxNoProgressStreak: 3,
  maxEstimatedTokenBurn: 60000,
  maxBroadTestInvocations: 1,
  maxBroadScanInvocations: 1,
};
