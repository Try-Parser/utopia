# AI Department

A shared AI development environment built from our current Frank agents and skills, optimized for engineering, research, design and evidence-based AI evaluation. Works with Claude Code and Codex without copying private account settings or service-specific release configuration.

The foundation keeps our four core skills, adds three targeted domain skills and expands the six original Frank roles into twelve department roles, including a dedicated designer. It provides a safe installer, strict review/commit evidence, task timing and offline benchmarking. Smaller changes get smaller review scope; substantive engineering still keeps independent correctness, QA and security.

## Autonomous development flow

![Autonomous development: scoped task, focused checks, frozen snapshot, three independent reviews, bounded fixes and authorized delivery](docs/autonomous-development-flow.png)

Open the [full autonomous pipeline PNG](docs/autonomous-development-flow.png) or [vector SVG](docs/autonomous-development-flow.svg) if the inline image does not display. Read the [step-by-step process](docs/autonomous-development.md) and its [owning skill](skills/autonomous-development/SKILL.md).

Context loads only when needed. One QA owner coordinates affected checks; small substantive changes keep three independent review lenses with focused scope. Every required check must pass; failures, missing checks or reviews and required skips block delivery. Blockers become one repair brief, with at most two automatic fix rounds before diagnosis and replanning. Delivery stops at the authorized local or remote target.

## Observed verification

See the [current observed tool demonstration](docs/verification/2026-10-08-measured/report.md) and the visual panel preview below. These are actual tool/fixture checks; live AI accuracy, token savings and production speed remain unmeasured.

Earlier results remain in the [historical verification report](docs/verification/2026-10-07/report.md), [chart](docs/verification/2026-10-07/verification.png) and [machine-readable archive](docs/verification/2026-10-07/results.json).

The [department expansion checks](docs/verification/2026-10-07-department/report.md) verify the current twelve-role installation and global user-scope lifecycle. The archived chart describes its recorded earlier source inputs.

Use the [resource catalog](docs/resources.md), [connection runbook](docs/connections.md) and [optimization guide](docs/optimization.md) to turn skills into repeatable work with actual tools and evidence.

See the [department roles and handoffs](skills/frank/references/department.md) and [current tooling research](docs/tooling-landscape-2026-10.md). Extra roles run only when needed; installing role definitions does not prove live AI performance.

Start with the [plain-language setup and usage guide](docs/getting-started.md).

Download the [PDF guide](docs/ai-department-guide.pdf) to share or print.

## Measure, protect and inspect

![Current AI department architecture: shared toolkit, assistant adapters, coordinator, specialists, tools and local evidence](docs/department-architecture.png)

Visuals refreshed 08 October 2026. Open the [architecture PNG](docs/department-architecture.png) or [SVG](docs/department-architecture.svg). Background metrics uploads are deferred; evidence remains local.

The shared [measurement runbook](skills/ai-evaluation/references/measurement.md) provides predeclared benchmark plans, independent human-review bindings, content-free token/time traces and a standalone HTML control panel. The [restricted tool gateway](skills/autonomous-development/references/tool-gateway.md) enforces scoped file access and Python test requests in isolated Docker containers. Both assistant adapters receive identical canonical helpers.

These are executable foundations for a Jarvis-style department, not a connected personal assistant. Native sessions need deliberate adapter wiring; model accounts, private tasks and human grading remain recipient-owned. The gateway protects routed calls rather than unrelated native tools. Live accuracy and efficiency still require observed campaigns.

See the [observed tool smoke and downloadable control panel](docs/verification/2026-10-08-measured/report.md). The panel contains actual fixture-tool timing and an observed allowed/denied call pair, with unknown model usage kept visible.

![Static preview of observed local evidence: run outcomes, tool calls, elapsed time and unknown model measurements](docs/evidence-panel-preview.png)

This [PNG preview](docs/evidence-panel-preview.png) is rendered from the published fixture summary, rather than a browser screenshot or live dashboard.

## Department roles and handoffs

![How the AI department works: request, coordinator, specialists, implementation, independent checks and delivery](docs/workflow.png)

## Start

Architecture choices are recorded in the [numbered ADR index](docs/adr/README.md). The shared [ADR guide](skills/autonomous-development/references/architecture-decisions.md) and [template](skills/autonomous-development/assets/adr-template.md) install with both assistant adapters. Existing [decision history](docs/decisions.md) remains available.

Prerequisites: Python 3.11+ and Git; a working Claude Code/Codex account for actual AI work; Docker for this repository's checks. The toolkit never installs credentials or selects a paid model.

Clone this repository and preview installation into your project:

```text
python scripts/install.py install --assistant both --scope project --target <project-root>
python scripts/install.py install --assistant both --scope project --target <project-root> --apply
```

