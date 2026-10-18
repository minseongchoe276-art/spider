import {createJointConstraints,constrainJoints} from './JointConstraints.js';
import { AIR_TRICKS, trickRotation } from './AirTricks.js';
import { createWebStrand, updateWebStrand } from './WebStrand.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { retargetMotion, prepareMotion, boneId } from './MotionRetarget.js';
import { MOTIONS, STRIDES, GROUNDED } from './MotionCatalog.js';
import { fetchAsset, forEachConcurrent } from './AssetLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { plantMovingFeet, poseWall, poseZipLegs, poseMantle, adaptPelvisToTerrain, footSupport, soleRotation, clearGroundSoles, fitGroundAnkle } from './CharacterPose.js';
import {createHandPoseRig,restoreHandPose,updateWebHandPose} from './WebHandPose.js';
import {createFirstPersonArm,poseFirstPersonFingers,disposeFirstPersonRig,prepareFirstPersonDepth} from './FirstPersonArms.js';

export class Character {
  constructor(scene, onProgress, onLoaded, source = null) {
    this.scene = scene;
    this.onProgress = onProgress;
    this.onLoaded = onLoaded;
    this.group = new THREE.Group();
    this.group.name = 'SpiderManGroup';
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
    this.firstPersonRig = null;
    this.firstPersonHands = [];
    this.isFirstPerson = false;

    // Procedural swing / trick tilt
    this.bodyRoll = 0;
    this.bodyPitch = 0;
    this.trickRotation = 0;
    this.isTricking = false;
    this.targetFacingAngle = 0;
    this.idleTime = 0;
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
    return true;
  }

