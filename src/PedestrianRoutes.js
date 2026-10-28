// Sidewalk, crossing and plaza graph shared by citizen spawn and routing.
// Carriageway rectangles and the procedural street grid are the same outlines the city paints.
export function attachFootpaths(city){
  const nodes=[],adj=[],segments=[];
  const linked=new Set();
  const add=(x,z,kind)=>{const i=nodes.length;nodes.push({x,z,kind,yaw:0});adj.push([]);return i;};
  const link=(a,b,kind='walk')=>{
    if(a==null||b==null||a===b)return;
    const key=a<b?`${a},${b}`:`${b},${a}`;
    if(linked.has(key))return;
    linked.add(key);adj[a].push(b);adj[b].push(a);segments.push([a,b,kind]);
  };
  const span=(a,b,kind)=>{
    const A=nodes[a],B=nodes[b],dist=Math.hypot(B.x-A.x,B.z-A.z),steps=Math.max(1,Math.round(dist/5));
    let prev=a;
    for(let s=1;s<steps;s++){
      const t=s/steps,id=add(A.x+(B.x-A.x)*t,A.z+(B.z-A.z)*t,kind);
      link(prev,id,kind);prev=id;
    }
    link(prev,b,kind);
  };
  const inBuilding=(x,z,pad=.35)=>city.buildings.some(b=>Math.abs(x-b.x)<b.size/2+pad&&Math.abs(z-b.z)<(b.depth||b.size)/2+pad);
  const roads=city.district?.roads||[];
  const inRoad=(x,z,pad=0)=>roads.some(r=>Math.abs(x-r.x)<r.width/2+pad&&Math.abs(z-r.z)<r.depth/2+pad);
  const inPlaza=(x,z)=>(city.district?.zones||[]).some(zone=>zone.kind!=='water'&&Math.abs(x-zone.x)<zone.width/2&&Math.abs(z-zone.z)<zone.depth/2);

  if(city.mapId==='procedural'){
    const {rows,columns,blockSize,streetWidth}=city.layout;
    const step=blockSize+streetWidth,half=(columns*step)/2,inset=blockSize/2+.85;
    const blocks=[];
    for(let r=0;r<rows;r++)for(let c=0;c<columns;c++)blocks.push({r,c,x:-half+c*step+step/2,z:-half+r*step+step/2});
    const corner=new Map();
    const cid=(block,sx,sz)=>{
      const key=`${block.r},${block.c},${sx},${sz}`;
      if(corner.has(key))return corner.get(key);
      const id=add(block.x+sx*inset,block.z+sz*inset,'sidewalk');
      corner.set(key,id);return id;
    };
    const signs=[[-1,-1],[1,-1],[1,1],[-1,1]];
    for(const block of blocks){
      for(let k=0;k<4;k++)span(cid(block,...signs[k]),cid(block,...signs[(k+1)%4]),'sidewalk');
    }
    const at=(r,c)=>blocks.find(block=>block.r===r&&block.c===c);
    for(const block of blocks){
      const east=at(block.r,block.c+1),north=at(block.r+1,block.c);
      if(east){span(cid(block,1,-1),cid(east,-1,-1),'cross');span(cid(block,1,1),cid(east,-1,1),'cross');}
      if(north){span(cid(block,-1,1),cid(north,-1,-1),'cross');span(cid(block,1,1),cid(north,1,-1),'cross');}
    }
  }else{
    const gaps=[];
    const pushChain=(points)=>{
      let prev=null,gap=null;
      for(const [x,z] of points){
        if(inBuilding(x,z)||inRoad(x,z)){if(prev!=null)gap=prev;prev=null;continue;}
        const id=add(x,z,'sidewalk');
        if(gap!=null){gaps.push([gap,id]);gap=null;}
        if(prev!=null)link(prev,id,'sidewalk');
        prev=id;
      }
    };
    for(const road of roads){
      const east=road.width>=road.depth,length=east?road.width:road.depth,width=east?road.depth:road.width;
      for(const side of [-1,1]){
        const across=side*(width/2+.95),points=[];
        for(let t=-length/2+2;t<=length/2-2;t+=5)points.push(east?[road.x+t,road.z+across]:[road.x+across,road.z+t]);
        pushChain(points);
      }
    }
    for(const zone of city.district?.zones||[]){
      if(zone.kind==='water')continue;
      const cols=Math.max(1,Math.round(zone.width/12)),rows=Math.max(1,Math.round(zone.depth/12));
      for(let i=0;i<cols;i++)for(let j=0;j<rows;j++){
        const x=zone.x-zone.width/2+(i+.5)*zone.width/cols,z=zone.z-zone.depth/2+(j+.5)*zone.depth/rows;
        if(inRoad(x,z)||inBuilding(x,z))continue;
        add(x,z,'plaza');
      }
    }
    const clear=(ax,az,bx,bz)=>{
      const steps=Math.max(2,Math.ceil(Math.hypot(bx-ax,bz-az)/1.4));
      for(let i=1;i<steps;i++){
        const t=i/steps,x=ax+(bx-ax)*t,z=az+(bz-az)*t;
        if(inBuilding(x,z,.2)||inRoad(x,z,.05))return false;
      }
      return true;
    };
    for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
      const a=nodes[i],b=nodes[j],dist=Math.hypot(b.x-a.x,b.z-a.z);
      const plaza=a.kind==='plaza'||b.kind==='plaza';
      if(dist>(plaza?14.5:4.8)||!clear(a.x,a.z,b.x,b.z))continue;
      link(i,j,'walk');
    }
    // One ribbon per sidewalk that was cut by a crossing road. Pairing every
    // nearby curb used to paint a 20m fan across the carriageway.
    for(const [a,b] of gaps){
      const A=nodes[a],B=nodes[b],dist=Math.hypot(B.x-A.x,B.z-A.z);
      if(dist<6||dist>36)continue;
      const steps=Math.max(2,Math.ceil(dist/1.2));
      let crossed=false,blocked=false;
      for(let s=1;s<steps;s++){
        const t=s/steps,x=A.x+(B.x-A.x)*t,z=A.z+(B.z-A.z)*t;
        if(inBuilding(x,z,.2))blocked=true;
        if(inRoad(x,z,-.35))crossed=true;
      }
      if(blocked||!crossed)continue;
      const mx=(A.x+B.x)/2,mz=(A.z+B.z)/2;
      const mouths=roads.filter(road=>Math.abs(mx-road.x)<road.width/2+1.2&&Math.abs(mz-road.z)<road.depth/2+1.2);
      if(mouths.length<2)continue;
      span(a,b,'cross');
    }
  }

  for(let i=0;i<nodes.length;i++){
    const next=adj[i][0];
    nodes[i].yaw=next==null?0:Math.atan2(nodes[next].x-nodes[i].x,nodes[next].z-nodes[i].z);
  }
  const distanceTo=(x,z,kind)=>{
    let best=Infinity;
    for(const [a,b,segmentKind] of segments){
      if(kind&&segmentKind!==kind)continue;
      const A=nodes[a],B=nodes[b],abx=B.x-A.x,abz=B.z-A.z;
      const t=Math.max(0,Math.min(1,((x-A.x)*abx+(z-A.z)*abz)/(abx*abx+abz*abz||1)));
      best=Math.min(best,Math.hypot(x-(A.x+abx*t),z-(A.z+abz*t)));
    }
    return best;
  };
  return {
    nodes,
    allows(x,z){
      // Inside the carriageway only the crossing ribbon is walkable. The curb
      // offset keeps the sidewalk corridor from licensing the lane itself.
      if(roads.length&&inRoad(x,z,-.45))return distanceTo(x,z,'cross')<=1.15;
      return distanceTo(x,z)<=1.25||(inPlaza(x,z)&&!inRoad(x,z));
    },
    route(x,z,yaw,passable){
      const fx=Math.sin(yaw),fz=Math.cos(yaw);
      let start=-1,best=25,ahead=-1,aheadBest=25;
      for(let i=0;i<nodes.length;i++){
        if(nodes[i].kind==='cross')continue;
        const dx=nodes[i].x-x,dz=nodes[i].z-z,d=dx*dx+dz*dz;
        if(d>=25)continue;
        if(d<best){best=d;start=i;}
        // The vertex already passed is closer until the next one is halfway.
        // Starting there makes the refresh walk back to it.
        if(dx*fx+dz*fz>-.25&&d<aheadBest){aheadBest=d;ahead=i;}
      }
      if(ahead>=0)start=ahead;
      if(start<0)return [];
      const queue=[{i:start,parent:-1,cost:0}];
      const seen=new Set([start]);
      let choice=null,score=-Infinity;
      for(let cursor=0;cursor<queue.length&&cursor<64;cursor++){
        const node=queue[cursor];
        if(node.cost>32)continue;
        for(const j of adj[node.i]){
          if(seen.has(j))continue;
          const a=nodes[node.i],b=nodes[j];
          if(passable&&!passable(a.x,a.z,b.x,b.z))continue;
          seen.add(j);
          const step=Math.hypot(b.x-a.x,b.z-a.z),next={i:j,parent:cursor,cost:node.cost+step};
          queue.push(next);
          const gain=(b.x-x)*fx+(b.z-z)*fz-next.cost*.12;
          if(gain>score){score=gain;choice=next;}
        }
      }
      if(!choice)return [];
      const path=[];
      for(let item=choice;item&&item.i!==start;item=item.parent<0?null:queue[item.parent])path.unshift(nodes[item.i]);
      const sx=nodes[start].x-x,sz=nodes[start].z-z;
      if(Math.hypot(sx,sz)>.45&&sx*fx+sz*fz>=-.05)path.unshift(nodes[start]);
      return path;
    }
  };
}
