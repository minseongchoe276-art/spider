import * as THREE from 'three';
import { GROUNDED } from './MotionCatalog.js';
import { resolveBody, sweepBody } from './MovementCollision.js';
import { groundSample, planMantle, mantlePosition, resolveTraversal, hasMantleSupport } from './LedgeTraversal.js';
import { constrainWebs } from './WebConstraints.js';

// Normals require the inverse-transpose under unequal scale or shear.
const surfaceNormal = hit => hit.face.normal.clone()
  .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld));

export class SwingPhysics {
  constructor(scene, city, character, audio) {
    this.scene = scene;
    this.city = city;
    this.character = character;
    this.audio = audio;

    // Kinematic properties
    this.position = new THREE.Vector3(0, 95, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.state = 'FALLING'; // 'IDLE', 'RUNNING', 'SPRINTING', 'JUMPING', 'FALLING', 'SWINGING', 'WALL_RUNNING'

    // Constants
    this.gravity = 28.0; // Superhero gravity (snappy and punchy)
    this.walkSpeed = 2.8;
    this.sprintSpeed = 6.5;
    this.groundAcceleration = 30.0;
    this.groundDeceleration = 24.0;
    this.jumpForce = 17.0;
    this.maxSpeed = 48.0; // ~170 km/h cap

    // Web Swing State
    this.isSwinging = false;
    this.anchorPoint = null;
    this.ropeLength = 0;
    this.webs = [];
    this.nextWebHand = 'left';
    this.bestAnchorCandidate = null; // Raycasted target for HUD reticle
    this.bestAnchorNormal = null;
    this.lastWebAnchor = null;
    this.lastWebNormal = null;
    this.webAimNdc = new THREE.Vector2(0, 0);
    this.webFireInterval = 0.24;
    this.webFireCooldown = 0;

    // Wall run state
    this.wallNormal = new THREE.Vector3();
    this.wallRunTimer = 0;
    this.wallAttachCooldown = 0;
    this.mantle=null;

    // Raycaster for targeting & collision
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 140;

    // Air actions
    this.canAirJump = true;
    this.stuntScore = 0;
    this.onStuntCallback = null;

    // Character rotation
    this.facingAngle = 0;
    this.recoveryTime = 0;
    this.recoveryElapsed = 0;
    this.zipTime = 0;
    this.fixedStep = 1 / 120;
    this.accumulator = 0;
    this.previousFixedPosition = this.position.clone();
    this.renderPosition = this.position.clone();
    this.jumpBuffer = 0;
    this.coyoteTime = 0;
    this.webLatch = false;
    this.swingCooldown = 0;
    this.zipTarget = null;
    this.zipAnchor = null;
    this.onLanding = null;
    this.onRecovery = null;
    this.launchAssistAvailable = true;
  }

  // Find optimal anchor point on building facade in front of player/camera
  setWebAimPoint(clientX, clientY, rect, pointerLocked = false) {
    if (pointerLocked || !rect?.width || !rect?.height) {
      this.webAimNdc.set(0, 0);
      return;
    }
    this.webAimNdc.set(
      THREE.MathUtils.clamp(((clientX - rect.left) / rect.width) * 2 - 1, -1, 1),
      THREE.MathUtils.clamp(1 - ((clientY - rect.top) / rect.height) * 2, -1, 1)
    );
  }

  findBestAnchor(camera) {
    camera.updateMatrixWorld(true);
    const eye=this.position.clone().add(new THREE.Vector3(0,1.3,0));
    const accept = hit => {
      if (!hit || hit.distance < 1 || hit.distance > 130) return null;
      this.bestAnchorObject = hit.object;
      this.bestAnchorNormal = hit.face ? surfaceNormal(hit) : new THREE.Vector3(0, 1, 0);
      this.bestAnchorCandidate = hit.point.clone();
      return this.bestAnchorCandidate;
    };

    // A deliberate screen point wins. Pointer lock uses the view center.
    this.raycaster.far = 130;
    this.raycaster.setFromCamera(this.webAimNdc, camera);
    const aimed = accept(this.raycaster.intersectObjects(this.city.buildingMeshes, true)[0]);
    this.raycaster.far = 140;
    if (aimed) return aimed;

    // The center ray missed. Search ahead and above the travel direction
    // for a facade about 15–45m over the body.
    const look = new THREE.Vector3();
    camera.getWorldDirection(look);
    const travel = this.velocity.clone();
    travel.y = 0;
    const ahead = look.clone();
    ahead.y = 0;
    if (ahead.lengthSq() < 1e-6) {
      if (travel.lengthSq() > 1) ahead.copy(travel);
      else ahead.set(0, 0, 1);
    }
    ahead.normalize();
    if (travel.lengthSq() > 4) ahead.lerp(travel.clone().normalize(), 0.35).normalize();
    const yaw0 = Math.atan2(ahead.x, ahead.z);
    let best = null;
    let bestScore = -Infinity;
    for (const pitch of [0.22, 0.48, 0.78]) {
      for (const yaw of [0, 0.2, -0.2]) {
        const direction = new THREE.Vector3(
          Math.sin(yaw0 + yaw) * Math.cos(pitch),
          Math.sin(pitch),
          Math.cos(yaw0 + yaw) * Math.cos(pitch)
        );
        this.raycaster.set(eye, direction);
        this.raycaster.far = 130;
        const hit = this.raycaster.intersectObjects(this.city.buildingMeshes, true)[0];
        this.raycaster.far = 140;
        if (!hit || hit.distance < 4 || hit.distance > 130) continue;
        const height = hit.point.y - eye.y;
        let score = 100 - hit.distance * 0.35 + Math.min(Math.max(height, 0), 50) * 1.5;
        if (height >= 15 && height <= 45) score += 40;
        if (score > bestScore) { bestScore = score; best = hit; }
      }
    }
    return accept(best);
  }

  startSwing(camera,allowSame=true) {
    if(this.webEnabled===false && GROUNDED.includes(this.state))return false;
    const anchor = this.findBestAnchor(camera);
    if (!anchor) return false;
    const hand=this.nextWebHand;
    const sameHand=this.webs.find(web=>web.hand===hand);
    if (!allowSame && this.isSwinging && sameHand?.anchor.distanceTo(anchor) < 0.8 &&
        sameHand.object === this.bestAnchorObject) return false;
    if(this.webObstructed({anchor,normal:this.bestAnchorNormal}))return false;

    if(this.state==='WEB_ZIP' && this.zipAnchor && !this.webs.length)this.webs=[{
      hand:this.pullHand || this.character.currentHand || 'left',anchor:this.zipAnchor.clone(),
      normal:this.lastWebNormal?.clone(),object:this.bestAnchorObject,
      length:Math.max(1.45,this.position.distanceTo(this.zipAnchor))}];

    this.isSwinging = true;
    this.state = 'SWINGING';
    this.recoveryTime = 0;
    this.zipTarget = null;
    this.zipAnchor = null;
    this.zipTime = 0;
    this.wallBuilding = null;
    this.mantle=null;
    this.anchorPoint = anchor.clone();
    this.anchorObject = this.bestAnchorObject;
    this.lastWebAnchor = anchor.clone();
    this.lastWebNormal = this.bestAnchorNormal?.clone() || new THREE.Vector3(0, 1, 0);
    this.ropeLength = Math.max(1.45, this.position.distanceTo(this.anchorPoint));
    // Each hand keeps its own anchor. A later shot replaces only that hand.
    this.webs=this.webs.filter(web=>web.hand!==hand);
    this.webs.push({hand,anchor:anchor.clone(),normal:this.lastWebNormal.clone(),
      object:this.anchorObject,length:this.ropeLength});
    this.character.fireWeb?.(this.anchorPoint,hand);
    this.syncWebHands();
    this.nextWebHand=hand==='left'?'right':'left';

    // Attachment changes the constraint, never the player's momentum.
    this.launchAssistAvailable = false;

    this.audio.playWebShoot();
    this.onWebAttach?.(this.lastWebAnchor || this.anchorPoint);
    return true;
  }

  enterSwingFromPull(camera) {
    const anchor = this.zipAnchor || this.lastWebAnchor;
    if (!anchor || !this.anchorSupported({anchor,normal:this.lastWebNormal})) return false;
    const radial = this.position.clone().sub(anchor).normalize();
    const radialSpeed = this.velocity.dot(radial);
    this.velocity.addScaledVector(radial, -radialSpeed);
    if (this.velocity.length() < 5) {
      const tangent = new THREE.Vector3();
      camera.getWorldDirection(tangent);
      tangent.addScaledVector(radial, -tangent.dot(radial)).normalize();
      if (tangent.lengthSq() < 1e-5) {
        tangent.crossVectors(radial, new THREE.Vector3(0, 1, 0));
        if (tangent.lengthSq() < 1e-5) tangent.crossVectors(radial, new THREE.Vector3(1, 0, 0));
        tangent.normalize();
      }
      this.velocity.addScaledVector(tangent, 6 - this.velocity.length());
    }
    this.anchorPoint = anchor.clone();
    this.anchorObject = this.bestAnchorObject || null;
    this.ropeLength = Math.max(1.45, this.position.distanceTo(anchor));
    const hand=this.pullHand || this.character.currentHand || 'left';
    this.webs=[{hand,anchor:anchor.clone(),normal:this.lastWebNormal?.clone(),
      object:this.anchorObject,length:this.ropeLength}];
    this.syncWebHands();
    this.isSwinging = true;
    this.state = 'SWINGING';
    this.zipTarget = null;
    this.zipAnchor = null;
    this.zipTime = 0;
    this.webLatch = true;
    return true;
  }

  releaseSwing(boost = false) {
    if (!this.isSwinging) return;
    this.isSwinging = false;
    this.state = 'FALLING';

    // Slingshot momentum release: boost forward & up on upswing!
    const forwardSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (boost && (this.velocity.y > 0 || forwardSpeed > 15)) {
      // Slingshot impulse
      this.velocity.y += Math.min(14, 4 + forwardSpeed * 0.3);
      this.velocity.x *= 1.18;
      this.velocity.z *= 1.18;
      this.audio.playSlingshotBoost();

      // Trigger stunt reward if high speed
      if (forwardSpeed > 24 && this.onStuntCallback) {
        this.onStuntCallback('SLINGSHOT LAUNCH', 300);
      }
    }

    this.anchorPoint = null;
    this.anchorObject = null;
    this.webs=[];
    this.clearWebVisuals();
    this.swingCooldown = 0;
    this.velocity.clampLength(0, this.maxSpeed);
  }

  clearWebVisuals() {
    this.character.webAttachments=[];
    this.character.persistentWebAnchor=null;
    this.character.webShotAnchor=null;
    this.character.webShotTimer=0;
    this.character.webHandWeights={};this.character.webHandTargets={};
    this.character.webLaunchTimers={};
    this.character.updateWeb?.(false,null);
  }

  clearWebAnchor() {
    if (this.isSwinging) this.releaseSwing(false);
    this.lastWebAnchor = null;
    this.lastWebNormal = null;
    this.zipAnchor = null;
    this.zipTarget = null;
    if (this.state === 'WEB_ZIP') this.state = this.velocity.y > 0 ? 'JUMPING' : 'FALLING';
    this.character.persistentWebAnchor = null;
    this.character.webShotAnchor = null;
    this.character.webShotTimer = 0;
    this.webs=[];
    this.character.webAttachments=[];
    this.character.webHandWeights={};this.character.webHandTargets={};
    this.character.webLaunchTimers={};
    this.character.updateWeb?.(false, null);
  }

  // Reels the player toward the most recently attached web. If no web has
  // been fired yet, the right-click ray creates an anchor and pulls to it.
  performWebPull(camera, aimNdc = this.webAimNdc) {
    if(this.webEnabled===false && GROUNDED.includes(this.state))return false;
    camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(aimNdc, camera);
    this.raycaster.far = 130;
    const hit = this.raycaster.intersectObjects(this.city.buildingMeshes, true)[0];
    this.raycaster.far = 140;
    let anchor = hit && hit.distance >= 1 && hit.face ? hit.point.clone() : null;
    let normal = anchor ? surfaceNormal(hit) : null;
    if (anchor) this.bestAnchorObject = hit.object;
    if (!anchor && this.isSwinging && this.anchorPoint) {
      anchor = this.anchorPoint.clone();
      normal = this.lastWebNormal?.clone();
    } else if (!anchor && this.lastWebAnchor) {
      anchor = this.lastWebAnchor.clone();
      normal = this.lastWebNormal?.clone();
    }
    if (!anchor) return false;
    this.lastWebAnchor = anchor.clone();
    this.lastWebNormal = (normal || this.lastWebNormal || new THREE.Vector3(0, 1, 0)).clone();

    if(this.webObstructed({anchor,normal})){if(!this.anchorSupported({anchor,normal})){this.lastWebAnchor=null;this.lastWebNormal=null;}return false;}

    // Stop the pendulum constraint but keep its attached endpoint as the
    // persistent web target. Offset the player's root away from the facade.
    if (this.isSwinging) {
      this.isSwinging = false;
      this.anchorPoint = null;
      this.anchorObject = null;
      this.webLatch = false;
    }
    normal ||= new THREE.Vector3(0, 1, 0);
    // Explicit reel uses the last fired hand; the offhand is released so it
    // cannot oppose the reel's path or remain drawn through an intervening wall.
    this.pullHand=this.webs.at(-1)?.hand || this.character.currentHand || this.nextWebHand;
    this.nextWebHand=this.pullHand==='left'?'right':'left';
    this.webs=[];
    this.character.webAttachments=[];
    const target = anchor.clone();
    if (normal.y > 0.65) target.y += 0.12;
    else target.addScaledVector(normal, 1.25).y -= 1.05;
    target.y = Math.max(0.12, target.y);

    this.zipTarget = target;
    this.zipAnchor = anchor.clone();
    this.state = 'WEB_ZIP';
    this.mantle=null;
    this.zipTime = 8;
    this.velocity.clampLength(0, 22);
    this.recoveryTime = 0;
    this.wallBuilding = null;
    this.character.fireWeb?.(anchor,this.pullHand);
    this.audio.playWebShoot();
    this.onWebAttach?.(this.lastWebAnchor || this.anchorPoint);
    return true;
  }

  performAirJump(camera, aimNdc = new THREE.Vector2(0, 0)) {
    if(this.webEnabled===false && GROUNDED.includes(this.state))return false;
    if (!this.canAirJump || this.isSwinging || this.state === 'SWINGING') return false;

    // Web Zip: Pulls character forward and upward
    camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(aimNdc, camera);
    this.raycaster.far = 80;
    const hit = this.raycaster.intersectObjects(this.city.buildingMeshes, true)[0];
    this.raycaster.far = 140;
    if (!hit || hit.distance < 4 || !hit.face) return false;
    const normal = surfaceNormal(hit);
    if(!this.anchorSupported({anchor:hit.point,normal}))return false;
    const target = hit.point.clone().addScaledVector(normal, 1.05);
    // Keep the player's feet above street level when the clicked surface is
    // near the ground; otherwise the zip immediately collides with the floor.
    target.y = Math.max(this.position.y + 0.9, target.y - 0.8);
    if (sweepBody(this.position, target, this.city.colliders)) return false;
    // The camera may see a target around a corner that the player's tether cannot reach.
    const eye = this.position.clone().add(new THREE.Vector3(0, 1.3, 0));
    const tether = hit.point.clone().sub(eye);
    const obstruction = this.city.raycast?.(eye, tether.clone().normalize(), Math.max(0, tether.length() - 1.1));
    if (obstruction) return false;
    this.zipTarget = target;
    this.zipAnchor = hit.point.clone();
    this.lastWebAnchor=hit.point.clone();this.lastWebNormal=normal.clone();
    this.bestAnchorObject=hit.object;
    this.webs=[];this.character.webAttachments=[];
    this.pullHand=this.nextWebHand;
    this.character.fireWeb?.(this.zipAnchor,this.pullHand);
    this.nextWebHand=this.pullHand==='left'?'right':'left';
    this.velocity.clampLength(0, 22);
    this.audio.playWebShoot();
    this.onWebAttach?.(this.zipAnchor);
    this.canAirJump = false;
    this.state = 'WEB_ZIP';
    this.mantle=null;
    this.zipTime = 3;
    this.recoveryTime = 0;
    this.wallBuilding = null;

    if (this.onStuntCallback) {
      this.onStuntCallback('WEB ZIP', 0);
    }
    return true;
  }

  performAirTrick() {
    if (this.character.isTricking || this.character.contactTime < 0.7 ||
        this.position.y < 3) return false;
    if (this.state === 'FALLING' || this.state === 'JUMPING' || this.state === 'SWINGING') {
      this.character.triggerAirTrick();
      this.audio.playTrickSound();
      this.stuntScore += 250;
      if (this.onStuntCallback) {
        this.onStuntCallback('SPIDEY FLIP', 250);
      }
      return true;
    }
    return false;
  }

  update(delta, input, camera) {
    if (![...this.position, ...this.velocity].every(Number.isFinite)) this.resetPosition('invalid');
    // Landing impact is reported for exactly one character update.
    this.character.landingSpeed = 0;

    const websLocked=this.webEnabled===false && GROUNDED.includes(this.state);
    if(websLocked){input.webTap=input.webFireHeld=input.webHold=false;}
    // 1. Raycast for candidate anchor point in real-time
    this.findBestAnchor(camera);

    // 2. Stay on the line only while the button is held.
    const webTap = !!input.webTap;
    input.webTap = false;
    this.webFireCooldown = Math.max(0, this.webFireCooldown - Math.max(0, delta));
    if (webTap) {
      const attached = this.startSwing(camera);
      if (!attached && !this.isSwinging) {
        this.raycaster.setFromCamera(this.webAimNdc,camera);
        const direction=this.raycaster.ray.direction.clone();
        // A downward camera angle would bury the missed strand in the roof.
        direction.y=Math.max(direction.y,0.1);direction.normalize();
        const target=this.position.clone().add(new THREE.Vector3(0,1.3,0)).addScaledVector(direction,28);
        this.character.fireWebMiss?.(target,this.nextWebHand);
        this.audio.playWebShoot?.();
      }
      if (!attached && !this.isSwinging && this.state !== 'WEB_ZIP' && !input.webFireHeld) input.webHold = false;
      this.webFireCooldown = this.webFireInterval;
    } else if (input.webHold && !this.webLatch && !this.isSwinging && this.state !== 'WEB_ZIP') {
      this.startSwing(camera);
    }
    const webButton=!!(input.webFireHeld || input.webHold);
    if (this.isSwinging && !webButton) this.releaseSwing(false);
    this.webLatch = webButton;
    if (input.jump) this.jumpBuffer = 0.14;
    input.jump = false;

    // Use bounded physics steps to avoid missing roofs at high falling speeds.
    this.accumulator += Math.min(Math.max(delta, 0), 0.1);
    const step = this.fixedStep;
    while (this.accumulator + 1e-10 >= step) {
    this.accumulator = Math.max(0, this.accumulator - step);
    this.previousFixedPosition.copy(this.position);
    this.swingCooldown = Math.max(0, this.swingCooldown - step);
    if (GROUNDED.includes(this.state)) this.coyoteTime = 0.1;
    else this.coyoteTime = Math.max(0, this.coyoteTime - step);
    input.jump = this.jumpBuffer > 0;
    this.wallAttachCooldown = Math.max(0,this.wallAttachCooldown-step);
    this.previousPosition = this.position.clone();
    // 3. Update physics state machine
    if (this.state === 'SWINGING' && this.anchorPoint) {
      this.updateSwingPhysics(step, input, camera);
    } else if (this.state === 'MANTLING') {
      this.updateMantlePhysics(step,input);
    } else if (this.state === 'WALL_RUNNING') {
      this.updateWallRunPhysics(step, input, camera);
    } else {
      this.updateFreePhysics(step, input, camera);
    }

    // 4. City Collisions
    this.handleCollisions(step, input);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - step);
    input.jump = false;
    this.velocity.clampLength(0, this.maxSpeed);
    if (![...this.position, ...this.velocity].every(Number.isFinite) || this.position.y < -40 ||
        Math.abs(this.position.x) > (this.city.playableHalfExtent || 2400) ||
        Math.abs(this.position.z) > (this.city.playableHalfExtent || 2400)) {
      this.resetPosition(this.position.y < -40 ? 'fall' : 'boundary');
      break;
    }
    }
    this.renderPosition.lerpVectors(this.previousFixedPosition, this.position, this.accumulator / step);

    // 5. Update character visuals
    let below = this.city.collisionWorld
      ? this.city.collisionWorld.groundAt(this.position, 120) : 0;
    for (const c of this.city.colliders || []) {
      if (c.maxY + 0.1 <= this.position.y && this.position.x >= c.minX && this.position.x <= c.maxX &&
        this.position.z >= c.minZ && this.position.z <= c.maxZ) below = Math.max(below ?? -Infinity,c.maxY);
    }
    const clearance = below === null ? Infinity : Math.max(0,this.position.y-below-0.1);
    const downward = Math.max(0,-this.velocity.y);
    this.character.contactTime = this.velocity.y < 0
      ? (Math.sqrt(downward*downward+2*this.gravity*clearance)-downward)/this.gravity : Infinity;
    this.character.group.position.copy(this.renderPosition);
    this.character.surfaceProbe=p=>groundSample(this.city,p,0.8);
    this.character.groundProbe=p=>this.character.surfaceProbe(p)?.height ?? null;
    this.character.mantle=this.state==='MANTLING'?this.mantle:null;
    this.character.update(delta, this.state, this.velocity,
      this.anchorPoint || this.zipAnchor || this.lastWebAnchor);

    // 6. Sound speed tracking
    const speedKmh = this.velocity.length() * 3.6;
    this.audio.setWindSpeed(speedKmh);
  }

