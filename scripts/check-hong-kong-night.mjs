import assert from 'node:assert/strict';
import * as T from 'three';
import {HongKongNightLights,hongKongNight} from '../src/HongKongNightLights.js';
import {HongKongDistrict} from '../src/HongKongDistrict.js';
import {graphicsPixelCeiling} from '../src/PerformanceBudget.js';
assert.equal(graphicsPixelCeiling('balanced',true),1.25);assert.equal(graphicsPixelCeiling('high',true),1.5);assert.equal(graphicsPixelCeiling('high',false),2);
const scene=new T.Scene(),lamps=new HongKongNightLights(scene);
const edge=(x,z)=>({a:new T.Vector3(x,8,z),b:new T.Vector3(x+4,8,z),inward:new T.Vector3(0,0,1)});
lamps.setEdges([edge(0,0),edge(2,0),edge(22,0),edge(45,0)]);
assert.equal(lamps.points.length,3,'Nearby walkway edges must not create a cluster of lamps');
assert.equal(lamps.poles.count,3);lamps.update(0,new T.Vector3());assert(lamps.lights.every(l=>!l.visible));
lamps.update(1,new T.Vector3());assert(lamps.bulbs.visible);assert.equal(lamps.lights.filter(l=>l.visible).length,2);assert(lamps.lights.every(l=>!l.castShadow));
assert.equal(lamps.lights[0].position.y,11.65);lamps.setEdges([]);lamps.update(1,new T.Vector3());assert(!lamps.group.visible);
lamps.dispose();assert(!scene.children.includes(lamps.group));
const district=Object.create(HongKongDistrict.prototype);Object.assign(district,{active:{value:1},facePlanes:[],faceBounds:[],treeCenters:[],treeTops:[],treeActive:{value:0}});
for(const material of [new T.MeshBasicMaterial(),new T.MeshStandardMaterial()]){
 district.applySourceMask(material,'terrain');const lib=material.isMeshBasicMaterial?T.ShaderLib.basic:T.ShaderLib.standard;
 const shader={uniforms:{},vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader};material.onBeforeCompile(shader);
 assert.equal(shader.uniforms.hkNight,hongKongNight);assert(shader.fragmentShader.includes('hkWindowGlow+=')&&shader.fragmentShader.includes('outgoingLight+=hkWindowGlow'));
 material.dispose();
}
console.log('PASS night windows, daytime fade, bounded unshadowed lamps, surveyed-edge placement and disposal');
