import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GameApp} from '../src/main.js';
import {Multiplayer} from '../src/Multiplayer.js';
import {Progression} from '../src/Progression.js';
import {PlayerExperience} from '../src/PlayerExperience.js';
import {PerformanceBudget} from '../src/PerformanceBudget.js';
import {cleanSettings} from '../src/PlayerSettings.js';
import {arenaFrom} from '../src/PursuitRules.js';
import {SwingPhysics} from '../src/SwingPhysics.js';
import {StreamedCollision} from '../src/StreamedCollision.js';

let failed=0,passed=0;
function check(name,run){try{run();passed++;console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+': '+error.message);}}
const silent=new Proxy({},{get:()=>()=>{}});
function node(){const classes=new Set();return {textContent:'',style:{},classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k),toggle(k,value){if(value===undefined)value=!classes.has(k);value?classes.add(k):classes.delete(k);}},setAttribute(){},querySelector:()=>null};}
function dom(run){const saved={document:globalThis.document,window:globalThis.window};
  const nodes=new Map();globalThis.document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},querySelector:()=>null,body:node()};globalThis.window={devicePixelRatio:2};
  try{run(nodes);}finally{Object.assign(globalThis,saved);}}
function multiplayer(){const mp=Object.create(Multiplayer.prototype);
  const character={group:{visible:true}};
  const game={character,tpsCamera:{mode:'swing',setMode(mode){this.mode=mode;}},physics:{clearWebAnchor(){},position:new THREE.Vector3(),renderPosition:new THREE.Vector3()},clearInput(){},setPaused(){},showNotice(){},combat:{cancel(){}}};
  Object.assign(mp,{game,id:'me',room:{phase:'playing',mode:'tag'},solo:false,lastPhase:'playing',players:[],avatars:new Map(),spectating:false,render(){},renderHud(){},syncAvatars(){}});return mp;}

check('Local pursuit rejects off-map origins and excludes off-map objectives',()=>{
  assert.equal(arenaFrom({x:200,y:50,z:0},'procedural',[{x:120,y:50,z:0},{x:280,y:50,z:0}]),null);
  const arena=arenaFrom({x:0,y:50,z:0},'procedural',[{x:170,y:50,z:0},{x:70,y:50,z:0},{x:-70,y:50,z:0}]);
  assert.equal(arena.points.length,2);assert(arena.points.every(p=>Math.abs(p.x)<160));
});
check('Late room and identity messages cannot replace an explicit solo session',()=>{
  const mp=multiplayer();mp.solo=true;mp.room=null;mp.id=null;
  mp.message({type:'joined',id:'old-identity'});assert.equal(mp.id,null);
  mp.message({type:'room',room:{phase:'waiting',code:'STALE'},players:[]});assert.equal(mp.room,null);assert(mp.solo);
});
check('First-person elimination hides local arms and follows a third-person spectator',()=>{
  const mp=multiplayer();mp.message({type:'hit',target:'me',health:0,eliminated:true});
  assert(mp.spectating);assert(!mp.game.character.group.visible);assert.equal(mp.game.tpsCamera.mode,'swing');
  mp.applyServerPosition=()=>{};mp.game.resetCamera=()=>{};
  mp.message({type:'room',room:{phase:'playing'},players:[{id:'me',eliminated:false}],arena:null});
  assert(!mp.spectating);assert(mp.game.character.group.visible);assert.equal(mp.game.tpsCamera.mode,'swing');
});
check('Match finish retires goal and rescue markers and restores player visibility',()=>{
  const mp=multiplayer();mp.goalMarker={visible:true};mp.rescueStarted=50;mp.rescueTarget='ally';
  mp.game.character.group.visible=false;mp.spectating=true;mp.finish();
  assert(!mp.goalMarker.visible);assert.equal(mp.rescueStarted,null);assert.equal(mp.rescueTarget,null);assert(mp.game.character.group.visible);
});
check('Changing quality synchronizes the adaptive controller with manual resolution',()=>dom(()=>{
  const g=Object.create(GameApp.prototype),budget=new PerformanceBudget();budget.level=.9;budget.bad=1;budget.samples=[80,80];
  Object.assign(g,{preferences:{values:{quality:'high',muted:false,reducedMotion:false,settings:cleanSettings()}},appliedQuality:'balanced',appliedAutoQuality:true,
    experience:{performance:budget},renderer:{setPixelRatio(){},shadowMap:{}},tpsCamera:{},physics:{},vfx:{},city:{},timeTrial:{},audio:{isMuted:false},applyWebTheme(){}});
  g.applyPreferences();assert.equal(budget.level,2);assert.equal(budget.bad,0);assert.equal(budget.samples.length,0);
}));


