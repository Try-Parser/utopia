# 0005: Keep evidence local and defer background uploads

Status: Accepted
Decision date: 2026-10-08
Recorded date: 2026-10-08
Owner: Toolkit coordinator
Supersedes: None
Superseded by: None

## Context

The user considered background reporting from every installation, then explicitly requested deferral. No central destination or recipient enrollment was selected.

## Decision

Keep optional content-free traces and the standalone HTML evidence panel local. Do not install a reporter, start a background process or automatically send recipient metrics. The published synthetic-file demonstration remains a tool smoke, with unobserved model tokens and cost shown as unknown.

## Alternatives considered

- Automatic central uploads now: would require a selected destination, enrollment, transport and data-retention policy.
- Frequent metrics commits to source control: would add repository churn and a separate access/retention problem.
- Drop local evidence: would remove useful visibility into actual instrumented operations.

## Consequences

- Instrumented runs can be inspected without a reporting service.
- There is no department-wide live dashboard or automatic collection of every native assistant action.
- Any later uploader needs a separate reviewed design and explicit operational rollout.

## Verification and review

See the [measurement runbook](../../skills/ai-evaluation/references/measurement.md), [trace helper](../../scripts/telemetry.py), [local panel](../../scripts/control_panel.py) and [published demonstration](../verification/2026-10-08-measured/report.md). The demonstration is intentionally separate from live model evaluation.

## Revisit when

The team requests shared reporting and selects an authorized destination, minimum data fields, enrollment and retention controls.