  disposeCopy() {
    disposeFirstPersonRig(this.firstPersonRig);
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

  setFirstPersonCamera(camera) {
    disposeFirstPersonRig(this.firstPersonRig);
    this.firstPersonRig = new THREE.Group();
    this.firstPersonRig.name = 'SpiderManFirstPersonArms';
    camera.add(this.firstPersonRig);
    this.firstPersonHands=[];this.firstPersonGloves=[];
    for (const side of ['left','right']) {
      const {arm,anchor,glove}=createFirstPersonArm(side,this.model);
      this.firstPersonRig.add(arm);this.firstPersonHands.push(anchor);this.firstPersonGloves.push(glove);
    }
    prepareFirstPersonDepth(this.firstPersonRig);
    this.firstPersonRig.visible = !!this.isFirstPerson;
  }

  setFirstPersonMode(enabled) {
    this.isFirstPerson = !!enabled;
    if (this.firstPersonRig) this.firstPersonRig.visible = this.isFirstPerson;
    if (this.model) this.model.visible = !this.isFirstPerson;
    if (this.placeholder) this.placeholder.visible = !this.isFirstPerson;
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
    const fbxLoader = new FBXLoader();

    try {
      this.onProgress?.(30, '스파이더맨 3D 모델 불러오는 중...');
      // Load Spider-Man GLB
      const gltf = await gltfLoader.parseAsync(await fetchAsset('/models/spiderman.glb'), '/models/');

      this.model = gltf.scene;
      // The exported GLB is already roughly human-sized (about 2 world units tall).
      // Scaling it to 0.012 made the character only a few centimetres tall and
      // effectively invisible beside the city.
      this.model.scale.setScalar(1);
      this.model.position.y = 0;

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
      if(this.firstPersonRig?.parent)this.setFirstPersonCamera(this.firstPersonRig.parent);

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
      console.log('Spider-Man character and animations successfully loaded!');
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
        const fbx = gltf?.scene || fbxLoader.parse(raw, '/models/');
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
      node[property].toArray(track.values,0);node[property].toArray(track.values,track.getValueSize());
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
      this.transitionEndsAt=Math.max(this.transitionEndsAt || 0,this.mixer.time+Math.max(0,duration));
      // A previously fading action still contributes to the visible pose.
      // Resetting it to fade in from zero removes that contribution at once.
      // Capture the blended rig before stopping actions, then use one bounded
      // snapshot to blend into the restarted take without losing its pose.
      let frozenPose=null;
      if(duration>0 && nextAction.isScheduled() && nextAction.getEffectiveWeight()>1e-5)
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

  stopAnimation() {
    restoreHandPose(this.webFingerRig);
    if(this.model && this.jointConstraintModel!==this.model){
      this.jointConstraintModel=this.model;this.jointConstraints=createJointConstraints(this.model,this.bones);
    }this.webGestures={};
    this.mantleArmPose=null;this.mantleArmRelease=0;
    this.mantleExitFeet=null;this.mantleFootRelease=0;
    this.mantleStartFeet=null;
    this.wallGripWeights=null;this.wallGripHeights=null;this.wallGripTargets=null;
    // Reset/respawn can interrupt a crossfade; every outgoing action must
    // release its pose as well as the action currently selected.
    if (this.mixer) {
      this.mixer.stopAllAction();
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
    const wrists = this.isFirstPerson && this.firstPersonHands.length === 2
      ? [this.firstPersonHands[1],this.firstPersonHands[0]].map(hand => hand.getWorldPosition(new THREE.Vector3()))
      : [
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

  updateFirstPersonPose(combat=this.combatAction) {
    if(this.isFirstPerson && this.firstPersonRig)for(const [i,arm] of this.firstPersonRig.children.entries()){
      const t=THREE.MathUtils.clamp(combat?.duration?combat.time/combat.duration:0,0,1);
      const viewClip=combat?.key==='cross'?'rightHook':combat?.key;
      const impact=this.actions?.[viewClip]?.getClip().userData?.impactPhase || .3;
      const pulse=t<=impact?THREE.MathUtils.smoothstep(t/impact,0,1):1-THREE.MathUtils.smoothstep((t-impact)/(1-impact),0,1);
      const striking=combat && ['jab','cross','hook','heavy','special'].includes(combat.key) && i===(['cross','special'].includes(combat.key)?1:0);
      const reach=striking?Math.max(0,pulse):0;
      const gesture=this.webGestures?.[i===0?'left':'right'] || {shoot:0,grip:0};
      const rightHook=combat?.key==='cross' && i===1;
      arm.position.set(rightHook ? .10*Math.sin(Math.PI*reach)-.10*reach : ['hook','heavy'].includes(combat?.key) && i===0 ? .26*reach : 0,
        combat?.key==='guard' ? .14 : .045*gesture.shoot,
        striking?(['hook','heavy'].includes(combat.key)?-0.25:-0.38)*reach:-.12*gesture.shoot);
      const wall=this.wallViewWeight || 0,sign=i===0?-1:1;
      const phase=(this.wallPhase || 0)*Math.PI*2+(i===0?0:Math.PI);
      arm.rotation.set(.28*wall,sign*.08*wall+(rightHook?.16*reach:0),sign*.10*wall+(rightHook?-.15*reach:0));
      if(rightHook){
        const wind=Math.sin(Math.PI*THREE.MathUtils.clamp(t/impact,0,1))*(1-reach);
        arm.position.x=.10*wind-.10*reach;
        arm.position.y=.025*reach;
      }
      if(combat?.key==='special' && i===1){
        const keys=[[0,0,0,0],[.28,.12,-.10,.14],[.4,.07,.14,-.02],
          [.5,-.10,.02,-.42],[.64,-.16,-.08,-.25],[1,0,0,0]];
        const index=Math.max(1,keys.findIndex(k=>k[0]>=t)),a=keys[index-1],b=keys[index];
        arm.position.set(...a.slice(1));arm.position.lerp(new THREE.Vector3(...b.slice(1)),THREE.MathUtils.smoothstep((t-a[0])/(b[0]-a[0]),0,1));
        arm.rotation.y=.12*reach;arm.rotation.z=-.18*reach;
      }
      if(striking){
        // Turn the knuckles into the punch. Translating the upright guard
        // alone made first-person attacks look like a raised forearm.
        const wrist=this.firstPersonHands[i].position;
        const before=wrist.clone().applyQuaternion(arm.quaternion);
        arm.rotation.x-=(rightHook?.40:.70)*reach;
        arm.position.add(before.sub(wrist.clone().applyQuaternion(arm.quaternion)));
      }
      if(wall>1e-5){
        const mantle=this.poseState==='MANTLING'?THREE.MathUtils.smoothstep(this.mantle?.elapsed/this.mantle?.duration || 0,.3,1):0;
        const source=i===0?this.leftHand:this.rightHand;
        const height=source?source.getWorldPosition(new THREE.Vector3()).y-this.group.getWorldPosition(new THREE.Vector3()).y:1.6+.2*Math.sin(phase);
        const handY=THREE.MathUtils.clamp((height-1.6)*.22,-.12,.08);
        const baseY=this.firstPersonHands[i].position.clone().applyQuaternion(arm.quaternion).y;
        const lift=Math.sin(Math.PI*(this.wallContacts?.[(i===0?'left':'right')+'hand']?.swing || 0));
        arm.position.add(new THREE.Vector3(sign*.018*Math.cos(phase),handY-baseY-.20*mantle,-.10+.045*lift).multiplyScalar(wall));
      }
      // Hands follow the actual stride cadence, with a small bounded sway.
      // The camera stays stable for aiming; only the viewmodel moves.
      const stride=GROUNDED.includes(this.poseState)?Math.min(1,(this.viewMoveSpeed || 0)/4.4):0;
      const clip=this.activeAction?.getClip();
      const gait=clip?this.activeAction.time/clip.duration*Math.PI*2:0;
      arm.position.x+=sign*.008*Math.sin(gait)*stride;
      arm.position.y+=.009*Math.cos(gait*2)*stride;
      arm.rotation.z+=sign*.012*Math.sin(gait)*stride;
      const guard=combat || (this.combatStance && GROUNDED.includes(this.poseState)?{key:'combatIdle'}:null);
      poseFirstPersonFingers(arm,gesture.shoot,gesture.grip,guard,wall);
    }
  }

  triggerAirTrick(key = 'front') {
    if (!Object.hasOwn(AIR_TRICKS, key)) return false;
    this.airTrick = { key, elapsed: 0 };
    this.isTricking = true;
    this.trickRotation = 0;
    this.actions?.airTrick?.reset();
    return true;
  }

  cancelAirTrick() {
    this.airTrick = null;
    this.isTricking = false;
    this.trickRotation = 0;
  }

  update(delta, state, velocity, anchorPos) {
    this.poseState=state;this.wallViewWeight=THREE.MathUtils.damp(this.wallViewWeight || 0,['WALL_RUNNING','MANTLING'].includes(state)?1:0,14,delta);
    this.webMotionSpeed=velocity.length();
    this.viewMoveSpeed=Math.hypot(velocity.x,velocity.z);
    if (this.copySource) this.copyLoadedCharacter(this.copySource);
    restoreHandPose(this.webFingerRig);
    if(this.model && this.jointConstraintModel!==this.model){
      this.jointConstraintModel=this.model;this.jointConstraints=createJointConstraints(this.model,this.bones);
    }
    if(state==='MANTLING' && this.lastState!=='MANTLING' && this.model){
      this.group.updateMatrixWorld(true);
      this.mantleStartFeet=Object.fromEntries(['left','right'].map(side=>[side,Object.values(this.bones || {}).find(b=>boneId(b.name)===side+'foot')?.getWorldPosition(new THREE.Vector3())]));
    }else if(state!=='MANTLING')this.mantleStartFeet=null;
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
      updateWebHandPose(this,delta,state);this.updateFirstPersonPose();
      const shotAnchor = this.webShotTimer > 0 ? this.webShotAnchor : null;
      const attached = ['SWINGING', 'WEB_ZIP'].includes(state) && !!anchorPos;
      const visibleAnchor = attached ? anchorPos : (this.persistentWebAnchor || shotAnchor);
      this.updateWeb(!!visibleAnchor, visibleAnchor);
      if (this.placeholder) {
        const angles=this.airTrick?trickRotation(this.airTrick.key,this.airTrick.elapsed):{x:0,y:0,z:0};
        this.placeholder.rotation.set(angles.x,this.targetFacingAngle+angles.y,angles.z);
      }
      return;
    }
    const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
    const grounded = GROUNDED.includes(state);
    const previous = this.lastState;
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
        this.landingAction=(this.landingSpeed > 18 && this.actions.slamLand) ? 'slamLand' : 'land';
      name=this.landingAction;
    }
    else if (state === 'ROLLING') name = 'roll';
    else if (state === 'JUMPING') name = 'jump';
    else if (state === 'FALLING') name = velocity.y < -12 && !(this.contactTime < 0.3) ? 'fall' : 'drop';
    else if (state === 'IDLE') {
      if (previous === 'SPRINTING') name = 'runStop';
      else if (previous === 'RUNNING') name = 'stop';
      else if (playing('runStop')) name = 'runStop';
      else if (playing('stop')) name = 'stop';
    } else name = state === 'SPRINTING' ? 'run' :
      horizontalSpeed > 3.1 ? 'regularRun' : 'walk';
    const combat=this.combatAction;
    const combatClip= combat?.key==='cross'?'rightHook':combat?.key==='hit'?'hitHead':combat?.key?.startsWith('dodge')?'combatIdle':combat?.key;
    const movingStrike=grounded && horizontalSpeed>.25 && combat?.duration && ['jab','cross','hook','heavy','special'].includes(combat.key);
    if(combat && !movingStrike && this.actions[combatClip] && (grounded || combat.key==='slam') && !['ROLLING','TURNING'].includes(state))name=combatClip;
    if (this.airTrick) name = this.airTrick.key === 'front' && this.actions.airTrick
      ? 'airTrick' : this.actions.fallIdle ? 'fallIdle' : 'fall';
    else if(this.isTricking && !grounded && !['WALL_RUNNING','MANTLING','WEB_ZIP'].includes(state) && this.actions.airTrick)name='airTrick';
    this.fadeToAction(name, combatClip===name ? (combat.duration ? 0.065 : name==='guard' ? 0.18 : 0.12) : state==='MANTLING' && name==='idle' ? .3 : ['LANDING','ROLLING'].includes(state) ? 0.06 : grounded ? 0.18 : 0.12);
    if (STRIDES.includes(name)) {
      const measuredSpeed = this.activeAction?.getClip().userData?.nominalSpeed;
      const strideSpeed = measuredSpeed > 0.1 ? measuredSpeed : ({walk:2.8,regularRun:4.8,run:6.5}[name]);
      this.activeAction?.setEffectiveTimeScale(THREE.MathUtils.clamp(
        horizontalSpeed / strideSpeed, 0.15, 1.6));
    }
    if(combatClip===name && combat.id && combat.id!==this.combatClipToken){this.activeAction?.reset().play();this.combatClipToken=combat.id;}
    if(combatClip===name && combat.duration) {
      // The gameplay action owns time, including a slam held until actual
      // contact. Advancing the mixer independently could land in mid-air.
      this.activeAction.enabled=true;this.activeAction.paused=false;
      this.activeAction.time=Math.min(this.activeAction.getClip().duration-1e-6,
        this.activeAction.getClip().duration*THREE.MathUtils.clamp(combat.time/combat.duration,0,1));
      this.activeAction.setEffectiveTimeScale(0);
    }
    if(name==='airTrick')this.activeAction?.setEffectiveTimeScale(
      this.activeAction.getClip().duration / AIR_TRICKS.front.duration);
    if(name==='wall')this.activeAction?.setEffectiveTimeScale(state==='MANTLING'?0:THREE.MathUtils.clamp(velocity.length()/(this.activeAction.getClip().userData.climbSpeed || 3),0,6));
    this.mixer.update(delta);
    this.movingGuardWeight=THREE.MathUtils.damp(this.movingGuardWeight || 0,
      grounded && horizontalSpeed>.25 && (this.combatStance || movingStrike)?1:0,18,delta);
    if(movingStrike || this.movingGuardWeight>.001) {
      const clip=this.actions[movingStrike?combatClip:'combatIdle']?.getClip();
      if(clip) {
        this.strikeLayers ||= new WeakMap();
        if(!this.strikeLayers.has(clip))this.strikeLayers.set(clip,clip.tracks.flatMap(track=>{
          const [id,property]=track.name.split('.'),bone=this.bones[id];
          return bone && property==='quaternion' && /^(spine|neck|head|leftshoulder|rightshoulder|leftarm|rightarm|leftforearm|rightforearm|lefthand|righthand)/.test(boneId(id))
            ?[{bone,sample:track.createInterpolant()}]:[];
        }));
        const phase=movingStrike?THREE.MathUtils.clamp(combat.time/combat.duration,0,1):0;
        // Enter guard before the strike instead of snapping from a running
        // arm swing. Contact stays fully weighted; recovery returns to guard.
        const weight=this.movingGuardWeight;
        const hip=Object.values(this.bones).find(b=>boneId(b.name)==='hips');
        const hipTrack=clip.tracks.find(t=>t.name===hip?.name+'.quaternion');
        if(hipTrack && movingStrike){
          const sample=hipTrack.createInterpolant(),guard=new THREE.Quaternion().fromArray(sample.evaluate(0));
          const pose=new THREE.Quaternion().fromArray(sample.evaluate(phase*clip.duration));
          const twist=new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(),guard.invert().multiply(pose),weight);
          hip.quaternion.multiply(twist);
          // Preserve running foot placement while the pelvis drives the punch.
          for(const child of hip.children)if(['leftupleg','rightupleg'].includes(boneId(child.name)))child.quaternion.premultiply(twist.clone().invert());
        }
        for(const {bone,sample} of this.strikeLayers.get(clip))bone.quaternion.slerp(new THREE.Quaternion().fromArray(sample.evaluate(phase*clip.duration)),weight);
      }
    }
    if (state !== 'LANDING') this.landingSpeed = 0;
    this.lastState = state;
    if(state !== 'LANDING')this.landingAction=null;
    this.idleTime += delta;
    if (grounded || state==='MANTLING') { this.isTricking = false; this.trickRotation = 0; }
    if(this.airTrick){
      this.trickRotation=0;
    } else if(this.isTricking && this.actions.airTrick){
      this.trickRotation=0;
      if(this.activeAction===this.actions.airTrick && this.activeAction.time>=this.activeAction.getClip().duration-.02)this.isTricking=false;
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
      Math.cos(yaw - currentYaw)) * (1 - Math.exp(-12 * delta));
    this.bodyPitch = THREE.MathUtils.damp(this.bodyPitch,
      state === 'WEB_ZIP' ? THREE.MathUtils.clamp(Math.atan2(horizontalSpeed,Math.max(2,velocity.y))*0.65,0,1)
        : state === 'SWINGING' ? THREE.MathUtils.clamp(-velocity.y * 0.015, -0.45, 0.45) : 0, 10, delta);
    this.model.rotation.set(this.bodyPitch + this.trickRotation, this.visualYaw, 0, 'YXZ');
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
    this.model.position.y = grounded && state !== 'ROLLING' ? -0.1 : 0;
    this.model.position.x=0;this.model.position.z=0;
    if (this.airTrick && (this.airTrick.key !== 'front' || !this.actions.airTrick)) {
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
      this.model.position.y=-0.1*(steppingDown?inPose:1)-1.28*inPose*(1-standUp);
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
    updateWebHandPose(this,delta,state);
    this.group.updateMatrixWorld(true);
    adaptPelvisToTerrain(this,delta,grounded && state!=='ROLLING');
    if (name === 'idle' && state === 'IDLE' && horizontalSpeed < 0.05) {
      this.plantIdleFeet(delta);
    } else {
      this.idlePlantDelay=0; this.idleFootAnchors=null;
    }
    if(grounded && state!=='ROLLING') plantMovingFeet(this,delta);
    else {this.movingPlants=null;this.movingReleases=null;this.plantLastFeet=null;this.plantVelocityRoot=null;this.groundFootRotations=null;}
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
        this.wallContacts=null;this.wallPoseRoot=null;this.wallPhase=0;this.wallSoleRotations=null;this.wallPoseWeight=0;
        this.wallGripWeights=null;this.wallGripHeights=null;this.wallGripTargets=null;
      }
      this.wallPoseNormal=this.wallNormal.clone();
      this.wallSoleRotations ||= Object.fromEntries(['left','right'].map(side=>[side,
        this.actions.wall?.getClip().userData?.soleRotations?.[side]
          ? this.model.quaternion.clone().multiply(new THREE.Quaternion().fromArray(this.actions.wall.getClip().userData.soleRotations[side]))
          : Object.values(this.bones || {}).find(b=>boneId(b.name)===side+'foot')?.getWorldQuaternion(new THREE.Quaternion())]));
      poseWall(this,delta,velocity);
    } else {this.wallContacts=null;this.wallPoseRoot=null;this.wallPoseWeight=0;this.wallSoleRotations=null;this.wallPoseNormal=null;this.wallGripWeights=null;this.wallGripHeights=null;this.wallGripTargets=null;}
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
    this.mantleArmPose=['WALL_RUNNING','MANTLING'].includes(state) || this.mantleArmRelease>0
      ?Object.fromEntries(armBones.map(b=>[b.name,b.quaternion.clone()])):null;
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
    constrainJoints(this.jointConstraints);
    if(grounded && state!=='ROLLING')clearGroundSoles(this);
    // Contact clearance can solve the shin again; validate the final ankle
    // and toe output after that pass, including the roof-exit handoff.
    constrainJoints(this.jointConstraints?.filter(item=>item.kind==='foot' || item.kind==='toebase'));
    if(this.jointConstraints){
      this.lastAnklePose ||= new Map();
      for(const {bone,kind} of this.jointConstraints){
        if(kind!=='foot' && kind!=='toebase')continue;
        const last=this.lastAnklePose.get(bone);
        if(last && delta>0 && !grounded)bone.quaternion.copy(last.rotateTowards(bone.quaternion,8*delta));
        this.lastAnklePose.set(bone,bone.quaternion.clone());bone.updateMatrixWorld(true);
      }
    }
    this.mantleExitFeet=state==='MANTLING' || (grounded && this.mantleFootRelease>0)
      ?Object.fromEntries(['left','right'].map(side=>[side,Object.values(this.bones || {}).find(b=>boneId(b.name)===side+'foot')?.getWorldPosition(new THREE.Vector3())])):null;
    this.updateFirstPersonPose(combat);
    const attached = ['SWINGING','WEB_ZIP'].includes(state) && !!anchorPos;
    const visibleAnchor = attached ? anchorPos : (this.persistentWebAnchor || firingAnchor);
    this.updateWeb(!!visibleAnchor, visibleAnchor);
  }

  reachWebAnchor(anchor,weight=1,side=this.currentHand) {
    const prefix = side === 'right' ? 'right' : 'left';
    const find = id => Object.values(this.bones || {}).find(b => boneId(b.name) === prefix + id);
    const arm = find('arm'), forearm = find('forearm'), hand = find('hand');
    if (!arm || !forearm || !hand) return;
    const upper=arm.quaternion.clone(),lower=forearm.quaternion.clone();
    this.solveLimb(arm,forearm,hand,anchor,0.95);
    arm.quaternion.slerpQuaternions(upper,arm.quaternion.clone(),weight);
    forearm.quaternion.slerpQuaternions(lower,forearm.quaternion.clone(),weight);
    arm.updateMatrixWorld(true);
    const direction=anchor.clone().sub(hand.getWorldPosition(new THREE.Vector3())).normalize();
    const up=new THREE.Vector3(0,1,0).addScaledVector(direction,-direction.y);
    if(up.lengthSq()<1e-5)up.set(0,0,1).addScaledVector(direction,-direction.z);
    up.normalize();
    // Cock the wrist above the shot. Pointing the fingers along the rope
    // sent the strand through the palm instead of out below the glove.
    const finger=direction.clone().multiplyScalar(.574).addScaledVector(up,.819).normalize();
    const palm=direction.clone().multiplyScalar(.819).addScaledVector(up,-.574).normalize();
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
