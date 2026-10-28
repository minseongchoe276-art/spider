import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const initialized = RAPIER.init();

export class StreamedCollision {
  constructor() {
    this.ready = false;
    this.meshes = new Map();
    this.colliderToMesh = new Map();
    this.pending = [];
    this.center = new THREE.Vector3();
    this.initialized = initialized.then(() => {
      if (this.disposed) return;
      this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
      this.body = this.world.createCollider(RAPIER.ColliderDesc.capsule(0.55, 0.35));
      this.controller = this.world.createCharacterController(0.025);
      this.controller.enableAutostep(0.3, 0.25, false);
      this.controller.enableSnapToGround(0.15);
      this.controller.setMaxSlopeClimbAngle(Math.PI / 4);
      this.controller.setMinSlopeSlideAngle(Math.PI / 3);
      this.retentionShape = new RAPIER.Ball(3);
      this.ready = true;
    });
  }

  enqueue(mesh) {
    if (!this.meshes.has(mesh.uuid)) {
      this.meshes.set(mesh.uuid, null);
      this.pending.push(mesh);
    }
  }

  setActiveMeshes(meshes) { this.activeMeshes = new Set(meshes.map(mesh=>mesh.uuid)); }
  setTetherColliders(handles) { this.tetherColliders=new Set(handles); }
  setRecoveryCollider(collider) { this.recoveryHandle=collider?.handle; }

  dispose() {
    this.disposed = true;
    this.pending.length = 0;
    this.meshes.clear();
    this.colliderToMesh.clear();
    this.job = null;
    this.world?.free();
    this.ready = false;
  }

  raycast(origin, direction, maxDistance, solid = true) {
    if (!this.ready || maxDistance <= 0) return null;
    const dir = direction.clone().normalize();
    const hit = this.world.castRayAndGetNormal(
      new RAPIER.Ray(
        { x:origin.x,y:origin.y,z:origin.z },
        { x:dir.x,y:dir.y,z:dir.z },
      ),
      maxDistance,
      solid,
      undefined,
      undefined,
      this.body,
    );
    if (!hit) return null;
    const normal = new THREE.Vector3(hit.normal.x,hit.normal.y,hit.normal.z);
    const mesh = this.colliderToMesh.get(hit.collider.handle) || null;
    return {
      distance: hit.timeOfImpact,
      point: origin.clone().addScaledVector(dir,hit.timeOfImpact),
      normal,
      collider: hit.collider,
      mesh,
    };
  }

