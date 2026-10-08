---
name: commit-pr-standard
description: Write precise commit messages and pull-request descriptions. Load before drafting a commit subject, PR title or PR description.
---
# Commit and PR standard

## Use and skip

Use when writing a commit subject/body or PR title/description. Implementation, research and status updates without those artifacts do not need this skill.
Use one logical change per commit. Write an imperative subject, at most 72 characters, with the repository's ticket prefix when applicable: `<TICKET> <area>: <summary>`. No trailing period or WIP/misc labels.

The body explains what changed and why in plain language, wrapped at 72 columns. Name compatibility changes, migrations, flags and rollout constraints when relevant. Omit conversation provenance, personal names, narrative and test transcripts. Use references and breaking-change trailers when appropriate. Follow the recipient's actual attribution policy; do not invent authors or model identities.

The PR title follows the subject rule. Its description has Summary (problem and resulting behavior), Changes (grouped meaningful changes), Testing (actual commands/results and brief manual steps when useful), and Notes (migration/rollout dependencies or limitations). Scale detail to the change and repository template. Link relevant tickets, decisions and paired PRs. Report missing verification honestly.

This skill supplies a writing format, not authorization to commit, publish or merge. Follow autonomous-development's final snapshot gate and the user's authorized target.

## Output

Return the ready-to-use text matching the repository format, with actual behavior and verification. Omit extra commentary. Do not invent issue IDs, authors, checks or delivery results.
