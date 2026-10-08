# Project development profile
Fill in these fields before substantive implementation or delivery. Remove unused fields; never put secrets here.

- Goal and repository boundaries: <allowed repositories and reference-only repositories>
- Architecture and contracts: <existing ADR index, accepted decisions and important interfaces; docs/adr/ if no convention exists>
- Local environment: <Docker/other configured environment, mount paths, launch instructions>
- Verification: <build, typecheck, focused regression, affected suite and runtime/E2E commands>
- Fixtures: <approved test data/authentication method; secret-store references only>
- Delivery: <local by default unless the user authorizes a specific target>
- Release runbook: <branch/PR policy, CI approvals, migration order, rollout, rollback and target journeys>
- Evidence directory: <outside repository; unique per task>

Use autonomous-development and craftsman. The project supplies concrete commands and release procedures; do not import another service's names, branches, ports or job assumptions. Scope UI/design approval requirements explicitly if the team has them.
