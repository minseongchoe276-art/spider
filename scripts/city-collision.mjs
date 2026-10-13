import * as THREE from 'three';
import {City} from '../src/City.js';
// Use the game generator itself. Window textures consume 384 seeded values;
// skipping those would produce a different collision map on the server.
class CollisionCity extends City {
  initTextures(){for(let i=0;i<384;i++)this.random();for(const key of ['windowGlassTex','windowBrickTex','windowDarkTex','roadTex'])this[key]=new THREE.Texture();}
  createHelipad(){} // Painted plane is excluded from player collision as well.
}
let cached;
export function proceduralCollision(){return cached||=(new CollisionCity(new THREE.Scene()));}
export function blockedSegment(from,to,colliders) {
  const origin=new THREE.Vector3(from.x,from.y+1,from.z),target=new THREE.Vector3(to.x,to.y+1,to.z),direction=target.clone().sub(origin),distance=direction.length();
  if(distance<.1)return false;const ray=new THREE.Ray(origin,direction.normalize());
  return colliders.some(c=>{const p=ray.intersectBox(new THREE.Box3(new THREE.Vector3(c.minX,c.minY,c.minZ),new THREE.Vector3(c.maxX,c.maxY,c.maxZ)),new THREE.Vector3());return p&&p.distanceTo(origin)<distance-.3;});
}
