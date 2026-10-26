// Follow the uploaded mesh's surface to distinguish a sleeve from the jacket
// beside it. Euclidean boxes cut through the inner sleeve and create spikes.
export function armSurfaceRegions(geometry,scale,groundOffset) {
  const p=geometry.attributes.position,vertices=[],lookup=new Map(),ids=[];
  for(let i=0;i<p.count;i++){
    const point=[p.getX(i)*scale,(p.getY(i)-groundOffset)*scale-.008427,p.getZ(i)*scale];
    const key=point.map(x=>Math.round(x*1e5)).join(',');
    if(!lookup.has(key)){lookup.set(key,vertices.length);vertices.push(point);}
    ids.push(lookup.get(key));
  }
  const adjacent=vertices.map(()=>new Set()),index=geometry.index;
  for(let i=0;i<(index?.count || p.count);i+=3){
    const triangle=[0,1,2].map(k=>ids[index?index.getX(i+k):i+k]);
    for(let k=0;k<3;k++){const a=triangle[k],b=triangle[(k+1)%3];adjacent[a].add(b);adjacent[b].add(a);}
  }
  geometry.userData.transferTopology={ids,adjacent,vertices};
  const distance=new Float64Array(vertices.length).fill(Infinity),label=new Uint8Array(vertices.length),heap=[];
  function push(item){let i=heap.length;heap.push(item);while(i){const parent=(i-1)>>1;if(heap[parent][0]<=item[0])break;heap[i]=heap[parent];i=parent;}heap[i]=item;}
  function pop(){const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length && heap[child+1][0]<heap[child][0])child++;if(heap[child][0]>=last[0])break;heap[i]=heap[child];i=child;}heap[i]=last;}return first;}
  vertices.forEach(([x,y],i)=>{
    const arm=Math.abs(x)>.31 && y>1.10 && y<1.48;
    const body=(Math.abs(x)<.16 && y<1.52) || y<.78 || y>1.82;
    if(arm || body){distance[i]=0;label[i]=arm?1:0;push([0,i]);}
  });
  while(heap.length){
    const [d,i]=pop();if(d>distance[i])continue;
    const a=vertices[i];
    for(const next of adjacent[i]){
      const b=vertices[next],candidate=d+Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
      if(candidate>=distance[next])continue;
      distance[next]=candidate;label[next]=label[i];push([candidate,next]);
    }
  }
  // Disconnected buckles/accessories use the conservative body assignment.
  return Uint8Array.from(ids,id=>label[id]);
}

export function smoothSurfaceWeights(geometry,joints,weights,iterations=24) {
  const {ids,adjacent,vertices}=geometry.userData.transferTopology;
  let values=adjacent.map(()=>new Map()),counts=new Uint32Array(adjacent.length);
  ids.forEach((id,i)=>{counts[id]++;for(let k=0;k<4;k++){const bone=joints[i*4+k];values[id].set(bone,(values[id].get(bone)||0)+weights[i*4+k]);}});
  values.forEach((map,i)=>{for(const [bone,w] of map)map.set(bone,w/counts[i]);});
  for(let pass=0;pass<iterations;pass++)values=values.map((current,id)=>{
    // Extra cloth relaxation across the armpit; retain the finer finger,
    // ankle and toe articulation after the initial seam smoothing.
    if(pass>=10 && (vertices[id][1]<1.1 || vertices[id][1]>1.75))return current;
    const next=new Map();
    for(const [bone,w]of current)next.set(bone,w*.3);
    for(const neighbor of adjacent[id])for(const [bone,w]of values[neighbor])next.set(bone,(next.get(bone)||0)+w*.7/adjacent[id].size);
    const best=[...next].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=best.reduce((s,[,w])=>s+w,0);
    return new Map(best.map(([bone,w])=>[bone,w/sum]));
  });
  ids.forEach((id,i)=>{const best=[...values[id]];for(let k=0;k<4;k++){joints[i*4+k]=best[k]?.[0] || 0;weights[i*4+k]=best[k]?.[1] || 0;}});
}
