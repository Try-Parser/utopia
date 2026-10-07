# AI development tooling: 07 October 2026

This shortlist combines current primary documentation with an independent Codex research challenge. It is a capability/release assessment, not a popularity ranking. No proposed integration below has been installed or connected by this research.

| Direction and tool | Evidence | Decision for this environment |
| --- | --- | --- |
| Focused skills and on-demand tool discovery | [OpenAI's September guidance](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra) recommends concise routing descriptions and loading supporting resources as needed. [Anthropic tool discovery](https://www.anthropic.com/engineering/advanced-tool-use) defers large tool libraries. | Improve context routing first. Vendor token benchmarks do not establish our savings. |
| Browser verification with Playwright CLI and skills | [Microsoft's Playwright MCP guidance](https://github.com/microsoft/playwright-mcp) recommends CLI plus skills for coding-agent efficiency while retaining MCP for richer persistent exploration. | Pilot against the already exercised MCP using identical journeys; compare tokens, time and successful assertions. |
| Agent tracing and evaluations with Langfuse | [Official documentation](https://langfuse.com/docs) covers traces, cost/latency and experiments; [self-hosting](https://langfuse.com/self-hosting) offers deployment options. | Limited tracing pilot to locate expensive retries and waiting. Local Compose is not a production HA/backup solution; define retention, redaction and access first. |
| Adversarial evaluation with Promptfoo | [Current quickstart](https://www.promptfoo.dev/docs/red-team/quickstart/) covers injection/privacy testing and CI integration; [configuration](https://www.promptfoo.dev/docs/red-team/configuration/) controls providers. | Pilot on authorized fixtures. Requires Node at least 22.22.0, newer than the observed local 22.20.0. Configure attack and grading providers explicitly; local execution does not imply local data processing. |
| Connected design context with Figma MCP | [Figma documentation](https://developers.figma.com/docs/figma-mcp-server/) exposes components, variables, layouts and canvas workflows; approved-client restrictions apply. | Designer uses existing resources now. Pilot Figma only after verifying client eligibility and account access; keep private designs inside approved boundaries. |
| Background agents and event-driven workflows with Cursor | [September releases](https://cursor.com/changelog) add project coordination and shipping tools. [Bitbucket documentation](https://prod.cursor.com/docs/integrations/bitbucket) supports Cloud Agents and Bugbot for Bitbucket Cloud in public beta. | Controlled comparison, not a runtime replacement. Account setup and actual behavior remain untested here; Rollouts compatibility is a separate question. |

Evidence of broader movement exists: a [June 2026 Codex usage study](https://arxiv.org/abs/2606.26959) reports active-user growth above fivefold during the first half of 2026. This describes that provider's populations, not market-wide tool rankings.

## Adoption contract

Keep service-independent skills and resources canonical; each developer connects optional tools locally. Pin pilot versions, record environment and relevant inputs, and retain a rollback path. Avoid adding another orchestration framework unless an observed requirement needs it.

Compare baseline and candidate on the same held-out tasks with independent outcome grading. Record task success, critical/integrity failures, actual usage/cost coverage, active and waiting time, retries, and end-to-end latency including p95 when sample size permits. Missing measurements stay unknown. Inspect security findings and permission/data exposure before promotion. Reuse the ai-evaluation contract rather than counting retries as independent tasks.

The aspiration is complete accuracy and integrity for agreed tasks, with explicit speed budgets, scoped standards and security requirements. Finite trials cannot guarantee universal 100% accuracy or security. A passed test suite is evidence for those cases; standards compliance requires an identified standard, scope and assessment. No live-model accuracy, token reduction or production speed improvement has been established by this shortlist.
