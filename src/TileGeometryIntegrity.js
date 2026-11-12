import {Box3,Sphere,Vector3} from 'three';
// Remove only invalid, zero-area and coincident same-material triangles.
// Preserve authored vertices, UVs, transforms and all nonduplicated surfaces.
export function repairTileGeometry(geometry){
  const p=geometry?.attributes?.position;if(!p)return {invalid:0,degenerate:0,duplicates:0};
  const index=geometry.index,count=index?.count??p.count;
  const groups=geometry.groups.length?geometry.groups:[{start:0,count,materialIndex:0}];
  const attributes=Object.entries(geometry.attributes).filter(([name])=>name!=='position');
  const kept=[],newGroups=[],seen=new Set(),report={invalid:0,degenerate:0,duplicates:0,repairedUVValues:0,recomputedNormals:false};
  const uv=geometry.attributes.uv;
  if(uv){for(let i=0;i<uv.count;i++)for(let k=0;k<uv.itemSize;k++)if(!Number.isFinite(uv.getComponent(i,k))){uv.setComponent(i,k,0);report.repairedUVValues++;}if(report.repairedUVValues)uv.needsUpdate=true;}
  // Indexed tiles reuse the same vertices across many faces. Cache the exact
  // coordinate/attribute signature once per vertex instead of allocating and
  // formatting it three times per triangle.
  const keys=new Array(p.count);
  const vertexKey=(id,x,y,z)=>{
    if(keys[id]!==undefined)return keys[id];
    let key=[Math.round(x*100000),Math.round(y*100000),Math.round(z*100000)].join(',');
    for(const [name,attribute] of attributes){
      let values='';for(let k=0;k<attribute.itemSize;k++){const value=attribute.getComponent(id,k);values+=(k?',':'')+(value==null?'':value);}
      key+=':'+name+':'+values;
    }
    return keys[id]=key;
  };
  for(const group of groups){
    const start=kept.length,end=Math.min(count,group.start+group.count);
    for(let i=group.start;i+2<end;i+=3){
      const ia=index?index.getX(i):i,ib=index?index.getX(i+1):i+1,ic=index?index.getX(i+2):i+2;
      if(!Number.isInteger(ia)||!Number.isInteger(ib)||!Number.isInteger(ic)||ia<0||ib<0||ic<0||ia>=p.count||ib>=p.count||ic>=p.count){report.invalid++;continue;}
      const ax=p.getX(ia),ay=p.getY(ia),az=p.getZ(ia),bx=p.getX(ib),by=p.getY(ib),bz=p.getZ(ib),cx=p.getX(ic),cy=p.getY(ic),cz=p.getZ(ic);
      if(!Number.isFinite(ax)||!Number.isFinite(ay)||!Number.isFinite(az)||!Number.isFinite(bx)||!Number.isFinite(by)||!Number.isFinite(bz)||!Number.isFinite(cx)||!Number.isFinite(cy)||!Number.isFinite(cz)){report.invalid++;continue;}
      const abx=bx-ax,aby=by-ay,abz=bz-az,acx=cx-ax,acy=cy-ay,acz=cz-az;
      const nx=aby*acz-abz*acy,ny=abz*acx-abx*acz,nz=abx*acy-aby*acx;
      if(nx*nx+ny*ny+nz*nz<1e-18){report.degenerate++;continue;}
      // Cyclic rotations match, while opposite winding and attribute seams do not.
      const a=vertexKey(ia,ax,ay,az),b=vertexKey(ib,bx,by,bz),c=vertexKey(ic,cx,cy,cz);
      const abc=a+'|'+b+'|'+c,bca=b+'|'+c+'|'+a,cab=c+'|'+a+'|'+b;
      const key=group.materialIndex+'|'+(abc<bca?(abc<cab?abc:cab):(bca<cab?bca:cab));
      if(seen.has(key)){report.duplicates++;continue;}seen.add(key);kept.push(ia,ib,ic);
    }
    newGroups.push({start,count:kept.length-start,materialIndex:group.materialIndex});
  }
  // Dropping triangles does not remove their vertices. Three.js computes
  // bounds over the entire position attribute, including unused vertices, so
  // one NaN left behind can still break culling and subsequent processing.
  // Replace only non-finite components, using a retained vertex as the
  // fallback; every face that referenced the bad vertex was already removed.
  const fallback=kept.length?kept[0]:null;
  const safe=fallback===null?[0,0,0]:[p.getX(fallback),p.getY(fallback),p.getZ(fallback)];
  let sanitizedPositions=false;
  for(let i=0;i<p.count;i++)for(let k=0;k<3;k++){
    if(!Number.isFinite(p.getComponent(i,k))){p.setComponent(i,k,safe[k]);sanitizedPositions=true;}
  }
  if(sanitizedPositions)p.needsUpdate=true;
  if(report.invalid+report.degenerate+report.duplicates||sanitizedPositions){
    geometry.setIndex(kept);geometry.clearGroups();for(const g of newGroups)geometry.addGroup(g.start,g.count,g.materialIndex);
    const box=new Box3(),point=new Vector3(),unique=new Set(kept);
    for(const id of unique)box.expandByPoint(point.fromBufferAttribute(p,id));
    geometry.boundingBox=box;
    const center=box.isEmpty()?new Vector3():box.getCenter(new Vector3());let radiusSq=0;
    for(const id of unique)radiusSq=Math.max(radiusSq,center.distanceToSquared(point.fromBufferAttribute(p,id)));
    geometry.boundingSphere=new Sphere(center,Math.sqrt(radiusSq));
  }
  const normal=geometry.attributes.normal;
  if(normal && normal.array.some(n=>!Number.isFinite(n))){geometry.computeVertexNormals();report.recomputedNormals=true;}
  return report;
}