  updateSwingPhysics(delta, input, camera) {
    // Compatibility for review fixtures that initialize a single anchor directly.
    if(!this.webs.length && this.anchorPoint)this.webs=[{
      hand:this.character.currentHand || 'left',anchor:this.anchorPoint.clone(),
      object:this.anchorObject,normal:this.lastWebNormal?.clone(),length:this.ropeLength}];
    const blocked=this.webs.filter(web=>this.webObstructed(web));
    if(blocked.length) {
      this.webs=this.webs.filter(web=>!blocked.includes(web));
      this.syncWebHands();
      if(!this.webs.length){this.character.persistentWebAnchor=null;this.releaseSwing(false);return;}
    }
    const latest=this.webs.at(-1);
    this.syncWebHands();
    this.anchorPoint=latest.anchor;this.anchorObject=latest.object;this.ropeLength=latest.length;
    this.lastWebAnchor=latest.anchor.clone();this.lastWebNormal=latest.normal?.clone() || this.lastWebNormal;
    this.velocity.y-=this.gravity*delta;
    constrainWebs(this.position,this.velocity,this.webs);
    const taut=this.webs.filter(web=>this.position.distanceTo(web.anchor)>=web.length-1e-4);
    if(taut.length) {
      // Gentle player effort acts across the rope, never reels it inward.
      const camForward=new THREE.Vector3();
      camera?.getWorldDirection(camForward);
      camForward.y=0;
      if(camForward.lengthSq()<1e-6)camForward.set(0,0,1);
      camForward.normalize();
      const side=new THREE.Vector3().crossVectors(camForward,new THREE.Vector3(0,1,0));
      const effort=camForward.multiplyScalar((input.forward?1:0)-(input.backward?1:0))
        .addScaledVector(side,input.strafe || ((input.right?1:0)-(input.left?1:0)));
      if(effort.lengthSq()>1)effort.normalize();
      for(const web of taut) {
        const radial=this.position.clone().sub(web.anchor).normalize();
        effort.addScaledVector(radial,-effort.dot(radial));
      }
      this.velocity.addScaledVector(effort,8*delta);
    }
    this.velocity.clampLength(0,this.maxSpeed);
    this.position.addScaledVector(this.velocity,delta);
    constrainWebs(this.position,this.velocity,this.webs);
    this.ropeLength=latest.length;
  }

