import * as THREE from 'three';
import {selectMixamoTake} from './MixamoMotion.js';
import {choreographCombat} from './CombatChoreography.js';

const meshBones={pelvis:'hips',neck_01:'neck',spine_01:'spine',spine_02:'spine1',spine_03:'spine2'};
for(const [suffix,side] of [['l','left'],['r','right']]) {
  for(const [from,to] of Object.entries({clavicle:'shoulder',upperarm:'arm',lowerarm:'forearm',hand:'hand',thigh:'upleg',calf:'leg',foot:'foot',ball:'toebase'}))meshBones[`${from}_${suffix}`]=side+to;
  for(const finger of ['index','middle','ring','pinky','thumb'])for(let i=1;i<=3;i++)meshBones[`${finger}_0${i}_${suffix}`]=side+'hand'+finger+i;
}
export const boneId = name => meshBones[name.toLowerCase()] || name.replace(/^mixamorig\d*:?/i, '').toLowerCase();
const restPoses = new WeakMap();
const combatBases = new WeakMap();

export function prepareMotion(clip, key, bones, item={}) {
  if(item.authoredMixamo)clip=selectMixamoTake(clip,item);
  const audit = clip.userData;
  if(key==='combatIdle')combatBases.set(Object.values(bones).find(b=>boneId(b.name)==='hips'),clip.clone());
  if(key==='guard' && !item.authoredMixamo) {
    // Defend was authored for a shield with both knees lifted. Keep its
    // defensive upper body over the grounded fighting stance.
    const base=combatBases.get(Object.values(bones).find(b=>boneId(b.name)==='hips'));
    if(base)for(const track of clip.tracks) {
      const id=boneId(track.name.split('.')[0]);
      if(id==='hips' || /^(left|right)(upleg|leg|foot|toebase)$/.test(id)) {
        const stance=base.tracks.find(t=>t.name===track.name);
        if(!stance)continue;
        const sample=Array.from(stance.createInterpolant().evaluate(base.duration*.45));
        for(let i=0;i<track.times.length;i++)track.values.set(sample,i*sample.length);
      }
    }
  }
  // Falling To Roll contains an airborne lead-in. Begin at contact,
  // because the physics controller has already completed the fall.
  if (key === 'roll' && !item.authoredMixamo) clip = THREE.AnimationUtils.subclip(clip, 'roll', 16, Math.floor(clip.duration * 30), 30);
  // Standing Jump includes anticipation and landing. Physics drives
  // takeoff immediately, so use only the airborne portion here.
  if (key === 'jump') clip = THREE.AnimationUtils.subclip(clip, 'jump', 24, 43, 30);
  if (key === 'land') clip = THREE.AnimationUtils.subclip(clip, 'land', 44, 71, 30);
  if(key==='slamLand'){
    // Land_Three_Point starts six metres above the floor. Gameplay selects
    // this action after contact, so retain only impact compression/recovery.
    clip=THREE.AnimationUtils.subclip(clip,key,14,Math.ceil(clip.duration*30),30);
    clip.userData={sourceContactTime:14/30};
  }
  if (key === 'drop') clip = THREE.AnimationUtils.subclip(clip, 'drop', 0, 16, 30);
  if (key === 'femaleStop') clip = THREE.AnimationUtils.subclip(clip, 'femaleStop', 29, 47, 30);
  if (key === 'stop') clip = THREE.AnimationUtils.subclip(clip, 'stop', Math.max(0,Math.floor(clip.duration*30)-8), Math.floor(clip.duration*30), 30);
  if (key === 'swing' || key === 'zip') {
    // Exclude the takeoff and release/standing portions of this take.
    clip = THREE.AnimationUtils.subclip(clip, 'swing', 15, 75, 30);
  }
  if (key === 'zip') {
    // A stable hanging base; the runtime layers directional pull and a leg
    // tuck over it, rather than replaying a takeoff during every web zip.
    for (const track of clip.tracks) {
      const sample=Array.from(track.createInterpolant().evaluate(0.8));
      track.times=new Float32Array([0,1]);
      track.values=new Float32Array([...sample,...sample]);
    }
    clip.duration=1;
  }
  if ((!item.authoredMixamo || ['wall','airTrick'].includes(key)) && ['swing','jump','drop','zip','wall','airTrick','combatIdle','jab','cross','hook','heavy','guard','dodgeLeft','dodgeRight','dodgeBack','dodgeForward','slam','slamLand','hit','hitHead'].includes(key)) {
    const hips = Object.values(bones).find(b => boneId(b.name) === 'hips');
    const positionTrack = clip.tracks.find(t => t.name === `${hips.name}.position`);
    const crouch=['dodgeForward','slamLand'].includes(key);
    // Keep authored vertical pelvis travel for ground rolls and crouched
    // landings. This GLB uses a rotated parent, so local Y is not world up.
    const localUp=new THREE.Vector3(0,1,0).applyQuaternion(hips.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
    for (let i = 0; i < positionTrack.values.length; i += 3) {
      const offset=new THREE.Vector3().fromArray(positionTrack.values,i).sub(hips.position);
      const position=hips.position.clone();
      if(crouch)position.addScaledVector(localUp,offset.dot(localUp));
      position.toArray(positionTrack.values,i);
    }
  }
  if(!item.authoredMixamo && ['combatIdle','jab','cross','rightHook','special','hook','heavy','guard','dodgeLeft','dodgeRight','dodgeBack','dodgeForward'].includes(key)) {
    const base=combatBases.get(Object.values(bones).find(b=>boneId(b.name)==='hips'));
    if(base)clip=choreographCombat(base,key,bones,boneId);
  }
  if (key === 'turnLeft' || key === 'turnRight') {
    // Let the controller own heading; remove authored pelvis yaw so it is
    // not added a second time to the model's turn.
    const hips = Object.values(bones).find(b => boneId(b.name) === 'hips');
    const track = clip.tracks.find(t => t.name === `${hips.name}.quaternion`);
    const parent = hips.parent.getWorldQuaternion(new THREE.Quaternion());
    const inverse = parent.clone().invert();
    const first = parent.clone().multiply(new THREE.Quaternion().fromArray(track.values)).invert();
    for (let i=0;i<track.values.length;i+=4) {
      const world = parent.clone().multiply(new THREE.Quaternion().fromArray(track.values,i));
      const relative = world.clone().multiply(first);
      const twist = new THREE.Quaternion(0,relative.y,0,relative.w).normalize();
      inverse.clone().multiply(twist.invert().multiply(world)).normalize().toArray(track.values,i);
    }
  }
  if (['idle','walk','jog','regularRun','run','fall','fallVariant','fallIdle','injuredIdle','swing','wall','zip','combatIdle','guard','jab','cross','hook','heavy','special'].includes(key)) {
    // Loops close cleanly; short authored strikes also recover to their
    // initial guard so the next action does not inherit a hanging fist.
    const seam=['jab','cross','hook','heavy','special'].includes(key)?0.12:0.15;
    for (const track of clip.tracks) {
      for (let i = 0; i < track.times.length; i++) {
        const alpha = THREE.MathUtils.clamp((track.times[i] - clip.duration + seam) / seam, 0, 1);
        if (!alpha) continue;
        if (track.ValueTypeName === 'quaternion') {
          const q = new THREE.Quaternion().fromArray(track.values, i * 4);
          q.slerp(new THREE.Quaternion().fromArray(track.values), alpha).toArray(track.values, i * 4);
        } else {
          for (let j = 0; j < 3; j++) track.values[i * 3 + j] = THREE.MathUtils.lerp(track.values[i * 3 + j], track.values[j], alpha);
        }
      }
    }
  }
  clip.userData = {...audit,...clip.userData};
  if(['slamLand','hit','hitHead'].includes(key)){
    const nodes=Object.values(bones),saved=nodes.map(n=>({n,p:n.position.clone(),q:n.quaternion.clone()}));
    const hips=nodes.find(n=>boneId(n.name)==='hips'),feet=['left','right'].map(side=>nodes.find(n=>boneId(n.name)===side+'foot'));
    let root=hips;while(root.parent && !root.parent.name?.includes('SpiderManGroup'))root=root.parent;
    const position=clip.tracks.find(track=>track.name===hips.name+'.position');
    // Preserve the authored bend relative to the legs while keeping the
    // support ankle on the floor. Bind-pose pelvis height floated hit poses.
    const mixer=new THREE.AnimationMixer(root),action=mixer.clipAction(clip);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
    try{for(let i=0;i<position.times.length;i++){
      action.time=position.times[i];action.enabled=true;action.paused=false;mixer.update(0);root.updateMatrixWorld(true);
      const ground=root.getWorldPosition(new THREE.Vector3()).y,contact=Math.min(...feet.map(foot=>foot.getWorldPosition(new THREE.Vector3()).y));
      const correction=new THREE.Vector3(0,ground+.11-contact,0).applyQuaternion(hips.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).divide(hips.parent.getWorldScale(new THREE.Vector3()));
      hips.position.clone().add(correction).toArray(position.values,i*3);
    }}finally{mixer.stopAllAction();mixer.uncacheRoot(root);saved.forEach(({n,p,q})=>{n.position.copy(p);n.quaternion.copy(q);});root.updateMatrixWorld(true);}
    clip.userData.groundedContact=true;
  }
  if (key === 'roll' && !item.authoredMixamo && audit.rootMotion) {
    const start = 16 / 30;
    const points = audit.rootMotion.filter(p => p.time >= start);
    const origin = points[0];
    clip.userData.rootMotion = points.map(p => ({
      time:(p.time-origin.time)*clip.duration/(points.at(-1).time-origin.time),
      distance:p.distance-origin.distance,
    }));
  }
  clip.name = key;
  if (['walk','jog','regularRun','run','stop','runStop','land','slamLand','turnLeft','turnRight','wall','combatIdle','jab','cross','rightHook','hook','heavy','special','guard','dodgeLeft','dodgeRight','dodgeBack','hit','hitHead'].includes(key)) {
    // Contact windows measured on this character, not guessed from the
    // clip name. Preserve the compiler's bind pose after sampling.
    const nodes=Object.values(bones), saved=nodes.map(n=>({n,p:n.position.clone(),q:n.quaternion.clone()}));
    let root=nodes[0]; while(root.parent && !root.parent.name?.includes('SpiderManGroup')) root=root.parent;
    const mixer=new THREE.AnimationMixer(root);const action=mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce);action.clampWhenFinished=true;action.play();
    const feet=['left','right'].map(side=>nodes.find(n=>boneId(n.name)===side+'foot'));
    mixer.setTime(0);root.updateMatrixWorld(true);
    const initialSoles=Object.fromEntries(feet.map((foot,i)=>[['left','right'][i],foot.getWorldQuaternion(new THREE.Quaternion()).toArray()]));
    const samples=[];const count=Math.ceil(clip.duration*60);
    for(let i=0;i<=count;i++) {
      mixer.setTime(clip.duration*i/count);root.updateMatrixWorld(true);
      const baseY=root.getWorldPosition(new THREE.Vector3()).y;
      samples.push({time:clip.duration*i/count,heights:feet.map(f=>f.getWorldPosition(new THREE.Vector3()).y-baseY)});
    }
    if(key!=='wall')clip.userData.footContacts=samples.map(p=>({time:p.time,
      left:p.heights[0]<0.17,right:p.heights[1]<0.17}));
    if(['combatIdle','jab','cross','rightHook','hook','heavy','special'].includes(key))clip.userData.soleRotations ||= initialSoles;
    mixer.stopAllAction();mixer.uncacheRoot(root);
    saved.forEach(({n,p,q})=>{n.position.copy(p);n.quaternion.copy(q);});root.updateMatrixWorld(true);
    // Wall soles use the neutral standing bind pose, never a bent climb frame.
    if(key==='wall')clip.userData.soleRotations=Object.fromEntries(feet.map((f,i)=>[
      ['left','right'][i],f.getWorldQuaternion(new THREE.Quaternion()).toArray()]));
  }
  return clip;
}

