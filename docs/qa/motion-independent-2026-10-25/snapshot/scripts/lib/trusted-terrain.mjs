import * as THREE from 'three';

// Server-only contract. The publisher supplies verified geometry and coverage;
// no player request is permitted to replace either value.
export class TrustedTerrain {
  constructor(meshes,{complete=false,center={x:0,z:0},radius=0,version=null}={}){
    this.meshes=meshes;this.complete=complete;this.center=center;this.radius=radius;this.version=version;
    this.raycaster=new THREE.Raycaster();
  }
  contains(point){return point&&[point.x,point.y,point.z].every(Number.isFinite)
    &&Math.hypot(point.x-this.center.x,point.z-this.center.z)<=this.radius;}
  visibility(from,to){
    if(!this.complete||!this.version||!this.contains(from)||!this.contains(to))
      return {status:'UNKNOWN',reason:'Verified terrain coverage is unavailable'};
    const origin=new THREE.Vector3(from.x,from.y+1,from.z),target=new THREE.Vector3(to.x,to.y+1,to.z);
    const direction=target.sub(origin),distance=direction.length();
    if(distance<.1)return {status:'CLEAR',version:this.version};
    this.raycaster.set(origin,direction.normalize());this.raycaster.near=0;
    this.raycaster.far=Math.max(0,distance-.3);
    for(const mesh of this.meshes)mesh.updateWorldMatrix(true,true);
    const hit=this.raycaster.intersectObjects(this.meshes,true)[0];
    return {status:hit?'BLOCKED':'CLEAR',version:this.version};
  }
}

// A missing or unknown oracle must never become a positive damage decision.
// Membership/range/cooldown/room state still belong to the authoritative server.
export function terrainPermitsDamage(terrain,from,to){
  return terrain?.visibility(from,to)?.status==='CLEAR';
}
