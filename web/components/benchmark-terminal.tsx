type Scenario = {
  name: string;
  baselineCompleted: string;
  treatmentCompleted: string;
  baselineTokens?: number;
  treatmentTokens?: number;
  baselineHandoffs?: number;
  treatmentHandoffs?: number;
  outcome: string;
};

const scenarios: Scenario[] = [
  {
    name: "issue-10864",
    baselineCompleted: "0/3",
    treatmentCompleted: "3/3",
    baselineHandoffs: 0,
    treatmentHandoffs: 4,
    outcome: "completion-uplift",
  },
  {
    name: "auth-drift",
    baselineCompleted: "0/3",
    treatmentCompleted: "3/3",
    baselineHandoffs: 0,
    treatmentHandoffs: 4,
    outcome: "continuity-win",
  },
  {
    name: "markdown-fallback",
    baselineCompleted: "1/3",
    treatmentCompleted: "3/3",
    baselineHandoffs: 0,
    treatmentHandoffs: 4,
    outcome: "supporting-slice",
  },
  {
    name: "glm5-token",
    baselineCompleted: "stable",
    treatmentCompleted: "stable",
    baselineTokens: 4319,
    treatmentTokens: 4287,
    outcome: "runtime-backed",
  },
];

function scenarioLines(scenario: Scenario): string[] {
  const lines = [
    `$ openclaw adapter bench --case ${scenario.name} --json`,
    `[baseline] completed=${scenario.baselineCompleted}`,
    `[treatment] completed=${scenario.treatmentCompleted}`,
  ];

  if (typeof scenario.baselineHandoffs === "number" && typeof scenario.treatmentHandoffs === "number") {
    lines.push(
      `[continuity] baseline_handoffs=${scenario.baselineHandoffs} treatment_handoffs=${scenario.treatmentHandoffs}`,
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
        <span>control: openclaw-adapter</span>
        <span>evidence: public</span>
      </div>
    </div>
  );
}
