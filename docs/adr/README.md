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

Read the [ADR workflow](../../skills/autonomous-development/references/architecture-decisions.md). For a new material choice, copy the [template](../../skills/autonomous-development/assets/adr-template.md), allocate the next unused number, draft alternatives and consequences, and follow the project's decision authority before changing status to Accepted. Minor fixes under an existing decision do not need another record.

ADRs describe rationale and intended design. Applicable project instructions and versioned contracts still govern execution; investigate disagreements rather than silently overriding them. Records are not proof of live AI quality or authorization to deploy. Preserve accepted rationale and use reciprocal links when a newer accepted record supersedes one.
