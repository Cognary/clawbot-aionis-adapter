import { BenchmarkTerminal } from "../components/benchmark-terminal";
import { Reveal } from "../components/reveal";
import { TerminalDemo } from "../components/terminal-demo";

const navItems = [
  { href: "#features", label: "Features" },
  { href: "#platforms", label: "Platforms" },
  { href: "#proof", label: "Proof" },
  { href: "#safety", label: "Safety" },
  { href: "#faq", label: "FAQ" },
];

const heroStats = [
  { label: "OpenClaw path", value: "Real runtime", note: "Not a mock harness." },
  { label: "Published adapter", value: "0.1.3", note: "Current npm release." },
  { label: "Published SDK", value: "0.2.20", note: "Local Lite bootstrap path." },
];

const pillarCards = [
  {
    title: "Stop tool-loop churn",
    body: "Suppress broad scans, broad tests, and repeated no-progress tool paths before they burn more steps and tokens.",
  },
  {
    title: "Preserve execution continuity",
    body: "Start from recovered task state, not from a blank prompt that has to rediscover the repo and re-derive the plan.",
  },
  {
    title: "Exit through a controlled path",
    body: "When the run should stop, replay and handoff preserve a usable continuation instead of letting the agent drift into failure.",
  },
];

const featureCards = [
  {
    step: "01",
    title: "Run-start context assembly",
    body: "Aionis prepares a compact execution view before the first expensive turn, so OpenClaw starts from what already happened.",
  },
  {
    step: "02",
    title: "Pre-tool policy gating",
    body: "The adapter asks Aionis for tool policy before costly actions run, which lets it deny broad or obviously degraded paths.",
  },
  {
    step: "03",
    title: "Replay dispatch",
    body: "Reusable work can escape into replay instead of forcing the model to improvise from scratch on every similar task.",
  },
  {
    step: "04",
    title: "Handoff fallback",
    body: "If the right move is to stop, the adapter keeps a clean continuation point instead of dropping state on the floor.",
  },
];

const platformCards = [
  {
    title: "No local Aionis repo required",
    body: "Users can bootstrap Lite directly with `npx @aionis/sdk@0.2.20 dev` and connect OpenClaw without cloning the core repo.",
    kicker: "Fastest path",
  },
  {
    title: "Built for OpenClaw",
    body: "The product wedge is explicit: execution control for OpenClaw, not a generic plugin trying to do every agent job at once.",
    kicker: "Primary integration",
  },
  {
    title: "SDK-backed runtime",
    body: "TypeScript and Python SDKs both target the same local Lite runtime, so install paths do not split into separate bootstraps.",
    kicker: "Shared runtime",
  },
  {
    title: "Works from local to self-hosted",
    body: "Start on Lite, keep the same control model, and move to broader Aionis deployment surfaces only when the user actually needs them.",
    kicker: "Upgrade path",
  },
];

const proofCards = [
  {
    label: "Dashboard auth drift",
    value: "0.6667 -> 1",
    body: "Strongest real-workflow reviewer-ready slice on the current release line.",
  },
  {
    label: "Pairing / approval recovery",
    value: "0 -> 1",
    body: "Repeated real-workflow uplift on a second strongest slice.",
  },
  {
    label: "Continuity packet A/B",
    value: "1 -> 1",
    body: "Packet continuity matches legacy completion while lowering cost on core repeated slices.",
  },
  {
    label: "Reliability path",
    value: "Fail-open",
    body: "Transport failures now degrade open, deny-only policy goes through controlled fallback, and `enabled=false` is a real off switch.",
  },
];

const safetyCards = [
  {
    title: "Aionis failures do not take OpenClaw down",
    body: "Hot-path transport errors now degrade open instead of aborting the host run. That keeps the adapter in the control plane, not the blast radius.",
  },
  {
    title: "Policy denies are controlled, not random",
    body: "If a tool is denied and no safe alternative remains, the adapter now routes through the same replay or handoff stop path instead of throwing.",
  },
  {
    title: "Operators can really turn it off",
    body: "The `enabled=false` switch now disables loop control and hot-path Aionis behavior, which matters for rollout and incident handling.",
  },
];

