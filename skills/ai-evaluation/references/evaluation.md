# Zero-failure acceptance and measured AI quality

Accuracy is defined against an agreed task distribution, not a global promise about a model. The shared scorer is offline; it does not generate or independently verify your outcomes.

Optional trial usage: include an object named usage with nonempty provider/model, accountingConvention (input) and outputConvention each inclusive or exclusive, and observed integer counters inputTokens, outputTokens, cachedInputTokens, cacheWriteInputTokens and reasoningOutputTokens. Omit unavailable counters; explicit nulls, booleans, negatives and fractional counts are invalid. Zero means actually observed zero.

For inclusive input accounting inputTokens includes cache reads/writes, which are subsets and must not exceed the total, individually or together when both are reported. For exclusive input accounting inputTokens is uncached input; total input is known only if input/read/write are all reported, then their sum is used. Inclusive outputTokens includes reasoningOutputTokens as a subset. Exclusive outputTokens excludes reasoning; normalized total output is known only when both output/reasoning are reported, then their sum is used. Total tokens use normalized input plus normalized output from the same observed trial. All input/output summaries aggregate normalized totals across conventions; subsets are never added again.

Usage summaries expose observedTrials, missingTrials, sumObserved and completeTotal for each counter. Complete totals are null when any schema-valid trial lacks that counter; an entirely unreported metric has null observed sum too. Counts include valid failed/retried trials, and invalid results remain reported separately. Provider/model labels and counters are submitted evidence, not verified billing. Existing costUsd remains observed submitted cost; no price table or cache savings is inferred.

Map counters from [OpenAI usage/caching](https://developers.openai.com/api/docs/guides/prompt-caching) or [Anthropic usage/caching](https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching), checked 07 October 2026. Anthropic input_tokens is uncached input; cache_read_input_tokens and cache_creation_input_tokens map to the two cache fields. OpenAI input_tokens is inclusive; its cached_tokens/cache_write_tokens are subcategories. Other providers must declare the convention matching their documented counters.

For [Gemini generateContent thinking usage](https://ai.google.dev/gemini-api/docs/thinking), candidate output and thought output can be separate counters; declare exclusive output when mapping candidatesTokenCount plus thoughtsTokenCount. Verify the current API's counter definitions rather than assigning conventions from a provider name alone. Official-document-shaped fixtures verify accounting arithmetic; they are fabricated test values, never live token or billing measurements.

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

Acceptance requires every declared task and every supplied trial to pass: any task failure blocks acceptance even when the statistical bound exceeds the target. It also requires all declared tasks observed, no invalid data, all integrity checks passing, non-synthetic held-out provenance and distinct producer/grader identities. Lowering --target changes only the statistical threshold; it cannot permit failed tasks. Metadata is self-reported; hashes detect changed inputs, not fabricated outcomes. A perfect observed dataset still needs independent review before any organizational reliability claim.

The 100% requirement describes observed acceptance checks. The 95% confidence level and default 0.95 statistical target describe uncertainty about unseen tasks; they are separate quantities. Do not set --target to 1: a finite sample cannot establish a Wilson lower bound of 1. A small perfect suite or synthetic fixture still fails the remaining certification gates.

Reports expose requiredTaskPassRate (1.0) and allTasksPassed (every declared task has supplied passing trials). allTasksPassed covers task outcomes only; accepted also requires integrity, validity, sample size and provenance. Read reasons when acceptance is false.

Run the small synthetic demonstration with examples/evals/dataset.json and results.jsonl. Exit 1 means it is deliberately noncertifying, even with perfect raw results. Exit 0 means supplied records meet the scorer's policy; exit 2 means malformed input/output. CI helper tests and fake fixtures never count as live AI evaluations.

Measure task success by category, observed p50/p95 latency, total/case cost, invalids and critical failures. Compare old/new configurations on the same task IDs, with paired improved/regressed counts where available. Add regression cases from real failures. Live runs are opt-in in the project's authorized environment; no API billing or production actions happen automatically.
