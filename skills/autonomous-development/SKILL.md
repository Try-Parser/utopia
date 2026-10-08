---
name: autonomous-development
description: Deliver substantive software features or fixes through scoped implementation, independent review and the authorized target. Skip ordinary questions, pure research, prose-only edits and isolated design exploration.
---

# Autonomous development

## Use and skip

Own substantive software implementation and unfinished engineering delivery. Questions/status, pure research, prose-only edits and design exploration use their own relevant workflow; follow repository review requirements when those artifacts change shared behavior.

## Essential flow

1. Confirm goal, observable acceptance, allowed repositories and delivery target. Discover actual branch/worktree/runtime and existing edits. Record impact tier and external checkpoint; preserve unrelated work.
2. Build within assigned scope using craftsman. Load design-workflow for affected UX, research-workflow for sourced investigations and ai-evaluation for AI behavior. Activate only necessary specialists through native workers; do not run a duplicate legacy pipeline.
3. Verify affected behavior in the configured development environment. Every required acceptance check must pass; failed, missing or required skipped checks block delivery. Builders own focused checks; QA owns final affected suites. Do not repeat identical tests merely to create another report.
4. Stage completed task changes and freeze source/index. For substantive engineering require independent correctness, QA and security on this snapshot at every tier. Smaller changes narrow their scope. Missing or failed reviews remain incomplete.
5. Combine blockers into one repair brief. After a fix, capture a fresh snapshot and obtain all three fresh delta attestations. Reuse performed checks only when QA verifies relevant input/runtime validity. Maximum two automatic fix rounds per unchanged approach, then diagnose and re-plan; never reset counters to hide looping.
6. Coordinator gates and performs authorized delivery. Commit/push/merge/deploy only within task authorization; verify committed and remote content matches the reviewed tree. Report actual results and limitations.

## Load mechanics when needed

For material architectural choices, read [architecture decisions](references/architecture-decisions.md) and use its portable template when the project has no ADR convention. Read existing decisions before changing the design; routine fixes reuse them.

Use [checkpoints](references/checkpoint.md) when recording or resuming work. Before freeze/gate/postcommit operations, read [delivery mechanics](references/delivery.md) and [review contracts](references/reviews.md) for helper commands, snapshot identity and evidence handling. For authorized deployments read [release](references/release.md) and the project's actual runbook. Do not load release instructions for local-only work.

For model-requested file access or Python test execution, load the [restricted tool gateway](references/tool-gateway.md). Its Docker boundary applies to routed calls, not every native assistant tool. Keep model access, credentials and approved connector configuration outside it.

Workers receive the canonical installed role references from references/agents; they do not commit, publish or spawn workers. Account access, tools and paid runs are not granted by this skill. Shared knowledge excludes credentials, private account settings and raw transcripts.

## Output

Lead with the delivered outcome and artifact link. Include relevant observed checks, exact delivery identity and material gaps. Report active/waiting time when requested or when investigating delays. Keep detailed logs in evidence artifacts; unit tests and synthetic fixtures do not establish live AI accuracy or deployed browser behavior.
