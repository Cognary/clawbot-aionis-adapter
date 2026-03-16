"use client";

import { motion } from "framer-motion";

const lines = [
  "$ npx @aionis/sdk@0.2.20 dev",
  "$ openclaw plugins install @aionis/openclaw-adapter",
  "$ openclaw agent --local --message \"inspect and proceed carefully\" --json",
  "[aionis] context assembled",
  "[aionis] broad search blocked -> focused path",
  "[aionis] deny-only path -> controlled fallback",
  "[aionis] fail-open safety active on hot hooks",
  "status: controlled_execution",
];

export function TerminalDemo() {
  return (
    <div className="demoTerminal codeBlock">
      <div className="codeHead">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
        <strong>First Controlled OpenClaw Turn</strong>
      </div>
      <motion.pre
        initial="hidden"
        whileInView="show"
        viewport={{ once: true }}
        variants={{
          hidden: {},
          show: {
            transition: {
              staggerChildren: 0.08,
            },
          },
        }}
      >
        {lines.map((line, idx) => (
          <motion.span
            key={line}
            className={idx === lines.length - 1 ? "yes" : ""}
            variants={{ hidden: { opacity: 0, x: -6 }, show: { opacity: 1, x: 0 } }}
            transition={{ duration: 0.2 }}
          >
            {line}
          </motion.span>
        ))}
      </motion.pre>
    </div>
  );
}
