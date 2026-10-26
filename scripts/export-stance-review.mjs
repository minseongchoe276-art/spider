import fs from 'node:fs';
import crypto from 'node:crypto';
import * as T from 'three';
import {loadMotionRig,disposeRig} from './lib/motion-rig.mjs';
const {actor}=await loadMotionRig(),rows=[];
for(const key of ['crouch','prone','crouch-move','prone-move','jab','cross','hook','heavy','special']){
 const c=actor(),frames=[],stance=key.startsWith('crouch')?'crouch':key.startsWith('prone')?'prone':null;
 const moving=key.endsWith('move') || !stance,v=new T.Vector3(0,0,stance?(moving?(stance==='crouch'?1.5:.7):0):4.4);
 c.combatStance=!stance;
 for(let i=0;i<60;i++)c.update(1/60,'IDLE',new T.Vector3());
 for(let i=0;i<150;i++){
  c.lowStance=stance;
  if(!stance)c.combatAction={id:1,key,time:Math.min(.9999,(i%60)/60),duration:1};
  c.group.position.addScaledVector(v,1/60);c.update(1/60,moving?'RUNNING':'IDLE',v);
  frames.push({model:{p:c.model.position.toArray(),q:c.model.quaternion.toArray()},bones:Object.values(c.bones).map(b=>[b.name,...b.position.toArray(),...b.quaternion.toArray()])});
 }
 rows.push({key,frames});disposeRig(c);
}
fs.mkdirSync('docs/qa/stance-combat-2026-10-26',{recursive:true});
fs.writeFileSync('docs/qa/stance-combat-2026-10-26/poses.json',JSON.stringify(rows,(_key,value)=>typeof value==='number'?Math.round(value*100000)/100000:value));
const sourceFiles=['src/Character.js','src/CharacterPose.js','src/LowStance.js','src/JointConstraints.js','src/Combat.js','src/SwingPhysics.js'];
fs.writeFileSync('docs/qa/stance-combat-2026-10-26/pose-source.json',JSON.stringify(Object.fromEntries(sourceFiles.map(path=>[path,crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')])),null,2)+'\n');
console.log('Exported 9 recorded production motion timelines');
