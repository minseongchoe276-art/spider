import * as THREE from 'three';
import {Character} from './Character.js';
import {VFXManager} from './VFX.js';

// Focused visual QA fixture, independent of streamed city/network availability.
export function startEffectsReview() {
  document.body.replaceChildren();document.body.style.cssText='margin:0;overflow:hidden;background:#17232d;font:15px system-ui';
  const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  document.body.append(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#17232d');
  scene.add(new THREE.HemisphereLight(0xffffff,0x49505a,2));
  const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(3,10,8);scene.add(light);
  const wall=new THREE.Mesh(new THREE.BoxGeometry(14,12,0.4),new THREE.MeshStandardMaterial({color:0x394753,roughness:0.9}));wall.position.set(0,6,-0.2);scene.add(wall);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.MeshStandardMaterial({color:0x65717a}));floor.rotation.x=-Math.PI/2;scene.add(floor);
  scene.add(new THREE.GridHelper(30,30,0x87929b,0x55606a));
  const camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,0.05,100);camera.position.set(8,7,15);camera.lookAt(0,4,0);
  const vfx=new VFXManager(scene),panel=document.createElement('section');
  panel.style.cssText='position:fixed;left:16px;top:16px;background:#fffffff2;border-radius:10px;padding:16px;color:#17232d;max-width:290px';
  panel.innerHTML='<strong>에너지 와이어 · 이펙트 · 벽 타기 검증</strong><p><button id="fx-web">양손 에너지 와이어 발사</button> <button id="fx-dust">착지 먼지</button></p><p><button id="fx-super-land">슈퍼히어로 착지 충격파</button></p><p><button id="fx-wall">벽 기어가기</button> <button id="fx-reset">초기화</button></p><output id="fx-status">모델 로딩 중</output><p><a href="/">홍콩 게임으로 돌아가기</a></p>';
  document.body.append(panel);let mode='idle',age=0;
  const status=panel.querySelector('output');
  const character=new Character(scene,()=>{},()=>{status.textContent='준비 완료 · 다운로드한 Climb Wall / Kenney 텍스처';});
  const reset=()=>{mode='idle';age=0;camera.position.set(8,7,15);camera.lookAt(0,4,0);character.persistentWebAnchor=null;character.webAttachments=[];character.webShotAnchor=null;character.webShotTimer=0;character.updateWeb(false,null);character.group.position.set(0,0.1,2);};reset();
  panel.querySelector('#fx-web').onclick=()=>{if(!character.isLoaded)return;reset();mode='web';age=0;character.group.position.set(0,2,2);character.fireWeb(new THREE.Vector3(-4,8,0.1),'left');character.fireWeb(new THREE.Vector3(4,8,0.1),'right');status.textContent='양손 곡선 섬유 · 발사 진행 · 부착 입자';};
  panel.querySelector('#fx-dust').onclick=()=>{vfx.spawnLandingShockwave(new THREE.Vector3(0,0.02,2),14,new THREE.Vector3(0,1,0));status.textContent='일반 착지 먼지 및 원형 파동';};
  panel.querySelector('#fx-super-land').onclick=()=>{
    reset();
    vfx.spawnLandingShockwave(new THREE.Vector3(0,0.02,2),36,new THREE.Vector3(0,1,0));
    if(character.isLoaded) {
      character.landingSpeed = 36;
      character.update(0.01,'LANDING',new THREE.Vector3());
    }
    status.textContent='슈퍼히어로 착지 충격파 · 크랙 데칼 · 링 확장 · 방사형 먼지/스파크';
  };
  panel.querySelector('#fx-wall').onclick=()=>{if(!character.isLoaded)return;reset();mode='wall';character.group.position.set(0,1,0.7);character.wallNormal=new THREE.Vector3(0,0,1);character.wallDistance=0.7;status.textContent='Climb Wall 모션 · 손발 벽 접촉 보정';};
  panel.querySelector('#fx-reset').onclick=reset;
  const clock=new THREE.Clock();renderer.setAnimationLoop(()=>{
    const dt=Math.min(clock.getDelta(),0.05),old=age;age+=dt;
    if(character.isLoaded) {
      if(mode==='wall') {character.group.position.y=1+(age*1.8)%7;character.update(dt,'WALL_RUNNING',new THREE.Vector3(0,1.8,0));camera.position.set(3,character.group.position.y+1.8,5);camera.lookAt(0,character.group.position.y+1,0.4);}
      else if(mode==='web') {character.update(dt,'SWINGING',new THREE.Vector3(0,0,8),new THREE.Vector3(4,8,0.1));if(old<0.14&&age>=0.14)for(const x of [-4,4])vfx.spawnWebImpact(new THREE.Vector3(x,8,0.15));}
      else character.update(dt,'IDLE',new THREE.Vector3());
    }
    vfx.update(dt);renderer.render(scene,camera);
  });
  window.addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();});
}
