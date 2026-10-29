import * as T from 'three';

// Reviewed raised terrace in local Hong Kong metres. Positions and triangle
// topology remain identical: this changes surface presentation, never support.
export function startSurfaceKind([a,b,c]) {
  const abx=b.x-a.x,aby=b.y-a.y,abz=b.z-a.z;
  const acx=c.x-a.x,acy=c.y-a.y,acz=c.z-a.z;
  const nx=aby*acz-abz*acy,ny=abz*acx-abx*acz,nz=abx*acy-aby*acx;
  const length=Math.hypot(nx,ny,nz);
  if(length<1e-5||Math.abs(ny)/length<=.985)return null;
  for(const p of [a,b,c])if(p.y<19||p.y>22)return null;
  // Include boundary-crossing triangles. The per-fragment mask, rather than
  // the source tessellation, defines the edge of the material replacement.
  if(Math.max(a.x,b.x,c.x)<-18||Math.min(a.x,b.x,c.x)>18||
    Math.max(a.z,b.z,c.z)<-14||Math.min(a.z,b.z,c.z)>18)return null;
  return 'terrace';
}

export function createStartSurfaceMaterial(source,kind='terrace') {
  const material=new T.MeshStandardMaterial({
    map:source.map, color:source.color?.clone()||new T.Color('white'),
    side:source.side, vertexColors:!!source.vertexColors,
    roughness:.9,metalness:0,flatShading:true,
  });
  material.userData.startSurface=kind;
  material.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 vStartWorld;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvStartWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
    shader.fragmentShader='varying vec3 vStartWorld;\n'+shader.fragmentShader;
    const detail=`
      vec3 startOriginalDiffuse=diffuseColor.rgb;
      vec2 p=vStartWorld.xz;
      vec2 cell=p/vec2(1.2,.6);
      cell.x+=mod(floor(cell.y),2.0)*.5;
      vec2 edge=min(fract(cell),1.0-fract(cell));
      vec2 aa=max(fwidth(cell),vec2(.001));
      float joint=1.0-min(smoothstep(.006,.006+aa.x,edge.x),smoothstep(.012,.012+aa.y,edge.y));
      float tile=fract(sin(dot(floor(cell),vec2(127.1,311.7)))*43758.5453);
      vec3 stone=mix(vec3(.39,.405,.39),vec3(.49,.50,.475),tile);
      stone=mix(stone,vec3(.23,.245,.24),joint*.7);
      float mask=(1.0-smoothstep(13.0,18.0,abs(p.x)))*(1.0-smoothstep(10.0,14.0,abs(p.y-2.0)));
      diffuseColor.rgb=mix(diffuseColor.rgb,stone,mask*.92);
    `;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n'+detail);
    // Basic photogrammetry is unlit. Preserve its original appearance outside
    // the repair mask instead of creating a PBR lighting seam at a tile edge.
    if(source.isMeshBasicMaterial)shader.fragmentShader=shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      'outgoingLight=mix(startOriginalDiffuse,outgoingLight,mask);\n#include <opaque_fragment>');
  };
  material.customProgramCacheKey=()=>`hk-start-v1-${kind}`;
  return material;
}

// Runs before TilesRenderer collects resources, using its already reoriented
// group transform. Each resulting mesh has one material for loader disposal.
export function prepareStartDistrict(scene,worldFromTiles) {
  scene.updateMatrixWorld(true);
  const meshes=[];scene.traverse(m=>{if(m.isMesh)meshes.push(m);});
  const uses=new Map();for(const m of meshes)uses.set(m.geometry,(uses.get(m.geometry)||0)+1);
  for(const mesh of meshes){
    if(mesh.userData.startDistrictPrepared||Array.isArray(mesh.material)||mesh.isSkinnedMesh)continue;
    mesh.userData.startDistrictPrepared=true;
    const geometry=mesh.geometry,position=geometry?.attributes.position;
    if(!position||mesh.material.transparent)continue;
    const matrix=new T.Matrix4().multiplyMatrices(worldFromTiles,mesh.matrixWorld);
    geometry.computeBoundingBox();
    const bounds=geometry.boundingBox.clone().applyMatrix4(matrix);
    if(bounds.max.x < -18||bounds.min.x>18||bounds.max.z < -14||bounds.min.z>18||bounds.max.y<19||bounds.min.y>22)continue;
    const index=geometry.index,count=index?.count??position.count;
    const buckets=new Map(),keep=[],local=[new T.Vector3(),new T.Vector3(),new T.Vector3()],world=local.map(()=>new T.Vector3()),ids=[0,0,0];
    for(let i=0;i+2<count;i+=3){
      for(let j=0;j<3;j++)ids[j]=index?index.getX(i+j):i+j;
      for(let j=0;j<3;j++){local[j].fromBufferAttribute(position,ids[j]);world[j].copy(local[j]).applyMatrix4(matrix);}
      const kind=startSurfaceKind(world);
      if(!kind){keep.push(...ids);continue;}
      if(!buckets.has(kind))buckets.set(kind,[]);
      buckets.get(kind).push(...ids);
    }
    if(!buckets.size)continue;
    const original=geometry;
    mesh.geometry=original.clone();mesh.geometry.setIndex(keep);mesh.geometry.clearGroups();
    mesh.userData.startDistrictTriangles=0;
    for(const [kind,ids]of buckets){
      const g=new T.BufferGeometry();
      for(const name of ['position','uv','color']){
        const attribute=original.attributes[name];if(!attribute)continue;
        const data=new Float32Array(ids.length*attribute.itemSize);
        for(let i=0;i<ids.length;i++)for(let j=0;j<attribute.itemSize;j++)data[i*attribute.itemSize+j]=attribute.getComponent(ids[i],j);
        g.setAttribute(name,new T.BufferAttribute(data,attribute.itemSize));
      }
      g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();
      const replacement=new T.Mesh(g,createStartSurfaceMaterial(mesh.material,kind));
      replacement.name=`HongKongStart:${kind}`;
      replacement.castShadow=false;replacement.receiveShadow=true;
      replacement.userData.surfaceType='terrain';replacement.userData.startSurface=kind;
      replacement.userData.startDistrictPrepared=true;
      // Child vertices stay in the original mesh frame, including its scale.
      mesh.add(replacement);
      mesh.userData.startDistrictTriangles+=ids.length/3;
    }
    // A fully replaced parent must stay visible so Three traverses its children.
    mesh.visible=true;
    uses.set(original,uses.get(original)-1);
    if(uses.get(original)===0)original.dispose();
  }
}