const faqItems = [
  {
    question: "Do I need a local Aionis repo to use this?",
    answer:
      "No. The recommended path is `npx @aionis/sdk@0.2.20 dev`, which bootstraps local Lite without requiring a source checkout first.",
  },
  {
    question: "What do I actually install?",
    answer:
      "Users install `@aionis/openclaw-adapter@0.1.3` into OpenClaw and run Lite with `@aionis/sdk@0.2.20`. That is the primary supported path.",
  },
  {
    question: "What is the strongest public claim today?",
    answer:
      "Aionis improves execution continuity and reviewer-ready completion on current OpenClaw slices by adding policy gating, replay, handoff, and externalized context.",
  },
  {
    question: "Is this just another memory plugin?",
    answer:
      "No. The product is positioned as an execution-control layer for OpenClaw. Memory matters only insofar as it helps the run stay on the right path.",
  },
];

const quickstartLines = [
  "$ npx @aionis/sdk@0.2.20 dev",
  "$ npx @aionis/sdk@0.2.20 health --base-url http://127.0.0.1:3321",
  "$ openclaw plugins install @aionis/openclaw-adapter",
  "$ openclaw agent --local --message \"inspect and proceed carefully\" --json",
];

const externalLinks = [
  { href: "https://www.npmjs.com/package/@aionis/openclaw-adapter", label: "npm" },
  { href: "https://www.npmjs.com/package/@aionis/sdk", label: "SDK" },
  { href: "https://github.com/Cognary/clawbot-aionis-adapter", label: "GitHub" },
];

