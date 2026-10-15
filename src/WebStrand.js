import * as THREE from 'three';

// Reused buffers: a tapered silk core and three exposed braided filaments.
const segments=40,sides=6;
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
    color:0xeaf2fa,emissive:0x9bb9ce,emissiveIntensity:.2,roughness:.36,metalness:0,
    transparent:true,
  }));
  mesh.userData.dynamicWeb=true;
  const fibers=new THREE.BufferGeometry();
  fibers.setAttribute('position',new THREE.BufferAttribute(new Float32Array(segments*2*3*3),3).setUsage(THREE.DynamicDrawUsage));
  const line=new THREE.LineSegments(fibers,new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.72,depthWrite:false}));
  for(const object of [mesh,line]){object.visible=false;object.frustumCulled=false;scene.add(object);}
  return {line,mesh};
}

export function updateWebStrand(line,mesh,wrist,anchor,time=0,launch=1,style={}) {
  const progress=THREE.MathUtils.clamp(launch,0,1),end=wrist.clone().lerp(anchor,progress);
  const axis=end.clone().sub(wrist),length=axis.length();
  if(length<.02 || ![...wrist.toArray(),...end.toArray(),time].every(Number.isFinite)) {
    line.visible=mesh.visible=false;return;
  }
  line.visible=mesh.visible=true;axis.normalize();
  const opacity=THREE.MathUtils.clamp(style.opacity ?? 1,0,1);
  mesh.material.opacity=opacity;line.material.opacity=.72*opacity;
  // Parallel transport the strand frame. Switching a reference axis near a
  // vertical anchor otherwise makes the braid rotate abruptly while swinging.
  let side=mesh.userData.webSide?.clone();
  if(side)side.addScaledVector(axis,-side.dot(axis));
  if(!side || side.lengthSq()<1e-6)side=new THREE.Vector3().crossVectors(axis,Math.abs(axis.y)>.95?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0));
  side.normalize();mesh.userData.webSide=side.clone();
  const across=new THREE.Vector3().crossVectors(axis,side).normalize();
  const tension=THREE.MathUtils.clamp(style.tension ?? 1,0,1),speed=THREE.MathUtils.clamp(style.speed || 0,0,80);
  const arriving=1-THREE.MathUtils.smoothstep(progress,.72,1);
  const sag=Math.min(length*(.0015+.015*(1-tension)),.65);
  const flutter=Math.min(length*.003,.065)*arriving+.009*(1-tension)+.003*Math.min(1,speed/30);
  const center=t=>{
    const envelope=Math.sin(Math.PI*t),pulse=Math.sin(t*15-time*22)*flutter;
    return wrist.clone().lerp(end,t).addScaledVector(new THREE.Vector3(0,-1,0),envelope*sag)
      .addScaledVector(side,envelope*pulse).addScaledVector(across,envelope*Math.cos(t*12-time*18)*flutter*.35);
  };
  if(!mesh.userData.dynamicWeb){
    mesh.position.copy(wrist).add(end).multiplyScalar(.5);mesh.scale.set(.2,length,.2);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),axis);
    const attr=line.geometry.attributes.position;
    for(let i=0;i<attr.count;i++){const p=center(i/(attr.count-1));attr.setXYZ(i,p.x,p.y,p.z);}
    attr.needsUpdate=true;line.geometry.setDrawRange(0,attr.count);return;
  }
  const vertices=mesh.geometry.attributes.position,normals=mesh.geometry.attributes.normal,fibers=line.geometry.attributes.position;
  const points=mesh.userData.webPoints ||= Array.from({length:segments+1},()=>new THREE.Vector3());
  const frames=mesh.userData.webFrames ||= Array.from({length:segments+1},()=>({side:new THREE.Vector3(),across:new THREE.Vector3(),radius:0}));
  for(let i=0;i<=segments;i++)points[i].copy(center(i/segments));
  for(let i=0;i<=segments;i++) {
    const t=i/segments,p=points[i],frame=frames[i];
    const tangent=points[Math.min(segments,i+1)].clone().sub(points[Math.max(0,i-1)]).normalize();
    frame.side.copy(side).addScaledVector(tangent,-side.dot(tangent)).normalize();
    frame.across.crossVectors(tangent,frame.side).normalize();
    frame.radius=.013*(.48+.52*Math.sin(Math.PI*t)**.45)*(1-.3*arriving*t**6);
    for(let j=0;j<sides;j++) {
      const a=j/sides*Math.PI*2,normal=frame.side.clone().multiplyScalar(Math.cos(a)).addScaledVector(frame.across,Math.sin(a));
      const radius=frame.radius*(1+.07*Math.cos(a*3+t*18));
      const point=p.clone().addScaledVector(normal,radius);
      vertices.setXYZ(i*sides+j,point.x,point.y,point.z);normals.setXYZ(i*sides+j,normal.x,normal.y,normal.z);
    }
  }
  let n=0;const turns=Math.min(length*1.4,Math.PI*12);
  for(let i=0;i<segments;i++)for(let fiber=0;fiber<3;fiber++)for(const k of [i,i+1]) {
    const t=k/segments,frame=frames[k],a=t*turns+fiber*Math.PI*2/3;
    const radius=frame.radius*(1.24+.13*Math.sin(t*21+fiber));
    const p=points[k].clone().addScaledVector(frame.side,Math.cos(a)*radius).addScaledVector(frame.across,Math.sin(a)*radius);
    fibers.setXYZ(n++,p.x,p.y,p.z);
  }
  vertices.needsUpdate=normals.needsUpdate=fibers.needsUpdate=true;
}
