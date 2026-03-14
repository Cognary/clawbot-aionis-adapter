import type {
  AgentEndEvent,
  BeforeAgentStartEvent,
  BeforeMessageWriteEvent,
  OpenClawAgentRunContext,
  OpenClawHostApi,
  OpenClawToolCallContext,
  SessionLifecycleEvent,
  ToolResultPersistEvent,
} from "../types/openclaw.js";
import { AionisLoopControlAdapter } from "../adapter/loop-control-adapter.js";

export function attachToOpenClawHost(api: OpenClawHostApi, adapter: AionisLoopControlAdapter): void {
  if (typeof api.on !== "function") {
    api.logger.warn("openclaw-adapter: host hook API unavailable; binding skipped");
    return;
  }

  api.on("session_start", async (event: SessionLifecycleEvent, ctx: OpenClawAgentRunContext) => {
    adapter.sessionStart({ ...ctx, sessionId: event.sessionId });
  });

  api.on("session_end", async (event: SessionLifecycleEvent) => {
    adapter.sessionEnd(event.sessionId);
  });

  api.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx: OpenClawAgentRunContext) => {
    return adapter.beforeAgentStart(event, ctx);
  });

  api.on("before_tool_call", async (event: any, ctx: OpenClawToolCallContext) => {
    return adapter.beforeToolCall(event, ctx);
  });

  api.on("after_tool_call", async (event: any, ctx: OpenClawToolCallContext) => {
    await adapter.afterToolCall(event, ctx);
  });

  api.on("agent_end", async (event: AgentEndEvent, ctx: OpenClawAgentRunContext) => {
    await adapter.agentEnd(event, ctx);
  });

  api.on("tool_result_persist", async (event: ToolResultPersistEvent) => {
    const reason = typeof event.message?.aionis_loop_control === "object"
      ? (event.message.aionis_loop_control as { reason?: any }).reason
      : undefined;
    return { message: adapter.decorateStopMessage(event.message, reason) };
  });

  api.on("before_message_write", async (event: BeforeMessageWriteEvent) => {
    const reason = typeof event.message?.aionis_loop_control === "object"
      ? (event.message.aionis_loop_control as { reason?: any }).reason
      : undefined;
    return { message: adapter.decorateStopMessage(event.message, reason) };
  });
}
