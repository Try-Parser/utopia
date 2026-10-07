---
name: ai-evaluation
description: Design and analyze reproducible evaluations of prompts, agents, retrieval or model changes using declared datasets and independent grading. Use for AI behavior changes and benchmark work, not ordinary software test execution.
---

# AI evaluation

## Use and skip

Use when measuring or comparing model, prompt, retrieval or agent behavior. Ordinary unit/integration test execution and prose-only edits do not need this skill. API/paid experiments remain within explicit task authorization.

Declare tasks, target distribution, baseline, grader/rubric and acceptance before tuning. Separate development/regression cases from a held-out evaluation set. Include real failures and representative engineering/research/design tasks, failure paths and critical authorization/integrity cases.

Grade observed end states using deterministic checks where suitable. Subjective research/design graders need independent calibration against human judgments and an Unknown outcome; Unknown is invalid, never quietly excluded. Distinct producer/grader metadata is required, but metadata alone cannot prove independence.

Track task success, integrity/critical failures, latency, cost, model/config/version, environment, dataset hash and evidence. Repeated attempts of one task are correlated: report per-trial metrics separately, and conservatively accept a task only when every declared trial succeeds. Reset/isolate trial environment. Do not tune on held-out results then claim they stayed held out.

The repository offline scorer is scripts/evaluate.py, copied to this installed skill's scripts/evaluate.py. It aggregates supplied records without contacting models. See the [evaluation guide](references/evaluation.md) for schemas, commands and evidence limits.

The default target is 95% task success with the lower two-sided 95% Wilson confidence bound at least 0.95, adequate distinct-task sample and all critical/integrity/validity gates passed. At zero failures the statistical minimum is 73 distinct tasks; raw 95% on a tiny suite is not certification. Report categories and limits so easy cases cannot hide consequential failures.

Synthetic fixtures, unit-test totals and a structurally passing gate never certify live agent quality. Obtain real held-out outcomes in authorized environments, with independently checked evidence and rubrics. API calls, paid experiments and external side effects are opt-in, never automatic CI dependencies.

## Output

Lead with the measured outcome and acceptance verdict. Include task/sample scope, uncertainty, critical/integrity outcomes, usage/cost coverage and latency only where observed. Link the full records instead of repeating them; distinguish synthetic demonstrations from live evidence.
