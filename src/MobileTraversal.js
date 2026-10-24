import * as THREE from 'three';

// A bounded, visible fan: traversal assistance never searches behind the camera
// or selects player avatars. Every candidate still passes the physics' solid tests.
export const MOBILE_ANCHOR_FAN=Object.freeze([
  [0,.3],[-.28,.32],[.28,.32],[0,.58],[-.5,.52],[.5,.52],[-.6,.12],[.6,.12],[0,.82],
]);
export function mobileAnchorScore(point,eye,camera) {
  const screen=point.clone().project(camera),direction=point.clone().sub(eye);
  const forward=camera.getWorldDirection(new THREE.Vector3());forward.y=0;
  const horizontal=new THREE.Vector3(direction.x,0,direction.z);
  if(direction.length()<1||direction.length()>130||screen.z<=-1||screen.z>=1||Math.abs(screen.x)>.8||Math.abs(screen.y)>.94)return Infinity;
  if(horizontal.length()>1&&horizontal.normalize().dot(forward.normalize())<.57)return Infinity;
  if(point.y<eye.y+2)return Infinity;
  return Math.abs(screen.x)*.8+Math.abs(screen.y-.4)*.5+direction.length()/260;
}

// Do not rotate the reference under a sideways/backward stick, or whip the
// view 180 degrees when a pendulum reverses. Manual orbit always wins first.
export function followMobileCamera(rig,delta,velocity,isSwinging,facing,movement) {
  if(rig.mobileLooking)rig.mobileLookDelay=2.2;
  rig.mobileLookDelay=Math.max(0,(rig.mobileLookDelay||0)-delta);
  if(rig.mobileLookDelay>0||rig.mobileLooking||movement?.backward||movement?.left||movement?.right||rig.isRecentering)return;
  const speed=Math.hypot(velocity.x,velocity.z);
  if(speed<1||!(rig.followStrength>0))return;
  const desired=isSwinging&&speed>3?Math.atan2(velocity.x,velocity.z):facing;
  if(!Number.isFinite(desired))return;
  const difference=Math.atan2(Math.sin(desired-rig.yaw),Math.cos(desired-rig.yaw));
  if(Math.abs(difference)>Math.PI*.42)return;
  const amount=difference*(1-Math.exp(-1.8*rig.followStrength*delta));
  rig.yaw+=THREE.MathUtils.clamp(amount,-.75*delta,.75*delta);
  rig.pitch=THREE.MathUtils.damp(rig.pitch,isSwinging?-.08:.12,1.15*rig.followStrength,delta);
}

// One bounded search at solo entry, not automatic steering during gameplay.
// A high harbor roof can have no usable overhead pivot; an existing safe street
// is a better first launch. Saved positions and authoritative online spawns stay put.
export function mobileStartingView(game,allowRelocate=true){
  const p=game.physics,city=game.city;
  if(!game.touchControls?.enabled||!game.multiplayer?.solo||city.isStreamed||!game.experience?.safe||!game.camera?.clone)return null;
  const original=p.position.clone(),camera=game.camera.clone(),oldAssist=p.mobileTraversalAssist;
  const points=[original];
  if(allowRelocate)for(const [x,z]of [[0,0],[0,60],[0,-60],[60,0],[-60,0],[0,120]])points.push(new THREE.Vector3(x,.1,z));
  try{
    p.mobileTraversalAssist=true;
    for(const point of points){
      if(!game.experience.safe(point))continue;
      p.position.copy(point);const center=point.clone().add(new THREE.Vector3(0,1.7,0));
      for(const step of [0,1,-1,2,-2,3,-3,4,-4,5,-5,6,-6,7,-7,8]){
        const yaw=(p.facingAngle||0)+step*Math.PI/8;
        camera.position.copy(center).add(new THREE.Vector3(-Math.sin(yaw)*5.8*Math.cos(.12),5.8*Math.sin(.12),-Math.cos(yaw)*5.8*Math.cos(.12)));
        camera.lookAt(center);camera.updateMatrixWorld(true);
        if(p.findBestAnchor(camera))return {position:point.clone(),yaw};
      }
    }
    return null;
  }finally{
    p.position.copy(original);p.mobileTraversalAssist=oldAssist;
    p.bestAnchorCandidate=p.bestAnchorNormal=p.bestAnchorObject=null;
  }
}
