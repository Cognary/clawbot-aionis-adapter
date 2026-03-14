import { createHash } from "node:crypto";
import type { LoopStopReasonCode } from "../types/config.js";

export type LoopRunState = {
  stateId: string;
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
  runId?: string;
  workspaceDir?: string;
  scope: string;
  promptHash?: string;
  stepCount: number;
  sameToolStreak: number;
  duplicateObservationStreak: number;
  noProgressStreak: number;
  broadTestCount: number;
  broadScanCount: number;
  estimatedTokenBurn: number;
  estimatedLatencyBurnMs: number;
  lastToolName?: string;
  lastToolParamsHash?: string;
  lastObservationHash?: string;
  lastDecisionId?: string;
  lastDecisionUri?: string;
  lastSelectedTool?: string;
  forcedStopReason?: LoopStopReasonCode;
  handoffTriggered: boolean;
  replayDispatchAttempted: boolean;
};

export function hashStable(value: unknown): string {
  return createHash("sha1").update(JSON.stringify(value ?? null)).digest("hex");
}

export function createRunState(args: {
  stateId: string;
  scope: string;
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
  runId?: string;
  workspaceDir?: string;
  prompt?: string;
}): LoopRunState {
  return {
    stateId: args.stateId,
    agentId: args.agentId,
    sessionKey: args.sessionKey,
    sessionId: args.sessionId,
    runId: args.runId,
    workspaceDir: args.workspaceDir,
    scope: args.scope,
    promptHash: args.prompt ? hashStable(args.prompt) : undefined,
    stepCount: 0,
    sameToolStreak: 0,
    duplicateObservationStreak: 0,
    noProgressStreak: 0,
    broadTestCount: 0,
    broadScanCount: 0,
    estimatedTokenBurn: 0,
    estimatedLatencyBurnMs: 0,
    handoffTriggered: false,
    replayDispatchAttempted: false,
  };
}

export class LoopStateStore {
  private readonly states = new Map<string, LoopRunState>();

  get(stateId: string): LoopRunState | undefined {
    return this.states.get(stateId);
  }

  upsert(state: LoopRunState): LoopRunState {
    this.states.set(state.stateId, state);
    return state;
  }

  link(state: LoopRunState, ...ids: Array<string | undefined>): LoopRunState {
    for (const id of ids) {
      if (!id) continue;
      this.states.set(id, state);
    }
    return state;
  }

  delete(stateId: string): void {
    this.states.delete(stateId);
  }

  deleteAllFor(target: LoopRunState): void {
    for (const [key, value] of this.states.entries()) {
      if (value === target) this.states.delete(key);
    }
  }
}
