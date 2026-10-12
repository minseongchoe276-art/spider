import * as THREE from 'three';

// Reusable tube buffers: both core and fibers follow the same curved centerline.
const segments=40, sides=6;
export function createWebStrand(scene) {
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array((segments+1)*sides*3),3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('normal',new THREE.BufferAttribute(new Float32Array((segments+1)*sides*3),3).setUsage(THREE.DynamicDrawUsage));
  const indices=[];
  for(let i=0;i<segments;i++)for(let j=0;j<sides;j++) {
    const a=i*sides+j,b=i*sides+(j+1)%sides,c=a+sides,d=b+sides;
    indices.push(a,b,c,b,d,c);
  }
  geometry.setIndex(indices);
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({
    color:0xf4f8ff,emissive:0x8eb6d4,emissiveIntensity:0.45,roughness:0.5,metalness:0,
  }));
  mesh.userData.dynamicWeb=true;
  const fibers=new THREE.BufferGeometry();
  fibers.setAttribute('position',new THREE.BufferAttribute(new Float32Array(segments*2*3*3),3).setUsage(THREE.DynamicDrawUsage));
  const line=new THREE.LineSegments(fibers,new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:0.85}));
  for(const object of [mesh,line]) {object.visible=false;object.frustumCulled=false;scene.add(object);}
  return {line,mesh};
}
export function updateWebStrand(line,mesh,wrist,anchor,time=0,launch=1) {
  const end=wrist.clone().lerp(anchor,THREE.MathUtils.clamp(launch,0,1));
  const axis=end.clone().sub(wrist),length=axis.length();
  if(length<0.02) {line.visible=mesh.visible=false;return;}
  line.visible=mesh.visible=true;axis.normalize();
  const side=new THREE.Vector3().crossVectors(axis,Math.abs(axis.y)>0.95?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0)).normalize();
  const across=new THREE.Vector3().crossVectors(axis,side).normalize();
  const sag=Math.min(length*0.009,0.5);
  const center=t=>wrist.clone().lerp(end,t).addScaledVector(new THREE.Vector3(0,-1,0),Math.sin(Math.PI*t)*sag)
    .addScaledVector(side,Math.sin(Math.PI*t)*Math.sin(t*19-time*15)*Math.min(0.035,length*0.002));
  if(!mesh.userData.dynamicWeb) { // Old/debug geometry remains usable.
    mesh.position.copy(wrist).add(end).multiplyScalar(0.5);mesh.scale.set(0.35,length,0.35);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),axis);
    const attr=line.geometry.attributes.position,count=attr.count;
    for(let i=0;i<count;i++){const p=center(i/(count-1));attr.setXYZ(i,p.x,p.y,p.z);}
    attr.needsUpdate=true;line.geometry.setDrawRange(0,count);return;
  }
  const vertices=mesh.geometry.attributes.position,normals=mesh.geometry.attributes.normal;
  const fibers=line.geometry.attributes.position;
  let n=0;
  for(let i=0;i<=segments;i++) {
    const t=i/segments,p=center(t),radius=0.024*(0.75+0.25*Math.sin(Math.PI*t));
    for(let j=0;j<sides;j++) {
      const a=j/sides*Math.PI*2,normal=side.clone().multiplyScalar(Math.cos(a)).addScaledVector(across,Math.sin(a));
      const point=p.clone().addScaledVector(normal,radius);
      vertices.setXYZ(i*sides+j,point.x,point.y,point.z);normals.setXYZ(i*sides+j,normal.x,normal.y,normal.z);
    }
    if(i===segments)continue;
    for(let fiber=0;fiber<3;fiber++)for(const k of [i,i+1]) {
      const u=k/segments,a=u*length*3.5+fiber*Math.PI*2/3;
      const point=center(u).addScaledVector(side,Math.cos(a)*0.023*Math.sin(Math.PI*u))
        .addScaledVector(across,Math.sin(a)*0.023*Math.sin(Math.PI*u));
      fibers.setXYZ(n++,point.x,point.y,point.z);
    }
  }
  vertices.needsUpdate=normals.needsUpdate=fibers.needsUpdate=true;
}
