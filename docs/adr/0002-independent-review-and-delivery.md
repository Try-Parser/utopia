# 0002: Frozen evidence and independent delivery reviews

Status: Accepted
Decision date: 2026-10-08
Recorded date: 2026-10-08
Owner: Delivery coordinator
Supersedes: None
Superseded by: None

## Context

Long review loops delayed small changes, while stale tests or mismatched snapshots could make passing results misleading.

## Decision

Scope verification by impact and freeze completed work before independent correctness, QA and security review for substantive engineering. All three lenses attest to the final snapshot. Batch blockers into one repair brief, allow at most two automatic fix rounds, and diagnose or replan if the approach stalls. QA may assess genuinely executed evidence for matching relevant inputs and runtime; it must not invent fresh execution.

Every required acceptance check must pass. The coordinator alone performs authorized delivery, verifies committed content against the reviewed tree and verifies remote identity after publication. Passing a gate does not grant delivery authority.

## Alternatives considered

- One agent approves its own implementation: would weaken independent scrutiny.
- Rerun every test and review from scratch after every edit: would add cost without checking whether evidence actually changed.
- Unlimited repair rounds: would hide design problems behind repeated retries.

## Consequences

- Small changes use narrow reviews and affected checks; wider contracts require deeper coverage.
- Snapshot identity and evidence bookkeeping add work but prevent stale approval.
- Missing reviews, failed checks and required skips block delivery.

## Verification and review

See the [delivery skill](../../skills/autonomous-development/SKILL.md), [review mechanics](../../skills/autonomous-development/references/reviews.md) and [evidence helper](../../skills/autonomous-development/scripts/evidence.py). Repository checks exercise these mechanics; a structured gate cannot prove a reviewer is truthful.

## Revisit when

Observed delay or escaped defects show that review scope, evidence reuse or the repair limit needs a measured change.
