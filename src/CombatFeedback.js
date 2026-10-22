import * as THREE from 'three';
import {canAttack,isCombatMode} from './AttackRules.js';
import {GROUNDED} from './MotionCatalog.js';
import {MATCH} from './MatchRules.js';

// Predictions explain availability. Only a server hit event confirms damage.
export class CombatFeedback {
  constructor(game){this.game=game;this.cooldowns={};this.until=0;this.message='';}
  show(message,confirmed=false){
    this.message=message;this.until=performance.now()+(confirmed?850:650);
    this.game.showNotice?.(message);
    if(confirmed){this.game.audio?.playCombatHit?.(false);this.game.tpsCamera?.triggerShake?.(.12);}
  }
  element(){
    if(!this.output && typeof document!=='undefined' && document.body?.append){
      this.output=document.createElement('output');this.output.id='combat-feedback';this.output.setAttribute('role','status');
      document.body.append(this.output);
      this.aimZone=document.createElement('div');this.aimZone.id='combat-aim-zone';this.aimZone.hidden=true;this.aimZone.setAttribute('aria-hidden','true');document.body.append(this.aimZone);
      this.marker=document.createElement('span');this.marker.id='combat-hitmarker';this.marker.textContent='×';this.marker.hidden=true;this.marker.setAttribute('aria-hidden','true');document.body.append(this.marker);
    }
    return this.output;
  }
  update(online){
    const out=this.element();if(!out)return;
    const me=online.players.find(p=>p.id===online.id);
    const active=online.room?.phase==='playing' && isCombatMode(online.room.mode) && !online.spectating;
    const kind=this.game.combat?.mode==='combat'?'punch':'web';
    out.hidden=!active;if(this.aimZone)this.aimZone.hidden=!active||kind!=='web'||!canAttack(online.room,me);if(!active)return;
    const now=performance.now();
    if(this.pendingUntil && now>this.pendingUntil){this.pendingUntil=0;this.show('아직 명중 확인 없음 · 거리·높이·가림·연결 상태를 확인하세요');}
    const grace=Math.max(0,(online.vulnerableAt||0)-online.serverNow());
    if(now>(this.previewAt||0)){this.preview=canAttack(online.room,me)?online.attackPreview?.(kind):null;this.previewAt=now+100;}
    if(this.aimZone)this.aimZone.dataset.ready=String(!!this.preview?.aimReady&&!this.preview?.blocked&&!grace);
    if(now<this.until){out.textContent=this.message;return;}
    if(this.game.combat?.blocking){out.textContent=online.serverCapabilities?.includes('directional-guard')
      ?`정면 방어 중 · 지상 좌우 60° · 피해 60% 감소 · 주먹 10 / 와이어 6 · 후방·공중 미적용`
      :'방어 자세 · 서버 방어 기능 업데이트 대기';return;}
    if(!canAttack(online.room,me)){out.textContent=`내 HP ${me.health}/100 · 경찰의 주먹 25 / 거미줄 15 · B 지상 정면 방어: 10 / 6 피해 · 벽 뒤 피해 없음`;return;}
    if(kind==='punch'&&!GROUNDED.includes(this.game.physics?.state)){out.textContent='전투 모드 · 착지 후 주먹 공격 · 와이어는 Q로 모드 전환 후 사용';return;}
    if(grace){out.textContent=`시작 보호 ${Math.ceil(grace/1000)}초 · 아직 피해 없음`;return;}
    const remain=Math.max(0,(this.cooldowns[kind]||0)-now);
    const target=this.preview;
    const aim=target?.blocked?'가림':target?`${target.name} · HP ${target.player?.health??'?'} · ${target.distance.toFixed(1)}m · ${target.aimReady===false?'표시 영역에 상대 몸 중심을 넣으세요':'조준 가능 · 서버 확인 전'}`:'조준점에 상대 없음';
    const rule=MATCH[kind];
    out.textContent=`${kind==='web'?'거미줄':'주먹'} ${remain?`${(remain/1000).toFixed(1)}초 대기`:'준비'} · ${aim} | 수평 ≤${rule.reach}m · 높이 ≤${rule.vertical}m · 좌우 ${kind==='web'?33:49}° · ${rule.damage} 피해 · 간격 ${(rule.cooldown/1000).toFixed(2)}초 · 벽 뒤·아군 피해 없음`;
  }
  canFire(kind,online){
    if((online.vulnerableAt||0)>online.serverNow()){this.show('시작 보호 중 · 보호 시간이 끝난 뒤 공격하세요');return false;}
    const now=performance.now(),remain=(this.cooldowns[kind]||0)-now;
    if(remain>0){this.show(`${kind==='web'?'에너지 와이어':'주먹'} 재사용까지 ${(remain/1000).toFixed(1)}초`);return false;}
    this.cooldowns[kind]=now+MATCH[kind].cooldown;return true;
  }
  sent(kind,target,hand='left'){
    this.pendingUntil=target?performance.now()+1400:0;
    if(kind==='web' && target && [target.x,target.y,target.z].every(Number.isFinite)){
      this.game.character?.cancelAirTrick?.();
      // The existing per-hand renderer owns this transient shot as well;
      // do not draw a second strand over the same hand/target segment.
      this.game.character?.fireWebMiss?.(new THREE.Vector3(target.x,target.y+1,target.z),hand);
    }
    this.show(target?`${kind==='web'?'에너지 와이어':'주먹'} → ${target.name||'상대'} · 서버 판정 중`:'정면 범위에 상대 없음 · 거리·높이·방향을 확인하세요');}
  hit(data,player){
    this.pendingUntil=0;
    const damage=data.damage ?? MATCH[data.kind]?.damage ?? 0;
    this.show(`${data.blocked?'상대 정면 방어 · ':''}${data.kind==='web'?'에너지 와이어':'주먹'} 명중 −${damage} · 상대 HP ${data.health}`,true);
    const out=this.element();if(out){out.classList.add('confirmed');if(this.marker)this.marker.hidden=false;clearTimeout(this.flash);this.flash=setTimeout(()=>{out.classList.remove('confirmed');if(this.marker)this.marker.hidden=true;},450);}
    if(player)this.game.vfx?.spawnWebImpact?.(new THREE.Vector3(player.x,player.y+1,player.z));
  }
}