  syncWebHands() {
    this.character.webAttachments=this.webs.map(web=>({hand:web.hand,anchor:web.anchor}));
  }

  anchorSupported(web) {
    if(!this.city.isStreamed)return true;
    if(!this.city.collisionWorld?.ready || !web.anchor)return false;
    const normal=(web.normal || this.lastWebNormal || new THREE.Vector3(0,1,0)).clone().normalize();
    const probe=web.anchor.clone().addScaledVector(normal,.8);
    const hit=this.city.raycast(probe,normal.clone().negate(),1.6,false);
    return !!hit && hit.point.distanceTo(web.anchor)<.65 && Math.abs(hit.normal.dot(normal))>.25;
  }

  webObstructed(web) {
    if(!this.anchorSupported(web))return true;
    const lineStart = this.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    const line = web.anchor.clone().sub(lineStart);
    if(line.length()<1e-8)return false;
    this.raycaster.set(lineStart, line.clone().normalize());
    // The tether must be allowed to terminate on the facade it is attached to.
    // Leave a small endpoint margin so triangle seams do not sever valid webs.
    this.raycaster.far = Math.max(0, line.length() - 1.0);
    const collisionObstruction = this.city.raycast?.(lineStart,line.clone().normalize(),this.raycaster.far);
    const visualObstruction = this.city.collisionWorld ? null :
      this.raycaster.intersectObjects(this.city.buildingMeshes, true)[0];
    this.raycaster.far = 140;
    return !!(collisionObstruction || visualObstruction);
  }

