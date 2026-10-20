import * as THREE from 'three';
import {CombatFeedback} from './CombatFeedback.js';
import {attackGate,canAttack,opponents,teamName,ATTACK_REASONS,isCombatMode} from './AttackRules.js';
import {webTargetInReticle} from './CombatAim.js';
import { MATCH, resolveMatchSpawn, teamOffset } from './MatchRules.js';
import { SupabaseRooms } from './SupabaseRooms.js';
import { RemoteMotion, capturePose, sanitizePose } from './RemoteMotion.js';
import { ATTACKS } from './Combat.js';
import {PURSUIT,arenaContains} from './PursuitRules.js';
import {PlayerPositionMarkers} from './PlayerPositionMarkers.js';

const $ = id => document.getElementById(id);
const label = mode => mode === 'tag' ? '경찰과 도망자' : mode==='custom'?'사용자 설정 경기':'자유 플레이';
const make = (tag, className, value) => { const el=document.createElement(tag);el.className=className;el.textContent=value;return el; };

export class Multiplayer {
  constructor(game) {
    this.game=game;this.feedback=new CombatFeedback(game);this.ws=null;this.id=null;this.room=null;this.solo=false;this.players=[];this.avatars=new Map();this.lastSend=0;this.lastPhase=null;this.spectating=false;this.clockOffset=0;this.vulnerableAt=0;this.arena=null;this.pulseUntil=0;this.spectateIndex=0;
    this.downedMarkers=new Map();this.connect();this.bind();
    this.positionMarkers=new PlayerPositionMarkers(game);
  }
  send(data) {
    if(this.ws instanceof SupabaseRooms && data.type==='create'&&data.mode==='custom'){this.game.showNotice('사용자 설정 경기는 전용 방 서버 연결이 필요합니다.');return false;}
    if(data.type==='create'&&data.mode==='custom'&&!(this.ws instanceof SupabaseRooms)&&!this.serverCapabilities?.includes('custom-matches')){this.game.showNotice('방 서버 업데이트 또는 연결을 기다리는 중입니다. 잠시 후 다시 시도하세요.');return false;}
    if(this.ws?.readyState===WebSocket.OPEN){this.ws.send(JSON.stringify(data));return true;}
    if(['create','join'].includes(data.type))this.game.showNotice('방 서버에 연결되지 않았습니다. 서버 주소와 실행 상태를 확인하세요.');
    return false;
  }
  connect() {
    // A static frontend can use a separately hosted room server. Local dev
    // keeps using the same-origin /ws endpoint when no URL is configured.
    const url=import.meta.env.VITE_WS_URL?.trim() || `${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws`;
    const useSupabase=!import.meta.env.VITE_WS_URL && (import.meta.env.PROD || import.meta.env.VITE_SUPABASE_URL);
    try {this.ws=useSupabase?new SupabaseRooms():new WebSocket(url);}
    catch {
      $('online-status').textContent='방 서버 주소를 확인하세요';
      return;
    }
    $('online-status').textContent='서버 연결 중…';
    this.serverCapabilities=null;
    const socket=this.ws;
    this.ws.onopen=()=>{
      if(this.ws!==socket)return;
      if(this.solo)this.send({type:'leave'});
      else if(!(socket instanceof SupabaseRooms)){
        try{const saved=JSON.parse(sessionStorage.getItem('web-runner-room-resume')||'null');if(saved?.token)this.send({type:'resume',...saved});}catch{}
      }
      $('online-status').textContent='온라인 · 방을 선택하세요';this.send({type:'list'});
      const pending=new URLSearchParams(location.search).get('join');
      if(pending){
        let playerName=$('player-name').value;try{playerName=sessionStorage.getItem('online-name')||playerName;}catch{}
        if(!this.solo && pending.toUpperCase()!==socket.resumedCode)this.send({type:'join',code:pending,playerName,city:this.city});
        const url=new URL(location.href);url.searchParams.delete('join');history.replaceState(null,'',url.pathname+url.search+url.hash);
      }
    };
    this.ws.onmessage=event=>{if(this.ws!==socket)return;try{this.message(JSON.parse(event.data));}catch(error){console.error(error);}};
    this.ws.onclose=()=>{
      if(this.ws!==socket)return;
      $('online-status').textContent=this.ws?.fatal?'방 연결 설정을 확인하세요':'연결이 끊겼습니다. 다시 연결 중…';
      this.room=null;this.id=null;this.players=[];this.lastPhase=null;this.setSpectating(false);this.pendingPunch=null;this.arena=null;this.pulseUntil=0;
      clearInterval(this.beginTimer);this.beginTimer=null;this.clearAvatars();this.render();
      if(!this.solo){this.game.isPlaying=false;this.game.clearInput();this.game.setPaused(true);}
      if(!this.ws?.fatal)setTimeout(()=>this.connect(),2500);
    };
  }
  bind() {
    $('play-solo').addEventListener('click',()=>this.beginSolo());
    document.querySelectorAll('.mode-option').forEach(button=>button.addEventListener('click',()=>{
      $('room-mode').value=button.dataset.mode;
      $('custom-options').classList.toggle('hidden',button.dataset.mode!=='custom');
      document.querySelectorAll('.mode-option').forEach(option=>{
        const selected=option===button;
        option.classList.toggle('selected',selected);
        option.setAttribute('aria-selected',String(selected));
      });
    }));
    $('create-room').addEventListener('click',()=>this.send({type:'create',name:$('room-name').value,playerName:$('player-name').value,capacity:Number($('room-capacity').value),mode:$('room-mode').value,format:$('custom-format').value,city:this.city,enhanced:$('room-mode').value==='tag'}));
    $('join-code').addEventListener('click',()=>this.join($('room-code').value));
    $('room-code').addEventListener('keydown',e=>{if(e.key==='Enter')$('join-code').click();});
    $('room-ready').addEventListener('click',()=>{const me=this.players.find(p=>p.id===this.id);const spawn=this.game.city.getRooftopSpawn(95);this.send({type:'ready',ready:!me?.ready,terrainReady:!!this.game.assetsReady,spawn:{x:spawn.x,y:spawn.y,z:spawn.z},roofs:this.pursuitPoints(spawn)});});
    $('room-start').addEventListener('click',()=>this.send({type:'start'}));
    $('room-rematch').addEventListener('click',()=>this.send({type:'rematch'}));
    $('room-leave').addEventListener('click',()=>{this.send({type:'leave'});this.leaveLocal();});
    $('btn-leave-match').addEventListener('click',()=>{if(this.room)this.send({type:'leave'});this.leaveLocal();});
    $('room-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(this.room?.code||'');this.game.showNotice('방 코드를 복사했습니다.');}catch{this.game.showNotice(`방 코드: ${this.room?.code||''}`);}});
    $('room-invite').addEventListener('click',async()=>{const url=new URL(location.href);url.searchParams.set('join',this.room.code);url.searchParams.set('city',this.room.city);try{await navigator.clipboard.writeText(url.href);this.game.showNotice('초대 링크를 복사했습니다. 친구에게 보내세요.');}catch{this.game.showNotice(`초대 코드: ${this.room.code}`);}});
    $('spectate-next')?.addEventListener('click',()=>{this.spectateIndex++;});
    $('match-help').addEventListener('click',()=>this.game.toggleHelp());
  }
  pursuitPoints(spawn) {
    const game=this.game,city=game.city,points=[];
    const candidates=(city.rooftopSpawns||[]).filter(p=>Math.hypot(p.x-spawn.x,p.z-spawn.z)>25&&Math.hypot(p.x-spawn.x,p.z-spawn.z)<(city.isStreamed?425:275)).map(p=>p.clone());
    if(city.isStreamed)for(const radius of [55,90,140,200])for(let i=0;i<12;i++){
      const point=spawn.clone().add(new THREE.Vector3(Math.sin(i/12*Math.PI*2)*radius,0,Math.cos(i/12*Math.PI*2)*radius));
      const height=city.collisionWorld.groundAt(new THREE.Vector3(point.x,600,point.z),700);
      if(Number.isFinite(height)){point.y=height+.1;candidates.push(point);}
    }
    for(const point of candidates){if(points.length>=12)break;if(game.experience.safe(point))points.push({x:point.x,y:point.y,z:point.z});}
    return points;
  }
  message(data) {
    if(data.type==='welcome'){this.serverCapabilities=Array.isArray(data.features)?data.features:[];return;}
    // An explicit solo choice wins over a delayed resume or room response.
    if(this.solo && !['error','rooms','pong','left'].includes(data.type))return;
    if(data.type==='error')return this.game.showNotice(data.message);
    if(data.type==='switch-city')return this.switchCity(data.code,data.city);
    if(data.type==='rooms')return this.renderList(data.rooms);
    if(data.type==='joined'){this.id=data.id;if(data.resumeToken)try{sessionStorage.setItem('web-runner-room-resume',JSON.stringify({code:data.code,token:data.resumeToken}));}catch{}return;}
    if(data.type==='pong'){this.latency=Math.max(0,performance.now()-data.stamp);return;}
    if(data.type==='correction'){
      if(this.room?.phase==='playing' && !this.solo && !this.spectating)this.applyServerPosition(data);
      return;
    }
    if(data.type==='attack-result'){this.feedback.pendingUntil=0;this.feedback.show(`빗나감 · ${ATTACK_REASONS[data.reason]||'서버에서 명중하지 않음'}`);return;}
    if(data.type==='hit-check')return; // Legacy defender claims never authorize damage.

    // Explicit leave already resets the local room. Its asynchronous reply
    // must not tear down a solo session started while that reply was in flight.
    if(data.type==='left')return this.room||this.id ? this.leaveLocal() : undefined;
    if(data.type==='pose') {
      const avatar=this.avatars.get(data.id),player=this.players.find(p=>p.id===data.id);
      if(avatar && player)avatar.receive(player,sanitizePose(data.pose));
      return;
    }
    if(data.type==='room') {
      const phaseChanged=data.room.phase!==this.lastPhase;
      this.room=data.room;this.players=data.players;this.host=data.host;this.endsAt=data.endsAt;this.winner=data.winner;
      this.spawnAnchor=data.spawnAnchor||null;this.vulnerableAt=data.vulnerableAt || 0;this.arena=data.arena||null;this.pulseUntil=data.pulseUntil||0;
      if(Number.isFinite(data.serverNow))this.clockOffset=data.serverNow-Date.now();
      this.lastPhase=data.room.phase;
      if(data.room.phase!=='playing')this.setSpectating(false);
      else {
        const me=this.players.find(p=>p.id===this.id);
        if(me?.eliminated && !this.spectating){
          this.setSpectating(true);
          this.game.physics.clearWebAnchor();this.game.clearInput();this.game.combat?.cancel();this.pendingPunch=null;
        } else if(this.spectating && me && !me.eliminated){
          this.setSpectating(false);this.game.clearInput();
          this.applyServerPosition(me);this.game.resetCamera();
          this.game.showNotice('팀원이 구조했습니다. HP 50으로 복귀합니다.');
        }
      }
      if(phaseChanged&&data.room.phase==='playing')this.begin();
      if(phaseChanged&&data.room.phase==='finished')this.finish();
      if(phaseChanged&&data.room.phase==='waiting'&&this.game.isPlaying){this.game.isPlaying=false;this.game.setPaused(true);}
      this.render();this.syncAvatars();return;
    }
    if(data.type==='move') {
      const player=this.players.find(p=>p.id===data.id);
      if(player && [data.x,data.y,data.z,data.facing].every(Number.isFinite)){
        player.x=data.x;player.y=data.y;player.z=data.z;player.facing=data.facing;player.seen=true;
        player.pose=sanitizePose(data.pose);
      }
      this.syncAvatars();
      return;
    }
    if(data.type==='hit') {
      const player=this.players.find(p=>p.id===data.target);if(player){player.health=data.health;player.eliminated=data.eliminated;}
      if(data.target===this.id){
        const attacker=this.players.find(p=>p.id===data.attacker);
        this.feedback?.show(`${attacker?.name||'상대'}의 ${data.kind==='web'?'거미줄':'주먹'} 명중 −${MATCH[data.kind]?.damage||0} · 내 HP ${data.health}${data.eliminated?' · 탈락 / 관전':''}`);
        this.game.tpsCamera?.triggerShake?.(.18);
        if(data.eliminated){this.setSpectating(true);this.game.physics.clearWebAnchor();this.game.clearInput();this.game.combat?.cancel();this.pendingPunch=null;}
      }
      else if(data.attacker===this.id){
        this.feedback?.hit(data,player);
        if(!this.feedback)this.game.showNotice(`명중! 상대 체력 ${data.health}`);
      }
      this.renderHud();this.syncAvatars();
    }
  }
  setSpectating(value) {
    const game=this.game;
    this.spectating=!!value;game.character.group.visible=!value;
  }
  applyServerPosition(data) {
    if(![data.x,data.y,data.z].every(Number.isFinite))return false;
    const p=this.game.physics;
    p.clearPendingInput();p.clearWebAnchor();this.game.combat?.cancel();this.pendingPunch=null;
    p.character.cancelAirTrick?.();p.mantle=null;p.character.mantle=null;
    p.recoveryTime=0;p.recoveryElapsed=0;p.wallBuilding=null;p.wallRunTimer=0;
    p.position.set(data.x,data.y,data.z);p.previousFixedPosition.copy(p.position);p.renderPosition.copy(p.position);
    p.velocity.set(0,0,0);p.state='FALLING';p.accumulator=0;p.launchAssistAvailable=true;
    if(Number.isFinite(data.facing)){p.facingAngle=data.facing;p.character.targetFacingAngle=data.facing;}
    return true;
  }
  renderList(rooms) {
    const list=$('room-list');list.replaceChildren();
    if(!rooms.length){list.append(make('p','empty-rooms','열린 방이 없습니다. 새 방을 만들어 보세요.'));return;}
    for(const room of rooms){const button=make('button','room-list-item','');button.type='button';button.append(make('span','room-list-icon',room.mode==='tag'?'⌖':'↗'));const text=make('span','room-list-text','');text.append(make('strong','',room.name),make('small','',`${label(room.mode)} · ${room.city==='procedural'?'로컬 도시':'홍콩'}`));button.append(text,make('span','room-list-count',`${room.count}/${room.capacity}  ↗`));button.addEventListener('click',()=>this.join(room.code));list.append(button);}
  }
  get city(){return this.game.city.isStreamed?'hong-kong':'procedural';}
  join(code){this.send({type:'join',code,playerName:$('player-name').value,city:this.city});}
  switchCity(code,city){try{sessionStorage.setItem('online-name',$('player-name').value);}catch{}location.href=`?city=${encodeURIComponent(city)}&join=${encodeURIComponent(code)}`;}
  render() {
    document.body.classList.toggle('in-game',this.solo||this.room?.phase==='playing');
    document.body.classList.toggle('room-game',!!this.room);
    $('lobby-panel').classList.toggle('hidden',!!this.room);
    $('room-panel').classList.toggle('hidden',!this.room);
    $('online-overlay').classList.toggle('hidden',this.solo||this.room?.phase==='playing');
    $('match-hud').classList.toggle('hidden',!this.solo&&this.room?.phase!=='playing');
    if(this.solo){this.renderHud();return;}
    if(!this.room)return;
    $('room-title').textContent=this.room.name;
    $('room-details').textContent=`${label(this.room.mode)} · ${this.room.count}/${this.room.capacity}명 · 정원 ${this.room.capacity}명`;
    $('room-code-display').textContent=this.room.code;
    const list=$('player-list');list.replaceChildren();
    for(const player of this.players){
      const row=make('div','player-row','');
      row.append(make('span','',`${player.id===this.host?'★ ':''}${player.name}${player.id===this.id?' (나)':''}${this.room.mode==='custom'?' · '+teamName(player.team):''}`),make('strong',player.ready?'준비 완료':'대기 중'));
      if(this.room.mode==='custom'&&this.room.format==='teams'&&this.room.phase==='waiting'&&player.id===this.id){
        const select=make('select','','');select.setAttribute('aria-label','내 팀 선택');
        for(const team of ['red','blue']){const option=make('option','',teamName(team));option.value=team;select.append(option);}
        select.value=player.team;select.addEventListener('change',()=>this.send({type:'team',team:select.value}));row.append(select);
      }
      list.append(row);
    }
    const waiting=this.room.phase==='waiting',finished=this.room.phase==='finished';
    $('room-ready').classList.toggle('hidden',!waiting);
    $('room-start').classList.toggle('hidden',!waiting||this.host!==this.id);
    $('room-rematch').classList.toggle('hidden',!finished||this.host!==this.id);
    const me=this.players.find(p=>p.id===this.id);
    $('room-ready').textContent=me?.ready?'준비 취소':'준비하기';
    $('room-start').disabled=this.players.length<MATCH.minPlayers||this.players.some(p=>!p.ready)||(this.room.mode==='custom'&&this.room.format==='teams'&&(!this.players.some(p=>p.team==='red')||!this.players.some(p=>p.team==='blue')));
    const waitingText=this.room.mode==='custom'
      ? `${this.room.format==='ffa'?'개인전 · 마지막 1명 생존 시 승리':'팀전 · 상대 팀 전원 탈락 시 승리 · 팀 변경 시 전원 준비 초기화'} · 2~8명 · HP 100 · 주먹 25 / 거미줄 15 · 시작 보호 8초 · 부활 없음. Q로 전투/거미줄 전환.`
      : this.room.mode==='tag'
      ? `최소 ${MATCH.minPlayers}명 · 모두 지형 로딩 후 준비. 6명 이하는 경찰 1명, 7명 이상은 경찰 2명. ${this.room.enhanced?'인원별 3~5분 · 목표 3개로 탈출 · 다음 경기 역할 순환':'5분 생존'}. 시작 ${MATCH.graceMs/1000}초는 공격 불가.`
      : `최소 ${MATCH.minPlayers}명 · 모두 준비하면 방장이 시작할 수 있습니다.`;
    const winnerText=this.room.mode==='custom'?(this.winner==='draw'?'무승부':this.room.format==='ffa'?`${this.players.find(p=>p.id===this.winner)?.name||'마지막 생존자'} 승리`:`${teamName(this.winner)} 승리`):this.winner==='police'?'경찰 팀 승리':this.winner==='runner'?'도망자 팀 승리':'경기 종료';
    $('room-message').textContent=finished?`${winnerText}. 방장이 다시 대기실을 열 수 있습니다.`:waiting?waitingText:'';
    this.renderHud();
  }
  renderHud() {
    if(this.solo){
      $('pursuit-hud').textContent='';$('spectate-next')?.classList.add('hidden');
      $('match-role').textContent='혼자 플레이';
      $('match-health').textContent='자유 탐험';
      $('match-timer').textContent='M · 전체 지도';
      $('match-count').textContent='1명';
      return;
    }
    const me=this.players.find(p=>p.id===this.id);if(!me||!this.room)return;
    const district=document.querySelector('.hud-district');if(district)district.textContent=`${this.room.city==='procedural'?'LOCAL CITY':'HONG KONG'} · ${label(this.room.mode)}`;
    $('match-role').textContent=this.room.mode==='custom'?teamName(me.team):this.room.mode==='free'?'자유 플레이':me.team==='police'?'경찰 · 추격':'도망자 · 생존';
    $('match-health').textContent=isCombatMode(this.room.mode)?`HP ${me.health}/100${me.eliminated?' · 관전 중':''}`:'피해 없음';
    $('match-count').textContent=`${this.players.length}명${Number.isFinite(this.ws?.lastRpcMs??this.latency)?' · '+Math.round(this.ws?.lastRpcMs??this.latency)+'ms':''}`;
    $('spectate-next')?.classList.toggle('hidden',!this.spectating);
    this.renderPursuit();
    const now=Date.now()+this.clockOffset;
    if(isCombatMode(this.room.mode)&&this.vulnerableAt>now)$('match-timer').textContent=`시작 여유 ${Math.max(0,Math.ceil((this.vulnerableAt-now)/1000))}초`;
    else if(this.room.mode==='tag'&&this.endsAt)$('match-timer').textContent=`남은 시간 ${Math.max(0,Math.ceil((this.endsAt-now)/1000))}초`;
    else $('match-timer').textContent=this.room.mode==='custom'?`생존 ${this.players.filter(p=>!p.eliminated).length}/${this.players.length}명`:'자유 플레이';
  }
  begin() {
    const game=this.game;
    if(!game.assetsReady){
      if(!this.beginTimer)this.beginTimer=setInterval(()=>{
        if(game.assetsReady){clearInterval(this.beginTimer);this.beginTimer=null;if(this.room?.phase==='playing')this.begin();}
      },300);
      return;
    }
    clearInterval(this.beginTimer);this.beginTimer=null;this.pendingPunch=null;if(this.feedback){this.feedback.cooldowns={};this.feedback.pendingUntil=0;this.feedback.previewAt=0;}
    game.setHelpOpen?.(false,false);
    const me=this.players.find(p=>p.id===this.id);
    this.solo=false;
    this.setSpectating(!!me?.eliminated);
    game.clickToPlayOverlay?.classList.add('hidden');
    game.isPlaying=true;game.isPaused=false;game.clearInput();game.audio.ensureContext();game.pointerLockWanted=true;
    game.practice?.stop();game.physics.resetPosition();
    if(me?.seen && [me.x,me.y,me.z,me.facing].every(Number.isFinite)){
      game.physics.position.set(me.x,me.y,me.z);
      game.physics.previousFixedPosition.copy(game.physics.position);
      game.physics.renderPosition.copy(game.physics.position);
      game.physics.facingAngle=me.facing;
      game.character.targetFacingAngle=me.facing;
      game.character.visualYaw=me.facing;
    }else this.placeMatchSpawn();
    game.resetCamera();game.combat.cancel();game.combat.clearEnemies();
    const desiredMode=(this.room.mode==='custom'||me?.team==='police')?'combat':'web';
    game.applyPreferences();
    if(game.combat.mode!==desiredMode)game.combat.toggle(game.input);
    this.game.showNotice(this.room.mode==='custom'?'사용자 설정 경기 · HP 100 · 상대 전원 제압! Q로 전투/거미줄 전환 · 주먹 25 / 거미줄 15 · 시작 보호 8초':this.room.mode==='tag'
      ? (this.arena?'경찰은 추격, 도망자는 이동 목표 3개를 완료하거나 제한 시간 생존. 쓰러진 팀원 곁에서 3초 유지하면 구조합니다. 시작 8초는 공격이 없습니다.':'경찰은 주먹 25, 에너지 와이어 15로 추격합니다. 도망자는 5분 생존하면 승리합니다.')
      : '자유 플레이 시작! 도시를 함께 탐험하세요.');
  }
  locksCombatToggle() {
    return this.room?.phase==='playing' && this.room.mode==='tag' && this.players.find(p=>p.id===this.id)?.team==='runner';
  }
  placeMatchSpawn() {
    const me=this.players.find(p=>p.id===this.id);if(!me)return;
    const physics=this.game.physics;
    const sharedAnchor=this.arena||this.spawnAnchor;
    const anchor=sharedAnchor?new THREE.Vector3(sharedAnchor.x,sharedAnchor.y,sharedAnchor.z):physics.position.clone();
    const team=this.room.mode==='custom'&&this.room.format==='ffa'?'free':me.team || 'free';
    const mates=this.players.filter(p=>team==='free'||(p.team||'free')===team).sort((a,b)=>a.id<b.id?-1:1);
    const index=Math.max(0,mates.findIndex(p=>p.id===me.id));
    const roofs=this.game.city.rooftopSpawns || [];
    const placed=resolveMatchSpawn(anchor, teamOffset(index, team, mates.length), pos=>physics.supportHeight(new THREE.Vector3(pos.x,pos.y,pos.z)), roofs);
    physics.position.set(placed.x,placed.y,placed.z);
    physics.previousFixedPosition.copy(physics.position);
    physics.renderPosition.copy(physics.position);
    const facing=team==='free' && Math.hypot(anchor.x-placed.x,anchor.z-placed.z)>.1
      ? Math.atan2(anchor.x-placed.x,anchor.z-placed.z) : (team==='runner'||team==='blue')?Math.PI:0;
    physics.facingAngle=facing;
    physics.character.targetFacingAngle=facing;
    if('visualYaw' in physics.character)physics.character.visualYaw=facing;
    this.send({type:'move',x:placed.x,y:placed.y,z:placed.z,facing});
    this.lastSend=performance.now();
  }
  beginSolo() {
    if(this.room||this.solo)return;
    this.solo=true;
    try{sessionStorage.removeItem('web-runner-room-resume');}catch{}
    if(this.ws?.roomCode)this.send({type:'leave'});
    this.render();
    const game=this.game;
    if(!game.assetsReady){
      this.soloStartTimer=setInterval(()=>{
        if(!this.solo){clearInterval(this.soloStartTimer);this.soloStartTimer=null;return;}
        if(game.assetsReady){clearInterval(this.soloStartTimer);this.soloStartTimer=null;this.beginSoloReady();}
      },200);
      return;
    }
    this.beginSoloReady();
  }
  beginSoloReady() {
    if(this.feedback)this.feedback.cooldowns={};
    if(!this.solo)return;
    const game=this.game;
    game.setHelpOpen?.(false,false);
    this.setSpectating(false);
    game.clickToPlayOverlay?.classList.add('hidden');
    game.isPlaying=true;game.isPaused=false;game.clearInput();game.audio.ensureContext();game.pointerLockWanted=true;
    game.physics.resetPosition();game.resetCamera();game.combat.cancel();game.combat.clearEnemies();
    if(game.combat.mode!=='web')game.combat.toggle(game.input);
    game.experience?.restorePosition();game.applyPreferences();
    this.render();
    game.showNotice('혼자 플레이 시작! 화면을 클릭해 카메라를 조작하세요. M 키로 전체 지도를 확인하세요.');
  }
  finish(){this.pendingPunch=null;clearInterval(this.beginTimer);this.beginTimer=null;this.setSpectating(false);this.game.isPlaying=false;this.game.clearInput();this.game.setPaused(true);this.game.clickToPlayOverlay?.classList.add('hidden');this.clearAvatars();}
  leaveLocal(){this.game.character.group.visible=true;this.rescueStarted=null;this.rescueTarget=null;if(this.goalMarker)this.goalMarker.visible=false;$('pursuit-hud').textContent='';$('spectate-next')?.classList.add('hidden');try{sessionStorage.removeItem('web-runner-room-resume');}catch{}this.arena=null;this.pulseUntil=0;this.game.practice?.stop();this.room=null;this.pendingPunch=null;clearInterval(this.beginTimer);this.beginTimer=null;this.spectating=false;this.solo=false;clearInterval(this.soloStartTimer);this.soloStartTimer=null;this.players=[];this.id=null;this.lastPhase=null;this.game.isPlaying=false;this.game.clearInput();this.game.setPaused(true);this.game.clickToPlayOverlay?.classList.add('hidden');this.clearAvatars();this.render();this.send({type:'list'});}
  attack(kind,hand='left'){
    if(kind==='web'&&this.game.combat?.mode==='combat')return false;
    const me=this.players.find(p=>p.id===this.id);
    if(this.spectating||!canAttack(this.room,me))return;
    if(kind==='punch'){
      const action=this.game.combat.action;
      if(action && ATTACKS[action.key])this.pendingPunch=action.id;
      return;
    }
    const ray=new THREE.Raycaster();
    ray.setFromCamera(this.game.physics.webAimNdc || new THREE.Vector2(),this.game.camera);
    const direction=ray.ray.direction;
    const facing=Math.hypot(direction.x,direction.z)>.001?Math.atan2(direction.x,direction.z):this.game.physics.facingAngle;
    return this.sendAttack(kind,facing,hand);
  }
  attackPreview(kind='web') {
    const position=this.game.physics.position;
    const me=this.players.find(p=>p.id===this.id);
    const direction=this.game.camera.getWorldDirection(new THREE.Vector3());
    const facing=kind==='punch'?(this.game.physics.facingAngle||0):Math.atan2(direction.x,direction.z);
    const target=this.players.filter(p=>opponents(this.room,me,p)&&!p.eliminated&&p.seen)
      .map(p=>({p,d:Math.hypot(p.x-position.x,p.z-position.z)}))
      .filter(({p})=>!attackGate(position,p,kind,facing))
      .sort((a,b)=>(kind==='web'?Number(webTargetInReticle(b.p,this.game.camera))-Number(webTargetInReticle(a.p,this.game.camera)):0)||a.d-b.d)[0];
    if(!target)return null;
    const from=position.clone().add(new THREE.Vector3(0,1,0)),line=new THREE.Vector3(target.p.x,target.p.y+1,target.p.z).sub(from);
    const blocked=!!this.game.city.raycast?.(from,line.clone().normalize(),Math.max(0,line.length()-.3));
    return {player:target.p,name:target.p.name||'상대',distance:target.d,blocked,aimReady:kind!=='web'||webTargetInReticle(target.p,this.game.camera)};
  }
  sendAttack(kind,facing,hand='left'){
    if(kind==='web'&&this.game.combat?.mode==='combat')return false;
    const me=this.players.find(p=>p.id===this.id);
    if(this.spectating||!canAttack(this.room,me))return;
    const origin=this.game.physics.position.clone().add(new THREE.Vector3(0,1,0));
    const targets=this.players.filter(p=>opponents(this.room,me,p)&&!p.eliminated&&p.seen)
      .filter(p=>!attackGate(this.game.physics.position,p,kind,facing)&&(kind!=='web'||webTargetInReticle(p,this.game.camera)))
      .sort((a,b)=>Math.hypot(a.x-origin.x,a.z-origin.z)-Math.hypot(b.x-origin.x,b.z-origin.z));
    if(kind==='web'&&!targets.length)return false;
    if(targets.length){
      const target=targets[0],dir=new THREE.Vector3(target.x,target.y+1,target.z).sub(origin);
      if(this.game.city.raycast?.(origin,dir.clone().normalize(),Math.max(0,dir.length()-.3))){this.feedback?.show('벽이나 건물이 상대를 가리고 있습니다');return kind==='web';}
    }
    if(this.feedback&&!this.feedback.canFire(kind,this))return kind==='web';
    this.send({type:'attack',kind,facing,targetId:targets[0]?.id||null});
    this.feedback?.sent(kind,targets[0],hand);
    return kind==='web';
  }
  serverNow(){return Date.now()+this.clockOffset;}
  spectatePoint() {
    const me=this.players.find(p=>p.id===this.id);
    const living=this.players.filter(p=>p.id!==this.id&&!p.eliminated&&p.seen);
    const ordered=[...living.filter(p=>p.team===me?.team),...living.filter(p=>p.team!==me?.team)];
    const ally=ordered[this.spectateIndex%Math.max(1,ordered.length)];
    if(!ally)return null;
    const avatar=this.avatars.get(ally.id);
    return avatar ? avatar.mesh.position : new THREE.Vector3(ally.x,ally.y,ally.z);
  }
  update(delta) {
    this.feedback?.update(this);
    if(this.room?.phase!=='playing'){if(this.feedback){this.feedback.pendingUntil=0;this.feedback.cooldowns={};if(this.feedback.marker)this.feedback.marker.hidden=true;}this.positionMarkers?.update([],this.game.physics.position,false);return;}
    const now=performance.now();
    if(!(this.ws instanceof SupabaseRooms)&&now-(this.lastPing||0)>5000){this.lastPing=now;this.send({type:'ping',stamp:now});}
    const me=this.players.find(p=>p.id===this.id);
    if(this.arena&&!this.spectating&&this.game.isPlaying&&!this.game.isPaused)this.constrainArena(delta);
    // Queued combos start inside CombatSystem rather than the click handler.
    // Observe the actual action once so every played strike gets one contact.
    const startedAction=this.game.combat?.action;
    if(this.game.isPlaying && !this.game.isPaused && startedAction &&
        ATTACKS[startedAction.key] && startedAction.id!==this.observedPunchId){
      this.observedPunchId=startedAction.id;
      this.attack('punch');
    }
    if(this.pendingPunch!=null && this.game.isPlaying && !this.game.isPaused){
      const action=this.game.combat.action,rule=ATTACKS[action?.key];
      if(!action || action.id!==this.pendingPunch || !rule)this.pendingPunch=null;
      else if(action.time>=rule.from){this.pendingPunch=null;this.sendAttack('punch',this.game.physics.facingAngle);}
    }
    if(this.spectating){
      const point=this.spectatePoint();
      if(point){
        this.game.tpsCamera.lockBehind=false;
        const ray=this.game.city.raycast?.bind(this.game.city);
        this.game.tpsCamera.update(delta,point,new THREE.Vector3(),false,this.game.city.getCameraCollisionMeshes?.(point)||this.game.city.buildingMeshes||[],ray,null);
      }
    } else if(now-this.lastSend>100&&this.game.isPlaying&&!this.game.isPaused){
      const p=this.game.physics.position;this.send({type:'move',x:p.x,y:p.y,z:p.z,facing:this.game.physics.facingAngle,
        pose:capturePose(this.game.physics,this.game.character)});this.lastSend=now;
    }
    if(now-(this.lastHud||0)>500){this.renderHud();this.lastHud=now;}
    for(const avatar of this.avatars.values())avatar.update(delta,now);
    this.positionMarkers?.update(this.minimapPlayers(),this.spectating?(this.spectatePoint()||this.game.physics.renderPosition):this.game.physics.renderPosition,
      this.game.isPlaying&&!this.game.isPaused);
  }
  constrainArena(delta) {
    const p=this.game.physics,a=this.arena,dx=p.position.x-a.x,dz=p.position.z-a.z,d=Math.hypot(dx,dz);
    if(d<a.radius-12)return;
    const direction=new THREE.Vector3(dx,0,dz).normalize(),outward=p.velocity.dot(direction);
    if(outward>0)p.velocity.addScaledVector(direction,-outward*Math.min(1,delta*8));
    if(d>a.radius-2){p.position.x=a.x+direction.x*(a.radius-2);p.position.z=a.z+direction.z*(a.radius-2);p.previousFixedPosition.copy(p.position);p.renderPosition.copy(p.position);}
  }
  renderPursuit() {
    const output=$('pursuit-hud');if(!output)return;
    const me=this.players.find(p=>p.id===this.id);if(!this.arena||!me||this.room?.mode!=='tag'){output.textContent='';this.goalMarker&&(this.goalMarker.visible=false);return;}
    this.syncDowned(me);
    const point=this.arena.points[(me.progress||0)%this.arena.points.length];
    if(me.team==='runner'&&!me.eliminated&&point){const delta=new THREE.Vector3(point.x,point.y,point.z).sub(this.game.physics.position);
      output.textContent=`탈출 준비 ${me.progress||0}/${PURSUIT.goal} · 이동 목표 ${Math.round(delta.length())}m · 고도 ${Math.round(point.y)}m · 쓰러진 팀원 곁에서 3초 유지하면 구조`;
      const down=this.players.filter(p=>p.team===me.team&&p.eliminated&&p.seen).sort((a,b)=>Math.hypot(a.x-me.x,a.y-me.y,a.z-me.z)-Math.hypot(b.x-me.x,b.y-me.y,b.z-me.z))[0];
      if(down){const distance=Math.hypot(down.x-me.x,down.y-me.y,down.z-me.z);output.textContent+=` · ${down.name} 구조 ${Math.round(distance)}m`;
        if(distance<PURSUIT.reviveRadius){if(this.rescueTarget!==down.id){this.rescueTarget=down.id;this.rescueStarted=performance.now();}this.rescueStarted??=performance.now();output.textContent+=` · 구조 ${Math.min(100,Math.round((performance.now()-this.rescueStarted)/PURSUIT.reviveMs*100))}%`;}else this.rescueStarted=null;
      }else this.rescueStarted=null;
      if(!this.goalMarker){this.goalMarker=new THREE.Mesh(new THREE.OctahedronGeometry(1.2),new THREE.MeshBasicMaterial({color:0x90ffdf,wireframe:true}));this.game.scene.add(this.goalMarker);}
      this.goalMarker.visible=true;this.goalMarker.position.set(point.x,point.y+2,point.z);
    }else{this.goalMarker&&(this.goalMarker.visible=false);output.textContent=me.eliminated?'관전 중 · 팀원이 가까이 오면 구조 가능':'추격 중 · 상대 방향과 거리를 확인하세요';}
  }
  syncDowned(me){const ids=new Set();for(const p of this.players){if(!p.eliminated||p.team!==me.team||!p.seen)continue;ids.add(p.id);let marker=this.downedMarkers.get(p.id);
    if(!marker){marker=new THREE.Mesh(new THREE.OctahedronGeometry(.7),new THREE.MeshBasicMaterial({color:0xffd57b,wireframe:true}));this.game.scene.add(marker);this.downedMarkers.set(p.id,marker);}marker.position.set(p.x,p.y+1.4,p.z);}
    for(const[id,marker]of this.downedMarkers)if(!ids.has(id)){this.game.scene.remove(marker);marker.geometry.dispose();marker.material.dispose();this.downedMarkers.delete(id);}}
  minimapPlayers(){
    if(this.room?.phase!=='playing')return [];
    const me=this.players.find(p=>p.id===this.id);
    return this.players.filter(p=>p.id!==this.id && [p.x,p.y,p.z].every(Number.isFinite)).map(p=>{
        const rendered=this.avatars.get(p.id)?.mesh.position;
        const validRendered=rendered && [rendered.x,rendered.y,rendered.z].every(Number.isFinite);
        return {...p,targeted:this.feedback?.preview?.player?.id===p.id&&this.feedback.preview.aimReady&&!this.feedback.preview.blocked,x:validRendered?rendered.x:p.x,y:validRendered?rendered.y:p.y,z:validRendered?rendered.z:p.z,
          seen:true,lastKnown:!p.seen || p.connected===false,downed:!!p.eliminated,
          eliminated:false,rescue:this.room.mode==='tag'&&!!p.eliminated && p.team===me?.team,ally:me?.team!=='free' && p.team===me?.team};
      });
  }
  syncAvatars() {
    if(this.room?.phase!=='playing')return this.clearAvatars();
    const source=this.game.character;
    if(!source.isLoaded || !source.model || !source.mixer)return;
    const alive=new Set();
    for(const p of this.players){if(p.id===this.id||p.eliminated||!p.seen)continue;alive.add(p.id);let a=this.avatars.get(p.id);if(!a){
      a=new RemoteMotion(this.game.scene,this.game.character,p,this.game.city);this.avatars.set(p.id,a);
    }a.receive(p,p.pose);p.pose=null;}
    for(const [id,a] of this.avatars)if(!alive.has(id)){a.dispose();this.avatars.delete(id);}
  }
  clearAvatars(){if(this.goalMarker)this.goalMarker.visible=false;this.rescueStarted=null;this.rescueTarget=null;for(const a of this.avatars.values())a.dispose();this.avatars.clear();for(const marker of this.downedMarkers?.values()||[]){this.game.scene.remove(marker);marker.geometry.dispose();marker.material.dispose();}this.downedMarkers?.clear();}
}
