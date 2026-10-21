import * as T from 'three';
import {Character} from '/src/Character.js';
import {setAppearance} from '/src/CharacterAppearance.js';

// Developer review: exact recorded Character.update output, never interpolated
// authored keys or a second IK solver. Every camera sees the same final pose.
export async function startMotionQualityReview(){
 document.body.style.cssText='margin:0;background:#edf1f5;color:#172738;font:14px system-ui';
 document.body.innerHTML=`<header style="padding:12px 16px;background:white"><h2 style="margin:0 0 8px">전체 모션 · 최종 자세 검수</h2>
 <button id="previous">이전</button> <select id="quality-motion" aria-label="모션"></select> <button id="next">다음</button>
 <select id="quality-appearance" aria-label="외형"><option value="web">와이어 외형</option><option value="combat">전투 외형</option></select>
 <button id="quality-play">재생</button> <select id="quality-speed" aria-label="재생 속도"><option value="1">정상 속도</option><option value=".25">0.25배속</option></select>
 <button id="quality-sheet">전체 구간 비교</button> <input id="quality-frame" aria-label="재생 프레임" type="range" min="0" max="100" value="0">
 <output id="quality-status" style="display:block;margin-top:6px">자료 로딩 중</output></header><main style="position:relative;width:1260px;margin:auto"></main>`;
 const data=await (await fetch('/docs/qa/individual-motions-2026-10-21/poses.json')).json();
 const selector=document.querySelector('#quality-motion'),appearance=document.querySelector('#quality-appearance'),status=document.querySelector('output'),main=document.querySelector('main');
 const motions=data.results.filter(r=>r.mode==='web').map(r=>r.key);
 selector.replaceChildren(...motions.map(key=>{const o=document.createElement('option');o.value=o.textContent=key;return o;}));
 const scene=new T.Scene();scene.background=new T.Color('#edf1f5');
 scene.add(new T.HemisphereLight(0xffffff,0x718291,3));const sun=new T.DirectionalLight(0xffffff,3);sun.position.set(3,5,4);scene.add(sun);
 const fill=new T.DirectionalLight(0xffffff,1.7);fill.position.set(-3,2,-4);scene.add(fill);
 const ground=new T.GridHelper(8,16,0xa7b3bf,0xcad3dc);scene.add(ground);
 const wall=new T.GridHelper(8,16,0xa7b3bf,0xcad3dc);wall.rotation.x=Math.PI/2;wall.position.y=1;scene.add(wall);
 const camera=new T.OrthographicCamera(-1,1,1,-1,.01,100);
 const renderer=new T.WebGLRenderer({antialias:true});renderer.setPixelRatio(1);main.append(renderer.domElement);
 const labels=document.createElement('div');labels.style.cssText='position:absolute;inset:0;pointer-events:none';main.append(labels);
 let c;await new Promise(resolve=>{c=new Character(scene,null,resolve);});c.stopAnimation();
 const boneMap=new Map(Object.values(c.bones).map(b=>[b.name,b]));
 let row,playing=false,sheet=true,frames=[],cursor=0,clock=performance.now(),request=0,canvasHeight=0;
 function apply(pose){
  c.group.position.fromArray(pose.root);c.model.position.fromArray(pose.model.p);c.model.quaternion.fromArray(pose.model.q);
  for(const [name,...values] of pose.bones){const b=boneMap.get(name);b.position.fromArray(values);b.quaternion.fromArray(values,3);}
  c.group.updateMatrixWorld(true);
 }
 function render(){
  if(!row)return;const width=1260,height=sheet?750:630;if(canvasHeight!==height){renderer.setSize(width,height);canvasHeight=height;}labels.replaceChildren();
  const min=new T.Vector3().fromArray(row.bounds[0]),max=new T.Vector3().fromArray(row.bounds[1]),center=min.clone().add(max).multiplyScalar(.5),size=max.clone().sub(min);
  const span=Math.max(size.y,Math.max(size.x,size.z)*1.28,2.15)*1.13;
  setAppearance(c,appearance.value,false);ground.visible=['IDLE','RUNNING','SPRINTING','TURNING','LANDING','ROLLING'].includes(row.state);wall.visible=row.state==='WALL_RUNNING';
  if(c.transformEffect)c.transformEffect.visible=false;
  renderer.setScissorTest(true);
  const views=[[row.state==='WALL_RUNNING'?'벽 바깥':'정면',new T.Vector3(0,.06,1)],['측면',new T.Vector3(1,.06,0)],[row.state==='WALL_RUNNING'?'벽 안쪽':'후면',new T.Vector3(0,.06,-1)]];
  const samples=sheet?row.poses:[frames[Math.min(frames.length-1,Math.floor(cursor))] || row.poses[0]];
  for(let v=0;v<3;v++)for(let i=0;i<samples.length;i++){
   const w=width/(sheet?samples.length:3),h=sheet?250:height,x=sheet?i*w:v*w,y=sheet?(2-v)*h:0;
   apply(samples[i]);camera.left=-span*w/h/2;camera.right=-camera.left;camera.top=span/2;camera.bottom=-span/2;
   camera.position.copy(center).addScaledVector(views[v][1],8);camera.lookAt(center);camera.updateProjectionMatrix();
   renderer.setViewport(x,y,w,h);renderer.setScissor(x,y,w,h);renderer.render(scene,camera);
   const label=document.createElement('span');label.style.cssText=`position:absolute;left:${x+5}px;top:${height-y-h+5}px;font-size:12px;background:#ffffffcc;padding:2px 4px`;
   label.textContent=`${views[v][0]} · ${(samples[i].time/row.duration*100).toFixed(0)}%`;labels.append(label);
  }
  renderer.setScissorTest(false);
  status.textContent=`${motions.indexOf(row.key)+1} / ${motions.length} · ${row.key} · ${appearance.value} · ${row.state} · ${row.duration.toFixed(2)}초 · ${sheet?'7개 구간 × 정면·측면·후면':'최종 출력 60 FPS 기록 재생 '+(cursor/60).toFixed(2)+'초'}`;
 }
 async function choose(){
  const id=++request;playing=false;sheet=true;cursor=0;frames=[];
  const play=document.getElementById('quality-play'),slider=document.getElementById('quality-frame');play.disabled=slider.disabled=true;
  row=data.results.find(r=>r.key===selector.value && r.mode===appearance.value);render();
  try{
   // A .gz extension makes Vite set Content-Encoding, so fetch can already
   // decompress it. Opaque binary avoids a second, browser-dependent decode.
   const response=await fetch(`/docs/qa/individual-motions-2026-10-21/timelines/${appearance.value}-${selector.value}.bin`);
   if(!response.ok)throw new Error('Timeline unavailable');
   const timeline=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
   if(id===request){frames=timeline;play.disabled=slider.disabled=false;}
  }catch(error){if(id===request)status.textContent+=' · 연속 재생 자료를 불러오지 못했습니다';console.error(error);}
 }
 selector.onchange=appearance.onchange=choose;
 for(const [id,step] of [['previous',-1],['next',1]])document.getElementById(id).onclick=()=>{selector.value=motions[(motions.indexOf(selector.value)+step+motions.length)%motions.length];choose();};
 document.getElementById('quality-play').onclick=()=>{if(!frames.length)return;sheet=false;if(cursor>=frames.length-1)cursor=0;playing=!playing;clock=performance.now();render();};
 document.getElementById('quality-sheet').onclick=()=>{sheet=true;playing=false;render();};
 document.getElementById('quality-frame').oninput=e=>{sheet=false;playing=false;cursor=(frames.length-1)*Number(e.target.value)/100;render();};
 renderer.setAnimationLoop(()=>{const now=performance.now(),dt=Math.min(.1,(now-clock)/1000);clock=now;if(!playing || !frames.length)return;cursor+=dt*60*Number(document.getElementById('quality-speed').value);if(cursor>=frames.length-1){cursor=frames.length-1;playing=false;}render();});
 await choose();
}
