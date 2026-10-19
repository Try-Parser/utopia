# 0021: Rebuild the office from the supplied visual reference

Status: Accepted for local implementation
Decision date: 2026-10-19
Extends: [0020](0020-switchable-office-graphics.md)

The four graphics presets preserved live state but retained a floor plan and furnishing scale that did not resemble the supplied concept board. The user explicitly requires the pictured scene design.

`reference-visual.contract.json` v3 and `office-layout.contract.json` v7 now define one actual navigable building with rear Planning/Design/Development, Conference and Cafe on the left, Review/QA/Security on the right, a central hallway and front reception with glass frontage. A public reception annex and Cafe lounge retain neutral sessions and departure destinations. Only Shared:0 uses the real counter; no fourth rear enclosure remains. Seventeen physical computers supply the pictured furnishing density, without creating fictional employees. Every added blocking prop has a matching collider. Directional doors connect rooms to public hallways; adjacent departments remain closed.

All four visual modes use the same composition and preserve real activity. Native warm oak, cream tile, plaster, trim, furniture, plants and lighting replace the earlier sparse grey arrangement. The reference camera uses yaw 305/elevation 40. Saved camera choices remain respected; the Reference view command restores that framing. Existing monitor geometry and session ownership remain authoritative.

Visual acceptance includes independent comparison of actual full-office and close-up screenshots with the concept board. Functional style-switching tests alone do not establish visual fidelity. The office remains interactive in three dimensions; the picture is not used as a populated backdrop, and employees appear only for actual sessions.
