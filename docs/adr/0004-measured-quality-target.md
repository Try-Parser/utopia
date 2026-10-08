# 0004: 99% measured target and 100% observed acceptance

Status: Accepted
Decision date: 2026-10-08
Recorded date: 2026-10-08
Owner: Evaluation and delivery roles
Supersedes: None
Superseded by: None

## Context

The earlier default quality target was 95%. The user requested 99% to 100%, while finite evaluation evidence cannot establish universal perfect AI accuracy.

## Decision

Default to a Wilson lower-bound quality target of 0.99 using a separate two-sided 95% confidence level. At zero failures the default minimum is 381 distinct tasks. Require 100% of every declared task, supplied trial and integrity acceptance check to pass, alongside validity, provenance and independent grading requirements. Preserve explicitly configured historical plans and original verification evidence.

## Alternatives considered

- Keep the earlier 0.95 default: would not reflect the requested stronger target.
- Set the Wilson lower-bound target to 1: no finite sample could meet it.
- Allow failures whenever a confidence bound meets the target: would weaken the separate zero-failure acceptance rule.

## Consequences

- More representative tasks and grading effort are required; retries do not increase distinct sample size.
- The 99% value is a policy target, not an achieved live result. Synthetic fixtures verify software behavior only.
- Self-reported provenance and hashes do not prove genuine independent human grading or sample independence.

## Verification and review

The [evaluation contract](../../skills/ai-evaluation/references/evaluation.md), [measurement contract](../measurement-contract.md), [scorer](../../scripts/evaluate.py) and [golden vectors](../../skills/ai-evaluation/references/measurement-golden-cases.json) define and test the policy. No genuine human-reviewed campaign establishing live 99% accuracy has been published.

## Revisit when

A representative independent evaluation provides evidence for another target, confidence level or sampling design. Document the change without rewriting historical results.
