import assert from 'node:assert/strict';
import {motionReviewDuration} from '../src/MotionFrameReview.js';
import {ATTACKS,FIREARMS} from '../src/Combat.js';
for(const [key,attack] of Object.entries(ATTACKS))assert.equal(motionReviewDuration(key,'none'),attack.duration,key);
for(const [key,config] of Object.entries(FIREARMS))assert.equal(motionReviewDuration('gunReload',key),config.reload,key);
for(const [key,duration] of Object.entries({dodgeLeft:.38,dodgeRight:.38,dodgeBack:.42,dodgeForward:.52,hitHead:.65,hitBody:.85,hitHeavy:1.05}))assert.equal(motionReviewDuration(key,'none'),duration,key);
console.log('PASS frame review uses gameplay action durations');
