export type OpenClawLogger = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
};

export type OpenClawHookName =
  | "before_agent_start"
  | "agent_end"
  | "before_tool_call"
  | "after_tool_call"
  | "tool_result_persist"
  | "before_message_write"
  | "session_start"
  | "session_end";

export type OpenClawHostApi = {
  logger: OpenClawLogger;
  on?: (eventName: OpenClawHookName, handler: (event: any, ctx: any) => Promise<any> | any) => void;
};

export type OpenClawAgentRunContext = {
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
  workspaceDir?: string;
  trigger?: string;
  channelId?: string;
};

export type OpenClawToolCallContext = OpenClawAgentRunContext & {
  runId?: string;
  toolName: string;
  toolCallId?: string;
};

export type BeforeAgentStartEvent = {
  prompt: string;
  messages?: unknown[];
};

export type BeforeAgentStartResult = {
  prependContext?: string;
  systemPrompt?: string;
  modelOverride?: string;
  providerOverride?: string;
};

export type AgentEndEvent = {
  messages: unknown[];
  success: boolean;
  error?: string;
  durationMs?: number;
};

export type BeforeToolCallEvent = {
  toolName: string;
  params: Record<string, unknown>;
  runId?: string;
  toolCallId?: string;
};

export type BeforeToolCallResult = {
  params?: Record<string, unknown>;
  block?: boolean;
  blockReason?: string;
};

export type AfterToolCallEvent = {
  toolName: string;
  params: Record<string, unknown>;
  runId?: string;
  toolCallId?: string;
  result?: unknown;
  error?: string;
  durationMs?: number;
};

export type ToolResultPersistEvent = {
  toolName?: string;
  toolCallId?: string;
  message: Record<string, unknown>;
  isSynthetic?: boolean;
};

export type ToolResultPersistResult = {
  message?: Record<string, unknown>;
};

export type BeforeMessageWriteEvent = {
  message: Record<string, unknown>;
  sessionKey?: string;
  agentId?: string;
};

export type BeforeMessageWriteResult = {
  block?: boolean;
  message?: Record<string, unknown>;
};

export type SessionLifecycleEvent = {
  sessionId: string;
  sessionKey?: string;
};
