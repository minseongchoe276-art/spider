import {HongKongTerrain} from '../supabase/functions/_shared/hong-kong-terrain.js';
import { WebSocketServer } from 'ws';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { MATCH, policeCount } from '../src/MatchRules.js';
import { sanitizePose } from '../src/RemoteMotion.js';
import {PURSUIT,matchDuration,arenaFrom,arenaContains,validArenaPoint} from '../src/PursuitRules.js';
import {proceduralCollision,blockedSegment} from './city-collision.mjs';
import {attackGate,canAttack,opponents,guardedDamage,COMBAT_GROUND_STATES} from '../src/AttackRules.js';
import {LOCAL_CITY} from '../src/LocalCityLayout.js';

export const ROOM_FEATURES=['custom-matches','named-targets','attack-results','directional-guard','motion-phase','admin-overview'];
const rooms = new Map();
const clients = new Set();
const adminStrikes=[];
const serverStarted=Date.now();
const validName = value => String(value || '').trim().slice(0, 16) || '플레이어';
const send = (ws, data) => { if (ws.readyState === 1) ws.send(JSON.stringify(data)); };
const publicRoom = room => ({ code: room.code, name: room.name, mode: room.mode, format:room.format, city:room.city, count: room.players.size, capacity: room.capacity, phase: room.phase, enhanced:!!room.enhanced });
const playerView = p => ({ id:p.id, name:p.name, ready:p.ready, team:p.team, health:p.health, eliminated:p.eliminated, seen:!!p.seen, x:p.x, y:p.y, z:p.z, facing:p.facing, progress:p.progress||0, connected:p.ws?.readyState===1 });
const broadcast = (room, data) => { for (const p of room.players.values()) send(p.ws, data); };
const roomState = room => ({ type:'room', room:publicRoom(room), players:[...room.players.values()].map(playerView), host:room.host, endsAt:room.endsAt || null, vulnerableAt:room.vulnerableAt || null, serverNow:Date.now(), winner:room.winner || null, arena:room.arena||null, round:room.round||1, pulseUntil:room.pulseUntil||0, spawnAnchor:room.anchor||null });
const publish = room => { broadcast(room, roomState(room)); publishList(); };
const publishList = () => { const data={type:'rooms', rooms:[...rooms.values()].filter(r=>r.phase==='waiting').map(publicRoom)}; for (const ws of clients) send(ws,data); };
const error = (ws, message) => send(ws,{type:'error',message});
const sha256 = value => createHash('sha256').update(String(value)).digest();
const sameHash = (left, right) => Buffer.isBuffer(left) && Buffer.isBuffer(right) && left.length===right.length && left.length>0 && timingSafeEqual(left, right);
function adminAuthorized(token){
  if(typeof token!=='string' || token.length<1 || token.length>128) return false;
  // Never inherit a shared administrator credential from a published build.
  const configured=process.env.GAME_ADMIN_TOKEN;
  if(typeof configured!=='string'||configured.length<1||configured.length>128)return false;
  const given=sha256(token);
  const expected=sha256(configured);
  return sameHash(given, expected);
}
function adminLocked(ws){
  const now=Date.now();
  while(adminStrikes.length && now-adminStrikes[0]>60000) adminStrikes.shift();
  if(adminStrikes.length>=40) return true;
  if((ws.adminLockUntil||0)>now) return true;
  if(ws.adminLockUntil){ws.adminLockUntil=0;ws.adminFails=0;}
  return false;
}
function noteAdminFailure(ws){
  const now=Date.now();
  adminStrikes.push(now);
  while(adminStrikes.length && now-adminStrikes[0]>60000) adminStrikes.shift();
  ws.adminFails=(ws.adminFails||0)+1;
  if(ws.adminFails>=8) ws.adminLockUntil=now+60000;
}
function activityOf(ws){
  const room=ws.player && rooms.get(ws.player.room);
  if(room && ws.player.ws===ws && !ws.player.disconnectedAt) return 'room';
  if(ws.activity==='solo' && Date.now()-(ws.activityAt||0)<60000) return 'solo';
  return 'lobby';
}
function seatConnected(player){
  return !!(player.ws && clients.has(player.ws) && player.ws.readyState===1 && !player.disconnectedAt);
}
function adminTeam(team){
  return ['police','runner','red','blue','free'].includes(team) ? team : team ? 'ffa' : 'free';
}
function adminSnapshot(){
  const now=Date.now();
  const online={connected:0,lobby:0,solo:0,waiting:0,playing:0,finished:0,reconnecting:0};
  for(const ws of clients){
    const room=ws.player && rooms.get(ws.player.room);
    const kind=activityOf(ws);
    if(kind==='room'){
      if(room.phase==='playing') online.playing++;
      else if(room.phase==='finished') online.finished++;
      else online.waiting++;
    }else if(kind==='solo') online.solo++;
    else online.lobby++;
    online.connected++;
  }
  const matches=[];
  let seated=0, seats=0;
  const phases={waiting:0,playing:0,finished:0};
  for(const room of rooms.values()){
    seated+=room.players.size; seats+=room.capacity;
    if(room.phase==='playing'||room.phase==='finished'||room.phase==='waiting') phases[room.phase]++;
    for(const player of room.players.values()) if(!seatConnected(player)) online.reconnecting++;
    matches.push({
      code:room.code, name:room.name, mode:room.mode, format:room.format==='ffa'?'ffa':'teams', city:room.city,
      phase:room.phase, enhanced:!!room.enhanced, count:room.players.size, capacity:room.capacity, round:room.round||1,
      winner:room.winner||null,
      endsInSeconds:room.phase==='playing' && room.endsAt ? Math.max(0, Math.ceil((room.endsAt-now)/1000)) : null,
      ageSeconds:room.openedAt ? Math.max(0, Math.floor((now-room.openedAt)/1000)) : null,
      hostName:room.players.get(room.host)?.name || '방장',
      players:[...room.players.values()].map(player=>({
        name:player.name, team:adminTeam(player.team), ready:!!player.ready, health:player.health,
        eliminated:!!player.eliminated, connected:seatConnected(player), reconnecting:!seatConnected(player),
        host:room.host===player.id, idleSeconds:player.lastMove ? Math.max(0, Math.floor((now-player.lastMove)/1000)) : null,
      })),
    });
  }
  const order={playing:0,waiting:1,finished:2};
  matches.sort((a,b)=>(order[a.phase]??9)-(order[b.phase]??9) || (a.code<b.code?-1:1));
  return {
    transport:'websocket', serverNow:now, uptimeSeconds:Math.floor((now-serverStarted)/1000), protocol:2,
    online, rooms:{total:matches.length, ...phases, seated, seats}, matches:matches.slice(0,32), truncated:matches.length>32,
  };
}
function adminReply(ws, token){
  if(adminLocked(ws)) return {type:'admin', ok:false, message:'잠시 후 다시 시도하세요.'};
  if(!adminAuthorized(token)){
    noteAdminFailure(ws);
    return {type:'admin', ok:false, message:adminLocked(ws)?'잠시 후 다시 시도하세요.':'관리자 키가 올바르지 않습니다.'};
  }
  ws.adminFails=0; ws.adminLockUntil=0;
  return {type:'admin', ok:true, ...adminSnapshot()};
}
const code = () => { let value; do { value=randomBytes(3).toString('hex').toUpperCase(); } while(rooms.has(value)); return value; };
function finish(room, winner) { if(room.phase!=='playing') return; room.phase='finished'; room.winner=winner; room.endsAt=0; for(const p of room.players.values()) p.ready=false; publish(room); }
function leave(ws) {
  const p=ws.player;if(!p)return;
  const room=rooms.get(p.room); ws.player=null;
  if(!room)return;
  room.players.delete(p.id);
  if(!room.players.size) { rooms.delete(room.code);publishList();return; }
  if(room.host===p.id) room.host=room.players.keys().next().value;
  if(room.phase==='playing' && room.mode==='tag') {
    const active=[...room.players.values()].filter(v=>!v.eliminated);
    if(!active.some(v=>v.team==='runner')) finish(room,'police');
    else if(!active.some(v=>v.team==='police')) finish(room,'runner');
  }
  if(room.mode==='custom')checkCustomVictory(room);
  publish(room);
}
function join(ws, room, name, city) {
  if(!room || room.phase!=='waiting') return error(ws,'참가 가능한 방이 없습니다.');
  if(room.players.size>=room.capacity) return error(ws,'방이 가득 찼습니다.');
  if(room.city!==city)return send(ws,{type:'switch-city',city:room.city,code:room.code});
  if(ws.player) leave(ws);
  const id=randomBytes(8).toString('hex');
  const p={ws,id,resumeToken:randomBytes(24).toString('hex'),room:room.code,name:validName(name),ready:false,team:null,health:100,eliminated:false,seen:false,x:0,y:0,z:0,facing:0,lastMove:0,cooldowns:{punch:0,web:0}};
  if(room.mode==='custom')p.team=room.format==='ffa'?id:([...room.players.values()].filter(v=>v.team==='red').length<=[...room.players.values()].filter(v=>v.team==='blue').length?'red':'blue');
  room.players.set(id,p);ws.player=p;
  send(ws,{type:'joined',id,resumeToken:p.resumeToken,code:room.code});publish(room);
}
function start(room) {
  const players=[...room.players.values()];
  if(players.length<MATCH.minPlayers || players.some(p=>!p.ready)) return;
  if(room.mode==='custom'&&room.format==='teams'&&(!players.some(p=>p.team==='red')||!players.some(p=>p.team==='blue')))return;
  room.phase='playing';room.winner=null;
  room.endsAt=room.mode==='tag'?Date.now()+(room.enhanced?matchDuration(players.length):MATCH.durationMs):0;
  room.vulnerableAt=['tag','custom'].includes(room.mode)?Date.now()+MATCH.graceMs:0;
  const shuffled=[...players];
  for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
  if(room.enhanced){shuffled.sort((a,b)=>(a.policeRounds||0)-(b.policeRounds||0));room.arena=arenaFrom(room.anchor,room.city,room.roofs);}
  const cops=room.mode==='tag'?policeCount(players.length):0;
  shuffled.forEach((p,i)=>{p.team=room.mode==='custom'?(room.format==='ffa'?p.id:p.team):room.mode==='tag'?(i<cops?'police':'runner'):'free';if(p.team==='police')p.policeRounds=(p.policeRounds||0)+1;p.progress=0;p.goalAt=0;p.rescue=null;p.history=[];p.lifeEpoch=(p.lifeEpoch||0)+1;p.health=100;p.eliminated=false;p.seen=false;p.x=0;p.y=0;p.z=0;p.lastMove=0;p.cooldowns={punch:0,web:0};});
  publish(room);
}
async function handle(ws, data, terrain) {
  if(!data || typeof data!=='object')return;
  if(data.type==='resume'&&ws.player)return error(ws,'먼저 현재 방에서 나가세요.');
  if(data.type==='resume'){const room=rooms.get(String(data.code||''));const player=room&&[...room.players.values()].find(p=>p.resumeToken===data.token&&p.disconnectedAt&&Date.now()-p.disconnectedAt<30000);if(!player)return error(ws,'복귀 시간이 만료되었습니다.');player.ws=ws;player.disconnectedAt=0;ws.player=player;send(ws,{type:'joined',id:player.id,resumeToken:player.resumeToken,code:room.code});publish(room);return;}
  if(data.type==='list') return publishList();
  if(data.type==='presence'){ws.activity=data.activity==='solo'?'solo':'lobby';ws.activityAt=Date.now();return;}
  if(data.type==='admin') return send(ws, adminReply(ws, data.token));
  if(data.type==='create') {
    const capacity=Number(data.capacity);
    if(!Number.isInteger(capacity)||capacity<MATCH.minPlayers||capacity>MATCH.maxPlayers) return error(ws,`정원은 ${MATCH.minPlayers}~${MATCH.maxPlayers}명입니다.`);
    const room={code:code(),name:String(data.name||'새 방').trim().slice(0,24)||'새 방',mode:['tag','custom'].includes(data.mode)?data.mode:'free',format:data.format==='ffa'?'ffa':'teams',city:data.city==='hong-kong'?'hong-kong':'procedural',capacity,phase:'waiting',players:new Map(),host:null,endsAt:0,winner:null,enhanced:data.mode!=='custom'&&data.enhanced===true,round:1,openedAt:Date.now(),pendingHits:new Map()};
    rooms.set(room.code,room);join(ws,room,data.playerName,room.city);room.host=ws.player?.id;publish(room);return;
  }
  if(data.type==='join') return join(ws,rooms.get(String(data.code||'').trim().toUpperCase()),data.playerName,data.city);
  const p=ws.player, room=p&&rooms.get(p.room);if(!room)return;
  if(data.type==='leave') {leave(ws);send(ws,{type:'left'});return;}
  if(data.type==='team'&&room.mode==='custom'&&room.format==='teams'&&room.phase==='waiting'){
    if(!['red','blue'].includes(data.team))return error(ws,'레드 또는 블루 팀을 선택하세요.');
    if(p.team!==data.team){p.team=data.team;for(const v of room.players.values())v.ready=false;publish(room);}return;
  }
  if(data.type==='ready' && room.phase==='waiting') {
    if(room.mode==='custom'&&data.ready){
      if(!data.terrainReady)return error(ws,'지형 로딩이 완료된 뒤 준비하세요.');
      if(p.id===room.host){if(!validArenaPoint(data.spawn))return error(ws,'안전한 시작 위치를 준비하세요.');room.anchor={x:data.spawn.x,y:data.spawn.y,z:data.spawn.z};}
    }
    if(room.enhanced&&data.ready){
      if(!data.terrainReady)return error(ws,'지형 로딩이 완료된 뒤 준비하세요.');
      if(p.id===room.host){
        const arena=arenaFrom(data.spawn,room.city,Array.isArray(data.roofs)?data.roofs:[]);
        if(!arena)return error(ws,'안전한 시작점과 이동할 지형 두 곳 이상이 필요합니다.');
        // Own the validated values instead of retaining the request object.
        room.anchor={x:arena.x,y:arena.y,z:arena.z};
        room.roofs=arena.points.map(point=>({x:point.x,y:point.y,z:point.z}));
      }
    }
    p.ready=!!data.ready;publish(room);return;
  }
  if(data.type==='start' && room.host===p.id && room.phase==='waiting') {
    if(room.players.size<MATCH.minPlayers)return error(ws,`최소 ${MATCH.minPlayers}명이 모여야 시작할 수 있습니다.`);
    if([...room.players.values()].some(v=>!v.ready))return error(ws,'모든 플레이어가 준비해야 합니다.');
    if(room.enhanced&&!arenaFrom(room.anchor,room.city,room.roofs))return error(ws,'방장의 안전 지형 준비가 필요합니다.');
    if(room.mode==='custom'&&room.format==='teams'&&(![...room.players.values()].some(v=>v.team==='red')||![...room.players.values()].some(v=>v.team==='blue')))return error(ws,'양쪽 팀에 최소 1명씩 필요합니다.');
    start(room);return;
  }
  if(data.type==='rematch' && room.host===p.id && room.phase==='finished') {room.phase='waiting';room.round=(room.round||1)+1;room.winner=null;room.endsAt=0;for(const v of room.players.values()){v.ready=false;v.lifeEpoch=(v.lifeEpoch||0)+1;v.eliminated=false;v.health=100;if(room.mode!=='custom')v.team=null;}publish(room);return;}
  if(data.type==='ping'){send(ws,{type:'pong',stamp:data.stamp,serverNow:Date.now()});return;}
  if(room.phase!=='playing')return;
  if(data.type==='hit-confirm')return;
  if(p.eliminated)return;
  if(data.type==='move') {
    const coords=[data.x,data.y,data.z,data.facing];
    if(coords.some(n=>!Number.isFinite(n))||Math.abs(data.x)>2500||Math.abs(data.z)>2500||data.y < -100 || data.y>1000)return;
    const limit=room.city==='procedural'?LOCAL_CITY.playableHalfExtent:2400;
    if(Math.abs(data.x)>=limit || Math.abs(data.z)>=limit){send(ws,{type:'correction',x:p.x,y:p.y,z:p.z});return;}
    const now=Date.now();if(now-p.lastMove<40)return;
    if(room.enhanced&&!arenaContains(room.arena,data,3)){send(ws,{type:'correction',x:p.x,y:p.y,z:p.z});return;}
    const distance=Math.hypot(data.x-p.x,data.y-p.y,data.z-p.z);
    // A 20m burst absorbs jitter once; it must not be granted again for
    // every packet (which allowed 18m teleports at 20Hz). Normal movement
    // is capped at 48m/s; 72m/s refill leaves network/simulation headroom.
    const budget=p.lastMove?(p.moveBudget??20)+(now-p.lastMove)*0.072:20;
    if(p.lastMove&&distance>budget){send(ws,{type:'correction',x:p.x,y:p.y,z:p.z});return;}
    if(room.enhanced&&p.lastMove&&room.city==='procedural'&&blockedSegment(p,data,proceduralCollision().colliders)){send(ws,{type:'correction',x:p.x,y:p.y,z:p.z});return;}
    p.moveBudget=p.lastMove?Math.min(20,budget-distance):20;
    const previousMove=p.lastMove;
    p.x=data.x;p.y=data.y;p.z=data.z;p.facing=data.facing;p.seen=true;p.lastMove=now;
    if(room.enhanced){p.history||=[];p.history.push({x:p.x,y:p.y,z:p.z,time:now});p.history=p.history.filter(h=>now-h.time<600);advanceGoal(room,p,now,previousMove);}
    p.pose=sanitizePose(data.pose);p.allowRunnerGuard=room.mode==='tag'&&p.team==='runner';
    broadcast(room,{type:'move',id:p.id,x:p.x,y:p.y,z:p.z,facing:p.facing,pose:p.pose});return;
  }
  if(data.type==='attack' && canAttack(room,p)) {
    const kind=data.kind,now=Date.now(),rule=MATCH[kind];
    const reject=reason=>send(ws,{type:'attack-result',kind,reason});
    if(!['punch','web'].includes(kind))return reject('invalid');
    if(!p.seen || ((room.enhanced||room.city==='hong-kong'||room.mode==='custom')&&now-p.lastMove>1500))return reject('stale');
    if(now<(room.vulnerableAt||0))return reject('protected');
    // Q/releasing B can happen between the 10Hz movement packets. Use the
    // attack's current pose for its mode, without accepting a new position.
    const attackPose=sanitizePose(data.pose);if(attackPose)p.pose=attackPose;
    if(p.pose?.combat?.key==='guard'&&now-p.lastMove<=MATCH.guard.freshnessMs)return reject('guarding');
    if(kind==='web'&&p.pose?.combatStance)return reject('mode');
    if(kind==='punch'&&p.pose&&!COMBAT_GROUND_STATES.includes(p.pose.state))return reject('recovering');
    p.cooldowns||={punch:0,web:0};
    if(now-(p.cooldowns[kind]||0)<rule.cooldown)return reject('cooldown');
    p.cooldowns[kind]=now;
    const facing=Number.isFinite(data.facing)?data.facing:p.facing;
    // Modern clients name the exact highlighted opponent. Legacy clients keep
    // nearest-in-cone selection, without changing the target of a named shot.
    const candidates=[...room.players.values()].filter(v=>opponents(room,p,v)&&!v.eliminated&&v.seen);
    const target=Object.hasOwn(data,'targetId')?candidates.find(v=>v.id===data.targetId):candidates.filter(v=>!attackGate(p,v,kind,facing)).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
    if(!target)return reject('target');
    const reason=attackGate(p,target,kind,facing);if(reason)return reject(reason);
    if(target.disconnectedAt)return reject('stale');
    const damage=guardedDamage(p,target,kind,now);
    if(room.city==='hong-kong'){
      const round=room.round,life=target.lifeEpoch,attackerLife=p.lifeEpoch,from={x:p.x,y:p.y,z:p.z},to={x:target.x,y:target.y,z:target.z};
      const decision=await terrain.visibility(from,to);
      if(rooms.get(room.code)!==room||room.phase!=='playing'||room.round!==round||Date.now()-now>10000||room.players.get(p.id)!==p||room.players.get(target.id)!==target||target.lifeEpoch!==life||p.lifeEpoch!==attackerLife||p.eliminated||target.eliminated||p.disconnectedAt||target.disconnectedAt)return;
      if(decision.status==='UNKNOWN')return reject('terrain');
      if(decision.status!=='CLEAR'||!decision.version)return reject('blocked');
    }else if(blockedSegment(p,target,proceduralCollision().colliders))return reject('blocked');
    applyHit(room,p,target,kind,damage);
    return;
  }
}

