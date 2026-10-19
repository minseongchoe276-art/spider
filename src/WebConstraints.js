// Closest point in the intersection of two rope-length balls. Alternating
// projections converge too slowly when two strands pull nearly opposite ways.
function projectPair(position, a, b) {
  const inside=(point,web)=>point.distanceToSquared(web.anchor)<=(web.length+1e-8)**2;
  if(inside(position,a)&&inside(position,b))return true;
  for(const web of [a,b]){
    const offset=position.clone().sub(web.anchor),distance=offset.length();
    const candidate=distance>web.length?web.anchor.clone().addScaledVector(offset,web.length/distance):position.clone();
    if(inside(candidate,a)&&inside(candidate,b)){position.copy(candidate);return true;}
  }
  const axis=b.anchor.clone().sub(a.anchor),distance=axis.length();
  if(distance<1e-10 || distance>a.length+b.length+1e-8 || distance<Math.abs(a.length-b.length)-1e-8)return false;
  axis.divideScalar(distance);
  const along=(a.length*a.length-b.length*b.length+distance*distance)/(2*distance);
  const center=a.anchor.clone().addScaledVector(axis,along);
  const radius=Math.sqrt(Math.max(0,a.length*a.length-along*along));
  const radial=position.clone().sub(center);radial.addScaledVector(axis,-radial.dot(axis));
  if(radial.lengthSq()<1e-16){
    radial.copy(axis).set(Math.abs(axis.x)<.8?1:0,Math.abs(axis.x)<.8?0:1,0);
    radial.addScaledVector(axis,-radial.dot(axis));
  }
  position.copy(center).addScaledVector(radial,radius/radial.length());return true;
}

// A simultaneous, non-energy-adding impulse for the two unilateral limits.
function projectPairVelocity(velocity, normals) {
  if(normals.every(normal=>velocity.dot(normal)<=1e-9))return;
  for(const normal of normals){
    const candidate=velocity.clone().addScaledVector(normal,-Math.max(0,velocity.dot(normal)));
    if(normals.every(n=>candidate.dot(n)<=1e-9)){velocity.copy(candidate);return;}
  }
  const axis=normals[0].clone().cross(normals[1]),squared=axis.lengthSq();
  if(squared>1e-16)velocity.copy(axis.multiplyScalar(velocity.dot(axis)/squared));
  else velocity.addScaledVector(normals[0],-velocity.dot(normals[0]));
}

// A web is a unilateral distance limit: slack strands do not push the body.
// Alternating projections enforce both limits instead of inventing a midpoint
// anchor (which would not keep either real attachment point fixed).
export function constrainWebs(position, velocity, webs) {
  const exact=webs.length===2&&projectPair(position,webs[0],webs[1]);
  for (let pass=0;pass<(exact?0:64);pass++) {
    let error=0;
    for (const web of webs) {
      const radial=position.clone().sub(web.anchor),distance=radial.length();
      const excess=distance-web.length;error=Math.max(error,excess);
      if(excess>1e-7 && distance>1e-8)position.addScaledVector(radial,-excess/distance);
    }
    if(error<1e-6)break;
  }
  if(webs.length===2){
    const normals=webs.filter(web=>position.distanceTo(web.anchor)>=web.length-1e-4)
      .map(web=>position.clone().sub(web.anchor).normalize());
    if(normals.length===2){projectPairVelocity(velocity,normals);return;}
  }
  // At a taut strand only outward velocity is forbidden. Several projection
  // passes prevent the second strand's impulse reintroducing stretch in the first.
  for(let pass=0;pass<64;pass++) {
    let impulse=0;
    for(const web of webs) {
      const radial=position.clone().sub(web.anchor),distance=radial.length();
      if(distance<web.length-1e-4 || distance<1e-8)continue;
      radial.divideScalar(distance);
      const outward=velocity.dot(radial);
      if(outward>0){velocity.addScaledVector(radial,-outward);impulse=Math.max(impulse,outward);}
    }
    if(impulse<1e-6)break;
  }
}
