import {ATTACKS} from './Combat.js';
import {combatReviewPhase} from './CombatReviewPose.js';

export const COMBAT_DIRECTIONS={
  stationary:{},forward:{forward:true},backward:{backward:true},left:{left:true},right:{right:true},
  forwardLeft:{forward:true,left:true},forwardRight:{forward:true,right:true},
  backwardLeft:{backward:true,left:true},backwardRight:{backward:true,right:true},
};
// Review and tests run the real combat/physics clocks, including action entry
// and changes of movement, rather than repeating a single frozen pose.
export function sampleCombatScenario({combat,physics:p,camera},{key='jab',direction='forward',sprint=false,pattern='steady',phase,fps=60,onFrame,recovery=0}={}){
  const c=p.character;c.stopAnimation();combat.cancel();combat.mode='combat';combat.stamina=100;
  c.combatStance=true;c.combatAction=null;p.combatMotion=null;p.webEnabled=false;
  p.position.set(0,.1,0);p.velocity.set(0,0,0);p.previousFixedPosition.copy(p.position);p.renderPosition.copy(p.position);
  p.state='IDLE';p.accumulator=0;p.facingAngle=c.targetFacingAngle=c.visualYaw=0;
  camera.userData.movementYaw=0;
  const initial=COMBAT_DIRECTIONS[direction]||{},dt=1/fps;
  const tick=(step,input)=>{combat.before(step,camera,input);p.update(step,input,camera);combat.after(step);onFrame?.({step,input,character:c,physics:p,combat});};
  for(let i=0;i<Math.round(.65*fps);i++)tick(dt,pattern==='start'?{}:{...initial,sprint});
  const methods={jab:'attack',cross:'straight',heavy:'heavy'};
  if(key==='guard')combat.guard(true);else combat[methods[key]||key](camera);
  const duration=ATTACKS[key]?.duration||1.2;
  const target=duration*combatReviewPhase(key,c.actions[key].getClip(),phase)+recovery;
  let time=0;
  while(time<target-1e-8){
    let move={...initial};const progress=time/duration;
    if(pattern==='start'&&progress<.15 || pattern==='stop'&&progress>.18)move={};
    if(pattern==='reverse'&&progress>.35)move={forward:initial.backward,backward:initial.forward,left:initial.right,right:initial.left};
    const step=Math.min(dt,target-time);tick(step,{...move,sprint,guard:key==='guard'});time+=step;
  }
  return {key,direction,sprint,pattern,phase:target/duration,state:p.state,base:c.activeAction?.getClip().name,travel:combat.action?.travel,blocking:combat.blocking};
}
