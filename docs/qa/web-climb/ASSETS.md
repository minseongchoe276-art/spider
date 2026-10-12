# Downloaded VFX and climbing assets

- Kenney Particle Pack: https://kenney.nl/assets/particle-pack
  - Author-hosted download mirror: https://opengameart.org/content/particle-pack-80-sprites
  - CC0. Original license retained at public/textures/vfx/LICENSE.txt.
  - smoke_04.png -> dust.png; spark_06.png -> web-impact.png.
- Mesh2Motion human addon animation library:
  https://github.com/Mesh2Motion/mesh2motion-app
  - Source: static/animations/human-addon-animations.glb, downloaded 2026-10-11.
  - CC0 license retained at public/models/sources/LICENSE-CC0.md.
  - Local derivative retains the Climb Wall take and skeleton; materials/textures removed.
  - Original model: /public/models/sources/mesh2motion-climb.glb.
  - Runtime retargeted clip: /public/motions/wall.json (52 matching bones).

Web geometry is project-authored and updates reusable tube and fiber buffers.
The downloaded climbing torso motion is combined with facade contact IK;
unreachable contacts release instead of extending a limb beyond its length.
