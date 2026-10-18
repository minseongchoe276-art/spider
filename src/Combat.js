import * as THREE from 'three';
import {GROUNDED} from './MotionCatalog.js';

export const ATTACKS={
  jab:{duration:0.56,from:0.14,to:0.22,damage:12,reach:1.8},
  cross:{duration:0.68,from:0.37,to:0.47,damage:17,reach:1.9},
  hook:{duration:0.9,from:0.342,to:0.432,damage:32,reach:2.1},
  special:{duration:1.2,from:0.54,to:0.66,damage:48,reach:2.0},
  heavy:{duration:0.9,from:0.342,to:0.432,damage:32,reach:2.1},
};
const grounded=p=>GROUNDED.includes(p.state);
const forward=p=>new THREE.Vector3(Math.sin(p.facingAngle),0,Math.cos(p.facingAngle));
export class CombatSystem {
  constructor(scene,physics,character,{vfx=null,audio=null,onNotice=()=>{},onHit=()=>{}}={}) {
    Object.assign(this,{scene,physics,character,vfx,audio,onNotice,onHit});
    this.mode='combat';this.action=null;
    this.blocking=false;this.health=100;this.stamina=100;this.invulnerable=0;
    this.specialCooldown=0;this.enemies=[];this.serial=0;this.hurtCount=0;this.hits=0;this.elapsed=0;this.physics.webEnabled=false;this.physics.onReset=()=>{this.cancel();this.clearEnemies();this.health=this.stamina=100;this.specialCooldown=0;};
  }
  cancel(){this.queued=null;this.action=null;this.blocking=false;this.character.combatAction=null;this.physics.combatMotion=null;}
  clearHeld(){this.blocking=false;}
  toggle(input={}) {
    this.mode=this.mode==='combat'?'web':'combat';this.cancel();
    input.webTap=input.webHold=input.webFireHeld=false;
    input.webTapRight=input.webHoldRight=input.webFireHeldRight=false;
    input.webZipHeld=false;
    this.physics.webEnabled=this.mode==='web';this.physics.clearPendingInput?.();
    if(this.mode==='combat')this.physics.clearWebAnchor?.();
    this.onNotice(this.mode==='web'?'거미줄 ON · 좌클릭 꾹: 도약 후 스윙 / 우클릭: 반대 손 스윙 / 떼기: 관성 비행 / 공중 집: 한 번씩 짧게 이동':'전투 모드 · 땅에서는 왼손 잽·오른손 훅 / 공중 좌·우클릭은 거미줄 / 방어·회피 키는 조작 가이드에서 확인하세요');
    return this.mode;
  }
  face(camera) {
    const p=this.physics,closest=this.enemies.filter(e=>e.health>0&&e.position.distanceTo(p.position)<5)
      .sort((a,b)=>a.position.distanceToSquared(p.position)-b.position.distanceToSquared(p.position))[0];
    const dir=closest?closest.position.clone().sub(p.position):camera?.getWorldDirection(new THREE.Vector3());
    if(dir && Math.hypot(dir.x,dir.z)>0.01) {p.facingAngle=Math.atan2(dir.x,dir.z);this.character.targetFacingAngle=p.facingAngle;}
  }
  start(key,duration,camera) {
    this.face(camera);this.action={id:++this.serial,key,time:0,previous:0,duration,hits:new Set(),landed:false};
    this.character.combatAction={id:this.action.id,key,time:0,duration};
  }
  attack(camera) {
    if(this.mode!=='combat' || !grounded(this.physics) || this.blocking || this.stamina<4)return false;
    if(this.action){this.queue('attack',camera);return false;}
    this.stamina-=4;this.start('jab',ATTACKS.jab.duration,camera);return true;
  }
  straight(camera) {
    if(this.action){this.queue('straight',camera);return false;}
    if(this.mode!=='combat' || !grounded(this.physics) || this.blocking || this.stamina<7)return false;
    this.stamina-=7;this.start('cross',ATTACKS.cross.duration,camera);return true;
  }
  heavy(camera) {
    if(this.mode!=='combat' || this.action || this.stamina<18 || !grounded(this.physics))return false;
    this.stamina-=18;this.blocking=false;
    this.start('hook',ATTACKS.hook.duration,camera);
    return true;
  }
  special(camera) {
    if(this.mode!=='combat' || this.action || !grounded(this.physics) || this.blocking || this.stamina<35 || this.specialCooldown>0)return false;
    this.stamina-=35;this.specialCooldown=4;
    this.start('special',ATTACKS.special.duration,camera);return true;
  }
  queue(method,camera) {if(this.action && this.action.time>=this.action.duration*.75)this.queued={method,camera,expires:this.elapsed+.18};}
  airStrike(camera) {
    if(this.mode!=='combat'||grounded(this.physics)||this.action||this.stamina<25||!this.enemies.some(e=>e.health>0))return false;
    this.stamina-=25;this.physics.clearWebAnchor?.();this.physics.velocity.y=Math.min(this.physics.velocity.y,-14);
    this.start('slam',1,camera);return true;
  }
  dodge(input,camera) {
    if(this.mode!=='combat' || !grounded(this.physics) || this.stamina<18 || this.action?.key.startsWith('dodge'))return false;
    if(this.action && this.action.time<this.action.duration*0.55)return false;
    this.cancel();this.stamina-=18;this.face(camera);
    const f=forward(this.physics),r=new THREE.Vector3(-f.z,0,f.x);
    const direction=input.left?r.negate():input.right?r:input.forward?f:f.negate();
    const key=input.left?'dodgeLeft':input.right?'dodgeRight':input.forward?'dodgeForward':'dodgeBack';
    const duration={dodgeLeft:0.38,dodgeRight:0.38,dodgeBack:0.42,dodgeForward:0.52}[key];
    this.start(key,duration,null);this.action.direction=direction;this.invulnerable=0.28;return true;
  }
  guard(value) {this.blocking=value && this.mode==='combat' && !this.action && grounded(this.physics) && this.stamina>0;}
  before(delta,camera,input=null) {
    this.character.combatStance=this.mode==='combat';
    delta=Math.max(0,Math.min(delta,0.1));this.elapsed+=delta;
    this.specialCooldown=Math.max(0,this.specialCooldown-delta);this.invulnerable=Math.max(0,this.invulnerable-delta);
    this.stamina=Math.min(100,this.stamina+delta*(this.blocking?3:this.action?0:18));
    if(this.blocking && (!grounded(this.physics)||this.stamina<=0))this.blocking=false;
    // Grounded strikes and evasions cannot resume halfway through on landing.
    if(this.action && !grounded(this.physics) && this.action.key!=='slam')this.cancel();
    const a=this.action;
    if(a) {
      a.previous=a.time;a.time+=delta;
      if(a.key==='slam' && !a.landed)a.time=Math.min(a.time,a.duration*0.62);
      if(a.time>=a.duration) {
        this.action=null;
      }
    }
    if(this.queued && !this.action){const next=this.queued;this.queued=null;if(next.expires>=this.elapsed)this[next.method](next.camera);}
    if(input)this.guard(!!input.guard);
    const current=this.action;
    const stopping=this.character.activeAction && ['stop','runStop'].some(key=>this.character.activeAction===this.character.actions?.[key] && this.character.activeAction?.time<this.character.activeAction.getClip().duration-.05) || ['RUNNING','SPRINTING'].includes(this.character.lastState);
    // Moving strikes retain the locomotion legs and layer the upper body.
    const dodgeSpeed=current?.direction?
      ({dodgeLeft:0.8,dodgeRight:0.8,dodgeBack:1.35,dodgeForward:2.3}[current.key] || 0)*
      Math.sin(Math.PI*THREE.MathUtils.clamp(current.time/current.duration,0,1)):0;
    this.physics.combatMotion=current?{key:current.key,direction:current.direction || null,speed:dodgeSpeed}:this.blocking?{key:'guard'}:null;
    this.character.combatAction=current?{id:current.id,key:current.key,time:current.time,duration:current.duration}:
      this.blocking?{key:'guard'}:!stopping && this.mode==='combat' && this.physics.state==='IDLE' && Math.hypot(this.physics.velocity.x,this.physics.velocity.z)<0.15?{key:'combatIdle'}:null;
    if(current || this.blocking)this.character.targetFacingAngle=this.physics.facingAngle;
  }
  after(delta) {
    const a=this.action;
    if(a && ATTACKS[a.key] && grounded(this.physics)) {
      const hit=ATTACKS[a.key];
      if(a.previous<=hit.to && a.time>=hit.from)this.strike(a,hit);
    }
    if(a?.key==='slam' && !a.landed && grounded(this.physics)) {
      a.landed=true;a.key='slamLand';a.time=0;a.previous=0;a.duration=0.7;
      this.strike(a,{damage:40,reach:3.5,radial:true});
      if (this.vfx?.spawnLandingShockwave) this.vfx.spawnLandingShockwave(this.physics.position, 34, new THREE.Vector3(0, 1, 0));
      else this.vfx?.spawnLandingDust(this.physics.position);
    }
  }
  obstructed(from,to) {
    const dir=to.clone().sub(from),distance=dir.length();
    return distance>0.05 && !!this.physics.city.raycast?.(from,dir.normalize(),Math.max(0,distance-0.3));
  }
  strike(action,hit) {
    const origin=this.physics.position.clone().add(new THREE.Vector3(0,1,0)),f=forward(this.physics);
    for(const e of this.enemies) {
      if(e.health<=0 || action.hits.has(e))continue;
      const target=e.position.clone().add(new THREE.Vector3(0,1,0)),d=target.clone().sub(origin);
      if(Math.abs(d.y)>1.5 || Math.hypot(d.x,d.z)>hit.reach || (!hit.radial && d.clone().setY(0).normalize().dot(f)<0.45) || this.obstructed(origin,target))continue;
      action.hits.add(e);
      if(e.type==='shield' && !['hook','heavy','special','slamLand'].includes(action.key)){e.flash=.1;e.stagger=.08;this.audio?.playCombatHit?.(false);this.onNotice('방패 방어 · 훅이나 강공격으로 돌파하세요.');continue;}
      e.health=Math.max(0,e.health-hit.damage);e.flash=0.15;e.stagger=0.45;this.hits++;
      this.onHit(hit.damage);
      this.vfx?.spawnWebImpact(target);this.audio?.playCombatHit?.(hit.damage>=24);
      if(e.health===0){e.mesh.visible=false;this.onNotice('대상 제압');}
    }
  }
  receiveDamage(amount,enemy) {
    if(this.invulnerable>0)return 0;
    const d=enemy.position.clone().sub(this.physics.position).setY(0).normalize();
    const guarded=this.blocking && d.dot(forward(this.physics))>0.2 && this.stamina>=12;
    if(guarded) {this.stamina-=12;this.audio?.playCombatHit?.(false);return 0;}
    this.health=Math.max(0,this.health-amount);this.invulnerable=0.65;this.cancel();
    if(this.mode==='combat' && grounded(this.physics))this.start('hitHead',0.4,null);
    if(this.health===0) {this.physics.resetPosition?.();this.health=100;this.stamina=100;this.cancel();this.clearEnemies();this.onNotice('시작 위치에서 회복');}
    return amount;
  }
  clearEnemies(){for(const e of this.enemies){this.scene.remove(e.mesh);e.mesh.traverse(n=>{n.geometry?.dispose();if(n.material)n.material.dispose();});}this.enemies=[];}
}
