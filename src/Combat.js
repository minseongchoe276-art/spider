import {UPPERCUT,uppercutSpeed} from './DashingUppercut.js';
import * as THREE from 'three';
import {GROUNDED} from './MotionCatalog.js';
import {COMBAT_GROUND_STATES} from './AttackRules.js';
import {MATCH} from './MatchRules.js';
import {BINDINGS} from './PlayerSettings.js';
const canStrike=p=>COMBAT_GROUND_STATES.includes(p.state);

export const ATTACKS={
  jab:{duration:0.72,from:0.14,to:0.22,damage:12,reach:1.8},
  cross:{duration:0.54,from:0.27,to:0.35,damage:17,reach:1.9},
  rightHook:{duration:0.58,from:0.22,to:0.30,damage:17,reach:1.7},
  hook:{duration:0.9,from:0.342,to:0.432,damage:32,reach:2.1},
  special:UPPERCUT,
  heavy:{duration:1.05,from:0.52,to:0.7,damage:32,reach:2.1},
};
const grounded=p=>GROUNDED.includes(p.state);
const forward=p=>new THREE.Vector3(Math.sin(p.facingAngle),0,Math.cos(p.facingAngle));
export class CombatSystem {
  constructor(scene,physics,character,{vfx=null,audio=null,onNotice=()=>{},onHit=()=>{},onImpact=()=>{},getTargets=null,getBindings=()=>BINDINGS}={}) {
    Object.assign(this,{scene,physics,character,vfx,audio,onNotice,onHit,onImpact,getTargets,getBindings});
    this.mode='web';this.action=null;
    this.character.combatStance=false;
    this.blocking=false;this.health=100;this.stamina=100;this.invulnerable=0;
    this.specialCooldown=0;this.enemies=[];this.serial=0;this.hurtCount=0;this.hits=0;this.elapsed=0;this.physics.webEnabled=true;this.physics.onReset=()=>{this.cancel();this.clearEnemies();this.health=this.stamina=100;this.specialCooldown=0;};
  }
  cancel(){this.pendingModeInput=null;this.stanceQueued=null;this.queued=null;this.action=null;this.blocking=false;this.character.combatAction=null;this.physics.combatMotion=null;}
  clearHeld(){this.blocking=false;this.stanceQueued=null;}
  toggle(input={}) {
    // Complete an authored strike before changing its stance or mixer target.
    if(this.action && ATTACKS[this.action.key]){this.pendingModeInput=this.pendingModeInput?null:input;return this.mode;}
    this.pendingModeInput=null;
    this.mode=this.mode==='combat'?'web':'combat';this.cancel();
    this.character.combatStance=false;
    input.webTap=input.webHold=input.webFireHeld=false;
    input.webTapRight=input.webHoldRight=input.webFireHeldRight=false;
    input.webZipHeld=false;input.wallRun=false;input.guard=false;
    this.physics.webEnabled=this.mode==='web';this.physics.clearPendingInput?.();
    if(this.mode==='combat')this.physics.clearWebAnchor?.();
    // The persistent mode label and action controls already confirm the switch.
    return this.mode;
  }
  face(camera) {
    // Use the same horizontal aim as movement, even at near-vertical pitch.
    // A nearby off-screen enemy must not silently pull a punch sideways.
    const p=this.physics,yaw=camera?.userData?.movementYaw;
    const dir=Number.isFinite(yaw)?new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw)):camera?.getWorldDirection(new THREE.Vector3());
    if(dir && Math.hypot(dir.x,dir.z)>0.01) {p.facingAngle=Math.atan2(dir.x,dir.z);this.character.targetFacingAngle=p.facingAngle;}
  }
  start(key,duration,camera) {
    this.face(camera);this.action={id:++this.serial,key,time:0,previous:0,duration,hits:new Set(),landed:false};
    this.character.combatAction={id:this.action.id,key,time:0,duration};
  }
  standBefore(method,camera,input=null) {
    const c=this.character;
    if(!this.physics.lowStance && (c.crouchBlend || 0)<.001)return false;
    this.physics.lowStance=null;c.lowStance=null;
    this.stanceQueued={method,camera,input:input?{...input}:null,expires:this.elapsed+1.2};
    return true;
  }
  attack(camera) {
    if(this.mode!=='combat' || !canStrike(this.physics) || this.blocking || this.stamina<4)return false;
    if(this.action){this.queue('attack',camera);return false;}
    if(this.standBefore('attack',camera))return false;
    this.stamina-=4;this.start('jab',ATTACKS.jab.duration,camera);return true;
  }
  straight(camera) {
    if(this.action){this.queue('straight',camera);return false;}
    if(this.mode!=='combat' || !canStrike(this.physics) || this.blocking || this.stamina<7)return false;
    if(this.standBefore('straight',camera))return false;
    const f=forward(this.physics);
    const close=(this.getTargets?.() || this.enemies).some(e=>e.health>0 && e.position.distanceTo(this.physics.position)<1.55 && e.position.clone().sub(this.physics.position).setY(0).normalize().dot(f)>.5);
    const key=this.character.actions?.rightHook && Math.random()<(close ? .7 : .3)?'rightHook':'cross';
    this.stamina-=7;this.start(key,ATTACKS[key].duration,camera);return true;
  }
  heavy(camera) {
    if(this.mode!=='combat' || this.action || this.blocking || this.stamina<18 || !canStrike(this.physics))return false;
    if(this.standBefore('heavy',camera))return false;
    this.stamina-=18;this.blocking=false;
    this.start('heavy',ATTACKS.heavy.duration,camera);
    return true;
  }
  special(camera) {
    if(this.mode!=='combat' || this.action || !canStrike(this.physics) || this.blocking || this.stamina<UPPERCUT.stamina || this.specialCooldown>0)return false;
    if(this.standBefore('special',camera))return false;
    this.stamina-=UPPERCUT.stamina;this.specialCooldown=UPPERCUT.cooldown;
    this.start('special',ATTACKS.special.duration,camera);this.action.direction=forward(this.physics);return true;
  }
  queue(method,camera) {if(this.action && this.action.time>=this.action.duration*.75)this.queued={method,camera,expires:this.elapsed+.18};}
  airStrike(camera) {
    if(this.mode!=='combat'||grounded(this.physics)||this.action||this.stamina<25||!this.enemies.some(e=>e.health>0))return false;
    this.stamina-=25;this.physics.clearWebAnchor?.();this.physics.velocity.y=Math.min(this.physics.velocity.y,-14);
    this.start('slam',1,camera);return true;
  }
  dodge(input,camera) {
    if(!canStrike(this.physics) || this.stamina<18 || this.action?.key.startsWith('dodge'))return false;
    if(this.action && this.action.time<this.action.duration*0.55)return false;
    if(this.standBefore('dodge',camera,input))return false;
    this.cancel();this.stamina-=18;this.face(camera);
    const f=forward(this.physics),r=new THREE.Vector3(-f.z,0,f.x);
    const direction=input.left?r.negate():input.right?r:input.forward?f:f.negate();
    const key=input.left?'dodgeLeft':input.right?'dodgeRight':input.forward?'dodgeForward':'dodgeBack';
    const duration={dodgeLeft:0.38,dodgeRight:0.38,dodgeBack:0.42,dodgeForward:0.52}[key];
    this.start(key,duration,null);this.action.direction=direction;
    this.action.entryVelocity=this.physics.velocity.clone().setY(0);return true;
  }
  guard(value) {this.blocking=value && this.mode==='combat' && !this.action && canStrike(this.physics) && this.stamina>=12;}
  before(delta,camera,input=null) {
    this.character.combatStance=this.mode==='combat' && !!input?.combatStance;
    delta=Math.max(0,Math.min(delta,0.1));this.elapsed+=delta;
    this.specialCooldown=Math.max(0,this.specialCooldown-delta);this.invulnerable=Math.max(0,this.invulnerable-delta);
    this.stamina=Math.min(100,this.stamina+delta*(this.blocking?3:this.action?0:18));
    if(this.blocking && (!canStrike(this.physics)||this.stamina<12))this.blocking=false;
    // Grounded strikes and evasions cannot resume halfway through on landing.
    if(this.action && (!grounded(this.physics)||(ATTACKS[this.action.key]&&!canStrike(this.physics))) && this.action.key!=='slam')this.cancel();
    if(this.stanceQueued){
      const queued=this.stanceQueued;
      if(queued.expires<this.elapsed || !canStrike(this.physics))this.stanceQueued=null;
      else if(!this.physics.lowStance && (this.character.crouchBlend || 0)<.001){
        this.stanceQueued=null;
        const started=queued.method==='dodge'?this.dodge(queued.input,queued.camera):this[queued.method](queued.camera);
        if(started && queued.method!=='dodge')this.onDeferredStrike?.();
      }
    }
    const a=this.action;
    if(a) {
      a.previous=a.time;a.time+=delta;
      if(a.key==='slam' && !a.landed)a.time=Math.min(a.time,a.duration*0.62);
      if(a.time>=a.duration) {
        this.action=null;
      }
    }
    if(this.pendingModeInput && !this.action){const modeInput=this.pendingModeInput;this.toggle(modeInput);}
    if(this.queued && !this.action){const next=this.queued;this.queued=null;if(next.expires>=this.elapsed)this[next.method](next.camera);}
    if(input)this.guard(!!input.guard);
    this.character.combatStance=this.mode==='combat' && (!!input?.combatStance || this.blocking);
    const current=this.action;
    const stopping=this.character.activeAction && ['stop','runStop'].some(key=>this.character.activeAction===this.character.actions?.[key] && this.character.activeAction?.time<this.character.activeAction.getClip().duration-.05) || ['RUNNING','SPRINTING'].includes(this.character.lastState);
    // The strike keeps the aim from the button press. Mouse look after that
    // orbits the camera and must not yaw the body through the punch.
    // special already captured its dash direction in start().
    if(current && ATTACKS[current.key]){
      const speed=Math.hypot(this.physics.velocity.x,this.physics.velocity.z);
      const stepping=!!(input && (input.forward || input.backward || input.left || input.right));
      // Promote a planted strike when movement starts, then keep its carrier
      // until recovery so braking cannot replace both legs mid-punch.
      current.travel=current.key==='special'?false:!!current.travel || stepping || speed>0.9;
    }
    const dodgeSpeed=current?.key==='special'?uppercutSpeed(current.previous,current.time):current?.direction?
      ({dodgeLeft:0.8,dodgeRight:0.8,dodgeBack:1.35,dodgeForward:2.3}[current.key] || 0)*
      Math.sin(Math.PI*THREE.MathUtils.clamp(current.time/current.duration,0,1)):0;
    this.physics.combatMotion=current?{key:current.key,direction:current.direction || null,speed:dodgeSpeed,entryVelocity:current.entryVelocity || null,time:current.time,duration:current.duration,plant:!!ATTACKS[current.key] && !current.travel,travel:!!current.travel}:this.blocking?{key:'guard'}:null;
    this.character.combatAction=current?{id:current.id,key:current.key,time:current.time,duration:current.duration,travel:!!current.travel}:
      this.blocking?{key:'guard'}:!stopping && this.character.combatStance && this.physics.state==='IDLE' && Math.hypot(this.physics.velocity.x,this.physics.velocity.z)<0.15?{key:'combatIdle'}:null;
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
    for(const e of this.getTargets?.() || this.enemies) {
      if(e.health<=0 || action.hits.has(e))continue;
      const target=e.position.clone().add(new THREE.Vector3(0,1,0)),d=target.clone().sub(origin);
      if(Math.abs(d.y)>1.5 || Math.hypot(d.x,d.z)>hit.reach || (!hit.radial && d.clone().setY(0).normalize().dot(f)<0.45) || this.obstructed(origin,target))continue;
      action.hits.add(e);
      if(e.nonCombatant){
        e.reactToAttack?.(action.key,hit.damage,origin);
        if(action.key==='special'){this.vfx?.spawnUppercutImpact?.(target.clone().setY(e.position.y+1.6),f);this.onImpact(.16);}else this.vfx?.spawnWebImpact?.(target);
        this.audio?.playCombatHit?.(hit.damage>=24,target);continue;
      }
      if(e.type==='shield' && !['hook','heavy','special','slamLand'].includes(action.key)){e.flash=.1;e.stagger=.08;this.audio?.playCombatBlock?.(target);this.onNotice('방패 방어 · G 어퍼컷으로 돌파하세요.');continue;}
      e.health=Math.max(0,e.health-hit.damage);e.flash=0.15;e.stagger=0.45;this.hits++;
      this.onHit(hit.damage);
      if(action.key==='special'){
        e.uppercutTime=0;e.uppercutDuration=.85;e.stagger=.85;
        this.vfx?.spawnUppercutImpact?.(target.clone().setY(e.position.y+1.6),f);this.onImpact(.22);
      }else this.vfx?.spawnWebImpact(target);
      this.audio?.playCombatHit?.(hit.damage>=24,target);
      if(e.health===0){e.defeatTime=0;e.windup=0;e.ring&&(e.ring.visible=false);this.onNotice('대상 제압');}
    }
  }
  reactToHit(amount,{hitRegion=null,variant=null}={}) {
    if(this.mode!=='combat' || !grounded(this.physics))return false;
    this.cancel();
    const key=variant==='uppercut' && this.character.actions?.hitUppercut?'hitUppercut':amount>=24 && this.character.actions?.hitHeavy?'hitHeavy':hitRegion==='body' || (!hitRegion && amount<16)?'hitBody':'hitHead';
    const duration={hitHead:.65,hitBody:.85,hitHeavy:1.05,hitUppercut:.95}[key];
    this.start(key,duration,null);return true;
  }
  isEvading() {
    const a=this.action;
    return !!(a && ['dodgeLeft','dodgeRight','dodgeBack','dodgeForward'].includes(a.key) && canStrike(this.physics) && a.time>=a.duration*.12 && a.time<=a.duration*.82);
  }
  receiveDamage(amount,enemy) {
    if(this.invulnerable>0 || this.isEvading())return 0;
    const d=enemy.position.clone().sub(this.physics.position).setY(0).normalize();
    const guarded=this.blocking && canStrike(this.physics) && d.dot(forward(this.physics))>=MATCH.guard.cone && this.stamina>=12;
    if(guarded) {this.stamina-=12;amount=Math.ceil(amount*MATCH.guard.damageMultiplier);this.audio?.playCombatBlock?.();}
    this.health=Math.max(0,this.health-amount);
    if(!guarded){this.invulnerable=0.65;this.cancel();
      this.reactToHit(amount,enemy);}
    if(this.health===0) {this.physics.resetPosition?.();this.health=100;this.stamina=100;this.cancel();this.clearEnemies();this.onNotice('시작 위치에서 회복');}
    return amount;
  }
  clearEnemies(){for(const e of this.enemies){this.scene.remove(e.mesh);e.mesh.traverse(n=>{n.geometry?.dispose();if(n.material)n.material.dispose();});}this.enemies=[];}
}
