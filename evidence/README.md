# Evidence

This directory contains the public benchmark evidence subset that is referenced from the repo documentation.

Included here:

1. `summary.json` files for published benchmark slices
2. `cases.jsonl` files only where the docs explicitly discuss per-case results
3. one-prompt multi-agent A/B evidence for the published completion-oriented slices
4. realistic workflow scenario evidence for the published reviewer-ready slices, including the repeated `3`-run publication sets
5. newer real-Lite workflow publication sets where the treatment path uses the actual Aionis Lite runtime, including additional positive slices and supporting slices that are explicitly marked when they are non-headline evidence
6. real-Lite continuity-contract validation runs that prove `handoff/recover -> execution_packet_v1 -> context/assemble` is active on the actual workflow path
7. repeated real-Lite continuity A/B runs that compare the older legacy continuity path against the newer `execution_packet_v1` path
8. controlled real-Lite revalidation runs for the strongest reviewer-ready workflow slices after `ControlProfile` adoption on the actual runtime path
9. post-merge real-Lite stability checks that re-run the strongest slice after the corresponding Aionis kernel changes have landed on `main`
10. post-merge parity checks where a strongest slice remains stable after runtime-surface changes, even if the new run no longer adds completion uplift
11. Phase 2 state-first context revalidation runs that re-check the strongest slice after state-first context assembly lands on `Aionis main`
12. Phase 2 handoff-transition single-run revalidation runs that verify the new `handoff/store -> execution_transitions_v1` overlay on the real Lite path
13. Phase 2 handoff-transition repeated revalidation runs that confirm the repaired overlay remains positive under `3`-run strongest-slice real-workflow validation
14. Phase 2 `tools/select` state-aware repeated revalidation runs that confirm direct `execution_state_v1` consumption remains positive on strongest-slice reviewer-ready completion

Not included here:

1. full local benchmark working directories
2. transient logs that are only useful during local debugging

The full local benchmark outputs still live under `artifacts/`, which remains ignored.
