---
name: autonomous-development
description: Own substantive software development from scoped implementation through independent review and the authorized delivery target. Use for features, fixes and unfinished engineering delivery; ordinary questions need no agent pipeline.
---

# Autonomous development

Build on the existing Frank team and craftsman standards. The main session owns completion, evidence and delivery. Use the current assistant's native delegation/tools and supported session model. Claude agents inherit it; Codex workers receive the canonical specialist instructions. Do not run a second legacy ship/review pipeline on the same change.

## Scope once

Read the goal, acceptance criteria, authorization and repository instructions. Discover actual worktrees, branches, HEADs, existing edits, callers and configured runtime. Protect unrelated changes. Select the requested target (local or explicitly authorized environment) and preserve it on resume.

Classify behavioral risk, recording tier and reason. File count is context, not the classifier:

| Tier | Behavior | Review depth |
| --- | --- | --- |
| Small | Local behavior correction without persistence, shared contracts, trust boundaries or money/permission rules | Diff, relevant callers, focused regression and affected runtime journey |
| Medium | New surface or endpoint, wider feature, behavior across components | Contracts, integration/failure paths and affected suites |
| Large | Schema, authorization, payments, secrets, cross-repository rules or multi-feature release | Written contracts/threat cases, migration/rollback and broader affected suites |

Every substantive tier keeps independent correctness, QA and security; reduce their scope, not their number. Follow stricter repository requirements. Shared rules get one contract and common test vectors before parallel implementation; tiny local fixes do not need a large design document.

Create an external task-run directory. Use [checkpoints](references/checkpoint.md) for tier, reason, phase intervals, waits, acceptance, ownership and next action. Keep personal data, credentials and transcripts out.

## Build and integrate

Analyze the affected surface once and hand workers bounded briefs: goal, files, criteria, contracts, existing edits and evidence location. Builders have disjoint ownership. They do not commit, push, merge, deploy or spawn workers.

Apply craftsman. Builders own quick compile/type/focused regressions. QA owns final affected suite and runtime checks; don't independently repeat an identical suite merely to generate another report. Confirm mounted checkout and dependencies; application checks use the project's configured development Docker when required. Do not overlap builds against one checkout/container.

For UI work activate design-workflow when relevant, use existing components/tokens, and exercise actual interaction/states. For model/prompt/retrieval changes activate ai-evaluation and verify observed outcomes, not just generated prose. Research-workflow applies when source research is needed.

## Freeze and independently verify

Stage only completed task changes. Inspect source, index and untracked task files; stop source/index writes. Keep ignored task code/config out of ignored scope. Create a snapshot with scripts/evidence.py (paths below are relative to this skill):

```text
python <skill-directory>/scripts/evidence.py snapshot --repo <repository-root> --output <external-run>/snapshot.json
```

Give three distinct workers the snapshot, acceptance criteria, changed paths, risk and evidence directory. Read [review contracts](references/reviews.md).

- frank-reviewer: actual code/callers and correctness; read-only.
- frank-qa: final affected tests/runtime in the configured environment; no source/test edits during review.
- frank-security: reachable boundary, ownership, injection and exposure risks; read-only.

Claude agent definitions are installed into its native agents directory. For Codex, read the installed references/agents/<role>.md and pass that role to native workers. These copies come from canonical agents/, not a second policy source.

Collect actual responses in reviews.json. Missing/failed/partial/cancelled reviews are incomplete, never passed. Run the strict gate and inspect evidence: JSON structure is not proof of a test execution.

```text
python <skill-directory>/scripts/evidence.py gate --snapshot <external-run>/snapshot.json --reviews <external-run>/reviews.json
```

## Fix without redundant work

Wait for the in-flight lenses, triage concrete blockers, then send one combined fix brief. After a fix, create a fresh snapshot and all three reviewers issue fresh results for it. They inspect the delta and affected callers, referencing prior findings in basedOn; never relabel an old result's snapshotId.

QA may reuse performed checks only when their relevant source, configuration, dependencies, fixtures and runtime inputs remain valid. It assesses relevance to the final version and records provenance. Rerun affected checks for changed inputs; run broader suites when changed risk or repository rules require them. Keep the test rig across rounds when isolation remains sound.

At most two automatic fix rounds per unchanged approach. Remaining blockers require diagnosis and a materially changed plan, not reset counters or a fabricated pass. Cosmetic preferences do not justify another review loop; real behavioral/security failures do.

## Recover and deliver

Transient read/connectivity failures get at most two retries with short appropriate backoff, then diagnosis. Permission denial and deterministic failures need a decision or changed approach. Before retrying any mutation, reconcile its remote identity/result to avoid duplicate pushes/jobs/actions. Continue independent authorized work while blocked.

Resume from checkpoint and actual Git/remote state, never saved phase alone. Every long wait records a reason; unexplained elapsed time triggers a concise progress update and diagnosis.

For local delivery prove acceptance and final reviews. For an authorized release read [release](references/release.md) plus the actual project runbook. Gate immediately before coordinator commit. Then use postcommit to verify committed content equals the reviewed staged tree; a changed HEAD alone is not changed content. No force-push or gate bypass. Verify the delivered revision and target behavior.

Report changed behavior, actual checks, identities, elapsed work/wait and limitations. Never claim browser E2E from mocks/health checks or 95% accuracy from unit tests. Skills confer no unrelated repository, deployment, publication, messaging or payment authority.
