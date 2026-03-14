import { BenchmarkTerminal } from "../components/benchmark-terminal";
import { Reveal } from "../components/reveal";
import { TerminalDemo } from "../components/terminal-demo";

const proofCards = [
  { label: "Live-task steps", value: "7.33 -> 3", note: "Scenario-backed tool churn dropped materially." },
  { label: "GLM-5 tokens", value: "1893 -> 865", note: "Semi-live token burn fell without lowering completion on that slice." },
  { label: "Completion uplift", value: "0 -> 1", note: "Replay, focused-repo, and handoff-resume slices improved." },
  { label: "Google runtime", value: "0 -> 0.8", note: "Repeated runtime-backed completion A/B is already in evidence." },
];

const capabilityCards = [
  {
    title: "Externalized Context",
    body: "Aionis assembles execution state before the run starts, so OpenClaw begins from what already happened instead of rediscovering the same surface area.",
  },
  {
    title: "Policy Gating",
    body: "Before expensive tools run, Aionis can suppress broad search, broad test, and repeated no-progress tool paths.",
  },
  {
    title: "Replay Dispatch",
    body: "When work matches a reusable path, the adapter can dispatch replay instead of letting the run improvise from scratch.",
  },
  {
    title: "Handoff Fallback",
    body: "When the right move is to stop, Aionis preserves a continuation point instead of letting the run degrade and lose state.",
  },
];

const quickstart = [
  "$ npx @aionis/sdk@0.2.19 dev",
  "$ openclaw plugins install @aionis/openclaw-adapter",
  "$ openclaw plugins info openclaw-adapter --json",
  "$ openclaw agent --local --message \"inspect and proceed carefully\" --json",
];

const links = [
  { href: "https://github.com/Cognary/clawbot-aionis-adapter", label: "GitHub" },
  { href: "https://github.com/Cognary/clawbot-aionis-adapter/blob/aionis/bootstrap-v1/README.md", label: "Docs" },
  { href: "https://www.npmjs.com/package/@aionis/openclaw-adapter", label: "npm" },
];

