# Resource-driven reference reconstruction

Status: implementation direction; actual visual comparison required.

The user explicitly requested imagegen resources from the generated reference and reconstruction based on them. The built-in image generator produced a character turnaround sheet, a nine-item furniture sheet and a six-cell material atlas, saved in assets/reference-resources-v1 with final prompts, dimensions and SHA256 provenance. Characters and furnishings are transparent raster modeling references, not downloadable rigged meshes. The material atlas is actual runtime albedo.

Use the character sheet to sculpt the stable native human/robot families, with Brim's navy swept hair, square glasses and orange office lanyard, and Sable's ivory helmet, blue oval eyes, round pods, twin antennas and chest orb. Use furniture-sheet silhouettes for pale-oak benches, rounded ivory supports, navy bucket chairs and branching ivory-pot foliage. Root host furnishings apply the same design to the reception counter, conference pedestals and navy/oak shelving. Actual session identity, joints, routes, waiting states and monitor ownership remain authoritative; no fictional scene staff.

The host loads one fixed1536x1024PNG, validates its dimensions and crops six swatches into bounded reusable512pxCanvasTextures: oak, plaster, stone, cloth, polymer and leaf. Polished3D maps them onto actual meshes; A/Cretain existing painted albedo, and missing/invalid new artwork uses procedural surfaces. Style switching reuses textures and terminal cleanup cancels handlers and disposes them. The cast has15bounded custom geometries/30face maps; interior retains3gallery geometries/6gallery textures and8unshadowed lights. Fixed static routes expose only the four checked-in resource files.

Visual8/kit3retain layout8four-place benches and the perspective18/290/35reference camera. Actual headfront/angled renders, office/reception/mobile/style screenshots and HTTP/albedo checks precede activation. Functional assertions and resource metadata alone cannot prove exact reference-art equality. Exact equality is not claimed.
