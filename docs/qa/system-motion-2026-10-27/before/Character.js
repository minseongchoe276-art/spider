import {poseLowStance} from './LowStance.js';
import {poseWebShotBody} from './WebShotPose.js';
import {poseForwardRoll} from './ForwardRoll.js';
import {loadAppearances,updateAppearance,disposeAppearance} from './CharacterAppearance.js';
import {createJointConstraints,constrainJoints,stabilizeEndJoints} from './JointConstraints.js';
import { AIR_TRICKS, trickRotation } from './AirTricks.js';
import { createWebStrand, updateWebStrand } from './WebStrand.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { retargetMotion, prepareMotion, boneId } from './MotionRetarget.js';
import { MOTIONS, STRIDES, GROUNDED } from './MotionCatalog.js';
import { fetchAsset, forEachConcurrent } from './AssetLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { plantMovingFeet, poseWall, poseZipLegs, poseMantle, adaptPelvisToTerrain, footSupport, soleRotation, clearGroundSoles, fitGroundAnkle, alignCombatWrists, alignCombatGaze, alignStrikeFootwork, poseCombatLife, settleStrikeBalance, heavyClipPhase, leadAirborneKnees, settleHeldStance, reuseHeldGroundPose, cacheGroundPose, clearImpactBody, prepareImpactBody } from './CharacterPose.js';
import {createHandPoseRig,restoreHandPose,updateWebHandPose} from './WebHandPose.js';

export class Character {
  constructor(scene, onProgress, onLoaded, source = null) {
    this.scene = scene;
    this.onProgress = onProgress;
    this.onLoaded = onLoaded;
    this.group = new THREE.Group();
    this.group.name = 'ShadowPulseCharacterGroup';
    this.scene.add(this.group);

    this.model = null;
    this.mixer = null;
    this.actions = {};
    this.activeAction = null;
    this.bones = {};
    this.isLoaded = false;

    // Hands for alternating web shooting
    this.rightHand = null;
    this.leftHand = null;
    this.currentHand = 'left';
    this.webAttachments = [];
    this.webHandWeights = {};
    this.webHandTargets = {};
    this.webLaunchTimers = {};
    this.webShotTimer = 0;
    this.webShotAnchor = null;
    this.persistentWebAnchor = null;

    // Procedural swing / trick tilt
    this.bodyRoll = 0;
    this.bodyPitch = 0;
    this.trickRotation = 0;
    this.isTricking = false;
    this.targetFacingAngle = 0;
    this.idleTime = 0;
    this.fallTime = 0;
    this.lastState = null;
    this.pendingTurn = null;
    this.landingSpeed = 0;
    this.landingAction = null;

    // Web rope visual
    this.initWebVisual();

    // Start loading models and animations
    if (source) {
      this.copySource = source;
      this.copyLoadedCharacter(source);
    }
    else this.loadCharacter();
  }

