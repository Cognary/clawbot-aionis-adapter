"use client";

import { useEffect, useMemo, useState } from "react";

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

export function BenchmarkTerminal() {
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [lineIndex, setLineIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);

  const scenario = scenarios[scenarioIndex];

  const lines = useMemo(
    () => {
      const base = [
        `$ openclaw adapter bench --case ${scenario.name} --json`,
        `[baseline] completed=${scenario.baselineCompleted}`,
        `[treatment] completed=${scenario.treatmentCompleted}`,
      ];

      if (typeof scenario.baselineHandoffs === "number" && typeof scenario.treatmentHandoffs === "number") {
        base.push(
          `[continuity] baseline_handoffs=${scenario.baselineHandoffs} treatment_handoffs=${scenario.treatmentHandoffs}`,
        );
      }

      if (typeof scenario.baselineTokens === "number" && typeof scenario.treatmentTokens === "number") {
        base.push(
          `[tokens] baseline=${scenario.baselineTokens} treatment=${scenario.treatmentTokens} delta=${scenario.baselineTokens - scenario.treatmentTokens}`,
        );
      }

      base.push(`[result] outcome=${scenario.outcome}`);
      base.push("status: benchmark_evidence_recorded");
      return base;
    },
    [scenario],
  );

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    if (lineIndex >= lines.length) {
      timer = setTimeout(() => {
        setScenarioIndex((prev) => (prev + 1) % scenarios.length);
        setLineIndex(0);
        setCharIndex(0);
      }, 1600);
      return () => clearTimeout(timer);
    }

    const currentLine = lines[lineIndex];
    if (charIndex < currentLine.length) {
      timer = setTimeout(() => setCharIndex((prev) => prev + 1), 18);
      return () => clearTimeout(timer);
    }

    timer = setTimeout(() => {
      setLineIndex((prev) => prev + 1);
      setCharIndex(0);
    }, 380);

    return () => clearTimeout(timer);
  }, [lineIndex, charIndex, lines]);

  const shownLines = lines.slice(0, lineIndex);
  const typingLine = lineIndex < lines.length ? lines[lineIndex].slice(0, charIndex) : "$ ";

  return (
    <div className="demoTerminal benchTerminal">
      <div className="codeHead">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
        <strong>Benchmark Evidence Feed</strong>
      </div>
      <pre>
        {shownLines.map((line, idx) => (
          <span key={`${scenario.name}-${idx}`} className={`terminalLine ${line.startsWith("$") ? "lineCommand" : ""} ${line.startsWith("status") ? "lineSuccess" : ""}`}>
            {line}
          </span>
        ))}
        <span className="terminalLine lineTyping">
          {typingLine}
          <i className="typingCursor">▋</i>
        </span>
      </pre>
      <div className="benchMeta">
        <span>case: {scenario.name}</span>
        <span>control: openclaw-adapter</span>
        <span>evidence: public</span>
      </div>
    </div>
  );
}