  updateWallRunPhysics(delta, input, camera) {
    this.wallRunTimer += delta;
    this.facingAngle=Math.atan2(-this.wallNormal.x,-this.wallNormal.z);
    this.character.targetFacingAngle=this.facingAngle;
    const wallProbe=this.position.clone().add(new THREE.Vector3(0,0.8,0));
    const wallHit=this.city.raycast?.(wallProbe,this.wallNormal.clone().negate(),1.1);
    if(wallHit)this.character.wallDistance=wallHit.distance;

    // A jump pressed at the wall edge should still detach cleanly; on the
    // streamed map there may no longer be a facade at chest height.
    if (input.jump) {
      this.jumpBuffer = 0;
      this.coyoteTime = 0;
      this.velocity.copy(this.wallNormal.clone().multiplyScalar(18).add(new THREE.Vector3(0,14,0)));
      this.state='JUMPING';
      this.wallAttachCooldown=0.3;
      this.audio.playJump();
      this.position.addScaledVector(this.velocity,delta);
      return;
    }

    // At the top edge, enter the roof only when the capsule footprint has a
    // real walkable surface. Otherwise release into a fall.
    const roofProbe=this.position.clone().addScaledVector(this.wallNormal,-0.8)
      .add(new THREE.Vector3(0,1.1,0));
    const roof=this.city.collisionWorld
      ? this.city.collisionWorld.groundAt(roofProbe,1.4)
      : (this.city.colliders || []).filter(c => roofProbe.x >= c.minX && roofProbe.x <= c.maxX &&
          roofProbe.z >= c.minZ && roofProbe.z <= c.maxZ && c.maxY <= roofProbe.y &&
          c.maxY >= roofProbe.y - 1.4).sort((a,b) => b.maxY-a.maxY)[0]?.maxY;
    if (roof!==null && roof!==undefined && roof-this.position.y>=-0.2 && roof-this.position.y<0.9) {
      const plan=planMantle(this.city,this.position,this.wallNormal,roof);
      if(!plan) {
        this.state='FALLING';this.wallBuilding=null;this.wallAttachCooldown=0.35;
        this.velocity.copy(this.wallNormal).multiplyScalar(3);
        return;
      }
      this.mantle=plan;
      this.velocity.set(0,0,0);
      this.state='MANTLING';
      return;
    }

    if (!wallHit || wallHit.normal.dot(this.wallNormal)<0.35) {
      this.state='FALLING';
      this.wallBuilding=null;
      this.velocity.addScaledVector(this.wallNormal,5);
      return;
    }

    // Wall run velocity: run vertically up the wall
    const upDir = new THREE.Vector3(0, 1, 0);
    this.velocity.copy(upDir.multiplyScalar(this.sprintSpeed));

    // Optional horizontal run along wall face
    if (input.strafe !== 0) {
      // Look into the wall is -normal, so screen-right is up × normal.
      const wallSide = new THREE.Vector3().crossVectors(upDir, this.wallNormal).normalize();
      this.velocity.add(wallSide.multiplyScalar(input.strafe * 4.5));
    }

    // Drop off wall if timer expires or user stops moving forward
    if (this.wallRunTimer > 25.0 || !input.forward || !input.wallRun ||
        (this.wallBuilding && (this.position.x < this.wallBuilding.minX - 0.8 ||
          this.position.x > this.wallBuilding.maxX + 0.8 ||
          this.position.z < this.wallBuilding.minZ - 0.8 || this.position.z > this.wallBuilding.maxZ + 0.8))) {
      this.state = 'FALLING';
      this.wallBuilding = null;
      this.velocity.add(this.wallNormal.clone().multiplyScalar(6));
    }

    this.position.addScaledVector(this.velocity, delta);
  }

