import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadMotionRig,disposeRig} from '../../../scripts/lib/motion-rig.mjs';
import {createFirstPersonArm,disposeFirstPersonRig} from '../../../src/FirstPersonArms.js';

const folder='docs/qa/wrist-detail-2026-10-15',tmp=fs.mkdtempSync(path.join(os.tmpdir(),'wrist-before-')),results=[];
try{
  fs.symlinkSync(path.resolve('node_modules'),path.join(tmp,'node_modules'),'dir');
  fs.writeFileSync(path.join(tmp,'package.json'),'{"type":"module"}');fs.cpSync('src',path.join(tmp,'src'),{recursive:true});
  execFileSync('tar',['-xzf',path.resolve(folder+'/source-before-review.tar.gz'),'-C',tmp,'src/FirstPersonArms.js']);
  const old=await import(pathToFileURL(path.join(tmp,'src/FirstPersonArms.js'))),{actor}=await loadMotionRig(),c=actor();
  for(const side of ['left','right']){
    const before=old.createFirstPersonArm(side,c.model),after=createFirstPersonArm(side,c.model);
    before.arm.updateMatrixWorld(true);after.arm.updateMatrixWorld(true);
    const b=before.arm.userData.hand,a=after.arm.userData.hand;
    const bs=b.model.getObjectByProperty('isSkinnedMesh',true),as=a.model.getObjectByProperty('isSkinnedMesh',true);
    const indices=new Set(as.geometry.index.array),handVertices=new Set(bs.geometry.index.array);
    assert([...handVertices].every(i=>indices.has(i)),'Lost original hand geometry');
    for(const attr of ['position','normal','uv','skinIndex','skinWeight'])for(const vertex of handVertices){
      const x=as.geometry.attributes[attr],y=bs.geometry.attributes[attr];
      for(let component=0;component<x.itemSize;component++)assert.equal(x.getComponent(vertex,component),y.getComponent(vertex,component),`${side}: hand ${attr} changed`);
    }
    let max=0;
    for(const name of Object.keys(b.bones).filter(n=>/hand/i.test(n)))max=Math.max(max,b.bones[name].getWorldPosition(new THREE.Vector3()).distanceTo(a.bones[name].getWorldPosition(new THREE.Vector3())));
    assert(max<1e-7);
    results.push({side,status:'PASS',originalHandTriangles:b.triangles,continuousArmTriangles:a.triangles,maxHandJointDisplacement:max,handVertices:handVertices.size,handVertexAttributesUnchanged:true});
    disposeFirstPersonRig(before.arm);disposeFirstPersonRig(after.arm);
  }
  disposeRig(c);fs.writeFileSync(folder+'/hand-preservation.json',JSON.stringify(results,null,2)+'\n');console.log(results);
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
