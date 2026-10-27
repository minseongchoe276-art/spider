import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,prune,weld,simplify} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
const source=process.argv[2];if(!source)throw Error('Usage: node scripts/build-vehicle.mjs /absolute/path/to/bmw_330i_-_description.glb');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),doc=await io.read(source);
const count=()=>doc.getRoot().listMeshes().reduce((sum,m)=>sum+m.listPrimitives().reduce((n,p)=>n+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0),0);
const before=count(),credits=doc.getRoot().getAsset().extras;
// The download includes a display platform and floating description. Keep only the car.
for(const n of doc.getRoot().listNodes())if(['Object_10_0','Cube_179','Plane_180'].includes(n.getName()))n.dispose();
await MeshoptSimplifier.ready;
await doc.transform(prune(),weld(),simplify({simplifier:MeshoptSimplifier,ratio:.16,error:.002}),dedup(),prune());
const out='public/vehicles';fs.mkdirSync(out,{recursive:true});await io.write(path.join(out,'bmw-330i.glb'),doc);
const result={sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),sourceBytes:fs.statSync(source).size,bytes:fs.statSync(path.join(out,'bmw-330i.glb')).size,trianglesBefore:before,trianglesAfter:count(),credits};fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(result,null,2)+'\n');console.log(result);
