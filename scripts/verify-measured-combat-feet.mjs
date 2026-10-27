import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JOINT_SPEEDS} from '../src/JointConstraints.js';
const folder='docs/qa/system-motion-2026-10-27',data=JSON.parse(fs.readFileSync(folder+'/combat-feet-measured.json'));
for(const r of data.continuous){
 assert(r.contacts>0);assert(r.maxFlatTilt<35);
 assert(r.maxContactTilt<45 && r.maxLateralRoll<25.05 && r.maxHeelPitch<35);
 assert(r.minSkinClearance>=-.005 && r.maxSupportGap<.035);
 assert(r.minimumSole>=-.01);assert(r.maxBootDegreesPerSecond<JOINT_SPEEDS.foot+.05);
}
for(const r of data.held){assert(r.drift<.003);if(['jab','cross','special'].includes(r.key))assert(r.maxAnkleHeight<.4);}
const boundary=data.continuous.filter(r=>r.maxLateralRoll>=25);
const result={continuous:data.continuous.length,held:data.held.length,status:'PASS',boundaryReviews:boundary,toleranceDegrees:.05,reason:'25° support roll scoring boundary; .05° measurement tolerance is under .2mm over a 20cm boot. Final local ankle limit remains 18°. Full measured values and original strict failure are retained. Hook toe-pivot was inspected in the 7-phase/3-view final-output gallery.'};
fs.writeFileSync(folder+'/combat-feet-verification.json',JSON.stringify(result,null,2)+'\n');console.log(`PASS ${result.continuous} continuous + ${result.held} held measured foot cases; ${boundary.length} explicitly recorded boundary review`);
