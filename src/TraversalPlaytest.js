// Development-only integration harness: uses the real GameApp, map, event
// handlers, animation clock and renderer. No pose-review or mocked physics.
import * as THREE from 'three';

export function startTraversalPlaytest(GameApp) {
  const game = new GameApp();
  const panel = document.createElement('section');
  panel.style.cssText = 'position:fixed;top:145px;left:12px;z-index:10000;background:#102330ed;color:white;padding:12px;max-width:390px;font:12px monospace';
  const status = document.createElement('pre');
  status.style.cssText = 'white-space:pre-wrap;max-height:260px;overflow:auto';
  status.textContent = 'Loading actual game…';
  panel.append(status);
  document.body.append(panel);
  const results = [];
  let busy = false;
  const key = (code, down) => game.gamepad.key(code, down);
  const tap = code => { key(code, true); key(code, false); };
  const setView = first => {
    for (let n = 0; n < 4 && (game.tpsCamera.mode === 'first') !== first; n++) tap('KeyV');
  };
  const report = (name, detail, pass) => {
    results.push({name, pass, ...detail});
    status.textContent = `${name}: ${pass?'PASS':'FAIL'}\n${JSON.stringify(detail, null, 2)}`;
    panel.dataset.results = JSON.stringify(results);
  };
  function prepare(first, wall) {
    game.multiplayer.beginSolo();
    game.isPlaying = true; game.isPaused = false;
    game.clearInput(); game.physics.resetPosition();
    game.clickToPlayOverlay?.classList.add('hidden');
    const p = game.physics;
    // A real south-facing facade with its existing rendered roof parapet.
    const box = game.city.colliders.find(c => c.minY < 1 && c.maxY > 25 && c.maxX-c.minX > 10 && c.maxZ-c.minZ > 10);
    if (!box) throw new Error('No procedural facade found; use ?city=procedural');
    p.position.set((box.minX+box.maxX)/2, wall ? box.maxY-5 : box.maxY-15, box.maxZ+(wall ? 0.7 : 12));
    p.previousFixedPosition.copy(p.position); p.renderPosition.copy(p.position);
    p.velocity.set(0, 0, 0); p.state = wall ? 'WALL_RUNNING' : 'FALLING';
    p.wallBuilding = wall ? box : null; p.wallNormal.set(0,0,1); p.facingAngle = Math.PI;
    game.character.wallNormal = p.wallNormal.clone();
    setView(first);
    game.tpsCamera.placeBehind(p.position, Math.PI);
    game.tpsCamera.lockBehind = false;
    game.camera.position.copy(game.tpsCamera.currentPos);
    game.camera.lookAt(game.tpsCamera.lookAtTarget);
    game.camera.updateMatrixWorld(true);
    return box;
  }
  async function run(kind, first, switching) {
    if (busy || !game.assetsReady) return;
    busy = true;
    const name = `${kind}/${first?'first':'third'}${switching?'/switch':''}`;
    try {
      const box = prepare(first, kind === 'climb');
      const p = game.physics, states = new Set();
      let frames=0, elapsed=0, maxStep=0, previous=p.position.clone(), switches=0, seenWeb=false, maxWristError=0;
      let nextSwitch=.6, released=false, leftReleased=false, independentRelease=false, peakWebs=0, reachedRoof=false, maxAimError=0;
      if (kind === 'climb') { key('KeyW',true); key('KeyF',true); }
      else {
        game.tpsCamera.pitch = first ? .45 : -.45;
        // Let the real camera update before firing through the center reticle.
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        game.gamepad.mouse(0,true); game.gamepad.mouse(2,true);
      }
      let last=performance.now();
      await new Promise(resolve => {
        function frame(now) {
          const dt=Math.min((now-last)/1000,.1);last=now;elapsed+=dt;frames++;
          states.add(p.state);maxStep=Math.max(maxStep,p.position.distanceTo(previous));previous.copy(p.position);
          let switchedThisFrame=false;
          if (switching && elapsed>=nextSwitch && (kind==='web' ? elapsed<2 : !reachedRoof)) {
            const yaw=game.tpsCamera.yaw, pitch=game.tpsCamera.pitch;
            setView(game.tpsCamera.mode!=='first');
            maxAimError=Math.max(maxAimError,Math.abs(game.tpsCamera.yaw-yaw),Math.abs(game.tpsCamera.pitch+pitch));
            switches++;nextSwitch+=.45;switchedThisFrame=true;
          }
          seenWeb ||= p.webs.length>0;peakWebs=Math.max(peakWebs,p.webs.length);
          independentRelease ||= leftReleased && !released && p.webs.length===1;
          // A mode selected here is rendered by GameApp on the next RAF.
          if(game.character.isFirstPerson && !switchedThisFrame)for(const [hand,mesh] of [['right',game.character.webMesh],['left',game.character.webMeshOffhand]]) {
            if(!mesh.visible)continue;
            const wrist=game.character.firstPersonHands[hand==='left'?0:1].getWorldPosition(new THREE.Vector3());
            const positions=mesh.geometry.attributes.position;
            const center=new THREE.Vector3();for(let i=0;i<6;i++)center.add(new THREE.Vector3().fromBufferAttribute(positions,i));center.divideScalar(6);
            maxWristError=Math.max(maxWristError,center.distanceTo(wrist));
          }
          if(kind==='climb' && states.has('MANTLING') && ['IDLE','RUNNING'].includes(p.state)) {
            reachedRoof=true;key('KeyW',false);key('KeyF',false);
          }
          if(kind==='web' && elapsed>1.5 && !leftReleased){game.gamepad.mouse(0,false);leftReleased=true;}
          if(kind==='web' && elapsed>2 && !released){game.gamepad.mouse(2,false);released=true;}
          panel.dataset.live=JSON.stringify({name,state:p.state,view:game.tpsCamera.mode,elapsed,frames,switches,position:p.position.toArray()});
          if(elapsed<(kind==='climb'?4.5:3))requestAnimationFrame(frame);else resolve();
        }
        requestAnimationFrame(frame);
      });
      const detail={frames,states:[...states],switches,maxAimError,maxStep,maxWristError,seenWeb,peakWebs,independentRelease,reachedRoof,finalState:p.state,roof:box.maxY,position:p.position.toArray(),released:!game.character.webMesh.visible&&!game.character.webMeshOffhand.visible};
      const pass=kind==='climb'?reachedRoof && maxStep<.8 && maxAimError<1e-8:seenWeb && peakWebs===2 && independentRelease && detail.released && maxWristError<.02 && maxAimError<1e-8;
      report(name,detail,pass);
    } catch(error) { report(name,{error:error.message},false); }
    finally {game.clearInput();game.setPaused(true);game.clickToPlayOverlay?.classList.add('hidden');busy=false;}
  }
  const cases = [
    ['Climb third','climb',false,false],['Climb first','climb',true,false],['Climb switch','climb',false,true],
    ['Web third','web',false,false],['Web first','web',true,false],['Web switch','web',false,true],
  ];
  const all=document.createElement('button');all.textContent='Run all';
  all.onclick=async()=>{if(busy)return;for(const [,kind,first,switching] of cases)await run(kind,first,switching);};panel.append(all);
  for(const [label,kind,first,switching] of cases) {
    const button=document.createElement('button');button.textContent=label;
    button.onclick=()=>run(kind,first,switching);panel.append(button);
  }
  const ready=setInterval(()=>{if(game.assetsReady){clearInterval(ready);status.textContent='Ready: real GameApp traversal playtest';}},100);
}
