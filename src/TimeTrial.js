import * as THREE from 'three';

// Glowing neon checkpoint rings for Time Trial course through skyscraper canyons
export class TimeTrialSystem {
  constructor(scene, city, audio) {
    this.scene = scene;
    this.city = city;
    this.audio = audio;

    this.isActive = false;
    this.checkpoints = [];
    this.currentIndex = 0;
    this.startTime = 0;
    this.elapsedTime = 0;
    this.isCompleted = false;

    this.ringMeshGroup = new THREE.Group();
    this.ringMeshGroup.name = 'TimeTrialRings';
    this.scene.add(this.ringMeshGroup);

    this.initRingGeometry();

  }

  initRingGeometry() {
    // Torus ring for glowing checkpoints
    this.ringGeom = new THREE.TorusGeometry(3.6, 0.35, 12, 32);
    this.activeMat = new THREE.MeshBasicMaterial({
      color: 0xffb703,
      transparent: true,
      opacity: 0.95
    });
    this.inactiveMat = new THREE.MeshBasicMaterial({
      color: 0x334466,
      transparent: true,
      opacity: 0.4
    });
    this.nextMat = new THREE.MeshBasicMaterial({
      color: 0x00d2ff,
      transparent: true,
      opacity: 0.8
    });
  }

  createCourse() {
    this.ringMeshGroup.clear();
    this.checkpoints = [];
    const spawn = this.city.getRooftopSpawn(95);
    const offsets = [[0,40],[50,100],[120,80],[140,0],[80,-80],[-40,-100],[-100,-20],[0,0]];
    for (const [x,z] of offsets) {
      const intended = spawn.clone().add(new THREE.Vector3(x,0,z));
      let pos = null;
      const candidates = [[0,0]];
      for (const distance of [8,16,24]) {
        for (const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]) {
          candidates.push([dx*distance,dz*distance]);
        }
      }
      for (const [dx,dz] of candidates) {
        const candidate = intended.clone().add(new THREE.Vector3(dx,0,dz));
        let top = this.city.collisionWorld?.groundAt(new THREE.Vector3(candidate.x,450,candidate.z),600);
        if (!this.city.collisionWorld) {
          top = 0;
          for (const c of this.city.colliders || []) {
            if (candidate.x >= c.minX-4 && candidate.x <= c.maxX+4 && candidate.z >= c.minZ-4 && candidate.z <= c.maxZ+4) top=Math.max(top,c.maxY);
          }
        }
        // Missing streamed ground must not create an impossible race.
        if (top === null || top === undefined) continue;
        // Remain within the jump apex (~5.16m), even on the tallest roof.
        candidate.y = top + 4;
        if (this.city.raycast && [new THREE.Vector3(1,0,0),new THREE.Vector3(-1,0,0),
            new THREE.Vector3(0,1,0),new THREE.Vector3(0,-1,0),new THREE.Vector3(0,0,1),new THREE.Vector3(0,0,-1)]
            .some(dir => this.city.raycast(candidate,dir,3.6))) continue;
        pos = candidate;
        break;
      }
      if (!pos) return false;
      this.checkpoints.push({position:pos, radius:3.2});
    }
    this.checkpoints.forEach((cp,index) => {
      const previous = index ? this.checkpoints[index-1].position : spawn;
      cp.normal = cp.position.clone().sub(previous).normalize();
      cp.mesh = new THREE.Mesh(this.ringGeom,this.inactiveMat);
      cp.mesh.position.copy(cp.position);
      cp.mesh.lookAt(cp.position.clone().add(cp.normal));
      cp.mesh.visible=false;
      this.ringMeshGroup.add(cp.mesh);
    });
    // LOD and nearby clearance can change a streamed route. Compare records
    // only when checkpoint positions match, rounded to decimetres.
    const layout = this.checkpoints.map(cp=>cp.position.toArray().map(n=>Math.round(n*10)).join(',')).join(';');
    let hash = 2166136261;
    for (let i=0;i<layout.length;i++) hash=Math.imul(hash^layout.charCodeAt(i),16777619);
    // v4 uses real active time; older clamped-frame records are not comparable.
    this.courseId = `${this.city.isStreamed ? 'hong-kong' : 'procedural'}-v4-${(hash>>>0).toString(16).padStart(8,'0')}`;
    return true;
  }

  start() {
    if (!this.createCourse()) { this.stop(); this.checkpoints = []; return false; }
    this.previousPosition = this.city.getRooftopSpawn(95);
    this.isActive = true;
    this.isCompleted = false;
    this.currentIndex = 0;
    this.startTime = 0;
    this.elapsedTime = 0;

    // Show rings
    this.checkpoints.forEach((cp, idx) => {
      // Nearby future gates (especially the finish above the spawn) can fill
      // the camera before they are relevant. Preview only the next gate.
      cp.mesh.visible = idx <= 1;
      cp.mesh.scale.setScalar(1);
      cp.mesh.material = idx === 0 ? this.activeMat : (idx === 1 ? this.nextMat : this.inactiveMat);
    });

    return true;
  }

  dispose() {
    this.stop();
    this.scene.remove(this.ringMeshGroup);
    this.ringGeom.dispose();
    this.activeMat.dispose(); this.inactiveMat.dispose(); this.nextMat.dispose();
  }

  stop() {
    this.isActive = false;
    this.checkpoints.forEach(cp => {
      if (cp.mesh) cp.mesh.visible = false;
    });
  }

  toggle() {
    if (this.isActive) {
      this.stop();
      return false;
    } else {
      return this.start();
    }
  }

  update(playerPos, delta = 0) {
    if (!this.isActive || this.isCompleted) return null;

    this.elapsedTime += Math.max(0, Number.isFinite(delta) ? delta : 0);

    let lastCrossing = -1;
    // A long frame can pass several nearby rings. Consume them in the order
    // crossed on this segment, never accept an earlier crossing retroactively.
    while (this.currentIndex < this.checkpoints.length) {
      const currentCp = this.checkpoints[this.currentIndex];
      // Pulse animation on active ring
      const scale = this.reducedMotion ? 1 : 1.0 + Math.sin(this.elapsedTime * 6) * 0.1;
      currentCp.mesh.scale.set(scale, scale, scale);

      // Check if player passed through ring
      // Cross the actual ring plane inside its aperture, including high-speed
      // travel where neither frame endpoint is inside the ring.
      const previous = this.previousPosition || playerPos;
      const a = previous.clone().sub(currentCp.position).dot(currentCp.normal);
      const b = playerPos.clone().sub(currentCp.position).dot(currentCp.normal);
      const crosses = a * b <= 0 && Math.abs(a-b) > 1e-8;
      const fraction = crosses ? a/(a-b) : -1;
      const crossing = crosses ? previous.clone().lerp(playerPos,fraction) : null;
      if (crossing && fraction > lastCrossing + 1e-8 && crossing.distanceTo(currentCp.position) <= currentCp.radius) {
        lastCrossing = fraction;
        // Checkpoint passed!
        this.audio.playCheckpointChime();
        currentCp.mesh.visible = false;
        this.currentIndex++;

        if (this.currentIndex >= this.checkpoints.length) {
          // Completed Course!
          this.isCompleted = true;
          this.previousPosition = playerPos.clone();
          return {
            completed: true,
            totalTime: this.elapsedTime,
            checkpoints: this.checkpoints.length
          };
        } else {
          // Update next ring material
          this.checkpoints[this.currentIndex].mesh.material = this.activeMat;
          this.checkpoints[this.currentIndex].mesh.visible = true;
          if (this.currentIndex + 1 < this.checkpoints.length) {
            this.checkpoints[this.currentIndex + 1].mesh.material = this.nextMat;
            this.checkpoints[this.currentIndex + 1].mesh.visible = true;
          }
        }
      } else break;
    }

    this.previousPosition = playerPos.clone();
    return {
      completed: false,
      currentIndex: this.currentIndex,
      totalCount: this.checkpoints.length,
      elapsedTime: this.elapsedTime
    };
  }
}
