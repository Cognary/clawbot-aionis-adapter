type Scenario = {
  name: string;
  baselineCompleted: string;
  treatmentCompleted: string;
  baselineTokens?: number;
  treatmentTokens?: number;
  baselineLatency?: number;
  treatmentLatency?: number;
  outcome: string;
};

const scenarios: Scenario[] = [
  {
    name: "dashboard-auth-drift",
    baselineCompleted: "0.6667",
    treatmentCompleted: "1.0",
    baselineLatency: 83000,
    treatmentLatency: 94629,
    outcome: "reviewer_ready_uplift",
  },
  {
    name: "pairing-approval-recovery",
    baselineCompleted: "0.0",
    treatmentCompleted: "1.0",
    baselineLatency: 78439,
    treatmentLatency: 80485,
    outcome: "reviewer_ready_uplift",
  },
  {
    name: "continuity-packet-ab",
    baselineCompleted: "1.0",
    treatmentCompleted: "1.0",
    baselineTokens: 24750,
    treatmentTokens: 22974,
    outcome: "cost_lower_at_equal_completion",
  },
  {
    name: "runtime-safety",
    baselineCompleted: "crash-risk",
    treatmentCompleted: "controlled",
    outcome: "fail_open_and_fallback",
  },
];

function scenarioLines(scenario: Scenario): string[] {
  const lines = [
    `$ openclaw adapter bench --case ${scenario.name} --json`,
    `[baseline] reviewer_ready=${scenario.baselineCompleted}`,
    `[treatment] reviewer_ready=${scenario.treatmentCompleted}`,
  ];

  if (typeof scenario.baselineLatency === "number" && typeof scenario.treatmentLatency === "number") {
    lines.push(
      `[wall_clock_ms] baseline=${scenario.baselineLatency} treatment=${scenario.treatmentLatency}`,
    );
  }

  if (typeof scenario.baselineTokens === "number" && typeof scenario.treatmentTokens === "number") {
    lines.push(
      `[tokens] baseline=${scenario.baselineTokens} treatment=${scenario.treatmentTokens} delta=${scenario.baselineTokens - scenario.treatmentTokens}`,
    );
  }

  lines.push(`[result] outcome=${scenario.outcome}`);
  lines.push("status: benchmark_evidence_recorded");
  return lines;
}

export function BenchmarkTerminal() {
  return (
    <div className="demoTerminal benchTerminal">
      <div className="codeHead">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
        <strong>Benchmark Evidence Feed</strong>
      </div>
      <pre>
        {scenarios.flatMap((scenario) =>
          scenarioLines(scenario).map((line, idx) => (
            <span
              key={`${scenario.name}-${idx}`}
              className={`terminalLine ${line.startsWith("$") ? "lineCommand" : ""} ${line.startsWith("status") ? "lineSuccess" : ""}`}
            >
              {line}
            </span>
          )),
        )}
      </pre>
      <div className="benchMeta">
        <span>cases: {scenarios.length}</span>
        <span>control: execution-control adapter</span>
        <span>evidence: public real slices</span>
      </div>
    </div>
  );
}
