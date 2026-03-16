import { BenchmarkTerminal } from "../components/benchmark-terminal";
import { Reveal } from "../components/reveal";
import { TerminalDemo } from "../components/terminal-demo";

const navItems = [
  { href: "#features", label: "Features" },
  { href: "#platforms", label: "Platforms" },
  { href: "#security", label: "Security" },
  { href: "#faq", label: "FAQ" },
];

const commandCards = [
  {
    title: "Bootstrap Lite",
    command: "npx @aionis/sdk@0.2.20 dev",
    note: "No local Aionis repo required for the first run.",
  },
  {
    title: "Install the adapter",
    command: "openclaw plugins install @aionis/openclaw-adapter",
    note: "Current published release: 0.1.3",
  },
];

const highlightCards = [
  {
    label: "Dashboard auth drift",
    value: "0.6667 -> 1",
    body: "Repeated reviewer-ready uplift on the strongest public OpenClaw workflow slice.",
  },
  {
    label: "Pairing / approval recovery",
    value: "0 -> 1",
    body: "Second strongest repeated slice with positive completion uplift on the real Lite path.",
  },
  {
    label: "Runtime safety",
    value: "Fail-open",
    body: "Hot-path Aionis failures degrade open, deny-only policy uses controlled fallback, and `enabled=false` is a real off switch.",
  },
];

const featureCards = [
  {
    title: "Execution context at run start",
    body: "Aionis assembles compact execution state before OpenClaw starts burning model tokens on repo rediscovery.",
  },
  {
    title: "Policy gating before expensive tools",
    body: "Broad scans, broad tests, and repeated no-progress paths can be denied before they execute.",
  },
  {
    title: "Replay dispatch when work is reusable",
    body: "If the run matches a known path, the adapter can escape into replay instead of improvising from scratch.",
  },
  {
    title: "Handoff fallback when the run should stop",
    body: "Degraded runs preserve a usable continuation point instead of losing the exact state needed to continue later.",
  },
];

const platformCards = [
  {
    title: "OpenClaw-first wedge",
    body: "This product is intentionally narrow: execution control for OpenClaw, not a generic workflow engine or generic memory plugin.",
  },
  {
    title: "Shared Lite runtime",
    body: "TypeScript, Python, and OpenClaw all connect to the same Lite runtime started from `@aionis/sdk`.",
  },
  {
    title: "Fast install path",
    body: "Users can start Lite with one command, install the adapter, and run a first controlled turn without cloning the core repo.",
  },
  {
    title: "Benchmarked public claims",
    body: "The strongest story is reviewer-ready completion and continuity on real workflow slices, not vague agent quality claims.",
  },
];

const securityCards = [
  {
    title: "Host-first failure model",
    body: "Transport or schema failures on Aionis hot hooks do not need to abort the OpenClaw run. The adapter now degrades open by default on those paths.",
  },
  {
    title: "Controlled deny path",
    body: "When policy denies the current tool and no alternative remains, the adapter now routes through replay or handoff fallback instead of turning denial into a client error.",
  },
  {
    title: "Rollout-friendly controls",
    body: "Operators can disable loop control with `enabled=false` and know that the switch actually disables the behavior.",
  },
];

const faqItems = [
  {
    question: "Do I need the Aionis repo on my machine?",
    answer:
      "No. The supported first-run path is `npx @aionis/sdk@0.2.20 dev`, which bootstraps Lite without requiring a local Aionis checkout.",
  },
  {
    question: "What should I install as a new OpenClaw user?",
    answer:
      "Run Lite with `@aionis/sdk@0.2.20`, then install `@aionis/openclaw-adapter@0.1.3` into OpenClaw and use the minimal adapter config first.",
  },
  {
    question: "What is the strongest thing this product proves today?",
    answer:
      "It improves execution continuity and reviewer-ready completion on current OpenClaw slices by adding run-start context, policy gating, replay dispatch, and handoff fallback.",
  },
  {
    question: "Is this mainly a token-saving product?",
    answer:
      "No. Completion and control come first. Token reduction matters only when it does not come at the cost of reviewer-ready completion.",
  },
];

