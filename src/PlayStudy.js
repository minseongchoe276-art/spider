const lessons=new Set(['walk','jump','swing','land','wall','hit']);
const missions=new Set(['rooftops','discover','travel','delivery','technique']);
const reasons=new Set(['user','replaced','left-solo','restart']);
// Bounded in memory, included only in the player's explicitly downloaded report.
export class PlayStudy {
 constructor(){this.seconds=0;this.events=[];this.activeLesson=null;this.mission=null;this.match=null;}
 tick(dt){if(Number.isFinite(dt)&&dt>0)this.seconds+=Math.min(dt,60);}
 add(event){this.events.push({seconds:Math.round(this.seconds),...event});if(this.events.length>256)this.events.shift();}
 lesson(key){if(!lessons.has(key)||this.activeLesson?.key===key)return;
  this.endLesson('completed');this.activeLesson={key,started:this.seconds};}
 endLesson(result){if(!this.activeLesson)return;this.add({kind:'lesson',name:this.activeLesson.key,result:result==='completed'?'completed':'dismissed',duration:Math.round(this.seconds-this.activeLesson.started)});this.activeLesson=null;}
 startMission(type){if(!missions.has(type))return;this.endMission('replaced');this.mission={type,started:this.seconds};}
 endMission(result){if(!this.mission)return;
  this.add({kind:'mission',name:this.mission.type,result:result==='completed'?'completed':'abandoned',reason:result==='completed'?null:reasons.has(result)?result:'user',duration:Math.round(this.seconds-this.mission.started)});this.mission=null;}
 matchState(room,players,id,winner){
  if(!room)return;if(room.phase==='playing'&&!this.match){const me=players.find(p=>p.id===id);if(!me)return;
   this.match={mode:['free','tag','custom'].includes(room.mode)?room.mode:'unknown',format:room.format==='teams'?'teams':'ffa',players:Math.min(8,players.length),team:me.team,
    city:['procedural','harbor','gardens','old-town','skyline','hong-kong'].includes(room.city)?room.city:'unknown',role:['police','runner','red','blue'].includes(me.team)?me.team:'individual',started:this.seconds};}
  if(room.phase==='finished'&&this.match){const m=this.match;this.add({kind:'match',mode:m.mode,format:m.format,players:m.players,
   city:m.city,role:m.role,result:winner==='draw'?'draw':winner===id||winner===m.team?'won':'lost',duration:Math.round(this.seconds-m.started)});this.match=null;}
 }
 report(){return {activeSeconds:Math.round(this.seconds),events:this.events.map(e=>({...e})),activeLesson:this.activeLesson?.key||null,activeMission:this.mission?.type||null};}
}
