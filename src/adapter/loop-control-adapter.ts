import { createHash, randomUUID } from "node:crypto";
import type {
  AgentEndEvent,
  AfterToolCallEvent,
  BeforeAgentStartEvent,
  BeforeAgentStartResult,
  BeforeToolCallEvent,
  BeforeToolCallResult,
  OpenClawAgentRunContext,
  OpenClawToolCallContext,
} from "../types/openclaw.js";
import type { AionisLoopControlClient, AionisToolDecision, ReplayPlaybookHint } from "../types/aionis.js";
import { DEFAULT_THRESHOLDS, type AdapterConfig, type LoopStopReasonCode } from "../types/config.js";
import { classifyBroadScan, classifyBroadTest, inferProgress, summarizeToolResult } from "./heuristics.js";
import { createRunState, hashStable, LoopStateStore, type LoopRunState } from "./state.js";

export type AdapterDecision = {
  continue: boolean;
  stopReason?: LoopStopReasonCode;
  blockReason?: string;
  rewriteParams?: Record<string, unknown>;
  selectedTool?: string;
  deniedTools?: string[];
  explain?: string | null;
};

export class AionisLoopControlAdapter {
  private readonly config: AdapterConfig;
  private readonly states = new LoopStateStore();

  constructor(private readonly client: AionisLoopControlClient, config: Partial<AdapterConfig> & Pick<AdapterConfig, "tenantId" | "actor" | "scopeResolver">) {
    const mergedThresholds = { ...DEFAULT_THRESHOLDS, ...(config.thresholds ?? {}) };
    this.config = {
      ...config,
      thresholds: mergedThresholds,
      strictToolBlocking: config.strictToolBlocking ?? true,
      replayDispatchEnabled: config.replayDispatchEnabled ?? true,
      handoffFallbackEnabled: config.handoffFallbackEnabled ?? true,
    };
  }

  sessionStart(ctx: OpenClawAgentRunContext & { sessionId: string }): LoopRunState {
    const scope = this.config.scopeResolver(ctx);
    const state = createRunState({
      stateId: ctx.sessionId,
      scope,
      agentId: ctx.agentId,
      sessionKey: ctx.sessionKey,
      sessionId: ctx.sessionId,
      workspaceDir: ctx.workspaceDir,
    });
    this.states.upsert(state);
    return this.states.link(state, ctx.sessionId, ctx.sessionKey);
  }

  sessionEnd(sessionId: string): void {
    const state = this.states.get(sessionId);
    if (state) {
      this.states.deleteAllFor(state);
      return;
    }
    this.states.delete(sessionId);
  }

  async beforeAgentStart(event: BeforeAgentStartEvent, ctx: OpenClawAgentRunContext): Promise<BeforeAgentStartResult | undefined> {
    const state = this.ensureState({
      prompt: event.prompt,
      agentId: ctx.agentId,
      sessionKey: ctx.sessionKey,
      sessionId: ctx.sessionId,
      workspaceDir: ctx.workspaceDir,
    });
    this.resetExecutionWindow(state, ctx.agentId, event.prompt);

    if (!this.client.contextAssemble) return undefined;

    const candidates = this.extractCandidateTools(event.messages);
    const out = await this.client.contextAssemble({
      scope: state.scope,
      queryText: event.prompt,
      context: {
        source: "openclaw-adapter.before_agent_start",
        agent_id: ctx.agentId,
        session_key: ctx.sessionKey,
        session_id: ctx.sessionId,
        trigger: ctx.trigger,
      },
      toolCandidates: candidates,
    });

    const merged = out?.layered_context?.merged_text?.trim();
    const decision = out?.tools ?? undefined;
    this.captureDecision(state, decision ?? undefined);
    if (!merged) return undefined;
    return { prependContext: `<aionis-context>\n${merged}\n</aionis-context>` };
  }

