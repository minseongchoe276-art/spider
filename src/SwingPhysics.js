import {MOBILE_ANCHOR_FAN,mobileAnchorScore} from './MobileTraversal.js';
import { AIR_TRICKS, selectAirTrick } from './AirTricks.js';
import * as THREE from 'three';
import { GROUNDED } from './MotionCatalog.js';
import { resolveBody, sweepBody } from './MovementCollision.js';
import { groundSample, planMantle, mantlePosition, resolveTraversal, hasMantleSupport } from './LedgeTraversal.js';
import { constrainWebs } from './WebConstraints.js';

const movementForward = (camera,target) => Number.isFinite(camera?.userData?.movementYaw)
  ? target.set(Math.sin(camera.userData.movementYaw),0,Math.cos(camera.userData.movementYaw))
  : camera?.getWorldDirection(target);

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
    this.walkSpeed = 4.4;
    this.sprintSpeed = 6.5;
    this.webWalkSpeed = 7;
    this.webRunSpeed = 9;
    this.webSprintSpeed = 12;
    this.groundAcceleration = 30.0;
    this.groundDeceleration = 24.0;
    this.jumpForce = 26.0;
    this.combatJumpForce = 8.0;
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
    this.airTrickChain = new Set();
    this.airTrickRepeats = new Map();
    this.character.onAirTrickComplete = () => {};

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
    this.webLatchRight = false;
    this.swingCooldown = 0;
    this.zipTarget = null;
    this.zipAnchor = null;
    this.onLanding = null;
    this.onRecovery = null;
    this.launchAssistAvailable = true;
    this.zipCooldown = 0;
    this.zipInterval = 0.28;
    this.zipMaxDistance = 12;
  }

  // Find optimal anchor point on building facade in front of player/camera
  groundMoveSpeed(input) {
    if(this.lowStance==='crouch')return 1.5;
    const web=this.webEnabled!==false && !this.character?.combatStance;
    if(input.sprint)return web?this.webSprintSpeed:this.sprintSpeed;
    if(input.run)return web?this.webRunSpeed:4.8;
    if(input.jog)return web?5.5:3.4;
    return web?this.webWalkSpeed:this.walkSpeed;
  }

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
    this.webFailureReason='대상 없음 · 건물을 향해 조준하세요.';
    this.bestAnchorCandidate = null;
    this.bestAnchorNormal = null;
    this.bestAnchorObject = null;
    camera.updateMatrixWorld(true);
    const eye=this.position.clone().add(new THREE.Vector3(0,1.3,0));
    const accept = hit => {
      if(!hit)return null;
      if(hit.distance<1 || hit.distance>130 || hit.point.distanceTo(eye)>130){this.webFailureReason='거리가 맞지 않습니다 · 부착 범위 1~130m';return null;}
      const normal=hit.face ? surfaceNormal(hit) : hit.normal?.clone().normalize() || new THREE.Vector3(0,1,0);
      if(this.webObstructed({anchor:hit.point,normal})){this.webFailureReason='장애물이 에너지 와이어 경로를 가립니다.';return null;}
      this.bestAnchorObject = hit.object;
      this.bestAnchorNormal = normal;
      this.bestAnchorCandidate = hit.point.clone();
      return this.bestAnchorCandidate;
    };

    // Desktop keeps exact reticle targeting. Mobile's opt-in traversal fan
    // still uses visible, supported surfaces and the same obstruction checks.
    this.raycaster.far = 130;
    this.raycaster.setFromCamera(this.webAimNdc, camera);
    const direct=this.castWebSurface(this.raycaster.ray.origin,this.raycaster.ray.direction,130);
    if(!this.mobileTraversalAssist)return accept(direct);
    let best=null,bestScore=Infinity;
    const consider=hit=>{
      if(!hit?.point)return;
      const score=mobileAnchorScore(hit.point,eye,camera);
      if(score>=bestScore)return;
      // The camera can see over a ledge that blocks the character's hand.
      if(!accept(hit))return;best=hit;bestScore=score;
    };
    consider(direct);
    for(const [x,y]of MOBILE_ANCHOR_FAN){
      this.raycaster.setFromCamera(new THREE.Vector2(x,y),camera);
      consider(this.castWebSurface(this.raycaster.ray.origin,this.raycaster.ray.direction,130));
    }
    this.bestAnchorCandidate=this.bestAnchorNormal=this.bestAnchorObject=null;
    return best?accept(best):null;
  }

  castWebSurface(origin,direction,distance) {
    // Streamed visuals contain hundreds of thousands of triangles. Rapier's
    // baked terrain already indexes those same surfaces and validates every
    // tether. Unbaked visuals cannot support a tether yet, so do not scan them.
    if(this.city.isStreamed && this.city.collisionWorld?.ready){
      const hit=this.city.raycast(origin,direction,distance,false);
      return hit?{...hit,object:hit.collider}:null;
    }
    this.raycaster.set(origin,direction);this.raycaster.far=distance;
    const hit=this.raycaster.intersectObjects(this.city.buildingMeshes,true)[0];
    this.raycaster.far=140;return hit;
  }

  // Right click passes the hand opposite the latest left-button rope.
  offhand() {
    return this.handForButton(2);
  }

  handForButton(button) {
    const owned=this.webs.findLast(web=>(web.button??0)===button);
    if(owned)return owned.hand;
    const other=this.webs.findLast(web=>(web.button??0)!==button);
    const base=other?.hand || this.nextWebHand;
    return other || button===2 ? (base==='left'?'right':'left') : base;
  }

  startSwing(camera,allowSame=true,shot=null) {
    if(this.webEnabled===false)return false;
    const anchor = this.findBestAnchor(camera);
    if (!anchor) {this.onWebFailure?.(this.webFailureReason);return false;}
    const hand=shot?.hand || this.nextWebHand;
    const button=shot?.button ?? 0;
    const sameHand=this.webs.find(web=>web.hand===hand);
    if (!allowSame && this.isSwinging && sameHand?.anchor.distanceTo(anchor) < 0.8 &&
        sameHand.object === this.bestAnchorObject) return false;
    const attachment={anchor,normal:this.bestAnchorNormal};
    if(this.webObstructed(attachment))return false;
    const grounded = GROUNDED.includes(this.state) ||
      (this.velocity.y <= 0 && this.supportHeight(this.position) !== null);

    if(this.state==='WEB_ZIP' && this.zipAnchor && !this.webs.length)this.webs=[{
      hand:this.pullHand || this.character.currentHand || 'left',button:0,anchor:this.zipAnchor.clone(),
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
    this.webs=this.webs.filter(web=>web.hand!==hand && (!shot || (web.button??0)!==button));
    this.webs.push({hand,button,anchor:anchor.clone(),normal:this.lastWebNormal.clone(),
      object:this.anchorObject,length:this.ropeLength,supportCollider:attachment.supportCollider,
      launchPending:(this.launchAssistAvailable && (grounded || this.velocity.y > 0)) || this.webs.some(web=>web.launchPending)});
    this.character.fireWeb?.(this.anchorPoint,hand);
    this.syncWebHands();
    if(shot?.advance!==false)this.nextWebHand=hand==='left'?'right':'left';

    // Restore the Oct 18 grounded web-launch feel. This runs only after the
    // reticle ray has attached to a valid, supported surface; a miss cannot
    // create either a rope or launch impulse.
    if (grounded && this.launchAssistAvailable) {
      this.velocity.y = Math.max(this.velocity.y, this.jumpForce);
      const toward = anchor.clone().sub(this.position);
      toward.y = 0;
      if (toward.lengthSq() < 1e-4) {
        camera.getWorldDirection(toward);
        toward.y = 0;
      }
      if (toward.lengthSq() < 1e-6) toward.set(Math.sin(this.facingAngle), 0, Math.cos(this.facingAngle));
      toward.normalize();
      const speed = this.velocity.dot(toward);
      if (speed < 14) this.velocity.addScaledVector(toward, 14 - speed);
      this.audio.playJump();
      this.jumpBuffer = 0; this.coyoteTime = 0;
    }

    this.launchAssistAvailable = false;

    this.audio.playWebShoot();
    this.onWebAttach?.(this.lastWebAnchor || this.anchorPoint);
    return true;
  }

  enterSwingFromPull(camera, button = 0) {
    const anchor = this.zipAnchor || this.lastWebAnchor;
    if (!anchor || !this.anchorSupported({anchor,normal:this.lastWebNormal})) return false;
    const radial = this.position.clone().sub(anchor).normalize();
    const radialSpeed = this.velocity.dot(radial);
    if(radialSpeed>0)this.velocity.addScaledVector(radial, -radialSpeed);
    this.anchorPoint = anchor.clone();
    this.anchorObject = this.bestAnchorObject || null;
    this.ropeLength = Math.max(1.45, this.position.distanceTo(anchor));
    const hand=this.pullHand || this.character.currentHand || 'left';
    this.webs=[{hand,button,anchor:anchor.clone(),normal:this.lastWebNormal?.clone(),
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

    // Leaving the rope preserves the current tangent velocity.
    this.anchorPoint = null;
    this.anchorObject = null;
    this.webs=[];
    this.clearWebVisuals(true);
    this.swingCooldown = 0;
    if (this.velocity.lengthSq() > this.maxSpeed * this.maxSpeed) this.velocity.clampLength(0, this.maxSpeed);
  }

  // Drop only the ropes owned by one mouse button. The last rope uses the
  // same inert release as letting go of a left-click pendulum.
  releaseWebButton(button) {
    if (!this.isSwinging) return;
    const dropped=this.webs.filter(web=>(web.button??0)===button);
    if (!dropped.length) return;
    this.webs=this.webs.filter(web=>(web.button??0)!==button);
    if (!this.webs.length) {
      this.releaseSwing(false);
      return;
    }
    this.syncWebHands();
    const latest=this.webs.at(-1);
    this.anchorPoint=latest.anchor;
    this.anchorObject=latest.object;
    this.ropeLength=latest.length;
    this.lastWebAnchor=latest.anchor.clone();
    this.lastWebNormal=latest.normal?.clone() || this.lastWebNormal;
    this.character.persistentWebAnchor=latest.anchor.clone();
    if (dropped.some(web=>web.hand===this.character.currentHand)) {
      this.character.webShotTimer=0;
      this.character.webShotAnchor=null;
    }
  }

  clearWebVisuals(preservePose = false) {
    this.city.collisionWorld?.setTetherColliders?.([]);
    this.character.webAttachments=[];
    this.character.persistentWebAnchor=null;
    this.character.webShotAnchor=null;
    this.character.webShotTimer=0;
    this.character.webShotIsMiss=false;
    // Hide the strand immediately, but let Character fade its reaching arm
    // out after release. Clearing IK here made the wrist snap in one frame.
    if(!preservePose){this.character.webHandWeights={};this.character.webHandTargets={};}
    this.character.webLaunchTimers={};
    this.character.updateWeb?.(false,null);
  }

  clearWebAnchor() {
    this.city.collisionWorld?.setTetherColliders?.([]);
    if (this.isSwinging) this.releaseSwing(false);
    this.lastWebAnchor = null;
    this.lastWebNormal = null;
    this.zipAnchor = null;
    this.zipTarget = null;
    this.zipTime = 0;
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
    if(this.webEnabled===false)return false;
    camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(aimNdc, camera);
    this.raycaster.far = 130;
    const hit = this.castWebSurface(this.raycaster.ray.origin,this.raycaster.ray.direction,130);
    this.raycaster.far = 140;
    let anchor = hit && hit.distance >= 1 && (hit.face || hit.normal) ? hit.point.clone() : null;
    let normal = anchor ? hit.face ? surfaceNormal(hit) : hit.normal.clone().normalize() : null;
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
    if(this.webEnabled===false)return false;
    // E is an optional airborne zip, never a repeated ground launch.
    if (GROUNDED.includes(this.state)) return false;
    // A zip already in flight cannot be retargeted.
    if (this.zipCooldown > 0 || this.state === 'MANTLING' || this.state === 'WEB_ZIP') return false;

    // Web Zip: Pulls character forward and upward
    camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(aimNdc, camera);
    this.raycaster.far = 80;
    const hit = this.castWebSurface(this.raycaster.ray.origin,this.raycaster.ray.direction,80);
    this.raycaster.far = 140;
    let anchor = hit && hit.distance >= 4 && (hit.face || hit.normal) && hit.point.distanceTo(this.position)<=80 ? hit.point.clone() : null;
    let normal = anchor ? hit.face ? surfaceNormal(hit) : hit.normal.clone().normalize() : null;
    let object = anchor ? hit.object : null;
    if (!anchor || anchor.distanceTo(this.position)>80) return false;
    normal ||= new THREE.Vector3(0,1,0);
    if(!this.anchorSupported({anchor,normal}))return false;
    const target = anchor.clone().addScaledVector(normal, 1.05);
    // Keep the player's feet above street level when the clicked surface is
    // near the ground; otherwise the zip immediately collides with the floor.
    target.y -= 0.8;
    const offset = target.clone().sub(this.position);
    const travel = offset.clampLength(0, this.zipMaxDistance);
    target.copy(this.position).add(travel);
    if (sweepBody(this.position, target, this.city.colliders)) return false;
    // The camera may see a target around a corner that the player's tether cannot reach.
    const eye = this.position.clone().add(new THREE.Vector3(0, 1.3, 0));
    const tether = anchor.clone().sub(eye);
    const obstruction = this.city.raycast?.(eye, tether.clone().normalize(), Math.max(0, tether.length() - 1.1));
    if (obstruction) return false;
    if (this.isSwinging) this.releaseSwing(false);
    const grounded = GROUNDED.includes(this.state) || this.supportHeight(this.position) !== null;
    this.zipTarget = target;
    this.zipAnchor = anchor.clone();
    this.lastWebAnchor=anchor.clone();this.lastWebNormal=normal.clone();
    this.bestAnchorObject=object;
    this.webs=[];this.character.webAttachments=[];
    this.pullHand=this.nextWebHand;
    this.character.fireWeb?.(this.zipAnchor,this.pullHand);
    this.nextWebHand=this.pullHand==='left'?'right':'left';
    this.velocity.clampLength(0, 22);
    if (grounded) this.velocity.y = Math.max(this.velocity.y, 12);
    this.audio.playWebShoot();
    this.onWebAttach?.(this.zipAnchor);
    this.canAirJump = true;
    this.zipCooldown = this.zipInterval;
    this.state = 'WEB_ZIP';
    this.mantle=null;
    this.zipTime = 1.05;
    this.recoveryTime = 0;
    this.wallBuilding = null;

    if (this.onStuntCallback) {
      this.onStuntCallback('WEB ZIP', 0);
    }
    return true;
  }

  performAirTrick(input = {}) {
    const key = typeof input === 'string' ? input : selectAirTrick(input);
    const trick = AIR_TRICKS[key];
    if (!Object.hasOwn(AIR_TRICKS, key) || this.character.isTricking) return false;
    if (this.character.webShotTimer>0 || this.webs.length || !['FALLING', 'JUMPING'].includes(this.state) || this.isSwinging) {
      if (this.state === 'SWINGING') this.onStuntCallback?.(key === 'back'
        ? '줄을 놓고 R로 공중 백플립을 연결하세요'
        : '줄을 놓고 T로 공중 묘기를 연결하세요', 0);
      return false;
    }
    if (this.character.contactTime < trick.duration + .15 || this.position.y < 3) {
      this.onStuntCallback?.('묘기를 마칠 높이가 부족합니다', 0);
      return false;
    }
    this.character.triggerAirTrick(key);
    this.audio.playTrickSound();
    this.onStuntCallback?.(trick.label, 0);
    return true;
  }

  toggleLowStance(stance) {
    if(stance!=='crouch' || !['IDLE','RUNNING','SPRINTING'].includes(this.state)
      || this.isSwinging || this.webs.length || this.character.combatAction?.duration>0)return false;
    this.lowStance=this.lowStance===stance?null:stance;
    this.character.lowStance=this.lowStance;
    return true;
  }

  update(delta, input, camera) {
    if (![...this.position, ...this.velocity].every(Number.isFinite)) this.resetPosition('invalid');
    // Landing impact is reported for exactly one character update.
    this.character.landingSpeed = 0;

    if(input.jump || input.wallRun || this.isSwinging || this.webs.length || this.character.combatAction?.duration>0
      || !['IDLE','RUNNING','SPRINTING'].includes(this.state))this.lowStance=null;
    this.character.lowStance=this.lowStance || null;
    const websLocked=this.webEnabled===false;
    if(websLocked){
      if(this.webs.length || this.zipAnchor || this.character.webShotTimer>0)this.clearWebAnchor();
      input.webZipHeld=false;
      input.webTap=input.webFireHeld=input.webHold=false;
      input.webTapRight=input.webFireHeldRight=input.webHoldRight=false;
    }
    // The reticle is advisory and its HUD refreshes at 10Hz. Dense streamed
    // triangles need no new search every render frame. Every actual swing/zip
    // still searches immediately in its action method, using the current view.
    this.anchorPreviewElapsed=(this.anchorPreviewElapsed ?? .1)+Math.max(0,delta);
    if(websLocked){this.bestAnchorCandidate=null;this.anchorPreviewElapsed=.1;}
    else if(this.anchorPreviewElapsed>=.1-1e-8){
      this.findBestAnchor(camera);this.anchorPreviewElapsed=0;
    }

    // 2. Each held mouse button keeps its own pendulum rope.
    const webTap = !!input.webTap;
    const webTapRight = !!input.webTapRight;
    input.webTap = false;
    input.webTapRight = false;
    this.webFireCooldown = Math.max(0, this.webFireCooldown - Math.max(0, delta));
    const showMiss=(hand)=>{
      this.raycaster.setFromCamera(this.webAimNdc,camera);
      const direction=this.raycaster.ray.direction.clone();
      direction.normalize();
      const target=this.position.clone().add(new THREE.Vector3(0,1.3,0)).addScaledVector(direction,28);
      this.character.fireWebMiss?.(target,hand);
      this.audio.playWebShoot?.();
    };
    if (webTap) {
      const hand=this.handForButton(0);
      const attached = this.startSwing(camera,true,{hand,button:0});
      if (!attached && !this.webs.some(web=>(web.button??0)===0)) showMiss(hand);
      if (!attached && !this.webs.some(web=>(web.button??0)===0) && this.state !== 'WEB_ZIP' && !input.webFireHeld) input.webHold = false;
      this.webFireCooldown = this.webFireInterval;
    } else if (input.webHold && (!this.webLatch || this.webFireCooldown===0) && !this.webs.some(web=>(web.button??0)===0) && this.state !== 'WEB_ZIP') {
      this.startSwing(camera,true,{hand:this.handForButton(0),button:0});
      this.webFireCooldown=this.webFireInterval;
    }
    if (webTapRight) {
      const hand=this.offhand();
      const attached=this.startSwing(camera,true,{hand,button:2,advance:false});
      if (!attached && !this.webs.some(web=>(web.button??0)===2)) showMiss(hand);
      if (!attached && !this.webs.some(web=>(web.button??0)===2) && this.state!=='WEB_ZIP' && !input.webFireHeldRight) input.webHoldRight=false;
      this.webFireCooldown = this.webFireInterval;
    } else if (input.webHoldRight && (!this.webLatchRight || this.webFireCooldown===0) && !this.webs.some(web=>(web.button??0)===2) && this.state!=='WEB_ZIP') {
      const hand=this.offhand();
      this.startSwing(camera,true,{hand,button:2,advance:false});
      this.webFireCooldown=this.webFireInterval;
    }
    const leftButton=!!(input.webFireHeld || input.webHold);
    const rightButton=!!(input.webFireHeldRight || input.webHoldRight);
    if (this.isSwinging && !leftButton) this.releaseWebButton(0);
    if (this.isSwinging && !rightButton) this.releaseWebButton(2);
    this.webLatch = leftButton;
    this.webLatchRight = rightButton;
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
    this.zipCooldown = Math.max(0, this.zipCooldown - step);
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

    // Keep ordinary play inside the city instead of teleporting at its edge.
    // Unexpected far-away coordinates still use the recovery guard below.
    if(this.softBoundary){const limit=this.city.playableHalfExtent||2400;
      for(const axis of ['x','z']){const distance=Math.abs(this.position[axis]);if(distance>limit-12&&distance<limit+5){
        const sign=Math.sign(this.position[axis]);if(this.velocity[axis]*sign>0)this.velocity[axis]*=Math.exp(-8*step);
        if(distance>limit-1){this.position[axis]=sign*(limit-1);if(this.velocity[axis]*sign>0)this.velocity[axis]=0;}
      }}
    }
    // 4. City Collisions
    this.handleCollisions(step, input);
    if (['SWINGING','WEB_ZIP'].includes(this.state) && Math.hypot(this.velocity.x,this.velocity.z)>0.5) {
      this.facingAngle=Math.atan2(this.velocity.x,this.velocity.z);
      this.character.targetFacingAngle=this.facingAngle;
    }
    this.jumpBuffer = Math.max(0, this.jumpBuffer - step);
    input.jump = false;
    this.velocity.clampLength(0, this.maxSpeed);
    if (![...this.position, ...this.velocity].every(Number.isFinite) || this.position.y < (this.city.isStreamed?-12:-40) ||
        Math.abs(this.position.x) > (this.city.playableHalfExtent || 2400) ||
        Math.abs(this.position.z) > (this.city.playableHalfExtent || 2400)) {
      this.resetPosition(this.position.y < (this.city.isStreamed?-12:-40) ? 'fall' : 'boundary');
      break;
    }
    }
    this.recoverySampleTime=(this.recoverySampleTime||0)+Math.max(0,delta);
    if(this.city.isStreamed&&this.recoverySampleTime>=.25&&['IDLE','RUNNING','SPRINTING'].includes(this.state)){
      this.recoverySampleTime=0;
      const support=this.city.collisionWorld?.groundSample(this.position,.5);
      if(support&&hasMantleSupport(this.city,this.position,support.height)&&
        !this.city.raycast?.(this.position.clone().add(new THREE.Vector3(0,.15,0)),new THREE.Vector3(0,1,0),1.65)){
        this.streamedRecoveryPosition=this.position.clone();
        this.city.collisionWorld.setRecoveryCollider?.(support.collider);
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
    this.character.contactTime = (this.velocity.y + Math.sqrt(this.velocity.y*this.velocity.y+2*this.gravity*clearance))/this.gravity;
    this.character.group.position.copy(this.renderPosition);
    this.character.surfaceProbe=(p,range=.8)=>groundSample(this.city,p,range);
    this.character.groundProbe=p=>this.character.surfaceProbe(p)?.height ?? null;
    this.character.mantle=this.state==='MANTLING'?this.mantle:null;
    if(!['IDLE','RUNNING','SPRINTING'].includes(this.state))this.lowStance=null;
    this.character.lowStance=this.lowStance || null;
    const visualState = this.animationState;
    this.character.recoveryProgress=visualState==='ROLLING' && this.recoveryTime>0
      ?this.recoveryElapsed/this.recoveryTime:null;
    this.character.update(delta, visualState, this.velocity,
      this.anchorPoint || this.zipAnchor || this.lastWebAnchor);

    // 6. Sound speed tracking
    const speedKmh = this.velocity.length() * 3.6;
    this.audio.setWindSpeed(speedKmh);
  }

  get animationState() {
    return this.isSwinging && this.webs.some(web=>web.launchPending) ? 'JUMPING' : this.state;
  }

  updateSwingPhysics(delta, input, camera) {
    // Compatibility for review fixtures that initialize a single anchor directly.
    if(!this.webs.length && this.anchorPoint)this.webs=[{
      hand:this.character.currentHand || 'left',anchor:this.anchorPoint.clone(),
      object:this.anchorObject,normal:this.lastWebNormal?.clone(),length:this.ropeLength}];
    const blocked=this.webs.filter(web=>{
      const obstructed=this.webObstructed(web);
      if(!obstructed){web.unsupportedTime=0;return false;}
      // Only temporary missing LOD support gets a grace; real walls still cut.
      if(web.supportMissing){web.unsupportedTime=(web.unsupportedTime || 0)+delta;return web.unsupportedTime>.35;}
      return true;
    });
    if(blocked.length) {
      this.webs=this.webs.filter(web=>!blocked.includes(web));
      this.syncWebHands();
      if(!this.webs.length){this.character.persistentWebAnchor=null;this.releaseSwing(false);return;}
    }
    const latest=this.webs.at(-1);
    this.syncWebHands();
    this.anchorPoint=latest.anchor;this.anchorObject=latest.object;this.ropeLength=latest.length;
    this.lastWebAnchor=latest.anchor.clone();this.lastWebNormal=latest.normal?.clone() || this.lastWebNormal;
    // A supported body receives the floor's normal force. Applying gravity
    // through a taut diagonal rope before resolving the floor pumped sideways
    // speed into a player standing still with a held strand.
    const supportedRest=Math.abs(this.velocity.y)<1e-6 && this.supportHeight(this.position)!==null;
    if(!supportedRest)this.velocity.y-=this.gravity*delta;
    // The takeoff is ballistic. Catch the strand near the jump apex at its
    // current distance, then keep that length for the entire swing. This
    // transfers weight without pulling or snapping the body to a smaller radius.
    for (const web of this.webs) {
      if (web.launchPending && this.velocity.y <= 0) {
        web.length = Math.max(1.45, this.position.distanceTo(web.anchor));
        web.launchPending = false;
      }
    }
    constrainWebs(this.position,this.velocity,this.webs);
    const taut=this.webs.filter(web=>this.position.distanceTo(web.anchor)>=web.length-1e-4);
    if(this.webs.length && !this.webs.some(web=>web.launchPending)) {
      // Gentle player effort acts across the rope, never reels it inward.
      const camForward=new THREE.Vector3();
      movementForward(camera,camForward);
      camForward.y=0;
      if(camForward.lengthSq()<1e-6)camForward.set(Math.sin(this.facingAngle),0,Math.cos(this.facingAngle));
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
    this.city.collisionWorld?.setTetherColliders?.(this.webs.map(web=>web.supportCollider?.handle).filter(handle=>handle!==undefined));
    this.character.webAttachments=this.webs.map(web=>({hand:web.hand,anchor:web.anchor,length:web.length}));
    const latest=this.webs.at(-1);
    this.character.persistentWebAnchor=latest?.anchor.clone() || null;
    // Shot visuals outlive their launch animation. When collision severs a
    // hand, its transient shot must not redraw a rope physics already removed.
    if(!this.character.webShotIsMiss && !this.webs.some(web=>web.hand===this.character.currentHand)) {
      this.character.webShotTimer=0;
      this.character.webShotAnchor=null;
    }
    for(const hand of Object.keys(this.character.webLaunchTimers || {})) {
      if(!this.webs.some(web=>web.hand===hand) &&
        !(this.character.webShotIsMiss && this.character.webShotTimer>0 && hand===this.character.currentHand))
        delete this.character.webLaunchTimers[hand];
    }
  }

  anchorSupported(web) {
    if(!this.city.isStreamed)return true;
    if(!this.city.collisionWorld?.ready || !web.anchor)return false;
    // The original validated triangle remains a real attachment during LOD changes.
    if(web.supportCollider && this.city.collisionWorld.meshes &&
      [...this.city.collisionWorld.meshes.values()].some(entry=>entry?.collider===web.supportCollider))return true;
    const normal=(web.normal || this.lastWebNormal || new THREE.Vector3(0,1,0)).clone().normalize();
    const probe=web.anchor.clone().addScaledVector(normal,.8);
    const hit=this.city.raycast(probe,normal.clone().negate(),1.6,false);
    const supported=!!hit && hit.point.distanceTo(web.anchor)<1.25 && Math.abs(hit.normal.dot(normal))>.25;
    if(supported)web.supportCollider=hit.collider;
    return supported;
  }

  webObstructed(web) {
    web.supportMissing=!this.anchorSupported(web);
    if(web.supportMissing)return true;
    const lineStart = this.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    const line = web.anchor.clone().sub(lineStart);
    if(line.length()<1e-8)return false;
    this.raycaster.set(lineStart, line.clone().normalize());
    // The tether must be allowed to terminate on the facade it is attached to.
    // Leave a small endpoint margin so triangle seams do not sever valid webs.
    this.raycaster.far = Math.max(0, line.length() - 1.0);
    const collisionObstruction = this.city.raycast?.(lineStart,line.clone().normalize(),this.raycaster.far,false);
    const visualObstruction = this.city.collisionWorld ? null :
      this.raycaster.intersectObjects(this.city.buildingMeshes, true)[0];
    this.raycaster.far = 140;
    const nearEndpoint=hit=>hit?.point && hit.point.distanceTo(web.anchor)<1.5 &&
      web.normal && (hit.normal || (hit.face && surfaceNormal(hit)))?.dot(web.normal)>.5;
    return !!((collisionObstruction && !nearEndpoint(collisionObstruction)) ||
      (visualObstruction && !nearEndpoint(visualObstruction)));
  }

  updateWallRunPhysics(delta, input, camera) {
    this.wallRunTimer += delta;
    this.facingAngle=Math.atan2(-this.wallNormal.x,-this.wallNormal.z);
    this.character.targetFacingAngle=this.facingAngle;
    const inward=this.wallNormal.clone().negate();
    const chestHit=this.city.raycast?.(this.position.clone().add(new THREE.Vector3(0,.8,0)),inward,1.1);
    const lowerHit=this.city.raycast?.(this.position.clone().add(new THREE.Vector3(0,.2,0)),inward,1.1);
    const footHit=this.city.collisionWorld&&this.city.raycast?.(this.position.clone().add(new THREE.Vector3(0,-.65,0)),inward,1.1);
    const wallHit=[chestHit,lowerHit,footHit].find(hit=>hit?.normal.dot(this.wallNormal)>.35);
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
    if(!input.forward || !input.wallRun){
      this.state='FALLING';this.wallBuilding=null;this.velocity.copy(this.wallNormal).multiplyScalar(3);
      return;
    }

    // At the top edge, enter the roof only when the capsule footprint has a
    // real walkable surface. Otherwise release into a fall.
    const roofProbe=this.position.clone().addScaledVector(this.wallNormal,-0.8)
      .add(new THREE.Vector3(0,1.1,0));
    const roofRange=this.city.collisionWorld?2.5:1.4;
    const roof=this.city.collisionWorld
      ? this.city.collisionWorld.groundAt(roofProbe,roofRange)
      : (this.city.colliders || []).filter(c => roofProbe.x >= c.minX && roofProbe.x <= c.maxX &&
          roofProbe.z >= c.minZ && roofProbe.z <= c.maxZ && c.maxY <= roofProbe.y &&
          c.maxY >= roofProbe.y - roofRange).sort((a,b) => b.maxY-a.maxY)[0]?.maxY;
    if (roof!==null && roof!==undefined && roof-this.position.y>=-(this.city.collisionWorld?1.35:.2) && roof-this.position.y<0.9) {
      const plan=planMantle(this.city,this.position,this.wallNormal,roof);
      if(plan){
        this.character.cancelAirTrick?.();
        this.mantle=plan;this.velocity.set(0,0,0);this.state='MANTLING';return;
      }
      if(!this.city.collisionWorld&&wallHit&&(!chestHit||chestHit.normal.dot(this.wallNormal)<.35)){
        this.velocity.set(0,0,0);
        if(input.strafe){this.velocity.crossVectors(new THREE.Vector3(0,1,0),this.wallNormal).multiplyScalar(input.strafe*2.8);this.position.addScaledVector(this.velocity,delta);}
        return;
      }
      // Railing gaps can have no chest-height triangle while the feet still
      // grip the facade. Keep climbing outside it until the hands can clear
      // the top bar. The ordinary swept capsule still blocks actual ceilings.
    }

    if (!wallHit || (!chestHit && !lowerHit && !Number.isFinite(roof)) || wallHit.normal.dot(this.wallNormal)<0.35) {
      this.state='FALLING';
      this.wallBuilding=null;
      this.velocity.addScaledVector(this.wallNormal,5);
      return;
    }

    // Wall run velocity: run vertically up the wall
    const upDir = new THREE.Vector3(0, 1, 0);
    const nearEdge=Number.isFinite(roof) && roof-this.position.y<1.1;
    this.velocity.copy(upDir.multiplyScalar(nearEdge?2.4:input.sprint?4.2:2.8));

    // Optional horizontal run along wall face
    if (input.strafe !== 0) {
      // Look into the wall is -normal, so screen-right is up × normal.
      const wallSide = new THREE.Vector3().crossVectors(upDir, this.wallNormal).normalize();
      this.velocity.add(wallSide.multiplyScalar(input.strafe * 2.4));
    }

    // Lateral movement can leave the outer corner of the current facade.
    if ((this.wallBuilding && (this.position.x < this.wallBuilding.minX - 0.8 ||
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
    if(!hasMantleSupport(this.city,plan.end,plan.end.y-.1)){cancel();return;}
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
    if (this.state === 'WEB_ZIP' && this.zipTarget && this.webObstructed({anchor:this.zipAnchor,normal:this.lastWebNormal}))this.clearWebAnchor();
    if (this.state === 'WEB_ZIP' && this.zipTarget) {
      this.zipTime -= delta;
      const toTarget = this.zipTarget.clone().sub(this.position);
      const distance = toTarget.length();
      if (distance < 0.28) {
        this.jumpBuffer = 0;
        // Either held hand can retain the arriving tether, with its own
        // button ownership so releasing that button drops the rope.
        const heldButton=(input.webHold || input.webFireHeld) ? 0
          : (input.webHoldRight || input.webFireHeldRight) ? 2 : null;
        if (heldButton !== null && this.enterSwingFromPull(camera,heldButton)) return;
        this.clearWebAnchor();
      } else if (this.zipTime <= 0 || input.jump) {
        this.clearWebAnchor();
        this.jumpBuffer = 0;
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
      if (this.recoveryElapsed > this.recoveryTime * (this.state==='ROLLING'?.88:.45) &&
          (input.jump || input.forward || input.backward || input.left || input.right)) {
        if(this.landingCarry && (input.forward||input.backward||input.left||input.right)){const carry=this.landingCarry.clone().clampLength(0,this.groundMoveSpeed(input));this.velocity.x=carry.x;this.velocity.z=carry.z;}
        this.state = 'IDLE'; this.recoveryTime = 0;this.landingCarry=null;
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
    movementForward(camera,camForward);
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
    if(isGrounded && (combat?.direction || combat?.plant))moveDir.set(0,0,0);
    if (moveDir.lengthSq() > 0.001) {
      moveDir.normalize();
      const nextFacingAngle = Math.atan2(moveDir.x, moveDir.z);
      // Combat keeps the body on the aim. Turning to face a backstep made the
      // punch start with a half-turn, and the knees passed through that spin.
      const aim = new THREE.Vector3();
      movementForward(camera, aim);
      aim.y = 0;
      const aimLocked = !!(this.character.combatStance && aim.lengthSq() > 1e-6);
      const facingTarget = aimLocked ? Math.atan2(aim.x, aim.z) : nextFacingAngle;
      const turnDelta = Math.atan2(
        Math.sin(facingTarget - this.facingAngle),
        Math.cos(facingTarget - this.facingAngle)
      );
      if (!aimLocked && isGrounded && Math.abs(turnDelta) > 0.45 && this.velocity.length() > 0.5) {
        this.character.requestTurn(turnDelta > 0 ? 'right' : 'left');
      }
      if(!combat || combat.key==='guard'){this.facingAngle = facingTarget;this.character.targetFacingAngle = this.facingAngle;}
    }

    if (isGrounded) {
      const moveSpeed = this.groundMoveSpeed(input);
      const targetVelocity = combat?.direction?combat.direction.clone().multiplyScalar(combat.speed ?? 7):moveDir.clone().multiplyScalar(moveSpeed*(combat?.key==='guard'?0.35:1));
      if(combat?.direction)moveDir.copy(combat.direction);
      if (moveDir.lengthSq() > 0.001) {
        this.velocity.x = combat?.direction?targetVelocity.x:THREE.MathUtils.damp(this.velocity.x,targetVelocity.x,9,delta);
        this.velocity.z = combat?.direction?targetVelocity.z:THREE.MathUtils.damp(this.velocity.z,targetVelocity.z,9,delta);
        this.state = input.sprint && !this.lowStance ? 'SPRINTING' : 'RUNNING';
      } else {
        this.velocity.x = THREE.MathUtils.damp(this.velocity.x, 0, combat?.plant ? 32 : 8, delta);
        this.velocity.z = THREE.MathUtils.damp(this.velocity.z, 0, combat?.plant ? 32 : 8, delta);
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
        const isCombat = !this.webEnabled || !!this.character?.combatStance;
        this.velocity.y = isCombat ? this.combatJumpForce : this.jumpForce;
        this.state = 'JUMPING';
        this.audio.playJump();
      }
    } else {
      if (input.jump && this.coyoteTime > 0) {
        const isCombat = !this.webEnabled || !!this.character?.combatStance;
        this.velocity.y = isCombat ? this.combatJumpForce : this.jumpForce; this.state = 'JUMPING';
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

    // Bound displacement as well as the velocity displayed after the step.
    this.velocity.clampLength(0, this.maxSpeed);
    // Integrate position
    this.position.addScaledVector(this.velocity, delta);
  }

  handleCollisions(delta, input) {
    if(this.state==='MANTLING')return; // Traversal already resolves its swept capsule.
    const previous = this.previousPosition || this.position;
    const fallingSpeed = this.velocity.y;
    const collisionSpeed=this.velocity.length();
    const resolved = this.city.resolveMovement
      ? this.city.resolveMovement(previous, this.position, this.velocity)
      : resolveBody(previous, this.position, this.velocity, this.city.colliders);
    this.position.copy(resolved.position);
    const sweptWall = resolved.contacts.find(hit => Math.abs(hit.normal.y) < 0.5 && hit.blocked!==false);
    if(sweptWall && collisionSpeed>8 && !input.wallRun)this.onCollision?.();
    if (resolved.contacts.some(contact=>contact.blocked!==false) && this.state === 'WEB_ZIP') this.clearWebAnchor();
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
      const supportY=(floor ?? support)+.1;
      if(this.isSwinging && (input.webHold || input.webFireHeld || input.webHoldRight || input.webFireHeldRight) &&
        this.webs.some(web=>web.anchor.y>supportY+4)){
        // A taut held strand catches a grazing floor contact and returns the
        // player to its arc, matching the established swing rhythm.
        this.position.y=this.city.resolveMovement?Math.max(supportY,resolved.position.y):supportY;
        this.velocity.y=Math.max(this.velocity.y,this.jumpForce);
        for(const web of this.webs)web.launchPending=true;
        this.recoveryTime=0;this.state='SWINGING';return;
      }
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
      if (airborne) {
        this.character.cancelAirTrick?.();
        this.airTrickChain.clear();
        this.airTrickRepeats.clear();
      }
      if (airborne){this.landingCarry=this.velocity.clone().setY(0);this.onLanding?.(this.position.clone(), impact, groundNormal);}
      const moving = input.forward || input.backward || input.left || input.right;
      const isCombat = !this.webEnabled || !!this.character?.combatStance;
      const landingThreshold = isCombat ? 11 : 7;
      if (airborne && impact > landingThreshold) {
        const horizontal = Math.hypot(this.velocity.x, this.velocity.z);
        const rollFacing=horizontal>.5?Math.atan2(this.velocity.x,this.velocity.z):this.facingAngle;
        const rollPoints=this.character.actions?.roll?.getClip().userData?.rootMotion || [];
        const rollDistance=Math.max(2.5,(rollPoints.at(-1)?.distance || 0)-(rollPoints[0]?.distance || 0))+.35;
        const direction=new THREE.Vector3(Math.sin(rollFacing),0,Math.cos(rollFacing));
        const rollEnd=this.position.clone().addScaledVector(direction,rollDistance);
        // A vertical or slow descent has no forward travel to carry through
        // a roll. Use the compact landing even when the impact is strong.
        let canRoll=horizontal>=4.5 && !sweepBody(this.position,rollEnd,this.city.colliders);
        let rollPrevious=this.position.clone();
        for(let distance=.4;canRoll && distance<rollDistance+.4;distance+=.4){
          const sample=this.position.clone().addScaledVector(direction,Math.min(distance,rollDistance));
          canRoll=this.supportHeight(sample)!==null;
          // Streamed maps have triangle colliders rather than AABBs. Sweep
          // the same capsule used in play before committing to a full roll.
          if(canRoll && (this.city.resolveMovement || this.city.collisionWorld?.resolve)){
            const resolved=resolveTraversal(this.city,rollPrevious,sample);
            canRoll=Math.hypot(resolved.position.x-sample.x,resolved.position.z-sample.z)<.075 &&
              !resolved.contacts.some(contact=>contact.blocked!==false && contact.normal.y<.5);
            rollPrevious.copy(resolved.position);
          }
        }
        this.state = canRoll ? 'ROLLING' : 'LANDING';
        if(!canRoll)this.character.landingAction='land';
        // Fall recovery uses the forward roll when there is supported room.
        // A blocked edge keeps a compact landing instead of rolling off it.
        const key = canRoll ? 'roll' : 'land';
        this.recoveryTime = this.character.actions?.[key]?.getClip().duration || (canRoll ? 1.55 : .87);
        this.recoveryElapsed = 0;
        if (key === 'roll') {
          this.facingAngle = rollFacing;
          this.character.targetFacingAngle = this.facingAngle;
        }
      } else if (!['TURNING','LANDING','ROLLING'].includes(this.state)) {
        const slide = Math.hypot(this.velocity.x, this.velocity.z);
        const dodge = this.combatMotion?.key?.startsWith('dodge');
        const hit = this.combatMotion?.key === 'hit' || this.combatMotion?.key === 'hitHead' || this.combatMotion?.key === 'hitBody' || this.combatMotion?.key === 'hitHeavy' || this.combatMotion?.key === 'hitUppercut';
        // A released dodge or hit still carries speed. Idle here swapped the
        // whole body to a still clip and popped the feet.
        if (dodge) this.state = input.sprint && slide > 4.2 ? 'SPRINTING' : 'RUNNING';
        else if (hit && slide > 0.45) this.state = slide > 4.2 || input.sprint ? 'SPRINTING' : 'RUNNING';
        else this.state = moving ? (input.sprint ? 'SPRINTING' : 'RUNNING') : 'IDLE';
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
        const face=this.city.raycast?.(this.position.clone().add(new THREE.Vector3(0,0.8,0)),col.normal.clone().negate(),1.2)
          || this.city.raycast?.(this.position.clone().add(new THREE.Vector3(0,0.2,0)),col.normal.clone().negate(),1.2);
        // Capsule edge contacts are rounded and can point diagonally away
        // from a flat facade. Use its real surface normal for the grip and
        // roof probe so a corner cannot turn the feet or miss the landing.
        const alignment=face?.normal?.dot(col.normal);
        const facade=face?.normal && Math.abs(face.normal.y)<.2 && alignment>.35;
        if(facade)this.wallNormal.copy(face.normal).normalize();
        this.character.wallDistance=face ? face.distance*(facade?alignment:1) : .7;

        // Wall running requires explicit F input, not ordinary forward input.
        if (input.wallRun && input.forward && this.wallAttachCooldown === 0 && this.velocity.dot(col.normal) <= 0 &&
            ['IDLE','RUNNING','SPRINTING','FALLING','JUMPING'].includes(this.state)) {
          this.state = 'WALL_RUNNING';
          this.character.cancelAirTrick?.();
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
    this.lowStance=null;this.character.lowStance=null;
    this.character.crouchBlend=0;
    this.character.crouchWeight=0;
    this.city.collisionWorld?.setTetherColliders?.([]);
    this.onReset?.();
    this.landingCarry=null;
    this.character.cancelAirTrick?.();
    this.airTrickChain.clear();
    this.airTrickRepeats.clear();
    // Spawn on a nice rooftop
    const saved=this.streamedRecoveryPosition;
    const recover=reason&&this.city.isStreamed&&saved&&hasMantleSupport(this.city,saved,saved.y-.1)&&
      !this.city.raycast?.(saved.clone().add(new THREE.Vector3(0,.15,0)),new THREE.Vector3(0,1,0),1.65);
    const spawn = recover?saved.clone():this.city.getRooftopSpawn(95);
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
    this.webLatchRight = false;
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
    this.anchorPreviewElapsed=.1;this.bestAnchorCandidate=null;
    this.zipCooldown = 0;
    this.facingAngle = this.city.getSpawnFacing?.(spawn)||0; this.character.targetFacingAngle = this.facingAngle;
    this.character.visualYaw = this.facingAngle; this.character.bodyPitch = 0;
    this.character.idleFootAnchors = null; this.character.pendingTurn = null;
    this.character.idlePlantDelay=0;this.character.terrainPelvis=0;
    this.character.movingPlants=null;this.character.movingReleases=null;
    this.character.plantLastFeet=null;this.character.plantRoot=null;this.character.plantVelocityRoot=null;
    this.character.groundFootRotations=null;this.character.wallViewWeight=0;this.character.wallPhase=0;
    this.character.mantleHandTargets=null;
    this.character.updateWeb?.(false, null);
    this.previousFixedPosition.copy(this.position); this.renderPosition.copy(this.position);
    this.accumulator = 0; this.clearPendingInput();
    if (reason) this.onRecovery?.(reason);
  }

  clearPendingInput() { this.jumpBuffer = 0; this.coyoteTime = 0; this.webLatch = false; this.webLatchRight = false; }

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
