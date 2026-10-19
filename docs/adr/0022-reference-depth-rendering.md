# 0022: Paint and shade the actual reference office

Status: Accepted for local implementation
Decision date: 2026-10-19
Owner: Local implementation coordinator
Extends: [0020](0020-switchable-office-graphics.md), [0021](0021-reference-office-composition.md)

The user rejected actual renders after multiple furnishing corrections because the graphics still differed from the concept board. Keep physical layout7 and all live observations. Change the art pipeline rather than adding another room rearrangement.

Use original reference-directed oak, cream stone, ivory wall and leafy-window artwork mapped onto real meshes. Add a bounded local compositor that shades the actual depth buffer: illustrated mode gains warm contact depth and geometry ink; polished mode gains softer grounding. Pixel and low-poly retain their direct rendering behavior. Render-art.contract.json defines style behavior, resource limits, fallback and invariants. Extend only the exports of the existing pinned Three.js package and rebuild its local bundle in Docker; add no CDN or runtime build requirement.

One reusable HDR target/depth texture and composite material preserve transparency and output color management. Native speech, private questions and real app iframes remain independent and sharp. The effect never changes cameras, monitor projections, actors or tasks. Unsupported graphics render directly, with an honest diagnostic; that fallback cannot stand in for testing the supported effect. Dispose owned targets, textures and material on lifecycle shutdown.

A static populated office image would lose true rotation and actual-session furniture interaction. More generic mesh adjustments did not achieve the requested artwork. The compositor and material artwork change the rendered appearance while preserving the actual3D world, but visual fidelity still requires comparison of real full-office and close-up captures against the supplied board. Functional tests alone cannot approve that objective.

The first actual zoomed captures exposed a logical-versus-physical viewport defect and loss of source geometry antialiasing. Contract2 requires target-pixel viewport binding and a same-pass alpha-aware FXAA resolve. Real GPU marker/edge-alpha comparisons at multiple renderer pixel ratios must supplement source-state and unit checks. Existing native overlays remain authoritative, and a rendered scene that drifts from them is a blocker.
