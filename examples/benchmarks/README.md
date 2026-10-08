# Predeclare and grade a real campaign

This rubric is a generic template, not a measured benchmark. Use sanitized private held-out tasks outside the shared repository; agree their distribution and calibrate human graders before running them. Dataset and trial schemas follow [the evaluator](../../scripts/evaluate.py). Rubric criteria declare the grading rules; this helper verifies declarations and scores supplied verdicts, not the answers themselves.

1. Write a dataset using `id`, `version`, explicit `synthetic`, `heldOut` and `distributionAgreed` booleans, and nonempty `tasks` with `id`, `category` and boolean `critical`. Define domain-specific checks in your private rubric. Its exact schema is `id`, `version`, and nonempty `criteria` containing unique `id`, nonempty `description` and boolean `required`.
2. Create a fresh plan before the campaign. Opaque identities must be 1–128 ASCII letters, digits, periods, underscores, colons or hyphens, starting with a letter or digit. Producer and grader must differ. The model configuration identity should identify model, prompt, tools and relevant settings in your private configuration registry. Keep the plan immutable with an independently witnessed timestamp if predeclaration matters.

```sh
python scripts/benchmark.py prepare --dataset private-dataset.json --rubric private-rubric.json --model-config-id config-v1 --campaign-id campaign-1 --producer-id candidate --grader-id independent-grader --human-calibration-id calibration-1 --expected-trials 1 --output plan.json
```

3. Run every predeclared trial. Have the independent grader apply the rubric and a calibrated human review each result. Retain every failure and retry: choose the trial count before execution, or prepare a new campaign for a changed protocol. Do not silently omit extra attempts. Every JSONL record includes the evaluator's required fields plus `datasetSha256`, `rubricSha256`, `modelConfigId`, `campaignId`, `humanCalibrationId` matching the plan, and `humanReviewed: true`. `producerId` and `graderId` also match. Optional usage uses the evaluator's explicit provider/accounting conventions; unknown fields reject. Store evidence references rather than private answer contents where possible.
4. Finalize against the same dataset, rubric and plan. The report contains hashes, opaque identities and aggregates, not submitted evidence text. Output files must be new and their parent directories must already exist; links/junctions are rejected.

```sh
python scripts/benchmark.py finalize --plan plan.json --dataset private-dataset.json --rubric private-rubric.json --results private-results.jsonl --output report.json
```

Exit codes: `0` prepared/accepted, `1` valid report that rejects acceptance, `2` input/output error. Every task, every declared trial and integrity check must pass; unknown, duplicate, missing, extra or mismatched results block acceptance. The default measured quality target is a Wilson lower bound of 0.99 with at least 381 distinct tasks, using a separate two-sided 95% confidence level. This is separate from the requirement that 100% of supplied checks pass. Increasing retries does not increase distinct sample size.

Hashes cannot establish honest human review, independent calibration, genuine tasks, representative sampling, dataset secrecy or actual predeclaration. A fabricated fixture with genuine declarations can pass the parser and scorer; it only tests software. Protect private data externally, restrict output permissions, and publish live-performance claims only with independently verified campaign evidence. No model or Claude API calls run here.
