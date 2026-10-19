# 0020: Switch graphics without replacing the live office

Status: Accepted for local implementation
Decision date: 2026-10-19
Owner: Local implementation coordinator
Extends: [0016](0016-webgl-office.md), [0017](0017-illustrated-office-employees.md)

## Context

The user wants all four proposed graphics directions available through a switch. Sessions, workstations, navigation, private questions and the camera must continue through changes in appearance.

## Decision

Keep one authoritative live office and a validated graphics preference defined by graphics.contract.json. Illustrated uses the original directional artwork; Polished uses volumetric employees and soft finishes; Pixel uses nearest-neighbor scene rendering; Modern low-poly uses faceted employees and matte finishes. Native UI text and speech remain independent of raster resolution.

Store only the finite style identifier in browser preferences. A style change invalidates the visual presentation key, preserving the physical navigation key, live actor objects, selected session, camera and connected monitors. Reuse bounded style material/geometry variants; dispose actor-owned and architecture-owned resources through existing lifecycle rules.

## Alternatives and consequences

- Separate simulations per style would duplicate state and risk losing real session activity during a switch.
- Static generated office backgrounds would not preserve interactive desks, movement, rotation or live monitors.
- Renderer presets keep the real office interactive. The concept board remains an art-direction guide, rather than a claim of exact raster-image reproduction.

SVG and Top-down remain available, with a visible SVG preview notice for volumetric styles when 3D is unavailable. Verification must inspect actual differences, repeated-switch resource stability, storage failure, mobile, camera/ownership continuity and existing interactions.
