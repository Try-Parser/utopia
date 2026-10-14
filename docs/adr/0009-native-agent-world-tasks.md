# 0009: Native tasks and authoritative role activity

Date: 2026-10-12
Status: Accepted
Supersedes the task-execution exclusion of [0008](0008-local-agent-world.md), preserving its simulation and checkpoint distinctions.

## Context

The user accepted the next step of connecting the simulation to live agents and assigning real tasks. The installed Codex CLI supports non-interactive JSONL events, explicit sandbox access, stdin prompts, and ephemeral sessions. The desktop conversation itself is not a general-purpose task execution HTTP API.

## Decision

Add an optional local task queue using the installed native CLI. Bind each submitted mission to a selected department role and a server-configured workspace. Animate only real observed turn activity. Keep simulation, live sessions, and historical checkpoints separate. Do not infer hidden subagent roles or percent completion.

Use loopback binding, exclusive port ownership where supported, Host/Origin checks, a random session token, fixed payload fields, bounded input/output, and idempotent retained request IDs. Default to read-only; server-enabled workspace edits require an explicit access selection and a coordinator or builder role. Run one mission at a time, terminate owned process trees on cancellation, cap execution time, and never replay unknown outcomes after restart.

Persist mission metadata and requested final results outside source and workflow evidence. Discard raw tool output, commands, reasoning, and stderr. Preserve account configuration and reuse existing native authentication. Never bypass the native sandbox. Completion does not grant review approval or delivery authorization. Canonical specialist guidance and repository Frank instructions remain applicable to execution; the viewer is not a replacement review gate.

## Alternatives

Calling a hosted model API directly would require account integration and recreate native tool/sandbox behavior. Automating the current desktop conversation would lack a supported local task interface. A custom autonomous pipeline could duplicate the established Frank runtime and falsely certify readiness from one agent's response.

## Consequences

Users can assign real inspections or local engineering tasks and see their assigned role's actual activity. Native CLI login, available models, sandbox support, trusted repository configuration, and development tools determine execution capability. Existing sessions launched elsewhere remain unmapped historical checkpoints. Native results require normal review and verification before commit or release.
