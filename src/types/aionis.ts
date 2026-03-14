export type AionisToolDecision = {
  decision_id?: string;
  decision_uri?: string;
  selected_tool?: string | null;
  selected?: string | null;
  denied_tools?: string[];
  explain?: string | null;
  request_id?: string | null;
};

export type AionisReplayCandidate = {
  playbook_id?: string;
  score?: number;
  reason?: string;
  version?: number;
  recommended_mode?: "simulate" | "strict" | "guided";
};

export type ReplayPlaybookHint = {
  playbookId: string;
  version?: number;
  params?: Record<string, unknown>;
  mode?: "simulate" | "strict" | "guided";
  maxSteps?: number;
  deterministicGate?: Record<string, unknown>;
};

export type AionisHttpClientOptions = {
  baseUrl: string;
  tenantId?: string;
  actor?: string;
  apiKey?: string;
  authBearer?: string;
  timeoutMs?: number;
  defaultHeaders?: Record<string, string>;
};

export type AionisLoopControlClient = {
  contextAssemble?: (args: {
    scope: string;
    queryText: string;
    context: Record<string, unknown>;
    toolCandidates?: string[];
  }) => Promise<{ layered_context?: { merged_text?: string }; tools?: AionisToolDecision } | null | undefined>;
  rulesEvaluate?: (args: {
    scope: string;
    context: Record<string, unknown>;
    candidates: string[];
  }) => Promise<Record<string, unknown> | null | undefined>;
  toolsSelect?: (args: {
    scope: string;
    runId: string;
    context: Record<string, unknown>;
    candidates: string[];
  }) => Promise<AionisToolDecision | null | undefined>;
  toolsDecision?: (args: {
    scope: string;
    decisionId?: string;
    decisionUri?: string;
    runId?: string;
  }) => Promise<Record<string, unknown> | null | undefined>;
  toolsFeedback?: (args: {
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
  }) => Promise<Record<string, unknown> | null | undefined>;
  write?: (args: {
    scope: string;
    inputText: string;
    metadata?: Record<string, unknown>;
  }) => Promise<Record<string, unknown> | null | undefined>;
  handoffStore?: (args: {
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
  }) => Promise<Record<string, unknown> | null | undefined>;
  replayPlaybookCandidate?: (args: {
    scope: string;
    playbookId: string;
    version?: number;
    deterministicGate?: Record<string, unknown>;
  }) => Promise<{
    playbook?: { playbook_id?: string; version?: number; status?: string; name?: string | null; uri?: string };
    candidate?: {
      eligible_for_deterministic_replay?: boolean;
      recommended_mode?: "simulate" | "strict" | "guided";
      next_action?: string;
      mismatch_reasons?: string[];
    };
    cost_signals?: Record<string, unknown>;
  } | null | undefined>;
  replayPlaybookDispatch?: (args: {
    scope: string;
    playbookId: string;
    version?: number;
    params?: Record<string, unknown>;
    mode?: "simulate" | "strict" | "guided";
    maxSteps?: number;
    deterministicGate?: Record<string, unknown>;
  }) => Promise<Record<string, unknown> | null | undefined>;
};
