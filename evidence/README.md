# Evidence

This directory contains the public benchmark evidence subset that is referenced from the repo documentation.

Included here:

1. `summary.json` files for published benchmark slices
2. `cases.jsonl` files only where the docs explicitly discuss per-case results
3. one-prompt multi-agent A/B evidence for the published completion-oriented slices
4. realistic workflow scenario evidence for the published reviewer-ready slice, including the repeated `3`-run publication set

Not included here:

1. full local benchmark working directories
2. transient logs that are only useful during local debugging

The full local benchmark outputs still live under `artifacts/`, which remains ignored.