  updateMantlePhysics(delta,input) {
    const plan=this.mantle;
    if(!plan){this.state='FALLING';return;}
    const cancel=(jump=false)=>{
      this.mantle=null;this.wallBuilding=null;this.wallAttachCooldown=0.35;
      this.state=jump?'JUMPING':'FALLING';this.jumpBuffer=0;this.coyoteTime=0;
      this.velocity.copy(plan.normal).multiplyScalar(jump?12:3);this.velocity.y=jump?14:0;
      if(jump)this.audio.playJump();
    };
    if(input.jump){cancel(true);return;}
    if(!hasMantleSupport(this.city,plan.end,plan.height)){cancel();return;}
    plan.elapsed=Math.min(plan.duration,plan.elapsed+delta);
    const target=mantlePosition(plan,plan.elapsed/plan.duration);
    const resolved=resolveTraversal(this.city,this.position,target);
    this.velocity.copy(resolved.position).sub(this.position).divideScalar(delta);
    this.position.copy(resolved.position);
    if(this.position.distanceTo(target)>0.09 || resolved.contacts.some(c=>c.normal.y< -0.5)){cancel();return;}
    if(plan.elapsed>=plan.duration) {
      this.state='IDLE';this.velocity.set(0,0,0);this.mantle=null;this.wallBuilding=null;
      this.canAirJump=true;this.launchAssistAvailable=true;this.wallAttachCooldown=0.2;
    }
  }

