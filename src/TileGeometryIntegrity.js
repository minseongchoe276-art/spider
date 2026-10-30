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
  const vertex=i=>[p.getX(i),p.getY(i),p.getZ(i)];
  const signature=v=>v.map(n=>Math.round(n*100000)).join(',');
  for(const group of groups){
    const start=kept.length;
    for(let i=group.start;i+2<Math.min(count,group.start+group.count);i+=3){
      const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j);
      if(ids.some(id=>!Number.isInteger(id)||id<0||id>=p.count)){report.invalid++;continue;}
      const v=ids.map(vertex);if(v.flat().some(n=>!Number.isFinite(n))){report.invalid++;continue;}
      const a=v[1].map((n,j)=>n-v[0][j]),b=v[2].map((n,j)=>n-v[0][j]);
      const area=(a[1]*b[2]-a[2]*b[1])**2+(a[2]*b[0]-a[0]*b[2])**2+(a[0]*b[1]-a[1]*b[0])**2;
      if(area<1e-18){report.degenerate++;continue;}
      // Preserve winding and authored attribute seams. Opposite faces are
      // valid on thin bridge decks/walls; sorting their vertices deleted one.
      const keys=v.map((point,j)=>signature(point)+attributes.map(([name,attribute])=>
          ':'+name+':'+Array.from({length:attribute.itemSize},(_,k)=>attribute.getComponent(ids[j],k)).join(',')).join(''));
      const cyclic=keys.map((_,j)=>[keys[j],keys[(j+1)%3],keys[(j+2)%3]].join('|')).sort()[0];
      const key=group.materialIndex+'|'+cyclic;
      if(seen.has(key)){report.duplicates++;continue;}seen.add(key);kept.push(...ids);
    }
    newGroups.push({start,count:kept.length-start,materialIndex:group.materialIndex});
  }
  if(report.invalid+report.degenerate+report.duplicates){
    geometry.setIndex(kept);geometry.clearGroups();for(const g of newGroups)geometry.addGroup(g.start,g.count,g.materialIndex);
    const box=new Box3();for(const id of new Set(kept))box.expandByPoint(new Vector3(...vertex(id)));
    geometry.boundingBox=box;
    const center=box.isEmpty()?new Vector3():box.getCenter(new Vector3());let radiusSq=0;
    for(const id of new Set(kept))radiusSq=Math.max(radiusSq,center.distanceToSquared(new Vector3(...vertex(id))));
    geometry.boundingSphere=new Sphere(center,Math.sqrt(radiusSq));
  }
  const normal=geometry.attributes.normal;
  if(normal && Array.from(normal.array).some(n=>!Number.isFinite(n))){geometry.computeVertexNormals();report.recomputedNormals=true;}
  return report;
}