  vehicleBlocked(from, to, yaw, pitch=0, roll=0, previous=null) {
    if(!this.ready)return true;
    this.vehicleShape ||= new RAPIER.Cuboid(1.33,.45,2.35);
    const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch,yaw,roll,'YXZ'));
    const startRotation=previous?new THREE.Quaternion().setFromEuler(new THREE.Euler(previous.pitch,previous.yaw,previous.roll,'YXZ')):rotation;
    // The body centre is above the tyre plane along the chassis up axis.
    const start=new THREE.Vector3(0,.9,0).applyQuaternion(startRotation).add(from);
    const end=new THREE.Vector3(0,.9,0).applyQuaternion(rotation).add(to);
    if(this.world.intersectionWithShape(end,rotation,this.vehicleShape,undefined,undefined,this.body))return true;
    const travel=end.clone().sub(start);
    return !!this.world.castShape(start,startRotation,travel,this.vehicleShape,.025,1,true,undefined,undefined,this.body);
  }

  update(center, { budgetMs = 3, maxIndices = 6000 } = {}) {
    this.center.copy(center);
    if (!this.ready) return;
    // A wall grip has no downward foot contact. Protect nearby solid geometry
    // through visual LOD gaps as well as the last verified recovery surface.
    const nearby=new Set();
    this.world.intersectionsWithShape({x:center.x,y:center.y+.8,z:center.z},
      {x:0,y:0,z:0,w:1},this.retentionShape,c=>{nearby.add(c.handle);return true;},
      undefined,undefined,this.body);
    // Long-lived meshes can extend beyond the neighbourhood initially baked.
    // Refresh them before the player reaches the edge, keeping the old surface
    // until its replacement is ready.
    for (const entry of this.meshes.values()) {
      if (entry && !entry.queued && center.distanceToSquared(entry.coverageCenter) > 200 * 200 &&
          (!this.activeMeshes || this.activeMeshes.has(entry.mesh.uuid))) {
        entry.queued = true;
        this.pending.push(entry.mesh);
      }
    }
    if (this.activeMeshes) {
      const now = performance.now();
      // Query support once, rather than once for every inactive tile.
      const support=this.world.castRay(new RAPIER.Ray(
        {x:center.x,y:center.y+1,z:center.z},{x:0,y:-1,z:0}),2,false,undefined,undefined,this.body);
      for (const [id, entry] of this.meshes) {
        if (!entry) continue;
        if (this.activeMeshes.has(id)) entry.inactiveSince = null;
        else {
          entry.inactiveSince ??= now;
          const holdsPlayer=support?.collider.handle===entry.collider.handle;
          // Release an obsolete supporting LOD only once an active baked
          // replacement supports the same feet height, even if queues are idle.
          const activeHandles = holdsPlayer ? new Set([...this.meshes.values()]
            .filter(e => e && this.activeMeshes.has(e.mesh.uuid)).map(e => e.collider.handle)) : null;
          const replacement = holdsPlayer ? this.world.castRay(new RAPIER.Ray(
            {x:center.x,y:center.y+1,z:center.z},{x:0,y:-1,z:0}),2,false,
            undefined,undefined,this.body,undefined,c => activeHandles.has(c.handle)) : null;
          const replaced = replacement && Math.abs(replacement.timeOfImpact-support.timeOfImpact)<0.25;
          if(replaced&&this.recoveryHandle===entry.collider.handle)this.recoveryHandle=replacement.collider.handle;
          if (now-entry.inactiveSince>2000 && entry.collider.handle!==this.recoveryHandle && !this.tetherColliders?.has(entry.collider.handle) && (!nearby.has(entry.collider.handle) || (holdsPlayer && replaced)) && (!holdsPlayer || replaced)) {
            this.world.removeCollider(entry.collider,true); this.colliderToMesh.delete(entry.collider.handle); this.meshes.delete(id);
          }
        }
      }
    }
    if ((this.priorityFrame = (this.priorityFrame || 0) + 1) % 30 === 1) {
      for (const candidate of this.pending) {
        candidate.updateWorldMatrix(true, false);
        candidate.geometry.computeBoundingBox();
        candidate.userData.collisionPriority = candidate.geometry.boundingBox.clone()
          .applyMatrix4(candidate.matrixWorld).distanceToPoint(center);
      }
      this.pending.sort((a,b)=>a.userData.collisionPriority-b.userData.collisionPriority);
    }
    // Conversion is incremental: one huge tile must not monopolise a frame.
    if (!this.job) {
      const mesh = this.pending.shift();
      if (mesh && this.activeMeshes && !this.activeMeshes.has(mesh.uuid)) {
        const previous = this.meshes.get(mesh.uuid);
        if (previous) previous.queued = false;
        else this.meshes.delete(mesh.uuid);
      } else if (mesh?.geometry?.attributes.position) {
        mesh.updateWorldMatrix(true, false);
        const attribute = mesh.geometry.attributes.position;
        const mapped = new Int32Array(attribute.count); mapped.fill(-1);
        this.job = { mesh, attribute, index: mesh.geometry.index,
          matrix: mesh.matrixWorld.clone(), mapped, vertices: [], indices: [], cursor: 0,
          center: center.clone(), triangle: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] };
      } else if (mesh) this.meshes.delete(mesh.uuid);
    }
    const job = this.job;
    if (job) {
      if (this.activeMeshes && !this.activeMeshes.has(job.mesh.uuid)) {
        const previous = this.meshes.get(job.mesh.uuid);
        if (previous) previous.queued = false;
        else this.meshes.delete(job.mesh.uuid);
        this.job = null;
      } else {
        const { mesh, attribute, index, matrix, mapped, vertices, indices, triangle } = job;
        const count = index ? index.count : attribute.count;
        const deadline = performance.now() + budgetMs;
        const limit = Math.min(count, job.cursor + maxIndices);
        const minX=job.center.x-650,maxX=job.center.x+650,minZ=job.center.z-650,maxZ=job.center.z+650;
        while (job.cursor + 2 < limit) {
          const i = job.cursor; job.cursor += 3;
          for (let n=0;n<3;n++) triangle[n].fromBufferAttribute(attribute, index ? index.getX(i+n) : i+n).applyMatrix4(matrix);
          const triMinX=Math.min(triangle[0].x,triangle[1].x,triangle[2].x),triMaxX=Math.max(triangle[0].x,triangle[1].x,triangle[2].x);
          const triMinZ=Math.min(triangle[0].z,triangle[1].z,triangle[2].z),triMaxZ=Math.max(triangle[0].z,triangle[1].z,triangle[2].z);
          if (!(triMaxX<minX || triMinX>maxX || triMaxZ<minZ || triMinZ>maxZ)) {
            for (let n=0;n<3;n++) {
              const original=index ? index.getX(i+n) : i+n;
              if (mapped[original]===-1) {
                mapped[original]=vertices.length/3;
                const p=triangle[n]; vertices.push(p.x,p.y,p.z);
              }
              indices.push(mapped[original]);
            }
          }
          if (job.cursor % 192 === 0 && performance.now() > deadline) break;
        }
        if (job.cursor + 2 >= count) {
          const previous=this.meshes.get(mesh.uuid);
          // Collider construction itself remains synchronous in Rapier.
          const collider=indices.length ? this.world.createCollider(RAPIER.ColliderDesc.trimesh(
            new Float32Array(vertices),new Uint32Array(indices))) : null;
          if(previous && this.recoveryHandle===previous.collider.handle)this.recoveryHandle=collider?.handle;
          if (previous) {
            this.world.removeCollider(previous.collider,true);
            this.colliderToMesh.delete(previous.collider.handle);
          }
          if (collider) {
            this.meshes.set(mesh.uuid,{collider,mesh,queued:false,
              coverageCenter:job.center,center:new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3())});
            this.colliderToMesh.set(collider.handle, mesh);
          }
          else this.meshes.delete(mesh.uuid);
          this.world.step();
          this.job=null;
        }
      }
    }
    // Keep collision meshes when a visual LOD unloads, but bound retained
    // memory; dispose distant geometry before evicting local support surfaces.
    if (this.meshes.size > 350) {
      for (const [id, entry] of this.meshes) {
        if (entry && entry.coverageCenter.distanceTo(center) > 900 && !nearby.has(entry.collider.handle) && entry.collider.handle!==this.recoveryHandle && !this.tetherColliders?.has(entry.collider.handle)) {
          this.world.removeCollider(entry.collider, true);
          this.colliderToMesh.delete(entry.collider.handle);
          this.meshes.delete(id);
        }
      }
    }
  }

  resolve(start, end, velocity) {
    if (!this.ready) return { position: start.clone(), contacts: [] };
    this.body.setTranslation({ x: start.x, y: start.y + 0.8, z: start.z });
    this.world.step();
    const delta = end.clone().sub(start);
    if (delta.y > 0) this.controller.disableSnapToGround();
    else this.controller.enableSnapToGround(0.15);
    this.controller.computeColliderMovement(this.body, delta, undefined, undefined,
      collider => collider.handle !== this.body.handle);
    const movement = this.controller.computedMovement();
    const actualMovement=new THREE.Vector3(movement.x,movement.y,movement.z);
    const contacts = [];
    for (let i = 0; i < this.controller.numComputedCollisions(); i++) {
      const contact = this.controller.computedCollision(i);
      const normal = new THREE.Vector3(contact.normal1.x, contact.normal1.y, contact.normal1.z);
      const blocked=delta.clone().sub(actualMovement).dot(normal)< -1e-5;
      contacts.push({ normal,blocked });
      const inward = velocity.dot(normal);
      // A successful autostep still reports its riser as a wall contact.
      // Cancel only motion the controller actually blocked, otherwise each
      // stair zeroed the forward velocity despite a successful step-up.
      if(inward<0 && blocked) {
        if(normal.y>0.5) {
          // Rounded capsule/riser contacts can have diagonal normals before
          // the centre reaches the tread. Keep the requested planar drive;
          // the controller enforces the climb/slide angles and step height.
          velocity.y=Math.max(0,velocity.y);
        } else velocity.addScaledVector(normal,-inward);
      }
    }
    return { position: start.clone().add(actualMovement),
      contacts, grounded: this.controller.computedGrounded() };
  }

  groundSample(position, range = 1) {
    if (!this.ready) return null;
    const hit = this.world.castRayAndGetNormal(new RAPIER.Ray(
      { x: position.x, y: position.y + 0.25, z: position.z }, { x: 0, y: -1, z: 0 }),
      range + 0.25, false, undefined, undefined, this.body);
    this.lastGroundHit = hit ? { normal:hit.normal, distance:hit.timeOfImpact,
      pointY:position.y+0.25-hit.timeOfImpact } : null;
    if (!hit || hit.normal.y < Math.cos(Math.PI / 4)) return null;
    const height=position.y + 0.25 - hit.timeOfImpact;
    return {height,collider:hit.collider,normal:new THREE.Vector3(hit.normal.x,hit.normal.y,hit.normal.z).normalize(),
      point:new THREE.Vector3(position.x,height,position.z)};
  }

  groundAt(position, range = 1) {
    return this.groundSample(position,range)?.height ?? null;
  }
}
