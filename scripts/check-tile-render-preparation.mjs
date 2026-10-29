import assert from 'node:assert/strict';
import {prepareTilePrograms,TileRenderPreparation} from '../src/TileRenderPreparation.js';
function fixture(){
 const material={},program={isReady:()=>true},state={compiled:0,lost:false,stopped:false,program};
 const model={},camera={},scene={};
 const renderer={extensions:{has:()=>true},getContext:()=>({isContextLost:()=>state.lost}),properties:{get:()=>({currentProgram:state.program})},compile:(...args)=>{assert.deepEqual(args,[model,camera,scene]);state.compiled++;return new Set([material]);}};
 return {renderer,model,camera,scene,state,run:()=>prepareTilePrograms(renderer,model,camera,scene,()=>state.stopped)};
}
let f=fixture();assert.equal(await f.run(),true);assert.equal(f.state.compiled,1);
f=fixture();let checks=0;f.state.program.isReady=()=>++checks>=3;assert.equal(await f.run(),true);assert.equal(checks,3);
console.log('PASS: tile programs use destination scene lighting/fog and wait cooperatively for asynchronous linking');
f=fixture();f.renderer.extensions.has=()=>false;assert.equal(await f.run(),false);assert.equal(f.state.compiled,0);
f=fixture();f.state.lost=true;assert.equal(await f.run(),false);assert.equal(f.state.compiled,0);
f=fixture();f.state.stopped=true;assert.equal(await f.run(),false);assert.equal(f.state.compiled,0);
console.log('PASS: unsupported GPUs, lost contexts and disposed cities retain the normal rendering path');
f=fixture();f.state.program.isReady=()=>false;setTimeout(()=>{f.state.stopped=true;},1);assert.equal(await f.run(),false);
f=fixture();f.state.program.isReady=()=>false;setTimeout(()=>{f.state.lost=true;},1);assert.equal(await f.run(),false);
f=fixture();f.state.program.isReady=()=>false;setTimeout(()=>{f.state.program=undefined;},1);assert.equal(await f.run(),false);
console.log('PASS: disposal, context loss and cleared program properties stop pending preparation without leaked polling');
f=fixture();f.state.program.isReady=()=>false;
const previousPerformance=globalThis.performance;let clock=0;
try{globalThis.performance={now:()=>clock++*2001};assert.equal(await f.run(),false);}finally{globalThis.performance=previousPerformance;}
console.log('PASS: a driver that never completes linking cannot hold the parse queue indefinitely');
function owned(){
 const f=fixture();let disposals=0;
 const material={dispose(){disposals++;}};f.model.traverse=callback=>{callback({material});callback({material:[material]});};
 const preparation=new TileRenderPreparation(f.renderer,f.camera,f.scene);
 return {...f,preparation,disposals:()=>disposals};
}
let o=owned(),tile={};o.state.program.isReady=()=>false;
const cancelled=o.preparation.prepare(o.model,tile);o.preparation.cancel(tile);o.preparation.cancel(tile);
assert.equal(await cancelled,false);assert.equal(o.disposals(),1);assert.equal(o.preparation.pending.size,0);
o=owned();o.state.program.isReady=()=>false;const disposed=o.preparation.prepare(o.model,{});o.preparation.dispose();assert.equal(await disposed,false);assert.equal(o.disposals(),1);assert.equal(o.preparation.pending.size,0);assert.equal(await o.preparation.prepare(o.model,{}),false);
o=owned();assert.equal(await o.preparation.prepare(o.model,{}),true);assert.equal(o.disposals(),0);assert.equal(o.preparation.pending.size,0);
o=owned();tile={};o.preparation.cancel(tile);assert.equal(await o.preparation.prepare(o.model,tile),false);assert.equal(o.state.compiled,0);assert.equal(o.disposals(),0);
o=owned();o.renderer.compile=()=>{throw new Error('Controlled program setup failure');};await assert.rejects(o.preparation.prepare(o.model,{}),/Controlled/);assert.equal(o.disposals(),1);assert.equal(o.preparation.pending.size,0);
console.log('PASS: cancelled/failed tile preparation releases each material once; activated tiles remain owned by TilesRenderer');
