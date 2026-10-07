# Optimize against observed outcomes

Use AI for investigation, coding, design critique, test generation, review and outcome grading where judgment is needed. Use scripts for repeatable validation, parsing, installation and scoring. Load relevant skills and references on demand; give each role the goal, affected inputs, acceptance and evidence pointers rather than entire transcripts or unrelated repositories.

| Priority | Implemented support | What to measure before claiming improvement |
| --- | --- | --- |
| Token/cost efficiency | Optional provider-convention usage normalization; concise role handoffs; conditional domain skills | Complete usage coverage, tokens and observed cost per accepted task, including failed attempts |
| Accuracy | Declared datasets, independent grading, critical cases and conservative confidence gate | Held-out task success and lower confidence bound; grade calibration and distribution review |
| Consistent practices | Canonical skills/roles, installable references, shared resource templates | Recipient smoke checks and conformance to actual repository standards |
| Integrity | Frozen source identities, actual review evidence, staged-tree/postcommit mapping | Evidence matches tested/delivered revision; missing or invalid records remain visible |
| Security | Path/ownership protections, account-file preservation, narrow optional connectors, offline tests | Reachable threat-case outcomes, credential hygiene and authorized tool scope |

For cache-friendly providers, keep stable reusable instructions/tool definitions stable and place changing task material afterward where the provider supports it. Minimum cache sizes, expiration and write charges vary by model. Measure cache reads, writes, total tokens, latency and actual cost; a cache hit is not by itself a savings claim. See [OpenAI caching](https://developers.openai.com/api/docs/guides/prompt-caching) and [Anthropic caching](https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching), checked 07 October 2026. Context selection follows [Anthropic context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents); proposed benefits still require our measurements.

Predeclare a baseline and candidate on the same representative held-out task set, trial policy, model/configuration, environment and independent grading rubric. Keep tuning tasks separate. Record failures, retries, wall time, active/wait reasons, tool calls and usage coverage. Compare task acceptance and security first, then tokens/cost/latency. Reject an apparent efficiency win that weakens correctness, critical/integrity gates or authorized scope. Do not silently exclude missing telemetry or costly failed trials.

Read the [usage contract](../skills/ai-evaluation/references/evaluation.md) before mapping provider counters. Inclusive input totals and exclusive uncached input are different conventions; cached/reasoning subsets are never counted twice. No new model pin, broad tool permissions or automated deployment is required to measure these improvements.

Current evidence proves deterministic tools and controlled integration behavior. Live 95%+ AI quality, production token savings, standards certification and resolution of the earlier 24-hour task duration remain unmeasured. The [graphical report](verification/2026-10-07/report.md) shows exactly what was observed.
