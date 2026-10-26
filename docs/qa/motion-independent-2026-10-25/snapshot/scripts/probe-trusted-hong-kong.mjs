// Exploratory server-side loader: official map geometry, no player-provided meshes.
import * as THREE from 'three';
import {TilesRenderer} from '3d-tiles-renderer/three';
import {GLTFExtensionsPlugin,ReorientationPlugin} from '3d-tiles-renderer/three/plugins';
globalThis.ProgressEvent ||= class {constructor(type,values){Object.assign(this,values);}};
globalThis.requestAnimationFrame ||= callback=>setTimeout(()=>callback(performance.now()),16);
globalThis.cancelAnimationFrame ||= id=>clearTimeout(id);
globalThis.window ||= {location:{href:'https://data.map.gov.hk/'},
  requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
const camera=new THREE.OrthographicCamera(-500,500,500,-500,1,3000);
camera.position.set(0,1500,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
const paths=['/api/3d-data/3dtiles/f2/tileset.json','/api/3d-data/3dsd/WGS84/building/tileset.json',
  '/api/3d-data/3dsd/WGS84/infrastructure/tileset.json'];
const roots=paths.map(path=>{
  const tiles=new TilesRenderer('https://data.map.gov.hk'+path);
  tiles.registerPlugin(new GLTFExtensionsPlugin({metadata:false,plugins:[parser=>{
    parser.json.materials=parser.json.materials?.map(()=>({}));
    return {name:'ServerGeometryOnly'};
  }]}));
  tiles.registerPlugin(new ReorientationPlugin({lat:THREE.MathUtils.degToRad(22.2799955),
    lon:THREE.MathUtils.degToRad(114.165495),height:0}));
  tiles.setCamera(camera);tiles.setResolution(camera,1024,1024);tiles.errorTarget=8;
  tiles.addEventListener('load-error',event=>console.error('Map load error:',event.url,event.error?.message));
  return tiles;
});
const started=Date.now();
try{
  while(Date.now()-started<45000){
    for(const tiles of roots){tiles.update();tiles.group.updateMatrixWorld(true);}
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  const output=roots.map(tiles=>{
    let meshes=0,triangles=0;tiles.group.traverse(object=>{if(object.isMesh){meshes++;triangles+=(object.geometry.index?.count||object.geometry.attributes.position.count)/3;}});
    return {meshes,triangles,stats:tiles.stats};
  });
  console.log(JSON.stringify({scope:'Geometry streaming probe, not authoritative coverage certification',output},null,2));
  if(output.some(layer=>layer.meshes===0))process.exitCode=1;
}finally{for(const tiles of roots)tiles.dispose();}
