import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

export function assessDeviceReport(report,{sourceId,minimumSeconds=1800,p95LimitMs=34,minimumFps=28,maximumStallMs=1000}={}){
 report=report&&typeof report==='object'?report:{};
 const seconds=report.measuredActiveSeconds,frames=report.summary?.frames;
 const duration=Number.isFinite(seconds)&&seconds>=minimumSeconds;
 const samples=Number.isSafeInteger(frames)&&frames>0;
 const fps=duration&&samples?frames/seconds:null;
 const checks=[{name:'Current build',pass:!!sourceId&&report.sourceId===sourceId},
  {name:'Real active duration',pass:duration},
  {name:'Frame samples',pass:samples},
  {name:'P95 frame budget',pass:Number.isFinite(report.summary?.p95Ms)&&report.summary.p95Ms>0&&report.summary.p95Ms<=p95LimitMs},
  {name:'Sustained average frame rate',pass:Number.isFinite(fps)&&fps>=minimumFps},
  {name:'Worst active stall',pass:Number.isFinite(report.summary?.worstMs)&&report.summary.worstMs>=report.summary?.p95Ms&&report.summary.worstMs<=maximumStallMs}];
 return {status:checks.every(c=>c.pass)?'PASS':'FAIL',minimumSeconds,p95LimitMs,minimumFps,maximumStallMs,averageFps:fps,checks,
  heap:report.capabilities?.heap?'Reported heap trend requires GC-aware review':'Unavailable on this browser',
  thermal:'Requires physical device observation',battery:'Requires physical device observation',
  scope:'Duration and frame-budget gate only; not a complete physical-device qualification'};
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href){const report=JSON.parse(fs.readFileSync(process.argv[2]));const release=JSON.parse(fs.readFileSync('dist/release.json'));const result=assessDeviceReport(report,{sourceId:release.sourceId});console.log(JSON.stringify(result,null,2));if(result.status!=='PASS')process.exitCode=1;}
