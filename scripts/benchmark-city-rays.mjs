import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import * as T from 'three';
import {City} from '../src/City.js';
const previous=execFileSync('git',['show','HEAD:src/City.js'],{encoding:'utf8'});
const body=previous.slice(previous.indexOf('  raycast(origin'),previous.indexOf('  // Test collision against'));
const baseline=Function('THREE','return function '+body.trim().replace(/^raycast/,'')+';')(T);
let seed=41;const random=()=>((seed=Math.imul(seed,1664525)+1013904223|0)>>>0)/2**32;
const city=Object.create(City.prototype);city.colliders=Array.from({length:184},()=>{const x=random()*320-160,z=random()*320-160;return {minX:x,maxX:x+16,minY:0,maxY:20+random()*130,minZ:z,maxZ:z+16};});
const rays=Array.from({length:10000},(_,i)=>[new T.Vector3(random()*320-160,random()*150,random()*320-160),new T.Vector3(random()-.5,random()-.5,random()-.5).normalize(),i%2?6:130]);
function measure(fn){const start=performance.now();for(const args of rays)fn.call(city,...args);return performance.now()-start;}
measure(baseline);measure(City.prototype.raycast);const before=[],after=[];
for(let i=0;i<5;i++){if(i%2){after.push(measure(City.prototype.raycast));before.push(measure(baseline));}else{before.push(measure(baseline));after.push(measure(City.prototype.raycast));}}
const median=a=>[...a].sort((a,b)=>a-b)[2],report={scope:'CPU raycast microbenchmark, not frame rate or GPU performance',colliders:184,rays:10000,baselineCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),beforeMs:median(before),afterMs:median(after),before,after};report.speedup=report.beforeMs/report.afterMs;
fs.writeFileSync('docs/qa/quality-upgrade-2026-10-28/raycast-benchmark.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
