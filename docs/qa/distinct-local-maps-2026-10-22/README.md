# Distinct local maps — 2026-10-22

The previous districts shared one 4×4 grid and differed mainly in height and colour. Local districts now have authored building footprints, street routes and landmarks. The default online city retains its authoritative collision layout.

| Map | Buildings | Structure | Gameplay screenshot |
| --- | ---: | --- | --- |
| Neon Core | 16 | Original balanced grid, 184 server-matching collision boxes | [View](procedural.png) |
| Sunset Harbor | 10 | Warehouse rows, freight apron, three gantry cranes, stacked containers, visible sea outside the playable boundary | [View](harbor.png) |
| Sky Gardens | 12 | Stepped perimeter buildings, open central park, trees, raised garden terraces, roof planting | [View](gardens.png) |
| Brick Quarter | 24 | Staggered terraces, narrow streets, market canopies and bell tower | [View](old-town.png) |
| Crown Skyline | 13 | Central 205m crown, eight satellite towers, outer towers and four solid elevated skywalks | [View](skyline.png) |

Street and zone rectangles drive both the main scene and world atlas. Rectangular warehouse footprints and solid landmarks appear in the atlas; the 3D minimap reuses the rendered surfaces and collision meshes. New districts start facing their landmark from a supported rooftop; existing saved positions are retained only when the existing safety validation accepts them.

[Harbor atlas](harbor-atlas.png) · [Validation results](results.json)

All commands listed in results.json passed. The production build retains Vite's large-chunk warning. Browser screenshots are viewport captures at 764×867, with full HUD and 3D minimap.
