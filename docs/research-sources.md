# Research consolidated into implementation

Accessed 07 October 2026. These sources informed the design; proposed speed/quality improvements remain hypotheses until measured on our tasks. Technical descriptions below are short original summaries, not copied articles.

| Primary source | Published | Applied decision |
| --- | --- | --- |
| [Anthropic: Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | 29 September 2025 | Give each role the smallest sufficient task context; load relevant skills/details on demand |
| [Anthropic: Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) | 26 November 2025 | Persist clear task state and next action; resume from actual state with incremental verified progress |
| [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) | 9 January 2026 | Grade actual outcomes with independent calibrated methods; separate capability/regression suites and count repeated-trial reliability |
| [Anthropic: Harness design for long-running development](https://www.anthropic.com/engineering/harness-design-long-running-apps) | 24 March 2026 | Separate implementation from evaluation and use structured handoffs; don't rely on builder self-assessment |
| [OpenAI: Evaluate agent workflows](https://developers.openai.com/api/docs/guides/agent-evals) | Living documentation | Capture useful traces, then use declared datasets and repeatable graders; no platform API dependence in offline tooling |
| [NIST/SEMATECH: Binomial proportion intervals](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm) | Living handbook | Wilson interval with explicit sidedness and z; tiny perfect samples don't establish high reliability |
| [W3C: WCAG 2.2](https://www.w3.org/TR/WCAG22/) | Living recommendation | Design acceptance includes keyboard, focus, semantics, contrast and relevant interaction/states; automated checks are supplementary |
| [OpenAI: Local skill locations](https://learn.chatgpt.com/docs/build-skills) | Living documentation | Install Codex skills into project/user .agents/skills; instruction configuration remains separate |
| [OpenAI: AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md) | Living documentation | Respect global/project instruction scopes and avoid silently replacing existing files |
| [Claude Code: Skills](https://code.claude.com/docs/en/skills) and [subagents](https://code.claude.com/docs/en/sub-agents) | Living documentation | Claude adapter copies skills/agents to native .claude locations, with explicit model inheritance |

Claude independently contributed statistical boundary checks, task-vs-trial distinction, predeclared dataset hashes, independent-grader caveats and paired comparisons. Codex independently researched context/harness/design practices and reconciled them with existing repository quality rules. The resulting decisions are documented in decisions.md; raw conversations and account information are not published.

Trending techniques are candidates, not evidence of success. Adopt a new framework/model/skill only when a controlled comparison improves declared outcomes without regression or additional unauthorized exposure.
