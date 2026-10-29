// Three's compile() starts linking without the blocking first-use uniform
// query. Poll the same program readiness used by compileAsync, but stop if
// the city/context is disposed instead of leaving a timer polling forever.
export async function prepareTilePrograms(renderer,model,camera,scene,stopped=()=>false) {
  if(stopped() || !renderer.extensions?.has('KHR_parallel_shader_compile') ||
      !renderer.compile || !renderer.properties?.get || renderer.getContext().isContextLost())return false;
  const materials=renderer.compile(model,camera,scene);
  const deadline=performance.now()+2000;
  while(true){
    if(stopped() || renderer.getContext().isContextLost())return false;
    for(const material of materials){
      const program=renderer.properties.get(material).currentProgram;
      if(typeof program?.isReady!=='function')return false; // Context reset or an unsupported renderer revision.
      if(program.isReady())materials.delete(material);
    }
    if(!materials.size)return true;
    if(performance.now()>=deadline)return false;
    await new Promise(resolve=>setTimeout(resolve,8));
  }
}

function releasePrograms(model){
  const materials=new Set();
  model.traverse(object=>{for(const material of Array.isArray(object.material)?object.material:[object.material])if(material)materials.add(material);});
  for(const material of materials)material.dispose();
}

// TilesRenderer normally collects materials after processTileModel finishes.
// A tile evicted while linking has not entered that disposal list yet, so
// explicitly release its prepared programs when its request is cancelled.
export class TileRenderPreparation {
  constructor(renderer,camera,scene){
    Object.assign(this,{renderer,camera,scene,pending:new Map(),cancelledTiles:new WeakSet(),disposed:false});
  }

  async prepare(model,tile){
    // A cancelled request can finish decoding after disposeTile has run.
    // Tile identities are reused on revisits, so conservatively leave those
    // tiles on Three's normal rendering path rather than warm a stale model.
    if(this.disposed||this.cancelledTiles.has(tile))return false;
    const record={model,cancelled:false};this.pending.set(tile,record);
    try{
      const ready=await prepareTilePrograms(this.renderer,model,this.camera,this.scene,()=>record.cancelled||this.disposed);
      return ready&&!record.cancelled&&!this.disposed;
    }catch(error){
      if(!record.cancelled){record.cancelled=true;releasePrograms(model);}
      throw error;
    }finally{
      if(this.pending.get(tile)===record)this.pending.delete(tile);
    }
  }

  cancel(tile){
    this.cancelledTiles.add(tile);
    const record=this.pending.get(tile);
    if(record&&!record.cancelled){record.cancelled=true;releasePrograms(record.model);}
  }

  dispose(){
    this.disposed=true;
    for(const tile of this.pending.keys())this.cancel(tile);
    this.pending.clear();
  }
}
