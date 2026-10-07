# Autonomous development flow

This is the delivery process developers use for a feature, fix or unfinished engineering task. Start with the [autonomous-development skill](../skills/autonomous-development/SKILL.md); it owns the task from acceptance through the authorized target.

![Autonomous development pipeline, including independent checks and bounded repair loop](autonomous-development-flow.png)

Open the [full PNG](autonomous-development-flow.png) or [vector SVG](autonomous-development-flow.svg). The [department diagram](workflow.png) separately explains the available roles.

## Follow the process

1. Agree acceptance, allowed repositories and the authorized target. Inspect the actual branch, edits and runtime; preserve unrelated work.
2. Record small, medium or large behavioral impact and its reason. Load only needed context. Small substantive changes keep all three lenses with narrower review scope.
3. Build with disjoint file ownership and quick focused checks. One QA owner coordinates final affected Docker checks; avoid duplicate suites.
4. Stage completed changes, stop writers and freeze a snapshot. Keep evidence outside reviewed repositories. Ensure all task code/config is included in the reviewed Git scope.
5. Independent correctness, QA/coverage and security workers attest to that snapshot. The coordinator inspects their actual evidence and runs the gate.
6. Combine blockers into one repair brief. Each changed snapshot needs three fresh delta attestations. QA can reuse performed checks only when relevant code, configuration, dependencies, fixtures and runtime still match. Never relabel a stale verdict.
7. After at most two automatic fix rounds for the same approach, diagnose and replan. Record waits and next action; do not reset counters or repeat unchanged failures endlessly.
8. Deliver at the authorized target: local handoff, or authorized commit with postcommit tree verification, or authorized push with exact remote verification. Merge/deployment follow separate authorization and the project runbook.

Report the outcome first, then only relevant checks, delivery identity and remaining gaps. Keep status updates short; omit routine narration.

## Use only the context needed

The autonomous skill coordinates delivery; craftsman supplies standards and Frank supplies roles. Load research-workflow, design-workflow, ai-evaluation or commit-pr-standard only for their relevant task. Simple questions do not need the engineering pipeline.

Keep shared methods global and project commands, permissions and private knowledge local. Skills do not provide credentials or access. Native agent definitions are available roles, not twelve automatically running workers.

## Know the evidence boundary

The helper verifies Git state and commit mapping, not reviewer honesty or external services. UI journeys need browser evidence; AI quality needs measured held-out outcomes. This diagram and passing helper tests do not certify live speed or 95% integrity.

For installation and example requests, see [getting started](getting-started.md). For timing and test reuse, see [optimization](optimization.md). Regenerate the graphics with `python docs/render-autonomous.py` and the PDF with `python docs/render-guide.py` in an environment with matplotlib.