Default is dry-run. Existing conflicts are refused; --replace with --apply backs up originals. Updates preserve those originals, and uninstall restores them only when owned installed files remain unchanged:

Applied operations acquire one target-wide OS lock before planning. Concurrent writers wait briefly or refuse without changing assets; crashes release the lock. The small .ai-department/install.lock file remains after uninstall so waiting processes retain the same lock identity. Do not remove it while installers are running.

```text
python scripts/install.py uninstall --assistant both --scope project --target <project-root>
python scripts/install.py uninstall --assistant both --scope project --target <project-root> --apply
```

For personal cross-project use set --scope user and --target to your own home directory. Project/user paths use .claude/skills and .claude/agents for Claude, .agents/skills for Codex. Ownership/backups stay under .ai-department within the explicit target. Files are copied, not symlinked; Windows paths with spaces work when quoted.

Global setup uses the same installer with user scope:

```text
python scripts/install.py install --assistant both --scope user --target <home-directory>
python scripts/install.py install --assistant both --scope user --target <home-directory> --apply
```

Replace the placeholder with your own home directory and quote paths containing spaces. Global skills/role references are available across projects after assistant discovery in a new session. Root global instructions still require the manual import described below. Keep shared methods global; retain project business rules, environment commands, permissions and private memory at project scope. Avoid installing duplicate copies at both scopes unless you deliberately manage precedence; project copies can shadow later global updates.

Installer writes shared guidance into .claude/ai-department.md and .codex/ai-department.md. Manually import/merge it into your existing CLAUDE.md/AGENTS.md at the chosen scope; root instructions and account configuration are intentionally preserved. Fill templates/project-CLAUDE.md with your actual environment/commands/runbook, and use templates/project-memory-MEMORY.md for scoped knowledge. Native instruction/discovery paths were verified against official documentation on 07 October 2026; see docs/research-sources.md.

Start a new assistant session in the target project and confirm seven skills and twelve Frank role definitions are available. Claude roles are native agent definitions; Codex uses native workers given the installed skill-contained role references. Account access, browser tools and third-party plugin availability require a recipient smoke check; deterministic installation tests cannot prove live model behavior.

## Work

| Task | Relevant skill |
| --- | --- |
| Feature, fix or unfinished delivery | autonomous-development + craftsman |
| Specialist routing/engineering partner | frank |
| Commit or PR text | commit-pr-standard |
| Source-backed investigation/AI approach comparison | research-workflow |
| UI/UX, accessible states and prototypes | design-workflow |
| Prompt/model/retrieval/agent quality measurement | ai-evaluation |

Use a concrete brief: goal, allowed repositories, observable acceptance, environment and delivery target. Example: “Use autonomous-development to correct this layout. Target: local. Preserve unrelated edits. Verify keyboard behavior and long content in our development Docker environment.”

Read [practical workflows](docs/workflows.md), [decisions](docs/decisions.md), [sources](docs/research-sources.md) and [optional integrations](docs/integrations.md).

## Verify without wasted work

The autonomous skill includes snapshot, gate, postcommit and state commands. Keep evidence outside reviewed repositories. Three actual final-snapshot results are required; the coordinator inspects supporting evidence. Relevant performed tests may be reused when QA confirms unchanged inputs/runtime; stale verdicts cannot be relabeled.

Record tier/reason and active/waiting phases with the state CLI. Bound retries, batch fixes and preserve the requested target. Passing a JSON gate is not proof of tests, deployed behavior or truthful review.

## Require every check to pass; measure AI quality honestly

```text
python scripts/evaluate.py --dataset examples/evals/dataset.json --results examples/evals/results.jsonl
```

The demonstration intentionally exits 1: synthetic data never certifies live accuracy. Acceptance requires 100% of declared tasks and every supplied trial to pass, complete valid results, independent grading and all integrity checks passing. The measured quality target is **99%**: the lower two-sided Wilson bound must reach 0.99, using a separate 95% confidence level. At zero failures the statistical minimum is 381 distinct held-out tasks. The 100% requirement covers observed checks, not every future AI answer. See the [evaluation contract](skills/ai-evaluation/references/evaluation.md).

## Development checks

```text
docker compose run --rm tooling
```

The development image has Python and Git; the repository is mounted read-only and tests use temporary projects/repos. python scripts/check.py runs source/skill/reference/privacy checks and all helper tests without model calls. Bitbucket Pipelines uses the same Docker definition; it must be enabled in repository settings separately if the team wants CI.

Canonical content lives in skills/ and agents/. Installation generates copies for the assistant; don't hand-edit generated copies as a second source. No live home configuration changes occur while developing this repository.
