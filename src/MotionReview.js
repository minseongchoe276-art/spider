import * as THREE from 'three';
import { Character } from './Character.js';
import { SwingPhysics } from './SwingPhysics.js';
import { City } from './City.js';
import { StreamedCollision } from './StreamedCollision.js';

export function updateDualWebReview(physics,input,camera,old,elapsed) {
  for(const [time,x,y,button]of [[0.05,-4,7,0],[0.3,4,7,2],[2.4,-4,9,0]]){
    if(!(old<time&&elapsed>=time))continue;
    if(time===2.4)physics.releaseWebButton(0);
    camera.lookAt(x,y,4);camera.updateMatrixWorld(true);
    if(button===0)input.webTap=input.webHold=input.webFireHeld=true;
    else input.webTapRight=input.webHoldRight=input.webFireHeldRight=true;
  }
}

export function startMotionReview() {
  document.body.replaceChildren();
  document.body.style.cssText = 'margin:0;background:#dbe7ef;color:#16283b;font:15px system-ui;overflow:hidden';
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  document.body.append(renderer.domElement);
  const panel = document.createElement('section');
  panel.style.cssText = 'position:fixed;top:16px;left:16px;background:#ffffffed;padding:16px;border-radius:12px;max-width:340px;z-index:2';
  panel.innerHTML = `<h2 style="margin:0 0 12px">스파이더맨 모션 검증</h2>
    <label>모션 <select id="motion"><option>로딩 중</option></select></label>
    <p><button id="pause">재생 / 정지</button> <button id="front">정면 / 측면</button></p>
    <label>구간 <input id="frame" type="range" min="0" max="100" value="0"></label>
    <p><input id="frame-percent" aria-label="검사할 모션 구간 퍼센트" type="number" min="0" max="100" value="45" style="width:55px">% <button id="pose-sample">자세 검사</button></p>
    <p><label>동작 연결 <select id="test-kind">
      <option value="movement">걷기·조깅·달리기·정지·점프</option>
      <option value="walkStop">걷기 → 정지 → 대기</option>
      <option value="turn">좌우 제자리 회전</option>
      <option value="landing">낙하 → 착지 회복</option>
      <option value="roll">높은 낙하 → 구르기 회복</option>
      <option value="zip">웹 집 → 연결 유지 → 스윙</option>
      <option value="swing">스윙 → 해제 → 낙하</option>
      <option value="dualWeb">왼손 발사 → 오른손 발사 → 양손 매달리기 → 교체</option>
      <option value="wall">벽 달리기 → 옥상 진입</option>
      <option value="slope">경사면 걷기 → 정지</option>
      <option value="slopeDown">경사면 내려가기 → 정지</option>
      <option value="stairs">계단 걷기 → 정지</option>
    </select></label> <button id="scenario">검증 실행</button></p>
    <p><label>전환 순간 자동 정지 <select id="break-on"><option value="">없음</option>
      ${['walk','jog','regularRun','run','stop','runStop','turnLeft','turnRight','jump','drop','fall','land','roll','swing','wall','zip'].map(key=>`<option>${key}</option>`).join('')}
    </select></label></p>
    <p><label>시나리오 시간 <input id="sample-time" type="number" min="0" max="15" step="0.05" value="2.5" style="width:65px">초</label>
    <button id="sample">해당 장면 보기</button></p>
    <output id="review-status">모델과 모션 로딩 중…</output>
    <p style="margin-bottom:0"><a href="/">게임으로 돌아가기</a></p>`;
  document.body.append(panel);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#dbe7ef');
  scene.add(new THREE.HemisphereLight(0xffffff, 0x738294, 2.5));
  const sun = new THREE.DirectionalLight(0xffffff, 3); sun.position.set(3, 5, 4); scene.add(sun,sun.target);
  sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-8;sun.shadow.camera.right=8;
  sun.shadow.camera.top=8;sun.shadow.camera.bottom=-8;sun.shadow.camera.far=30;sun.shadow.normalBias=0.02;
  scene.add(new THREE.GridHelper(200, 200, 0x738294, 0xa8bbc9));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0xd8dfe5}));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.01;floor.receiveShadow=true; scene.add(floor);
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.01, 200);
  const status = panel.querySelector('output'), select = panel.querySelector('select'), slider = panel.querySelector('input');
  let playing = true, side = false, mode = 'clip', elapsed = 0, history = [], scenario = 'movement', actionHistory = [], breakOn = '';
  const character = new Character(scene, (n, s) => { status.textContent = `${n}% ${s}`; }, () => {
    select.replaceChildren(...Object.keys(character.actions).filter(k => k !== 'default').map(k => {
      const o = document.createElement('option'); o.value = k; o.textContent = k; return o;
    }));
    select.value = 'idle'; choose();
  });
  const silent = new Proxy({}, { get: () => () => {} });
  const city = { buildingMeshes: [], colliders: [], checkCollision: City.prototype.checkCollision,raycast:City.prototype.raycast,
    getRooftopSpawn:()=>new THREE.Vector3(0,.1,0) };
  const wallFixture = new THREE.Mesh(new THREE.BoxGeometry(6,10,6),new THREE.MeshStandardMaterial({color:0x8595aa}));
  wallFixture.position.set(0,5,-3); wallFixture.visible=false;wallFixture.receiveShadow=true; scene.add(wallFixture);
  const zipFixture = new THREE.Mesh(new THREE.BoxGeometry(8,8,2),new THREE.MeshStandardMaterial({color:0x8595aa}));
  zipFixture.position.set(0,5,18);zipFixture.visible=false;scene.add(zipFixture);
  const dualFixtures=[-4,4].map(x=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(1.5,8,1.5),new THREE.MeshStandardMaterial({color:0x91a5b5}));
    mesh.position.set(x,6,4);mesh.visible=false;mesh.updateMatrixWorld(true);scene.add(mesh);return mesh;
  });
  const terrainWorld=new StreamedCollision(),terrainFixtures=[];
  const ramp=new THREE.Mesh(new THREE.PlaneGeometry(6,12),new THREE.MeshStandardMaterial({color:0x79958b,side:THREE.DoubleSide}));
  ramp.rotation.x=-Math.PI/2-Math.atan(0.3);ramp.position.y=1.8;terrainFixtures.push(ramp);
  const terrainFloor=new THREE.Mesh(new THREE.BoxGeometry(30,1,30));terrainFloor.position.y=-0.5;
  terrainWorld.initialized.then(()=>{
    terrainWorld.enqueue(terrainFloor);terrainWorld.enqueue(ramp);
    for(let i=0;i<6;i++) {
      const step=new THREE.Mesh(new THREE.BoxGeometry(3,(i+1)*0.2,0.65),new THREE.MeshStandardMaterial({color:0x8c9bae}));
      step.position.set(8,(i+1)*0.1,1+i*0.65);terrainFixtures.push(step);terrainWorld.enqueue(step);
    }
    for(const mesh of terrainFixtures){mesh.visible=false;mesh.receiveShadow=true;scene.add(mesh);}
    for(let i=0;i<30;i++)terrainWorld.update(new THREE.Vector3());
  });
  window.addEventListener('pagehide',()=>terrainWorld.dispose(),{once:true});
  const physics = new SwingPhysics(scene, city, character, silent);
  physics.position.set(0,0.1,0); physics.state = 'IDLE';
  const input = {forward:false,backward:false,left:false,right:false,sprint:false,jump:false,webHold:false,wallRun:false,strafe:0};
  function choose() {
    mode = 'clip'; character.mixer.stopAllAction(); character.activeAction = null;
    wallFixture.visible=false;zipFixture.visible=false; character.updateWeb(false,null);
    for(const mesh of dualFixtures)mesh.visible=false;
    character.group.position.set(0,0,0); character.model.rotation.set(0,0,0);
    character.model.position.y = 0;
    character.model.position.x=0;character.model.position.z=0;
    character.fadeToAction(select.value, 0); character.mixer.update(0);
    slider.value = 0;
  }
  select.addEventListener('change',choose);
  panel.querySelector('#pause').onclick = () => { playing = !playing; };
  panel.querySelector('#front').onclick = () => { side = !side; };
  slider.oninput = () => {
    playing = false; const action = character.activeAction;
    action.paused = false; action.enabled = true;
    action.time = action.getClip().duration * Number(slider.value) / 100;
    character.mixer.update(0);
  };
  panel.querySelector('#pose-sample').onclick=()=>{
    slider.value=THREE.MathUtils.clamp(Number(panel.querySelector('#frame-percent').value),0,100);slider.oninput();
  };
  function resetScenario() {
    mode = 'scenario'; playing = true; elapsed = 0;
    history = [];
    actionHistory = []; breakOn = panel.querySelector('#break-on').value;
    scenario = panel.querySelector('#test-kind').value;
    physics.resetPosition();
    character.mixer.stopAllAction(); character.activeAction = null;
    character.visualYaw = 0; character.targetFacingAngle = 0;
    character.bodyPitch = 0; character.trickRotation = 0; character.isTricking = false;
    physics.recoveryTime = 0; physics.recoveryElapsed = 0; physics.zipTime = 0;
    physics.facingAngle = 0; physics.isSwinging = false; physics.anchorPoint = null; physics.canAirJump = true;
    city.collisionWorld=null;delete city.resolveMovement;delete city.supportHeight;
    for(const mesh of terrainFixtures)mesh.visible=false;
    for (const key of Object.keys(input)) input[key] = key === 'strafe' ? 0 : false;
    physics.position.set(0,0.1,0); physics.velocity.set(0,0,0); physics.state = 'IDLE';
    if (scenario === 'landing' || scenario === 'roll') { physics.position.y = scenario === 'roll' ? 35 : 8; physics.state = 'FALLING'; if(scenario==='roll')physics.velocity.z=12; }
    if (scenario === 'swing') {
      physics.position.y=10; physics.velocity.set(0,0,12); physics.state='SWINGING';
      physics.isSwinging=true; physics.anchorPoint=new THREE.Vector3(0,25,8);
      physics.ropeLength=physics.position.distanceTo(physics.anchorPoint); input.webHold=true;
    }
    if(scenario==='dualWeb') {
      physics.position.set(0,3,0);physics.state='FALLING';physics.launchAssistAvailable=false;
    }
    if (scenario === 'wall') {
      physics.state='WALL_RUNNING'; physics.position.y=3;
      physics.wallNormal.set(0,0,1); character.wallNormal=physics.wallNormal;
      physics.wallBuilding={maxY:10}; physics.wallRunTimer=0;
      city.colliders=[{minX:-3,maxX:3,minZ:-6,maxZ:0,minY:0,maxY:10}];
      physics.position.z=0.7;
    } else if(scenario==='zip') {
      city.colliders=[{minX:-4,maxX:4,minZ:17,maxZ:19,minY:1,maxY:9}];
    } else {
      city.colliders=[];
    }
    if(['slope','slopeDown','stairs'].includes(scenario)) {
      city.colliders=[];city.collisionWorld=terrainWorld;
      city.resolveMovement=(a,b,v)=>terrainWorld.resolve(a,b,v);
      city.supportHeight=p=>{const y=terrainWorld.groundAt(p,0.5);return y!==null && Math.abs(p.y-y-0.1)<0.25?y:null;};
      for(const mesh of terrainFixtures)mesh.visible=scenario==='stairs'?mesh!==ramp:mesh===ramp;
      physics.position.set(scenario==='stairs'?8:0,5,scenario==='slopeDown'?3:-3);
      physics.position.y=terrainWorld.groundAt(physics.position,8)+0.1;
      physics.facingAngle=scenario==='slopeDown'?Math.PI:0;character.targetFacingAngle=physics.facingAngle;
    }
    physics.previousFixedPosition.copy(physics.position);physics.renderPosition.copy(physics.position);
    wallFixture.visible=scenario === 'wall';
    zipFixture.visible=scenario === 'zip';
    city.buildingMeshes=scenario === 'zip' ? [zipFixture] : [];
    for(const mesh of dualFixtures)mesh.visible=scenario==='dualWeb';
    if(scenario==='dualWeb')city.buildingMeshes=dualFixtures;
    zipFixture.updateMatrixWorld(true);
    character.lastState = null;
    character.idleFootAnchors=null;character.idlePlantDelay=0;character.movingPlants=null;character.plantRoot=null;
    character.movingReleases=null;character.plantLastFeet=null;character.plantVelocityRoot=null;
    character.wallPoseRoot=null;character.wallContacts=null;character.wallPhase=0;character.wallPoseWeight=0;character.wallSoleRotations=null;
    character.wallDistance=0.7;
    character.zipPoseWeight=0;character.persistentWebAnchor=null;character.webShotAnchor=null;character.webShotTimer=0;
    character.webArmWeight=0;character.webPoseAnchor=null;character.wallPoseNormal=null;
    character.terrainPelvis=0;
  }
  panel.querySelector('#scenario').onclick=resetScenario;
  panel.querySelector('#sample').onclick=()=>{
    if(!character.isLoaded)return;
    resetScenario();breakOn='';
    const target=THREE.MathUtils.clamp(Number(panel.querySelector('#sample-time').value)||0,0,15);
    while(elapsed<target-1e-8) advanceScenario(Math.min(1/120,target-elapsed));
    playing=false;
  };
  function advanceScenario(dt) {
    const old=elapsed;elapsed+=dt;
    input.forward=scenario==='movement' && elapsed>=1 && elapsed<9 || scenario==='walkStop' && elapsed>=1 && elapsed<3 || scenario==='wall' && elapsed<2.2 || ['slope','slopeDown','stairs'].includes(scenario) && elapsed>=0.5 && elapsed<3.5;
    input.wallRun=scenario==='wall' && elapsed<2.2;
    input.jog=scenario==='movement' && elapsed>=3 && elapsed<5;
    input.run=scenario==='movement' && elapsed>=5 && elapsed<7;
    input.sprint=scenario==='movement' && elapsed>=7 && elapsed<9;
    input.jump=scenario==='movement' && old<11 && elapsed>=11;
    const controllerCamera=new THREE.PerspectiveCamera();controllerCamera.rotation.y=Math.PI;
    controllerCamera.position.copy(physics.position).add(new THREE.Vector3(0,1.3,0));
    if(scenario==='wall')controllerCamera.rotation.y=0;
    if(scenario==='slopeDown')controllerCamera.rotation.y=0;
    if(scenario==='zip' && old<1 && elapsed>=1) {
      controllerCamera.lookAt(0,8,18);controllerCamera.updateMatrixWorld(true);
      if(physics.performWebPull(controllerCamera))input.webHold=true;
    }
    if(scenario==='dualWeb') {
      updateDualWebReview(physics,input,controllerCamera,old,elapsed);
    }
    if(scenario==='turn' && old<1 && elapsed>=1)physics.turnOnSpot('left');
    if(scenario==='turn' && old<3 && elapsed>=3)physics.turnOnSpot('right');
    if(scenario==='swing' && elapsed>=2)input.webHold=false;
    physics.update(dt,input,controllerCamera);
    if(history.at(-1)!==physics.state)history.push(physics.state);
    const key=character.activeAction?.getClip().name;
    if(actionHistory.at(-1)!==key)actionHistory.push(key);
    if(breakOn && key===breakOn) {playing=false;breakOn='';}
    if(elapsed>(scenario==='movement'?15:7))playing=false;
  }
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(),0.05);
    if (character.isLoaded) {
      if (playing && mode === 'clip') character.mixer.update(dt);
      if (playing && mode === 'scenario') {
        advanceScenario(dt);
      }
      const action = character.activeAction;
      status.textContent = `${mode === 'scenario' ? '시나리오 '+elapsed.toFixed(2)+'초\n'+history.join(' → ') + '\n모션: ' + actionHistory.join(' → ') + '\n' : ''}${action?.getClip().name} · ${action?.time.toFixed(2)}초 / ${action?.getClip().duration.toFixed(2)}초 · 속도 ${physics.velocity.length().toFixed(2)} m/s${scenario==='dualWeb' && mode==='scenario'?'\n연결 줄 '+physics.webs.length+'개 · '+physics.webs.map(web=>web.hand==='left'?'왼손 부착':'오른손 부착').join(' / '):''}`;
      status.style.whiteSpace='pre-line';
    }
    const center = character.group.position.clone().add(new THREE.Vector3(0,1.1,0));
    sun.position.copy(center).add(new THREE.Vector3(3,5,4));sun.target.position.copy(center);
    camera.position.copy(center).add(new THREE.Vector3(side ? 5.5 : 2.5,0.8,side ? 0 : 5.3));
    if(mode==='scenario' && scenario==='zip')camera.position.copy(center).add(new THREE.Vector3(8,2,0));
    if(mode==='scenario' && scenario==='dualWeb')camera.position.copy(center).add(new THREE.Vector3(side?9:2,3,side?1:11));
    // Keep the character in the unobscured part of the inspection viewport.
    camera.setViewOffset(innerWidth,innerHeight,-panel.offsetWidth/2,0,innerWidth,innerHeight);
    camera.lookAt(center); renderer.render(scene,camera);
  });
  window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); });
}