export default function HomePage() {
  return (
    <>
      <div className="pageNoise" aria-hidden />
      <main className="siteShell">
        <Reveal>
          <header className="topbar">
            <a className="brandmark" href="#home">
              <span className="brandDot" />
              <span>Aionis for OpenClaw</span>
            </a>
            <nav className="nav">
              {navItems.map((item) => (
                <a key={item.href} href={item.href}>
                  {item.label}
                </a>
              ))}
            </nav>
            <a
              className="navCta"
              href="https://www.npmjs.com/package/@aionis/openclaw-adapter"
              target="_blank"
              rel="noreferrer"
            >
              Install adapter
            </a>
          </header>
        </Reveal>

        <section id="home" className="heroSection">
          <div className="heroCopy">
            <Reveal>
              <p className="sectionEyebrow">Execution control for OpenClaw</p>
            </Reveal>
            <Reveal delay={0.03}>
              <h1>
                Turn OpenClaw from an unbounded tool loop into a controlled execution system.
              </h1>
            </Reveal>
            <Reveal delay={0.06}>
              <p className="heroText">
                <strong>@aionis/openclaw-adapter</strong> adds policy gating, replay dispatch,
                handoff fallback, and recovered execution context around real OpenClaw runtime
                paths. The product wedge is narrow by design: better continuity, safer control,
                and higher reviewer-ready completion.
              </p>
            </Reveal>
            <Reveal delay={0.09}>
              <div className="heroActions">
                <a className="primaryButton" href="#quickstart">
                  Start in 3 minutes
                </a>
                <a className="ghostButton" href="#proof">
                  See proof
                </a>
                {externalLinks.map((item) => (
                  <a key={item.label} className="ghostButton" href={item.href} target="_blank" rel="noreferrer">
                    {item.label}
                  </a>
                ))}
              </div>
            </Reveal>
            <Reveal delay={0.12}>
              <div className="heroStats">
                {heroStats.map((item) => (
                  <article key={item.label} className="statCard">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <p>{item.note}</p>
                  </article>
                ))}
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.08} variant="scale">
            <aside className="heroConsole">
              <div className="miniTagRow">
                <span>OpenClaw plugin</span>
                <span>Adapter 0.1.3</span>
                <span>SDK 0.2.20</span>
              </div>
              <TerminalDemo />
            </aside>
          </Reveal>
        </section>

        <section className="pillarsSection">
          {pillarCards.map((item, idx) => (
            <Reveal key={item.title} delay={0.04 + idx * 0.04}>
              <article className="pillarCard">
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            </Reveal>
          ))}
        </section>

        <section id="features" className="contentSection">
          <Reveal>
            <p className="sectionEyebrow">Features</p>
            <div className="sectionHeadingRow">
              <h2>A control architecture around the run, not another plugin that only adds storage.</h2>
              <p>
                The page structure is simple because the product story should be simple: control the
                tool loop, keep state recoverable, and provide a deterministic way to stop or
                continue.
              </p>
            </div>
          </Reveal>
          <div className="featureGrid">
            {featureCards.map((item, idx) => (
              <Reveal key={item.title} delay={0.05 + idx * 0.04}>
                <article className="featurePanel">
                  <span className="stepBadge">{item.step}</span>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        <section id="platforms" className="contentSection splitSection">
          <Reveal>
            <div className="splitCopy">
              <p className="sectionEyebrow">Platforms</p>
              <h2>One product path, multiple ways to enter it.</h2>
              <p>
                The primary user journey is now stable: bootstrap Lite with the SDK, install the
                OpenClaw adapter, and keep the same runtime underneath TypeScript, Python, and
                OpenClaw workflows.
              </p>
            </div>
          </Reveal>
          <div className="platformGrid">
            {platformCards.map((item, idx) => (
              <Reveal key={item.title} delay={0.05 + idx * 0.04} variant="scale">
                <article className="platformCard">
                  <span>{item.kicker}</span>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        <section id="proof" className="contentSection proofSection">
          <Reveal>
            <p className="sectionEyebrow">Proof</p>
            <div className="sectionHeadingRow">
              <h2>The public claim is reviewer-ready completion and continuity, not vague agent quality.</h2>
              <p>
                The strongest evidence comes from real OpenClaw workflow slices on the Lite path.
                This site should sell exactly what is proven and no more.
              </p>
            </div>
          </Reveal>
          <div className="proofGridNew">
            {proofCards.map((item, idx) => (
              <Reveal key={item.label} delay={0.05 + idx * 0.04}>
                <article className="proofMetricCard">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <p>{item.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
          <Reveal delay={0.18} variant="scale">
            <div className="benchmarkShell">
              <BenchmarkTerminal />
            </div>
          </Reveal>
        </section>

        <section id="safety" className="contentSection safetySection">
          <Reveal>
            <p className="sectionEyebrow">Safety and reliability</p>
            <div className="sectionHeadingRow">
              <h2>Execution control only works if it fails safely under pressure.</h2>
              <p>
                This release line explicitly prioritizes host safety: hot-path errors degrade open,
                deny-only policy decisions follow a controlled fallback path, and operators can
                disable loop control when they need to.
              </p>
            </div>
          </Reveal>
          <div className="safetyGrid">
            {safetyCards.map((item, idx) => (
              <Reveal key={item.title} delay={0.05 + idx * 0.04}>
                <article className="safetyCard">
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        <section id="quickstart" className="contentSection quickstartSectionNew">
          <Reveal>
            <p className="sectionEyebrow">Quickstart</p>
            <div className="sectionHeadingRow">
              <h2>Users can start Lite without a local Aionis repo, then connect OpenClaw in one pass.</h2>
              <p>
                The shortest supported path is intentionally narrow. Install the SDK, start Lite,
                install the adapter, and run the first controlled turn.
              </p>
            </div>
          </Reveal>
          <div className="quickstartGrid">
            <Reveal delay={0.04}>
              <article className="checklistCard">
                <ol>
                  <li>Run `npx @aionis/sdk@0.2.20 dev`</li>
                  <li>Check `health` on `http://127.0.0.1:3321`</li>
                  <li>Install `@aionis/openclaw-adapter@0.1.3` in OpenClaw</li>
                  <li>Use the minimal config before touching advanced thresholds</li>
                </ol>
              </article>
            </Reveal>
            <Reveal delay={0.08} variant="scale">
              <article className="codePanel">
                <div className="codeHead">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                  <strong>3-minute setup</strong>
                </div>
                <pre>
                  {quickstartLines.map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </pre>
              </article>
            </Reveal>
          </div>
        </section>

        <section id="faq" className="contentSection faqSection">
          <Reveal>
            <p className="sectionEyebrow">FAQ</p>
            <div className="sectionHeadingRow">
              <h2>Answer the install and trust questions directly.</h2>
              <p>
                If a user cannot understand what to install, why it is safe, and what it really
                improves, the site is not doing its job.
              </p>
            </div>
          </Reveal>
          <div className="faqList">
            {faqItems.map((item, idx) => (
              <Reveal key={item.question} delay={0.05 + idx * 0.04}>
                <article className="faqCard">
                  <h3>{item.question}</h3>
                  <p>{item.answer}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="finalCallout">
          <Reveal>
            <p className="sectionEyebrow">The pitch</p>
            <h2>Aionis for OpenClaw is not about making the model “smarter”. It is about making the run finish on the right path.</h2>
            <div className="heroActions">
              <a className="primaryButton" href="https://www.npmjs.com/package/@aionis/openclaw-adapter" target="_blank" rel="noreferrer">
                Install adapter
              </a>
              <a className="ghostButton" href="https://github.com/Cognary/clawbot-aionis-adapter/blob/aionis/bootstrap-v1/docs/2026-03-14-install-and-config.md" target="_blank" rel="noreferrer">
                Read install guide
              </a>
            </div>
          </Reveal>
        </section>
      </main>
    </>
  );
}
