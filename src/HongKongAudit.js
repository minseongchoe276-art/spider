// Opt-in evidence surface. Gameplay uses the same real city and controller.
export function createHongKongAudit(app) {
  if(typeof location==='undefined')return null;
  if(!new URLSearchParams(location.search).has('hongKongAudit'))return null;
  const panel=document.createElement('aside');panel.style.cssText='position:fixed;right:12px;top:80px;width:360px;max-height:45vh;overflow:auto;background:#11202eed;color:white;padding:12px;z-index:20;font:12px monospace;white-space:pre-wrap';
  const title=document.createElement('strong');title.textContent='홍콩 실제 지형 · 동작 검사';
  const output=document.createElement('pre');output.id='hong-kong-audit';panel.append(title,output);document.body.append(panel);
  const history=[];let last='',next=0;
  return {update(now){
    const p=app.physics,c=app.city,a=app.character.activeAction?.getClip().name;
    const state=p.state+'/'+a;if(state!==last){history.push(state);if(history.length>40)history.shift();last=state;}
    if(now<next)return;next=now+.25;
    output.textContent=JSON.stringify({map:c.isStreamed?'Hong Kong':'procedural',ready:c.isReady,position:p.position.toArray().map(n=>+n.toFixed(3)),velocity:p.velocity.toArray().map(n=>+n.toFixed(3)),state:p.state,motion:a,mode:app.combat.mode,webs:p.webs.map(w=>({hand:w.hand,anchor:w.anchor.toArray().map(n=>+n.toFixed(2)),length:+w.length.toFixed(2),supported:p.anchorSupported?.(w)})),support:c.supportHeight?.(p.position),collision:c.collisionWorld?.meshes.size,pending:c.collisionWorld?.pending.length,history,decodedRGBTextures:c.decodedRGBTextures || 0,textureDiagnostics:c.textureDiagnostics},null,1);
  }};
}
