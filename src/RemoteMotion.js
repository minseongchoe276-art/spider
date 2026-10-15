import { AIR_TRICKS } from './AirTricks.js';
import * as THREE from 'three';
import { Character } from './Character.js';
import { groundSample } from './LedgeTraversal.js';

const STATES = new Set(['IDLE','RUNNING','SPRINTING','JUMPING','FALLING','SWINGING','WEB_ZIP',
  'WALL_RUNNING','MANTLING','LANDING','ROLLING','TURNING']);
const COMBAT = new Set(['combatIdle','jab','cross','hook','heavy','guard','dodge',
  'dodgeLeft','dodgeRight','dodgeBack','dodgeForward','slam','slamLand','special','hit','hitHead']);
const vector = v => v && [v.x,v.y,v.z].every(n => Number.isFinite(n) && Math.abs(n)<=10000)
  ? {x:v.x,y:v.y,z:v.z} : null;
const cleanShot=shot=>{
  const target=vector(shot?.target);
  return target && ['left','right'].includes(shot?.hand) && Number.isFinite(shot.remaining) && shot.remaining>0
    ? {hand:shot.hand,target,remaining:THREE.MathUtils.clamp(shot.remaining,0,.55),miss:shot.miss===true} : null;
};

export function sanitizePose(pose) {
  if (!pose || !STATES.has(pose.state)) return null;
  const velocity = vector(pose.velocity);
  if (!velocity || Math.hypot(velocity.x,velocity.y,velocity.z)>150) return null;
  const webs = (Array.isArray(pose.webs)?pose.webs:[]).slice(0,2)
    .map(w => ({hand:w?.hand==='right'?'right':'left',anchor:vector(w?.anchor)})).filter(w => w.anchor);
  let combat = null;
  const webShot=cleanShot(pose.webShot);
  const webShots=(Array.isArray(pose.webShots)?pose.webShots:[]).slice(0,2).map(cleanShot).filter(Boolean)
    .filter((shot,i,shots)=>shots.findIndex(other=>other.hand===shot.hand)===i);
  if (COMBAT.has(pose.combat?.key) && [pose.combat.time ?? 0,pose.combat.duration ?? 0].every(Number.isFinite))
    combat = {key:pose.combat.key,id:String(pose.combat.id || '').slice(0,40),
      time:THREE.MathUtils.clamp(pose.combat.time ?? 0,0,10),duration:THREE.MathUtils.clamp(pose.combat.duration ?? 0,0,10)};
  const m=pose.mantle;
  const mantle=m && [m.elapsed,m.duration,m.gap,m.height].every(Number.isFinite)
    && m.duration>0 && vector(m.normal) && vector(m.edge) && vector(m.start) && vector(m.end)
    ? {...Object.fromEntries(['normal','edge','start','end'].map(k=>[k,vector(m[k])])),
      elapsed:THREE.MathUtils.clamp(m.elapsed,0,2),duration:THREE.MathUtils.clamp(m.duration,.1,2),
      gap:THREE.MathUtils.clamp(m.gap,0,2),height:m.height} : null;
  return {state:pose.state,velocity,webs,webShot,webShots,anchor:vector(pose.anchor),wallNormal:vector(pose.wallNormal),
    mantle,wallDistance:Number.isFinite(pose.wallDistance)?THREE.MathUtils.clamp(pose.wallDistance,0,2):.7,
    landingSpeed:Number.isFinite(pose.landingSpeed)?THREE.MathUtils.clamp(pose.landingSpeed,0,100):0,
    airTrick: pose.tricking && Object.hasOwn(AIR_TRICKS, pose.airTrick?.key) && Number.isFinite(pose.airTrick.elapsed)
      ? { key: pose.airTrick.key, elapsed: THREE.MathUtils.clamp(pose.airTrick.elapsed, 0, AIR_TRICKS[pose.airTrick.key].duration) } : null,
    pendingTurn:pose.pendingTurn==='left'?'left':'right',combat,tricking:!!pose.tricking};
}

export function capturePose(physics,character) {
  return sanitizePose({state:physics.animationState || physics.state,velocity:physics.velocity,webs:physics.webs,
    webShots:Object.entries(character.webLaunchTimers || {}).filter(([,remaining])=>remaining>0).map(([hand,remaining])=>({hand,remaining,
      target:character.webAttachments?.find(web=>web.hand===hand)?.anchor || (hand===character.currentHand?character.webShotAnchor:null),
      miss:hand===character.currentHand && character.webShotIsMiss})),
    webShot:character.webShotTimer>0 && character.webShotAnchor ? {hand:character.currentHand,target:character.webShotAnchor,
      remaining:character.webShotTimer,miss:character.webShotIsMiss} : null,
    anchor:physics.anchorPoint || physics.zipAnchor,wallNormal:physics.wallNormal,
    mantle:physics.mantle,wallDistance:character.wallDistance,landingSpeed:character.landingSpeed,
    pendingTurn:character.pendingTurn,combat:character.combatAction,tricking:character.isTricking,airTrick:character.airTrick});
}

