import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import WebSocket from 'ws';
import {attachRooms} from './rooms.mjs';

process.env.GAME_ADMIN_TOKEN='test-admin-key';
const server=createServer((req,res)=>res.end('ok'));
attachRooms(server);
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`ws://127.0.0.1:${server.address().port}/ws`;
const sockets=[];
const connect=()=>new Promise((resolve,reject)=>{
  const ws=new WebSocket(url);
  ws.events=[];
  ws.on('message',raw=>ws.events.push(JSON.parse(raw)));
  ws.once('open',()=>{sockets.push(ws);resolve(ws);});
  ws.once('error',reject);
});
const send=(ws,data)=>ws.send(JSON.stringify(data));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async(ws,predicate)=>{
  const end=Date.now()+2500;
  while(Date.now()<end){
    const index=ws.events.findIndex(predicate);
    if(index>=0) return ws.events.splice(index,1)[0];
    await sleep(10);
  }
  throw Error(`Timed out: ${JSON.stringify(ws.events)}`);
};
function assertPrivate(value){
  if(Array.isArray(value)) return value.forEach(assertPrivate);
  if(!value || typeof value!=='object') return;
  for(const [key,child] of Object.entries(value)){
    assert(!['x','y','z','facing','id','resumeToken','user_id','token'].includes(key), key);
    assertPrivate(child);
  }
}
try{
  const [host,friend,solo,lobby]=await Promise.all([connect(),connect(),connect(),connect()]);
  assert((await wait(host,event=>event.type==='welcome')).features.includes('admin-overview'));
  send(host,{type:'create',name:'운영 방',mode:'tag',capacity:4,city:'hong-kong',playerName:'호스트'});
  const opened=await wait(host,event=>event.type==='room'&&event.room.count===1);
  const code=opened.room.code;
  send(friend,{type:'join',code,city:'hong-kong',playerName:'친구'});
  await wait(host,event=>event.type==='room'&&event.room.count===2);
  for(const ws of [host,friend]) send(ws,{type:'ready',ready:true});
  await wait(host,event=>event.type==='room'&&event.players.every(player=>player.ready));
  send(host,{type:'start'});
  await wait(host,event=>event.type==='room'&&event.room.phase==='playing');
  send(lobby,{type:'list'});
  const listed=await wait(lobby,event=>event.type==='rooms');
  assert(!listed.rooms.some(room=>room.code===code),'A live match stayed on the public room list');
  send(solo,{type:'presence',activity:'solo'});
  let snap;
  for(let attempt=0;attempt<20;attempt++){
    send(lobby,{type:'admin',token:process.env.GAME_ADMIN_TOKEN});
    snap=await wait(lobby,event=>event.type==='admin'&&event.ok);
    if(snap.online.solo===1) break;
    await sleep(25);
  }
  assert.equal(snap.transport,'websocket');
  assert.equal(snap.online.connected,4);
  assert.equal(snap.online.playing,2);
  assert.equal(snap.online.solo,1);
  assert.equal(snap.online.lobby,1);
  assert.equal(snap.online.reconnecting,0);
  assert.equal(snap.rooms.playing,1);
  assert.equal(snap.rooms.waiting,0);
  const match=snap.matches.find(room=>room.code===code);
  assert.equal(match.phase,'playing');
  assert.equal(match.hostName,'호스트');
  assert.equal(match.players.length,2);
  assert.equal(typeof match.endsInSeconds,'number');
  assertPrivate(snap);

  friend.close();
  await wait(host,event=>event.type==='room'&&event.players.some(player=>player.connected===false));
  send(lobby,{type:'admin',token:process.env.GAME_ADMIN_TOKEN});
  const after=await wait(lobby,event=>event.type==='admin'&&event.ok&&event.online.reconnecting===1);
  assert.equal(after.online.connected,3);
  assert.equal(after.online.playing,1);
  assert.equal(after.online.lobby,1);
  assert.equal(after.online.solo,1);

  const stranger=await connect();
  for(let attempt=0;attempt<8;attempt++) send(stranger,{type:'admin',token:'not-the-key'});
  const failures=[];
  const deadline=Date.now()+2500;
  while(failures.length<8 && Date.now()<deadline){
    const index=stranger.events.findIndex(event=>event.type==='admin');
    if(index>=0) failures.push(stranger.events.splice(index,1)[0]);
    else await sleep(10);
  }
  assert.equal(failures.length,8);
  assert.equal(failures[0].ok,false);
  assert.equal(failures[0].matches,undefined);
  assert.match(failures[0].message,/올바르지/);
  assert.match(failures[7].message,/잠시 후/);
  send(stranger,{type:'admin',token:process.env.GAME_ADMIN_TOKEN});
  const blocked=await wait(stranger,event=>event.type==='admin');
  assert.equal(blocked.ok,false);
  assert.match(blocked.message,/잠시 후/);
  assert.equal(blocked.matches,undefined);
  send(lobby,{type:'admin',token:process.env.GAME_ADMIN_TOKEN});
  const still=await wait(lobby,event=>event.type==='admin'&&event.ok);
  assert.equal(still.online.connected,4);
  console.log('PASS admin overview: live counts, hidden matches, private roster, key lockout');
}finally{
  for(const ws of sockets) ws.close();
  await new Promise(resolve=>server.close(resolve));
}
