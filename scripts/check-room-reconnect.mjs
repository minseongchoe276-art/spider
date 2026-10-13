import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import WebSocket from 'ws';
import {attachRooms} from './rooms.mjs';
const server=createServer(),api=attachRooms(server),sockets=[];
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function connect(){const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`);ws.events=[];ws.on('message',raw=>ws.events.push(JSON.parse(raw)));sockets.push(ws);await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});return ws;}
const send=(ws,p)=>ws.send(JSON.stringify(p));
async function wait(ws,p){const end=Date.now()+2500;while(Date.now()<end){const i=ws.events.findIndex(p);if(i>=0)return ws.events.splice(i,1)[0];await pause(10);}throw Error('Room event timed out');}
try{
 const host=await connect(),peer=await connect();send(host,{type:'create',mode:'free',city:'procedural',capacity:2});const joined=await wait(host,e=>e.type==='joined');
 send(peer,{type:'join',code:joined.code,city:'procedural'});const friend=await wait(peer,e=>e.type==='joined');
 for(const ws of [host,peer])send(ws,{type:'ready',ready:true});await wait(host,e=>e.type==='room'&&e.players.length===2&&e.players.every(p=>p.ready));send(host,{type:'start'});await wait(peer,e=>e.type==='room'&&e.room.phase==='playing');
 peer.close();await new Promise(r=>peer.once('close',r));await pause(30);
 const room=api.rooms.get(joined.code);assert(room.players.has(friend.id),'Free-play disconnect removed membership instead of preserving it');
 const resumed=await connect();send(resumed,{type:'resume',code:joined.code,token:friend.resumeToken});const back=await wait(resumed,e=>e.type==='joined');assert.equal(back.id,friend.id);assert.equal(room.players.get(friend.id).disconnectedAt,0);
 // Disconnected players must also expire if the match ends during the grace period.
 resumed.close();await new Promise(r=>resumed.once('close',r));await pause(30);room.phase='finished';room.players.get(friend.id).disconnectedAt=Date.now()-31000;
 await pause(1150);assert(!room.players.has(friend.id),'Finished match retained an expired disconnected seat');
 console.log('PASS real WebSocket: free-play reconnection preserves identity; finished-match disconnected seats expire');
}finally{for(const ws of sockets)ws.terminate();await new Promise(r=>server.close(r));}