check('Small city warnings stay quiet at spawn and appear near the actual boundary',()=>dom(nodes=>{
  const g={physics:{position:new THREE.Vector3(99.6,95,90),velocity:new THREE.Vector3(),state:'IDLE'},city:{playableHalfExtent:160},
    isPlaying:true,isPaused:false,preferences:{values:{quality:'balanced',settings:cleanSettings({trajectory:false})}},progression:new Progression(),
    combat:{mode:'web'},timeTrial:{isActive:false},audio:silent,renderer:silent};
  const e=Object.create(PlayerExperience.prototype);Object.assign(e,{game:g,performance:{update:()=>null},stunts:{update(){}},ghost:{mesh:{},update(){}},trajectory:{},visitTime:0,saveTime:0,previewTime:0});
  e.update(.01,.01);assert.equal(nodes.get('boundary-warning').textContent,'');
  g.physics.position.x=150;e.update(.01,.01);assert.match(nodes.get('boundary-warning').textContent,/10m/);
}));
check('Context loss exposes retry controls and blocks gameplay until recovery',()=>dom(nodes=>{
  const g=Object.create(GameApp.prototype);const screen=node();screen.classList.add('hidden');
  Object.assign(g,{assetsReady:true,contextLost:true,loadingScreen:screen,loadingDesc:{},isPlaying:true,isPaused:true,showNotice(){}});
  g.showLoadingError('복구 대기');assert(!screen.classList.contains('hidden'));assert(!nodes.get('loading-recovery').classList.contains('hidden'));
  g.setPaused(false);assert(g.isPaused);
}));

check('Preview searches stay at 10Hz at 30/60/144fps while actual shots search immediately',()=>{
  for(const fps of [30,60,144]){
    const p=new SwingPhysics(new THREE.Scene(),{buildingMeshes:[],colliders:[],checkCollision:()=>({collided:false})},{group:new THREE.Group(),update(){},fireWeb(){}},silent);
    const camera=new THREE.PerspectiveCamera();p.position.set(0,40,0);p.state='FALLING';let searches=0,anchor=null;
    p.findBestAnchor=()=>{searches++;p.bestAnchorCandidate=anchor;return anchor;};
    for(let i=0;i<fps;i++)p.update(1/fps,{},camera);
    assert(searches>=8&&searches<=11,`${fps}fps caused ${searches} advisory searches`);
    const before=searches;anchor=new THREE.Vector3(0,70,20);assert(p.startSwing(camera));assert.equal(searches,before+1);assert(p.anchorPoint.equals(anchor));
    p.releaseSwing();p.webEnabled=false;p.position.set(0,.1,0);p.state='IDLE';searches=0;
    for(let i=0;i<fps;i++)p.update(1/fps,{},camera);assert.equal(searches,0,'Ground combat performed unused web preview scans');
  }
});
{
  const world=new StreamedCollision();await world.initialized;
  try{
    const wall=new THREE.Mesh(new THREE.BoxGeometry(20,40,1));wall.position.set(0,20,30);wall.updateMatrixWorld(true);
    world.enqueue(wall);world.setActiveMeshes([wall]);world.update(new THREE.Vector3(0,10,0));
    const city={isStreamed:true,collisionWorld:world,buildingMeshes:[wall],colliders:[],raycast:world.raycast.bind(world)};
    const p=new SwingPhysics(new THREE.Scene(),city,{group:new THREE.Group(),update(){},fireWeb(){}},silent);
    p.position.set(0,10,0);p.state='FALLING';const camera=new THREE.PerspectiveCamera();camera.position.set(0,11,0);camera.lookAt(0,35,30);camera.updateMatrixWorld(true);
    wall.raycast=()=>{throw Error('Dense visual triangles were scanned despite baked support');};
    const anchor=p.findBestAnchor(camera);assert(anchor);assert(Math.abs(anchor.z-29.5)<.01);assert(p.bestAnchorNormal.z<-.99);
    assert(p.startSwing(camera));assert(p.webs[0].supportCollider);p.clearWebAnchor();
    assert(p.performAirJump(camera));assert.equal(p.state,'WEB_ZIP');p.clearWebAnchor();assert(p.performWebPull(camera));
    passed++;console.log('PASS real Rapier swing/zip/pull use indexed streamed surfaces and correct normals without visual triangle scans');
  }catch(error){failed++;console.error('FAIL indexed streamed targeting: '+error.message);}
  finally{world.dispose();}
}
console.log(`Full game audit: ${passed} passed, ${failed} failed.`);if(failed)process.exitCode=1;
