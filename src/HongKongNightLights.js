import * as T from 'three';

// Shared uniforms update existing tile programs without recompiling them.
export const hongKongNight={value:0};

// Lamps are placed only on surveyed, supported walkway edges. Two unshadowed
// lights near the player bound GPU cost while instancing keeps poles cheap.
export class HongKongNightLights {
  constructor(scene){
    this.scene=scene;this.group=new T.Group();this.group.name='Supported walkway night lamps';scene.add(this.group);
    this.poleGeometry=new T.CylinderGeometry(.045,.075,3.8,6);
    this.bulbGeometry=new T.SphereGeometry(.14,8,6);
    this.poleMaterial=new T.MeshStandardMaterial({color:0x38404a,roughness:.72,metalness:.35});
    this.bulbMaterial=new T.MeshBasicMaterial({color:0xffcf81});
    this.poles=new T.InstancedMesh(this.poleGeometry,this.poleMaterial,24);
    this.bulbs=new T.InstancedMesh(this.bulbGeometry,this.bulbMaterial,24);
    this.poles.count=this.bulbs.count=0;this.group.add(this.poles,this.bulbs);
    this.lights=Array.from({length:2},()=>{const light=new T.PointLight(0xffc778,0,16,2);light.castShadow=false;this.group.add(light);return light;});
    this.points=[];this.group.visible=false;
  }
  setEdges(edges){
    const points=[];
    for(const edge of edges){
      const p=edge.a.clone().lerp(edge.b,.5).addScaledVector(edge.inward,.35);
      if(points.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<16))continue;
      points.push(p);if(points.length===24)break;
    }
    this.points=points;this.poles.count=this.bulbs.count=points.length;
    const matrix=new T.Matrix4();
    for(let i=0;i<points.length;i++){
      const p=points[i];matrix.makeTranslation(p.x,p.y+1.9,p.z);this.poles.setMatrixAt(i,matrix);
      matrix.makeTranslation(p.x,p.y+3.8,p.z);this.bulbs.setMatrixAt(i,matrix);
    }
    this.poles.instanceMatrix.needsUpdate=this.bulbs.instanceMatrix.needsUpdate=true;
    if(points.length){this.poles.computeBoundingSphere();this.bulbs.computeBoundingSphere();}
  }
  update(night,focus){
    const strength=T.MathUtils.clamp(night,0,1);this.group.visible=this.points.length>0;
    this.bulbMaterial.color.setRGB(.3+strength*.7,.3+strength*.35,.28+strength*.01);
    if(!this.group.visible)return;
    const nearest=this.points.map(p=>({p,d:p.distanceToSquared(focus)})).sort((a,b)=>a.d-b.d);
    this.lights.forEach((light,i)=>{
      const candidate=nearest[i];light.visible=strength>.01&&!!candidate&&candidate.d<70*70;
      if(light.visible){light.position.copy(candidate.p);light.position.y+=3.65;light.intensity=18*strength;}
    });
  }
  dispose(){this.scene.remove(this.group);this.poleGeometry.dispose();this.bulbGeometry.dispose();this.poleMaterial.dispose();this.bulbMaterial.dispose();}
}
