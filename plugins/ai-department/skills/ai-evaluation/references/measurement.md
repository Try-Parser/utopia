# Measure actual work

Both assistant adapters install benchmark.py, telemetry.py and control_panel.py beside evaluate.py in this skill's scripts directory. Use the same contracts and grading process in Codex and Claude. No helper contacts a model or uploads traces automatically.

## Benchmark campaign

Choose representative tasks with the team and keep grading data private. Separate capability research from release regression; a difficult research task failing is useful evidence, but it cannot pass the release acceptance gate. Preserve a genuinely held-out set that builders have not tuned against. Calibrate graders with human judgments before collecting results.

Prepare before execution:

```text
python <skill>/scripts/benchmark.py prepare --dataset <private-dataset.json> --rubric <rubric.json> --model-config-id <approved-config-id> --campaign-id <campaign-id> --producer-id <builder-id> --grader-id <independent-grader-id> --human-calibration-id <calibration-id> --expected-trials 1 --output <fresh-external-plan.json>
```

Use the benchmark helper's documented rubric schema. Every result retains the evaluation schema and binds campaignId, datasetSha256, rubricSha256 and modelConfigId. Include humanReviewed only after actual independent human review, and the matching humanCalibrationId. Record every declared trial, including failures and retries. Real task outputs and raw review evidence stay in approved private storage.

```text
python <skill>/scripts/benchmark.py finalize --plan <plan.json> --dataset <dataset.json> --rubric <rubric.json> --results <actual-results.jsonl> --output <fresh-report.json>
```

Changes to inputs, wrong identities, absent human review or extra/missing trials reject. All existing zero-failure, integrity, statistical and provenance checks still apply. A declared identity, timestamp or hash does not prove human independence, honesty or unseen tasks. Synthetic examples and golden vectors test the helper only.

## Trace without content

The default measured quality target is 99% (Wilson lower bound 0.99 at two-sided 95% confidence); zero failures require at least 381 distinct tasks. Every task/trial and integrity check must pass. See the evaluation contract for sample assumptions. Background metrics uploads are deferred; traces and the panel remain local.

An authorized adapter may import Recorder from telemetry.py and call its structured API around actual work. It observes elapsed time with its own monotonic clock; automatic native-session instrumentation is not provided. Do not send prompts, responses, tool arguments, credentials or private paths. Unknown fields are rejected. Provider counters must be observed and use the existing documented accounting conventions.

```text
python <skill>/scripts/telemetry.py summarize --trace <actual-trace.jsonl> --output <fresh-summary.json>
python <skill>/scripts/control_panel.py --telemetry <summary.json> --benchmark <report.json> --output <fresh-panel.html>
```

Repeat --trace to combine runs, including failures. Missing token/cost data stays unknown. Recorded waits plus the remainder partition observed wall time; the remainder is not a direct measure of model thinking or human productivity. Imported events are submitted evidence. The local HTML panel has no external assets, model connection, background agent or automatic upload. Open it in a browser to inspect outcomes, coverage, timing and tool denials.

Compare baseline and candidate on the same predeclared tasks, conditions and grading. Claim savings only when actual usage/cost coverage and outcome equivalence support them. Keep trace outputs private by default. Do not convert a perfect fixture score into a live accuracy claim.
