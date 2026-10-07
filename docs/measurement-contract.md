# Measurement and tool-boundary contract

This contract defines the new portable helpers before implementation. Python's standard library remains the runtime. No helper invokes a model, sends traces to a service or changes assistant account permissions automatically.

## Predeclared benchmark

`scripts/benchmark.py prepare` creates a fresh external plan from a dataset, grading rubric and model configuration identity. The plan binds their SHA-256 hashes, campaign/producer/grader identities, expected trials per task and the statistical target. Producer and grader identities must differ. Finalization verifies those bindings against the actual dataset/rubric and imported result records before using the existing scorer.

Each imported trial retains the scorer schema and additionally declares datasetSha256, rubricSha256, modelConfigId, humanReviewed (true) and humanCalibrationId. Exactly the predeclared number of trials must exist for every task. Unknown, invalid, duplicate, missing or mismatched records block acceptance. Human review and provenance declarations are self-reported; hashes cannot prove honesty or that a dataset stayed held out. Public fixtures remain synthetic. No failed trial can be dropped to obtain a passing verdict.

The plan also predeclares humanCalibrationId; each trial binds campaignId. Canonical fabricated acceptance/accounting/denial vectors live in skills/ai-evaluation/references/measurement-golden-cases.json and are consumed by behavioral tests.

Golden acceptance cases: a complete 73-task genuine-declared fixture with matching bindings and independent human-reviewed records meets the scorer policy; a high-sample failed trial, extra/missing trial, changed rubric/dataset/model identity or absent human review rejects. Fabricated fixtures test the helper, not live quality.

## Content-free telemetry

`scripts/telemetry.py` provides a recorder and an offline summarizer for structured JSONL events. Allowed events are start, usage, tool, wait_start, wait_end and end. Records bind opaque taskId/runId, contiguous sequence and nondecreasing elapsedMs. Unknown fields, raw prompts, responses, tool arguments and credentials are rejected rather than silently logged. One nonoverlapping wait interval may be open; terminal events require it closed.

Usage follows the existing scorer's provider-convention normalization. Missing counters/cost remain unknown, including failed/retried runs. Reports distinguish wall time, recorded waiting and the remainder, usage coverage, actual tool/error/denial counts and terminal outcomes. The recorder observes its own monotonic clock; imported events are submitted evidence. It does not automatically instrument every assistant or establish savings.

Golden cases: inclusive cached/reasoning subsets are not double counted; exclusive counters normalize correctly; missing usage is unknown; overlapping/unclosed waits, altered sequence, decreasing time and unknown content fields reject; failed runs remain in summaries.

`scripts/control_panel.py` renders supplied telemetry and optional benchmark reports as standalone local HTML, with escaped text and no external scripts/assets. Display unknown usage distinctly from zero and show observed scope/limitations. It supplies a visible evidence panel, not a connected agent runtime or proof of optimization. HTML-injection and missing-data cases require regression coverage.

## Scoped Docker tool gateway

`scripts/safe_tools.py` accepts only read_file, list_files and run_tests requests through a strict JSON schema. Trusted operator configuration selects the project/image and timeout; model request fields cannot override it. Unknown tools or fields, absolute/traversal paths and secret-file paths deny before execution. No arbitrary shell command is accepted.

Each allowed request runs the canonical worker in a fresh Docker container with no network, read-only project/root filesystem, temporary scratch space, an unprivileged user, all capabilities dropped, no-new-privileges and memory/CPU/process limits. No host home, credentials or Docker socket is mounted. The operator must supply a sanitized project: executed tests can read its mounted files. The gateway protects calls routed through it; it does not restrict unrelated native assistant tools, malicious host operators, container-engine vulnerabilities or all prompt injection.

The worker independently validates requests and paths. Tests execute only a fixed Python unittest command in that container, with bounded duration and no raw test output persisted. Read results are bounded and returned to the caller, not recorded in telemetry. Failures/timeouts stay failures; denial is not evidence of model-level attack resistance.

Golden cases: allowed project text read succeeds; traversal, secret reads, symlink escape, arbitrary command, unknown fields and tool names deny. Actual Docker verification additionally checks no outbound connectivity, non-root identity, read-only project, absent host credential mounts and contained malicious test behavior. Adversarial fixtures are explicitly synthetic.
