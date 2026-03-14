"use client";

import { useEffect, useMemo, useState } from "react";

type Scenario = {
  name: string;
  baselineTokens: number;
  treatmentTokens: number;
  baselineSteps: number;
  treatmentSteps: number;
  outcome: string;
};

const scenarios: Scenario[] = [
  {
    name: "live-task",
    baselineTokens: 1893,
    treatmentTokens: 865,
    baselineSteps: 6,
    treatmentSteps: 2,
    outcome: "focused-path",
  },
  {
    name: "hard-stop-replay",
    baselineTokens: 1659,
    treatmentTokens: 1267,
    baselineSteps: 6,
    treatmentSteps: 3,
    outcome: "replay-dispatch",
  },
  {
    name: "google-runtime",
    baselineTokens: 4319,
    treatmentTokens: 4287,
    baselineSteps: 5,
    treatmentSteps: 3,
    outcome: "completion-up",
  },
];

export function BenchmarkTerminal() {
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [lineIndex, setLineIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);

  const scenario = scenarios[scenarioIndex];
  const tokenDelta = scenario.baselineTokens - scenario.treatmentTokens;
  const stepDelta = scenario.baselineSteps - scenario.treatmentSteps;

  const lines = useMemo(
    () => [
      `$ openclaw adapter bench --case ${scenario.name} --json`,
      `[baseline] tokens=${scenario.baselineTokens} steps=${scenario.baselineSteps}`,
      `[treatment] tokens=${scenario.treatmentTokens} steps=${scenario.treatmentSteps}`,
      `[delta] tokens_saved=${tokenDelta} steps_saved=${stepDelta}`,
      `[result] outcome=${scenario.outcome}`,
      "status: benchmark_evidence_recorded",
    ],
    [scenario, tokenDelta, stepDelta],
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
