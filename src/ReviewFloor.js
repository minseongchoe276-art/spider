import * as THREE from 'three';

// Standalone review stages do not run SwingPhysics.update, which normally
// supplies these probes. Their visible floor must use the same support API.
export function attachReviewFloor(character,height=0){
  character.surfaceProbe=()=>({height,normal:new THREE.Vector3(0,1,0)});
  character.groundProbe=()=>height;
}
