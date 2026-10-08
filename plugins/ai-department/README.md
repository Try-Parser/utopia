# Install the AI Department plugin

Version 0.1.1 packages seven workflow skills, twelve role definitions, six helper tools, ADR resources and a setup skill. The plugin is generated from the shared source; it is independent of a particular application or service.

## Claude Code

Run these commands inside Claude Code:

```text
/plugin marketplace add https://bitbucket.org/legalmatch/ai-department.git
/plugin install ai-department@ai-department
```

Select user scope for availability across projects, or project scope for one repository. Restart as prompted, then run `/ai-department:setup`. Start development with `/ai-department:autonomous-development` followed by your task. Use `/ai-department:design-workflow` for design or `/ai-department:research-workflow` for research. Bundled Claude agents appear under the plugin namespace.

## Codex

With a current Codex client supporting plugin marketplaces, register the repository:

```text
codex plugin marketplace add https://bitbucket.org/legalmatch/ai-department.git --ref main
codex plugin add ai-department@ai-department
```

Alternatively, in the ChatGPT desktop app's Codex Plugins Directory, refresh or restart, select the **AI Department** source and install **AI Department**. Run its setup skill, then choose the relevant skill from the installed skill picker. User installation makes the toolkit available across projects; each project's instructions and permissions still apply. Codex uses the packaged role references with its native workers; this package does not register twelve runtime agents automatically. Client capabilities and organization policies can affect availability. The two CLI commands were confirmed through local Codex 0.160.0 help; installation itself was not executed here.

For a local checkout, register its repository directory instead of the Git URL. Private Bitbucket access requires the recipient's existing Git authentication and repository permission. Credentials are not bundled. For clients without plugin support, use the repository's safe installer and getting-started guide.

If you installed the earlier marketplace, remove its old plugin and marketplace registration through the host controls, then register and install the new name. This avoids duplicate installations. Existing accounts and project settings remain recipient-owned.

## What installation provides

Skills include their references, assets and executable helper files. Installation does not start a service, configure third-party accounts, enforce a sandbox on every native AI tool, guarantee accuracy or activate background metrics. Python 3.11+ is needed when running Python helpers; restricted routed tools additionally need Docker and recipient configuration. Read the applicable workflow and tool runbook before execution.

Avoid installing copied versions of the same skills alongside the plugin unless you deliberately manage both. Plugin updates use the host's marketplace refresh/update controls; maintainers bump the manifest version when changing the published payload. Review changes before updating.

## Maintain and verify

Edit canonical `skills/`, `agents/`, helpers in `scripts/`, plugin metadata in `templates/plugin.json`, or setup instructions in `templates/plugin-setup/SKILL.md`. Review and update `templates/plugin-files.json` when adding or removing packaged source files. Unexpected files in skill or agent directories cause packaging to stop before copying them; keep local state elsewhere. Do not edit generated `plugins/ai-department/` files directly.

```text
python scripts/package_plugin.py --write
python scripts/package_plugin.py --check
docker compose run --rm tooling
```

Export a standalone folder with `python scripts/package_plugin.py --output <new-directory>`. The destination must not already exist. The allowlisted package excludes account state, credentials, task logs and personal memory. The repository checks detect package drift; native host installation and a real task still need recipient verification. Claude runtime checks were not executed in this Codex workspace.

Format and installation guidance checked 08 October 2026 against [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins), [Claude plugin manifests](https://code.claude.com/docs/en/plugins-reference) and [Claude marketplaces](https://code.claude.com/docs/en/plugin-marketplaces). This repository is a private team marketplace, not a listing in a public plugin directory.