function applyHit(room,attacker,target,kind,result=guardedDamage(attacker,target,kind)){if(!attacker||!target)return;
 target.health=Math.max(0,target.health-result.damage);target.eliminated=target.health===0;
 broadcast(room,{type:'hit',attacker:attacker.id,target:target.id,kind,...result,health:target.health,eliminated:target.eliminated});
 if(room.mode==='custom'){checkCustomVictory(room);return;}
 if([...room.players.values()].filter(v=>v.team==='runner').every(v=>v.eliminated))finish(room,'police');}
function checkCustomVictory(room){
 const alive=[...room.players.values()].filter(p=>!p.eliminated);
 const sides=new Set(alive.map(p=>p.team));
 if(sides.size<=1)finish(room,alive[0]?.team||'draw');
}
function advanceGoal(room,p,now,previousMove){if(room.mode!=='tag'||p.team!=='runner'||!room.arena?.points?.length)return;
 const target=room.arena.points[(p.progress||0)%room.arena.points.length];
 if(now-(p.goalAt||0)>=PURSUIT.checkpointCooldown&&Math.hypot(p.x-target.x,p.y-target.y,p.z-target.z)<PURSUIT.checkpointRadius){p.progress=(p.progress||0)+1;p.goalAt=now;publish(room);if(p.progress>=PURSUIT.goal)finish(room,'runner');}
 const ally=[...room.players.values()].find(v=>v.team==='runner'&&v.eliminated&&v.seen&&Math.hypot(v.x-p.x,v.y-p.y,v.z-p.z)<PURSUIT.reviveRadius
   &&(room.city!=='procedural'||!blockedSegment(p,v,proceduralCollision().colliders)));
 if(ally){if(p.rescue?.id!==ally.id||now-previousMove>500)p.rescue={id:ally.id,since:now};if(now-p.rescue.since>=PURSUIT.reviveMs){ally.lifeEpoch=(ally.lifeEpoch||0)+1;ally.health=50;ally.eliminated=false;p.rescue=null;publish(room);}}else p.rescue=null;}

