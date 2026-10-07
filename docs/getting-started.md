# How to use the AI department

Give your AI assistant a clear task. It uses shared skills to follow the team's methods and assigns specialist roles when needed. You remain responsible for business decisions and access; the coordinator manages the work and reports actual evidence.

## Autonomous development flow

![Autonomous development from scoped request through independent review and bounded repairs to authorized delivery](autonomous-development-flow.png)

Open the [full autonomous pipeline PNG](autonomous-development-flow.png) or [vector SVG](autonomous-development-flow.svg). Read the [delivery process](autonomous-development.md) and [autonomous-development skill](../skills/autonomous-development/SKILL.md).

The separate [department image](workflow.png) and [department vector](workflow.svg) show [all twelve available roles](../skills/frank/references/department.md).

Download the [printable PDF guide](ai-department-guide.pdf) for setup, skills, department roles and resources.

## Set up once

1. Clone this repository and open a terminal in its folder. Install Python 3.11 or newer and Git. Have a working Claude Code or Codex account.
2. Choose global setup to reuse the department across projects, or project setup for one repository. Replace the placeholders below with real paths; quote paths containing spaces.
3. Run the preview command. It lists proposed files without changing your setup. Then use the apply command when ready.

Global setup:

```text
python scripts/install.py install --assistant both --scope user --target "<home-directory>"
python scripts/install.py install --assistant both --scope user --target "<home-directory>" --apply
```

One-project setup:

```text
python scripts/install.py install --assistant both --scope project --target "<project-root>"
python scripts/install.py install --assistant both --scope project --target "<project-root>" --apply
```

Use `--assistant codex` or `--assistant claude` if you use only one assistant. Installation conflicts are refused. Read the [backup and uninstall instructions](../README.md) before replacing existing files.

## Activate the guidance

The installer preserves your existing root instructions and account settings. Read the generated `.claude/ai-department.md` or `.codex/ai-department.md` inside the chosen target. Merge its shared guidance into the root instructions your assistant actually loads at that scope; keep existing instructions and resolve conflicts deliberately. Use your assistant's current instructions documentation to confirm its global instruction location.

Start a new session in your working project. Ask: "List the AI Department skills and role references you can actually access." Expect seven shared skills and twelve role definitions. Claude receives native agent definitions. Codex delegates native workers using the installed role references; these are not twelve automatically running agents. If assets are missing, inspect the install target and the assistant's discovery paths before assuming activation succeeded.

Keep common development methods global. Keep project commands, business rules, permissions and private knowledge in each project. Avoid duplicate project/global copies unless you deliberately manage which one takes precedence.

## Ask for work

Copy an example and fill in the details:

| Need | Example request |
| --- | --- |
| Build or fix | "Use autonomous-development to fix [problem] in [repository]. Success means [observable result]. Target is local. Preserve unrelated edits and verify in our development environment." |
| Design | "Use frank-designer and design-workflow to design [journey] for [users]. Reuse our components. Include mobile, loading, empty and error states, accessibility checks and a handoff for implementation." |
| Research | "Use frank-researcher and research-workflow to compare [tools]. Use dated primary sources. Consider our current stack, cost, latency, privacy and a measurable trial plan." |
| Evaluate AI | "Use ai-evaluation on [authorized held-out tasks]. Record actual outcomes, integrity checks, token/cost coverage and time. Separate synthetic demonstrations from live results." |

Say which repositories may change, what success looks like and whether delivery means local files, a branch push or an authorized deployment. Missing tool connections must be reported. Installing this toolkit does not connect Figma, enable CI, buy models or provide credentials.

## What happens next

The coordinator scopes your request and records impact tier. It loads specialist context only when needed; the coder implements and one QA owner coordinates final affected checks. For substantive engineering, separate correctness, QA and security workers review one staged, frozen version, including small changes with narrower scope. Findings become one repair brief. Each changed snapshot gets fresh attestations from all three lenses, while QA assesses reuse of valid executed test evidence. At most two automatic repair rounds precede diagnosis and replanning.

The coordinator delivers within your authorization. Local handoff can be the final target; authorized commits require postcommit verification against the reviewed tree, and authorized pushes require exact remote verification. Passing checks grants no automatic merge or deployment permission. Final reports start with the outcome, then include only relevant checks, delivery identity and remaining gaps.

Simple questions and small design corrections do not need every department role. Ask for status if needed: "Show the current phase, active work versus waiting, completed checks and remaining blockers." A passing suite proves its tested cases, not universal AI accuracy or security.
