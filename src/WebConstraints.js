// A web is a unilateral distance limit: slack strands do not push the body.
// Alternating projections enforce both limits instead of inventing a midpoint
// anchor (which would not keep either real attachment point fixed).
export function constrainWebs(position, velocity, webs) {
  for (let pass=0;pass<64;pass++) {
    let error=0;
    for (const web of webs) {
      const radial=position.clone().sub(web.anchor),distance=radial.length();
      const excess=distance-web.length;error=Math.max(error,excess);
      if(excess>1e-7 && distance>1e-8)position.addScaledVector(radial,-excess/distance);
    }
    if(error<1e-6)break;
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