  copyLoadedCharacter(source) {
    // A room snapshot can arrive before the skin and all animation clips.
    // Wait for the actual actor instead of permanently cloning a loading proxy.
    if (!source.model || !source.mixer || source.isLoaded === false) return false;
    if (this.model) return true;
    this.appearances = source.appearances;
    this.model = cloneSkeleton(source.model);
    this.model.visible = true;
    this.model.position.set(0,0,0); this.model.rotation.set(0,0,0);
    this.group.add(this.model);
    this.model.traverse(child => {
      if (!child.isBone) return;
      this.bones[child.name] = child;
      if (boneId(child.name)==='lefthand') this.leftHand = child;
      if (boneId(child.name)==='righthand') this.rightHand = child;
    });
    if(source.restBonePose){
      this.restPoseModel=this.model;
      this.restBonePose=source.restBonePose.flatMap(sample=>{
        const bone=this.bones[sample.bone.name];
        return bone?[{bone,p:sample.p.clone(),q:sample.q.clone(),s:sample.s.clone()}]:[];
      });
      for(const {bone,p,q,s} of this.restBonePose){bone.position.copy(p);bone.quaternion.copy(q);bone.scale.copy(s);}
    }
    this.webFingerRig=createHandPoseRig(this.model,this.bones);
    for(const side of ['left','right'])for(const item of this.webFingerRig[side])item.bone.quaternion.copy(item.rest);
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const [key,original] of Object.entries(source.actions)) {
      const action = this.mixer.clipAction(original.getClip());
      action.setLoop(original.loop,original.repetitions);
      action.clampWhenFinished = original.clampWhenFinished;
      this.actions[key] = action;
    }
    this.isLoaded = true;
    this.copySource = null;
    prepareImpactBody(this);
    return true;
  }

  disposeCopy() {
    disposeAppearance(this);
    this.copySource = null;
    this.mixer?.stopAllAction(); if (this.model) this.mixer?.uncacheRoot(this.model);
    this.model?.traverse(mesh => mesh.skeleton?.dispose());
    this.scene.remove(this.group);
    if (this.placeholder) {this.placeholder.geometry.dispose();this.placeholder.material.dispose();}
    for (const object of [this.webLine,this.webMesh,this.webLineOffhand,this.webMeshOffhand]) {
      this.scene.remove(object);object.geometry.dispose();object.material.dispose();
    }
    // Shared skin geometry, textures, and animation clips belong to the local actor.
  }

  initWebVisual() {
    const primary=createWebStrand(this.scene),secondary=createWebStrand(this.scene);
    this.webLine=primary.line;this.webMesh=primary.mesh;
    this.webLineOffhand=secondary.line;this.webMeshOffhand=secondary.mesh;
    this.webVisualTime=0;
  }

  async loadCharacter() {
    // 1. Placeholder while loading so player has instant visual feedback
    const placeholderGeom = new THREE.CapsuleGeometry(0.35, 1.1, 8, 16);
    const placeholderMat = new THREE.MeshStandardMaterial({
      color: 0xff2a3a,
      roughness: 0.3,
      metalness: 0.5
    });
    this.placeholder = new THREE.Mesh(placeholderGeom, placeholderMat);
    this.placeholder.position.y = 0.9;
    this.group.add(this.placeholder);

    const gltfLoader = new GLTFLoader();
    const fbxLoader = null;

    try {
      this.onProgress?.(30, 'SHADOW PULSE 캐릭터 불러오는 중...');
      // Load the shared character rig
      const gltf = await gltfLoader.parseAsync(await fetchAsset('/models/shadow-pulse-rig.glb'), '/models/');

      this.model = gltf.scene;
      // The exported GLB is already roughly human-sized (about 2 world units tall).
      // Scaling it to 0.012 made the character only a few centimetres tall and
      // effectively invisible beside the city.
      this.model.scale.setScalar(1);
      this.model.position.y = 0;

      this.onProgress?.(45, '캐릭터 뼈대와 외형 준비 중...');
      this.appearances = await loadAppearances();

      // Enable shadows and find bones
      this.model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material) {
            child.material.roughness = 0.45;
            child.material.metalness = 0.3;
          }
        }
        if (child.isBone) {
          this.bones[child.name] = child;
          if (boneId(child.name) === 'righthand') {
            this.rightHand = child;
          }
          if (boneId(child.name) === 'lefthand') {
            this.leftHand = child;
          }
        }
      });

      // Remove placeholder and add model
      this.group.remove(this.placeholder);
      this.placeholder.geometry.dispose();
      this.placeholder.material.dispose();
      this.group.add(this.model);
      this.webFingerRig=null;

      updateAppearance(this,0);
      prepareImpactBody(this);
      this.mixer = new THREE.AnimationMixer(this.model);

      // Embedded animation if available
      if (gltf.animations && gltf.animations.length > 0) {
        const defaultClip = gltf.animations[0];
        defaultClip.name = 'default';
        const defaultAction = this.mixer.clipAction(defaultClip);
        this.actions['default'] = defaultAction;
      }

      this.onProgress?.(65, '스윙 및 질주 애니메이션 로드 중...');
      // Load FBX animations
      await this.loadFbxAnimations(fbxLoader);

      // Start from a clean state. The state machine below selects the proper
      // downloaded Mixamo clip after the character enters the game.
      this.stopAnimation();

      this.readyMilliseconds = performance.now();
      this.isLoaded = true;
      this.onProgress?.(100, '준비 완료!');
      this.onLoaded?.();
      console.log('SHADOW PULSE character and animations successfully loaded!');
    } catch (err) {
      console.warn('Failed loading GLTF/FBX models, keeping high-poly proxy:', err);
      this.loadWarning = '캐릭터 리소스를 불러오지 못해 대체 캐릭터로 실행합니다.';
      this.readyMilliseconds = performance.now();
      this.isLoaded = true;
      this.onProgress?.(100, this.loadWarning);
      this.onLoaded?.();
    }
  }

  async loadFbxAnimations(fbxLoader) {
    const animFiles = MOTIONS;
    const sources = new Map();

    await forEachConcurrent(animFiles, 4, async item => {
      try {
        let clip;
        try {
          const data = JSON.parse(new TextDecoder().decode(await fetchAsset(`/motions/${item.key}.json`)));
          clip = THREE.AnimationClip.parse(data);
          clip.userData = data.userData || {};
          if (!Number.isFinite(clip.duration) || clip.duration <= 0 || !(clip.userData.matchedBones >= 20) || !clip.tracks.length ||
              !clip.tracks.every(track => track.values.every(Number.isFinite))) throw new Error('Invalid compiled motion');
        } catch {
          // Existing asset folders remain usable without precompiled tracks.
        if (!sources.has(item.url)) {
          sources.set(item.url, fetchAsset(item.url));
        }
        const raw=await sources.get(item.url);
        const gltf=item.url.endsWith('.glb')?await new GLTFLoader().parseAsync(raw,'/models/sources/'):null;
        const fbx = gltf?.scene || (fbxLoader ||= new (await import('three/examples/jsm/loaders/FBXLoader.js')).FBXLoader()).parse(raw, '/models/');
        if(gltf)fbx.animations=gltf.animations;

        if (fbx.animations && fbx.animations.length > 0) {
          const sourceClip = fbx.animations.find(c => (!item.take || c.name===item.take) && c.duration > 0 && c.tracks.length > 0);
          if (!sourceClip) throw new Error('No animated take in FBX');
          clip = retargetMotion(this.model, fbx, sourceClip);
          clip = prepareMotion(clip, item.key, this.bones,item);
        }
        }
        if (clip) {
          console.info('Motion verified', item.key, clip.userData.matchedBones, 'bones');
          clip.name = item.key;
          const action = this.mixer.clipAction(clip);

          if (item.loop) {
            action.setLoop(THREE.LoopRepeat);
          } else {
            action.setLoop(THREE.LoopOnce);
            action.clampWhenFinished = true;
          }

          this.actions[item.key] = action;
        }
      } catch (e) {
        this.loadWarning = '일부 모션을 불러오지 못했습니다. 가능한 대체 모션을 사용합니다.';
        console.warn(`Could not load animation ${item.key}:`, e);
      }
    });
  }

  captureTransitionPose() {
    if(!this.model || !this.mixer)return null;
    if(!this.transitionPoseAction){
      const nodes=[];this.model.traverse(node=>{if(node.isBone)nodes.push(node);});
      if(!nodes.length)return null;
      this.transitionPoseTracks=nodes.flatMap(node=>['position','quaternion','scale'].map(property=>{
        const values=node[property].toArray(),Track=property==='quaternion'?THREE.QuaternionKeyframeTrack:THREE.VectorKeyframeTrack;
        const track=new Track(`${node.name}.${property}`,[0,1],[...values,...values]);
        // A live blended pose is already a double-precision result. Keep it
        // exact rather than accumulating Float32 rounding on rapid reversals.
        track.values=new Float64Array([...values,...values]);
        return {node,property,track};
      }));
      const clip=new THREE.AnimationClip('transitionPose',1,this.transitionPoseTracks.map(item=>item.track));
      this.transitionPoseAction=this.mixer.clipAction(clip);this.transitionPoseAction.setLoop(THREE.LoopOnce,1);
      this.transitionPoseAction.clampWhenFinished=true;
    }
    for(const {node,property,track} of this.transitionPoseTracks){
      const value=this.frameEntryPose?.get(node)?.[property] || node[property];
      value.toArray(track.values,0);value.toArray(track.values,track.getValueSize());
    }
    return this.transitionPoseAction;
  }

  fadeToAction(name, duration = 0.2) {
    // Three's fade control times use Float32 absolute mixer timestamps.
    // Once a fade has settled, rebase that clock without changing clip times
    // so a long play session cannot round the next fade past its first frame.
    if(this.mixer?.time>60 && this.mixer.time>=(this.transitionEndsAt || 0)){
      for(const action of Object.values(this.actions))action.stopFading();
      this.transitionPoseAction?.stopFading();
      this.mixer.time=0;this.transitionEndsAt=0;
    }
    if (!this.actions[name]) {
      const alternatives = {
        walk: ['regularRun', 'run'],
        regularRun: ['run', 'walk'], run: ['regularRun', 'walk'],
        swing: ['jump', 'drop', 'fall'], zip: ['swing','jump'], wall: ['idle'], jump: ['drop', 'fall'],
        drop: ['fall', 'jump'], fall: ['drop', 'jump'],
        land: ['idle'], roll: ['land', 'idle'], stop: ['idle'], runStop: ['stop', 'idle'],
        turnLeft: ['idle'], turnRight: ['idle'], idle: ['default'], slamLand: ['land', 'idle'],
      };
      name = [...(alternatives[name] || []), 'idle', 'default'].find(key => this.actions[key]);
      if (!name) { this.stopAnimation(); return; }
    }
    const previousAction = this.activeAction;
    const nextAction = this.actions[name];
    const stridePhase=previousAction ? (previousAction.time/previousAction.getClip().duration)%1 : 0;
    // Timed skills sample their clip at speed zero. Release that override
    // even when the ordinary state uses the same clip (e.g. slam landing).
    nextAction.setEffectiveTimeScale(1);
    if (previousAction === nextAction && nextAction.loop === THREE.LoopRepeat &&
        (!nextAction.isRunning() || nextAction.paused)) {
      nextAction.reset().setEffectiveWeight(1).play();
    }

    if (previousAction !== nextAction) {
      const interruptedFade=this.mixer.time<(this.transitionEndsAt || 0)-1e-6;
      this.transitionEndsAt=this.mixer.time+Math.max(0,duration);
      // An explicit cut owns the entire pose immediately, including when
      // several older actions were still scheduled by an interrupted fade.
      if(duration<=0)this.mixer.stopAllAction();
      // A previously fading action still contributes to the visible pose.
      // Resetting it to fade in from zero removes that contribution at once.
      // Capture the blended rig before stopping actions, then use one bounded
      // snapshot to blend into the restarted take without losing its pose.
      let frozenPose=null;
      // A held dodge plants the raised foot after the clip. Blend out from
      // that planted body, or the next clip snaps the foot back up.
      const holdPlant=(this.reactSettle || 0)>0.35;
      // A→B→C also interrupts A's fade-out. Letting A expire on its old
      // clock leaves total weight below one and pulls the rig toward bind.
      const traversalHandoff=['swing','zip','wall','jump','drop','fall','land','roll'].includes(name) || ['swing','zip','wall','jump','drop','fall','land','roll'].some(key=>this.actions[key]===previousAction);
      if(duration>0 && (traversalHandoff || interruptedFade || holdPlant || (nextAction.isScheduled() && nextAction.getEffectiveWeight()>1e-5)))
        frozenPose=this.captureTransitionPose();
      if(frozenPose){
        this.mixer.stopAllAction();
        frozenPose.reset().setEffectiveWeight(1).play().fadeOut(duration);
      }
      if (previousAction && !frozenPose) {
        if (duration > 0) {
          // An interrupted fade-in must start fading out at its current weight.
          // Three's fadeOut starts at 1, which otherwise revives a partial pose.
          previousAction.setEffectiveWeight(previousAction.getEffectiveWeight()).fadeOut(duration);
        }
        else previousAction.stop();
      }
      nextAction
        .reset()
        .setEffectiveTimeScale(1)
        .setEffectiveWeight(1)
        .play();
      if (duration > 0) nextAction.fadeIn(duration);
      this.activeAction = nextAction;
      if (previousAction && STRIDES.includes(name) &&
          STRIDES.includes(previousAction.getClip().name)) {
        nextAction.time = stridePhase * nextAction.getClip().duration;
      }
    }
  }

  rememberRestPose() {
    if(this.model && this.restPoseModel!==this.model){
      this.restPoseModel=this.model;
      this.restBonePose=Object.values(this.bones).map(bone=>({bone,p:bone.position.clone(),q:bone.quaternion.clone(),s:bone.scale.clone()}));
    }
  }

  stopAnimation() {
    this.rememberRestPose();
    // Mixer.stopAllAction restores clip bindings, but procedural IK, body
    // tilt and contact filters live outside the mixer. A respawn must not
    // ease out of the previous life's swing, strike or planted stance.
    this.lowStance=null;this.crouchBlend=0;this.crouchWeight=0;this.lowStancePhase=0;this.lowStanceLift=0;
    this.strikeLegWeight=0;
    this.lastState=null;this.pendingTurn=null;this.landingAction=null;this.landingSpeed=0;
    this.bodyPitch=0;this.bodyRoll=0;this.visualYaw=this.targetFacingAngle || 0;this.idleTime=0;this.fallTime=0;
    this.locomotionGait=null;this.pendingGait=null;this.gaitChangeTime=0;
    this.endJointModel=null;this.endJointPose=null;
    this.finalFeetModel=null;this.finalFeet=null;this.airFootRelease=0;
    this.idleFootAnchors=null;this.idleFootRoot=null;this.idlePlantDelay=0;
    this.movingPlants=null;this.movingReleases=null;this.plantLastFeet=null;
    this.plantRoot=null;this.plantVelocityRoot=null;this.groundFootRotations=null;this.terrainPelvis=0;
    this.combatClipToken=null;this.movingGuardWeight=0;this.frameEntryPose=null;this.renderedLimbBends=null;this.webArmPrevious=null;this.roofBendContinuity=false;this.roofBendQuiet=0;
    this.movingStrikeToken=null;this.movingStrikePose=null;this.movingStrikeFrom=null;this.movingStrikeBlend=0;
    this.combatStepYaw=0;this.strikeHipYaw=0;this.strikeStrideScale=null;this.strikeMoveOffset=0;
    this.reactStride=null;this.reactToken=null;this.reactSettle=0;this.reactSettleId=null;
    this.combatGazeWeight=0;this.combatWristWeight=0;this.zipPoseWeight=0;
    this.wallContacts=null;this.wallPoseRoot=null;this.wallPoseWeight=0;this.wallPhase=0;
    this.wallTravelDirection=null;this.wallLiftWeight=0;this.wallSoleRotations=null;this.wallPoseNormal=null;
    this.impactLift=0;
    this.rollEntryPose=null;this.rollEntryElapsed=0;this.rollRenderedPose=null;this.rollReleaseTime=0;this.airModelRelease=0;
    restoreHandPose(this.webFingerRig);
    if(this.model && this.jointConstraintModel!==this.model){
      this.jointConstraintModel=this.model;this.jointConstraints=createJointConstraints(this.model,this.bones);
    }this.webGestures={};
    this.animationPose=null;this.groundPoseInput=null;this.solvedGroundPose=null;this.groundPoseStillTime=0;
    this.groundSoleTargets=null;this.groundSoleSettling=null;
    this.mantleArmPose=null;this.mantleArmRelease=0;
    this.mantleExitFeet=null;this.mantleFootRelease=0;
    this.mantleExitRotations=null;this.mantleStartFeet=null;
    this.wallGripWeights=null;this.wallGripHeights=null;this.wallGripTargets=null;this.wallPalmDirections=null;
    // Reset/respawn can interrupt a crossfade; every outgoing action must
    // release its pose as well as the action currently selected.
    if (this.mixer) {
      this.mixer.stopAllAction();
      for(const {bone,p,q,s} of this.restBonePose || []){bone.position.copy(p);bone.quaternion.copy(q);bone.scale.copy(s);}
      this.mixer.time=0;this.transitionEndsAt=0;
      this.activeAction = null;
      return;
    }
    if (this.activeAction) {
      this.activeAction.fadeOut(0.12);
      this.activeAction.stop();
      this.activeAction = null;
    }
  }

  requestTurn(direction) {
    if (direction === 'left' || direction === 'right') {
      this.pendingTurn = direction;
    }
  }
  getWristPosition() {
    const hand = this.currentHand === 'right' ? this.rightHand : this.leftHand;
    if (hand) {
      const pos = new THREE.Vector3();
      hand.getWorldPosition(pos);
      return pos;
    }
    // Fallback: slight offset from character center
    return this.group.position.clone().add(new THREE.Vector3(0.3, 1.2, 0.3));
  }

  toggleHand() {
    this.currentHand = this.currentHand === 'right' ? 'left' : 'right';
  }

  fireWeb(anchor,hand=this.currentHand) {
    if (!anchor) return;
    this.cancelAirTrick();
    this.currentHand=hand;
    this.webShotAnchor = anchor.clone();
    this.webShotIsMiss = false;
    this.webShotTimer = 0.38;
    this.webLaunchTimers ||= {};
    this.webLaunchTimers[hand]=0.22;
    this.persistentWebAnchor = anchor.clone();
    this.webAttachments=(this.webAttachments || []).filter(web=>web.hand!==hand);
    this.webAttachments.push({hand,anchor:anchor.clone()});
    this.updateWeb(true, this.webShotAnchor);
  }

  fireWebMiss(target,hand=this.currentHand) {
    if (!target) return;
    this.cancelAirTrick();
    this.currentHand=hand;
    this.webShotAnchor=target.clone();
    this.webShotIsMiss=true;
    this.webShotTimer=0.55;
    this.webLaunchTimers ||= {};this.webLaunchTimers[hand]=0.22;
    this.updateWeb(true,this.webShotAnchor);
  }

  updateWeb(isSwinging, anchorPos) {
    if (!isSwinging || !anchorPos) {
      this.webLine.visible = false;
      this.webMesh.visible = false;
      if (this.webLineOffhand) this.webLineOffhand.visible = false;
      if (this.webMeshOffhand) this.webMeshOffhand.visible = false;
      return;
    }

    const fallback = this.group.position;
    const wrists = [
        this.rightHand?.getWorldPosition(new THREE.Vector3()) || fallback.clone().add(new THREE.Vector3(0.22, 1.2, 0)),
        this.leftHand?.getWorldPosition(new THREE.Vector3()) || fallback.clone().add(new THREE.Vector3(-0.22, 1.2, 0))
      ];
    const endpoint=hand=>this.webShotTimer>0 && hand===this.currentHand
      ? this.webShotAnchor
      : Array.isArray(this.webAttachments)
        ? this.webAttachments.find(web=>web.hand===hand)?.anchor
        : anchorPos;
    for(const [hand,line,mesh,wrist] of [
      ['right',this.webLine,this.webMesh,wrists[0]],
      ['left',this.webLineOffhand,this.webMeshOffhand,wrists[1]]]) {
      if(!line || !mesh)continue;
      const target=endpoint(hand);
      if(target)this.updateWebStrand(line,mesh,wrist,target,hand);
      else {line.visible=false;mesh.visible=false;}
    }
  }

  updateWebStrand(line, mesh, wrist, anchorPos,hand) {
    const launch=Math.max(0.04,1-(this.webLaunchTimers?.[hand] || 0)/0.22);
    const attachment=this.webAttachments?.find(web=>web.hand===hand);
    const miss=this.webShotIsMiss && hand===this.currentHand;
    const ratio=attachment?.length>0?this.group.position.distanceTo(anchorPos)/attachment.length:1;
    updateWebStrand(line,mesh,wrist,anchorPos,this.webVisualTime || 0,launch,{
      tension:miss?0:THREE.MathUtils.smoothstep(ratio,.82,.995),speed:this.webMotionSpeed || 0,
      opacity:miss?THREE.MathUtils.smoothstep(this.webShotTimer,0,.16):1,
    });
  }

  triggerAirTrick(key = 'front') {
    if (!Object.hasOwn(AIR_TRICKS, key)) return false;
    this.airTrick = { key, elapsed: 0 };
    this.isTricking = true;
    this.trickRotation = 0;
    this.actions?.[key === 'back' ? 'backTrick' : 'airTrick']?.reset();
    return true;
  }

  cancelAirTrick() {
    this.airTrick = null;
    this.isTricking = false;
    this.trickRotation = 0;
  }

  update(delta, state, velocity, anchorPos) {
    this.rememberRestPose();
    updateAppearance(this,delta);
    this.limbPoseDelta=Math.max(0,delta);this.roofBendCapped=false;
    if(this.lastState==='MANTLING' && GROUNDED.includes(state)){this.roofBendContinuity=true;this.roofBendQuiet=0;}
    if(!['IDLE','RUNNING','SPRINTING','MANTLING'].includes(state) || this.combatStance || this.combatAction){this.roofBendContinuity=false;this.roofBendQuiet=0;}
    this.poseState=state;this.wallViewWeight=THREE.MathUtils.damp(this.wallViewWeight || 0,['WALL_RUNNING','MANTLING'].includes(state)?1:0,14,delta);
    this.webMotionSpeed=velocity.length();
    this.groundMotionVelocity=velocity.clone().setY(0);
    this.viewMoveSpeed=Math.hypot(velocity.x,velocity.z);
    if (this.copySource) this.copyLoadedCharacter(this.copySource);
    // Capture the rendered rig before restoring the clean animation sample.
    // A state handoff must include outgoing combat/contact layers; otherwise
    // a run-to-jump fade starts from unlayered arms and drops their last pose.
    this.frameEntryPose=this.lastState && state!==this.lastState && this.model
      ?new Map(Object.values(this.bones).map(bone=>[bone,{position:bone.position.clone(),quaternion:bone.quaternion.clone(),scale:bone.scale.clone()}])):null;
    if(state==='ROLLING' && this.lastState!=='ROLLING' && this.model){
      this.rollEntryPose=new Map(Object.values(this.bones).map(bone=>[bone,{p:bone.position.clone(),q:bone.quaternion.clone()}]));
      this.rollEntryModelY=this.model.position.y;this.rollEntryElapsed=0;
    }else if(state!=='ROLLING')this.rollEntryPose=null;
    restoreHandPose(this.webFingerRig);
    if(this.model && this.jointConstraintModel!==this.model){
      this.jointConstraintModel=this.model;this.jointConstraints=createJointConstraints(this.model,this.bones);
    }
    if(state==='MANTLING' && this.lastState!=='MANTLING' && this.model){
      this.group.updateMatrixWorld(true);
      this.mantleStartPose=new Map(Object.values(this.bones).map(bone=>[bone,{p:bone.position.clone(),q:bone.quaternion.clone()}]));
      this.mantleStartFeet=Object.fromEntries(['left','right'].map(side=>[side,Object.values(this.bones || {}).find(b=>boneId(b.name)===side+'foot')?.getWorldPosition(new THREE.Vector3())]));
    }else if(state!=='MANTLING'){this.mantleStartFeet=null;this.mantleStartPose=null;}
    // PropertyMixer skips writes when the sampled value has not changed.
    // Restore the previous animation sample before reapplying IK, otherwise
    // held poses repeatedly solve an already corrected leg and drift upward.
    if(((GROUNDED.includes(state) && GROUNDED.includes(this.lastState) && !(this.mantleFootRelease>0)) || ['WALL_RUNNING','MANTLING','FALLING','JUMPING','SWINGING','WEB_ZIP'].includes(state)) && this.animationPoseModel===this.model)for(const {bone,p,q} of this.animationPose || []){
      bone.position.copy(p);bone.quaternion.copy(q);
    }
    for(const hand of ['left','right'])if(this.webLaunchTimers?.[hand]>0)
      this.webLaunchTimers[hand]=Math.max(0,this.webLaunchTimers[hand]-delta);
    this.webVisualTime=(this.webVisualTime || 0)+delta;
    this.webShotTimer = Math.max(0, this.webShotTimer - delta);
    if (this.webShotTimer === 0) {this.webShotAnchor = null;this.webShotIsMiss=false;}
    // Gameplay trick completion also runs when the downloaded rig is absent.
    if (this.airTrick) {
      if (!['JUMPING', 'FALLING'].includes(state)) this.cancelAirTrick();
      else {
        this.airTrick.elapsed += Math.max(0, delta);
        if (this.airTrick.elapsed >= AIR_TRICKS[this.airTrick.key].duration) {
          const key = this.airTrick.key;
          this.cancelAirTrick();
          this.onAirTrickComplete?.(key);
        }
      }
    }
    if (!this.mixer || !this.model) {
      updateWebHandPose(this,delta,state);
      const shotAnchor = this.webShotTimer > 0 ? this.webShotAnchor : null;
      const attached = ['SWINGING', 'WEB_ZIP'].includes(state) && !!anchorPos;
      const visibleAnchor = attached ? anchorPos : (this.persistentWebAnchor || shotAnchor);
      this.updateWeb(!!visibleAnchor, visibleAnchor);
    this.frameEntryPose=null;
      if (this.placeholder) {
        const angles=this.airTrick?trickRotation(this.airTrick.key,this.airTrick.elapsed):{x:0,y:0,z:0};
        this.placeholder.rotation.set(angles.x,this.targetFacingAngle+angles.y,angles.z);
      }
      return;
    }
    const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
    this.fallTime=state==='FALLING'
      ?(this.lastState==='FALLING'?(this.fallTime || 0)+Math.max(0,delta):0)
      :0;
    const travelYaw = Math.atan2(velocity.x, velocity.z);
    this.strikeMoveOffset = horizontalSpeed > 0.35
      ? Math.atan2(Math.sin(travelYaw - this.targetFacingAngle), Math.cos(travelYaw - this.targetFacingAngle))
      : 0;
    const grounded = GROUNDED.includes(state);
    const previous = this.lastState;
    if(GROUNDED.includes(previous) && ['JUMPING','FALLING'].includes(state))this.airModelRelease=.14;
    else this.airModelRelease=Math.max(0,(this.airModelRelease || 0)-delta);
    if(previous==='ROLLING' && state!=='ROLLING' && this.rollRenderedPose){
      this.rollReleaseDuration=this.rollRenderedPhase<.7?.55:.16;this.rollReleaseTime=this.rollReleaseDuration;
    }
    else this.rollReleaseTime=Math.max(0,(this.rollReleaseTime || 0)-delta);
    if(state!=='RUNNING'){this.locomotionGait=null;this.gaitChangeTime=0;this.pendingGait=null;}
    const playing = name => !!this.actions[name] && this.activeAction === this.actions[name] &&
      this.activeAction.time < this.activeAction.getClip().duration - 0.05;
    let name = 'idle';
    if (state === 'SWINGING') name = 'swing';
    else if (state === 'WALL_RUNNING') name = 'wall';
    else if (state === 'MANTLING') name=this.mantle && this.mantle.elapsed/this.mantle.duration>.68?'idle':'wall';
    else if (state === 'WEB_ZIP') name = 'zip';
    else if (state === 'TURNING') name = this.pendingTurn === 'left' ? 'turnLeft' : 'turnRight';
    else if (state === 'LANDING') {
      // Impact is a one-frame event. Keep the selected recovery take until
      // physics ends LANDING instead of changing clips on the next frame.
      if(previous !== 'LANDING' || !this.landingAction)
        this.landingAction='land';
      name=this.landingAction;
    }
    else if (state === 'ROLLING') name = 'roll';
    else if (state === 'JUMPING') name = 'jump';
    else if (state === 'FALLING') name = this.fallTime < .24 ? 'drop' : 'fall';
    else if (state === 'IDLE') {
      if (previous === 'SPRINTING') name = 'runStop';
      else if (previous === 'RUNNING') name = 'stop';
      else if (playing('runStop')) name = 'runStop';
      else if (playing('stop')) name = 'stop';
    } else if(state==='SPRINTING')name='run';
    else {
      this.locomotionGait ||= horizontalSpeed>3.1?'regularRun':'walk';
      const wanted=this.locomotionGait==='regularRun'
        ?(horizontalSpeed<2.65?'walk':'regularRun'):(horizontalSpeed>3.35?'regularRun':'walk');
      if(wanted!==this.locomotionGait){
        this.gaitChangeTime=this.pendingGait===wanted?(this.gaitChangeTime || 0)+delta:delta;
        this.pendingGait=wanted;
        // A riser can slow the capsule for a single tick. Keep the gait's
        // phase until the new speed is sustained instead of restarting a fade.
        if(this.gaitChangeTime>=.12){this.locomotionGait=wanted;this.gaitChangeTime=0;}
      }else {this.gaitChangeTime=0;this.pendingGait=null;}
      name=this.locomotionGait;
    }
    const combat=this.combatAction;
    const combatClip= combat?.key==='hit'?'hitHead':combat?.key?.startsWith('dodge')?'combatIdle':combat?.key;
    const rollRecovering=(this.rollReleaseTime || 0)>.08;
    const combatGround=['IDLE','RUNNING','SPRINTING'].includes(state) && !rollRecovering;
    const legsMoving=['RUNNING','SPRINTING'].includes(state) || horizontalSpeed>.25;
    const combatMoving=combatGround && legsMoving;
    const gait=['RUNNING','SPRINTING'].includes(state);
    const strikeKey=!!(combat?.duration && ['jab','cross','hook','heavy','special'].includes(combat.key));
    const reactKey=!!(combat && (combat.key?.startsWith('dodge') || combat.key==='hit' || combat.key==='hitHead'));
    // A traveling punch keeps a stride carrier underneath the attack legs.
    // Replacing it with the in-place boxing take nailed the flight foot down
    // and left the pelvis ahead of both boots. A standing punch still owns
    // the whole clip. The choice is latched for the action so a slowing
    // recovery does not swap bodies halfway through the fist.
    if(strikeKey && combat.id!=null){
      if(this.strikeTravelId!==combat.id){
        this.strikeTravelId=combat.id;
        this.strikeKeepsGait=!!(combat.travel) || (rollRecovering && gait) || (gait && horizontalSpeed>0.9);
      }
    }else if(!strikeKey){this.strikeTravelId=null;this.strikeKeepsGait=false;}
    if(strikeKey && (combat.travel || (gait && horizontalSpeed>.9)))this.strikeKeepsGait=true;
    const movingStrike=!!(strikeKey && ['IDLE','RUNNING','SPRINTING'].includes(state) && this.strikeKeepsGait);
    const movingGuard=combatMoving && combat?.key==='guard';
    const dodgeKey=!!combat?.key?.startsWith('dodge');
    const hitKey=combat?.key==='hit' || combat?.key==='hitHead';
    const playingKey=Object.entries(this.actions).find(([,action])=>action===this.activeAction)?.[0];
    // The dodge sine starts at zero. Waiting for speed let the run fade into
    // a walk before the latch, and that swap was the foot pop.
    const incomingStride=STRIDES.includes(playingKey)?playingKey
      :this.lastState==='SPRINTING'?'run'
      :this.lastState==='RUNNING' && STRIDES.includes(this.locomotionGait)?this.locomotionGait
      :null;
    if((dodgeKey || hitKey) && grounded && combat.id!=null){
      if(this.reactToken!==combat.id){
        this.reactStride=incomingStride;
        this.reactToken=combat.id;
      }
    }else if(!dodgeKey && !hitKey){this.reactStride=null;this.reactToken=null;}
    const heldReact=!!(this.reactStride && this.actions[this.reactStride] && (dodgeKey || hitKey));
    const movingReact=reactKey && (gait || heldReact) && (combatGround || rollRecovering);
    const recoveryOwnsBody=rollRecovering && !!combat && (combat.key==='guard' || combat.key==='combatIdle');
    if(combat && !movingStrike && !movingGuard && !movingReact && !recoveryOwnsBody && this.actions[combatClip] && (grounded || combat.key==='slam') && !['ROLLING','TURNING'].includes(state) && (state!=='LANDING'||combatClip==='slamLand'))name=combatClip;
    // A ground-pound recovery owns the landing until physics releases it,
    // even if its timed combat action ends before that landing state does.
    if(state==='LANDING' && name==='slamLand')this.landingAction='slamLand';
    if (this.airTrick) {
      const trickClip = this.airTrick.key === 'back' ? 'backTrick' : 'airTrick';
      name = this.actions[trickClip] ? trickClip : this.actions.fallIdle ? 'fallIdle' : 'fall';
    }
    else if(this.isTricking && !grounded && !['WALL_RUNNING','MANTLING','WEB_ZIP'].includes(state) && this.actions.fallIdle)name='fallIdle';
    if(this.networkAnimation && this.actions[this.networkAnimation.key] &&
      (!['ROLLING','LANDING'].includes(state)||this.networkAnimation.key===name))name=this.networkAnimation.key;
    if(this.lowStance && combatGround && !combat?.duration)name='idle';
    // Guard reduces actual travel speed; a sprint input must not play a
    // slow-motion high-knee sprint under a walking-speed defence.
    if(!this.networkAnimation && (movingStrike || (combatMoving && this.combatStance)) && (!combat || !combat.duration || movingStrike))
      name=horizontalSpeed>5.2?'run':horizontalSpeed>3.2?'regularRun':'walk';
    const retreat=(movingStrike || (combatMoving && this.combatStance)) && horizontalSpeed>0.45 && Math.abs(this.strikeMoveOffset)>2;
    // A reversed sprint lifts the knees like a backward bound. regularRun
    // played backward reads as a fighting retreat at the same travel speed.
    if(!this.networkAnimation && (retreat || (combatMoving && this.combatStance && Math.abs(this.strikeMoveOffset)>.55)) && name==='run' && this.actions.regularRun)name='regularRun';
    // Keep the stride already under the feet. A slow dodge holds that pose
    // instead of swapping to a walk or playing the sprint in slow motion.
    // An idle dodge has no stride to keep, so it stays on the fighting stance.
    if(heldReact)name=this.reactStride;
    else if(dodgeKey && grounded && state!=='SPRINTING' && horizontalSpeed<3.4)name='combatIdle';
    this.fadeToAction(name, combatClip===name ? (combat.duration ? 0.065 : name==='guard' ? 0.18 : 0.12) : state==='MANTLING' && name==='idle' ? .3 : ['LANDING','ROLLING'].includes(state) ? 0.06 : grounded ? 0.18 : 0.12);
    if (STRIDES.includes(name)) {
      const measuredSpeed = this.activeAction?.getClip().userData?.nominalSpeed;
      const strideSpeed = measuredSpeed > 0.1 ? measuredSpeed : ({walk:2.8,regularRun:4.8,run:6.5}[name]);
      const forwardScale=THREE.MathUtils.clamp(horizontalSpeed / strideSpeed, 0.15, 1.6);
      if(retreat){
        const reverse=-THREE.MathUtils.clamp(horizontalSpeed / strideSpeed, 0.8, 1.35);
        // Start reversed. Sliding the timescale through zero plays one forward
        // stride against the fading sprint and folds the trailing knee back.
        if(!(this.strikeStrideScale<0))this.strikeStrideScale=reverse;
        else this.strikeStrideScale=THREE.MathUtils.damp(this.strikeStrideScale, reverse, 18, delta);
        this.activeAction?.setEffectiveTimeScale(this.strikeStrideScale);
        if(this.actions.run && this.actions.run!==this.activeAction)
          this.actions.run.setEffectiveTimeScale(this.strikeStrideScale);
      }else if(this.strikeStrideScale<0){
        this.strikeStrideScale=THREE.MathUtils.damp(this.strikeStrideScale, forwardScale, 14, delta);
        if(this.strikeStrideScale>-0.04)this.strikeStrideScale=null;
        this.activeAction?.setEffectiveTimeScale(this.strikeStrideScale ?? forwardScale);
      }else{
        this.strikeStrideScale=null;
        // A slow dodge or a dying hit must not play the stride in slow motion.
        // Hold the pose. settleHeldStance then puts a raised foot down.
        const holdStride=(movingStrike && horizontalSpeed<.12) || (heldReact && ((dodgeKey && horizontalSpeed<3.4) || (hitKey && horizontalSpeed<2.8)));
        this.activeAction?.setEffectiveTimeScale(holdStride ? 0 : forwardScale);
      }
    }
    if(combatClip===name && combat.id && combat.id!==this.combatClipToken){this.activeAction?.reset().play();this.combatClipToken=combat.id;}
    if(combatClip===name && combat.duration) {
      // The gameplay action owns time, including a slam held until actual
      // contact. Advancing the mixer independently could land in mid-air.
      this.activeAction.enabled=true;this.activeAction.paused=false;
      const played=combat.key==='heavy'?heavyClipPhase(combat.time/combat.duration):THREE.MathUtils.clamp(combat.time/combat.duration,0,1);
      this.activeAction.time=Math.min(this.activeAction.getClip().duration-1e-6,
        this.activeAction.getClip().duration*played);
      this.activeAction.setEffectiveTimeScale(0);
    }
    if(name==='roll' && this.recoveryProgress!=null){
      this.activeAction.time=this.activeAction.getClip().duration*THREE.MathUtils.clamp(this.recoveryProgress,0,.999999);
      this.activeAction.setEffectiveTimeScale(0);
    }
    if((name==='airTrick'||name==='backTrick') && this.airTrick)this.activeAction?.setEffectiveTimeScale(
      this.activeAction.getClip().duration / AIR_TRICKS[this.airTrick.key].duration);
    if(name==='wall')this.activeAction?.setEffectiveTimeScale(state==='MANTLING'?0:THREE.MathUtils.clamp(velocity.length()/(this.activeAction.getClip().userData.climbSpeed || 3),0,6));
    if(this.lowStance && combatGround && !combat?.duration && name==='idle'){
      this.activeAction.time=0;this.activeAction.setEffectiveTimeScale(0);
    }
    // A neutral combat stance should not shuffle both feet on a loop while
    // contact IK tries to pin them. Use one authored guard sample; strikes,
    // locomotion and explicit blocking keep their own animation clocks.
    if(name==='combatIdle' && combatGround && !combat?.duration && horizontalSpeed<.15){
      this.activeAction.time=0;this.activeAction.setEffectiveTimeScale(0);
    }
    this.mixer.update(delta);
    if(this.networkAnimation && !(this.combatAction?.key==='heavy' && this.activeAction===this.actions.heavy) && this.activeAction===this.actions[this.networkAnimation.key]){
      this.activeAction.time=this.networkAnimation.time;
      this.mixer.update(0);
    }
    if(this.rollReleaseTime>0 && this.rollRenderedPose){
      const weight=THREE.MathUtils.smoothstep(this.rollReleaseTime/this.rollReleaseDuration,0,1);
      for(const [bone,pose] of this.rollRenderedPose){
        bone.position.lerp(pose.p,weight);bone.quaternion.slerp(pose.q,weight).normalize();
      }
    }
    if(this.animationPoseModel!==this.model || !this.animationPose){
      this.animationPoseModel=this.model;
      this.animationPose=Object.values(this.bones).map(bone=>({bone,p:bone.position.clone(),q:bone.quaternion.clone()}));
    }else for(const sample of this.animationPose){sample.p.copy(sample.bone.position);sample.q.copy(sample.bone.quaternion);}
    if(state==='MANTLING' && this.mantleStartPose && this.mantle){
      const weight=1-THREE.MathUtils.smoothstep(this.mantle.elapsed/this.mantle.duration,.5,.92);
      for(const [bone,pose] of this.mantleStartPose){
        bone.position.lerp(pose.p,weight);bone.quaternion.slerp(pose.q,weight).normalize();
      }
    }
    // Recovery and airborne clips own the whole body. A fading guard layer
    // must not pin the chest upright while the pelvis rolls underneath it.
    const upperAction=movingStrike || movingReact;
    if((!combatGround && !upperAction) || (strikeKey && !movingStrike))this.movingGuardWeight=0;
    this.movingGuardWeight=THREE.MathUtils.damp(this.movingGuardWeight || 0,
      upperAction || (!strikeKey && combatMoving && (this.combatStance || movingGuard))?1:0,upperAction?28:20,delta);
    if((combatGround || upperAction) && (upperAction || this.movingGuardWeight>.001)) {
      const clip=this.actions[upperAction?combatClip:movingGuard?'guard':'combatIdle']?.getClip();
      if(clip) {
        this.strikeLayers ||= new WeakMap();
        if(!this.strikeLayers.has(clip))this.strikeLayers.set(clip,clip.tracks.flatMap(track=>{
          const [id,property]=track.name.split('.'),bone=this.bones[id];
          return bone && property==='quaternion' && /^(spine|neck|head|leftshoulder|rightshoulder|leftarm|rightarm|leftforearm|rightforearm|lefthand|righthand)/.test(boneId(id))
            ?[{bone,sample:track.createInterpolant()}]:[];
        }));
        const phase=upperAction && combat.duration?(combat.key==='heavy'?heavyClipPhase(combat.time/combat.duration):THREE.MathUtils.clamp(combat.time/combat.duration,0,1)):0;
        // Enter guard before the strike instead of snapping from a running
        // arm swing. Contact stays fully weighted; recovery returns to guard.
        const weight=this.movingGuardWeight;
        const hip=Object.values(this.bones).find(b=>boneId(b.name)==='hips');
        const locomotionHip=hip?.quaternion.clone();
        const hipTrack=clip.tracks.find(t=>t.name===hip?.name+'.quaternion');
        // Preserve the travel pelvis; transfer the authored pelvis turn
        // at the current attack phase into the spine layer only.
        const layers=this.strikeLayers.get(clip);
        const token=upperAction?combat.id || combat.key:movingGuard?'movingGuard':'guard';
        if(this.movingStrikeToken!==token){
          this.movingStrikeToken=token;this.movingStrikeBlend=0;
          this.movingStrikeFrom=this.movingStrikePose;
        }
        const entryDuration=combat?.duration?Math.min(.08,combat.duration*.1):.12;
        this.movingStrikeBlend=Math.min(entryDuration,(this.movingStrikeBlend || 0)+delta);
        const blend=THREE.MathUtils.smoothstep(this.movingStrikeBlend,0,entryDuration);
        const basis=hipTrack&&locomotionHip?locomotionHip.invert().multiply(new THREE.Quaternion().fromArray(hipTrack.createInterpolant().evaluate(phase*clip.duration))):null;
        for(const {bone,sample} of layers){
          const pose=new THREE.Quaternion().fromArray(sample.evaluate(phase*clip.duration));
          // Upper-body tracks are local to the fighting pelvis, which turns
          // relative to the running pelvis. Rebase only the spine root.
          if(basis && bone.parent===hip)pose.premultiply(basis);
          const boneWeight=weight;
          bone.quaternion.slerp(pose,boneWeight);
          const from=this.movingStrikeFrom?.get(bone);
          if(from && blend<1)bone.quaternion.slerpQuaternions(from,bone.quaternion.clone(),blend);
        }
        this.movingStrikePose=new Map(layers.map(({bone})=>[bone,bone.quaternion.clone()]));
      }
    }else{this.movingStrikeToken=null;this.movingStrikePose=null;this.movingStrikeFrom=null;}
    // Keep the boxing guard through a normal combat jump instead of using
    // the traversal take's overhead arm swing. Legs and torso keep the jump.
    const airGuard=this.combatStance && ['JUMPING','FALLING'].includes(state) && !combat?.duration && !this.isTricking && !this.airTrick;
    const releaseGuard=this.combatStance && ['IDLE','RUNNING','SPRINTING','LANDING'].includes(state) && !combat?.duration;
    this.airGuardWeight=airGuard?1:releaseGuard?THREE.MathUtils.damp(this.airGuardWeight || 0,0,18,delta):0;
    if(this.airGuardWeight>.001){
      const clip=this.actions.combatIdle?.getClip();
      if(clip){
        if(this.airGuardClip!==clip || this.airGuardModel!==this.model){
          this.airGuardClip=clip;this.airGuardModel=this.model;
          this.airGuardTracks=clip.tracks.flatMap(track=>{
            const [id,property]=track.name.split('.'),bone=this.bones[id];
            return bone && property==='quaternion' && /^(left|right)(shoulder|arm|forearm|hand)/.test(boneId(id))
              ?[{bone,pose:new THREE.Quaternion().fromArray(track.createInterpolant().evaluate(0))}]:[];
          });
        }
        for(const {bone,pose} of this.airGuardTracks)bone.quaternion.slerp(pose,this.airGuardWeight);
      }
    }
    // A moving strike owns the upper body. Its in-place fighting legs must
    // never replace the carrier stride while the physics root keeps moving.
    this.strikeLegWeight=0;
    if (state !== 'LANDING') this.landingSpeed = 0;
    this.lastState = state;
    if(state !== 'LANDING')this.landingAction=null;
    this.idleTime += delta;
    if (grounded || state==='MANTLING') { this.isTricking = false; this.trickRotation = 0; }
    if(this.airTrick){
      this.trickRotation=0;
    } else if(this.isTricking && (this.actions.airTrick || this.actions.backTrick)){
      this.trickRotation=0;
      if(['airTrick','backTrick'].some(key=>this.activeAction===this.actions[key]) && this.activeAction.time>=this.activeAction.getClip().duration-.02)this.isTricking=false;
    } else if (this.isTricking) {
      this.trickRotation = Math.min(Math.PI * 2, this.trickRotation + delta * 10);
      if (this.trickRotation >= Math.PI * 2) {
        this.isTricking = false; this.trickRotation = 0;
      }
    }
    const yaw = ['SWINGING','WEB_ZIP'].includes(state) && horizontalSpeed > 0.5
      ? Math.atan2(velocity.x, velocity.z) : this.targetFacingAngle;
    const currentYaw = this.visualYaw ?? yaw;
    this.visualYaw = currentYaw + Math.atan2(Math.sin(yaw - currentYaw),
      Math.cos(yaw - currentYaw)) * (1 - Math.exp(-(strikeKey ? 40 : 12) * delta));
    if(Number.isFinite(this.networkVisualYaw))this.visualYaw=this.networkVisualYaw;
    this.bodyPitch = THREE.MathUtils.damp(this.bodyPitch,
      state === 'WEB_ZIP' ? THREE.MathUtils.clamp(Math.atan2(horizontalSpeed,Math.max(2,velocity.y))*0.65,0,1)
        : state === 'SWINGING' ? THREE.MathUtils.clamp(-velocity.y * 0.015, -0.45, 0.45) : 0, 10, delta);
    this.model.rotation.set(this.bodyPitch + this.trickRotation, this.visualYaw, 0, 'YXZ');
    this.group.updateMatrixWorld(true);
    alignStrikeFootwork(this, delta, !!(combatGround && combatMoving && this.combatStance && (!combat?.duration || strikeKey) && horizontalSpeed>0.35), this.strikeMoveOffset || 0, combat);
    poseCombatLife(this, combat);
    if(strikeKey && grounded)settleStrikeBalance(this, combat, !!movingStrike);
    if(!combatGround)this.combatGazeWeight=0;
    alignCombatGaze(this,delta,combatGround&&(this.combatStance||combat?.key==='guard')&&(!combat||['combatIdle','guard'].includes(combat.key)||combat.key.startsWith('dodge')));
    if ((state === 'WALL_RUNNING' || state==='MANTLING') && this.wallNormal) {
      // A humanoid's local Y is its spine, not the sole normal. Swapping
      // Y with the wall normal laid the entire character across the wall.
      const forward = this.wallNormal.clone().normalize().negate();
      const up = new THREE.Vector3(0,1,0);
      const right = new THREE.Vector3().crossVectors(up,forward).normalize();
      this.model.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,forward));
      this.visualYaw=Math.atan2(forward.x,forward.z);
      if(state==='MANTLING' && this.mantle) {
        const t=this.mantle.elapsed/this.mantle.duration;
        this.model.rotateX(Math.sin(Math.PI*t)*0.35);
      }
    }
    // Physics keeps a 10cm foot clearance; the rendered soles should sit on
    // the support surface, not inherit that collision padding.
    this.model.position.y = grounded && state !== 'ROLLING' ? -.1*(1-THREE.MathUtils.smoothstep((this.rollReleaseTime || 0)/(this.rollReleaseDuration || 1),0,1)) : 0;
    if(['JUMPING','FALLING'].includes(state) && this.airModelRelease>0)
      this.model.position.y-=.1*THREE.MathUtils.smoothstep(this.airModelRelease/.14,0,1);
    this.model.position.x=0;this.model.position.z=0;
    if (this.airTrick && !['airTrick','backTrick'].includes(name)) {
      const angles = trickRotation(this.airTrick.key, this.airTrick.elapsed);
      const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(angles.x, angles.y, angles.z, 'YXZ'));
      this.model.quaternion.multiply(rotation);
      // Rotate around the torso, keeping the body centre on its flight path.
      const pivot = new THREE.Vector3(0, 1, 0);
      const offset = pivot.clone().sub(pivot.clone().applyQuaternion(rotation));
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.visualYaw);
      this.model.position.add(offset);
    }
    if(state==='WALL_RUNNING' && this.wallNormal) this.model.position.addScaledVector(this.wallNormal,-Math.max(0,(this.wallDistance ?? 0.7)-0.35));
    if(state==='MANTLING' && this.mantle) {
      const t=this.mantle.elapsed/this.mantle.duration;
      this.model.position.addScaledVector(this.wallNormal,-Math.max(0,(this.mantle.gap ?? 0.7)-0.35)*(1-t));
      // Crouch the visual pelvis while the swept capsule clears the edge;
      // an upright chest would leave the planted roof grips out of reach.
      const steppingDown=this.mantle.end.y<this.mantle.height;
      const inPose=THREE.MathUtils.smoothstep(t,0,steppingDown?.20:.12);
      const standUp=THREE.MathUtils.smoothstep(t,steppingDown?.32:.5,steppingDown?.80:.92);
      // A parapet's higher grip needs a slightly shallower crouch. The
      // deeper roof pose left the shoulder beyond the arm's fixed reach.
      this.model.position.y=-0.1*(steppingDown?inPose:1)-1.28*inPose*(1-standUp);
      if(steppingDown)this.model.position.y+=.12*inPose*(1-THREE.MathUtils.smoothstep(t,.22,.35));
    }
    if(state==='MANTLING' && this.mantle){
      // Lean the chest over the grip without sweeping the pelvis through
      // the parapet while the capsule is still outside the facade.
      this.group.updateMatrixWorld(true);
      const hips=Object.values(this.bones).find(b=>boneId(b.name)==='hips');
      if(hips){
        const p=hips.getWorldPosition(new THREE.Vector3()),plan=this.mantle;
        const outside=1-THREE.MathUtils.smoothstep(p.y,plan.height+.10,plan.height+.25);
        const gap=p.clone().sub(plan.edge).dot(plan.normal);
        this.model.position.addScaledVector(plan.normal,Math.max(0,.14-gap)*outside*(1-THREE.MathUtils.smoothstep(plan.elapsed/plan.duration,.45,.7)));
      }
    }
    if(state==='ROLLING'){
      this.rollEntryElapsed=Math.min(.1,(this.rollEntryElapsed || 0)+Math.max(0,delta));
      const entry=THREE.MathUtils.smoothstep(this.rollEntryElapsed,0,.1);
      if(this.rollEntryPose && entry<1)this.model.position.y+=(this.rollEntryModelY || 0)*(1-entry);
      poseForwardRoll(this);
      if(this.rollEntryPose && entry<1)for(const [bone,pose] of this.rollEntryPose){
        bone.position.lerp(pose.p,1-entry);bone.quaternion.slerp(pose.q,1-entry).normalize();
      }
    }
    poseWebShotBody(this,delta,state);
    updateWebHandPose(this,delta,state);
    this.group.updateMatrixWorld(true);
    const groundContacts=grounded && state!=='ROLLING' && !(this.rollReleaseTime>0);
    if(previous==='MANTLING' && groundContacts && this.mantleExitRotations){
      // Carry the rendered roof boot heading into the ground solver. Starting
      // a fresh support frame rotated the shin axially on the first run frame.
      this.groundSoleTargetModel=this.model;
      this.groundSoleTargets=Object.fromEntries(Object.entries(this.mantleExitRotations).map(([side,q])=>[side,q.clone()]));
      this.groundSoleSettling={left:true,right:true};
      this.plantRoot=this.group.getWorldPosition(new THREE.Vector3());
    }
    adaptPelvisToTerrain(this,delta,groundContacts);
    const lowPose=!!this.lowStance || (this.crouchWeight || 0)>.001;
    const heldGround=!lowPose && reuseHeldGroundPose(this,delta,groundContacts);
    if (!heldGround && groundContacts && name === 'idle' && state === 'IDLE' && horizontalSpeed < 0.05) {
      this.plantIdleFeet(delta);
    } else {
      if(!heldGround){this.idlePlantDelay=0;this.idleFootAnchors=null;}
    }
    if(groundContacts){if(!heldGround)plantMovingFeet(this,delta);}
    if(groundContacts)settleHeldStance(this,delta);
    else {this.movingPlants=null;this.movingReleases=null;this.plantLastFeet=null;this.plantVelocityRoot=null;this.groundFootRotations=null;this.groundSoleTargets=null;this.groundSoleSettling=null;}
    if(state==='WEB_ZIP') poseZipLegs(this,delta);
    else this.zipPoseWeight=0;
    const firingAnchor = this.webShotTimer > 0 ? this.webShotAnchor : null;
    const reachingAnchor=this.persistentWebAnchor || (['SWINGING','WEB_ZIP'].includes(state)?anchorPos:firingAnchor);
    this.webArmWeight=THREE.MathUtils.damp(this.webArmWeight || 0,reachingAnchor?1:0,18,delta);
    if(reachingAnchor)this.webPoseAnchor=reachingAnchor.clone();
    if(Array.isArray(this.webAttachments)) {
      this.webHandWeights ||= {};this.webHandTargets ||= {};
      for(const hand of ['left','right']) {
        // Attachments also exist during ballistic takeoff (JUMPING). A missed
        // offhand shot still reaches while the other hand keeps its real pivot.
        const target=this.webAttachments.find(web=>web.hand===hand)?.anchor ||
          (hand===this.currentHand?firingAnchor:null);
        const weight=THREE.MathUtils.damp(this.webHandWeights[hand] || 0,target?1:0,18,delta);
        this.webHandWeights[hand]=weight;
        if(target) {
          if(!this.webHandTargets[hand])this.webHandTargets[hand]=target.clone();
          else this.webHandTargets[hand].lerp(target,1-Math.exp(-16*delta));
        }
        if(this.webHandTargets[hand] && weight>0.01 && !['WALL_RUNNING','MANTLING'].includes(state))
          this.reachWebAnchor(this.webHandTargets[hand],weight,hand);
        if(!target && weight<=0.01)delete this.webHandTargets[hand];
      }
    } else if(this.webPoseAnchor && this.webArmWeight>0.01 && !['WALL_RUNNING','MANTLING'].includes(state))
      this.reachBothWebAnchors(this.webPoseAnchor,this.webArmWeight);
    else if(!reachingAnchor)this.webPoseAnchor=null;
    if (state === 'WALL_RUNNING' && this.wallNormal) {
      if(this.wallPoseNormal && this.wallPoseNormal.dot(this.wallNormal)<0.98) {
        this.wallContacts=null;this.wallPoseRoot=null;this.wallPhase=0;this.wallTravelDirection=null;this.wallLiftWeight=0;this.wallPalmDirections=null;this.wallSoleRotations=null;this.wallPoseWeight=0;
        this.wallGripWeights=null;this.wallGripHeights=null;this.wallGripTargets=null;
      }
      this.wallPoseNormal=this.wallNormal.clone();
      this.wallSoleRotations ||= Object.fromEntries(['left','right'].map(side=>[side,
        this.actions.wall?.getClip().userData?.soleRotations?.[side]
          ? this.model.quaternion.clone().multiply(new THREE.Quaternion().fromArray(this.actions.wall.getClip().userData.soleRotations[side]))
          : Object.values(this.bones || {}).find(b=>boneId(b.name)===side+'foot')?.getWorldQuaternion(new THREE.Quaternion())]));
      poseWall(this,delta,velocity);
    } else {this.wallContacts=null;this.wallPoseRoot=null;this.wallPoseWeight=0;this.wallPhase=0;this.wallTravelDirection=null;this.wallLiftWeight=0;this.wallPalmDirections=null;this.wallSoleRotations=null;this.wallPoseNormal=null;this.wallGripWeights=null;this.wallGripHeights=null;this.wallGripTargets=null;}
    if(state==='MANTLING')poseMantle(this,delta);
    else this.mantleHandTargets=null;
    // The frozen climb take and standing take have very different arm poses.
    // Ease the released arms through the handoff while preserving the earlier
    // fixed roof grips and the separately solved foot contacts.
    const mantleRelease=state==='MANTLING' && name==='idle';
    if(mantleRelease || (previous==='MANTLING' && state!=='MANTLING'))this.mantleArmRelease=.4;
    else this.mantleArmRelease=Math.max(0,(this.mantleArmRelease || 0)-delta);
    const armBones=Object.values(this.bones || {}).filter(b=>/^(left|right)(shoulder|arm|forearm|hand)$/.test(boneId(b.name)));
    if(this.mantleArmRelease>0 && this.mantleArmPose){
      const weight=1-Math.exp(-6*delta);
      for(const b of armBones){const previousPose=this.mantleArmPose[b.name];if(previousPose)b.quaternion.slerpQuaternions(previousPose,b.quaternion.clone(),weight).normalize();}
      this.group.updateMatrixWorld(true);
    }
    if(previous==='MANTLING' && grounded)this.mantleFootRelease=.3;
    else this.mantleFootRelease=Math.max(0,(this.mantleFootRelease || 0)-delta);
    if(grounded && this.mantleFootRelease>0 && this.mantleExitFeet){
      for(const side of ['left','right']){
        const find=id=>Object.values(this.bones || {}).find(b=>boneId(b.name)===id);
        const hip=find(side+'upleg'),knee=find(side+'leg'),foot=find(side+'foot'),lastFoot=this.mantleExitFeet[side];
        if(!hip || !knee || !foot || !lastFoot)continue;
        const current=foot.getWorldPosition(new THREE.Vector3()),move=current.clone().sub(lastFoot),limit=(7+horizontalSpeed)*delta;
        if(move.length()>limit){
          const rotation=foot.getWorldQuaternion(new THREE.Quaternion());
          this.solveLimb(hip,knee,foot,lastFoot.clone().add(move.setLength(limit)),.995);
          fitGroundAnkle(this,side,foot,rotation);
          foot.updateMatrixWorld(true);
        }
      }
      this.group.updateMatrixWorld(true);
    }
    // Release ground IK in body space when a step edge or jump starts a
    // flight. Root motion remains immediate; only the departing foot pose eases.
    if(GROUNDED.includes(previous) && ['JUMPING','FALLING'].includes(state))this.airFootRelease=.14;
    else this.airFootRelease=Math.max(0,(this.airFootRelease || 0)-delta);
    if(this.airFootRelease>0 && !this.isTricking && this.finalFeetModel===this.model && this.finalFeet){
      for(const side of ['left','right']){
        const find=id=>Object.values(this.bones || {}).find(b=>boneId(b.name)===id);
        const hip=find(side+'upleg'),knee=find(side+'leg'),foot=find(side+'foot'),last=this.finalFeet[side];
        if(!hip || !knee || !foot || !last)continue;
        const position=foot.getWorldPosition(new THREE.Vector3()),target=last.clone().add(this.group.getWorldPosition(new THREE.Vector3()));
        const move=position.clone().sub(target),limit=(18+2*horizontalSpeed)*delta;
        if(move.length()>limit){
          const rotation=foot.getWorldQuaternion(new THREE.Quaternion());
          this.solveLimb(hip,knee,foot,target.add(move.setLength(limit)),.995);
          fitGroundAnkle(this,side,foot,rotation);
        }
      }
    }
    if(['SWINGING','JUMPING','FALLING'].includes(state))leadAirborneKnees(this);
    constrainJoints(this.jointConstraints);
    if(!combatGround)this.combatWristWeight=0;
    this.combatWristWeight=THREE.MathUtils.damp(this.combatWristWeight || 0,
      this.combatStance && combatGround?1:0,24,delta);
    alignCombatWrists(this,this.combatWristWeight);
    if(!heldGround && groundContacts)clearGroundSoles(this);
    // Contact clearance can solve the shin again; validate the final ankle
    // and toe output after that pass, including the roof-exit handoff.
    constrainJoints(this.jointConstraints?.filter(item=>item.kind==='foot' || item.kind==='toebase'));
    const changedSoles=stabilizeEndJoints(this,delta);
    if(!heldGround && changedSoles && groundContacts)clearGroundSoles(this,{preserveLocal:true});
    const impactPose=state==='ROLLING' || name==='slamLand' || this.rollReleaseTime>0;
    if(grounded && (impactPose || this.impactLift>0))clearImpactBody(this,delta,impactPose);
    else if(this.impactLift>0){
      this.impactLift=THREE.MathUtils.damp(this.impactLift,0,18,delta);
      this.model.position.y+=this.impactLift;
      this.group.updateMatrixWorld(true);
    }
    poseLowStance(this,delta,state);
    // The next contact step starts from the rendered ankle, after the
    // anatomical clamp and sole clearance have both adjusted the IK result.
    if(grounded && this.groundFootRotations){
      for(const side of ['left','right']){
        const foot=Object.values(this.bones || {}).find(b=>boneId(b.name)===side+'foot');
        if(foot)this.groundFootRotations[side]=foot.getWorldQuaternion(new THREE.Quaternion());
      }
    }
    this.mantleExitFeet=state==='MANTLING' || (grounded && this.mantleFootRelease>0)
      ?Object.fromEntries(['left','right'].map(side=>[side,Object.values(this.bones || {}).find(b=>boneId(b.name)===side+'foot')?.getWorldPosition(new THREE.Vector3())])):null;
    // Blend from the pose actually rendered after joint/twist correction.
    // Saving the unconstrained IK result reintroduced a wrist/arm jump at
    // the roof handoff when the standing action started to fade in.
    this.mantleArmPose=['WALL_RUNNING','MANTLING'].includes(state) || this.mantleArmRelease>0
      ?Object.fromEntries(armBones.map(b=>[b.name,b.quaternion.clone()])):null;
    if(lowPose){this.groundPoseInput=null;this.solvedGroundPose=null;}
    else cacheGroundPose(this,groundContacts);
    if(state==='ROLLING'){
      this.rollRenderedPhase=this.activeAction.time/this.activeAction.getClip().duration;
      this.rollRenderedPose=new Map(Object.values(this.bones).map(bone=>[bone,{p:bone.position.clone(),q:bone.quaternion.clone()}]));
    }
    else if(!(this.rollReleaseTime>0))this.rollRenderedPose=null;
    if(state==='MANTLING')this.mantleExitRotations=Object.fromEntries(['left','right'].map(side=>{
      const foot=Object.values(this.bones || {}).find(b=>boneId(b.name)===side+'foot');
      return [side,foot.getWorldQuaternion(new THREE.Quaternion())];
    }));
    else if(!(this.mantleFootRelease>0))this.mantleExitRotations=null;
    this.renderedLimbBends=new Map();
    for(const side of ['left','right'])for(const limb of ['arm','upleg']){
      const find=id=>Object.values(this.bones).find(b=>boneId(b.name)===side+id);
      const upper=find(limb),lower=find(limb==='arm'?'forearm':'leg'),end=find(limb==='arm'?'hand':'foot');
      if(upper && lower && end){
        const origin=upper.getWorldPosition(new THREE.Vector3()),axis=end.getWorldPosition(new THREE.Vector3()).sub(origin).normalize();
        const bend=lower.getWorldPosition(new THREE.Vector3()).sub(origin);bend.addScaledVector(axis,-bend.dot(axis));
        if(bend.lengthSq()>1e-8)this.renderedLimbBends.set(upper,bend.normalize());
      }
    }
    if(this.roofBendContinuity){
      this.roofBendQuiet=this.roofBendCapped || this.mantleFootRelease>0?0:(this.roofBendQuiet || 0)+delta;
      // Retire only after the requested bend planes have converged. A fixed
      // release timer merely postponed the same knee snap to its last frame.
      if(this.roofBendQuiet>=.15)this.roofBendContinuity=false;
    }
    this.webArmPrevious=new Map(Object.values(this.bones).filter(b=>/^(left|right)(arm|forearm)$/.test(boneId(b.name))).map(b=>[b,b.quaternion.clone()]));
    this.finalFeetModel=this.model;
    this.finalFeet=Object.fromEntries(['left','right'].map(side=>{
      const foot=Object.values(this.bones || {}).find(b=>boneId(b.name)===side+'foot');
      return [side,foot?.getWorldPosition(new THREE.Vector3()).sub(this.group.getWorldPosition(new THREE.Vector3()))];
    }));
    const attached = ['SWINGING','WEB_ZIP'].includes(state) && !!anchorPos;
    const visibleAnchor = attached ? anchorPos : (this.persistentWebAnchor || firingAnchor);
    this.updateWeb(!!visibleAnchor, visibleAnchor);
    this.frameEntryPose=null;
  }

  reachWebAnchor(anchor,weight=1,side=this.currentHand) {
    const prefix = side === 'right' ? 'right' : 'left';
    const find = id => Object.values(this.bones || {}).find(b => boneId(b.name) === prefix + id);
    const arm = find('arm'), forearm = find('forearm'), hand = find('hand');
    if (!arm || !forearm || !hand) return;
    const upper=arm.quaternion.clone(),lower=forearm.quaternion.clone();
    const shoulder=arm.getWorldPosition(new THREE.Vector3()),shot=anchor.clone().sub(shoulder);
    const lift=new THREE.Vector3(0,1,0).addScaledVector(shot,-shot.y/Math.max(shot.lengthSq(),1e-8)).normalize();
    const firingTimer=Math.max(this.webLaunchTimers?.[side] || 0,this.currentHand===side?(this.webShotTimer || 0):0);
    const firingBlend=THREE.MathUtils.smoothstep(firingTimer,0,.12);
    const reach=anchor.clone().addScaledVector(lift,shot.length()*.12*firingBlend);
    const outward=new THREE.Vector3(side==='left'?-.65:.65,-.6,.15).applyQuaternion(this.model.getWorldQuaternion(new THREE.Quaternion()));
    this.solveLimb(arm,forearm,hand,reach,0.94-.13*firingBlend,outward);
    arm.quaternion.slerpQuaternions(upper,arm.quaternion.clone(),weight);
    forearm.quaternion.slerpQuaternions(lower,forearm.quaternion.clone(),weight);
    // Limit the actual rendered launch/release arms, rather than repeatedly
    // blending from the clean clip and reviving its unsolved elbow each frame.
    for(const bone of [arm,forearm]){
      const previous=this.webArmPrevious?.get(bone);
      if(previous && this.limbPoseDelta>0)bone.quaternion.copy(previous.clone().rotateTowards(bone.quaternion,20*this.limbPoseDelta)).normalize();
    }
    arm.updateMatrixWorld(true);
    const direction=anchor.clone().sub(hand.getWorldPosition(new THREE.Vector3())).normalize();
    const up=new THREE.Vector3(0,1,0).addScaledVector(direction,-direction.y);
    if(up.lengthSq()<1e-5)up.set(0,0,1).addScaledVector(direction,-direction.z);
    up.normalize();
    // Clear the wrist exit while keeping the bend inside the joint limit.
    const cock=THREE.MathUtils.degToRad(32);
    const finger=direction.clone().multiplyScalar(Math.cos(cock)).addScaledVector(up,Math.sin(cock)).normalize();
    const palm=direction.clone().multiplyScalar(Math.sin(cock)).addScaledVector(up,-Math.cos(cock)).normalize();
    const across=new THREE.Vector3().crossVectors(finger,palm).normalize();
    const aim=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,finger,palm));
    const local=hand.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(aim);
    hand.quaternion.slerp(local,weight*.95);hand.updateMatrixWorld(true);
  }

  reachBothWebAnchors(anchor,weight=1) {
    const previousHand = this.currentHand;
    for (const hand of ['left', 'right']) {
      this.currentHand = hand;
      this.reachWebAnchor(anchor,weight);
    }
    this.currentHand = previousHand;
  }

  plantIdleFeet(delta) {
    const root = this.group.getWorldPosition(new THREE.Vector3());
    if (this.idleFootRoot && this.idleFootRoot.distanceToSquared(root)>0.01) {
      this.idleFootAnchors = null; this.idlePlantDelay = 0;
    }
    this.idleFootRoot = root.clone();
    this.idlePlantDelay=(this.idlePlantDelay || 0)+delta;
    if (this.idlePlantDelay < 0.22) return;
    const find = id => Object.values(this.bones || {}).find(b => boneId(b.name) === id);
    for (const side of ['left','right']) {
      const upper=find(side+'upleg'),lower=find(side+'leg'),foot=find(side+'foot');
      if (!upper || !lower || !foot) continue;
      this.idleFootAnchors ||= {};
      this.idleFootAnchors[side] ||= foot.getWorldPosition(new THREE.Vector3());
      const goal=this.idleFootAnchors[side].clone();
      const support=footSupport(this,goal);
      if(!support && (this.surfaceProbe || this.groundProbe)) {
        delete this.idleFootAnchors[side];continue;
      }
      goal.y=support? support.height+0.11 : root.y+0.01;
      const current=foot.getWorldPosition(new THREE.Vector3());
      goal.lerpVectors(current,goal,THREE.MathUtils.clamp((this.idlePlantDelay-0.22)/0.18,0,1));
      const rotation=support?soleRotation(this,side,support.normal) || foot.getWorldQuaternion(new THREE.Quaternion())
        :foot.getWorldQuaternion(new THREE.Quaternion());
      this.solveLimb(upper,lower,foot,goal,0.999);
      foot.quaternion.copy(foot.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation));
      foot.updateMatrixWorld(true);
    }
  }

  solveLimb(arm,forearm,hand,anchor,maxReach=0.95,pole=null) {
    const shoulder = arm.getWorldPosition(new THREE.Vector3());
    const elbow = forearm.getWorldPosition(new THREE.Vector3());
    const wrist = hand.getWorldPosition(new THREE.Vector3());
    const a = shoulder.distanceTo(elbow), b = elbow.distanceTo(wrist);
    const direction = anchor.clone().sub(shoulder).normalize();
    if (a < 1e-6 || b < 1e-6 || anchor.distanceToSquared(shoulder)<1e-8) return;
    const length = THREE.MathUtils.clamp(anchor.distanceTo(shoulder), Math.abs(a-b)+0.001, (a+b)*maxReach);
    const target = shoulder.clone().addScaledVector(direction,length);
    const hint=pole || elbow.clone().sub(shoulder);
    let bend = hint.clone().addScaledVector(direction,-hint.dot(direction));
    if (bend.lengthSq() < 1e-6) {
      const axis=Math.abs(direction.z)<0.9?new THREE.Vector3(0,0,1):new THREE.Vector3(1,0,0);
      bend=axis.addScaledVector(direction,-axis.dot(direction));
    }
    bend.normalize();
    const previousBend=this.renderedLimbBends?.get(arm);
    const leg=/upleg$/.test(boneId(arm.name));
    const smoothPole=leg && this.roofBendContinuity && ['IDLE','RUNNING','SPRINTING'].includes(this.poseState);
    if(previousBend && smoothPole && this.limbPoseDelta>0){
      // Transport the rendered bend plane before choosing this frame's pole.
      // Effector targets and segment lengths remain exact; only an IK branch
      // change is bounded, with no timer that can defer the same snap.
      const prior=previousBend.clone().addScaledVector(direction,-previousBend.dot(direction));
      if(prior.lengthSq()>1e-8){
        prior.normalize();const angle=prior.angleTo(bend);
        if(angle>12*this.limbPoseDelta){
          this.roofBendCapped=true;
          const turn=new THREE.Quaternion().setFromUnitVectors(prior,bend);
          turn.slerpQuaternions(new THREE.Quaternion(),turn,12*this.limbPoseDelta/angle);
          bend.copy(prior.applyQuaternion(turn)).normalize();
        }
      }
    }
    const along = (a*a + length*length - b*b) / (2*length);
    const elbowTarget = shoulder.clone().addScaledVector(direction,along)
      .addScaledVector(bend,Math.sqrt(Math.max(0,a*a-along*along)));
    const rotate = (bone, child, goal) => {
      const start = bone.getWorldPosition(new THREE.Vector3());
      const from = child.getWorldPosition(new THREE.Vector3()).sub(start).normalize();
      const to = goal.clone().sub(start).normalize();
      const world = new THREE.Quaternion().setFromUnitVectors(from,to).multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
      bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world)).normalize();
      bone.updateMatrixWorld(true);
    };
    rotate(arm,forearm,elbowTarget); rotate(forearm,hand,target);
  }
}
