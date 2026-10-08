# Routing examples

These are expected routing decisions, not measured live-model results. Use them as recipient smoke prompts and check the assistant's actual choice and artifacts. A role is optional when the coordinator can complete the task directly; repository review requirements still apply to substantive changes.

| Request | Relevant skill | Avoid automatic activation |
| --- | --- | --- |
| What changed in the last commit? | Direct answer from the diff | Worker pipeline and broad web research |
| Fix a backend validation defect | autonomous-development + craftsman | design-workflow for a backend-only task |
| Review this function for correctness | craftsman and assigned reviewer | A second implementation/delivery pipeline |
| Run the existing unit suite and report failures | Configured test runner or assigned QA | research-workflow because the word verification appeared |
| Check the current release status in official documentation | research-workflow | Software implementation workers |
| Design a checkout journey prototype | design-workflow; designer when delegated | Backend/data references without affected contracts |
| Compare retrieval changes on held-out tasks | ai-evaluation; research/data roles only as needed | Treating ordinary test counts as AI accuracy |
| Write a PR description for this reviewed diff | commit-pr-standard | A fresh engineering pipeline solely to draft prose |

Check negative cases as well as successful activation. Evaluate real task completion, unnecessary tool/worker invocations and evidence quality; static examples cannot certify routing accuracy or token savings.
