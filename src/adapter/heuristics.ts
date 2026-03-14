export function classifyBroadScan(toolName: string, params: Record<string, unknown>): boolean {
  const normalized = toolName.toLowerCase();
  if (normalized.includes("grep") || normalized.includes("find") || normalized.includes("glob")) return true;
  const query = String(params.query ?? params.pattern ?? params.command ?? "").toLowerCase();
  return query.includes("-r") || query.includes("--recursive") || query.includes("**/*");
}

export function classifyBroadTest(toolName: string, params: Record<string, unknown>): boolean {
  const normalized = toolName.toLowerCase();
  const cmd = String(params.command ?? params.cmd ?? params.argv ?? "").toLowerCase();
  if (
    normalized.includes("pytest-all") ||
    normalized.includes("test-broad") ||
    normalized.includes("jest-broad") ||
    normalized.includes("vitest-broad")
  ) {
    return true;
  }
  if (cmd.includes("pytest")) {
    return !cmd.includes("tests/") && !cmd.includes("::");
  }
  if (cmd.includes("npm test")) return true;
  if (cmd.includes("node --test")) {
    return cmd.includes("*") || !cmd.includes("test/");
  }
  if (cmd.includes("jest")) {
    return !cmd.includes("test/") && !cmd.includes("--run");
  }
  if (cmd.includes("vitest")) {
    return !cmd.includes("test/") && !cmd.includes("--run");
  }
  return false;
}

export function summarizeToolResult(result: unknown, error?: string): string {
  if (error) return `error:${error}`;
  if (typeof result === "string") return result.slice(0, 4000);
  return JSON.stringify(result ?? null).slice(0, 4000);
}

export function inferProgress(toolName: string, summary: string): boolean {
  const normalized = toolName.toLowerCase();
  const text = summary.toLowerCase();
  if (text.startsWith("error:")) return false;
  if (normalized.includes("edit") || normalized.includes("write") || normalized.includes("patch")) {
    return text.length > 0 && !text.includes("no changes");
  }
  if (normalized.includes("pytest") || normalized.includes("test")) {
    return text.includes("passed") || text.includes("failed") || text.includes("collected");
  }
  return text.length > 0 && !text.includes("no result") && !text.includes("not found");
}
