import * as THREE from 'three';
import { MATCH, resolveMatchSpawn, teamOffset } from './MatchRules.js';
import { SupabaseRooms } from './SupabaseRooms.js';
import { RemoteMotion, capturePose, sanitizePose } from './RemoteMotion.js';

const $ = id => document.getElementById(id);
const label = mode => mode === 'tag' ? '경찰과 도망자' : '자유 플레이';
const make = (tag, className, value) => { const el=document.createElement(tag);el.className=className;el.textContent=value;return el; };

export class Multiplayer {
  constructor(game) {
    this.game=game;this.ws=null;this.id=null;this.room=null;this.solo=false;this.players=[];this.avatars=new Map();this.lastSend=0;this.lastPhase=null;this.spectating=false;this.clockOffset=0;this.vulnerableAt=0;
    this.connect();this.bind();
  }
  send(data) {
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
    this.ws.onopen=()=>{ $('online-status').textContent='온라인 · 방을 선택하세요';this.send({type:'list'});const pending=new URLSearchParams(location.search).get('join');if(pending){if(pending.toUpperCase()!==this.ws.resumedCode)this.send({type:'join',code:pending,playerName:sessionStorage.getItem('online-name')||$('player-name').value,city:this.city});history.replaceState(null,'',location.pathname+location.search.replace(/([?&])join=[^&]*&?/,'$1').replace(/[?&]$/,''));} };
    this.ws.onmessage=event=>{try{this.message(JSON.parse(event.data));}catch(error){console.error(error);}};
    this.ws.onclose=()=>{
      $('online-status').textContent=this.ws?.fatal?'방 연결 설정을 확인하세요':'연결이 끊겼습니다. 다시 연결 중…';
      this.room=null;this.id=null;this.players=[];this.clearAvatars();this.render();
      if(!this.solo){this.game.isPlaying=false;this.game.clearInput();this.game.setPaused(true);}
      if(!this.ws?.fatal)setTimeout(()=>this.connect(),2500);
    };
  }
  bind() {
    $('play-solo').addEventListener('click',()=>this.beginSolo());
    document.querySelectorAll('.mode-option').forEach(button=>button.addEventListener('click',()=>{
      $('room-mode').value=button.dataset.mode;
      document.querySelectorAll('.mode-option').forEach(option=>{
        const selected=option===button;
        option.classList.toggle('selected',selected);
        option.setAttribute('aria-selected',String(selected));
      });
    }));
    $('create-room').addEventListener('click',()=>this.send({type:'create',name:$('room-name').value,playerName:$('player-name').value,capacity:Number($('room-capacity').value),mode:$('room-mode').value,city:this.city}));
    $('join-code').addEventListener('click',()=>this.join($('room-code').value));
    $('room-code').addEventListener('keydown',e=>{if(e.key==='Enter')$('join-code').click();});
    $('room-ready').addEventListener('click',()=>{const me=this.players.find(p=>p.id===this.id);this.send({type:'ready',ready:!me?.ready});});
    $('room-start').addEventListener('click',()=>this.send({type:'start'}));
    $('room-rematch').addEventListener('click',()=>this.send({type:'rematch'}));
    $('room-leave').addEventListener('click',()=>{this.send({type:'leave'});this.leaveLocal();});
    $('btn-leave-match').addEventListener('click',()=>{if(this.room)this.send({type:'leave'});this.leaveLocal();});
    $('room-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(this.room?.code||'');this.game.showNotice('방 코드를 복사했습니다.');}catch{this.game.showNotice(`방 코드: ${this.room?.code||''}`);}});
    $('match-help').addEventListener('click',()=>this.game.toggleHelp());
  }
  message(data) {
    if(data.type==='error')return this.game.showNotice(data.message);
    if(data.type==='switch-city')return this.switchCity(data.code,data.city);
    if(data.type==='rooms')return this.renderList(data.rooms);
    if(data.type==='joined'){this.id=data.id;return;}
    if(data.type==='left')return this.leaveLocal();
    if(data.type==='pose') {
      const avatar=this.avatars.get(data.id),player=this.players.find(p=>p.id===data.id);
      if(avatar && player)avatar.receive(player,sanitizePose(data.pose));
      return;
    }
    if(data.type==='room') {
      const phaseChanged=data.room.phase!==this.lastPhase;
      this.room=data.room;this.players=data.players;this.host=data.host;this.endsAt=data.endsAt;this.winner=data.winner;
      this.vulnerableAt=data.vulnerableAt || 0;
      if(Number.isFinite(data.serverNow))this.clockOffset=data.serverNow-Date.now();
      this.lastPhase=data.room.phase;
      if(data.room.phase!=='playing')this.spectating=false;
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
        this.game.showNotice(data.eliminated?'체력이 0입니다. 살아있는 플레이어를 관전합니다.':`${data.kind==='web'?'거미줄':'주먹'} 공격! 체력 ${data.health}`);
        if(data.eliminated){this.spectating=true;this.game.clearInput();}
      }
      else if(data.attacker===this.id)this.game.showNotice(`명중! 상대 체력 ${data.health}`);
      this.renderHud();this.syncAvatars();
    }
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
    for(const player of this.players){const row=make('div','player-row','');row.append(make('span','',`${player.id===this.host?'★ ':''}${player.name}${player.id===this.id?' (나)':''}`),make('strong',player.ready?'준비 완료':'대기 중'));list.append(row);}
    const waiting=this.room.phase==='waiting',finished=this.room.phase==='finished';
    $('room-ready').classList.toggle('hidden',!waiting);
    $('room-start').classList.toggle('hidden',!waiting||this.host!==this.id);
    $('room-rematch').classList.toggle('hidden',!finished||this.host!==this.id);
    const me=this.players.find(p=>p.id===this.id);
    $('room-ready').textContent=me?.ready?'준비 취소':'준비하기';
    $('room-start').disabled=this.players.length<MATCH.minPlayers||this.players.some(p=>!p.ready);
    const waitingText=this.room.mode==='tag'
      ? `최소 ${MATCH.minPlayers}명 · 모두 준비 후 시작. 6명 이하는 경찰 1명, 7명 이상은 경찰 2명. 5분, 시작 ${MATCH.graceMs/1000}초는 공격 불가.`
      : `최소 ${MATCH.minPlayers}명 · 모두 준비하면 방장이 시작할 수 있습니다.`;
    const winnerText=this.winner==='police'?'경찰 팀 승리':this.winner==='runner'?'도망자 팀 승리':'경기 종료';
    $('room-message').textContent=finished?`${winnerText}. 방장이 다시 대기실을 열 수 있습니다.`:waiting?waitingText:'';
    this.renderHud();
  }
  renderHud() {
    if(this.solo){
      $('match-role').textContent='혼자 플레이';
      $('match-health').textContent='자유 탐험';
      $('match-timer').textContent='R · 타임트라이얼';
      $('match-count').textContent='1명';
      return;
    }
    const me=this.players.find(p=>p.id===this.id);if(!me||!this.room)return;
    $('match-role').textContent=this.room.mode==='free'?'자유 플레이':me.team==='police'?'경찰 · 추격':'도망자 · 생존';
    $('match-health').textContent=this.room.mode==='tag'?`HP ${me.health}/100${me.eliminated?' · 관전 중':''}`:'피해 없음';
    $('match-count').textContent=`${this.players.length}명 접속`;
    const now=Date.now()+this.clockOffset;
    if(this.room.mode==='tag'&&this.vulnerableAt>now)$('match-timer').textContent=`시작 여유 ${Math.max(0,Math.ceil((this.vulnerableAt-now)/1000))}초`;
    else if(this.room.mode==='tag'&&this.endsAt)$('match-timer').textContent=`남은 시간 ${Math.max(0,Math.ceil((this.endsAt-now)/1000))}초`;
    else $('match-timer').textContent='자유 플레이';
  }
  begin() {
    const game=this.game;
    if(!game.assetsReady){const wait=setInterval(()=>{if(game.assetsReady){clearInterval(wait);if(this.room?.phase==='playing')this.begin();}},300);return;}
    this.spectating=false;
    game.clickToPlayOverlay?.classList.add('hidden');
    game.isPlaying=true;game.isPaused=false;game.clearInput();game.audio.ensureContext();game.pointerLockWanted=true;
    game.physics.resetPosition();this.placeMatchSpawn();game.resetCamera();game.timeTrial.stop();game.combat.cancel();game.combat.clearEnemies();
    const me=this.players.find(p=>p.id===this.id);
    const desiredMode=me?.team==='police'?'combat':'web';
    if(game.combat.mode!==desiredMode)game.combat.toggle(game.input);
    this.game.showNotice(this.room.mode==='tag'
      ? '경찰은 주먹 25, Q 후 거미줄 15로 쫓습니다. 도망자는 공격할 수 없고 5분을 버티면 이깁니다. 시작 8초는 공격이 없습니다.'
      : '자유 플레이 시작! 도시를 함께 탐험하세요.');
  }
  locksCombatToggle() {
    return this.room?.phase==='playing' && this.room.mode==='tag' && this.players.find(p=>p.id===this.id)?.team==='runner';
  }
  placeMatchSpawn() {
    const me=this.players.find(p=>p.id===this.id);if(!me)return;
    const physics=this.game.physics;
    const anchor=physics.position.clone();
    const team=me.team || 'free';
    const mates=this.players.filter(p=>(p.team||'free')===team).sort((a,b)=>a.id<b.id?-1:1);
    const index=Math.max(0,mates.findIndex(p=>p.id===me.id));
    const roofs=this.game.city.rooftopSpawns || [];
    const placed=resolveMatchSpawn(anchor, teamOffset(index, team, mates.length), pos=>physics.supportHeight(new THREE.Vector3(pos.x,pos.y,pos.z)), roofs);
    physics.position.set(placed.x,placed.y,placed.z);
    physics.previousFixedPosition.copy(physics.position);
    physics.renderPosition.copy(physics.position);
    const facing=team==='runner'?Math.PI:0;
    physics.facingAngle=facing;
    physics.character.targetFacingAngle=facing;
    if('visualYaw' in physics.character)physics.character.visualYaw=facing;
    this.send({type:'move',x:placed.x,y:placed.y,z:placed.z,facing});
    this.lastSend=performance.now();
  }
  beginSolo() {
    if(this.room||this.solo)return;
    this.solo=true;
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
    if(!this.solo)return;
    const game=this.game;
    game.clickToPlayOverlay?.classList.add('hidden');
    game.isPlaying=true;game.isPaused=false;game.clearInput();game.audio.ensureContext();game.pointerLockWanted=true;
    game.physics.resetPosition();game.resetCamera();game.timeTrial.stop();game.combat.cancel();game.combat.clearEnemies();
    if(game.combat.mode!=='web')game.combat.toggle(game.input);
    this.render();
    game.showNotice('혼자 플레이 시작! 화면을 클릭해 카메라를 조작하세요. R로 타임트라이얼을 시작할 수 있습니다.');
  }
  finish(){this.spectating=false;this.game.isPlaying=false;this.game.clearInput();this.game.setPaused(true);this.game.clickToPlayOverlay?.classList.add('hidden');this.clearAvatars();}
  leaveLocal(){this.room=null;this.spectating=false;this.solo=false;clearInterval(this.soloStartTimer);this.soloStartTimer=null;this.players=[];this.id=null;this.lastPhase=null;this.game.isPlaying=false;this.game.clearInput();this.game.setPaused(true);this.game.clickToPlayOverlay?.classList.add('hidden');this.game.timeTrial.stop();this.game.updateTrialHUD();this.clearAvatars();this.render();this.send({type:'list'});}
  attack(kind){
    const me=this.players.find(p=>p.id===this.id);
    if(this.spectating||me?.eliminated)return;
    if(this.room?.phase==='playing'&&me?.team==='police')this.send({type:'attack',kind,facing:this.game.physics.facingAngle});
  }
  serverNow(){return Date.now()+this.clockOffset;}
  spectatePoint() {
    const me=this.players.find(p=>p.id===this.id);
    const living=this.players.filter(p=>p.id!==this.id&&!p.eliminated&&p.seen);
    const ally=living.find(p=>p.team===me?.team) || living[0];
    if(!ally)return null;
    const avatar=this.avatars.get(ally.id);
    return avatar ? avatar.mesh.position : new THREE.Vector3(ally.x,ally.y,ally.z);
  }
  update(delta) {
    if(this.room?.phase!=='playing')return;
    const now=performance.now();
    if(this.spectating){
      const point=this.spectatePoint();
      if(point){
        this.game.tpsCamera.lockBehind=false;
        const ray=this.game.city.raycast?.bind(this.game.city);
        this.game.tpsCamera.update(delta,point,new THREE.Vector3(),false,this.game.city.buildingMeshes||[],ray,null);
      }
    } else if(now-this.lastSend>100&&this.game.isPlaying&&!this.game.isPaused){
      const p=this.game.physics.position;this.send({type:'move',x:p.x,y:p.y,z:p.z,facing:this.game.physics.facingAngle,pose:capturePose(this.game.physics,this.game.character)});this.lastSend=now;
    }
    if(now-(this.lastHud||0)>500){this.renderHud();this.lastHud=now;}
    for(const avatar of this.avatars.values())avatar.update(delta,now);
  }
  syncAvatars() {
    if(this.room?.phase!=='playing')return this.clearAvatars();
    const source=this.game.character;
    if(!source.isLoaded || !source.model || !source.mixer)return;
    const alive=new Set();
    for(const p of this.players){if(p.id===this.id||p.eliminated||!p.seen)continue;alive.add(p.id);let a=this.avatars.get(p.id);if(!a){
      a=new RemoteMotion(this.game.scene,source,p,this.game.city);this.avatars.set(p.id,a);
    }a.receive(p,p.pose);p.pose=null;}
    for(const [id,a] of this.avatars)if(!alive.has(id)){a.dispose();this.avatars.delete(id);}
  }
  clearAvatars(){for(const a of this.avatars.values())a.dispose();this.avatars.clear();}
}
