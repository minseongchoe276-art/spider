// Original takes remain reviewable; derivatives are explicitly labelled.
export const MOTIONS = [
  ['idle','Idle',true], ['walk','Walking',true], ['jog','Jogging',true],
  ['regularRun','Running',true], ['run','Fast Run',true],
  ['stop','Run To Stop'], ['runStop','Run To Stop'],
  ['femaleStop','Female Stop Walking'],
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
export const STRIDES = ['walk','jog','regularRun','run'];
export const GROUNDED = ['IDLE','RUNNING','SPRINTING','TURNING','LANDING','ROLLING'];

export const COMBAT_MOTIONS=[
  ['combatIdle','Fighting Idle',true],['jab','Fighting Left Jab'],
  ['cross','Fighting Right Jab'],['guard','Defend',true],
  ['dodgeLeft','Dodge_left'],['dodgeRight','Dodge_right'],['dodgeBack','Dodge_back'],
  ['slam','Attack_Ground_Pound'],['slamLand','Land_Three_Point'],
].map(([key,take,loop=false])=>({key,take,loop,url:'/models/sources/combat-addon.glb'}));
COMBAT_MOTIONS.push(...[['dodgeForward','Roll'],['hook','Melee_Hook'],['heavy','Punch_Cross'],['hit','Hit_Chest'],['hitHead','Hit_Head']]
  .map(([key,take])=>({key,take,loop:false,url:'/models/sources/combat-base.glb'})));
MOTIONS.push(...COMBAT_MOTIONS);

// Mixamo sources are retained for review. The target-rig pass steadies the
// boxing idle and extends the straight punches after retargeting.
const imported = {
 combatIdle:{file:'Boxing Idle',loop:true},
 jab:{file:'Lead Jab',impactPhase:.3},
 cross:{file:'Cross Punch',impactPhase:.6},
 hook:{file:'Mma Kick',impactPhase:.4},
 airTrick:{file:'Front Flip',trim:[.5,1.43]},
 special:{file:'Surprise Uppercut',trim:[.67,1.77],impactPhase:.35},
};
for(const [key,{file,...settings}] of Object.entries(imported)){
 const motion={key,url:`/models/${file}.fbx`,authoredMixamo:true,loop:false,...settings};
 const index=MOTIONS.findIndex(m=>m.key===key);
 if(index<0)MOTIONS.push(motion);else MOTIONS[index]=motion;
}