  updateFreePhysics(delta, input, camera) {
    if (this.state === 'WEB_ZIP' && this.zipTarget && !this.anchorSupported({anchor:this.zipAnchor,normal:this.lastWebNormal}))this.clearWebAnchor();
    if (this.state === 'WEB_ZIP' && this.zipTarget) {
      this.zipTime -= delta;
      const toTarget = this.zipTarget.clone().sub(this.position);
      const distance = toTarget.length();
      if (distance < 0.28) {
        this.jumpBuffer = 0;
        if (this.enterSwingFromPull(camera)) return;
        this.zipTarget = null;
        this.zipAnchor = this.lastWebAnchor?.clone() || null;
        this.state = 'FALLING';
        return;
      } else if (this.zipTime <= 0 || input.jump) {
        this.zipTarget = null; this.zipAnchor = this.lastWebAnchor?.clone() || null;
        this.jumpBuffer = 0;
        this.state = 'FALLING';
      } else {
        const desiredSpeed = Math.min(22, Math.sqrt(2 * 35 * distance));
        this.velocity.lerp(toTarget.normalize().multiplyScalar(desiredSpeed), 1 - Math.exp(-12 * delta));
        this.velocity.clampLength(0, distance / delta);
        this.position.addScaledVector(this.velocity, delta);
        return;
      }
    }
    let isGrounded = GROUNDED.includes(this.state);
    if (isGrounded && this.supportHeight(this.position) === null) {
      isGrounded = false;
      this.state = 'FALLING';
      this.recoveryTime = 0;
    }

    if (isGrounded && this.state === 'TURNING') {
      this.recoveryElapsed += delta;
      const t = Math.min(1,this.recoveryElapsed / this.recoveryTime);
      this.facingAngle = this.turnStart + this.turnAmount * (t*t*(3-2*t));
      this.character.targetFacingAngle = this.facingAngle;
      this.velocity.set(0,0,0);
      if (t >= 1 || input.jump || input.forward || input.backward || input.left || input.right) {
        this.state = 'IDLE'; this.recoveryTime = 0;
      } else return;
    }
    if (isGrounded && ['LANDING','ROLLING'].includes(this.state)) {
      if (this.recoveryElapsed > this.recoveryTime * 0.45 &&
          (input.jump || input.forward || input.backward || input.left || input.right)) {
        this.state = 'IDLE'; this.recoveryTime = 0;
      }
    }
    if (isGrounded && ['LANDING','ROLLING'].includes(this.state)) {
      const old = this.recoveryElapsed;
      this.recoveryElapsed = Math.min(this.recoveryTime,old+delta);
      if (this.state === 'ROLLING') {
        const points = this.character.actions?.roll?.getClip().userData?.rootMotion || [];
        const sample = time => {
          const end = points.findIndex(p => p.time >= time);
          if (!points.length) return 0;
          if (end < 0) return points.at(-1).distance;
          if (end === 0) return points[0].distance;
          const a=points[end-1],b=points[end];
          return THREE.MathUtils.lerp(a.distance,b.distance,(time-a.time)/(b.time-a.time));
        };
        const speed = (sample(this.recoveryElapsed)-sample(old))/delta;
        this.velocity.set(Math.sin(this.facingAngle)*speed,0,Math.cos(this.facingAngle)*speed);
      } else this.velocity.multiplyScalar(Math.exp(-18*delta));
      this.position.addScaledVector(this.velocity,delta);
      if (this.recoveryElapsed >= this.recoveryTime) {
        this.state = 'IDLE'; this.velocity.set(0,0,0); this.recoveryTime = 0;
      }
      return;
    }

    // Camera relative planar movement
    const camForward = new THREE.Vector3();
    camera.getWorldDirection(camForward);
    camForward.y = 0;
    // Screen-right is the camera's local +X. At yaw 0 the look is (0,0,1)
    // and forward × up is (-1,0,0), which matches that column.
    if (camForward.lengthSq() < 1e-6) camForward.set(Math.sin(this.facingAngle), 0, Math.cos(this.facingAngle));
    else camForward.normalize();
    const camRight = new THREE.Vector3().crossVectors(camForward, new THREE.Vector3(0, 1, 0)).normalize();

    const moveDir = new THREE.Vector3();
    if (input.forward) moveDir.add(camForward);
    if (input.backward) moveDir.sub(camForward);
    if (input.right) moveDir.add(camRight);
    if (input.left) moveDir.sub(camRight);

    const combat=this.combatMotion;
    if(isGrounded && combat)moveDir.set(0,0,0);
    if (moveDir.lengthSq() > 0.001) {
      moveDir.normalize();
      const nextFacingAngle = Math.atan2(moveDir.x, moveDir.z);
      const turnDelta = Math.atan2(
        Math.sin(nextFacingAngle - this.facingAngle),
        Math.cos(nextFacingAngle - this.facingAngle)
      );
      if (isGrounded && Math.abs(turnDelta) > 0.45 && this.velocity.length() > 0.5) {
        this.character.requestTurn(turnDelta > 0 ? 'right' : 'left');
      }
      if(!combat){this.facingAngle = nextFacingAngle;this.character.targetFacingAngle = this.facingAngle;}
    }

    if (isGrounded) {
      const moveSpeed = input.sprint ? this.sprintSpeed : input.run ? 4.8 : input.jog ? 3.4 : this.walkSpeed;
      const targetVelocity = combat?.direction?combat.direction.clone().multiplyScalar(combat.speed ?? 7):moveDir.clone().multiplyScalar(moveSpeed*(combat?.key==='guard'?0.35:1));
      if(combat?.direction)moveDir.copy(combat.direction);
      if (moveDir.lengthSq() > 0.001) {
        this.velocity.x = combat?.direction?targetVelocity.x:THREE.MathUtils.damp(this.velocity.x,targetVelocity.x,9,delta);
        this.velocity.z = combat?.direction?targetVelocity.z:THREE.MathUtils.damp(this.velocity.z,targetVelocity.z,9,delta);
        this.state = input.sprint ? 'SPRINTING' : 'RUNNING';
      } else {
        this.velocity.x = THREE.MathUtils.damp(this.velocity.x, 0, 8, delta);
        this.velocity.z = THREE.MathUtils.damp(this.velocity.z, 0, 8, delta);
        // Idle state starts the appropriate stop clip while momentum decays.
        const brakingSpeed = Math.hypot(this.velocity.x, this.velocity.z);
        this.state = 'IDLE';
        if (brakingSpeed < 0.02) { this.velocity.x = 0; this.velocity.z = 0; }
      }

      const ground=groundSample(this.city,this.position.clone().add(new THREE.Vector3(0,0.25,0)),0.7);
      this.velocity.y=ground?-(ground.normal.x*this.velocity.x+ground.normal.z*this.velocity.z)/ground.normal.y:0;

      // Jump
      if (input.jump) {
        this.jumpBuffer = 0; this.coyoteTime = 0;
        this.velocity.y = this.jumpForce;
        this.state = 'JUMPING';
        this.audio.playJump();
      }
    } else {
      if (input.jump && this.coyoteTime > 0) {
        this.velocity.y = this.jumpForce; this.state = 'JUMPING';
        this.jumpBuffer = 0; this.coyoteTime = 0; this.audio.playJump();
      }
      // In air
      this.velocity.y -= this.gravity * delta;

      // Air air-resistance drag
      this.velocity.x *= (1 - 0.25 * delta);
      this.velocity.z *= (1 - 0.25 * delta);

      // Weak air steering
      if (moveDir.lengthSq() > 0.001) {
        this.velocity.add(moveDir.multiplyScalar(15.0 * delta));
      }

      this.zipTime = Math.max(0,this.zipTime-delta);
      if (this.state === 'WEB_ZIP' && this.zipTime === 0) this.state = this.velocity.y > 0 ? 'JUMPING' : 'FALLING';
      if (this.velocity.y <= 0 && this.state !== 'WALL_RUNNING' && this.state !== 'WEB_ZIP') {
        this.state = 'FALLING';
      }
    }

    // Integrate position
    this.position.addScaledVector(this.velocity, delta);
  }

