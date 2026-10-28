import * as THREE from 'three';
import {GROUNDED} from './MotionCatalog.js';
import {language} from './I18n.js';
import {keyLabel} from './PlayerSettings.js';
import {MISSION_TYPES,targetedMission,createMission,missionTarget,advanceMission,missionFraction,completionRecord,validCompletion} from './MissionRules.js';

const KEY='shadow-pulse-journey-v1';
const copy=(ko,en)=>language()==='en'?en:ko;
const write=(el,text)=>{if(el.textContent!==text)el.textContent=text;};
const validPoint=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
export const LESSONS=Object.freeze(['walk','jump','swing','land','wall','hit']);

// Only observed, active solo movement counts. Recovery/teleport and menus reset
// the sample baseline; existing exploration records and wire colors stay intact.
export class JourneyProgress {
  constructor(storage=null){
    this.storage=storage;this.data={lesson:0,dismissed:false,completed:0,last:null};this.previous=null;
    this.walk=0;this.swing=0;this.wall=0;this.airborne=false;this.lastHits=null;
    try{const d=JSON.parse(storage?.getItem(KEY)||'null');
      if(d&&typeof d==='object'){
        this.data.last=validCompletion(d.last);
        if(Number.isInteger(d.lesson))this.data.lesson=Math.max(0,Math.min(LESSONS.length,d.lesson));
        this.data.dismissed=d.dismissed===true;
        if(Number.isSafeInteger(d.completed)&&d.completed>=0)this.data.completed=Math.min(d.completed,1000000);
      }
    }catch{}
  }
  save(){try{this.storage?.setItem(KEY,JSON.stringify(this.data));return !!this.storage;}catch{return false;}}
  resetSample(){this.previous=null;this.lastHits=null;this.airborne=false;}
  restart(){this.data.lesson=0;this.data.dismissed=false;this.walk=this.swing=this.wall=0;this.resetSample();return this.save();}
  dismiss(){this.data.dismissed=true;this.resetSample();return this.save();}
  observe({position,state,webs=0,hits=0},dt){
    if(!validPoint(position)||!Number.isFinite(dt)||dt<=0||dt>.25){this.resetSample();return {distance:0,advanced:false};}
    const raw=this.previous?Math.hypot(position.x-this.previous.x,position.y-this.previous.y,position.z-this.previous.z):0;
    const distance=raw<=Math.max(2,dt*150)?raw:0;
    this.previous={x:position.x,y:position.y,z:position.z};
    const previousHits=this.lastHits;this.lastHits=hits;
    if(this.data.dismissed||this.data.lesson>=LESSONS.length)return {distance,advanced:false};
    const lesson=LESSONS[this.data.lesson],grounded=GROUNDED.includes(state);
    let complete=false;
    if(lesson==='walk'&&grounded){this.walk+=distance;complete=this.walk>=20;}
    if(lesson==='jump')complete=state==='JUMPING';
    if(lesson==='swing'){if(state==='SWINGING'&&webs>0)this.swing+=dt;complete=this.swing>=2;}
    if(lesson==='land'){if(!grounded)this.airborne=true;complete=grounded&&this.airborne;}
    if(lesson==='wall'){if(state==='WALL_RUNNING'||state==='MANTLING')this.wall+=dt;complete=this.wall>=.6;}
    if(lesson==='hit')complete=previousHits!==null&&hits>previousHits;
    if(complete){this.data.lesson++;this.save();}
    return {distance,advanced:complete};
  }
}

