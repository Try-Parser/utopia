# 0012: Show task work on office computers

Status: accepted for local implementation, 2026-10-12.

The user explicitly requested both code changes and a live app preview on coworkers' computer screens. Workstation overlays project existing role/task evidence and open an accessible enlarged display. Native activity and answers remain text; external role metadata and simulation keep their own provenance.

Retain bounded, filtered relative file labels from native file-change events. A token-protected local reader exposes a bounded current workspace diff only for such a reported file. Do not provide arbitrary browsing, persist patches, expose private dot paths, follow aliases, or execute repository diff helpers. Current Git diffs can include earlier edits and carry that limitation. Binary/large/unavailable states are explicit. A generic animated editor would be easier but would not establish that the displayed changes are real.

Use one user-connected loopback HTTP iframe for actual app preview. It is sandboxed for scripts and its own origin, without top navigation, forms, popups or downloads. Restrict parent frame sources to loopback; reject credentials, remote hosts, non-HTTP schemes and the office server's own port. The URL stays in browser memory, and no preview server or remote fetch is automatically launched. A static mock page or screenshot would not show live app changes.

The display changes neither native edit authorization nor provider orchestration. Windows/paths, process limits, data projection and desktop/mobile iframe behavior require Docker tests and independent correctness, QA and security reviews before readiness.
