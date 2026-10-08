# 0006: Route relevant specialists and report concisely

Status: Accepted
Decision date: 2026-10-08
Recorded date: 2026-10-08
Owner: Department coordinator
Supersedes: None
Superseded by: None

## Context

Broad skills and repeated explanations consume context, delay work and make important results harder to find. The user requested a reusable department with designer and other specialist responsibilities, plus precise concise reports.

## Decision

Provide twelve canonical specialist roles and narrow skill entrypoints. The coordinator activates relevant expertise and loads conditional references when needed. Keep independent delivery review separate. Lead reports with the outcome and essential evidence, keeping detailed logs in artifacts without concealing failures or material limitations.

## Alternatives considered

- Load every role and resource for every task: would add irrelevant context and coordination overhead.
- Remove specialist responsibilities to reduce context: would lose requested design, research and architecture capability.
- Report only a success label: would hide verification gaps and security findings.

## Consequences

- Role definitions clarify responsibility; they do not establish runtime concurrency, connector access or measured model quality.
- Focused context is an optimization approach, not proven token savings until actual usage is measured.
- The architect records material choices as ADRs; routine fixes reuse existing decisions.

## Verification and review

See the [role catalog](../../skills/frank/references/department.md), [routing examples](../../skills/frank/references/routing-examples.md) and [shared guidance](../../templates/global-CLAUDE.md). Installation checks can verify resource distribution, but not live routing accuracy.

## Revisit when

Observed task failures, context use or handoff delays justify changing role boundaries or activation rules.
