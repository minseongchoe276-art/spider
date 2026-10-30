import * as T from 'three';

// Development-only evidence. This never repairs, replaces or hides source data.
export function collectHongKongRenderAudit(app){
  const rows=[],textures=new Map(),geometries=new Map(),components={};
  const category=mesh=>{
    if(mesh.userData.startSurface)return 'start-terrace-material';
    if(mesh.userData.surfaceType)return 'streamed-'+mesh.userData.surfaceType;
    let node=mesh;while(node){if(node===app.city.district?.group)return 'central-facades-and-seven-trees';if(node===app.character?.group)return 'player';node=node.parent;}
    return mesh.isInstancedMesh?'other-instanced':'other';
  };
  app.scene.updateMatrixWorld(true);
  app.scene.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.geometry?.attributes.position)return;
    const g=mesh.geometry,p=g.attributes.position,kind=category(mesh),count=(g.index?.count??p.count)/3;
    const component=components[kind]??={meshes:0,triangles:0,instances:0,visible:0};component.meshes++;component.triangles+=count*(mesh.count??1);component.instances+=mesh.count??1;
    let visible=mesh.visible,node=mesh.parent;while(node){visible&&=node.visible;node=node.parent;}if(visible)component.visible++;
    let invalidCoordinates=0,invalidUV=0;
    if(!geometries.has(g)){
for(let i=0;i<p.count;i++)if(![p.getX(i),p.getY(i),p.getZ(i)].every(Number.isFinite))invalidCoordinates++;
      const uv=g.attributes.uv;if(uv)for(let i=0;i<uv.count;i++)if(![uv.getX(i),uv.getY(i)].every(Number.isFinite))invalidUV++;
      geometries.set(g,{invalidCoordinates,invalidUV});
    }else ({invalidCoordinates,invalidUV}=geometries.get(g));
    const materials=[];
    for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
      if(!m)continue;
      const maps=[];for(const slot of ['map','normalMap','roughnessMap','metalnessMap','alphaMap','emissiveMap']){
        const texture=m[slot];if(!texture)continue;maps.push({slot,id:texture.uuid});
        if(!textures.has(texture.uuid)){const image=texture.image??texture.source?.data;
          textures.set(texture.uuid,{id:texture.uuid,name:texture.name,slot,width:image?.width??0,height:image?.height??0,mipmaps:texture.mipmaps?.length??0,generateMipmaps:texture.generateMipmaps,minFilter:texture.minFilter,anisotropy:texture.anisotropy,colorSpace:texture.colorSpace,compressed:!!texture.isCompressedTexture});}
      }
      materials.push({name:m.name,type:m.type,flatShading:m.flatShading===true,unlit:!!m.isMeshBasicMaterial,maps,side:m.side,transparent:m.transparent,opacity:m.opacity,alphaTest:m.alphaTest,depthWrite:m.depthWrite,depthTest:m.depthTest,roughness:m.roughness,metalness:m.metalness,customMask:!!m.userData.hkDistrictMask});
    }
    const box=g.boundingBox?.clone()??new T.Box3().setFromBufferAttribute(p);box.applyMatrix4(mesh.matrixWorld);
    const issues=[];if(invalidCoordinates)issues.push('non-finite-position');if(invalidUV)issues.push('non-finite-uv');
    if(materials.some(m=>m.maps.some(t=>t.slot==='map'))&&!g.attributes.uv)issues.push('textured-mesh-without-uv');
    if(materials.some(m=>m.type!=='MeshBasicMaterial'&&m.type!=='ShaderMaterial'&&!m.flatShading)&&!g.attributes.normal)issues.push('lit-mesh-without-normals');
    rows.push({id:mesh.uuid,name:mesh.name,category:kind,visible,vertices:p.count,triangles:count,instances:mesh.count??1,bounds:{min:box.min.toArray(),max:box.max.toArray()},normals:!!g.attributes.normal,uv:!!g.attributes.uv,repair:g.userData.integrityReport??null,invalidCoordinates,invalidUV,materials,issues});
  });
  return {time:Date.now(),scope:'Loaded scene only; visited camera coordinates are recorded separately, not whole-territory certification',origin:{lat:22.2799955,lon:114.165495},playableHalfExtent:app.city.playableHalfExtent,components,meshes:rows,textures:[...textures.values()],city:app.city.renderingDiagnostics?.(),district:app.city.district?.report,weather:app.weather?.state,renderer:{calls:app.renderer.info.render.calls,triangles:app.renderer.info.render.triangles,textures:app.renderer.info.memory.textures,geometries:app.renderer.info.memory.geometries},camera:{position:app.camera.position.toArray(),near:app.camera.near,far:app.camera.far},position:app.physics.position.toArray()};
}
