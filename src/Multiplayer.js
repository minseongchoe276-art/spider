import * as THREE from 'three';

const $ = id => document.getElementById(id);
const label = mode => mode === 'tag' ? '경찰과 도망자' : '자유 플레이';
const make = (tag, className, value) => { const el=document.createElement(tag);el.className=className;el.textContent=value;return el; };

export class Multiplayer {
  constructor(game) {
    this.game=game;this.ws=null;this.id=null;this.room=null;this.solo=false;this.players=[];this.avatars=new Map();this.lastSend=0;this.lastPhase=null;
    this.connect();this.bind();
  }
  send(data) { if(this.ws?.readyState===WebSocket.OPEN)this.ws.send(JSON.stringify(data)); }
  connect() {
    const url=`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws`;
    this.ws=new WebSocket(url);
    $('online-status').textContent='서버 연결 중…';
    this.ws.onopen=()=>{ $('online-status').textContent='온라인 · 방을 선택하세요';this.send({type:'list'});const pending=new URLSearchParams(location.search).get('join');if(pending){this.send({type:'join',code:pending,playerName:sessionStorage.getItem('online-name')||$('player-name').value,city:this.city});history.replaceState(null,'',location.pathname+location.search.replace(/([?&])join=[^&]*&?/,'$1').replace(/[?&]$/,''));} };
    this.ws.onmessage=event=>{try{this.message(JSON.parse(event.data));}catch(error){console.error(error);}};
    this.ws.onclose=()=>{
      $('online-status').textContent='연결이 끊겼습니다. 다시 연결 중…';
      this.room=null;this.id=null;this.players=[];this.clearAvatars();this.render();
      if(!this.solo){this.game.isPlaying=false;this.game.clearInput();this.game.setPaused(true);}
      setTimeout(()=>this.connect(),2500);
    };
  }
  bind() {
    $('play-solo').addEventListener('click',()=>this.beginSolo());
    $('create-room').addEventListener('click',()=>this.send({type:'create',name:$('room-name').value,playerName:$('player-name').value,capacity:Number($('room-capacity').value),mode:$('room-mode').value,city:this.city}));
    $('join-code').addEventListener('click',()=>this.join($('room-code').value));
    $('room-code').addEventListener('keydown',e=>{if(e.key==='Enter')$('join-code').click();});
    $('room-ready').addEventListener('click',()=>{const me=this.players.find(p=>p.id===this.id);this.send({type:'ready',ready:!me?.ready});});
    $('room-start').addEventListener('click',()=>this.send({type:'start'}));
    $('room-rematch').addEventListener('click',()=>this.send({type:'rematch'}));
    $('room-leave').addEventListener('click',()=>{this.send({type:'leave'});this.leaveLocal();});
    $('btn-leave-match').addEventListener('click',()=>{if(this.room)this.send({type:'leave'});this.leaveLocal();});
    $('room-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(this.room?.code||'');this.game.showNotice('방 코드를 복사했습니다.');}catch{this.game.showNotice(`방 코드: ${this.room?.code||''}`);}});
  }
  message(data) {
    if(data.type==='error')return this.game.showNotice(data.message);
    if(data.type==='switch-city')return this.switchCity(data.code,data.city);
    if(data.type==='rooms')return this.renderList(data.rooms);
    if(data.type==='joined'){this.id=data.id;return;}
    if(data.type==='left')return this.leaveLocal();
    if(data.type==='room') {
      const phaseChanged=data.room.phase!==this.lastPhase;
      this.room=data.room;this.players=data.players;this.host=data.host;this.endsAt=data.endsAt;this.winner=data.winner;
      this.lastPhase=data.room.phase;
      if(phaseChanged&&data.room.phase==='playing')this.begin();
      if(phaseChanged&&data.room.phase==='finished')this.finish();
      if(phaseChanged&&data.room.phase==='waiting'&&this.game.isPlaying){this.game.isPlaying=false;this.game.setPaused(true);}
      this.render();this.syncAvatars();return;
    }
    if(data.type==='move') {
      const player=this.players.find(p=>p.id===data.id);if(player)Object.assign(player,data);
      const avatar=this.avatars.get(data.id);if(avatar)avatar.target.set(data.x,data.y,data.z);
      return;
    }
    if(data.type==='hit') {
      const player=this.players.find(p=>p.id===data.target);if(player){player.health=data.health;player.eliminated=data.eliminated;}
      if(data.target===this.id){this.game.showNotice(data.eliminated?'체력이 0이 되어 관전합니다.':`${data.kind==='web'?'거미줄':'주먹'} 공격! 체력 ${data.health}`);if(data.eliminated)this.game.clearInput();}
      else if(data.attacker===this.id)this.game.showNotice(`명중! 상대 체력 ${data.health}`);
      this.renderHud();this.syncAvatars();
    }
  }
  renderList(rooms) {
    const list=$('room-list');list.replaceChildren();
    if(!rooms.length){list.append(make('p','empty-rooms','열린 방이 없습니다. 새 방을 만들어 보세요.'));return;}
    for(const room of rooms){const button=make('button','room-list-item',`${room.name}  ·  ${label(room.mode)}  ·  ${room.city==='procedural'?'로컬 도시':'홍콩'}  ·  ${room.count}/${room.capacity}`);button.type='button';button.addEventListener('click',()=>this.join(room.code));list.append(button);}
  }
  get city(){return this.game.city.isStreamed?'hong-kong':'procedural';}
  join(code){this.send({type:'join',code,playerName:$('player-name').value,city:this.city});}
  switchCity(code,city){try{sessionStorage.setItem('online-name',$('player-name').value);}catch{}location.href=`?city=${encodeURIComponent(city)}&join=${encodeURIComponent(code)}`;}
  render() {
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
    $('room-start').disabled=this.players.length<4||this.players.some(p=>!p.ready);
    $('room-message').textContent=finished?`${this.winner==='police'?'경찰':'도망자'} 팀 승리! 방장이 다시 대기실을 열 수 있습니다.`:waiting?'최소 4명 · 모두 준비하면 방장이 시작할 수 있습니다.':'';
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
    if(this.room.mode==='tag'&&this.endsAt)$('match-timer').textContent=`남은 시간 ${Math.max(0,Math.ceil((this.endsAt-Date.now())/1000))}초`;
    else $('match-timer').textContent='자유 플레이';
  }
  begin() {
    const game=this.game;
    if(!game.assetsReady){const wait=setInterval(()=>{if(game.assetsReady){clearInterval(wait);if(this.room?.phase==='playing')this.begin();}},300);return;}
    game.clickToPlayOverlay?.classList.add('hidden');
    game.isPlaying=true;game.isPaused=false;game.clearInput();game.audio.ensureContext();game.pointerLockWanted=true;
    game.physics.resetPosition();game.resetCamera();game.timeTrial.stop();game.combat.cancel();game.combat.clearEnemies();
    const me=this.players.find(p=>p.id===this.id);
    const desiredMode=me?.team==='police'?'combat':'web';
    if(game.combat.mode!==desiredMode)game.combat.toggle(game.input);
    this.game.showNotice(this.room.mode==='tag'?'경찰은 주먹·거미줄로 도망자 체력을 0으로 만드세요. 도망자는 5분 생존하세요.':'자유 플레이 시작! 도시를 함께 탐험하세요.');
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
  finish(){this.game.isPlaying=false;this.game.clearInput();this.game.setPaused(true);this.game.clickToPlayOverlay?.classList.add('hidden');this.clearAvatars();}
  leaveLocal(){this.room=null;this.solo=false;clearInterval(this.soloStartTimer);this.soloStartTimer=null;this.players=[];this.id=null;this.lastPhase=null;this.game.isPlaying=false;this.game.clearInput();this.game.setPaused(true);this.game.clickToPlayOverlay?.classList.add('hidden');this.game.timeTrial.stop();this.game.updateTrialHUD();this.clearAvatars();this.render();this.send({type:'list'});}
  attack(kind){if(this.room?.phase==='playing'&&this.players.find(p=>p.id===this.id)?.team==='police')this.send({type:'attack',kind,facing:this.game.physics.facingAngle});}
  update(delta) {
    if(this.room?.phase!=='playing')return;
    const now=performance.now();if(now-this.lastSend>100&&this.game.isPlaying&&!this.game.isPaused){const p=this.game.physics.position;this.send({type:'move',x:p.x,y:p.y,z:p.z,facing:this.game.physics.facingAngle});this.lastSend=now;}
    if(now-(this.lastHud||0)>500){this.renderHud();this.lastHud=now;}
    for(const avatar of this.avatars.values()){avatar.mesh.position.lerp(avatar.target,Math.min(1,delta*12));avatar.mesh.rotation.y=avatar.player.facing;}
  }
  syncAvatars() {
    if(this.room?.phase!=='playing')return this.clearAvatars();
    const alive=new Set();
    for(const p of this.players){if(p.id===this.id||p.eliminated)continue;alive.add(p.id);let a=this.avatars.get(p.id);if(!a){
      const color=p.team==='police'?0x45cfff:p.team==='runner'?0xff536e:0xf7c84b;
      const mesh=new THREE.Group();
      const body=new THREE.Mesh(new THREE.CapsuleGeometry(.38,1.05,4,8),new THREE.MeshStandardMaterial({color,roughness:.55}));body.position.y=1.05;mesh.add(body);
      const head=new THREE.Mesh(new THREE.SphereGeometry(.31,12,8),new THREE.MeshStandardMaterial({color:0xffffff}));head.position.y=2.06;mesh.add(head);
      const marker=new THREE.Mesh(new THREE.ConeGeometry(.18,.38,6),new THREE.MeshBasicMaterial({color}));marker.position.y=2.7;mesh.add(marker);
      this.game.scene.add(mesh);a={mesh,target:new THREE.Vector3(p.x,p.y,p.z),player:p};this.avatars.set(p.id,a);
    }a.player=p;a.target.set(p.x,p.y,p.z);if(!a.mesh.position.lengthSq())a.mesh.position.copy(a.target);}
    for(const [id,a] of this.avatars)if(!alive.has(id)){this.game.scene.remove(a.mesh);a.mesh.traverse(v=>{v.geometry?.dispose();v.material?.dispose();});this.avatars.delete(id);}
  }
  clearAvatars(){for(const a of this.avatars.values()){this.game.scene.remove(a.mesh);a.mesh.traverse(v=>{v.geometry?.dispose();v.material?.dispose();});}this.avatars.clear();}
}
