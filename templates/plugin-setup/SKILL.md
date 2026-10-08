---
name: setup
description: Set up the AI Department plugin in a recipient workspace and check available skills, roles and development tools. Use after installation or when setup is requested.
---

# AI Department setup

Read `references/global-guidance.md` relative to this installed setup skill for this conversation. The packager supplies that file from canonical shared guidance. Respect existing repository instructions and the user's authorized scope; the plugin does not override them.

1. Explain the seven workflow skills and twelve specialist roles concisely. The sibling skill directories include their resources, helper scripts and ADR template. Claude Code discovers the bundled agents; Codex uses their definitions through autonomous-development/references/agents with native workers when supported and permitted.
2. Discover the recipient repository and development environment through read-only checks. Confirm Python 3.11+ for helpers and Docker for restricted tool execution when needed. Installing the plugin supplies instructions and files, not connected accounts or a running Docker gateway.
3. Route a sample user-provided task to the relevant sibling workflow: frank for routing, autonomous-development for delivery, craftsman for implementation standards, design-workflow for UX, research-workflow for research, ai-evaluation for measurement, commit-pr-standard for publication conventions. Follow each skill's use/skip rules. Claude commands use /ai-department:<skill>; in Codex select the installed skill from its picker.
4. Keep credentials, connections and account settings recipient-owned. Do not write root instructions, enable reporting, launch model calls, change permissions or install dependencies as a setup side effect. If persistent instructions are requested, prepare a minimal project-specific change for review using existing conventions.
5. Offer a small recipient smoke task using available tools. Report which checks actually ran and any missing capabilities. Do not claim model accuracy, tool restrictions or native handoffs were tested merely because files are present.

Return a concise readiness result: available skills, available tools, one next action. Load further role/workflow references only when the task needs them.