  handleCollisions(delta, input) {
    if(this.state==='MANTLING')return; // Traversal already resolves its swept capsule.
    const previous = this.previousPosition || this.position;
    const fallingSpeed = this.velocity.y;
    const resolved = this.city.resolveMovement
      ? this.city.resolveMovement(previous, this.position, this.velocity)
      : resolveBody(previous, this.position, this.velocity, this.city.colliders);
    this.position.copy(resolved.position);
    const sweptWall = resolved.contacts.find(hit => Math.abs(hit.normal.y) < 0.5 && hit.blocked!==false);
    if (resolved.contacts.length && this.state === 'WEB_ZIP') {
      this.zipTarget = null; this.zipAnchor = this.lastWebAnchor?.clone() || null; this.state = 'FALLING';
    }
    let floor = this.city.resolveMovement ? null : this.position.y <= 0.1 ? 0 : null;
    if (resolved.grounded && fallingSpeed <= 0) floor = this.city.supportHeight(this.position);
    for (const c of this.city.colliders || []) {
      if (this.position.x >= c.minX && this.position.x <= c.maxX &&
          this.position.z >= c.minZ && this.position.z <= c.maxZ &&
          previous.y >= c.maxY + 0.09 && this.position.y <= c.maxY + 0.1) {
        floor = Math.max(floor ?? -Infinity, c.maxY);
      }
    }
    const support = this.supportHeight(this.position);
    if (this.velocity.y <= 0 && (floor !== null || support !== null)) {
      const airborne = !GROUNDED.includes(this.state);
      if (this.state === 'WEB_ZIP') {
        this.zipTarget = null;
        this.zipAnchor = null;
      }
      const impact = Math.max(0, -fallingSpeed);
      this.character.landingSpeed = Math.max(this.character.landingSpeed, impact);
      if (impact > 12) this.audio.playLand();
      if (this.isSwinging) this.releaseSwing(false);
      if (airborne) this.clearWebVisuals();
      const supportY=(floor ?? support)+0.1;
      // Rapier's capsule clearance includes its controller skin and slope
      // radius. Snapping that resolved height back to +10cm penetrated the
      // ramp each tick and cut uphill walking speed by more than half.
      this.position.y=this.city.resolveMovement
        ?Math.max(supportY,resolved.position.y):supportY;
      this.velocity.y = 0;
      this.canAirJump = true;
      this.launchAssistAvailable = true;
      let groundNormal = new THREE.Vector3(0, 1, 0);
      const groundHit = groundSample(this.city, this.position.clone().add(new THREE.Vector3(0, 0.25, 0)), 0.8);
      if (groundHit?.normal) groundNormal.copy(groundHit.normal);
      else if (resolved.contacts?.length) {
        const floorContact = resolved.contacts.find(c => c.normal && c.normal.y > 0.5);
        if (floorContact) groundNormal.copy(floorContact.normal);
      }
      if (airborne) this.onLanding?.(this.position.clone(), impact, groundNormal);
      const moving = input.forward || input.backward || input.left || input.right;
      if (airborne && impact > 7) {
        const horizontal = Math.hypot(this.velocity.x, this.velocity.z);
        const rollEnd = this.position.clone().add(new THREE.Vector3(
          Math.sin(this.facingAngle) * 2.5, 0, Math.cos(this.facingAngle) * 2.5));
        const canRoll = impact > 24 && horizontal > 3 && !sweepBody(this.position, rollEnd, this.city.colliders)
          && this.supportHeight(rollEnd) !== null;
        this.state = canRoll ? 'ROLLING' : 'LANDING';
        const isSuperLanding = !canRoll && impact > 18 && !!this.character.actions?.slamLand;
        const key = canRoll ? 'roll' : (isSuperLanding ? 'slamLand' : 'land');
        this.recoveryTime = this.character.actions?.[key]?.getClip().duration || (key === 'roll' ? 1.55 : isSuperLanding ? 0.72 : 0.87);
        this.recoveryElapsed = 0;
        if (key === 'roll' && Math.hypot(this.velocity.x,this.velocity.z)>0.5) {
          this.facingAngle = Math.atan2(this.velocity.x,this.velocity.z);
          this.character.targetFacingAngle = this.facingAngle;
        }
      } else if (!['TURNING','LANDING','ROLLING'].includes(this.state)) {
        this.state = moving ? (input.sprint ? 'SPRINTING' : 'RUNNING') : 'IDLE';
      }
    }
    const col = sweptWall ? { ...sweptWall, collided: true, isWall: true, pen: 0 } :
      this.city.checkCollision(this.position, 0.7);

    if (col.collided) {
      if (col.isGround || col.isRoof) {
        return; // Only descending swept foot contact is a landing.
      } else if (col.isWall) {
        // Wall interaction: Wall Run or slide
        this.wallNormal.copy(col.normal);
        this.character.wallNormal = this.wallNormal;
        const face=this.city.raycast?.(this.position.clone().add(new THREE.Vector3(0,0.8,0)),col.normal.clone().negate(),1.2);
        this.character.wallDistance=face?.distance ?? 0.7;

        // Wall running requires explicit F input, not ordinary forward input.
        if (input.wallRun && input.forward && this.wallAttachCooldown === 0 && this.velocity.dot(col.normal) <= 0 &&
            ['IDLE','RUNNING','SPRINTING','FALLING','JUMPING'].includes(this.state)) {
          this.state = 'WALL_RUNNING';
          this.wallBuilding = col.building;
          this.wallRunTimer = 0;
          this.audio.playJump();
          if (this.isSwinging) this.releaseSwing();
        } else {
          // Push out of wall and slide
          this.position.addScaledVector(col.normal, col.pen ?? 0.1);
          // Cancel velocity into wall
          const vDot = this.velocity.dot(col.normal);
          if (vDot < 0) {
            this.velocity.sub(col.normal.clone().multiplyScalar(vDot));
          }
        }
      }
    }
  }

