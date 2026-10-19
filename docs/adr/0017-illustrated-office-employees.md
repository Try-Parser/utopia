# 0017: Illustrated employees inside the 3D office

Status: Accepted for local implementation
Decision date: 2026-10-16
Owner: Local implementation coordinator
Extends: [0016](0016-webgl-office.md)

## Context

The user rejected rounded procedural people and requested the drawn chibi characters in their illustrated office reference. Office geometry, camera rotation, observed sessions, routes and workstation ownership must keep working.

Loading correction: actual browser instrumentation demonstrated that a ten-second abort could cancel HTTP200 metadata body parsing during a slow first render and permanently retain generic employees. A loading deadline now selects a temporary native representation while the single local request can complete. Late valid metadata/images recover normally; errors and disposal remain terminal. The renderer owns no retry queue or additional asset URLs. The focused browser regression holds metadata and all six images past their deadlines, then verifies recovery and transport cancellation on disposal.

## Decision

Render original transparent directional employee artwork on depth-tested camera-facing surfaces inside the existing 3D scene. Keep three human and three robot designs, selected by stable session identity. Each sheet contains four directional views and idle/blink/walking/seated typing poses. Actual actor state selects animation; motion preferences still apply. Sprite anchors follow physical worker positions and seated workspace offsets. No fictional employees or conversations are introduced.

Use one shared image texture/material per design and actor-owned geometry with frame UVs. Validate local metadata and dimensions, explicitly allowlist asset paths, and retain the procedural body during loading or asset failure. Dispose actor geometries when actors leave and cached character resources on permanent graphics loss or unload. Keep SVG as the existing non-WebGL presentation.

Keep each drawing upright on worldY and turn it only toward the camera azimuth. Applying camera pitch to the drawing would lean its head into the physical chair back. Preserve real depth occlusion and floor anchors rather than drawing employees above all furniture.

## Alternatives and consequences

- More detailed procedural 3D heads still retain the visual treatment the user rejected.
- A fixed illustrated office background would lose interactive geometry, real movement and camera rotation.
- Directional illustrated surfaces match the requested drawing medium while preserving a genuine 3D office. Characters are illustrated surfaces rather than volumetric sculptures; view changes select one of four authored directions.

The six designs can repeat for simultaneous sessions; identity remains the actual session label. Generated artwork is original and reference-directed, not a claim of pixel-identical source recovery. Local browser verification must inspect chair fit, all orbit quadrants, real state transitions, reduced motion, asset failure and mobile usability. No provider, discovery, transcript or execution permission changes are part of this decision.
