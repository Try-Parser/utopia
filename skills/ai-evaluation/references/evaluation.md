# Measuring the 95%+ target

Accuracy is defined against an agreed task distribution, not a global promise about a model. The shared scorer is offline; it does not generate or independently verify your outcomes.

Predeclare the held-out dataset hash, rubric/grader, critical cases, model/configuration, expected trials, target, environment and latency/cost limits. Preserve development/regression tasks separately. When tuning after held-out feedback, use a new held-out set rather than pretending it remained unseen.

Dataset JSON:

```json
{"id":"team-heldout-v1","version":"1","synthetic":false,"heldOut":true,"distributionAgreed":true,"tasks":[{"id":"case-1","category":"engineering","critical":false}]}
```

Every JSONL result includes:

```json
{"taskId":"case-1","runId":"trial-1","producerId":"builder-run","graderId":"independent-grader","passed":true,"integrityPassed":true,"latencyMs":1000,"costUsd":0.01,"evidence":"external-review-artifact","synthetic":false,"heldOut":true,"independentGrading":true}
```

This schema example is not measured data. Results need actual observed outcomes and independently calibrated graders. Unknown, missing or invalid results block acceptance; nobody can silently omit failures. Distinct task IDs form the denominator. All recorded attempts for a task must pass; repeated trials do not increase sample size.

```text
python scripts/evaluate.py --dataset <dataset.json> --results <results.jsonl> --expected-dataset-sha256 <predeclared-sha256> --target 0.95 --output <external-report.json>
```

The default uses the lower limit of a two-sided 95% Wilson interval (z approximately 1.96; the report records the precise value), not a one-sided 95% bound. At zero failures 73 distinct tasks is the statistical minimum: 72/72 does not meet the lower-bound target; 73/73 does; 99/100 also falls short. Sample size and independence still depend on the real corpus: templated/correlated tasks can overstate confidence.

Acceptance additionally requires all declared tasks observed, no invalid data, all critical cases and integrity checks passing, non-synthetic held-out provenance and distinct producer/grader identities. Metadata is self-reported; hashes detect changed inputs, not fabricated outcomes. A statistically accepted provided dataset still needs independent review before any organizational reliability claim.

Run the small synthetic demonstration with examples/evals/dataset.json and results.jsonl. Exit 1 means it is deliberately noncertifying, even with perfect raw results. Exit 0 means supplied records meet the scorer's policy; exit 2 means malformed input/output. CI helper tests and fake fixtures never count as live AI evaluations.

Measure task success by category, observed p50/p95 latency, total/case cost, invalids and critical failures. Compare old/new configurations on the same task IDs, with paired improved/regressed counts where available. Add regression cases from real failures. Live runs are opt-in in the project's authorized environment; no API billing or production actions happen automatically.
