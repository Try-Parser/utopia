# 0015: Separate office movement from isometric game presentation

Status: Accepted for local implementation
Decision date: 2026-10-13
Recorded date: 2026-10-13
Owner: Local implementation coordinator
Supersedes: None
Superseded by: None

## Context

The user rejected the flat office diagram and requested a believable office game scene whose employees are actual AI agents. Actual local browser inspection showed tiny characters, flat workspace cards and no room depth. The existing observed-source, movement, workstation ownership and execution boundaries remain useful.

## Decision

Keep physical routing and station ownership in world coordinates. Use one pure sceneLayout projection for raised SVG furniture, actor feet, task packets, help links and upright monitor controls. The versioned projection and monitor placement are documented in the Agent World SPEC and tested with coordinate vectors. Add physical room wall rectangles to the movement model and render those same rectangles as raised walls with door gaps. Retain five circular desks per department, expansion for additional workers and the conference room.

The local visual implementation is adopted within the user's authorized UI correction; this records an engineering choice, not user approval of appearance. Phone camera starts close enough to view employees and permits scrolling or an explicit overview. No fictional employees, invented conversations or provider execution are introduced.

## Alternatives considered

- Restyle the flat diagram: the preceding live prototype was rejected and still lacked visual depth.
- Add a WebGL framework: would add dependencies and a larger runtime surface while existing movement and standard SVG can provide a cutaway game scene.
- Bake a raster background: would diverge from elastic departments and exact workstation geometry.

## Consequences

The movement model remains independently testable. All visual consumers must use the scene projection rather than mixing world and scene coordinates. Monitors remain upright and use exact physical screen rectangles. Camera changes need actual desktop/mobile/zoom verification. This remains a stylized isometric game scene; observation and native execution permissions are unchanged.

## Verification and review

See apps/agent-world/SPEC.md, office-model.js projection vectors and the real-API browser journeys. Local host desktop/mobile inspection confirms the scene loads with the existing live feed; final changed-scene regression and independent correctness, QA and security gates are required before delivery. Tests establish behavior, not subjective design approval or live model quality.

## Revisit when

User feedback requires a different camera or visual style, or the projection cannot meet interaction/performance requirements for supported team sizes.
