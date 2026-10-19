# 0018: Department rooms connect through shared hallways

Status: Accepted for local implementation
Decision date: 2026-10-19
Owner: Local implementation coordinator
Extends: [0016](0016-webgl-office.md)

## Context

The user requests separate department rooms accessed through hallways. Open room sides and routes through adjacent departments do not represent that office structure. Arrivals also previously shared the unassigned workspace footprint.

## Decision

Version 4 of the office layout contract defines four-sided department enclosures with one hallway-facing doorway each. Two horizontal halls connect through an east hallway containing reception. Shared geometry supplies door openings, wall segments and corridor flooring to collision navigation and both renderers. Expanded rooms retain the same connections.

For each route, navigation permits entry only to its start and destination rooms. Other enclosed rooms cannot be used as transit space. Legitimate department changes and help visits still travel through the hallways. This is physical circulation, not a change to session permissions or provider execution.

## Alternatives and consequences

- Decorative walls alone would leave navigation able to shortcut through unrelated departments.
- Keeping reception inside Shared workspace would require arrivals to cross that private room.
- The added east hall widens the office by 160 world units. Existing furniture positions and employee proportions remain unchanged; camera framing uses the new world bounds.

Complete boundaries need side-aware cutaway rendering through every camera quadrant. Golden vectors and sampled route tests cover closed perimeters, door crossings, arrivals, expanded capacity and real route advancement. Cafe and breakout remain shared amenities.
