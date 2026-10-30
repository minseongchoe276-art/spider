import * as T from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {collectWalkwayEdges} from './HongKongWalkwayEdges.js';
import {PhotoTextureReader,detectCanopyCandidates} from './HongKongVegetation.js';
import {CENTRAL_TREES} from './HongKongDistrict.js';

export class HongKongPresentation{
  constructor(city){
    this.city=city;this.scene=city.scene;this.group=new T.Group();this.group.name='HongKongWalkwayRepairs';this.scene.add(this.group);
    this.railMaterial=new T.MeshStandardMaterial({color:0x7c898e,metalness:.65,roughness:.38});this.trimMaterial=new T.MeshStandardMaterial({color:0x999e99,roughness:.85});
    this.reader=new PhotoTextureReader(city.renderer);this.scanned=new WeakSet();this.sites=[...CENTRAL_TREES];this.lastFocus=new T.Vector3(Infinity,0,Infinity);this.next=0;this.colliders=[];
    this.report={railEdges:0,automaticTrees:0,scannedMeshes:0,geometryUpdates:0};
  }
  update(now,focus){
    if(now<this.next||!this.city.district||this.city.district.report.treeStatus!=='ready')return;
    this.next=now+3;
    const source=this.city.buildingMeshes.filter(m=>!m.userData.presentationRepair);
    const candidates=source.filter(m=>!this.scanned.has(m)&&m.geometry.attributes.uv&&m.geometry.attributes.position.count<32000&&!Array.isArray(m.material)&&m.material.map).map(mesh=>({mesh,distance:(mesh.geometry.boundingBox??new T.Box3().setFromBufferAttribute(mesh.geometry.attributes.position)).clone().applyMatrix4(mesh.matrixWorld).distanceToPoint(focus)})).filter(m=>m.distance<140).sort((a,b)=>a.distance-b.distance);
    const mesh=candidates[0]?.mesh;
    if(mesh){
      this.scanned.add(mesh);this.report.scannedMeshes++;
      try{
        const image=this.reader.read(mesh.material.map);
        for(const t of detectCanopyCandidates(mesh,image)){
          if(this.sites.length>=96||Math.hypot(t.x-focus.x,t.z-focus.z)>140||this.sites.some(s=>Math.hypot(s.x-t.x,s.z-t.z)<Math.max(s.radius,t.radius)*.8))continue;
          const ray=new T.Raycaster(new T.Vector3(t.x,t.minY-.4,t.z),new T.Vector3(0,-1,0),0,30),hit=ray.intersectObjects(source,false)[0];
          if(!hit?.face)continue;const normal=hit.face.normal.clone().applyNormalMatrix(new T.Matrix3().getNormalMatrix(hit.object.matrixWorld));
          const height=t.maxY-hit.point.y+.5;if(normal.y<.85||height<4||height>24)continue;
          this.sites.push({...t,base:hit.point.y,height,automatic:true});this.report.automaticTrees++;
        }
      }catch(error){this.report.lastTextureReadError=String(error);}
    }
    this.city.district.setTreeSites(this.sites,focus);
    const token=source.map(m=>m.uuid).join('|');
    if(focus.distanceToSquared(this.lastFocus)>144||token!==this.lastToken){
      this.lastFocus.copy(focus);this.lastToken=token;
      const edges=collectWalkwayEdges(source,focus),signature=edges.map(e=>[...e.a,...e.b].map(v=>Math.round(v*4)).join(',')).join('|');
      if(signature!==this.signature){this.signature=signature;this.buildRails(edges);}
    }
  }
  buildRails(edges){
    this.clearRails();const rails=[],trims=[],blocks=[];
    const add=(array,center,size,rotation,solid=false)=>{
      const geometry=new T.BoxGeometry(...size).applyMatrix4(new T.Matrix4().compose(center,rotation,new T.Vector3(1,1,1)));array.push(geometry);if(solid)blocks.push({center,size,rotation});
    };
    for(const edge of edges){
      const direction=edge.b.clone().sub(edge.a).setY(0).normalize(),rotation=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.atan2(direction.x,direction.z));
      const a=edge.a.clone().addScaledVector(edge.inward,.1),b=edge.b.clone().addScaledVector(edge.inward,.1),middle=a.clone().lerp(b,.5);
      for(const [height,thickness]of [[1.06,.065],[.55,.038]])add(rails,middle.clone().add(new T.Vector3(0,height,0)),[thickness,thickness,edge.length],rotation,true);
      const posts=Math.ceil(edge.length/1.5);for(let i=0;i<=posts;i++)add(rails,a.clone().lerp(b,i/posts).add(new T.Vector3(0,.53,0)),[.055,1.06,.055],rotation,false);
      add(trims,middle.clone().add(new T.Vector3(0,-.11,0)),[.16,.22,edge.length],rotation,false);
    }
    for(const [parts,material,name]of [[rails,this.railMaterial,'Supported walkway handrails'],[trims,this.trimMaterial,'Supported walkway edge trim']]){
      if(!parts.length)continue;const geometry=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());const mesh=new T.Mesh(geometry,material);mesh.name=name;mesh.castShadow=mesh.receiveShadow=true;mesh.userData.presentationRepair=true;mesh.userData.surfaceType='infrastructure';this.group.add(mesh);
    }
    const collision=this.city.collisionWorld,mesh=this.group.children[0];
    if(collision.ready&&mesh){mesh.updateMatrixWorld(true);for(const {center,size,rotation}of blocks){const desc=RAPIER.ColliderDesc.cuboid(size[0]/2,size[1]/2,size[2]/2).setTranslation(center.x,center.y,center.z).setRotation(rotation);const collider=collision.world.createCollider(desc);collision.colliderToMesh.set(collider.handle,mesh);this.colliders.push(collider);}}
    this.city.mapSurfaceMeshes=[...this.group.children];this.report.railEdges=edges.length;this.report.geometryUpdates++;
  }
  clearRails(){
    const collision=this.city.collisionWorld;for(const c of this.colliders){collision.colliderToMesh.delete(c.handle);if(collision.ready&&c.isValid())collision.world.removeCollider(c,true);}this.colliders=[];
    for(const mesh of [...this.group.children]){this.group.remove(mesh);mesh.geometry.dispose();}this.city.mapSurfaceMeshes=[];
  }
  dispose(){this.clearRails();this.scene.remove(this.group);this.railMaterial.dispose();this.trimMaterial.dispose();this.reader.dispose();}
}
