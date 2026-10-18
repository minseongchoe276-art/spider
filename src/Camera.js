import * as THREE from 'three';

export class ThirdPersonCamera {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    // Spherical coordinates
    this.yaw = 0;
    this.pitch = 0.16; // gentle downward view, without the steep action-game tilt
    this.distance = 5.8;
    this.targetDistance = 5.8;
    this.collisionDistance = 5.8;
    this.minDistance = 2.4;
    this.maxDistance = 8.0;

    // Follow smoothing
    this.targetPos = new THREE.Vector3();
    this.currentPos = new THREE.Vector3();
    this.lookAtTarget = new THREE.Vector3();

    // FOV Dynamics
    this.baseFov = 64;
    this.maxFov = 76;
    this.firstPersonFov = 72;

    // Camera roll (banking)
    this.roll = 0;

    // Camera Shake
    this.shakeIntensity = 0;
    this.sensitivity=1;this.invertY=false;this.shakeStrength=.5;this.speedFov=1;this.followStrength=1;

    // Aim Mode
    this.isAiming = false;
    this.mode = 'follow';
    this.modeOrder = ['close', 'follow', 'swing', 'first'];
    this.isRecentering = false;
    this.recenterYaw = 0;
    this.lockBehind = true;
    this.orbitReturnTime = 0;

