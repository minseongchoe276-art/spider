import assert from 'node:assert/strict';
import {SupabaseRooms} from '../src/SupabaseRooms.js';
const old=globalThis.WebSocket;globalThis.WebSocket={CONNECTING:0,OPEN:1,CLOSED:3};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function transport(){const t=Object.create(SupabaseRooms.prototype),events=[];
  Object.assign(t,{readyState:1,roomCode:'OLD',channel:null,controlQueue:Promise.resolve(),
    emit:e=>events.push(e),client:{removeChannel:async()=>{},realtime:{disconnect(){}}}});return {t,events};}
try {
  {
    const {t,events}=transport(),auth=deferred();let opened=0,signedIn=0,setAuth=0;
    t.readyState=0;t.onopen=()=>opened++;
    t.client.auth={getSession:()=>auth.promise,signInAnonymously:()=>signedIn++};
    t.client.realtime.setAuth=async()=>setAuth++;
    const opening=t.open();t.close();auth.resolve({data:{session:null},error:null});await opening;
    assert.equal(t.readyState,3);assert.equal(opened,0);assert.equal(signedIn,0);assert.equal(setAuth,0);
    assert.equal(t.listTimer,undefined);assert.equal(t.heartbeatTimer,undefined);assert.equal(events.length,0);
    console.log('PASS closing during authentication cannot resurrect a transport or background timers');
  }
  {
    const {t,events}=transport(),entry=deferred();let subscriptions=0;
    t.enter=()=>entry.promise;t.subscribe=async()=>subscriptions++;
    const joining=t.dispatch({type:'join',code:'NEW'});t.close();
    entry.resolve({room:{code:'NEW',city:'procedural'}});await joining;
    assert.equal(t.roomCode,null);assert.equal(subscriptions,0);assert.equal(events.length,0);
    console.log('PASS a late join response cannot restore a closed room');
  }
  {
    const {t}=transport(),gate=deferred();let calls=0;t.controlQueue=gate.promise;t.dispatch=async()=>calls++;
    t.send(JSON.stringify({type:'create'}));t.close();gate.resolve();await t.controlQueue;
    assert.equal(calls,0);assert.equal(t.entryPending,false);
    console.log('PASS queued room commands are cancelled when their transport closes');
  }
  {
    const {t}=transport(),removal=deferred();let channels=0;t.channel={};
    t.client.removeChannel=()=>removal.promise;t.client.channel=()=>{channels++;throw Error('must not subscribe');};
    const subscribing=t.subscribe('NEW');t.close();removal.resolve();await subscribing;
    assert.equal(t.channel,null);assert.equal(t.roomCode,null);assert.equal(channels,0);
    console.log('PASS closing during channel removal prevents a replacement subscription');
  }
}finally{globalThis.WebSocket=old;}