export default function HomePage() {
  return (
    <>
      <main className="page">
        <nav className="navBar">
          <div className="container navInner">
            <a href="#top" className="brand">
              <span className="brandText">AIONIS</span>
              <span className="brandAccent">/OpenClaw</span>
            </a>
            <div className="navLinks">
              {navItems.map((item) => (
                <a key={item.href} href={item.href}>
                  {item.label}
                </a>
              ))}
            </div>
            <a
              className="navButton"
              href="https://www.npmjs.com/package/@aionis/openclaw-adapter"
              target="_blank"
              rel="noreferrer"
            >
              Install
            </a>
          </div>
        </nav>

        <section id="top" className="hero">
          <div className="container heroShell">
            <div className="heroCopy">
              <Reveal>
                <p className="eyebrow">Execution control for OpenClaw</p>
              </Reveal>
              <Reveal delay={0.03}>
                <h1 className="title">
                  <span className="titleLine">Make OpenClaw finish</span>
                  <span className="titleMuted">on the right path.</span>
                </h1>
              </Reveal>
              <Reveal delay={0.06}>
                <p className="subtitle">
                  <strong>@aionis/openclaw-adapter</strong> gives OpenClaw run-start context,
                  tool policy gating, replay dispatch, and handoff fallback so the runtime stops
                  behaving like an unbounded tool loop and starts behaving like a controlled
                  execution system.
                </p>
              </Reveal>

              <Reveal delay={0.09}>
                <div className="ctaGrid">
                  {commandCards.map((item) => (
                    <article key={item.title} className="ctaCard surfaceCard">
                      <p className="ctaLabel">{item.title}</p>
                      <code>{item.command}</code>
                      <p className="ctaNote">{item.note}</p>
                    </article>
                  ))}
                </div>
              </Reveal>

              <Reveal delay={0.12}>
                <div className="heroHighlights">
                  {highlightCards.map((item) => (
                    <article key={item.label} className="highlightCard surfaceCard">
                      <span className="highlightLabel">{item.label}</span>
                      <strong>{item.value}</strong>
                      <p>{item.body}</p>
                    </article>
                  ))}
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        <section id="features">
          <div className="container">
            <Reveal>
              <p className="sectionKicker">Features</p>
              <h2 className="sectionTitle">A control layer around the run, not another plugin that only stores state.</h2>
              <p className="sectionDesc">
                The product story should be narrow and concrete: reduce uncontrolled tool-loop
                churn, preserve recoverable state, and give OpenClaw a deterministic way to stop or
                continue.
              </p>
            </Reveal>
            <div className="featureGrid">
              {featureCards.map((item, idx) => (
                <Reveal key={item.title} delay={0.04 + idx * 0.04}>
                  <article className="featureCard surfaceCard">
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="platforms">
          <div className="container splitSection">
            <Reveal>
              <div className="splitCopy">
                <p className="sectionKicker">Platforms</p>
                <h2 className="sectionTitle">One supported path: Lite first, OpenClaw first, install friction low.</h2>
                <p className="sectionDesc">
                  The recommended user journey is stable now: start Lite with the SDK, install the
                  adapter into OpenClaw, and keep the same runtime across TypeScript, Python, and
                  OpenClaw workflows.
                </p>
              </div>
            </Reveal>
            <Reveal delay={0.08} variant="scale">
              <div className="terminalWrap">
                <TerminalDemo />
              </div>
            </Reveal>
          </div>
          <div className="container platformGrid">
            {platformCards.map((item, idx) => (
              <Reveal key={item.title} delay={0.05 + idx * 0.03}>
                <article className="platformCard surfaceCard">
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        <section id="proof">
          <div className="container">
            <Reveal>
              <p className="sectionKicker">Proof</p>
              <h2 className="sectionTitle">The public story is completion and continuity on real OpenClaw slices.</h2>
              <p className="sectionDesc">
                The strongest evidence is not abstract. It comes from repeated real-workflow slices
                on the Lite path, and from explicit reliability fixes on the adapter hot path.
              </p>
            </Reveal>
            <Reveal delay={0.12} variant="scale">
              <div className="benchmarkWrap">
                <BenchmarkTerminal />
              </div>
            </Reveal>
          </div>
        </section>

        <section id="security">
          <div className="container">
            <Reveal>
              <p className="sectionKicker">Security and reliability</p>
              <h2 className="sectionTitle">Control only matters if the host stays safe when control-plane calls fail.</h2>
              <p className="sectionDesc">
                This release line fixes the dangerous edges: fail-open hot hooks, controlled
                fallback on deny-only tool policy, and a real off switch for operators.
              </p>
            </Reveal>
            <div className="securityGrid">
              {securityCards.map((item, idx) => (
                <Reveal key={item.title} delay={0.05 + idx * 0.04}>
                  <article className="securityCard surfaceCard">
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="quickstartSection">
          <div className="container quickstartShell surfaceCard">
            <Reveal>
              <p className="sectionKicker">Quickstart</p>
              <h2 className="sectionTitle">Start Lite, install the adapter, run the first controlled turn.</h2>
              <p className="sectionDesc">
                The first install should be simple. Use the minimal adapter config first. Do not
                tune advanced thresholds until you have your own slices to validate.
              </p>
              <div className="heroActions">
                <a
                  className="primaryAction"
                  href="https://github.com/Cognary/clawbot-aionis-adapter/blob/aionis/bootstrap-v1/docs/2026-03-14-install-and-config.md"
                  target="_blank"
                  rel="noreferrer"
                >
                  Read install guide
                </a>
                <a
                  className="secondaryAction"
                  href="https://github.com/Cognary/clawbot-aionis-adapter/blob/aionis/bootstrap-v1/examples/openclaw.json"
                  target="_blank"
                  rel="noreferrer"
                >
                  Minimal config
                </a>
              </div>
            </Reveal>
          </div>
        </section>

        <section id="faq">
          <div className="container">
            <Reveal>
              <p className="sectionKicker">FAQ</p>
              <h2 className="sectionTitle">Answer the install and trust questions directly.</h2>
            </Reveal>
            <div className="faqGrid">
              {faqItems.map((item, idx) => (
                <Reveal key={item.question} delay={0.05 + idx * 0.03}>
                  <article className="faqCard surfaceCard">
                    <h3>{item.question}</h3>
                    <p>{item.answer}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
