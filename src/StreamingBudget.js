// Cache budget excludes the JS heap, collision world and GPU driver memory.
export function streamingBudget(quality='balanced',{mobile=false,memoryGB=null}={}) {
  const constrained=mobile||(Number.isFinite(memoryGB)&&memoryGB<=4);
  const ceiling=constrained?{low:96,balanced:160,high:256}:{low:192,balanced:384,high:640};
  const maxMB=ceiling[quality]||ceiling.balanced;
  return {maxBytes:maxMB*1024*1024,minBytes:Math.floor(maxMB*.55)*1024*1024,maxTiles:constrained?1200:2400,minTiles:constrained?400:800};
}
