# 0011: Observe real agents through an autonomous office

Status: accepted for local implementation, 2026-10-12.

The user wants locally running agents visualized as coworkers moving through an IT department, with responsibilities and handoffs driving the scene. The player-controlled adventure remains an optional simulation interface; the default becomes an automatically observed office.

Merge native task events and detected process/adapter entries at the presentation layer, retaining separate identities and provenance. Do not join unrelated records by workspace or provider. Stable avatars route around furniture to explicitly reported department roles. Process presence populates the lobby without claiming task activity. Stored sessions remain inspectable without representing them as current workers.

Extend the authenticated in-memory heartbeat with optional bounded roles, opaque work references and idempotent handoff events. The owning workflow supplies these semantics; the observer cannot reliably derive them from process names, transcript prose or timestamps. Task references are hashed; no prompt, command, credential or transcript projection is added. Keep eighty handoff events for at most five minutes and animate only recent reports. External provider runtimes are never invoked.

This office displays the workflow rather than controlling it. A handoff does not launch a provider, grant editing permission, certify reviews or advance native tasks. Existing explicit mission submission remains the execution boundary. The illustrative workflow demonstrates automatic staff movement and task routing under a separate simulation label.

Validate metadata rejection, idempotency/conflict, expiry, privacy, bounded movement and source projections in Docker. Chromium journeys cover local arrival, stable role-driven avatars, explicit handoffs, native/discovery behavior and accessibility. Independent correctness, QA and security reviews apply to one frozen snapshot.

[0013](0013-local-session-tool-activity.md) extends placement with explicitly identified activity-derived departments from bounded structured local events; this office layout and explicit handoff decision remains in effect.
