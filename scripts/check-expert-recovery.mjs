import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {CombatSystem} from '../src/Combat.js';
import {CombatPractice} from '../src/CombatPractice.js';
import {SwingPhysics} from '../src/SwingPhysics.js';
import {StreamedCollision} from '../src/StreamedCollision.js';
import {GameApp} from '../src/main.js';
import {PlayerExperience} from '../src/PlayerExperience.js';
import {BINDINGS} from '../src/PlayerSettings.js';

const results=[],audio=new Proxy({},{get:()=>()=>{}});
function practiceGame(){
  const scene=new T.Scene(),character={group:new T.Group(),update(){},fireWeb(){}};
  const physics={position:new T.Vector3(0,.1,0),state:'IDLE',facingAngle:0,velocity:new T.Vector3(),city:{raycast:()=>null}};
  const combat=new CombatSystem(scene,physics,character,{audio});combat.mode='combat';
  physics.resetPosition=()=>physics.onReset();
  const game={scene,physics,combat,audio,camera:new T.PerspectiveCamera(),city:physics.city,showNotice(){}};
  const practice=Object.create(CombatPractice.prototype);Object.assign(practice,{game,active:true,projectiles:[]});
  return {game,practice};
}
for(const kind of ['melee','shield']){
  const {game:g,practice:p}=practiceGame();g.combat.health=1;g.combat.blocking=true;
  for(let i=0;i<3;i++){const enemy=p.spawn(kind,new T.Vector3(0,.1,1));enemy.windup=.001;}
  // A guarded lethal hit grants no hurt immunity: a stale iterator used to
  // let the remaining enemies damage the newly reset 100 HP life.
  p.update(.02);
  assert.equal(g.combat.health,100);assert.equal(g.combat.enemies.length,0);assert.equal(p.active,false);
  results.push({case:'lethal-guard-stops-enemy-iterator',kind,health:g.combat.health,pass:true});
}
for(const front of [true,false]){
  const {game:g,practice:p}=practiceGame();g.combat.blocking=true;
  // Move the shooter to the opposite side after a projectile was fired.
  const enemy=p.spawn('dummy',new T.Vector3(0,.1,front?-10:10));
  const mesh=new T.Mesh(new T.SphereGeometry(.12),new T.MeshBasicMaterial());
  mesh.position.set(0,1.1,front?1:-1);g.scene.add(mesh);
  p.projectiles.push({mesh,enemy,velocity:new T.Vector3(0,0,front?-14:14),life:3});
  p.update(.1);
  assert.equal(g.combat.health,front?96:90,'Guard must use the shot direction, not the moving shooter');
  assert.equal(g.combat.stamina,front?88:100);assert.equal(p.projectiles.length,0);
  results.push({case:'incoming-projectile-guard',front,health:g.combat.health,pass:true});p.stop();
}
{
  const {game:g}=practiceGame(),bindings={...BINDINGS,mode:'KeyR',guard:'KeyY',jump:'KeyZ'},notices=[];
  g.combat.getBindings=()=>bindings;g.combat.onNotice=message=>notices.push(message);g.combat.mode='web';
  g.combat.toggle();assert.equal(g.combat.mode,'combat');assert.equal(notices.length,0);
  g.combat.toggle();assert.equal(g.combat.mode,'web');assert.equal(notices.length,0);
  results.push({case:'mode-toggle-uses-persistent-hud-without-extra-notices',pass:true});
  const previous=Object.getOwnPropertyDescriptor(globalThis,'document'),classes=new Set();
  const fields=Object.fromEntries(['emblem','mode','health','stamina','health-value','stamina-value'].map(key=>['.vitals-'+key,{textContent:'',value:0}]));
  const hud={querySelector:key=>fields[key],textContent:'',classList:{toggle(key,on){on?classes.add(key):classes.delete(key);}}},hands={textContent:''};
  Object.defineProperty(globalThis,'document',{configurable:true,value:{getElementById:id=>id==='combat-status'?hud:id==='hand-status'?hands:null}});
  try{
    Object.assign(g,{preferences:{values:{settings:{bindings}}},practice:{active:false},isPlaying:true,isPaused:false,updateAbilityBar(){}});
    g.combat.health=37.2;g.combat.stamina=12.1;g.combat.mode='combat';
    GameApp.prototype.updateVitals.call(g);assert(!classes.has('hidden'));assert.equal(fields['.vitals-health-value'].textContent,'37 / 100');assert.equal(fields['.vitals-stamina-value'].textContent,'12 / 100');
    g.combat.mode='web';GameApp.prototype.updateVitals.call(g);assert(!classes.has('hidden'));assert(classes.has('is-wire'));
    g.practice.active=true;GameApp.prototype.updateVitals.call(g);assert(!classes.has('hidden'));
    g.multiplayer={room:{}};GameApp.prototype.updateVitals.call(g);assert(!classes.has('hidden'));
    g.isPaused=true;GameApp.prototype.updateVitals.call(g);assert(classes.has('hidden'));g.isPaused=false;
    g.physics.state='FALLING';g.physics.webs=[];g.combat.mode='combat';
    PlayerExperience.prototype.previewAnchor.call({game:g});assert.match(hands.textContent,/R로 와이어 모드 전환/);
    results.push({case:'persistent-vitals-and-remapped-airborne-hint',pass:true});
  }finally{if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;}
}
for(const blocked of [false,true]){
  const world=new StreamedCollision();await world.initialized;
  const meshes=[];
  try{
    for(const [w,h,d,x,y,z]of [[20,1,20,0,-.5,0],...(blocked?[[8,5,.08,0,2.5,1.5]]:[])]){
      const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshBasicMaterial());
      mesh.position.set(x,y,z);mesh.updateMatrixWorld(true);meshes.push(mesh);world.enqueue(mesh);
    }
    for(let i=0;i<25;i++)world.update(new T.Vector3());
    const city={colliders:[],buildingMeshes:[],collisionWorld:world,resolveMovement:world.resolve.bind(world),raycast:world.raycast.bind(world),
      supportHeight(pos){const h=world.groundAt(pos,.6);return h!==null&&Math.abs(pos.y-h-.1)<.3?h:null;},checkCollision:()=>({collided:false})};
    for(const fps of [24,30,60,144]){
      const character={group:new T.Group(),update(){},fireWeb(){}},p=new SwingPhysics(new T.Scene(),city,character,audio);
      p.webEnabled=false;p.position.set(0,3,0);p.velocity.set(0,-10,6);p.state='FALLING';
      for(let i=0;i<fps*2;i++){
        p.update(1/fps,{},new T.PerspectiveCamera());
        if(['ROLLING','LANDING'].includes(p.state))break;
      }
      assert.equal(p.state,blocked?'LANDING':'ROLLING','Actual triangle wall must select a compact recovery');
      assert(Math.abs(p.velocity.x)<.01);assert(p.velocity.z>=-.01,'Path validation reversed the actual velocity');
      results.push({case:'streamed-recovery-path',fps,blocked,state:p.state,pass:true});
    }
  }finally{world.dispose();for(const mesh of meshes){mesh.geometry.dispose();mesh.material.dispose();}}
}
const folder=process.env.EXPERT_AUDIT_DIR||'docs/qa/expert-2026-10-22';fs.mkdirSync(folder,{recursive:true});
fs.writeFileSync(`${folder}/recovery-results.json`,JSON.stringify({passed:results.length,results},null,2)+'\n');
console.log(`PASS ${results.length} expert recovery cases: lethal guard, incoming shot direction and actual streamed walls at 24/30/60/144fps`);