  async beforeToolCall(event: BeforeToolCallEvent, ctx: OpenClawToolCallContext): Promise<BeforeToolCallResult | undefined> {
    const state = this.ensureState({
      agentId: ctx.agentId,
      sessionKey: ctx.sessionKey,
      sessionId: ctx.sessionId,
      runId: event.runId ?? ctx.runId,
      workspaceDir: ctx.workspaceDir,
    });

    const currentToolHash = hashStable(event.params);
    state.stepCount += 1;
    state.sameToolStreak = state.lastToolName === event.toolName && state.lastToolParamsHash === currentToolHash
      ? state.sameToolStreak + 1
      : 1;
    state.lastToolName = event.toolName;
    state.lastToolParamsHash = currentToolHash;

    if (classifyBroadScan(event.toolName, event.params)) state.broadScanCount += 1;
    if (classifyBroadTest(event.toolName, event.params)) state.broadTestCount += 1;

    const thresholdStop = this.checkThresholds(state);
    if (thresholdStop) {
      return this.makeStopResult(state, thresholdStop, event, ctx);
    }

    const candidates = [event.toolName];
    const context = {
      source: "openclaw-adapter.before_tool_call",
      agent_id: ctx.agentId,
      session_key: ctx.sessionKey,
      session_id: ctx.sessionId,
      run_id: event.runId ?? ctx.runId,
      tool_name: event.toolName,
      same_tool_streak: state.sameToolStreak,
      duplicate_observation_streak: state.duplicateObservationStreak,
      no_progress_streak: state.noProgressStreak,
      broad_test_count: state.broadTestCount,
      broad_scan_count: state.broadScanCount,
      estimated_token_burn: state.estimatedTokenBurn,
    } satisfies Record<string, unknown>;

    if (this.client.rulesEvaluate) {
      await this.client.rulesEvaluate({
        scope: state.scope,
        context,
        candidates,
      });
    }

    const decision = this.client.toolsSelect
      ? await this.client.toolsSelect({
          scope: state.scope,
          runId: event.runId ?? ctx.runId ?? state.stateId,
          context,
          candidates,
        })
      : undefined;
    this.captureDecision(state, decision ?? undefined);

    if (decision?.selected_tool && decision.selected_tool !== event.toolName && this.config.strictToolBlocking) {
      return {
        block: true,
        blockReason: `policy selected ${decision.selected_tool} instead of ${event.toolName}`,
      };
    }

    return undefined;
  }

  async afterToolCall(event: AfterToolCallEvent, ctx: OpenClawToolCallContext): Promise<void> {
    const state = this.ensureState({
      agentId: ctx.agentId,
      sessionKey: ctx.sessionKey,
      sessionId: ctx.sessionId,
      runId: event.runId ?? ctx.runId,
      workspaceDir: ctx.workspaceDir,
    });

    const summary = summarizeToolResult(event.result, event.error);
    const observationHash = createHash("sha1").update(summary).digest("hex");
    state.duplicateObservationStreak = state.lastObservationHash === observationHash
      ? state.duplicateObservationStreak + 1
      : 0;
    state.lastObservationHash = observationHash;

    const progress = inferProgress(event.toolName, summary);
    state.noProgressStreak = progress ? 0 : state.noProgressStreak + 1;
    state.estimatedLatencyBurnMs += Number(event.durationMs ?? 0);
    state.estimatedTokenBurn += Math.max(1, Math.ceil(summary.length / 4));

    if (this.client.toolsFeedback) {
      await this.client.toolsFeedback({
        scope: state.scope,
        runId: event.runId ?? ctx.runId,
        decisionId: state.lastDecisionId,
        decisionUri: state.lastDecisionUri,
        context: {
          source: "openclaw-adapter.after_tool_call",
          progress,
          duration_ms: event.durationMs ?? null,
          error: event.error ?? null,
        },
        candidates: [event.toolName],
        selectedTool: event.toolName,
        outcome: event.error ? "negative" : progress ? "positive" : "neutral",
        note: progress ? "tool call made progress" : "tool call made no clear progress",
        inputText: summary,
      });
    }

    if (this.client.write) {
      await this.client.write({
        scope: state.scope,
        inputText: `${event.toolName}: ${summary}`,
        metadata: {
          source: "openclaw-adapter.after_tool_call",
          run_id: event.runId ?? ctx.runId,
          tool_call_id: event.toolCallId ?? ctx.toolCallId,
          duration_ms: event.durationMs ?? null,
        },
      });
    }
  }

