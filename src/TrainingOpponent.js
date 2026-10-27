import * as THREE from 'three';

// Lightweight articulated training mannequin. Its feet stay at the authoritative
// position; anticipation, strike and recoil affect the visual rig only.
export function createTrainingOpponent(type){
  const group=new THREE.Group(),rig=new THREE.Group();group.add(rig);
  const color={dummy:0x93b6c2,melee:0xe67860,ranged:0x9ba2ff,shield:0xe7c178}[type]||0xe67860;
  const material=()=>new THREE.MeshStandardMaterial({color,roughness:.65,metalness:.15});
  const part=(geometry,parent,x,y,z)=>{const mesh=new THREE.Mesh(geometry,material());mesh.position.set(x,y,z);mesh.castShadow=true;parent.add(mesh);return mesh;};
  const body=part(new THREE.CapsuleGeometry(.28,.42,4,8),rig,0,1.17,0);
  part(new THREE.SphereGeometry(.21,10,8),rig,0,1.83,0);
  const visor=part(new THREE.BoxGeometry(.3,.065,.07),rig,0,1.85,.19);visor.material.color.setHex(0x192835);
  const limbs={};
  for(const side of [-1,1]){
    const arm=new THREE.Group();arm.position.set(side*.37,1.48,0);rig.add(arm);
    part(new THREE.CapsuleGeometry(.095,.28,3,6),arm,0,-.18,0);
    const elbow=new THREE.Group();elbow.position.y=-.38;arm.add(elbow);
    part(new THREE.CapsuleGeometry(.09,.24,3,6),elbow,0,-.15,0);
    part(new THREE.SphereGeometry(.12,8,6),elbow,0,-.34,0);
    const leg=new THREE.Group();leg.position.set(side*.16,.85,0);rig.add(leg);
    part(new THREE.CapsuleGeometry(.115,.24,3,6),leg,0,-.18,0);
    const knee=new THREE.Group();knee.position.y=-.4;leg.add(knee);
    part(new THREE.CapsuleGeometry(.1,.22,3,6),knee,0,-.14,0);
    const foot=part(new THREE.BoxGeometry(.22,.12,.34),knee,0,-.36,.065);foot.material.color.setHex(0x26323e);
    limbs[side===-1?'left':'right']={arm,elbow,leg,knee};
  }
  let shield=null;
  if(type==='shield'){
    shield=part(new THREE.BoxGeometry(.64,.8,.1),limbs.left.elbow,0,-.15,.22);shield.material.color.setHex(0x5e7080);
  }
  return {group,body,shield,pose:{rig,...limbs}};
}

export function poseTrainingOpponent(enemy,dt,reducedMotion=false){
  if(!enemy.pose||!Number.isFinite(dt)||dt<=0)return;
  const step=Math.min(dt,.1),p=enemy.pose;
  if(enemy.uppercutTime!=null){enemy.uppercutTime=Math.min(enemy.uppercutDuration,enemy.uppercutTime+step);const phase=enemy.uppercutTime/enemy.uppercutDuration;p.rig.position.y=.55*Math.sin(Math.PI*phase);if(phase>=1){enemy.uppercutTime=null;p.rig.position.y=0;}}
  const distance=enemy.lastPosePosition?enemy.position.distanceTo(enemy.lastPosePosition):0;
  enemy.lastPosePosition=enemy.position.clone();
  enemy.gaitPhase=(enemy.gaitPhase||0)+Math.min(distance,.5)*5.5;
  enemy.strike=Math.max(0,(enemy.strike||0)-step);
  const walking=distance>step*.2&&enemy.stagger<=0&&enemy.windup<=0;
  const gait=walking?Math.sin(enemy.gaitPhase)*.35:0,windup=enemy.windup>0,strike=enemy.strike>0,hit=enemy.stagger>0;
  const mix=1-Math.exp(-18*step),set=(node,axis,value)=>{node.rotation[axis]+= (value-node.rotation[axis])*mix;};
  set(p.rig,'x',enemy.uppercutTime!=null?-.4*Math.sin(Math.PI*enemy.uppercutTime/enemy.uppercutDuration):hit?-.16:windup?-.08:strike?.12:0);
  set(p.rig,'z',hit&&!reducedMotion?Math.sin(enemy.stagger*30)*.06:0);
  for(const [name,sign]of [['left',1],['right',-1]]){
    const limb=p[name],attacking=name==='right';
    set(limb.leg,'x',gait*sign);set(limb.knee,'x',Math.max(0,-gait*sign)*.8);
    set(limb.arm,'x',attacking?(strike?-1.65:windup?-.65:hit?-.25:gait*-.7):enemy.type==='shield'?-1:windup?-.7:gait*.7);
    set(limb.arm,'z',attacking&&windup?-.3:0);
    set(limb.elbow,'x',attacking?(windup?-1.6:strike?-.1:-.35):enemy.type==='shield'?-.6:-.4);
  }
  // Avoid flashing or body shake when reduced motion is selected.
  enemy.body.material.emissive.setHex(hit&&!reducedMotion?0x663322:windup?0x5a210d:0);
}
