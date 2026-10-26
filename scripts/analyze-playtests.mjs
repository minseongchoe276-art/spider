import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

// Aggregate explicit local exports, keeping only the latest snapshot per session.
export function analyzePlaytests(reports){
 const latest=new Map();
 for(const r of reports){if(r.version!==2||typeof r.sessionId!=='string'||!Number.isFinite(r.measuredActiveSeconds))throw Error('Expected version-2 diagnostics with a local session identity');
  if(!latest.has(r.sessionId)||latest.get(r.sessionId).measuredActiveSeconds<r.measuredActiveSeconds)latest.set(r.sessionId,r);}
 const groups=new Map(),lessons=new Map(),missions=new Map(),balance=new Map();
 const tally=(map,key,event)=>{let v=map.get(key);if(!v){v={completed:0,abandoned:0,durationSeconds:0};map.set(key,v);}
  if(event.result==='completed'){v.completed++;v.durationSeconds+=event.duration;}else if(['dismissed','abandoned'].includes(event.result))v.abandoned++;};
 for(const r of latest.values()){
  const key=JSON.stringify([r.sourceId,r.city,!!r.touch,r.viewport,r.quality]);let g=groups.get(key);
  if(!g){g={sourceId:r.sourceId,city:r.city,touch:!!r.touch,viewport:r.viewport,quality:r.quality,sessions:0,activeSeconds:0,p95Ms:[],longSessions:0};groups.set(key,g);}
  g.sessions++;g.activeSeconds+=r.measuredActiveSeconds;if(Number.isFinite(r.summary?.p95Ms))g.p95Ms.push(r.summary.p95Ms);if(r.measuredActiveSeconds>=1800)g.longSessions++;
  for(const e of r.study?.events||[]){if(!Number.isFinite(e.duration)||e.duration<0)continue;
   if(e.kind==='lesson')tally(lessons,JSON.stringify([r.sourceId,e.name]),e);
   if(e.kind==='mission')tally(missions,JSON.stringify([r.sourceId,e.name]),e);
   if(e.kind==='match'&&['won','lost','draw'].includes(e.result)){
    const key=JSON.stringify([r.sourceId,e.city,e.mode,e.format,e.players,e.role]);let v=balance.get(key);
    if(!v){v={won:0,lost:0,draw:0};balance.set(key,v);}v[e.result]++;
   }
  }
 }
 const serialize=map=>[...map].map(([group,value])=>({group:JSON.parse(group),...value}));
 return {sessions:latest.size,performance:[...groups.values()],lessons:serialize(lessons),missions:serialize(missions),balance:serialize(balance),
  scope:'Local observations only. A session is not a verified unique/new human; match records are correlated participant observations, not independent matches. Device sensors and asset rights are not inferred.'};
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href){if(process.argv.length<3)throw Error('Usage: node scripts/analyze-playtests.mjs DIAGNOSTICS.json [...]');console.log(JSON.stringify(analyzePlaytests(process.argv.slice(2).map(p=>JSON.parse(fs.readFileSync(p)))),null,2));}
