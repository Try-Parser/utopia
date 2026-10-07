# Resources and tools

Skills provide decision instructions; resources provide reusable inputs and deterministic execution; connected tools provide access to models and external systems. Installing one does not establish the other two.

| Capability | Bundled resource | Execution or connection |
| --- | --- | --- |
| Engineering delivery | [checkpoint contract](../skills/autonomous-development/references/checkpoint.md), [six roles](../agents/frank-coder.md), [craft standards](../skills/craftsman/SKILL.md) | Native assistant workers; Git; project's Docker/tests |
| Research | [evidence ledger](../skills/research-workflow/references/evidence-ledger.md), [primary-source catalog](research-sources.md) | Session web search/fetch or approved research connector |
| Design | [journey/state acceptance matrix](../skills/design-workflow/references/acceptance-matrix.md) | Browser verification, project's components/assets; optional Figma |
| AI evaluation | [schema and grading contract](../skills/ai-evaluation/references/evaluation.md), [synthetic examples](../examples/evals/README.md), offline scorer | Recipient-owned model access plus independently graded held-out outcomes |
| Shared knowledge | [global guidance](../templates/global-CLAUDE.md), [project guidance](../templates/project-CLAUDE.md), [scoped memory template](../templates/project-memory-MEMORY.md) | Fill with actual project commands and dated findings; no private memory copies |
| Tool verification | [proof command](../scripts/prove.py), [graphical report](verification/2026-10-07/report.md) | Docker; optional matplotlib only to redraw the chart |

Research/design templates travel inside their installed skill folders. Scorer and role copies are generated from canonical sources. Project templates remain in this distribution for recipients to fill and merge deliberately.

Read the [connection runbook](connections.md) for browser/model/design/source-control access and observed connection states. Missing API access, design libraries or real benchmark datasets cannot be replaced by a skill file. Do not treat a declared connection, sample dataset or mockup as observed external success.