export function attachRooms(server,options={}) {
  if (!server) return;
  const terrain=options.terrain||new HongKongTerrain();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });

  const onUpgrade = (request, socket, head) => {
    let pathname = '';
    try {
      pathname = new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname;
    } catch {
      pathname = request.url?.split('?')[0] || '';
    }

    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  };

  server.on('upgrade', onUpgrade);

  wss.on('connection', ws => {
    clients.add(ws);
    send(ws,{type:'welcome',protocol:2,features:ROOM_FEATURES});
    publishList();
    let windowAt=Date.now(),messages=0,controls=0;
    // ws emits an error before closing an over-limit frame. Keep that error
    // local to the offending connection rather than crashing the process.
    ws.on('error',()=>{});
    ws.on('message', async raw => {
      if (raw.length > 4096) return;
      try {
        const now=Date.now();if(now-windowAt>=1000){windowAt=now;messages=controls=0;}
        if(++messages>120){ws.close(1008,'Message rate exceeded');return;}
        const data=JSON.parse(raw.toString());
        if(['list','create','join','resume','ready','start','rematch'].includes(data?.type)&&++controls>20){ws.close(1008,'Command rate exceeded');return;}
        await handle(ws, data,terrain);
      } catch {
        error(ws, '요청을 처리할 수 없습니다.');
      }
    });
    ws.on('close', () => {
      clients.delete(ws);
      if(ws.player&&rooms.get(ws.player.room)?.phase==='playing'){ws.player.disconnectedAt=Date.now();publish(rooms.get(ws.player.room));}else leave(ws);
    });
  });

  const ticker = setInterval(() => {
    for (const room of rooms.values()) {
      const now=Date.now();
      for(const p of [...room.players.values()])if(p.disconnectedAt&&now-p.disconnectedAt>30000)leave(p.ws);
      if(!rooms.has(room.code))continue;
      if(room.enhanced&&room.phase==='playing'){for(const [id,hit] of room.pendingHits)if(now>hit.expires)room.pendingHits.delete(id);if(now-(room.lastPulse||0)>PURSUIT.pulseInterval){room.lastPulse=now;room.pulseUntil=now+PURSUIT.pulseLength;publish(room);}}
      if (room.phase === 'playing' && room.mode === 'tag' && Date.now() >= room.endsAt) {
        finish(room, 'runner');
      }
    }
  }, 1000);

  server.on('close', () => {
    clearInterval(ticker);
    server.off('upgrade', onUpgrade);
    wss.close();
  });

  return { rooms, wss };
}
