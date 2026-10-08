# 0003: Restrict routed tools with Docker

Status: Accepted
Decision date: 2026-10-08
Recorded date: 2026-10-08
Owner: Platform and security roles
Supersedes: None
Superseded by: None

## Context

Model-supplied tool arguments and untrusted project content need a narrow execution boundary without granting arbitrary host commands or credentials.

## Decision

Route supported file reads, file lists and fixed Python test requests through a validated gateway. A trusted operator selects the sanitized project and approved image. Accepted requests execute in fresh non-root Docker containers with no network, read-only mounts, bounded resources and no host credential store or Docker socket. Deny unsupported tools, secret paths and path escapes.

## Alternatives considered

- Instructions alone: would not enforce an execution boundary.
- Unrestricted shell access through the gateway: would allow model arguments to expand permissions.
- Claiming a sandbox for every native tool: would misrepresent the gateway's actual coverage.

## Consequences

- These controls cover routed requests only; native assistant tools retain their own permissions.
- Tests can read mounted project files, so sanitization remains an operator responsibility.
- Docker and an approved image are external prerequisites; containment is not universal attack resistance or standards certification.

## Verification and review

See the [gateway runbook](../../skills/autonomous-development/references/tool-gateway.md), [controller](../../scripts/safe_tools.py), [worker](../../scripts/sandbox_worker.py) and [observed fixture demonstration](../verification/2026-10-08-measured/report.md). An expected denial does not measure model-level prompt-injection resistance.

## Revisit when

Another stack or tool needs an approved operation, or a concrete containment failure changes the threat model. Expand the interface through a reviewed contract rather than an arbitrary command option.
