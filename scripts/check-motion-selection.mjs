import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {MOTIONS} from '../src/MotionCatalog.js';
import {ATTACKS} from '../src/Combat.js';
import {sampleCombatReviewPose} from '../src/CombatReviewPose.js';
import {heavyClipPhase} from '../src/CharacterPose.js';
import {loadMotionRig, disposeRig} from './lib/motion-rig.mjs';

const {actor} = await loadMotionRig(), results = [];
const cases = [
  ['IDLE',0,0,'idle'], ['RUNNING',1.6,0,'walk'],
  ['RUNNING',4.8,0,'regularRun'], ['SPRINTING',6.5,0,'run'],
  ['TURNING',0,0,'turnLeft','left'], ['TURNING',0,0,'turnRight','right'],
  ['JUMPING',0,7,'jump'], ['FALLING',0,-3,'drop'],
  ['FALLING',0,-18,'drop'], ['LANDING',0,0,'land'],
  ['ROLLING',0,0,'roll'], ['SWINGING',10,-2,'swing'],
  ['WEB_ZIP',12,6,'zip'], ['WALL_RUNNING',0,2.8,'wall'],
];
for (const fps of [24,30,60,144]) {
  for (const [state,speed,y,key,turn] of cases) {
    const c=actor();
    try {
      c.pendingTurn=turn;c.targetFacingAngle=turn==='left'?-Math.PI/2:turn?Math.PI/2:0;
      c.contactTime=1;c.wallNormal=new THREE.Vector3(0,0,1);c.wallDistance=.7;
      if (!['IDLE','RUNNING','SPRINTING','TURNING','LANDING','ROLLING'].includes(state)) {
        c.group.position.y=4;c.groundProbe=()=>null;
      }
      const anchor=new THREE.Vector3(0,18,8),v=new THREE.Vector3(0,y,speed);
      for (let i=0;i<Math.ceil(fps*.4);i++) {
        c.update(1/fps,state,v,['SWINGING','WEB_ZIP'].includes(state)?anchor:null);
        const expected=state==='FALLING' && i/fps>=.24?'fall':key;
        assert.equal(c.activeAction?.getClip().name,expected,`${fps} FPS ${state}`);
      }
      results.push({fps,state,speed,y,selected:key});
    } finally {disposeRig(c);}
  }
  for (const [state,speed,stop] of [['RUNNING',1.6,'stop'],['RUNNING',4.8,'stop'],['SPRINTING',6.5,'runStop']]) {
    const c=actor();
    try {
      c.update(1/fps,state,new THREE.Vector3(0,0,speed));
      c.update(1/fps,'IDLE',new THREE.Vector3());
      assert.equal(c.activeAction.getClip().name,stop);
      for(let i=0;i<fps*3;i++)c.update(1/fps,'IDLE',new THREE.Vector3());
      assert.equal(c.activeAction.getClip().name,'idle','Stop must release to idle');
      results.push({fps,state,speed,selected:stop,recovered:'idle'});
    } finally {disposeRig(c);}
  }
  for(const key of [...Object.keys(ATTACKS),'guard','combatIdle','hitHead','dodgeLeft','dodgeRight','dodgeBack','dodgeForward','slam','slamLand']) {
    const c=actor();
    try {
      const state=key==='slam'?'FALLING':key==='slamLand'?'LANDING':'IDLE';
      c.combatAction={id:1,key,time:.2,duration:ATTACKS[key]?.duration || 1};
      c.update(1/fps,state,new THREE.Vector3());
      const selected=key.startsWith('dodge')?'combatIdle':key;
      assert.equal(c.activeAction.getClip().name,selected,`${fps} FPS ${key}`);
      results.push({fps,state,combat:key,selected});
    } finally {disposeRig(c);}
  }
}
// Exercise the same function used by the browser, through Character.update.
// These assertions catch preview aliases and heavy's nonlinear source clock.
for(const key of ['combatIdle','jab','cross','rightHook','hook','heavy','special','guard','slam','slamLand','hitHead','hitUppercut']) {
  const c=actor();
  try {
    const sample=sampleCombatReviewPose(c,{key,id:1});
    assert.equal(sample.active,key,'Preview replaced selected '+key);
    const clip=c.actions[key].getClip();
    assert(Math.abs(c.activeAction.time/clip.duration-(clip.userData.impactPhase ?? .45))<1e-5,`${key}: default preview missed contact`);
    if(key==='slamLand')assert.equal(c.poseState,'LANDING');
    results.push({preview:key,...sample,clipPhase:c.activeAction.time/clip.duration});
  } finally {disposeRig(c);}
}
for(const speed of [0,4.4,6.5])for(const key of ['jab','cross','heavy','special','slam','slamLand']) {
  const c=actor();
  try {
    const sample=sampleCombatReviewPose(c,{key,phase:.5,speed,id:1});
    const fullBody=!speed || key==='special' || key==='slam' || key==='slamLand';
    assert.equal(sample.active,fullBody?key:speed>5?'run':'regularRun');
    assert.equal(c.combatAction.key,key);
    if(fullBody)assert(Math.abs(c.activeAction.time/c.activeAction.getClip().duration-(key==='heavy'?heavyClipPhase(.5):.5))<1e-5);
    results.push({preview:key,speed,explicitPhase:.5,...sample});
  } finally {disposeRig(c);}
}
const folder=process.env.MOTION_SELECTION_DIR || 'docs/qa/motion-selection-2026-10-25';
fs.mkdirSync(folder,{recursive:true});
fs.writeFileSync(folder+'/selection-results.json',JSON.stringify({motions:MOTIONS.length,cases:results.length,results},null,2)+'\n');
console.log(`PASS: ${MOTIONS.length} registered motions; ${results.length} state/stop/combat/preview selection cases at 24/30/60/144 FPS`);