  async agentEnd(event: AgentEndEvent, ctx: OpenClawAgentRunContext): Promise<void> {
    const state = this.findState({ sessionId: ctx.sessionId, sessionKey: ctx.sessionKey }) ?? this.ensureState({
      agentId: ctx.agentId,
      sessionKey: ctx.sessionKey,
      sessionId: ctx.sessionId,
      workspaceDir: ctx.workspaceDir,
    });

    if (!event.success && this.config.handoffFallbackEnabled && this.client.handoffStore && !state.handoffTriggered) {
      state.handoffTriggered = true;
      await this.client.handoffStore({
        scope: state.scope,
        anchor: `openclaw-loop-${state.stateId}`,
        filePath: ctx.workspaceDir ?? "workspace",
        summary: `OpenClaw run stopped: ${state.forcedStopReason ?? "agent_end_failure"}`,
        handoffText: `Resume from degraded run. reason=${state.forcedStopReason ?? "agent_end_failure"}`,
        repoRoot: ctx.workspaceDir ?? null,
        handoffKind: "task_handoff",
        title: "OpenClaw degraded run handoff",
        risk: event.error ?? null,
      });
    }
  }

  decorateStopMessage(message: Record<string, unknown>, reason: LoopStopReasonCode | undefined): Record<string, unknown> {
    if (!reason) return message;
    return {
      ...message,
      aionis_loop_control: {
        reason,
      },
    };
  }

  private ensureState(args: {
    prompt?: string;
    agentId?: string;
    sessionKey?: string;
    sessionId?: string;
    runId?: string;
    workspaceDir?: string;
  }): LoopRunState {
    const stateId = args.runId ?? args.sessionId ?? args.sessionKey ?? randomUUID();
    const existing = this.states.get(stateId);
    if (existing) return existing;
    if (args.runId) {
      const existingBySession = this.findState({ sessionId: args.sessionId, sessionKey: args.sessionKey });
      if (existingBySession) {
        existingBySession.runId = args.runId;
        existingBySession.workspaceDir = args.workspaceDir ?? existingBySession.workspaceDir;
        this.states.link(existingBySession, args.runId, args.sessionId, args.sessionKey);
        return existingBySession;
      }
    }
    const scope = this.config.scopeResolver(args);
    const created = this.states.upsert(createRunState({
      stateId,
      scope,
      agentId: args.agentId,
      sessionKey: args.sessionKey,
      sessionId: args.sessionId,
      runId: args.runId,
      workspaceDir: args.workspaceDir,
      prompt: args.prompt,
    }));
    return this.states.link(created, args.runId, args.sessionId, args.sessionKey);
  }

  private findState(args: { sessionId?: string; sessionKey?: string }): LoopRunState | undefined {
    if (args.sessionId) {
      const bySession = this.states.get(args.sessionId);
      if (bySession) return bySession;
    }
    if (args.sessionKey) {
      return this.states.get(args.sessionKey);
    }
    return undefined;
  }

  private captureDecision(state: LoopRunState, decision?: AionisToolDecision): void {
    if (!decision) return;
    state.lastDecisionId = decision.decision_id ?? state.lastDecisionId;
    state.lastDecisionUri = decision.decision_uri ?? state.lastDecisionUri;
    state.lastSelectedTool = decision.selected_tool ?? decision.selected ?? state.lastSelectedTool;
  }

  private resetExecutionWindow(state: LoopRunState, agentId: string | undefined, prompt: string | undefined): void {
    state.agentId = agentId ?? state.agentId;
    state.promptHash = prompt ? hashStable(prompt) : state.promptHash;
    state.stepCount = 0;
    state.sameToolStreak = 0;
    state.duplicateObservationStreak = 0;
    state.noProgressStreak = 0;
    state.broadTestCount = 0;
    state.broadScanCount = 0;
    state.estimatedTokenBurn = 0;
    state.estimatedLatencyBurnMs = 0;
    state.lastToolName = undefined;
    state.lastToolParamsHash = undefined;
    state.lastObservationHash = undefined;
    state.lastDecisionId = undefined;
    state.lastDecisionUri = undefined;
    state.lastSelectedTool = undefined;
    state.forcedStopReason = undefined;
    state.handoffTriggered = false;
    state.replayDispatchAttempted = false;
  }

