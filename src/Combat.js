import * as THREE from 'three';
import {GROUNDED} from './MotionCatalog.js';

export const ATTACKS={
  jab:{duration:0.42,from:0.11,to:0.21,damage:12,reach:1.8},
  cross:{duration:0.65,from:0.32,to:0.46,damage:17,reach:1.9},
  hook:{duration:1.0,from:0.35,to:0.47,damage:24,reach:2},
  special:{duration:0.85,from:0.23,to:0.36,damage:48,reach:2.0},
  heavy:{duration:0.72,from:0.35,to:0.46,damage:32,reach:2.1},
};
const grounded=p=>GROUNDED.includes(p.state);
const forward=p=>new THREE.Vector3(Math.sin(p.facingAngle),0,Math.cos(p.facingAngle));
export class CombatSystem {
  constructor(scene,physics,character,{vfx=null,audio=null,onNotice=()=>{}}={}) {
    Object.assign(this,{scene,physics,character,vfx,audio,onNotice});
    this.mode='combat';this.action=null;this.combo=0;this.comboGrace=0;this.queued=false;
    this.blocking=false;this.health=100;this.stamina=100;this.invulnerable=0;
    this.specialCooldown=0;this.enemies=[];this.serial=0;this.hurtCount=0;this.hits=0;this.elapsed=0;this.physics.webEnabled=false;this.physics.onReset=()=>{this.cancel();this.clearEnemies();this.health=this.stamina=100;this.specialCooldown=0;};
  }
  cancel(){this.action=null;this.queued=false;this.combo=0;this.comboGrace=0;this.blocking=false;this.character.combatAction=null;this.physics.combatMotion=null;}
  clearHeld(){this.blocking=false;this.queued=false;}
  toggle(input={}) {
    this.mode=this.mode==='combat'?'web':'combat';this.cancel();
    input.webTap=input.webHold=input.webFireHeld=false;
    this.physics.webEnabled=this.mode==='web';this.physics.clearPendingInput?.();
    if(this.mode==='combat')this.physics.clearWebAnchor?.();
    this.onNotice(this.mode==='web'?'거미줄 ON · 좌클릭 발사 / 우클릭 당기기':'전투 모드 · 좌클릭 콤보 / 우클릭 방어 / Ctrl 회피');
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
    if(this.action) {
      if(ATTACKS[this.action.key] && this.action.time>=this.action.duration*0.3)this.queued=true;
      return false;
    }
    if(this.comboGrace<=0)this.combo=0;
    const key=['jab','cross','hook'][this.combo];this.stamina-=4;this.start(key,ATTACKS[key].duration,camera);return true;
  }
  heavy(camera) {
    if(this.mode!=='combat' || this.action || this.stamina<18 || !grounded(this.physics))return false;
    this.stamina-=18;this.blocking=false;this.combo=0;
    this.start('heavy',ATTACKS.heavy.duration,camera);
    return true;
  }
  special(camera) {
    if(this.mode!=='combat' || this.action || !grounded(this.physics) || this.blocking || this.stamina<35 || this.specialCooldown>0)return false;
    this.stamina-=35;this.specialCooldown=4;this.combo=0;this.queued=false;
    this.start('special',ATTACKS.special.duration,camera);return true;
  }
  dodge(input,camera) {
    if(this.mode!=='combat' || !grounded(this.physics) || this.stamina<18 || this.action?.key.startsWith('dodge'))return false;
    if(this.action && this.action.time<this.action.duration*0.55)return false;
    this.cancel();this.stamina-=18;this.face(camera);
    const f=forward(this.physics),r=new THREE.Vector3(f.z,0,-f.x);
    const direction=input.left?r.negate():input.right?r:input.forward?f:f.negate();
    const key=input.left?'dodgeLeft':input.right?'dodgeRight':input.forward?'dodgeForward':'dodgeBack';
    const duration={dodgeLeft:0.38,dodgeRight:0.38,dodgeBack:0.42,dodgeForward:0.52}[key];
    this.start(key,duration,null);this.action.direction=direction;this.invulnerable=0.28;return true;
  }
  guard(value) {this.blocking=value && this.mode==='combat' && !this.action && grounded(this.physics) && this.stamina>0;}
  before(delta,camera) {
    delta=Math.max(0,Math.min(delta,0.1));this.elapsed+=delta;
    this.specialCooldown=Math.max(0,this.specialCooldown-delta);this.invulnerable=Math.max(0,this.invulnerable-delta);this.comboGrace=Math.max(0,this.comboGrace-delta);
    this.stamina=Math.min(100,this.stamina+delta*(this.blocking?3:this.action?0:18));
    if(this.blocking && (!grounded(this.physics)||this.stamina<=0))this.blocking=false;
    const a=this.action;
    if(a) {
      a.previous=a.time;a.time+=delta;
      if(a.key==='slam' && !a.landed)a.time=Math.min(a.time,a.duration*0.62);
      if(a.time>=a.duration) {
        const next=this.queued && ['jab','cross'].includes(a.key);
        this.combo=['jab','cross','hook'].includes(a.key)?(this.combo+1)%3:0;this.comboGrace=0.5;
        this.action=null;this.queued=false;
        if(next)this.attack(camera);
      }
    }
    const current=this.action;
    const stopping=this.character.activeAction && ['stop','runStop'].some(key=>this.character.activeAction===this.character.actions?.[key] && this.character.activeAction?.time<this.character.activeAction.getClip().duration-.05) || ['RUNNING','SPRINTING'].includes(this.character.lastState);
    // The authored punches plant both feet. Translating the capsule during
    // anticipation made a stationary combo skate more than a metre.
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
      action.hits.add(e);e.health=Math.max(0,e.health-hit.damage);e.flash=0.15;e.stagger=0.45;this.hits++;
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
    if(this.mode==='combat' && grounded(this.physics))this.start(++this.hurtCount%2?'hit':'hitHead',0.4,null);
    if(this.health===0) {this.physics.resetPosition?.();this.health=100;this.stamina=100;this.cancel();this.clearEnemies();this.onNotice('시작 위치에서 회복');}
    return amount;
  }
  clearEnemies(){for(const e of this.enemies){this.scene.remove(e.mesh);e.mesh.traverse(n=>{n.geometry?.dispose();if(n.material)n.material.dispose();});}this.enemies=[];}
}
