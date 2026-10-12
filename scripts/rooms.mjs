import { WebSocketServer } from 'ws';
import { randomBytes } from 'node:crypto';

const rooms = new Map();
const clients = new Set();
const validName = value => String(value || '').trim().slice(0, 16) || '플레이어';
const send = (ws, data) => { if (ws.readyState === 1) ws.send(JSON.stringify(data)); };
const publicRoom = room => ({ code: room.code, name: room.name, mode: room.mode, city:room.city, count: room.players.size, capacity: room.capacity, phase: room.phase });
const playerView = p => ({ id:p.id, name:p.name, ready:p.ready, team:p.team, health:p.health, eliminated:p.eliminated, x:p.x, y:p.y, z:p.z, facing:p.facing });
const broadcast = (room, data) => { for (const p of room.players.values()) send(p.ws, data); };
const roomState = room => ({ type:'room', room:publicRoom(room), players:[...room.players.values()].map(playerView), host:room.host, endsAt:room.endsAt || null, winner:room.winner || null });
const publish = room => { broadcast(room, roomState(room)); publishList(); };
const publishList = () => { const data={type:'rooms', rooms:[...rooms.values()].filter(r=>r.phase==='waiting').map(publicRoom)}; for (const ws of clients) send(ws,data); };
const error = (ws, message) => send(ws,{type:'error',message});
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
  publish(room);
}
function join(ws, room, name, city) {
  if(!room || room.phase!=='waiting') return error(ws,'참가 가능한 방이 없습니다.');
  if(room.players.size>=room.capacity) return error(ws,'방이 가득 찼습니다.');
  if(room.city!==city)return send(ws,{type:'switch-city',city:room.city,code:room.code});
  if(ws.player) leave(ws);
  const id=randomBytes(8).toString('hex');
  const p={ws,id,room:room.code,name:validName(name),ready:false,team:null,health:100,eliminated:false,x:0,y:0,z:0,facing:0,lastMove:0,lastAttack:0};
  room.players.set(id,p);ws.player=p;
  send(ws,{type:'joined',id});publish(room);
}
function start(room) {
  const players=[...room.players.values()];
  if(players.length<4 || players.some(p=>!p.ready)) return;
  room.phase='playing';room.winner=null;room.endsAt=room.mode==='tag'?Date.now()+5*60_000:0;
  const shuffled=[...players];
  for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
  const policeCount=room.mode==='tag'?(players.length>=7?2:1):0;
  shuffled.forEach((p,i)=>{p.team=room.mode==='tag'?(i<policeCount?'police':'runner'):'free';p.health=100;p.eliminated=false;p.x=0;p.y=0;p.z=0;p.lastMove=0;p.lastAttack=0;});
  publish(room);
}
function handle(ws, data) {
  if(!data || typeof data!=='object')return;
  if(data.type==='list') return publishList();
  if(data.type==='create') {
    const capacity=Number(data.capacity);
    if(!Number.isInteger(capacity)||capacity<4||capacity>8) return error(ws,'정원은 4~8명입니다.');
    const room={code:code(),name:String(data.name||'새 방').trim().slice(0,24)||'새 방',mode:data.mode==='tag'?'tag':'free',city:data.city==='hong-kong'?'hong-kong':'procedural',capacity,phase:'waiting',players:new Map(),host:null,endsAt:0,winner:null};
    rooms.set(room.code,room);join(ws,room,data.playerName,room.city);room.host=ws.player?.id;publish(room);return;
  }
  if(data.type==='join') return join(ws,rooms.get(String(data.code||'').trim().toUpperCase()),data.playerName,data.city);
  const p=ws.player, room=p&&rooms.get(p.room);if(!room)return;
  if(data.type==='leave') {leave(ws);send(ws,{type:'left'});return;}
  if(data.type==='ready' && room.phase==='waiting') {p.ready=!!data.ready;publish(room);return;}
  if(data.type==='start' && room.host===p.id && room.phase==='waiting') {
    if(room.players.size<4)return error(ws,'최소 4명이 모여야 시작할 수 있습니다.');
    if([...room.players.values()].some(v=>!v.ready))return error(ws,'모든 플레이어가 준비해야 합니다.');
    start(room);return;
  }
  if(data.type==='rematch' && room.host===p.id && room.phase==='finished') {room.phase='waiting';room.winner=null;room.endsAt=0;for(const v of room.players.values()){v.ready=false;v.eliminated=false;v.health=100;v.team=null;}publish(room);return;}
  if(room.phase!=='playing'||p.eliminated)return;
  if(data.type==='move') {
    const coords=[data.x,data.y,data.z,data.facing];
    if(coords.some(n=>!Number.isFinite(n))||Math.abs(data.x)>2500||Math.abs(data.z)>2500||data.y < -100 || data.y>1000)return;
    const now=Date.now();if(now-p.lastMove<40)return;
    const distance=Math.hypot(data.x-p.x,data.y-p.y,data.z-p.z);
    if(p.lastMove && distance>Math.max(20,(now-p.lastMove)*0.15))return;
    p.x=data.x;p.y=data.y;p.z=data.z;p.facing=data.facing;p.lastMove=now;
    broadcast(room,{type:'move',id:p.id,x:p.x,y:p.y,z:p.z,facing:p.facing});return;
  }
  if(data.type==='attack' && room.mode==='tag' && p.team==='police') {
    const kind=data.kind==='web'?'web':'punch',now=Date.now();
    if(Number.isFinite(data.facing))p.facing=data.facing;
    const cooldown=kind==='web'?1600:650;if(now-p.lastAttack<cooldown)return;
    p.lastAttack=now;
    const reach=kind==='web'?24:3.2;
    const target=[...room.players.values()].filter(v=>v.team==='runner'&&!v.eliminated)
      .map(v=>({v,d:Math.hypot(v.x-p.x,v.z-p.z),dy:Math.abs(v.y-p.y)}))
      .filter(({v,d,dy})=>d<=reach&&dy<(kind==='web'?9:2.7)&&(!d||Math.cos(Math.atan2(v.x-p.x,v.z-p.z)-p.facing)>0.2))
      .sort((a,b)=>a.d-b.d)[0]?.v;
    if(!target)return;
    target.health=Math.max(0,target.health-(kind==='web'?15:25));
    if(target.health===0)target.eliminated=true;
    broadcast(room,{type:'hit',attacker:p.id,target:target.id,kind,health:target.health,eliminated:target.eliminated});
    if([...room.players.values()].filter(v=>v.team==='runner').every(v=>v.eliminated))finish(room,'police');
  }
}
export function attachRooms(server) {
  if (!server) return;
  const wss = new WebSocketServer({ noServer: true });

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
    publishList();
    ws.on('message', raw => {
      if (raw.length > 2048) return;
      try {
        handle(ws, JSON.parse(raw.toString()));
      } catch {
        error(ws, '요청을 처리할 수 없습니다.');
      }
    });
    ws.on('close', () => {
      clients.delete(ws);
      leave(ws);
    });
  });

  const ticker = setInterval(() => {
    for (const room of rooms.values()) {
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
