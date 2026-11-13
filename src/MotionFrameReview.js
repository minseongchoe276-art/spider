import {ATTACKS,FIREARMS} from './Combat.js';
import {RELEASE_SOURCE} from './ReleaseIdentity.js';

export function motionReviewDuration(action,weapon){
 if(action==='gunReload')return FIREARMS[weapon]?.reload || 1.35;
 return ATTACKS[action]?.duration || ({dodgeLeft:.38,dodgeRight:.38,dodgeBack:.42,dodgeForward:.52,hitHead:.65,hitBody:.85,hitHeavy:1.05}[action] ?? 1.05);
}

// Records final Character.update output. This is a controlled pose scenario,
// not a recording of city physics or every possible gameplay interruption.
export function setupMotionFrameReview({panel,character,equip,step,inspect,renderer,onReview}){
 const $=id=>panel.querySelector('#'+id),storageKey='shadow-pulse-frame-review-v1';
 const section=document.createElement('section');section.innerHTML=`<hr><h3>프레임 육안 검수</h3>
 <p>선택한 무기·상태·동작의 60fps 자세를 기록합니다. 실제 지형·와이어 물리와 다른 전환은 포함되지 않습니다. 판정은 브라우저에 저장되며, 다시 불러온 뒤에는 이전 자세를 복원할 수 없으므로 이미지와 기록을 각각 내려받으세요.</p>
 <p><button id="frame-record">선택 조합 기록</button> <button id="frame-exit">검수 종료</button></p>
 <p><button id="frame-prev" disabled>◀ 이전</button> <input id="frame-seek" aria-label="검수 프레임" type="range" min="0" max="0" value="0" disabled style="width:115px"> <button id="frame-next" disabled>다음 ▶</button></p>
 <output id="frame-position">기록 전</output><p><label>메모 <input id="frame-note" placeholder="관절·관통 등" style="width:160px"></label></p>
 <p><button id="frame-pass" disabled>이 시점 확인</button> <button id="frame-issue" disabled>문제 기록</button> <button id="frame-clear" disabled>판정 지우기</button></p>
 <p><button id="frame-image" disabled>현재 화면 저장</button> <button id="frame-export">검수 기록 내보내기</button></p><output id="frame-review-status"></output>`;panel.append(section);
 let frames=[],current=0,active=false,key='',meta=null,loading=false,recordedAt=null;
 let records={};try{records=JSON.parse(localStorage.getItem(storageKey)||'{}');}catch{}
 const save=()=>{try{localStorage.setItem(storageKey,JSON.stringify(records));}catch(error){$('frame-review-status').textContent='브라우저 저장 실패: '+error.message;}};
 const allBones=()=>Object.values(character.bones);
 function snapshot(){return {bones:allBones().map(b=>[b,...b.position.toArray(),...b.quaternion.toArray()]),modelP:character.model.position.toArray(),modelQ:character.model.quaternion.toArray(),groupP:character.group.position.toArray(),weaponQ:[character.gunModel,character.knifeModel,...Object.values(character.extraWeapons||{})].filter(Boolean).map(o=>[o,o.quaternion.toArray()])};}
 function apply(frame){character.group.position.fromArray(frame.groupP);character.model.position.fromArray(frame.modelP);character.model.quaternion.fromArray(frame.modelQ);for(const [b,...v] of frame.bones){b.position.fromArray(v);b.quaternion.fromArray(v,3);}for(const [o,q] of frame.weaponQ)o.quaternion.fromArray(q);character.group.updateMatrixWorld(true);}
 function setEnabled(enabled){for(const id of ['frame-prev','frame-next','frame-seek','frame-pass','frame-issue','frame-clear','frame-image'])$(id).disabled=!enabled;}
 function show(){if(!active||!frames.length)return;current=Math.max(0,Math.min(frames.length-1,current));apply(frames[current]);$('frame-seek').value=current;const view=$('view').value,item=records[key]?.views?.[view]?.[current];$('frame-position').textContent=`${current+1} / ${frames.length} 프레임 · ${(current/60).toFixed(3)}초 · ${view}`;$('frame-note').value=item?.note||'';const n=Object.values(records[key]?.views||{}).reduce((sum,view)=>sum+Object.keys(view).length,0);$('frame-review-status').textContent=`현재: ${item?.status||'미검수'} · 기록 ${n} / ${frames.length*3} 시점·프레임`;}
 function mark(status){if(!active)return;records[key] ||= {...meta,views:{}};const views=records[key].views,view=$('view').value;views[view] ||= {};if(status)views[view][current]={status,note:$('frame-note').value,updated:new Date().toISOString()};else delete views[view][current];save();show();}
 $('frame-record').onclick=async()=>{if(loading)return;loading=true;setEnabled(false);onReview(false);active=false;frames=[];try{
  const weapon=$('weapon').value,state=$('state').value,action=$('action').value;
  if($('action').selectedOptions[0]?.disabled)throw Error('선택할 수 없는 동작입니다');
  await equip(weapon);character.stopAnimation();character.lastState=null;
  for(let i=0;i<60;i++)step('IDLE','',i/60);
  const duration=motionReviewDuration(action,weapon);
  const count=Math.ceil((duration+.3)*60);let faults=0;
  for(let i=0;i<=count;i++){const time=i/60;step(state,time<=duration?action:'',time);try{inspect();}catch{faults++;}frames.push(snapshot());}
  recordedAt=new Date().toISOString();meta={weapon,state,action:action||'none',fps:60,frames:frames.length,recordedAt,source:RELEASE_SOURCE,limitations:'고정 조건 Character.update 기록; 실제 게임 물리·충돌·와이어 고정점 및 네트워크 미재현'};
  // New captures receive unique identities; old judgments cannot silently carry over.
  key=JSON.stringify([weapon,state,action,recordedAt]);current=0;active=true;$('frame-seek').max=frames.length-1;setEnabled(true);onReview(true);show();$('status').textContent=`기록 완료 · ${frames.length}프레임 · 수치 오류 ${faults}프레임`;
 }catch(error){$('status').textContent='기록 실패: '+error.message;}finally{loading=false;}};
 $('frame-exit').onclick=()=>{active=false;onReview(false);setEnabled(false);$('frame-position').textContent='검수 종료';};
 $('frame-prev').onclick=()=>{current--;show();};$('frame-next').onclick=()=>{current++;show();};$('frame-seek').oninput=e=>{current=Number(e.target.value);show();};
 const view=$('view');view.addEventListener('change',show);
 $('frame-pass').onclick=()=>mark('확인');$('frame-issue').onclick=()=>mark('문제');$('frame-clear').onclick=()=>mark(null);
 $('frame-image').onclick=()=>{renderer.render(renderer.__reviewScene,renderer.__reviewCamera);const a=document.createElement('a');a.download=`motion-${meta.weapon}-${meta.state}-${meta.action}-${$('view').value}-${current}-${recordedAt.replaceAll(':','-')}.png`;a.href=renderer.domElement.toDataURL('image/png');a.click();};
 $('frame-export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),records:Object.values(records)},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='motion-frame-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 return {get active(){return active;},apply:()=>{if(active&&frames[current])apply(frames[current]);}};
}
