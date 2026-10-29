import assert from 'node:assert/strict';
import {TilesRenderer} from '3d-tiles-renderer/three';
import {FAILED,UNLOADED,LOADED} from '3d-tiles-renderer/core';
import {resetProcessedFailedTiles} from '../src/TileRecovery.js';
const tiles=new TilesRenderer('https://example.invalid/tileset.json');
const failed={internal:{loadingState:FAILED},children:[]},loaded={internal:{loadingState:LOADED},children:[]},raw={children:[{children:[]}]};
tiles.rootTileset={root:{internal:{loadingState:LOADED},children:[failed,raw,loaded]}};tiles.rootLoadingState=LOADED;tiles.stats.failed=1;
assert.throws(()=>tiles.resetFailedTiles(),TypeError,'Library no longer reproduces the lazy-sibling issue; review the compatibility helper');
failed.internal.loadingState=FAILED; // Rewind the mutation preceding the library exception.
let parsed=0;tiles.ensureChildrenArePreprocessed=()=>parsed++;
assert.equal(resetProcessedFailedTiles(tiles),1);assert.equal(failed.internal.loadingState,UNLOADED);assert.equal(loaded.internal.loadingState,LOADED);assert.equal(raw.internal,undefined);assert.equal(parsed,0);assert.equal(tiles.stats.failed,0);
assert.equal(resetProcessedFailedTiles(tiles),0);
tiles.rootLoadingState=FAILED;assert.equal(resetProcessedFailedTiles(tiles),1);assert.equal(tiles.rootLoadingState,UNLOADED);
// Do not dispose synthetic children through the engine's real GPU bookkeeping.
tiles.rootTileset=null;tiles.dispose();
console.log('PASS actual TilesRenderer lazy sibling recovery: reproduces old TypeError, resets failed/root records, retains loaded tiles, no forced hierarchy parsing');
