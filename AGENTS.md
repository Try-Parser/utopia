# AI Department workspace

Develop the shared environment from canonical skills/ and agents/. Read skills/autonomous-development/SKILL.md for substantive engineering and skills/craftsman/SKILL.md for code/design. Use native Codex agents; read the corresponding role in agents/ before delegation. Do not execute Claude workflows as an implementation dependency. Explicit user requests to consult Claude are read-only discussion tasks, separate from verification.

For substantive changes require independent correctness, QA and security on one frozen snapshot. Scale review depth by behavioral risk. All three lenses re-attest to the final snapshot after changes; prior test evidence is reusable only with matching relevant inputs and QA assessment. Maximum two automatic fix rounds. Coordinator alone commits/pushes/releases after gates.

Run tests in the development Docker environment: docker compose run --rm tooling. No model API calls or credentials are required for repository tests. Preserve unrelated changes and never copy private memory, local account settings, credentials or transcripts into this repository.

Python standard library is the runtime. scripts/install.py owns installation; skills/autonomous-development/scripts/evidence.py owns snapshot/gate/postcommit/state; scripts/evaluate.py scores provided evaluation records. Run python scripts/check.py in Docker. Changes to these helpers require behavioral regression tests.

No main-branch merges, production deployments or external messages are implied by passing checks. Record exact verification and publication identities. Architecture and workflow decisions belong in docs/decisions.md.
