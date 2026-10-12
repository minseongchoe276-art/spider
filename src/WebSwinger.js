import * as THREE from 'three';

export class WebSwinger {
  constructor(scene, character, city, soundController) {
    this.scene = scene;
    this.character = character;
    this.city = city;
    this.sound = soundController;

    // Web Anchor state
    this.isAttached = false;
    this.anchorPoint = new THREE.Vector3();
    this.ropeLength = 0;
    this.targetAnchor = null; // Currently aimed target

    // Visual Web Line (Glowing white spider-silk cylinder/line)
    this.createWebVisuals();

    // Visual Web Target Reticle (Holographic targeting reticle in 3D)
    this.createReticleVisual();

    // Raycaster for checking clear lines of sight to buildings
    this.raycaster = new THREE.Raycaster();
  }

  createWebVisuals() {
    // 3D Cylinder / Line for glowing web strand
    const webGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(6); // 2 points (x, y, z)
    webGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const webMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      linewidth: 3,
      transparent: true,
      opacity: 0.95
    });

    this.webLine = new THREE.Line(webGeo, webMat);
    this.webLine.visible = false;
    this.scene.add(this.webLine);

    // Web anchor impact flash (small glowing sphere at attachment point)
    const flashGeo = new THREE.SphereGeometry(0.7, 12, 12);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9
    });
    this.webImpactFlash = new THREE.Mesh(flashGeo, flashMat);
    this.webImpactFlash.visible = false;
    this.scene.add(this.webImpactFlash);
  }

  createReticleVisual() {
    const ringGeo = new THREE.RingGeometry(0.8, 1.1, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    });
    this.reticleMesh = new THREE.Mesh(ringGeo, ringMat);
    this.reticleMesh.visible = false;
    this.scene.add(this.reticleMesh);
  }

  findBestAnchor(camera) {
    const playerPos = this.character.position;
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);

    let bestAnchor = null;
    let bestScore = -Infinity;

    // 1. Search building rooftops and high corners
    const candidatePoints = [];

    // Check pre-computed rooftop points
    for (const pt of this.city.rooftopPoints) {
      if (pt.y > playerPos.y + 5) {
        candidatePoints.push(pt);
      }
    }

    // Also check tops and corners of nearby buildings
    for (const c of this.city.colliders) {
      const topY = c.topY;
      if (topY > playerPos.y + 5) {
        const center = c.center;
        const dist = Math.hypot(center.x - playerPos.x, center.z - playerPos.z);
        if (dist < 120) {
          // 4 corners of roof
          const hx = c.halfExtents.x;
          const hz = c.halfExtents.z;
          candidatePoints.push(new THREE.Vector3(center.x - hx, topY, center.z - hz));
          candidatePoints.push(new THREE.Vector3(center.x + hx, topY, center.z - hz));
          candidatePoints.push(new THREE.Vector3(center.x - hx, topY, center.z + hz));
          candidatePoints.push(new THREE.Vector3(center.x + hx, topY, center.z + hz));
          candidatePoints.push(new THREE.Vector3(center.x, topY, center.z));
        }
      }
    }

    for (const pt of candidatePoints) {
      const toPt = pt.clone().sub(playerPos);
      const dist = toPt.length();

      // Desirable distance: 20m ~ 95m
      if (dist < 15 || dist > 110) continue;

      const dirToPt = toPt.normalize();
      // Alignment with camera view direction
      const forwardDot = camDir.dot(dirToPt);

      // Must be roughly in front (fov cone)
      if (forwardDot < 0.2) continue;

      // Prefer points higher up and well-aligned with camera direction
      const heightBonus = (pt.y - playerPos.y) / 40;
      const angleScore = forwardDot * 3.5;
      const distScore = 1.0 - Math.abs(dist - 50) / 70;

      const score = angleScore + heightBonus + distScore;

      if (score > bestScore) {
        bestScore = score;
        bestAnchor = pt;
      }
    }

    return bestAnchor;
  }

  startSwing(camera) {
    const anchor = this.findBestAnchor(camera);
    if (!anchor) return false;

    this.anchorPoint.copy(anchor);
    this.ropeLength = this.character.position.distanceTo(this.anchorPoint);
    this.isAttached = true;
    this.character.isSwinging = true;

    // Web visual
    this.webLine.visible = true;
    this.webImpactFlash.position.copy(this.anchorPoint);
    this.webImpactFlash.visible = true;

    // Play iconic THWIP sound!
    this.sound?.playWebShoot();

    // Initial swing momentum boost if slow
    const horizSpeed = Math.hypot(this.character.velocity.x, this.character.velocity.z);
    if (horizSpeed < 14) {
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      camDir.y = 0;
      camDir.normalize();
      this.character.velocity.x += camDir.x * 12;
      this.character.velocity.z += camDir.z * 12;
    }

    return true;
  }

  releaseSwing(jumpBoost = false) {
    if (!this.isAttached) return;

    this.isAttached = false;
    this.character.isSwinging = false;
    this.webLine.visible = false;
    this.webImpactFlash.visible = false;

    // Slingshot Momentum release boost
    if (jumpBoost) {
      const speed = this.character.velocity.length();
      // Ascending launch boost
      this.character.velocity.y += Math.max(14, speed * 0.45);
      this.character.velocity.x *= 1.25;
      this.character.velocity.z *= 1.25;
      this.sound?.playJump();
    }
  }

  webZipToTarget(camera) {
    const anchor = this.findBestAnchor(camera);
    if (!anchor) return false;

    this.sound?.playWebShoot();

    // Pull directly towards anchor at super speed
    const dir = anchor.clone().sub(this.character.position).normalize();
    this.character.velocity.copy(dir.multiplyScalar(42));
    this.character.velocity.y += 8;

    this.releaseSwing(false);
    return true;
  }

  update(delta, input, camera, colliders) {
    // 1. Continually update target reticle
    this.targetAnchor = this.findBestAnchor(camera);
    if (this.targetAnchor && !this.isAttached) {
      this.reticleMesh.position.copy(this.targetAnchor);
      this.reticleMesh.lookAt(camera.position);
      this.reticleMesh.visible = true;
      // Pulse scale
      const s = 1.0 + Math.sin(Date.now() * 0.008) * 0.15;
      this.reticleMesh.scale.set(s, s, s);
    } else {
      this.reticleMesh.visible = false;
    }

    // 2. Physics swing integration if attached
    if (this.isAttached) {
      this.updateSwingPhysics(delta, input, camera, colliders);
    }
  }

  updateSwingPhysics(delta, input, camera, colliders) {
    const char = this.character;

    // Apply gravity
    char.velocity.y += char.gravity * delta * 0.85;

    // W key / Forward swing pump boost
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    camDir.y = 0;
    camDir.normalize();

    if (input.forward) {
      char.velocity.x += camDir.x * 24 * delta;
      char.velocity.z += camDir.z * 24 * delta;
    }

    // A / D steer during swing
    const camRight = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0, 1, 0)).normalize();
    if (input.left) {
      char.velocity.x -= camRight.x * 18 * delta;
      char.velocity.z -= camRight.z * 18 * delta;
    }
    if (input.right) {
      char.velocity.x += camRight.x * 18 * delta;
      char.velocity.z += camRight.z * 18 * delta;
    }

    // Aerodynamic forward assist (Spider-Man slices through the air)
    char.velocity.x *= (1 - delta * 0.1);
    char.velocity.z *= (1 - delta * 0.1);

    // Predict new position
    const newPos = char.position.clone().addScaledVector(char.velocity, delta);
    const offset = newPos.clone().sub(this.anchorPoint);
    const curDist = offset.length();

    // Pendulum constraint: If rope is taut
    if (curDist >= this.ropeLength) {
      const radialDir = offset.clone().normalize();
      
      // Project velocity along tangent to remove outward radial speed
      const radialVel = char.velocity.dot(radialDir);
      if (radialVel > 0) {
        char.velocity.subScaledVector(radialDir, radialVel * 1.02);
      }

      // Constrain position exactly to rope radius
      newPos.copy(this.anchorPoint).addScaledVector(radialDir, this.ropeLength);

      // Upward swing tension boost: as you swing below anchor, swing curves up
      if (radialDir.y < 0 && char.velocity.y < 0) {
        // Converting drop momentum into horizontal & forward speed
        const boost = Math.abs(char.velocity.y) * delta * 2.2;
        char.velocity.x += camDir.x * boost;
        char.velocity.z += camDir.z * boost;
      }
    }

    const prevY = char.position.y;
    char.position.copy(newPos);
    char.resolveCollisions(colliders, prevY);

    // If hits ground or rooftop, auto release
    if (char.isGrounded) {
      this.releaseSwing(false);
      return;
    }

    // Rotate character mesh towards movement trajectory and tilt into swing
    const speed = char.velocity.length();
    if (speed > 2) {
      const moveDir = char.velocity.clone().normalize();
      const targetYaw = Math.atan2(moveDir.x, moveDir.z);

      // Bank tilt (roll) towards anchor
      const toAnchor = this.anchorPoint.clone().sub(char.position).normalize();
      const bankAngle = THREE.MathUtils.clamp(-camRight.dot(toAnchor) * 0.6, -0.7, 0.7);

      char.mesh.rotation.y = targetYaw;
      char.mesh.rotation.z = bankAngle;
      char.mesh.rotation.x = THREE.MathUtils.clamp(moveDir.y * 0.5, -0.6, 0.6);
    }

    // Update web visual line
    const positions = this.webLine.geometry.attributes.position.array;
    // Spider-man's hand / chest pos
    const handPos = char.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    positions[0] = handPos.x;
    positions[1] = handPos.y;
    positions[2] = handPos.z;

    positions[3] = this.anchorPoint.x;
    positions[4] = this.anchorPoint.y;
    positions[5] = this.anchorPoint.z;

    this.webLine.geometry.attributes.position.needsUpdate = true;
  }
}
