# Reference-directed office model kits

Status: accepted implementation direction; visual acceptance remains separate.

The concept board and the running office still differed after material and compositor work. The user explicitly rejected the old visible canvas again. New textures alone did not replace generic furniture, native characters or flat lighting.

Use separate local interior and native character model kits within the actual WebGL scene. The host retains authoritative desk/seat/monitor positions, navigation, camera, actor identity and reported activity. The interior kit builds rounded honey-wood/ivory desks, plush chairs, full foliage, distinct departmental wall galleries and two entrance-safe facade planter strips. Eight real warm unshadowed point lights provide local illumination. The character kit sculpts six stable human/robot families with different hair, clothes, faces, shells and accessories at the existing joint anchors. Existing illustrated/pixel direction sheets remain alternatives for those modes.

Both kits use host pooled primitives and finite family/role material caches. Rebuild releases references to the prior scene; terminal graphics lifecycle disposes owned face/gallery maps. New helper URLs remain fixed static routes. PointLight is an additional export of the same pinned local Three.js dependency, rebuilt in Docker, with no runtime network dependency.

Reference-kit.contract.json1 defines anchors and bounded scene details; visual contract6 retains physical layout7. Actual supported-browser screenshots, including close-ups, must be compared with the board. Functional checks and helper presence cannot establish that artwork matches. A concept image used as the office background would fail the existing 3D interaction requirements.

The explicit `?office=reference` launch selects the native polished 3D scene at the reference camera in memory. It leaves stored view, graphics and camera preferences intact; ordinary launches retain those preferences. Robot expression planes sit in front of the opaque visor panels; a GPU regression compares all six visible heads with their expression maps hidden.
