import * as THREE from 'three';

// Share the screen-space gate between the HUD and the click consumer. A
// traversal click outside this gate must never also damage a nearby runner.
export function webTargetInReticle(target,camera){
  const screen=new THREE.Vector3(target.x,target.y+1,target.z).project(camera);
  return Math.abs(screen.x)<.16 && Math.abs(screen.y)<.22 && screen.z>-1 && screen.z<1;
}
