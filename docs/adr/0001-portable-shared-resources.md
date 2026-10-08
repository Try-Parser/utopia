# 0001: One canonical toolkit for both assistants

Status: Accepted
Decision date: 2026-10-07
Recorded date: 2026-10-08
Owner: Toolkit coordinator
Supersedes: None
Superseded by: None

## Context

The department must work across projects and both assistant adapters without copying account settings, credentials or service-specific release assumptions.

## Decision

Maintain canonical skills, roles and helpers in this repository. The installer distributes the same resources into Claude and Codex locations for either project or user scope. Each recipient owns model login, connector configuration and project context. Keep installation preview, explicit apply, conflict checks, backups and uninstall behavior.

## Alternatives considered

- Separate assistant implementations: would allow policy and helper behavior to diverge.
- Copy an entire developer profile: would spread private settings and tie the toolkit to one account or service.

## Consequences

- Shared maintenance and reusable global installation reduce duplicated instructions.
- Recipients must explicitly include guidance and wire tools; installing files does not establish a live connection.
- Updates preserve recipient-owned root instructions and account configuration.

## Verification and review

The [installer](../../scripts/install.py), [recipient proof](../../scripts/prove.py) and [historical department checks](../verification/2026-10-07-department/report.md) document distribution behavior. These software checks do not prove live model performance.

## Revisit when

An assistant requires a genuinely different runtime contract. Keep common policy canonical and document any narrow adapter separately.
