import * as T from 'three';
import {Character} from './Character.js';
import {setAppearance} from './CharacterAppearance.js';
import {MOTIONS} from './MotionCatalog.js';

// Development-only contact sheets: the exact runtime skins and compiled
// clips, including embedded fallback. Runtime transitions have separate tests.
export function startMotionAuditReview(){
 document.body.replaceChildren();document.body.style.cssText='margin:0;background:#e5eaf0;color:#142433;font:13px system-ui;overflow:auto';
 const panel=document.createElement('header');panel.style.cssText='position:sticky;top:0;background:#fff;padding:12px;z-index:2';
 panel.innerHTML='<strong>전체 모션 · 외형 변형 검사</strong> <select aria-label="외형" id="audit-appearance"><option value="combat">사람 · 전투</option><option value="web">변신 · 에너지 와이어</option></select> <select aria-label="시점" id="audit-view"><option value="front">앞 대각선</option><option value="side">측면</option><option value="back">뒤 대각선</option></select> <button id="audit-previous">이전</button> <button id="audit-next">다음</button> <output id="audit-status">로딩 중</output>';
 const grid=document.createElement('main');grid.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:5px;padding:6px';
 document.body.append(panel,grid);
 const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(400,290);renderer.setPixelRatio(1);
 const scene=new T.Scene();scene.background=new T.Color('#dce5ec');scene.add(new T.HemisphereLight(0xffffff,0x65758a,2.6));
 const sun=new T.DirectionalLight(0xffffff,3);sun.position.set(3,8,5);scene.add(sun);
 const floor=new T.Mesh(new T.PlaneGeometry(100,100),new T.MeshStandardMaterial({color:0xb6c3c9}));floor.rotation.x=-Math.PI/2;floor.position.y=-.02;scene.add(floor,new T.GridHelper(50,50));
 const camera=new T.PerspectiveCamera(38,400/290,.01,200);let page=0,ready=false;
 const c=new Character(scene,()=>{},()=>{if(c.actions.default)keys.push('default');ready=true;render();});
 const keys=MOTIONS.map(item=>item.key);
 function render(){
  if(!ready)return;grid.replaceChildren();setAppearance(c,panel.querySelector('#audit-appearance').value,false);
  const items=keys.slice(page*3,page*3+3),saved=Object.values(c.bones).map(b=>({b,p:b.position.clone(),q:b.quaternion.clone()}));
  for(const key of items)for(const phase of [.15,.45,.8]){
   c.stopAnimation();saved.forEach(({b,p,q})=>{b.position.copy(p);b.quaternion.copy(q);});
   c.group.position.set(0,.1,0);c.model.position.set(0,-.1,0);c.model.rotation.set(0,0,0);
   c.fadeToAction(key,0);c.activeAction.time=c.activeAction.getClip().duration*phase;c.mixer.update(0);c.group.updateMatrixWorld(true);
   const bounds=new T.Box3().setFromObject(c.model,true),center=bounds.getCenter(new T.Vector3());
   const view=panel.querySelector('#audit-view').value,offset={front:[2.6,1.25,4.0],side:[4.6,.9,.1],back:[-2.6,1.25,-4]}[view];
   camera.position.copy(center).add(new T.Vector3(...offset));camera.lookAt(center);camera.updateMatrixWorld(true);renderer.render(scene,camera);
   const card=document.createElement('figure');card.style.cssText='margin:0;background:#fff';
   const image=document.createElement('img');image.src=renderer.domElement.toDataURL('image/jpeg',.88);image.alt=`${key} ${Math.round(phase*100)}%`;image.style.cssText='width:100%;height:220px;object-fit:contain;display:block';
   const caption=document.createElement('figcaption');caption.textContent=`${key} · ${Math.round(phase*100)}%`;caption.style.cssText='padding:4px';card.append(image,caption);grid.append(card);
  }
  panel.querySelector('output').textContent=`${page+1}/${Math.ceil(keys.length/3)} · ${keys.length}개 모션 · 구간 15/45/80%`;
  panel.dataset.coverage=JSON.stringify({appearance:panel.querySelector('#audit-appearance').value,view:panel.querySelector('#audit-view').value,page,keys:items,phases:[.15,.45,.8]});
 }
 panel.querySelector('#audit-previous').onclick=()=>{page=(page+Math.ceil(keys.length/3)-1)%Math.ceil(keys.length/3);render();};
 panel.querySelector('#audit-next').onclick=()=>{page=(page+1)%Math.ceil(keys.length/3);render();};
 for(const select of panel.querySelectorAll('select'))select.onchange=render;
}
