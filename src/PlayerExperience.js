import * as THREE from 'three';
import {GROUNDED} from './MotionCatalog.js';
import {Progression} from './Progression.js';
import {RaceGhost} from './RaceGhost.js';
import {PerformanceBudget} from './PerformanceBudget.js';
import {keyLabel} from './PlayerSettings.js';
export class PlayerExperience {
  constructor(game,storage) {
    this.game=game;game.progression=new Progression(storage);this.saveTime=0;this.previewTime=0;this.visitTime=0;
    this.ghost=new RaceGhost(game.scene);this.performance=new PerformanceBudget();this.performanceActive=false;
    const geometry=new THREE.BufferGeometry().setFromPoints(Array.from({length:17},()=>new THREE.Vector3()));
    this.trajectory=new THREE.Line(geometry,new THREE.LineDashedMaterial({color:0x94f7e0,dashSize:1,gapSize:.8,transparent:true,opacity:.65}));
    this.trajectory.frustumCulled=false;this.trajectory.visible=false;game.scene.add(this.trajectory);
    const previousLanding=game.physics.onLanding;
    game.physics.onLanding=(position,impact,normal)=>{previousLanding?.(position,impact,normal);game.audio.playSurfaceStep?.('landing',Math.min(1,impact/30));};
    const previousRecovery=game.physics.onRecovery;
    game.physics.onRecovery=reason=>{game.progression.resetTravel();this.ghost.stop();previousRecovery?.(reason);};
    const previousReset=game.physics.onReset;
    game.physics.onReset=()=>{game.progression.resetTravel();previousReset?.();};
    game.physics.onStuntCallback=(name,points)=>{if(!points)game.showNotice(name);};
    game.character.onAirTrickComplete=()=>{};
    game.combat.onHit=damage=>{game.tpsCamera.triggerShake(damage>=24?.16:.08);};
    game.physics.onWebFailure=reason=>{if(performance.now()>(this.lastFailure||0)+800){game.showNotice(reason);game.audio.playWebFailure?.();this.lastFailure=performance.now();}};
    document.getElementById('btn-save-position')?.addEventListener('click',()=>this.savePosition());
    document.getElementById('btn-restore-position')?.addEventListener('click',()=>this.restorePosition(true));
    this.refreshProgress();
    window.addEventListener('pagehide',()=>game.progression.save());
  }
  get city(){return this.game.city.isStreamed?'hong-kong':'procedural';}
  safe(position) {
    const limit=this.game.city.playableHalfExtent || 2400;
    if(![position.x,position.y,position.z].every(Number.isFinite) || Math.abs(position.x)>limit-2 || Math.abs(position.z)>limit-2)return false;
    const g=this.game,support=g.physics.supportHeight(position);
    if(!Number.isFinite(support)||Math.abs(position.y-support-.1)>.7)return false;
    const offsets=[[.35,0],[-.35,0],[0,.35],[0,-.35]];
    for(const [x,z]of offsets){const h=g.physics.supportHeight(position.clone().add(new THREE.Vector3(x,0,z)));if(!Number.isFinite(h)||Math.abs(h-support)>.65)return false;}
    for(const dir of [new THREE.Vector3(0,1,0),new THREE.Vector3(1,0,0),new THREE.Vector3(-1,0,0),new THREE.Vector3(0,0,1),new THREE.Vector3(0,0,-1)])
      if(g.city.raycast?.(position.clone().add(new THREE.Vector3(0,.8,0)),dir,dir.y?1.05:.35))return false;
    return true;
  }
  savePosition(){const g=this.game;if(g.multiplayer?.room)return g.showNotice('온라인 경기에서는 위치를 저장하지 않습니다.');
    if(!GROUNDED.includes(g.physics.state)||!this.safe(g.physics.position))return g.showNotice('충분한 바닥과 머리 공간이 있는 곳에 서서 저장하세요.');
    g.progression.data.safe[this.city]=g.physics.position.toArray();g.progression.dirty=true;
    g.showNotice(g.progression.save()?'안전 위치를 저장했습니다.':'저장 공간을 사용할 수 없습니다.');this.refreshProgress();}
  restorePosition(explicit=false){const g=this.game;if(g.multiplayer?.room)return false;
    const saved=g.progression.data.safe[this.city];if(!saved){if(explicit)g.showNotice('이 지도에 저장된 위치가 없습니다.');return false;}
    const position=new THREE.Vector3().fromArray(saved);
    if(!this.safe(position)){if(explicit)g.showNotice('저장 위치의 지형이 준비되지 않았거나 안전하지 않습니다. 현재 위치를 유지합니다.');return false;}
    g.timeTrial.stop();this.ghost.stop();g.updateTrialHUD();
    g.clearInput();g.physics.resetPosition();g.physics.position.copy(position);g.physics.previousFixedPosition.copy(position);g.physics.renderPosition.copy(position);g.physics.velocity.set(0,0,0);g.physics.state='IDLE';g.resetCamera();
    if(explicit)g.showNotice('저장 위치로 돌아왔습니다.');return true;}
  refreshProgress(){const g=this.game,d=g.progression.data,summary=document.getElementById('progress-summary');
    if(summary)summary.textContent=`탐험 ${d.discoveries.length}구역 · 이동 ${(d.distance/1000).toFixed(1)}km`;
    const select=document.getElementById('web-theme');if(select){select.replaceChildren();for(const r of [{id:'white',label:'기본 흰색'},...g.progression.unlocked]){const option=document.createElement('option');option.value=r.id;option.textContent=r.label;select.append(option);}select.value=d.theme;}
  }
  raceStarted(){const g=this.game;g.progression.resetTravel();this.ghost.start(g.timeTrial.courseId,g.progression,g.physics.position,g.physics.facingAngle);}
  raceFinished(result){const g=this.game,trial=g.timeTrial;
    this.ghost.finish(trial,result.finishPosition || g.physics.position,g.physics.facingAngle);
    let distance=0;let previous=g.city.getRooftopSpawn(95);for(const cp of trial.checkpoints){distance+=previous.distanceTo(cp.position);previous=cp.position;}
    const benchmark=Math.max(12,distance/9);const medal=result.totalTime<=benchmark?'gold':result.totalTime<=benchmark*1.35?'silver':'bronze';
    g.progression.recordGhost(trial.courseId,result.totalTime,this.ghost.samples,this.ghost.splits,medal);this.refreshProgress();this.ghost.stop();
    return {medal:{gold:'금',silver:'은',bronze:'동'}[medal],delta:this.ghost.splitDelta};}
  update(delta,elapsed) {
    const g=this.game,p=g.physics,s=g.preferences.values.settings,active=g.isPlaying&&!g.isPaused&&!g.multiplayer?.spectating&&!g.gameplaySuspended;
    const ceiling={low:1,balanced:1.5,high:2}[g.preferences.values.quality];
    // Menus and hidden tabs are not gameplay performance samples. Preserve
    // the applied resolution while discarding stale pressure on transitions.
    if(this.performanceActive!==active){this.performance.reset?.(this.performance.level);this.performanceActive=active;}
    const budget=active?this.performance.update(elapsed,s.autoQuality,ceiling):null;
    if(budget!==null)g.renderer.setPixelRatio(Math.min(window.devicePixelRatio,budget));
    if(!active){this.ghost.mesh.visible=false;this.trajectory.visible=false;const preview=document.getElementById('anchor-preview');if(preview)preview.style.display='none';return;}
    this.ghost.update(g.timeTrial,p.position,p.facingAngle,s.ghost);
    this.visitTime+=delta;this.saveTime+=delta;
    if(this.visitTime>.5){this.visitTime=0;if(!g.multiplayer?.room){g.progression.visit(p.position,this.city,GROUNDED.includes(p.state)&&this.safe(p.position));}}
    if(this.saveTime>10){this.saveTime=0;if(!g.progression.save()&&!this.warnedStorage){this.warnedStorage=true;g.showNotice('탐험 기록을 저장할 수 없어 이번 실행에만 적용됩니다.');}this.refreshProgress();}

    const limit=g.multiplayer?.arena?.radius || g.city.playableHalfExtent || 2400;
    const center=g.multiplayer?.arena || {x:0,z:0},distance=g.multiplayer?.arena?Math.hypot(p.position.x-center.x,p.position.z-center.z):Math.max(Math.abs(p.position.x),Math.abs(p.position.z));
    const remaining=Math.min(limit-distance,(g.city.playableHalfExtent||2400)-Math.max(Math.abs(p.position.x),Math.abs(p.position.z))),warning=document.getElementById('boundary-warning');
    const warningDistance=Math.min(65,(g.city.playableHalfExtent||2400)*.15,limit*.15);
    if(warning)warning.textContent=remaining<warningDistance?`구역 경계 ${Math.max(0,Math.round(remaining))}m · 중심 방향으로 돌아가세요`:'';
    this.previewTime+=delta;if(this.previewTime>.1){this.previewTime=0;this.previewAnchor();}
    this.trajectory.visible=s.trajectory&&!g.multiplayer?.room&&!GROUNDED.includes(p.state);
    if(this.trajectory.visible){const attr=this.trajectory.geometry.attributes.position;
      let previous=p.position.clone().add(new THREE.Vector3(0,.9,0)),stop=null;
      for(let i=0;i<attr.count;i++){const t=i/16*.8,point=p.position.clone().addScaledVector(p.velocity,t);point.y+=.9-.5*p.gravity*t*t;
        const segment=point.clone().sub(previous),length=segment.length();
        if(!stop&&length>0){const hit=g.city.raycast?.(previous,segment.clone().normalize(),length);if(hit)stop=hit.point?.clone()||previous.clone().addScaledVector(segment.normalize(),hit.distance);}
        const visible=stop||point;attr.setXYZ(i,visible.x,visible.y,visible.z);previous=visible;}
      attr.needsUpdate=true;this.trajectory.computeLineDistances();}
    const grounded=GROUNDED.includes(p.state),mode=grounded&&g.combat.mode==='combat';
    document.body.classList.toggle('hud-combat',mode);document.body.classList.toggle('hud-quiet',!mode&&!g.timeTrial.isActive);
    if(grounded&&p.velocity.length()>1){this.stepTime=(this.stepTime||0)+delta;if(this.stepTime>(p.velocity.length()>5?.27:.4)){this.stepTime=0;g.audio.playSurfaceStep?.(p.position.y>8?'roof':'street',.35);}}
    g.audio.updateMusic?.(delta,!!g.multiplayer?.room||g.timeTrial.isActive);
  }
  previewAnchor(){const g=this.game,p=g.physics,marker=document.getElementById('anchor-preview'),hands=document.getElementById('hand-status');
    const inCombat=GROUNDED.includes(p.state)&&g.combat.mode==='combat';
    const zipStatus=GROUNDED.includes(p.state)?'집: 공중 전용':p.state==='WEB_ZIP'?'집 이동 중':p.zipCooldown>0?'집 대기':'집 준비';
    if(hands)hands.textContent=inCombat?`지상 전투 · ${keyLabel(g.preferences.values.settings.bindings.guard)} 방어`:
      `${p.webs.some(w=>w.button===0)?'좌클릭 연결':'좌클릭 준비'} · ${p.webs.some(w=>w.button===2)?'우클릭 연결':'우클릭 준비'} · ${zipStatus}`;
    // Availability belongs on the fixed reticle, not a moving world marker.
    g.crosshair?.classList.toggle('aiming',!inCombat && !!p.bestAnchorCandidate);
    if(marker)marker.style.display='none';
  }
}
