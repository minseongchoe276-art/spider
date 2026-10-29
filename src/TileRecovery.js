import {FAILED,UNLOADED,LOADED} from '3d-tiles-renderer/core';

// Back off consecutive failures, but never spend a lifetime retry allowance.
// Keep the earliest deadline when several tiles fail in the same batch.
export function scheduleTileRetry(tiles, now = performance.now()) {
  const state=tiles.userData;
  if(!state.retryAt)state.retryAt=now+Math.min(30000,2000*2**Math.min(state.retries||0,4));
}

export function recoverFailedTiles(tiles, now = performance.now()) {
  const state=tiles.userData;
  if(state.retryAt && now>=state.retryAt){
    state.retryAt=0;
    state.retries=Math.min((state.retries||0)+1,5);
    return resetProcessedFailedTiles(tiles);
  }
  // Wait for the retry batch to finish before treating it as recovered.
  if(!state.retryAt && tiles.rootLoadingState===LOADED && !tiles.stats.failed &&
      !tiles.stats.downloading && !tiles.stats.parsing && !tiles.stats.queued){
    state.retries=0;
  }
  return 0;
}

// TilesRenderer's resetFailedTiles walks lazily downloaded JSON children with
// ensureFullyProcessed=false but assumes every child already has `internal`.
// Hong Kong can contain unprocessed siblings when a request fails. Reset only
// initialized failure records without forcing the entire hierarchy to parse.
export function resetProcessedFailedTiles(tiles) {
  let reset=0;
  if(tiles.rootLoadingState===FAILED){tiles.rootLoadingState=UNLOADED;reset++;}
  if(!tiles.stats.failed)return reset;
  tiles.traverse(tile=>{
    if(tile.internal?.loadingState===FAILED){tile.internal.loadingState=UNLOADED;reset++;}
  },null,false);
  tiles.stats.failed=0;
  return reset;
}