    // Raycaster for building collision prevention
    this.raycaster = new THREE.Raycaster();
    this.probeRadius = 0.32;
    this.boomSide = 0;
  }

  safeDistance(center, direction, distance, meshes, cityRaycast = null) {
    if (!meshes.length && !cityRaycast) return distance;
    const right = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, direction).normalize();
    let safe = distance;
    for (const [x, y] of [[0,0],[-1,-1],[1,-1],[-1,1],[1,1]]) {
      this.raycaster.set(center.clone().addScaledVector(right, x * this.probeRadius)
        .addScaledVector(up, y * this.probeRadius), direction);
      this.raycaster.far = distance + this.probeRadius;
      const origin=this.raycaster.ray.origin;
      // A camera probe often starts close to/inside a triangulated city mesh.
      // Non-solid rays seek the actual surface instead of returning a false
      // zero-distance hit that collapses the camera onto the player.
      const streamedHit=cityRaycast?.(origin,direction,distance+this.probeRadius,false);
      // A collider hit may be behind a newly visible LOD surface. Choose the nearer one.
      const visualHit = this.raycaster.intersectObjects(meshes, true)[0];
      const hit = !streamedHit ? visualHit : !visualHit ? streamedHit :
        streamedHit.distance < visualHit.distance ? streamedHit : visualHit;
      if (hit) safe = Math.min(safe, Math.max(0.08, hit.distance - this.probeRadius));
    }
    return safe;
  }

  findCameraBoom(center, yaw, pitch, distance, meshes, cityRaycast) {
    const directionAt = (orbitYaw, orbitPitch) => new THREE.Vector3(
      -Math.sin(orbitYaw) * Math.cos(orbitPitch),
      Math.sin(orbitPitch),
      -Math.cos(orbitYaw) * Math.cos(orbitPitch)
    ).normalize();
    const baseDirection = directionAt(yaw, pitch);
    const baseDistance=this.safeDistance(center,baseDirection,distance,meshes,cityRaycast);
    if(baseDistance>=distance-0.1){
      this.boomSide=0;
      return {direction:baseDirection,distance:baseDistance};
    }
    const offsets=[[0,0],[0,.24],[.42,.16],[-.42,.16]];
    const choices=offsets.map(([dy,dp],index)=>{
      const direction=index===0?baseDirection:directionAt(yaw+dy,pitch+dp);
      const clear=index===0?baseDistance:this.safeDistance(center,direction,distance,meshes,cityRaycast);
      return {direction,distance:clear,index,score:clear-Math.abs(dy)*.6-Math.abs(dp)*.3};
    });
    const active=choices[this.boomSide] || choices[0];
    const best=choices.reduce((a,b)=>b.score>a.score?b:a);
    // A small LOD/collider change should not alternate between shoulders.
    const selected=best.score>active.score+0.9?best:active;
    this.boomSide=selected.index;
    return selected;
  }

  handleMouseMove(deltaX, deltaY, sensitivity = 0.0011) {
    this.isRecentering = false;
    this.lockBehind = false;
    // Keep the camera where the player aimed it. Auto-centering after a pause
    // makes the view drift unexpectedly; C is the deliberate recenter action.
    this.orbitReturnTime = Infinity;
    this.yaw -= deltaX * sensitivity * this.sensitivity;
    // Boom height and first-person look pitch use opposite sign conventions.
    this.pitch += deltaY * sensitivity * this.sensitivity * (this.invertY?-1:1) * (this.mode === 'first' ? -1 : 1);

    // Clamp pitch so camera doesn't flip
    this.pitch = this.mode === 'first'
      ? THREE.MathUtils.clamp(this.pitch, -1.25, 1.25)
      : THREE.MathUtils.clamp(this.pitch, -0.52, 0.58);
  }

  handleKeyboardLook(keys,delta) {
    const x=Number(keys.has('End'))-Number(keys.has('Home'));
    const y=Number(keys.has('PageDown'))-Number(keys.has('PageUp'));
    if(x||y)this.handleMouseMove(x*1200*delta,y*900*delta);
  }

  recenterBehind(facingAngle) {
    this.recenterYaw = facingAngle;
    this.isRecentering = true;
    this.lockBehind = true;
    this.orbitReturnTime = 0;
  }

  // Put the boom where the follow camera will keep it. A fixed world offset
  // leaves the first frame on -Z even when the character faces another way.
  placeBehind(playerPos, facing) {
    this.yaw = facing;
    this.pitch = this.mode === 'first' ? 0 : 0.16;
    this.lockBehind = this.mode !== 'first';
    this.isRecentering = false;
    this.orbitReturnTime = 0;
    this.boomSide = 0;
    const eye = this.mode === 'first' ? 1.58 : 1.7;
    const center = playerPos.clone().add(new THREE.Vector3(0, eye, 0));
    const direction = new THREE.Vector3(
      -Math.sin(facing) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(facing) * Math.cos(this.pitch)
    );
    this.currentPos.copy(center).addScaledVector(direction, this.mode === 'first' ? 0 : this.distance);
    this.lookAtTarget.copy(center);
    if (this.mode === 'first') {
      this.lookAtTarget.add(new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing)));
    }
    this.collisionDistance = this.distance;
  }

  cycleMode() {
    const index = this.modeOrder.indexOf(this.mode);
    return this.setMode(this.modeOrder[(index + 1) % this.modeOrder.length]);
  }

  setMode(mode) {
    const previous = this.mode;
    this.mode = mode;
    if ((previous === 'first') !== (this.mode === 'first')) {
      this.pitch = -this.pitch;
      // V changes the viewing distance, while C explicitly recenters. Keep
      // the aimed facade/anchor even when the body faces somewhere else.
      this.lockBehind = false;
      this.isRecentering = false;
      this.orbitReturnTime = Infinity;
      this.modeChanged = true;
    }
    this.pitch = this.mode === 'first' ? THREE.MathUtils.clamp(this.pitch,-1.25,1.25) : THREE.MathUtils.clamp(this.pitch,-0.52,0.58);
    return this.mode;
  }

  handleWheel(deltaY) {
    if (this.mode === 'first') {
      this.firstPersonFov = THREE.MathUtils.clamp(this.firstPersonFov + Math.sign(deltaY) * 4, 55, 95);
    } else {
      this.targetDistance = THREE.MathUtils.clamp(
        this.targetDistance + Math.sign(deltaY) * 0.55,
        this.minDistance,
        this.maxDistance
      );
    }
  }

  triggerShake(intensity = 0.5) {
    if (this.reducedMotion) return;
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity*this.shakeStrength);
  }

  update(delta, playerPos, playerVelocity, isSwinging, cityMeshes = [], cityRaycast = null, facingAngle = null) {
    if (this.isRecentering) {
      const difference = Math.atan2(Math.sin(this.recenterYaw - this.yaw), Math.cos(this.recenterYaw - this.yaw));
      this.yaw += difference * (1 - Math.exp(-7 * delta));
      if (Math.abs(difference) < 0.008) {
        this.yaw = this.recenterYaw;
        this.isRecentering = false;
      }
    }
    // Keep the boom offset relative to the character, like a conventional
    // third-person follow camera. Mouse input temporarily unlocks this orbit.
    if (this.mode !== 'first' && this.lockBehind && facingAngle !== null) {
      const difference = Math.atan2(Math.sin(facingAngle - this.yaw), Math.cos(facingAngle - this.yaw));
      this.yaw += difference * (1 - Math.exp(-10 * this.followStrength * delta));
    }
    const speed = playerVelocity.length();
    const speedKmh = speed * 3.6;

    // 1. Dynamic FOV based on speed
    const fovRatio = this.reducedMotion ? 0 : Math.min(Math.max((speedKmh - 20) / 70, 0), 1);
    const targetFov = this.isAiming ? 50 : this.mode === 'first'
      ? this.firstPersonFov : this.baseFov + fovRatio * (this.maxFov - this.baseFov) * this.speedFov;
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 6, delta);
    this.camera.updateProjectionMatrix();

    if (this.mode === 'first') {
      const eye = playerPos.clone().add(new THREE.Vector3(0, 1.58, 0));
      const forward = new THREE.Vector3(
        Math.sin(this.yaw) * Math.cos(this.pitch),
        Math.sin(this.pitch),
        Math.cos(this.yaw) * Math.cos(this.pitch)
      ).normalize();
      // A first-person view is attached to the head; a spring boom here can
      // trail metres behind a fast character and cross walls on mode changes.
      this.currentPos.copy(eye);
      // The near plane must not enter the wall the player is looking at.
      let view = this.currentPos.clone();
      if ((cityMeshes.length || cityRaycast) && forward.lengthSq() > 0) {
        const clearance = this.safeDistance(view, forward, 0.55, cityMeshes, cityRaycast);
        if (clearance < 0.5) view.addScaledVector(forward, clearance - 0.5);
      }
      this.camera.position.copy(view);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(view.clone().add(forward));
      this.lookAtTarget.copy(view).add(forward);
      this.roll = 0;
      this.shakeIntensity = THREE.MathUtils.damp(this.shakeIntensity, 0, 10, delta);
      this.camera.updateMatrixWorld(true);
      return;
    }

    // 2. Camera distance & height offset
    const heightOffset = this.isAiming ? 1.4 : 1.7;
    const modeDistance = this.mode === 'close'
      ? THREE.MathUtils.clamp(this.targetDistance * 0.72, this.minDistance, 5.2)
      : this.mode === 'swing'
        ? Math.max(this.targetDistance, 7.0)
        : this.targetDistance;
    const desiredDistance = this.isAiming ? 3.5 : Math.min(this.maxDistance, modeDistance + (isSwinging && this.mode !== 'swing' ? 1 : 0));
    this.distance = THREE.MathUtils.damp(this.distance, desiredDistance, 8, delta);

    // 3. Compute desired camera position behind player
    const center = playerPos.clone().add(new THREE.Vector3(0, heightOffset, 0));

    // Camera position is opposite the player's view direction: yaw 0 places
    // it behind a character facing +Z, rather than in front of their face.
    const boom = this.findCameraBoom(center, this.yaw, this.pitch,
      this.distance, cityMeshes, cityRaycast);
    const camDir = boom.direction;
    // Spring-arm behavior: retract immediately to avoid clipping, but ease
    // back to the desired distance once the obstruction is gone.
    if (boom.distance < this.collisionDistance) this.collisionDistance = boom.distance;
    else this.collisionDistance = THREE.MathUtils.damp(
      this.collisionDistance, boom.distance, 5.5, delta);
    const actualDist = Math.min(this.distance, this.collisionDistance);

    const desiredCamPos = center.clone().addScaledVector(camDir, actualDist);

    // Smooth follow interpolation
    const followSharpness = isSwinging ? 16 : 18;
    const followAlpha = 1 - Math.exp(-followSharpness * delta);
    if (this.modeChanged) this.currentPos.copy(desiredCamPos);
    else this.currentPos.lerp(desiredCamPos, followAlpha);
    // Smoothing can move the camera through a wall even if the destination
    // was safe. Check the final camera segment as well.
    const finalDir = this.currentPos.clone().sub(center);
    const finalLength = finalDir.length();
    if ((cityMeshes.length || cityRaycast) && finalLength > 0) {
      finalDir.normalize();
      const safeLength = this.safeDistance(center, finalDir, finalLength, cityMeshes, cityRaycast);
      if (safeLength < finalLength) {
        this.collisionDistance = Math.min(this.collisionDistance, safeLength);
        this.currentPos.copy(center).addScaledVector(finalDir, safeLength);
      }
    }

    // Keep the horizon level during swings and turns. Banking felt disorienting
    // in this close urban environment and could make the whole city look tilted.
    this.roll = 0;

    // 6. Camera Shake decay
    if (this.reducedMotion) this.shakeIntensity = 0;
    if (this.shakeIntensity > 0.01) {
      const sx = (Math.random() - 0.5) * this.shakeIntensity * 0.4;
      const sy = (Math.random() - 0.5) * this.shakeIntensity * 0.4;
      // Shake is a render offset, never accumulated into follow/collision state.
      this.shakeOffset = new THREE.Vector3(sx,sy,0);
      this.shakeIntensity = THREE.MathUtils.damp(this.shakeIntensity, 0, 10, delta);
    } else {
      this.shakeOffset = new THREE.Vector3();
    }

    // Apply to Three.js camera
    this.camera.position.copy(this.currentPos);
    // Validate the shaken position as well, without contaminating follow state.
    const shaken = this.currentPos.clone().add(this.shakeOffset).sub(center);
    const shakenLength = shaken.length();
    if (shakenLength > 0) {
      shaken.normalize();
      this.camera.position.copy(center).addScaledVector(shaken,
        this.safeDistance(center, shaken, shakenLength, cityMeshes, cityRaycast));
    }

    // Lead only along the ground plane. Vertical velocity is often large while
    // swinging/falling; feeding it into lookAt made the camera pitch wildly.
    const targetLead = new THREE.Vector3(playerVelocity.x, 0, playerVelocity.z)
      .multiplyScalar(0.035).clampLength(0, 0.8);
    const targetLookAt = center.clone().add(targetLead);
    if (this.modeChanged) this.lookAtTarget.copy(targetLookAt);
    else this.lookAtTarget.lerp(targetLookAt, 1 - Math.exp(-18 * delta));
    this.modeChanged = false;
    this.camera.lookAt(this.lookAtTarget);

  }
}