  resetPosition(reason = null) {
    this.onReset?.();
    // Spawn on a nice rooftop
    const spawn = this.city.getRooftopSpawn(95);
    this.position.copy(spawn);
    this.velocity.set(0, 0, 0);
    this.state = 'FALLING';
    this.recoveryTime = 0; this.recoveryElapsed = 0; this.zipTime = 0;
    this.wallAttachCooldown = 0;
    this.mantle=null;this.character.mantle=null;
    this.isSwinging = false;
    this.anchorPoint = null;
    this.anchorObject = null;
    this.webs=[];this.nextWebHand='left';this.pullHand=null;
    this.character.webAttachments=[];
    this.character.webLaunchTimers={};
    this.character.webHandWeights={};this.character.webHandTargets={};
    this.lastWebAnchor = null;
    this.lastWebNormal = null;
    this.webLatch = false;
    this.character.isTricking = false;
    this.character.trickRotation = 0;
    this.character.lastState = null;
    this.character.stopAnimation();
    this.zipTarget = null; this.zipAnchor = null; this.canAirJump = true;
    this.launchAssistAvailable = true;
    this.character.webShotTimer = 0; this.character.webShotAnchor = null;
    this.character.webArmWeight=0;this.character.webPoseAnchor=null;
    this.character.persistentWebAnchor = null;
    this.wallBuilding = null; this.wallRunTimer = 0; this.swingCooldown = 0;
    this.webFireCooldown = 0;
    this.facingAngle = 0; this.character.targetFacingAngle = 0;
    this.character.visualYaw = 0; this.character.bodyPitch = 0;
    this.character.idleFootAnchors = null; this.character.pendingTurn = null;
    this.character.idlePlantDelay=0;this.character.terrainPelvis=0;
    this.character.movingPlants=null;this.character.movingReleases=null;
    this.character.plantLastFeet=null;this.character.plantRoot=null;this.character.plantVelocityRoot=null;
    this.character.mantleHandTargets=null;
    this.character.updateWeb?.(false, null);
    this.previousFixedPosition.copy(this.position); this.renderPosition.copy(this.position);
    this.accumulator = 0; this.clearPendingInput();
    if (reason) this.onRecovery?.(reason);
  }

  clearPendingInput() { this.jumpBuffer = 0; this.coyoteTime = 0; this.webLatch = false; }

  supportHeight(pos) {
    if (this.city.supportHeight) {
      const centre=this.city.supportHeight(pos);
      if(centre!==null)return centre;
      // During autostep the capsule is supported by the tread ahead before
      // its centre crosses the riser. A centre-only ray falsely started a
      // fall and snapped the successful step back down on the next tick.
      let nearby=null;
      if(this.city.collisionWorld)for(const [x,z] of [[0.35,0],[-0.35,0],[0,0.35],[0,-0.35]]) {
        const p=pos.clone().add(new THREE.Vector3(x,0.2,z));
        const sample=groundSample(this.city,p,0.7);
        if(sample && Math.abs(pos.y-sample.height-0.1)<0.2)
          nearby=Math.max(nearby ?? -Infinity,sample.height);
      }
      return nearby;
    }
    if (Math.abs(pos.y - 0.1) < 0.04) return 0;
    for (const c of this.city.colliders || []) {
      if (pos.x >= c.minX && pos.x <= c.maxX && pos.z >= c.minZ && pos.z <= c.maxZ &&
          Math.abs(pos.y - c.maxY - 0.1) < 0.04) return c.maxY;
    }
    return null;
  }

  turnOnSpot(direction) {
    if (this.state !== 'IDLE' || this.velocity.length() > 0.1) return false;
    this.character.requestTurn(direction);
    this.turnStart = this.facingAngle;
    this.turnAmount = direction === 'left' ? -Math.PI/2 : Math.PI/2;
    this.recoveryTime = this.character.actions?.[direction === 'left' ? 'turnLeft' : 'turnRight']?.getClip().duration || 0.93;
    this.recoveryElapsed = 0; this.state = 'TURNING';
    return true;
  }
}
