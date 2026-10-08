---
name: craftsman
description: Apply shared code quality standards while implementing or reviewing code. Use for code changes and code review; skip status questions, pure research and prose-only edits.
---

# Craftsman

## Use and skip

Use for implementation or review of code and technical contracts. Apply standards to the assigned scope and actual language/framework conventions. Pure research, status and prose-only edits do not need this skill. Interface design without code belongs in design-workflow.

## Core standards

- Prioritize correctness, security, full requested capability, maintainability and performance. Simplicity breaks ties between equally capable designs.
- Read relevant callers and neighboring patterns. Reuse established code; use clear names consistent with repository conventions and public contracts. Avoid unrelated renames and cleanup.
- Keep functions focused and failures explicit. Remove dead/duplicate code only where required by the change or explicitly requested. Preserve unrelated edits and behavior.
- Protect secrets, validate external input at its boundary, and enforce authorization/ownership for accessed data. Never treat a skill as permission for additional side effects.
- Verify affected behavior and meaningful failure paths in the configured development environment. Use autonomous-development for delivery ownership and independent review; this skill does not start another pipeline.

## Load conditional guidance

- For data access, query changes or performance work, read [data and performance](references/data-and-performance.md). Measure before declaring a bottleneck.
- For authentication, permissions, sensitive data, external inputs or execution boundaries, read [security boundaries](references/security-boundaries.md).
- For interface code, read [interface implementation](references/interface-implementation.md). Use design-workflow for substantial UX/design decisions.

Read only affected references; backend work does not need interface guidance. Existing repository instructions may impose additional checks.

## Output

Lead with changed behavior and relevant artifacts. Include actual verification and material risks or limitations; put detailed evidence in linked artifacts. Distinguish measurements from estimates and report missing checks honestly.
