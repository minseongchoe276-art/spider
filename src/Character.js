import { createWebStrand, updateWebStrand } from './WebStrand.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { retargetMotion, prepareMotion, boneId } from './MotionRetarget.js';
import { MOTIONS, STRIDES, GROUNDED } from './MotionCatalog.js';
import { fetchAsset } from './AssetLoader.js';
import { plantMovingFeet, poseWall, poseZipLegs, poseMantle, adaptPelvisToTerrain, footSupport, soleRotation } from './CharacterPose.js';

export class Character {
  constructor(scene, onProgress, onLoaded) {
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

    // Web rope visual
    this.initWebVisual();

    // Start loading models and animations
    this.loadCharacter();
  }

  initWebVisual() {
    const primary=createWebStrand(this.scene),secondary=createWebStrand(this.scene);
    this.webLine=primary.line;this.webMesh=primary.mesh;
    this.webLineOffhand=secondary.line;this.webMeshOffhand=secondary.mesh;
    this.webVisualTime=0;
  }

  setFirstPersonCamera(camera) {
    this.firstPersonRig = new THREE.Group();
    this.firstPersonRig.name = 'SpiderManFirstPersonArms';
    camera.add(this.firstPersonRig);
    const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x12345f, roughness: 0.68, metalness: 0.05 });
    const gloveMat = new THREE.MeshStandardMaterial({ color: 0xb51e32, roughness: 0.52, metalness: 0.04 });
    const cuffMat = new THREE.MeshStandardMaterial({ color: 0xdbe8f4, roughness: 0.45, metalness: 0.1 });
    for (const side of [-1, 1]) {
      const elbow = new THREE.Vector3(side * 0.53, -0.55, -0.22);
      const wrist = new THREE.Vector3(side * 0.29, -0.31, -0.67);
      const segment = new THREE.Group();
      const axis = wrist.clone().sub(elbow);
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.13, axis.length(), 10), sleeveMat);
      sleeve.position.copy(elbow).add(wrist).multiplyScalar(0.5);
      sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize());
      sleeve.castShadow = true;
      segment.add(sleeve);
      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 10), gloveMat);
      glove.position.copy(wrist);
      glove.scale.set(1, 0.82, 1.22);
      segment.add(glove);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.055, 10), cuffMat);
      cuff.position.copy(wrist).addScaledVector(axis.clone().normalize(), -0.085);
      cuff.quaternion.copy(sleeve.quaternion);
      segment.add(cuff);
      this.firstPersonRig.add(segment);
      const anchor = new THREE.Object3D();
      anchor.position.copy(wrist);
      this.firstPersonRig.add(anchor);
      this.firstPersonHands.push(anchor);
    }
    this.firstPersonRig.visible = false;
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

      this.isLoaded = true;
      this.onProgress?.(100, '준비 완료!');
      this.onLoaded?.();
      console.log('Spider-Man character and animations successfully loaded!');
    } catch (err) {
      console.warn('Failed loading GLTF/FBX models, keeping high-poly proxy:', err);
      this.loadWarning = '캐릭터 리소스를 불러오지 못해 대체 캐릭터로 실행합니다.';
      this.isLoaded = true;
      this.onProgress?.(100, this.loadWarning);
      this.onLoaded?.();
    }
  }

  async loadFbxAnimations(fbxLoader) {
    const animFiles = MOTIONS;
    const sources = new Map();

    for (const item of animFiles) {
      try {
        let clip;
        try {
          const data = JSON.parse(new TextDecoder().decode(await fetchAsset(`/motions/${item.key}.json`)));
          clip = THREE.AnimationClip.parse(data);
          clip.userData = data.userData || {};
          if (!Number.isFinite(clip.duration) || clip.duration <= 0 || !(clip.userData.matchedBones >= 20) || !clip.tracks.length ||
              !clip.tracks.every(track => [...track.values].every(Number.isFinite))) throw new Error('Invalid compiled motion');
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
    }
  }


  fadeToAction(name, duration = 0.2) {
    if (!this.actions[name]) {
      const alternatives = {
        walk: ['jog', 'regularRun', 'run'], jog: ['walk', 'regularRun', 'run'],
        regularRun: ['run', 'jog', 'walk'], run: ['regularRun', 'jog', 'walk'],
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

    if (previousAction !== nextAction) {
      if (previousAction) {
        if (duration > 0) previousAction.fadeOut(duration);
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
        nextAction.time = (previousAction.time / previousAction.getClip().duration % 1) * nextAction.getClip().duration;
      }
    }
  }

  stopAnimation() {
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
    this.currentHand=hand;
    this.webShotAnchor = anchor.clone();
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
    this.currentHand=hand;
    this.webShotAnchor=target.clone();
    this.webShotTimer=0.55;
    this.webLaunchTimers[hand]=0.22;
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
    updateWebStrand(line,mesh,wrist,anchorPos,this.webVisualTime || 0,launch);
  }

  triggerAirTrick() {
    this.isTricking = true;
    this.trickRotation = 0;
    this.actions?.airTrick?.reset();
  }

  update(delta, state, velocity, anchorPos) {
    for(const hand of ['left','right'])if(this.webLaunchTimers?.[hand]>0)
      this.webLaunchTimers[hand]=Math.max(0,this.webLaunchTimers[hand]-delta);
    this.webVisualTime=(this.webVisualTime || 0)+delta;
    this.webShotTimer = Math.max(0, this.webShotTimer - delta);
    if (this.webShotTimer === 0) this.webShotAnchor = null;
    if (!this.mixer || !this.model) {
      const shotAnchor = this.webShotTimer > 0 ? this.webShotAnchor : null;
      const attached = ['SWINGING', 'WEB_ZIP'].includes(state) && !!anchorPos;
      const visibleAnchor = attached ? anchorPos : (this.persistentWebAnchor || shotAnchor);
      this.updateWeb(!!visibleAnchor, visibleAnchor);
      if (this.placeholder) this.placeholder.rotation.y = this.targetFacingAngle;
      return;
    }
    const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
    const grounded = GROUNDED.includes(state);
    const previous = this.lastState;
    const playing = name => !!this.actions[name] && this.activeAction === this.actions[name] &&
      this.activeAction.time < this.activeAction.getClip().duration - 0.05;
    let name = 'idle';
    if (state === 'SWINGING') name = 'swing';
    else if (state === 'WALL_RUNNING' || state === 'MANTLING') name = 'wall';
    else if (state === 'WEB_ZIP') name = 'zip';
    else if (state === 'TURNING') name = this.pendingTurn === 'left' ? 'turnLeft' : 'turnRight';
    else if (state === 'LANDING') name = (this.landingSpeed > 18 && this.actions.slamLand) ? 'slamLand' : 'land';
    else if (state === 'ROLLING') name = 'roll';
    else if (state === 'JUMPING') name = 'jump';
    else if (state === 'FALLING') name = velocity.y < -12 && !(this.contactTime < 0.3) ? 'fall' : 'drop';
    else if (state === 'IDLE') {
      if (previous === 'SPRINTING') name = 'runStop';
      else if (previous === 'RUNNING') name = 'stop';
      else if (playing('runStop')) name = 'runStop';
      else if (playing('stop')) name = 'stop';
    } else name = state === 'SPRINTING' ? 'run' :
      horizontalSpeed > 4.1 ? 'regularRun' : horizontalSpeed > 3.1 ? 'jog' : 'walk';
    const combat=this.combatAction;
    if(combat && this.actions[combat.key] && (grounded || combat.key==='slam') && !['ROLLING','TURNING'].includes(state))name=combat.key;
    if(this.isTricking && !grounded && !['WALL_RUNNING','MANTLING','WEB_ZIP'].includes(state) && this.actions.airTrick)name='airTrick';
    this.fadeToAction(name, combat?.key===name ? (combat.duration ? 0.065 : name==='guard' ? 0.18 : 0.12) : ['LANDING','ROLLING'].includes(state) ? 0.06 : grounded ? 0.18 : 0.12);
    if (STRIDES.includes(name)) {
      const measuredSpeed = this.activeAction?.getClip().userData?.nominalSpeed;
      const strideSpeed = measuredSpeed > 0.1 ? measuredSpeed : ({walk:2.8,jog:3.4,regularRun:4.8,run:6.5}[name]);
      this.activeAction?.setEffectiveTimeScale(THREE.MathUtils.clamp(
        horizontalSpeed / strideSpeed, 0.15, 1.6));
    }
    if(combat?.key===name && combat.id && combat.id!==this.combatClipToken){this.activeAction?.reset().play();this.combatClipToken=combat.id;}
    if(combat?.key===name && combat.duration) {
      // The gameplay action owns time, including a slam held until actual
      // contact. Advancing the mixer independently could land in mid-air.
      this.activeAction.enabled=true;this.activeAction.paused=false;
      this.activeAction.time=Math.min(this.activeAction.getClip().duration-1e-6,
        this.activeAction.getClip().duration*THREE.MathUtils.clamp(combat.time/combat.duration,0,1));
      this.activeAction.setEffectiveTimeScale(0);
    }
    if(name==='airTrick')this.activeAction?.setEffectiveTimeScale(1.15);
    if(name==='wall')this.activeAction?.setEffectiveTimeScale(state==='MANTLING'?0:THREE.MathUtils.clamp(velocity.length()/(this.activeAction.getClip().userData.climbSpeed || 3),0,6));
    this.mixer.update(delta);
    if (state !== 'LANDING') this.landingSpeed = 0;
    this.lastState = state;
    this.idleTime += delta;
    if (grounded || state==='MANTLING') { this.isTricking = false; this.trickRotation = 0; }
    if(this.isTricking && this.actions.airTrick){
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
    if(state==='WALL_RUNNING' && this.wallNormal) this.model.position.addScaledVector(this.wallNormal,-Math.max(0,(this.wallDistance ?? 0.7)-0.4));
    if(state==='MANTLING' && this.mantle) {
      const t=this.mantle.elapsed/this.mantle.duration;
      this.model.position.addScaledVector(this.wallNormal,-Math.max(0,(this.mantle.gap ?? 0.7)-0.4)*(1-t));
      // Crouch the visual pelvis while the swept capsule clears the edge;
      // an upright chest would leave the planted roof grips out of reach.
      const inPose=THREE.MathUtils.smoothstep(t,0,0.12);
      const standUp=THREE.MathUtils.smoothstep(t,0.5,0.92);
      this.model.position.y=-0.1-1.15*inPose*(1-standUp);
    }
    if(this.isFirstPerson && this.firstPersonRig)for(const [i,arm] of this.firstPersonRig.children.entries()){
      const t=combat?.duration?combat.time/combat.duration:0,pulse=Math.sin(Math.PI*Math.min(1,t*2));
      const striking=combat && ['jab','cross','hook','heavy','special'].includes(combat.key) && i===(combat.key==='cross'?1:0);
      const reach=striking?Math.max(0,pulse):0;
      arm.position.set(['hook','heavy'].includes(combat?.key) && i===0 ? .26*reach : 0,
        combat?.key==='guard' ? .14 : 0,
        striking?(['hook','heavy'].includes(combat.key)?-0.25:-0.38)*reach:0);
    }
    this.group.updateMatrixWorld(true);
    adaptPelvisToTerrain(this,delta,grounded && state!=='ROLLING');
    if (name === 'idle' && state === 'IDLE' && horizontalSpeed < 0.05) {
      this.plantIdleFeet(delta);
    } else {
      this.idlePlantDelay=0; this.idleFootAnchors=null;
    }
    if(grounded && state!=='ROLLING') plantMovingFeet(this,delta);
    else {this.movingPlants=null;this.movingReleases=null;this.plantLastFeet=null;this.plantVelocityRoot=null;}
    if(state==='WEB_ZIP') poseZipLegs(this,delta);
    else this.zipPoseWeight=0;
    const firingAnchor = this.webShotTimer > 0 ? this.webShotAnchor : null;
    const reachingAnchor=['SWINGING','WEB_ZIP'].includes(state)?anchorPos:firingAnchor;
    this.webArmWeight=THREE.MathUtils.damp(this.webArmWeight || 0,reachingAnchor?1:0,18,delta);
    if(reachingAnchor)this.webPoseAnchor=reachingAnchor.clone();
    if(Array.isArray(this.webAttachments)) {
      this.webHandWeights ||= {};this.webHandTargets ||= {};
      for(const hand of ['left','right']) {
        const target=['SWINGING','WEB_ZIP'].includes(state)
          ?this.webAttachments.find(web=>web.hand===hand)?.anchor
          :hand===this.currentHand?firingAnchor:null;
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
      }
      this.wallPoseNormal=this.wallNormal.clone();
      this.wallSoleRotations ||= Object.fromEntries(['left','right'].map(side=>[side,
        this.actions.wall?.getClip().userData?.soleRotations?.[side]
          ? this.model.quaternion.clone().multiply(new THREE.Quaternion().fromArray(this.actions.wall.getClip().userData.soleRotations[side]))
          : Object.values(this.bones || {}).find(b=>boneId(b.name)===side+'foot')?.getWorldQuaternion(new THREE.Quaternion())]));
      poseWall(this,delta,velocity);
    } else {this.wallContacts=null;this.wallPoseRoot=null;this.wallPoseWeight=0;this.wallSoleRotations=null;this.wallPoseNormal=null;}
    if(state==='MANTLING')poseMantle(this,delta);
    else this.mantleHandTargets=null;
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
      bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));
      bone.updateMatrixWorld(true);
    };
    rotate(arm,forearm,elbowTarget); rotate(forearm,hand,target);
  }
}
