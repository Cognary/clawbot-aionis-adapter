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

Not included here:

1. full local benchmark working directories
2. transient logs that are only useful during local debugging

The full local benchmark outputs still live under `artifacts/`, which remains ignored.