export class SoloJourney {
  constructor(game,storage){
    this.game=game;this.progress=new JourneyProgress(storage);this.mission=null;this.active=false;this.uiTime=0;
    this.panel=document.createElement('section');this.panel.id='solo-objective';this.panel.hidden=true;
    this.panel.setAttribute('aria-label',copy('현재 탐험 목표','Current exploration objective'));
    this.mark=document.createElement('i');this.mark.className='objective-mark';this.mark.setAttribute('aria-hidden','true');
    this.title=document.createElement('strong');this.title.setAttribute('role','status');
    this.range=document.createElement('b');this.range.className='objective-range';
    this.detail=document.createElement('p');this.meter=document.createElement('progress');this.meter.max=1;
    this.panel.append(this.mark,this.title,this.range,this.detail,this.meter);document.getElementById('game-container')?.append(this.panel);
    document.getElementById('btn-tutorial')?.addEventListener('click',()=>{if(this.solo()){this.cancel('restart');game.experience?.study?.endLesson('dismissed');this.progress.restart();this.resume();}});
    document.getElementById('btn-tutorial-skip')?.addEventListener('click',()=>{game.experience?.study?.endLesson('dismissed');this.progress.dismiss();this.render();});
    for(const type of MISSION_TYPES)document.getElementById(`btn-mission-${type}`)?.addEventListener('click',()=>this.start(type));
    document.getElementById('btn-mission-stop')?.addEventListener('click',()=>{this.cancel();this.render();});
    document.getElementById('btn-lesson-practice')?.addEventListener('click',()=>{if(this.solo())game.practice.start('dummy');});
    document.getElementById('btn-mission-retry')?.addEventListener('click',()=>this.start(this.pendingType||this.mission?.type||'rooftops'));
    document.getElementById('btn-mission-repeat')?.addEventListener('click',()=>{if(this.progress.data.last)this.start(this.progress.data.last.type);});
    this.summary();
  }
  solo(){return !!this.game.multiplayer?.solo&&!this.game.multiplayer?.room;}
  resume(){this.game.clearInput();this.game.setPaused(false);this.game.canvas?.focus();}
  resetSample(){this.progress.resetSample();if(this.mission){this.mission.dwell=0;this.mission.skillTime=0;}}
  cancel(reason='user'){this.game.experience?.study?.endMission(reason);this.mission=null;this.pendingType=null;this.resultTime=0;this.resetSample();if(this.marker)this.marker.visible=false;}
  missionName(type){return {
    rooftops:copy('옥상 탐사','Rooftop survey'),discover:copy('구역 탐방','District survey'),travel:copy('도시 순찰','City patrol'),
    delivery:copy('물품 회수 · 배달','Collect and deliver'),technique:copy('이동 기술 훈련','Traversal training'),
  }[type];}
  resultText(record){return copy(`${this.missionName(record.type)} · ${record.distance}m 이동 · ${record.seconds}초`,`${this.missionName(record.type)} · ${record.distance}m traveled · ${record.seconds}s`);}
  summary(){
    const el=document.getElementById('journey-summary');if(el)write(el,copy(
      `기초 안내 ${this.progress.data.lesson}/${LESSONS.length} · 탐험 임무 ${this.progress.data.completed}회 완료`,
      `Lessons ${this.progress.data.lesson}/${LESSONS.length} · ${this.progress.data.completed} exploration missions completed`));
    const last=this.progress.data.last,result=document.getElementById('journey-result');
    if(result)write(result,last?copy('최근 완료: ','Last completed: ')+this.resultText(last):'');
    const repeat=document.getElementById('btn-mission-repeat');if(repeat)repeat.disabled=!last;
    const retry=document.getElementById('btn-mission-retry');if(retry)retry.hidden=!this.pendingType&&!targetedMission(this.mission?.type);
  }
  get target(){return missionTarget(this.mission);}
  feedback(message){const el=document.getElementById('journey-feedback');if(el)write(el,message);if(message)this.game.showNotice(message);}
  start(type){
    this.feedback('');
    const g=this.game;if(!this.solo()||!g.assetsReady)return this.feedback(copy('혼자 플레이에서 사용할 수 있습니다.','Available during solo play.'));
    if(!MISSION_TYPES.includes(type))return;
    let points=[];
    if(targetedMission(type)){
      // Reuse the existing terrain-aware spawn sampler, then verify support.
      const candidates=g.city?.rooftopSpawns?.length?g.city.rooftopSpawns:g.multiplayer.pursuitPoints(g.physics.position);
      points=candidates.filter(p=>Math.hypot(p.x-g.physics.position.x,p.z-g.physics.position.z)>25).filter(p=>p.y>8&&g.experience.safe(new THREE.Vector3(p.x,p.y,p.z)))
        .filter((p,i,all)=>all.findIndex(q=>Math.hypot(q.x-p.x,q.z-p.z)<15)===i).sort((a,b)=>g.physics.position.distanceToSquared(new THREE.Vector3(a.x,a.y,a.z))-g.physics.position.distanceToSquared(new THREE.Vector3(b.x,b.y,b.z))).slice(0,3);
      const required=type==='delivery'?2:3;
      if(points.length<required){
        this.pendingType=type;this.summary();
        return this.feedback(copy(`안전한 옥상 ${required}곳이 필요합니다. 지형이 준비되면 ‘목표 다시 준비’를 누르거나 도시 순찰을 선택하세요.`,`Need ${required} safe rooftops. Use “Prepare targets again” after terrain loads, or choose City patrol.`));
      }
      points=points.slice(0,required);
    }
    this.cancel('replaced');g.practice?.stop();g.experience?.study?.endLesson('dismissed');this.progress.dismiss();
    this.mission=createMission(type,g.experience.city,g.physics.position,points);
    g.experience?.study?.startMission(type);
    this.resetSample();this.resume();this.render();
  }
  update(dt){
    const g=this.game,active=this.solo()&&g.isPlaying&&!g.isPaused&&!g.contextLost&&!g.gameplaySuspended&&!g.multiplayer.spectating&&!document.hidden;
    if(!active){this.panel.hidden=true;if(this.marker)this.marker.visible=false;this.resetSample();
      if(!this.solo()){this.cancel('left-solo');g.experience?.study?.endLesson('dismissed');}this.active=false;return;}
    if(!this.active)this.resetSample();this.active=true;
    const validDt=Number.isFinite(dt)&&dt>0&&dt<=.25;
    if(!validDt)this.resetSample();
    if(validDt&&this.resultTime>0)this.resultTime=Math.max(0,this.resultTime-dt);
    if(!this.progress.data.dismissed)g.experience?.study?.lesson(LESSONS[this.progress.data.lesson]);
    const p=g.physics,result=this.progress.observe({position:p.position,state:p.state,webs:p.webs?.length,hits:g.combat.hits},dt),m=this.mission;
    if(result.advanced){if(this.progress.data.lesson===LESSONS.length)g.experience?.study?.endLesson('completed');else g.experience?.study?.lesson(LESSONS[this.progress.data.lesson]);}
    if(result.advanced){this.summary();this.render();if(this.progress.data.lesson===LESSONS.length)g.showNotice(copy('기초 안내 완료! 메뉴에서 탐험 임무를 선택해 보세요.','Getting started complete! Choose an exploration mission in the menu.'));}
    if(m){
      if(m.city!==g.experience.city){this.cancel();return;}
      if(!g.practice?.active&&validDt){
        const before=m.index;
        const needsSupport=(targetedMission(m.type)||m.type==='technique')&&GROUNDED.includes(p.state);
        const done=advanceMission(m,{position:p.position,state:p.state,webs:p.webs?.length,distance:result.distance,safe:needsSupport&&g.experience.safe(p.position)},dt);
        if(m.index!==before&&!done){g.audio?.tone?.(440,.1,.04);g.showNotice(m.type==='delivery'?copy('물품 회수 완료. 다음 표식으로 배달하세요.','Package collected. Deliver it to the next marker.'):copy('단계 완료! 다음 목표로 이동하세요.','Stage complete! Continue to the next objective.'));}
        if(done){
          const record=completionRecord(m);
          this.progress.data.completed=Math.min(1000000,this.progress.data.completed+1);this.progress.data.last=record;
          const saved=this.progress.save();g.experience?.study?.endMission('completed');this.cancel();this.resultTime=10;this.summary();
          g.audio?.tone?.(660,.22,.05);
          g.showNotice(copy('탐험 임무 완료! ','Mission complete! ')+this.resultText(record)+(saved?'':copy(' · 기록을 저장하지 못했습니다.',' · Could not save this result.')));
          this.render();
        }
      }else if(g.practice?.active)this.resetSample();
    }
    this.uiTime+=validDt?dt:0;if(this.uiTime>.2){this.uiTime=0;this.render();}
    this.updateMarker();
  }
  updateMarker(){
    const target=this.target;
    if(!target){if(this.marker)this.marker.visible=false;return;}
    if(!this.marker){this.marker=new THREE.Mesh(new THREE.OctahedronGeometry(1.1),new THREE.MeshBasicMaterial({color:0xe5b46a,wireframe:true,depthTest:true,transparent:true,depthWrite:false}));this.game.scene.add(this.marker);}
    this.marker.position.set(target.x,target.y+2.4,target.z);
    const p=this.game.physics.position;
    const fade=THREE.MathUtils.smoothstep(Math.hypot(p.x-target.x,p.y-target.y,p.z-target.z),16,36);
    this.marker.material.opacity=fade;this.marker.visible=fade>0.04;
  }
  render(){
    this.summary();const g=this.game,m=this.mission,lesson=LESSONS[this.progress.data.lesson];
    this.panel.hidden=!this.solo()||!g.isPlaying||g.isPaused||g.gameplaySuspended||(!m&&!this.resultTime&&(!lesson||this.progress.data.dismissed));
    if(this.panel.hidden)return;
    const showRange=text=>write(this.range,text||'');
    if(!m&&this.resultTime>0&&this.progress.data.last){write(this.title,copy('탐험 임무 완료','Mission complete'));write(this.detail,this.resultText(this.progress.data.last)+copy(' · 메뉴에서 다시 도전할 수 있습니다.',' · Play again from the menu.'));this.meter.value=1;showRange('');return;}
    if(m){
      if(g.practice?.active){write(this.title,copy('임무 일시정지','Mission paused'));write(this.detail,copy('전투 연습을 종료하면 임무를 이어갑니다.','Finish combat practice to continue the mission.'));showRange('');return;}
      write(this.title,this.missionName(m.type));let value=missionFraction(m);showRange('');
      if(targetedMission(m.type)){const p=m.points[m.index],distance=p?Math.round(g.physics.position.distanceTo(new THREE.Vector3(p.x,p.y,p.z))):0;showRange(`${distance} m`);
        const bearing=p?copy(['북','북동','동','남동','남','남서','서','북서'][(Math.round(Math.atan2(g.physics.position.x-p.x,p.z-g.physics.position.z)/(Math.PI/4))+8)%8],['N','NE','E','SE','S','SW','W','NW'][(Math.round(Math.atan2(g.physics.position.x-p.x,p.z-g.physics.position.z)/(Math.PI/4))+8)%8]):'';
        write(this.detail,copy(`${m.index}/${m.points.length} · ${m.type==='delivery'?copy(m.index?'배달':'회수',m.index?'Deliver':'Collect'):''} ${bearing} ${distance}m · 고도 ${Math.round(p?.y||0)}m · 표식 곁에 착지하세요`,`${m.index}/${m.points.length} · ${m.type==='delivery'?copy(m.index?'배달':'회수',m.index?'Deliver':'Collect'):''} ${bearing} ${distance}m · Altitude ${Math.round(p?.y||0)}m · Land beside the marker`));}
      if(m.type==='discover'){write(this.detail,copy(`${m.found.size}/3 · 출발 구역 밖의 서로 다른 구역을 방문하세요. 이전 방문 구역도 가능합니다.`,`${m.found.size}/3 · Visit distinct districts outside your starting district. Revisits count on each outing.`));}
      if(m.type==='travel'){write(this.detail,copy(`${Math.floor(m.distance)}/500m · 원하는 방법으로 도시를 이동하세요`,`${Math.floor(m.distance)}/500m · Travel through the city your way`));value=m.distance/500;}
      if(m.type==='technique')write(this.detail,[
        copy(`1/3 · 줄에 매달려 3초 연속 스윙 (${m.skillTime.toFixed(1)}/3초)`,`1/3 · Swing continuously for 3s (${m.skillTime.toFixed(1)}/3s)`),
        copy(`2/3 · 벽 이동 또는 턱 오르기 1초 (${m.skillTime.toFixed(1)}/1초)`,`2/3 · Wall run or mantle for 1s (${m.skillTime.toFixed(1)}/1s)`),
        copy('3/3 · 안전한 바닥에 착지하세요','3/3 · Land on safe solid ground'),
      ][m.index]||'');
      this.meter.value=value;return;
    }
    const b=g.preferences.values.settings.bindings,touch=g.touchControls?.enabled,pad=g.gamepad?.lastPad!=null;
    const key=(name,touchLabel,padLabel)=>touch?touchLabel:pad?padLabel:keyLabel(b[name]);
    const hints={
      walk:copy(`${key('forward','왼쪽 스틱','왼쪽 스틱')} · 20m 이동하세요 (${Math.min(20,Math.floor(this.progress.walk))}/20m)`,`${key('forward','Left stick','Left stick')}: travel 20m (${Math.min(20,Math.floor(this.progress.walk))}/20m)`),
      jump:copy(`${key('jump','점프 버튼','A')} · 점프하세요`,`${key('jump','Jump button','A')}: jump`),
      swing:copy(`${key('mode','더보기 → 모드','Y')}로 와이어 모드 · ${touch?'에너지 와이어를 한 번 눌러':pad?'RT를 유지해':'높은 건물에 조준하고 좌클릭을 유지해'} 2초 스윙하세요`,`${key('mode','More → Mode','Y')}: wire mode · ${touch?'Tap Energy Wire once':pad?'Hold RT':'Aim high and hold left click'} to swing for 2s`),
      land:copy(`${key('jump','점프 버튼','A')}로 에너지 와이어에서 뛰어내려 바닥에 착지하세요`,`${key('jump','Jump button','A')}: leap off the energy wire and land on solid ground`),
      wall:copy(`벽에 다가가 ${key('wall','더보기 → 벽 이동','방향키 위')}와 전진을 유지하세요`, `Approach a wall; hold ${key('wall','More → Wall','D-pad up')} and move forward`),
      hit:copy('메뉴 → 탐험 안내 → 훈련 표적을 시작하고 가까이서 공격을 명중시키세요','Menu → Exploration → Start training target, approach and land a hit'),
    };
    showRange('');
    write(this.title,copy(`기초 안내 ${this.progress.data.lesson+1}/${LESSONS.length}`,`Getting started ${this.progress.data.lesson+1}/${LESSONS.length}`));
    write(this.detail,hints[lesson]);this.meter.value=this.progress.data.lesson/LESSONS.length;
  }
}
