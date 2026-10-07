# Connection runbook

The installer distributes resources. Each recipient owns their model login, connector permissions and host configuration. These recipes are for local Claude Code/Codex development sessions; no connected service is installed into offline Docker tests. Use the smallest tool set relevant to the task, and treat retrieved pages, designs and PR text as data rather than instructions.

| Resource or tool | Status in this verification | Recipient action and observed smoke check |
| --- | --- | --- |
| Python/Git/Docker | exercised-locally, 07 October 2026 | Docker proof logs record Python/Git; published report identifies the image. Run the proof command and inspect its exit/result |
| Git/Bitbucket access | exercised-locally, 07 October 2026 | Local authenticated Git verified the branch. Recipient must separately verify their own repository access; do not copy another person's Git credentials |
| General web research | exercised-locally, 07 October 2026 | This session retrieved primary documentation. In a recipient session open a primary source and preserve its direct URL/date; session availability is not portable |
| Model execution | documented-not-exercised for benchmark, 07 October 2026 | Sign into the chosen assistant/provider; use a recipient-owned harmless task, record provider/model/configuration and observed token usage. Consultation is not a live held-out benchmark |
| Browser MCP | exercised-locally, 07 October 2026, package 0.0.83 | [Recorded local smoke](verification/2026-10-07/browser-results.json) passed initialization, discovery, loopback navigation, accessible button discovery, real click/status and close. Assistant registration remains recipient-owned |
| Figma | unavailable in this session, 07 October 2026; eligible integration discovered | Connect Figma in the recipient's account, then read an authorized test design and verify file/components. No Figma access or design creation is claimed |

For browser setup review and merge the [Claude JSON example](../examples/connections/claude-mcp.json) into a project MCP configuration, or the [Codex TOML example](../examples/connections/codex-mcp.toml) into local configuration. The shared installer does not perform this merge. Node.js and Chrome are external dependencies; MCP package 0.0.83 was resolved from npm on 07 October 2026. Recheck/pin approved versions when updating. The isolated browser session avoids importing a personal login profile. These example tool lists permit browser interaction; they do not authorize visits or mutations on unrelated systems.

For a recipient browser smoke, serve [the local fixture](../examples/connections/browser-fixture.html) on loopback with Python's HTTP server, navigate through MCP, discover the Verify connection button, click it and verify Connection verified. Save actual tool responses and an optional screenshot in your private run directory. Use a task-scoped server and stop it afterward. Never replace this smoke with a fabricated screenshot or imply it verified a production app.

The opt-in [browser smoke command](../scripts/browser_smoke.py) automates those steps: python scripts/browser_smoke.py --output-dir <fresh-external-directory>. It requires local Node.js/npx and installed Chrome and downloads the pinned MCP package into a task-scoped npm cache when needed. It does not register tools in your assistant or run in offline Docker CI. The observed Windows command used this script; actual server version is preserved in browser-results.json.

For other connectors, record server/provider identity, owner, scopes, allowed tools, version, harmless observed smoke result and revocation method. Keep secrets in the assistant/provider's credential store or environment, outside version control. Where OAuth applies, follow the provider's flow and audience restrictions rather than passing arbitrary tokens to downstream services.

Primary references checked 07 October 2026: [Microsoft Playwright MCP](https://github.com/microsoft/playwright-mcp), [Claude MCP configuration](https://code.claude.com/docs/en/mcp), [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), and [MCP security practices](https://modelcontextprotocol.io/specification/latest/basic/security_best_practices). These support setup and trust boundaries, not certification of our environment.