  private extractCandidateTools(messages?: unknown[]): string[] {
    const out = new Set<string>();
    for (const message of messages ?? []) {
      if (!message || typeof message !== "object") continue;
      const record = message as Record<string, unknown>;
      const toolName = record.toolName ?? record.name;
      if (typeof toolName === "string" && toolName.trim()) out.add(toolName.trim());
    }
    return [...out];
  }


  private resolveReplayHint(
    state: LoopRunState,
    event: BeforeToolCallEvent,
    ctx: OpenClawToolCallContext,
  ): ReplayPlaybookHint | undefined {
    return this.config.replayHintResolver?.({
      agentId: ctx.agentId,
      sessionKey: ctx.sessionKey,
      sessionId: ctx.sessionId,
      runId: event.runId ?? ctx.runId,
      workspaceDir: ctx.workspaceDir,
      toolName: event.toolName,
      toolParams: event.params,
    }) ?? undefined;
  }

  private checkThresholds(state: LoopRunState): LoopStopReasonCode | undefined {
    const t = this.config.thresholds;
    if (state.stepCount > t.maxSteps) return "max_steps_exceeded";
    if (state.sameToolStreak > t.maxSameToolStreak) return "same_tool_streak_exceeded";
    if (state.duplicateObservationStreak > t.maxDuplicateObservationStreak) return "duplicate_observation_exceeded";
    if (state.noProgressStreak > t.maxNoProgressStreak) return "no_progress_exceeded";
    if (state.estimatedTokenBurn > t.maxEstimatedTokenBurn) return "budget_exceeded";
    if (state.broadTestCount > t.maxBroadTestInvocations) return "policy_denied_only_path";
    if (state.broadScanCount > t.maxBroadScanInvocations) return "policy_denied_only_path";
    return undefined;
  }

  private async makeStopResult(
    state: LoopRunState,
    reason: LoopStopReasonCode,
    event: BeforeToolCallEvent,
    ctx: OpenClawToolCallContext,
  ): Promise<BeforeToolCallResult> {
    state.forcedStopReason = reason;

    const replayHint = this.resolveReplayHint(state, event, ctx);
    if (replayHint && this.config.replayDispatchEnabled && this.client.replayPlaybookCandidate && this.client.replayPlaybookDispatch && !state.replayDispatchAttempted) {
      state.replayDispatchAttempted = true;
      const candidateResult = await this.client.replayPlaybookCandidate({
        scope: state.scope,
        playbookId: replayHint.playbookId,
        version: replayHint.version,
        deterministicGate: replayHint.deterministicGate,
      });
      if (candidateResult?.candidate?.eligible_for_deterministic_replay) {
        await this.client.replayPlaybookDispatch({
          scope: state.scope,
          playbookId: replayHint.playbookId,
          version: replayHint.version,
          params: {
            source: "openclaw-adapter.loop-control",
            reason,
            ...(replayHint.params ?? {}),
          },
          mode: replayHint.mode ?? candidateResult.candidate.recommended_mode,
          maxSteps: replayHint.maxSteps,
          deterministicGate: replayHint.deterministicGate,
        });
        state.forcedStopReason = "replay_dispatch_selected";
        return { block: true, blockReason: "replay dispatch selected" };
      }
    }

    if (this.config.handoffFallbackEnabled && this.client.handoffStore && !state.handoffTriggered) {
      state.handoffTriggered = true;
      await this.client.handoffStore({
        scope: state.scope,
        anchor: `openclaw-loop-${state.stateId}`,
        filePath: ctx.workspaceDir ?? "workspace",
        summary: `Forced loop stop: ${reason}`,
        handoffText: `The run was stopped before ${event.toolName}. reason=${reason}. Resume from current workspace state with a narrower tool path.`,
        repoRoot: ctx.workspaceDir ?? null,
        handoffKind: "task_handoff",
        title: "OpenClaw loop-control handoff",
      });
      state.forcedStopReason = "handoff_store_selected";
      return { block: true, blockReason: "handoff stored after loop-control stop" };
    }

    return { block: true, blockReason: reason };
  }
}