export default function HomePage() {
  return (
    <>
      <div className="ambientGrid" aria-hidden />
      <div className="ambientGlow" aria-hidden />
      <main className="shell">
        <section className="hero">
          <Reveal>
            <p className="eyebrow">Execution Control for OpenClaw</p>
          </Reveal>
          <Reveal>
            <h1 className="title">Stop OpenClaw from burning cycles on the wrong work.</h1>
          </Reveal>
          <Reveal delay={0.04}>
            <p className="heroBody">
              <strong>@aionis/openclaw-adapter</strong> gives OpenClaw an execution-control layer built around
              externalized context, policy gating, replay dispatch, handoff fallback, and tool-loop control.
            </p>
          </Reveal>
          <Reveal delay={0.08}>
            <div className="heroButtons">
              <a className="btn btnPrimary" href="#quickstart">Start in 5 minutes</a>
              {links.map((item) => (
                <a key={item.label} className="btn" href={item.href} target="_blank" rel="noreferrer">
                  {item.label}
                </a>
              ))}
            </div>
          </Reveal>
          <Reveal delay={0.12} variant="scale">
            <div className="heroPanel">
              <div className="codeHead">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
                <strong>OpenClaw + Aionis</strong>
              </div>
              <div className="heroPanelGrid">
                <div>
                  <p className="panelKicker">Without control</p>
                  <ul className="heroList">
                    <li>Broad repo scans</li>
                    <li>Broad test runs</li>
                    <li>No-progress retries</li>
                    <li>Lost continuation state</li>
                  </ul>
                </div>
                <div>
                  <p className="panelKicker">With Aionis</p>
                  <ul className="heroList heroListAccent">
                    <li>Focused path selection</li>
                    <li>Structured replay escape</li>
                    <li>Clean handoff fallback</li>
                    <li>Benchmark-backed token savings</li>
                  </ul>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        <section className="section twoColumn">
          <Reveal>
            <div>
              <p className="sectionLabel">Why It Matters</p>
              <h2>OpenClaw does not usually fail because it lacks raw capability. It fails because the run keeps doing the wrong work.</h2>
              <p className="sectionBody">
                The expensive failure modes are repetitive and predictable: too many tool calls, broad search where focused work would do,
                broad tests where targeted validation is enough, and degraded runs that have no structured way to stop or continue.
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.06} variant="scale">
            <TerminalDemo />
          </Reveal>
        </section>

        <section className="section">
          <Reveal>
            <p className="sectionLabel">What Aionis Adds</p>
            <h2>A control layer around the tool loop.</h2>
          </Reveal>
          <div className="cardGrid">
            {capabilityCards.map((item, idx) => (
              <Reveal key={item.title} delay={0.04 + idx * 0.04}>
                <article className="featureCard">
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="section">
          <Reveal>
            <p className="sectionLabel">What Is Proven</p>
            <h2>The benchmark story is already product-grade.</h2>
          </Reveal>
          <div className="proofGrid">
            {proofCards.map((item, idx) => (
              <Reveal key={item.label} delay={0.04 + idx * 0.04} variant="scale">
                <article className="proofCard">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <p>{item.note}</p>
                </article>
              </Reveal>
            ))}
          </div>
          <Reveal delay={0.18} variant="scale">
            <BenchmarkTerminal />
          </Reveal>
          <Reveal delay={0.22}>
            <div className="linkRail">
              <a href="https://github.com/Cognary/clawbot-aionis-adapter/blob/aionis/bootstrap-v1/docs/2026-03-14-openclaw-aionis-benchmark-summary.md" target="_blank" rel="noreferrer">Benchmark summary</a>
              <a href="https://github.com/Cognary/clawbot-aionis-adapter/blob/aionis/bootstrap-v1/docs/2026-03-14-benchmark-evidence-overview.md" target="_blank" rel="noreferrer">Evidence overview</a>
              <a href="https://github.com/Cognary/clawbot-aionis-adapter/tree/aionis/bootstrap-v1/evidence" target="_blank" rel="noreferrer">Evidence files</a>
            </div>
          </Reveal>
        </section>

        <section id="quickstart" className="section quickstartSection">
          <Reveal>
            <p className="sectionLabel">5-Minute Setup</p>
            <h2>Start Aionis Lite, install the adapter, and turn OpenClaw into a controlled execution path.</h2>
          </Reveal>
          <div className="quickstartLayout">
            <Reveal delay={0.05}>
              <div className="stepsCard">
                <ol>
                  <li>Start Aionis Lite on `http://127.0.0.1:3321`</li>
                  <li>Install `@aionis/openclaw-adapter` into OpenClaw</li>
                  <li>Enable `openclaw-adapter` in `plugins.allow` and `plugins.entries`</li>
                  <li>Run a first controlled local turn</li>
                </ol>
              </div>
            </Reveal>
            <Reveal delay={0.08} variant="scale">
              <div className="codeBlock quickstartCode">
                <div className="codeHead">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                  <strong>Quickstart</strong>
                </div>
                <pre>
                  {quickstart.map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </pre>
              </div>
            </Reveal>
          </div>
          <Reveal delay={0.12}>
            <div className="linkRail">
              <a href="https://github.com/Cognary/clawbot-aionis-adapter/blob/aionis/bootstrap-v1/docs/2026-03-14-install-and-config.md" target="_blank" rel="noreferrer">Install guide</a>
              <a href="https://github.com/Cognary/clawbot-aionis-adapter/blob/aionis/bootstrap-v1/examples/openclaw.json" target="_blank" rel="noreferrer">Config example</a>
              <a href="https://www.npmjs.com/package/@aionis/openclaw-adapter" target="_blank" rel="noreferrer">npm package</a>
            </div>
          </Reveal>
        </section>

        <section className="section finalSection">
          <Reveal>
            <p className="sectionLabel">Positioning</p>
            <h2>Not another memory plugin. An execution-control layer for OpenClaw.</h2>
            <p className="sectionBody">
              The right way to position this product is narrow and strong: Aionis reduces uncontrolled tool-loop churn,
              lowers token burn on benchmarked slices, and improves completion on current slices by adding policy, replay,
              handoff, and externalized context around OpenClaw tool execution.
            </p>
          </Reveal>
        </section>
      </main>
    </>
  );
}
