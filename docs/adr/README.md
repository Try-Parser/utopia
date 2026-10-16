# Architecture decision records

These records explain the AI department's important choices. Records 0001–0006 were recorded on 08 October 2026 from already adopted decisions and implementation; 0007 records the user's new plugin request. They do not claim a separate architecture-board approval. The earlier [decision history](../decisions.md) remains available.

| ADR | Decision | Status | Decision date |
| --- | --- | --- | --- |
| [0001](0001-portable-shared-resources.md) | One canonical toolkit for both assistants | Accepted | 2026-10-07 |
| [0002](0002-independent-review-and-delivery.md) | Frozen evidence and independent delivery reviews | Accepted | 2026-10-08 |
| [0003](0003-restricted-docker-tools.md) | Restrict routed tools with Docker | Accepted | 2026-10-08 |
| [0004](0004-measured-quality-target.md) | 99% measured target and 100% observed acceptance | Accepted | 2026-10-08 |
| [0005](0005-local-evidence-and-deferred-uploads.md) | Keep evidence local; defer background uploads | Accepted | 2026-10-08 |
| [0006](0006-focused-specialists-and-concise-output.md) | Route relevant specialists and report concisely | Accepted | 2026-10-08 |
| [0007](0007-plugin-distribution.md) | Generate a self-contained plugin for both coding tools | Accepted | 2026-10-08 |
| [0008](0008-local-agent-world.md) | Local game-style simulation and read-only observed checkpoints | Accepted | 2026-10-12 |
| [0009](0009-native-agent-world-tasks.md) | Optional native task queue and authoritative assigned-role activity | Accepted | 2026-10-12 |
| [0010](0010-provider-neutral-local-discovery.md) | Read-only cross-provider processes, metadata and adapter heartbeats | Accepted | 2026-10-12 |
| [0011](0011-autonomous-agent-office.md) | Automatic observed office with explicit roles and task handoff evidence | Accepted | 2026-10-12 |
| [0012](0012-workstation-code-and-app-preview.md) | Scoped native code diffs and user-connected local app screens | Accepted | 2026-10-12 |

| [0013](0013-local-session-tool-activity.md) | Bounded local tool events and explicit activity-derived departments | Accepted | 2026-10-13 |

| [0014](0014-live-office-stream.md) | Shared live push, cached activity and separate inventory refresh | Accepted | 2026-10-13 |

| [0015](0015-isometric-office-presentation.md) | Shared world-to-scene projection for a believable office game | Accepted for local implementation | 2026-10-13 |
| [0016](0016-webgl-office.md) | Local WebGL office with perspective camera and authoritative live agents | Accepted for local implementation | 2026-10-16 |

Read the [ADR workflow](../../skills/autonomous-development/references/architecture-decisions.md). For a new material choice, copy the [template](../../skills/autonomous-development/assets/adr-template.md), allocate the next unused number, draft alternatives and consequences, and follow the project's decision authority before changing status to Accepted. Minor fixes under an existing decision do not need another record.

ADRs describe rationale and intended design. Applicable project instructions and versioned contracts still govern execution; investigate disagreements rather than silently overriding them. Records are not proof of live AI quality or authorization to deploy. Preserve accepted rationale and use reciprocal links when a newer accepted record supersedes one.
