# 0008: Local simulation and observed workflow checkpoints

Date: 2026-10-12
Status: Accepted
Task-execution exclusion superseded by [0009](0009-native-agent-world-tasks.md); simulation and checkpoint evidence rules remain in force.

## Context

The user requested a game-like graphical simulation that combines seeing agents work with assigning tasks. The toolkit has local workflow checkpoints and content-free submitted traces, but no automatic native-session event adapter or real task dispatcher. Existing local-evidence policy remains applicable.

## Decision

Build a dependency-free browser simulation with distinct, read-only observed checkpoint mode. Use the Python standard library for a loopback-only server, an asset allowlist, and bounded checkpoint metadata reads. Assignment controls apply only to simulated missions. Never claim simulated progress, review success, or character activity is measured agent performance.

Keep the application outside canonical skills and generated plugin assets: it is a local optional viewer, not another workflow runtime. Do not expose task payloads or publish local evidence. Model calls and native-session execution remain absent until a separately scoped adapter supplies authoritative events and execution controls.

## Alternatives

An always-live native execution bridge would require assistant account wiring and explicit task execution controls that do not exist in the current toolkit. A hosted dashboard would require secure access to local evidence and change the local-only evidence decision. A static illustration would not provide playable task assignment or actual checkpoint readback.

## Consequences

Users can play with task handoffs and inspect real recorded workflow states locally. They cannot launch actual agents from this version. Real per-agent activity and progress remain unknown, and the UI says so. Simulation results are illustrative even when the animation resembles the engineering workflow.