// Bake Mixamo source world-space rotations into the target's local axes.
// FBX and GLB roots use different units and coordinate systems; track renaming
// alone is not retargeting (in particular, GLB Hips is rotated -90 degrees).
export function retargetMotion(target, source, clip, fps = 30) {
  const targetBones = [], sourceBones = new Map();
  target.traverse(n => { if (n.isBone) targetBones.push(n); });
  source.traverse(n => { if (n.isBone) sourceBones.set(boneId(n.name), n); });
  // Keep imported local rest transforms. skeleton.pose() uses inverse binds
  // that this asset stores in a different mesh coordinate system.
  if (!restPoses.has(target)) restPoses.set(target, targetBones.map(n => ({
    n, p: n.position.clone(), q: n.quaternion.clone(), s: n.scale.clone(),
  })));
  restPoses.get(target).forEach(({ n, p, q, s }) => {
    n.position.copy(p); n.quaternion.copy(q); n.scale.copy(s);
  });
  target.updateMatrixWorld(true);
  source.updateMatrixWorld(true);
  const pairs = targetBones.map(t => {
    const s = sourceBones.get(boneId(t.name));
    return s && { t, s, targetRest: t.getWorldQuaternion(new THREE.Quaternion()),
      sourceInverse: s.getWorldQuaternion(new THREE.Quaternion()).invert(),
      position: t.position.clone(), rotation: t.quaternion.clone(), scale: t.scale.clone(),
      values: [], positions: [] };
  }).filter(Boolean);
  if (!pairs.some(p => boneId(p.t.name) === 'hips') || pairs.length < 20) {
    throw new Error(`Incompatible skeleton: ${pairs.length} matching bones`);
  }
  const hips = pairs.find(p => boneId(p.t.name) === 'hips');
  // These are all Mixamo rigs with the same joint-axis convention, but the
  // target was exported in an A-pose and most sources in a T-pose. Per-joint
  // rest deltas would keep that A-pose offset and fold arms into the torso.
  const rootAlignment = hips.targetRest.clone().multiply(hips.sourceInverse);
  const mesh2motion = hips.s.name === 'pelvis';
  if(mesh2motion && !clip.name.includes('Climb Wall')) {
    // This target binds its arms down in an A pose; the source binds in a T
    // pose. Calibrate the arm chain to the source's rest direction, otherwise
    // a chest-height punch becomes a waist-height punch after retargeting.
    for(const side of ['left','right']) {
      const arm=pairs.find(p=>boneId(p.t.name)===side+'arm');
      const forearm=pairs.find(p=>boneId(p.t.name)===side+'forearm');
      if(!arm || !forearm)continue;
      const targetDirection=forearm.t.getWorldPosition(new THREE.Vector3()).sub(arm.t.getWorldPosition(new THREE.Vector3())).normalize();
      const sourceDirection=forearm.s.getWorldPosition(new THREE.Vector3()).sub(arm.s.getWorldPosition(new THREE.Vector3())).normalize();
      const correction=new THREE.Quaternion().setFromUnitVectors(targetDirection,sourceDirection);
      for(const p of pairs)if(new RegExp('^'+side+'(arm|forearm|hand)').test(boneId(p.t.name)))p.targetRest.premultiply(correction);
    }
  }
  const srcOrigin = hips.s.getWorldPosition(new THREE.Vector3());
  const targetOrigin = hips.t.getWorldPosition(new THREE.Vector3());
  const sourceFoot = sourceBones.get('leftfoot');
  const targetFoot = pairs.find(p => boneId(p.t.name) === 'leftfoot')?.t;
  const ratio = sourceFoot && targetFoot
    ? targetOrigin.distanceTo(targetFoot.getWorldPosition(new THREE.Vector3())) /
      srcOrigin.distanceTo(sourceFoot.getWorldPosition(new THREE.Vector3())) : 0.0254;
  const mixer = new THREE.AnimationMixer(source);
  mixer.clipAction(clip).play();
  const times = [], count = Math.max(2, Math.ceil(clip.duration * fps) + 1);
  const rootSamples = [];
  for (let frame = 0; frame < count; frame++) {
    const time = clip.duration * frame / (count - 1);
    times.push(time);
    // Avoid LoopRepeat wrapping the final sample to the beginning.
    mixer.setTime(Math.min(time, clip.duration - 1e-6));
    source.updateMatrixWorld(true);
    rootSamples.push(hips.s.getWorldPosition(new THREE.Vector3()));
    for (const p of pairs) {
      const sourceWorld=p.s.getWorldQuaternion(new THREE.Quaternion());
      const world = mesh2motion
        ? sourceWorld.multiply(p.sourceInverse).multiply(p.targetRest)
        : rootAlignment.clone().multiply(sourceWorld);
      const parent = p.t.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
      p.t.quaternion.copy(parent.multiply(world)).normalize();
      if (p === hips) {
        const dy = (p.s.getWorldPosition(new THREE.Vector3()).y - srcOrigin.y) * ratio;
        const pos = targetOrigin.clone(); pos.y += dy;
        p.t.position.copy(p.t.parent.worldToLocal(pos));
        p.positions.push(...p.t.position.toArray());
      }
      p.t.updateMatrixWorld(true);
      // Quaternion signs must stay continuous for interpolation and auditing.
      if (p.values.length && p.t.quaternion.dot(new THREE.Quaternion().fromArray(p.values, p.values.length - 4)) < 0) {
        p.t.quaternion.set(...p.t.quaternion.toArray().map(v => -v));
      }
      p.values.push(...p.t.quaternion.toArray());
    }
  }
  const tracks = pairs.map(p => new THREE.QuaternionKeyframeTrack(`${p.t.name}.quaternion`, times, p.values));
  tracks.push(new THREE.VectorKeyframeTrack(`${hips.t.name}.position`, times, hips.positions));
  pairs.forEach(p => { p.t.position.copy(p.position); p.t.quaternion.copy(p.rotation); p.t.scale.copy(p.scale); });
  target.updateMatrixWorld(true);
  mixer.stopAllAction(); mixer.uncacheRoot(source);
  const result = new THREE.AnimationClip(clip.name, clip.duration, tracks);
  const displacement = rootSamples.at(-1).clone().sub(rootSamples[0]);
  result.userData = { matchedBones: pairs.length, unitScale: ratio,
    nominalSpeed: Math.hypot(displacement.x,displacement.z) * ratio / clip.duration,
    climbSpeed:Math.abs(displacement.y)*ratio/clip.duration,
    rootMotion: rootSamples.map((p,i) => ({time:times[i],distance:Math.hypot(p.x-rootSamples[0].x,p.z-rootSamples[0].z)*ratio})) };
  return result;
}