export class RemoteMotion {
  constructor(scene, source, player, city) {
    this.character = new Character(scene,null,null,source);
    this.mesh = this.character.group;
    this.mesh.name = `OnlineSpiderMan-${player.id}`;
    this.target = new THREE.Vector3(player.x,player.y,player.z);
    this.mesh.position.copy(this.target);
    this.previous = this.target.clone(); this.velocity = new THREE.Vector3();
    this.player = player; this.receivedAt = performance.now(); this.poseAt = -Infinity;
    this.character.surfaceProbe = p => groundSample(city,p,.8);
    this.marker = new THREE.Mesh(new THREE.ConeGeometry(.18,.38,6),new THREE.MeshBasicMaterial({
      color:player.team==='police'?0x45cfff:player.team==='runner'?0xff536e:0xf7c84b}));
    this.marker.position.y=2.7; this.mesh.add(this.marker);
    this.marker.visible=this.character.isLoaded;
  }
  receive(player,pose,now=performance.now()) {
    const point = new THREE.Vector3(player.x,player.y,player.z);
    if (!point.equals(this.target)) {
      const dt = Math.max(.04,(now-this.receivedAt)/1000);
      this.velocity.copy(point).sub(this.target).divideScalar(dt).clampLength(0,48);
      this.receivedAt=now; this.target.copy(point);
    }
    this.player=player;
    const clean=sanitizePose(pose);
    if (clean) {this.pose=clean;this.poseAt=now;this.velocity.copy(clean.velocity);}
  }
  update(delta,now=performance.now()) {
    const c=this.character;
    this.previous.copy(this.mesh.position);
    if (this.mesh.position.distanceToSquared(this.target)>1600) this.mesh.position.copy(this.target);
    else this.mesh.position.lerp(this.target,1-Math.exp(-15*delta));
    const fresh = this.pose && now-this.poseAt<650;
    const v = this.velocity.clone();
    if (!fresh && now-this.receivedAt>350) v.set(0,0,0);
    let state;
    if (fresh) state=this.pose.state;
    else {
      const support=c.surfaceProbe(this.mesh.position);
      const grounded=!!support && Math.abs(this.mesh.position.y-support.height-.1)<.6;
      state=grounded ? (Math.hypot(v.x,v.z)>.2?'RUNNING':'IDLE') : v.y>1?'JUMPING':'FALLING';
    }
    // Ground strides follow the interpolated root, preventing feet sliding
    // while a 10Hz network update is being smoothed into display frames.
    if (['IDLE','RUNNING','SPRINTING'].includes(state))
      v.copy(this.mesh.position).sub(this.previous).divideScalar(Math.max(delta,1e-5));
    c.targetFacingAngle=this.player.facing || 0;
    c.webAttachments=fresh ? this.pose.webs.map(w=>({hand:w.hand,anchor:new THREE.Vector3().copy(w.anchor)})) : [];
    const shot=fresh?this.pose.webShot:null,remaining=shot?Math.max(0,shot.remaining-(now-this.poseAt)/1000):0;
    c.webLaunchTimers={};
    for(const launch of fresh?this.pose.webShots:[]){const left=launch.remaining-(now-this.poseAt)/1000;
      if(left>0)c.webLaunchTimers[launch.hand]=left+delta;
    }
    c.webShotTimer=remaining>0?remaining+delta:0;c.webShotAnchor=remaining>0?new THREE.Vector3().copy(shot.target):null;
    c.webShotIsMiss=remaining>0 && shot.miss;
    if(remaining>0)c.currentHand=shot.hand;
    const anchor=fresh && this.pose.anchor ? new THREE.Vector3().copy(this.pose.anchor) : null;
    c.wallNormal=fresh && this.pose.wallNormal ? new THREE.Vector3().copy(this.pose.wallNormal).normalize() : null;
    c.wallDistance=fresh?this.pose.wallDistance:.7;
    c.mantle=fresh && this.pose.mantle ? {...this.pose.mantle,
      ...Object.fromEntries(['normal','edge','start','end'].map(k=>[k,new THREE.Vector3().copy(this.pose.mantle[k])])),
      elapsed:Math.min(this.pose.mantle.duration,this.pose.mantle.elapsed+(now-this.poseAt)/1000)} : null;
    c.landingSpeed=fresh?this.pose.landingSpeed:0;c.pendingTurn=fresh?this.pose.pendingTurn:null;
    c.combatAction=fresh && this.pose.combat ? {...this.pose.combat,time:this.pose.combat.time+(now-this.poseAt)/1000} : null;
    // A ground pound waits in flight until an authoritative landing pose
    // arrives. Network interpolation must not finish it before contact.
    if(c.combatAction?.key==='slam' && c.combatAction.duration)
      c.combatAction.time=Math.min(c.combatAction.time,c.combatAction.duration*.62);
    if (c.combatAction?.duration && c.combatAction.time>c.combatAction.duration) c.combatAction=null;
    c.isTricking=!!(fresh && this.pose.tricking);
    c.airTrick=fresh && this.pose.airTrick ? {...this.pose.airTrick,
      elapsed:this.pose.airTrick.elapsed+Math.max(0,(now-this.poseAt)/1000)-delta} : null;
    c.update(delta,state,v,anchor);
    this.marker.visible=c.isLoaded;
  }
  dispose() {
    this.marker.geometry.dispose();this.marker.material.dispose();this.character.disposeCopy();
  }
}
