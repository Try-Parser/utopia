# 0016: Render the live office as a local 3D scene

Status: Accepted for local implementation
Decision date: 2026-10-16
Owner: Local implementation coordinator
Supersedes: 0015 for the default office presentation
Extended by: [0017](0017-illustrated-office-employees.md) for illustrated employee surfaces

## Context

The user explicitly requested 3D after finding the projected SVG office unsatisfactory. The office must retain its local session observations, exact workstation ownership, department routing, conference seating and code/app inspection.

## Decision

Use a pinned, locally bundled Three.js WebGL renderer with a perspective camera. Physical x/y coordinates map to Three.js x/z; physical elevation maps to Three.js y. The existing world model owns movement and seating. The renderer creates furniture and employee meshes, lighting, depth and shadows; it never creates people, routes or provider activity.

Fit and center the camera using the actual viewport aspect and projected physical bounds, including height. Do not reuse the SVG scene bounds for the 3D viewport. All overlays project through the active 3D camera. The existing camera controller owns orbit, tilt and the unified scene zoom/pan; the WebGL canvas and DOM overlays share that transformation. There is no second OrbitControls controller. Computer previews map onto the physical monitor's projected corners and hide on its back face.

Keep SVG Top-down and the SVG isometric fallback for unavailable/lost WebGL. Provider discovery, permissions, transcript access and execution boundaries are unchanged. Assets are served locally under the existing content security policy; no CDN, runtime package manager or network dependency is added.

## Alternatives and consequences

- Continue projected SVG: preserves compatibility but does not fulfill the explicit 3D request.
- A separate game engine or new application: would duplicate authoritative source, routing and inspection behavior.
- Three.js with screen overlays: adds a pinned graphics dependency, resource lifecycle and browser GPU requirements; keeps existing interaction and accessibility routes.

The runtime remains Python plus browser JavaScript. The bundled renderer can be rebuilt separately using the vendor manifest. Three.js uses WebGL 2 ([official renderer documentation](https://threejs.org/docs/pages/WebGLRenderer)). Unsupported graphics must leave the office and evidence usable. Browser checks must execute the WebGL path, test mouse/touch cameras and fallback, and verify movement, seating, previews and all orbit quadrants.
