# AI Department

Use the canonical skills/autonomous-development/SKILL.md and skills/craftsman/SKILL.md for substantive work. Specialist instructions are canonical in agents/. Install project-scoped copies with scripts/install.py if named agent discovery is needed; don't maintain duplicate checked-in copies.

The main session owns the authorized target, performs focused discovery once, assigns disjoint builder ownership and freezes completed changes for three independent review lenses. Every reviewer issues an actual final-snapshot result. Apply at most two automatic fix rounds; no unbounded retries. Workers do not commit, push, merge, deploy or spawn workers.

Build/tests run in development Docker: docker compose run --rm tooling. Keep evidence outside source repositories. Use the risk, evidence, recovery and timing contracts in the autonomous skill. Select only relevant domain skills; pure questions don't require agent fan-out.

Do not export personal knowledge, account settings or transcripts. Model/tool access stays in local account configuration. The offline benchmark scores supplied evidence and cannot establish universal AI reliability.
