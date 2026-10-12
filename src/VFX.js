import * as THREE from 'three';

// High-performance pooled VFX manager:
// 1. One draw call for textured points particles (web impacts, landing dust, debris sparks)
// 2. Pre-allocated pool of ground shockwave rings (RingGeometry + circle_03_a shader)
// 3. Pre-allocated pool of secondary compression rings (circle_05_a shader)
// 4. Pre-allocated pool of ground crack decals (scorch_01_a decal with polygon offset)
// 5. Pre-allocated pool of 3D upward air blast cones
// Optimized for zero runtime allocation during gameplay.
export class VFXManager {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.trailBudget = 0;

    const count = 640;
    this.particleCount = count;
    const geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);
    this.sizes = new Float32Array(count);
    this.opacities = new Float32Array(count);
    this.kinds = new Float32Array(count);

    for (const [name, array, itemSize] of [
      ['position', this.positions, 3],
      ['color', this.colors, 3],
      ['particleSize', this.sizes, 1],
      ['particleAlpha', this.opacities, 1],
      ['kind', this.kinds, 1]
    ]) {
      geometry.setAttribute(name, new THREE.BufferAttribute(array, itemSize).setUsage(THREE.DynamicDrawUsage));
    }

    const fallback = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    fallback.needsUpdate = true;

    this.textures = {
      dust: fallback,
      web: fallback,
      spark: fallback,
      shockRing: fallback,
      glowRing: fallback,
      scorch: fallback
    };

    const uniforms = {
      dustMap: { value: fallback },
      webMap: { value: fallback },
      sparkMap: { value: fallback },
      viewportHeight: { value: 800 }
    };

    this.pointsMesh = new THREE.Points(geometry, new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      vertexShader: `
        attribute float particleSize;
        attribute float particleAlpha;
        attribute float kind;
        uniform float viewportHeight;
        varying vec3 tint;
        varying float alpha;
        varying float effectKind;
        void main() {
          vec4 p = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * p;
          gl_PointSize = clamp(particleSize * viewportHeight * projectionMatrix[1][1] / (2.0 * max(0.1, -p.z)), 0.0, 160.0);
          tint = color;
          alpha = particleAlpha;
          effectKind = kind;
        }
      `,
      fragmentShader: `
        uniform sampler2D dustMap;
        uniform sampler2D webMap;
        uniform sampler2D sparkMap;
        varying vec3 tint;
        varying float alpha;
        varying float effectKind;
        void main() {
          vec2 uv = gl_PointCoord;
          vec4 tex;
          if (effectKind < 0.5) {
            tex = texture2D(webMap, uv);
          } else if (effectKind < 1.5) {
            tex = texture2D(dustMap, uv);
          } else {
            tex = texture2D(sparkMap, uv);
          }
          float radial = 1.0 - smoothstep(0.3, 0.5, length(uv - 0.5));
          float opacity = tex.r * tex.a * alpha * radial;
          if (opacity < 0.005) discard;
          gl_FragColor = vec4(tint, opacity);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `
    }));
    this.pointsMesh.frustumCulled = false;

    for (let i = 0; i < count; i++) {
      this.positions[i * 3 + 1] = -9999;
      this.particles.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        color: new THREE.Color(),
        life: 0,
        maxLife: 1,
        size: 1,
        kind: 0,
        gravity: 0,
        drag: 0
      });
    }
    this.scene.add(this.pointsMesh);

    // Initialize Shockwave Ring Mesh Pool
    this.ringPool = [];
    const ringGeo = new THREE.RingGeometry(0.04, 1.0, 64);
    ringGeo.rotateX(-Math.PI / 2); // default normal faces +Y
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          map: { value: fallback },
          color: { value: new THREE.Color(0.9, 0.96, 1.0) },
          opacity: { value: 1.0 },
          progress: { value: 0.0 }
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D map;
          uniform vec3 color;
          uniform float opacity;
          uniform float progress;
          varying vec2 vUv;
          void main() {
            vec4 tex = texture2D(map, vUv);
            vec2 c = vUv - 0.5;
            float dist = length(c) * 2.0;
            float innerFade = smoothstep(0.0, 0.15 + 0.65 * progress, dist);
            float edgeFade = 1.0 - smoothstep(0.85, 1.0, dist);
            float alpha = tex.a * tex.r * innerFade * edgeFade * opacity * (1.0 - progress * 0.75);
            if (alpha < 0.005) discard;
            vec3 col = mix(color, vec3(1.0), (1.0 - progress) * 0.5);
            gl_FragColor = vec4(col, alpha);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.ringPool.push({
        active: false,
        mesh,
        mat,
        age: 0,
        maxAge: 0.5,
        startScale: 0.2,
        endScale: 4.0,
        baseOpacity: 1.0
      });
    }

    // Initialize Secondary Glow Ring Pool
    this.glowRingPool = [];
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          map: { value: fallback },
          color: { value: new THREE.Color(0.85, 0.88, 0.92) },
          opacity: { value: 0.6 },
          progress: { value: 0.0 }
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        side: THREE.DoubleSide,
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D map;
          uniform vec3 color;
          uniform float opacity;
          uniform float progress;
          varying vec2 vUv;
          void main() {
            vec4 tex = texture2D(map, vUv);
            float alpha = tex.a * tex.r * opacity * (1.0 - progress);
            if (alpha < 0.005) discard;
            gl_FragColor = vec4(color, alpha);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.glowRingPool.push({
        active: false,
        mesh,
        mat,
        age: 0,
        maxAge: 0.6,
        startScale: 0.3,
        endScale: 5.0,
        baseOpacity: 0.6
      });
    }

    // Initialize Ground Crack Decal Pool
    this.decalPool = [];
    const decalGeo = new THREE.PlaneGeometry(1, 1);
    decalGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: fallback,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        color: new THREE.Color(0.18, 0.16, 0.15),
        opacity: 0.9
      });
      const mesh = new THREE.Mesh(decalGeo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.decalPool.push({
        active: false,
        mesh,
        mat,
        age: 0,
        maxAge: 2.2,
        baseOpacity: 0.85
      });
    }

    // Initialize 3D Air Blast Cone Pool
    this.conePool = [];
    const coneGeo = new THREE.CylinderGeometry(1.0, 0.25, 0.8, 32, 1, true);
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          color: { value: new THREE.Color(0.92, 0.96, 1.0) },
          opacity: { value: 0.4 },
          progress: { value: 0.0 }
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 color;
          uniform float opacity;
          uniform float progress;
          varying vec2 vUv;
          void main() {
            float verticalFade = sin(vUv.y * 3.14159);
            float alpha = verticalFade * opacity * (1.0 - progress);
            if (alpha < 0.005) discard;
            gl_FragColor = vec4(color, alpha);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `
      });
      const mesh = new THREE.Mesh(coneGeo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.conePool.push({
        active: false,
        mesh,
        mat,
        age: 0,
        maxAge: 0.3,
        startScale: 0.3,
        endScale: 3.2,
        baseOpacity: 0.35
      });
    }

    // Load actual textures if running in browser
    if (typeof document !== 'undefined' && document.createElementNS) {
      const loader = new THREE.TextureLoader();
      const loadTex = (url, cb) => {
        loader.load(url, tex => {
          tex.generateMipmaps = true;
          cb(tex);
        }, undefined, () => console.warn('VFX texture unavailable:', url));
      };

      loadTex('/textures/vfx/smoke_04_a.png', tex => {
        uniforms.dustMap.value = tex;
        this.textures.dust = tex;
      });
      loadTex('/textures/vfx/web-impact.png', tex => {
        uniforms.webMap.value = tex;
        this.textures.web = tex;
      });
      loadTex('/textures/vfx/spark_01_a.png', tex => {
        uniforms.sparkMap.value = tex;
        this.textures.spark = tex;
      });
      loadTex('/textures/vfx/circle_03_a.png', tex => {
        this.textures.shockRing = tex;
        for (const ring of this.ringPool) ring.mat.uniforms.map.value = tex;
      });
      loadTex('/textures/vfx/circle_05_a.png', tex => {
        this.textures.glowRing = tex;
        for (const ring of this.glowRingPool) ring.mat.uniforms.map.value = tex;
      });
      loadTex('/textures/vfx/scorch_01_a.png', tex => {
        this.textures.scorch = tex;
        for (const decal of this.decalPool) {
          decal.mat.map = tex;
          decal.mat.needsUpdate = true;
        }
      });
    }

    // Temporary math helpers to avoid allocations
    this._tempV1 = new THREE.Vector3();
    this._tempV2 = new THREE.Vector3();
    this._tempQ = new THREE.Quaternion();
    this._tempUp = new THREE.Vector3(0, 1, 0);
  }

  // Generic particle spawner (supports web impact: 0, landing dust: 1, debris/spark: 2)
  spawn(pos, count, kind) {
    let remaining = count;
    for (const p of this.particles) {
      if (p.active) continue;
      if (remaining-- <= 0) break;
      p.active = true;
      p.pos.copy(pos);
      p.life = 0;
      p.kind = kind;
      const angle = Math.random() * Math.PI * 2;
      if (kind === 1) {
        // Landing dust cloud
        const speed = 1.2 + Math.random() * 3.5;
        p.vel.set(Math.cos(angle) * speed, 0.35 + Math.random() * 1.5, Math.sin(angle) * speed);
        p.pos.y += 0.08;
        p.color.setRGB(0.68, 0.64, 0.58);
        p.size = 0.35 + Math.random() * 0.55;
        p.maxLife = 0.5 + Math.random() * 0.5;
        p.gravity = 0.5;
        p.drag = 3.2;
      } else if (kind === 2) {
        // High speed sparks & debris
        const speed = 4.0 + Math.random() * 8.0;
        p.vel.set(Math.cos(angle) * speed, 1.0 + Math.random() * 3.5, Math.sin(angle) * speed);
        p.pos.y += 0.1;
        p.color.setRGB(1.0, 0.85, 0.55);
        p.size = 0.12 + Math.random() * 0.18;
        p.maxLife = 0.3 + Math.random() * 0.35;
        p.gravity = 9.8;
        p.drag = 1.5;
      } else {
        // Web impact
        const speed = 0.5 + Math.random() * 1.8;
        p.vel.set(Math.cos(angle) * speed, (Math.random() - 0.5) * 2, Math.sin(angle) * speed);
        p.color.setRGB(0.86, 0.93, 1.0);
        p.size = 0.07 + Math.random() * 0.12;
        p.maxLife = 0.15 + Math.random() * 0.18;
        p.gravity = 1.5;
        p.drag = 4.0;
      }
    }
  }

  spawnWebImpact(pos) {
    this.spawn(pos, 16, 0);
  }

  spawnLandingDust(pos) {
    this.spawn(pos, 22, 1);
  }

  // Superhero landing shockwave VFX with physical impact scaling and ground normal alignment
  spawnLandingShockwave(pos, impact, normal = this._tempUp) {
    // Normal walking or gentle hop (< 8) generates no shockwave
    if (impact < 8) {
      if (impact > 4.5) this.spawn(pos, 3, 1);
      return;
    }

    const norm = normal.clone().normalize();
    const up = this._tempUp;
    const alignQuat = new THREE.Quaternion().setFromUnitVectors(up, norm);

    // Compute tangent & bitangent on ground plane for surface-aligned dust ejection
    let ref = Math.abs(norm.y) < 0.9 ? up : new THREE.Vector3(1, 0, 0);
    const tangent = new THREE.Vector3().crossVectors(norm, ref).normalize();
    const bitangent = new THREE.Vector3().crossVectors(norm, tangent).normalize();

    // Normalized impact factor: 0.0 at impact 8, 1.0 at impact 38+
    const t = THREE.MathUtils.clamp((impact - 8) / 30, 0, 1);

    // 1. Primary Expanding Shockwave Ring (circle_03_a)
    const ring = this.ringPool.find(r => !r.active) || this.ringPool[0];
    ring.active = true;
    ring.age = 0;
    ring.maxAge = 0.36 + t * 0.22;
    ring.startScale = 0.25;
    ring.endScale = 2.2 + t * 5.2; // 2.2m up to 7.4m radius
    ring.baseOpacity = 0.75 + t * 0.25;
    ring.mesh.position.copy(pos).addScaledVector(norm, 0.035);
    ring.mesh.quaternion.copy(alignQuat);
    ring.mesh.scale.setScalar(ring.startScale);
    ring.mesh.visible = true;

    // 2. Secondary Compression Ring (circle_05_a, for medium-high impacts)
    if (impact > 16) {
      const glow = this.glowRingPool.find(g => !g.active) || this.glowRingPool[0];
      glow.active = true;
      glow.age = 0;
      glow.maxAge = 0.44 + t * 0.24;
      glow.startScale = 0.35;
      glow.endScale = 3.0 + t * 5.8;
      glow.baseOpacity = 0.5 + t * 0.35;
      glow.mesh.position.copy(pos).addScaledVector(norm, 0.025);
      glow.mesh.quaternion.copy(alignQuat);
      glow.mesh.scale.setScalar(glow.startScale);
      glow.mesh.visible = true;
    }

    // 3. Ground Crack Decal (scorch_01_a, for strong impacts)
    if (impact > 18) {
      const decal = this.decalPool.find(d => !d.active) || this.decalPool[0];
      decal.active = true;
      decal.age = 0;
      decal.maxAge = 1.8 + t * 1.4;
      decal.baseOpacity = 0.75 + t * 0.2;
      const decalScale = 1.4 + t * 2.4;
      decal.mesh.position.copy(pos).addScaledVector(norm, 0.015);
      // Random rotation around ground normal for variety
      const randomYaw = new THREE.Quaternion().setFromAxisAngle(norm, Math.random() * Math.PI * 2);
      decal.mesh.quaternion.copy(alignQuat).premultiply(randomYaw);
      decal.mesh.scale.set(decalScale, decalScale, 1);
      decal.mat.opacity = decal.baseOpacity;
      decal.mesh.visible = true;
    }

    // 4. 3D Upward Blast Cone (for severe superhero impacts)
    if (impact > 24) {
      const cone = this.conePool.find(c => !c.active) || this.conePool[0];
      cone.active = true;
      cone.age = 0;
      cone.maxAge = 0.26 + t * 0.12;
      cone.startScale = 0.4;
      cone.endScale = 2.0 + t * 3.2;
      cone.baseOpacity = 0.3 + t * 0.3;
      cone.mesh.position.copy(pos).addScaledVector(norm, 0.2);
      cone.mesh.quaternion.copy(alignQuat);
      cone.mesh.scale.set(cone.startScale, 0.8 + t * 0.8, cone.startScale);
      cone.mesh.visible = true;
    }

    // 5. Radial Ground Dust Burst along surface plane
    const dustCount = Math.floor(18 + t * 45); // 18 to 63 particles
    let remainingDust = dustCount;
    for (const p of this.particles) {
      if (p.active) continue;
      if (remainingDust-- <= 0) break;
      p.active = true;
      p.pos.copy(pos).addScaledVector(norm, 0.06);
      p.life = 0;
      p.kind = 1;
      const angle = Math.random() * Math.PI * 2;
      const radialSpeed = 2.5 + t * 7.5 + Math.random() * (2.0 + t * 3.0);
      const upwardSpeed = 0.25 + Math.random() * (0.8 + t * 1.5);
      const radialDir = new THREE.Vector3()
        .addScaledVector(tangent, Math.cos(angle))
        .addScaledVector(bitangent, Math.sin(angle));
      p.vel.copy(radialDir).multiplyScalar(radialSpeed).addScaledVector(norm, upwardSpeed);
      p.color.setRGB(0.70 + Math.random() * 0.08, 0.65 + Math.random() * 0.06, 0.58 + Math.random() * 0.05);
      p.size = 0.35 + Math.random() * 0.45;
      p.maxLife = 0.55 + Math.random() * (0.45 + t * 0.35);
      p.gravity = 0.6;
      p.drag = 3.0;
    }

    // 6. Flying Debris / Sparks
    if (impact > 14) {
      const sparkCount = Math.floor(8 + t * 24); // 8 to 32 sparks
      let remainingSparks = sparkCount;
      for (const p of this.particles) {
        if (p.active) continue;
        if (remainingSparks-- <= 0) break;
        p.active = true;
        p.pos.copy(pos).addScaledVector(norm, 0.1);
        p.life = 0;
        p.kind = 2;
        const angle = Math.random() * Math.PI * 2;
        const speed = 5.0 + t * 12.0 + Math.random() * 6.0;
        const upVel = 1.5 + Math.random() * (3.0 + t * 4.0);
        const radialDir = new THREE.Vector3()
          .addScaledVector(tangent, Math.cos(angle))
          .addScaledVector(bitangent, Math.sin(angle));
        p.vel.copy(radialDir).multiplyScalar(speed).addScaledVector(norm, upVel);
        // Golden fiery spark or concrete shard
        if (Math.random() < 0.65) {
          p.color.setRGB(1.0, 0.85, 0.45);
        } else {
          p.color.setRGB(0.9, 0.82, 0.75);
        }
        p.size = 0.1 + Math.random() * 0.15;
        p.maxLife = 0.25 + Math.random() * 0.3;
        p.gravity = 12.0;
        p.drag = 1.2;
      }
    }
  }

  update(delta) {
    this.pointsMesh.material.uniforms.viewportHeight.value = typeof window === 'undefined'
      ? 800
      : window.innerHeight * Math.min(window.devicePixelRatio || 1, 2);

    // 1. Update points particles
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.active) {
        p.life += delta;
        if (p.life >= p.maxLife) p.active = false;
        if (p.active) {
          p.vel.multiplyScalar(Math.exp(-p.drag * delta));
          p.vel.y -= p.gravity * delta;
          p.pos.addScaledVector(p.vel, delta);
          const t = p.life / p.maxLife;
          this.positions.set(p.pos.toArray(), i * 3);
          this.colors.set(p.color.toArray(), i * 3);
          if (p.kind === 1) {
            // Landing dust: expands dramatically as it slows down
            this.sizes[i] = p.size * (1.0 + t * 2.4);
            this.opacities[i] = Math.sin(Math.min(1.0, t * 4.0) * Math.PI / 2) * (1.0 - t) * 0.45;
          } else if (p.kind === 2) {
            // Sparks: small bright streaks
            this.sizes[i] = p.size * (1.0 - t * 0.4);
            this.opacities[i] = (1.0 - t) * 0.95;
          } else {
            // Web impact
            this.sizes[i] = p.size * (1.0 - t * 0.45);
            this.opacities[i] = Math.sin(Math.min(1.0, t * 5.0) * Math.PI / 2) * (1.0 - t) * 0.85;
          }
          this.kinds[i] = p.kind;
        }
      }
      if (!p.active) {
        this.positions[i * 3 + 1] = -9999;
        this.sizes[i] = 0;
        this.opacities[i] = 0;
      }
    }
    for (const attribute of Object.values(this.pointsMesh.geometry.attributes)) {
      attribute.needsUpdate = true;
    }

    // 2. Update Primary Shockwave Rings
    for (const ring of this.ringPool) {
      if (!ring.active) continue;
      ring.age += delta;
      const progress = ring.age / ring.maxAge;
      if (progress >= 1.0) {
        ring.active = false;
        ring.mesh.visible = false;
        continue;
      }
      // Ease out cubic expansion
      const ease = 1.0 - Math.pow(1.0 - progress, 3);
      const currentScale = THREE.MathUtils.lerp(ring.startScale, ring.endScale, ease);
      ring.mesh.scale.setScalar(currentScale);
      ring.mat.uniforms.progress.value = progress;
      ring.mat.uniforms.opacity.value = ring.baseOpacity;
    }

    // 3. Update Secondary Glow Rings
    for (const glow of this.glowRingPool) {
      if (!glow.active) continue;
      glow.age += delta;
      const progress = glow.age / glow.maxAge;
      if (progress >= 1.0) {
        glow.active = false;
        glow.mesh.visible = false;
        continue;
      }
      const ease = 1.0 - Math.pow(1.0 - progress, 2.5);
      const currentScale = THREE.MathUtils.lerp(glow.startScale, glow.endScale, ease);
      glow.mesh.scale.setScalar(currentScale);
      glow.mat.uniforms.progress.value = progress;
      glow.mat.uniforms.opacity.value = glow.baseOpacity;
    }

    // 4. Update Ground Crack Decals
    for (const decal of this.decalPool) {
      if (!decal.active) continue;
      decal.age += delta;
      const progress = decal.age / decal.maxAge;
      if (progress >= 1.0) {
        decal.active = false;
        decal.mesh.visible = false;
        continue;
      }
      // Stay fully visible for first 35% then fade out smoothly
      const fadeProgress = progress > 0.35 ? (progress - 0.35) / 0.65 : 0;
      decal.mat.opacity = decal.baseOpacity * (1.0 - fadeProgress * fadeProgress);
    }

    // 5. Update 3D Air Blast Cones
    for (const cone of this.conePool) {
      if (!cone.active) continue;
      cone.age += delta;
      const progress = cone.age / cone.maxAge;
      if (progress >= 1.0) {
        cone.active = false;
        cone.mesh.visible = false;
        continue;
      }
      const ease = 1.0 - Math.pow(1.0 - progress, 2);
      const currentRadius = THREE.MathUtils.lerp(cone.startScale, cone.endScale, ease);
      cone.mesh.scale.set(currentRadius, cone.mesh.scale.y, currentRadius);
      cone.mat.uniforms.progress.value = progress;
      cone.mat.uniforms.opacity.value = cone.baseOpacity;
    }
  }
}
