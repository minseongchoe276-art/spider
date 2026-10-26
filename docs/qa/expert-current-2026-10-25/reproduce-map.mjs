import assert from 'node:assert/strict';
import fs from 'node:fs';
import {WorldMap} from '../../../src/WorldMap.js';

// Observe the actual drawing method without changing production code.
globalThis.innerWidth=1280;globalThis.innerHeight=720;
const strokes=[],fills=[];
const ctx=new Proxy({lineWidth:1,strokeStyle:'',fillStyle:'',
  strokeRect(...rectangle){strokes.push({rectangle,lineWidth:this.lineWidth,color:this.strokeStyle});},
  fillRect(...rectangle){fills.push({rectangle,color:this.fillStyle});}
},{get:(target,key)=>key in target?target[key]:(()=>{})});
const city={isStreamed:false,mapId:'procedural',playableHalfExtent:160,
  layout:{blockSize:32,streetWidth:28},profile:{accent:'#65e8ed'}};
const footprint={minX:-16,maxX:16,minZ:-16,maxZ:16,height:80};
const map={isOpen:true,lastDraw:-1000,canvas:{width:520,height:520},ctx,
  root:{querySelector:()=>({textContent:''})},
  game:{city,minimap:{range:180,collectFootprints:()=>[footprint]},
    physics:{position:{x:0,y:0,z:0}},multiplayer:{minimapPlayers:()=>[]},combat:{enemies:[]}}};
WorldMap.prototype.update.call(map);
const building=strokes.find(item=>item.color==='#65e8ed');
const result={status:'CONFIRMED_DEFECT',viewport:[1280,720],canvas:map.canvas,
  building,roadStrokeLeaksIntoBuilding:building.lineWidth>40,
  explanation:'WorldMap.update leaves the procedural road lineWidth active when outlining building footprints.'};
assert.equal(result.roadStrokeLeaksIntoBuilding,true);
fs.writeFileSync(new URL('./map-defect.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
