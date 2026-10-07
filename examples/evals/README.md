# Offline evidence scoring

This walkthrough is synthetic and must never certify. The scorer makes no API or model calls.

```sh
python3 scripts/evaluate.py --dataset examples/evals/dataset.json --results examples/evals/results.jsonl
```

Exit codes: `0` means the supplied evidence meets the gate, `1` means it does not, and `2` means an input/output or usage error. `--output PATH` writes a JSON report; input files cannot be overwritten. Defaults are `--target .95 --minimum-tasks 73`.

Use `--expected-dataset-sha256 HEX` to enforce a previously frozen dataset digest; a mismatch or malformed digest is an input error. Optional `--baseline-results PATH` compares candidate and baseline outcomes on this same dataset: improved, regressed and unchanged task counts. Pairing requires complete valid records on both sides. A task succeeds for comparison only if all trials pass both correctness and integrity. This descriptive comparison does not change candidate acceptance or claim statistical significance; baseline provenance still needs independent verification.

The dataset is JSON with nonempty string `id` and `version`, explicit boolean `synthetic`, `heldOut`, `distributionAgreed`, and nonempty `tasks`. Each task has a unique nonempty string `id`, nonempty string `category`, and boolean `critical`.

Results are JSONL, one trial per line. Each trial needs nonempty strings `taskId`, `runId`, `producerId`, `graderId`, `evidence`; explicit booleans `passed`, `integrityPassed`, `synthetic`, `heldOut`, `independentGrading`; finite nonnegative numeric `latencyMs`, `costUsd`. Boolean numbers, null flags, duplicate JSON properties, blank lines, unknown tasks and duplicate `(taskId, runId)` pairs are invalid. A single final newline is allowed. Extra fields are ignored and not echoed. Evidence should reference access-controlled artifacts, never contain credentials or private transcripts.

Every declared task remains in the denominator. A task passes only if every supplied attempt for it is valid and passes; retries cannot inflate the sample or erase failures. Integrity also requires all attempts to pass. Acceptance requires complete results, no invalid records, all critical tasks passing, 100% supplied integrity, and non-synthetic held-out evidence with declared independent grading and different producer/grader identities. Freeze tasks and the agreed category distribution before running and retain the SHA-256 dataset digest.

This is conservative `pass^k` aggregation across supplied trials, with no mandatory three paid trials or other minimum repeated-attempt count. The report exposes the Wilson confidence method and its two-sided critical value explicitly.

The statistical gate uses the lower endpoint of a two-sided 95% Wilson score interval (`z = 1.959963984540054`). Distinct tasks must meet both the configured minimum and `ceil(z² × target / (1 − target))`; at 95% this is 73. Thus 72/72 does not pass, 73/73 can pass the statistical gate, and 99/100 does not pass. This interval assumes a representative task sample with defensible independence. Metadata and distinct IDs alone cannot establish those assumptions; duplicated or correlated tasks need an evaluation design review. Category counts and point rates make the declared distribution visible; they do not assert 95% reliability separately for each category.

Latency and cost include schema-valid trials, including failed trials; invalid trials are reported separately. P50 is the median; P95 is the nearest-rank percentile. Units are milliseconds and US dollars. These measure only the submitted observations.

All provenance is self-reported: acceptance checks supplied evidence, not whether a real experiment occurred, whether artifacts support each grade, or whether identity strings represent independent people or models. An independent reviewer must verify those facts. Do not present acceptance as a universal reliability promise. Unit tests fabricate real-looking provenance solely to verify arithmetic; they are not measured workflow results.

Optional usage telemetry is described in the [usage contract](../../skills/ai-evaluation/references/evaluation.md). Declare provider/model and inclusive/exclusive input accounting; omit missing counters rather than reporting guessed zeros. Submitted counts are normalized without adding cached/reasoning subsets twice, and incomplete totals remain null. No token or price savings are inferred from these synthetic examples.
