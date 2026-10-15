// Original takes remain reviewable; derivatives are explicitly labelled.
export const MOTIONS = [
  ['idle','Idle',true], ['walk','Walking',true],
  ['regularRun','Running',true], ['run','Fast Run',true],
  ['stop','Run To Stop'], ['runStop','Run To Stop'],
  ['zip','Rope Swinging',true],
  ['turnLeft','Left Turn'], ['turnRight','Right Turn'],
  ['jump','Standing Jump'], ['land','Standing Jump'],
  ['jumpDown','Jumping Down (1)'], ['drop','Jumping Down (1)'],
  ['jumpDownVariant','Jumping Down'], ['swing','Rope Swinging',true],
  ['fall','Falling (2)',true], ['fallVariant','Falling',true],
  ['fallIdle','Falling Idle',true], ['roll','Falling To Roll'],
  ['injuredIdle','Injured Idle',true],
].map(([key,file,loop=false]) => ({key,url:`/models/${file}.fbx`,loop}));
MOTIONS.push({key:'wall',url:'/models/Climbing Up Wall.fbx',loop:true,authoredMixamo:true});
export const STRIDES = ['walk','regularRun','run'];
export const GROUNDED = ['IDLE','RUNNING','SPRINTING','TURNING','LANDING','ROLLING'];

export const COMBAT_MOTIONS=[
  ['combatIdle','Fighting Idle',true],['jab','Fighting Left Jab'],
  ['guard','Defend',true],
  ['slam','Attack_Ground_Pound'],['slamLand','Land_Three_Point'],
].map(([key,take,loop=false])=>({key,take,loop,url:'/models/sources/combat-addon.glb'}));
COMBAT_MOTIONS.push(...[['hook','Melee_Hook'],['heavy','Punch_Cross'],['hitHead','Hit_Head']]
  .map(([key,take])=>({key,take,loop:false,url:'/models/sources/combat-base.glb'})));
MOTIONS.push(...COMBAT_MOTIONS);

// Keep the supplied boxing takes as the fighting stance and matching strikes.
const imported = {
 combatIdle:{file:'Boxing Stance',loop:true},
 jab:{file:'Boxing Lead Jab',impactPhase:.3},
 // The source has a long idle tail. Use the complete swing and recovery,
 // then play that section slower so the fist does not snap out and back.
 hook:{file:'Boxing Hook',trim:[0,1.4],impactPhase:.43},
 heavy:{file:'Boxing Hook',trim:[0,1.4],impactPhase:.43},
 airTrick:{file:'Front Flip',trim:[.5,1.43]},
 special:{file:'Boxing Lead Jab',impactPhase:.3},
};
for(const [key,{file,...settings}] of Object.entries(imported)){
 const motion={key,url:`/models/${file}.fbx`,authoredMixamo:true,loop:false,...settings};
 const index=MOTIONS.findIndex(m=>m.key===key);
 if(index<0)MOTIONS.push(motion);else MOTIONS[index]=motion;
}
