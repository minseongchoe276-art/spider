import * as T from 'three';
import {CombatSystem} from '../../../src/Combat.js';
import {CombatPractice} from '../../../src/CombatPractice.js';
import {SwingPhysics} from '../../../src/SwingPhysics.js';
import {StreamedCollision} from '../../../src/StreamedCollision.js';
const audio=new Proxy({},{get:()=>()=>{}});
const scene=new T.Scene(),character={group:new T.Group(),update(){},fireWeb(){}};
const physics={position:new T.Vector3(0,.1,0),state:'IDLE',facingAngle:0,velocity:new T.Vector3(),city:{raycast:()=>null}};
const combat=new CombatSystem(scene,physics,character,{audio});combat.mode='combat';combat.health=1;combat.blocking=true;
physics.resetPosition=()=>{physics.onReset();};
const game={scene,physics,combat,audio,camera:new T.PerspectiveCamera(),city:physics.city,showNotice(){}};
const practice=Object.create(CombatPractice.prototype);Object.assign(practice,{game,active:true,projectiles:[]});
for(let i=0;i<2;i++){const e=practice.spawn('melee',new T.Vector3(0,.1,1));e.windup=.001;}
practice.update(.02);console.log('post-defeat',combat.health,'enemies',combat.enemies.length,'active',practice.active);
const world=new StreamedCollision();await world.initialized;
for(const [w,h,d,x,y,z] of [[20,1,20,0,-.5,0],[8,5,.1,0,2.5,1.5]]){const m=new T.Mesh(new T.BoxGeometry(w,h,d));m.position.set(x,y,z);m.updateMatrixWorld(true);world.enqueue(m);}
for(let i=0;i<25;i++)world.update(new T.Vector3());
const city={colliders:[],buildingMeshes:[],collisionWorld:world,resolveMovement:world.resolve.bind(world),raycast:world.raycast.bind(world),supportHeight(pos){const h=world.groundAt(pos,.6);return h!==null&&Math.abs(pos.y-h-.1)<.3?h:null;},checkCollision:()=>({collided:false})};
const p=new SwingPhysics(scene,city,character,audio);p.webEnabled=false;p.position.set(0,3,0);p.velocity.set(0,-10,0);p.state='FALLING';
for(let i=0;i<120;i++){p.update(1/60,{},new T.PerspectiveCamera());if(['ROLLING','LANDING'].includes(p.state)){console.log('streamed-wall-recovery',p.state,p.position.toArray());break;}}
world.dispose();
