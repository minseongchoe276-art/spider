// Local development probe. Production builds never attach this module:
// main.js imports it only when import.meta.env.DEV, the host is loopback,
// and the page was opened with ?qualityDirector=1.
import * as THREE from 'three';
import { GROUNDED } from './MotionCatalog.js';
import { boneId } from './MotionRetarget.js';
import { sidewalkAnchor } from './CitizenNavigation.js';

const HOSTS = new Set(['127.0.0.1', 'localhost']);

export function attachQualityDirector(app) {
  if (!import.meta.env.DEV) return null;
  if (typeof location === 'undefined' || !HOSTS.has(location.hostname)) return null;
  if (!new URLSearchParams(location.search).has('qualityDirector')) return null;
  if (app.qualityDirector) return app.qualityDirector;
  const director = new QualityDirector(app);
  app.qualityDirector = director;
  globalThis.__shadowPulseQuality = director.api;
  return director;
}

class QualityDirector {
  constructor(app) {
    this.app = app;
    this.samples = [];
    this.spikes = [];
    this.recording = false;
    this.scenario = null;
    this.scenarioStarted = 0;
    this.previousVelocity = null;
    this.audioCounts = {};
    this.vfxCounts = {};
    this.errors = [];
    this.wrapAudio();
    this.wrapVfx();
    this.captureErrors();
    this.panel = this.mountPanel();
    this.api = {
      build: 'quality-director-v5',
      production: false,
      ready: () => !!(app.assetsReady && app.character?.isLoaded),
      playing: () => !!(app.isPlaying && !app.isPaused),
      pointerLocked: () => document.pointerLockElement === app.canvas,
      snapshot: () => this.snapshot(0),
      errors: () => this.errors.slice(),
      audioCounts: () => ({ ...this.audioCounts }),
      vfxCounts: () => ({ ...this.vfxCounts }),
      // Same KeyboardEvent path as GamepadInput.key, which the window
      // listener turns into movement, combat, and swing input.
      key: (code, down) => app.gamepad.key(code, !!down),
      // Same MouseEvent path as GamepadInput.mouse. The event is dispatched
      // on the canvas, so it enters the live mousedown handler.
      mouse: (button, down) => app.gamepad.mouse(button, !!down),
      release: () => { app.clearInput(); app.gamepad.mouse(0, false); app.gamepad.mouse(2, false); },
      begin: (name) => this.begin(name),
      end: () => this.end(),
      dump: () => this.dump(),
      aim: (yaw, pitch) => this.aim(yaw, pitch),
      seekWebTarget: () => this.seekWebTarget(),
      webRays: () => this.webRays(),
      cameraClearance: () => this.cameraClearance(),
      vehicle: () => this.vehicleProbe(),
      citizens: () => this.citizenProbe(),
      raise: (meters) => this.raise(meters),
      shove: (x, z) => this.shove(x, z),
      place: (x, y, z, yaw) => this.place(x, y, z, yaw),
      sidewalks: () => this.sidewalks(),
      roofs: () => this.roofs(),
      summon: () => this.app.vehicle?.interact(),
      selectVehicle: (id) => this.app.vehicle?.selectVehicle(id) || false,
      notice: () => document.getElementById('game-notice')?.textContent || '',
      pose: () => this.poseSample(),
      combat: () => this.combatSample(),
      motions: () => this.motionSources(),
      // Calls the existing dodge function for measurement. It does not bind a key.
      reviewDodge: (direction) => this.reviewDodge(direction),
      seekFarAnchor: () => this.seekFarAnchor(),
      approachCitizen: () => this.approachCitizen(),
      findRollDeck: () => this.findRollDeck(),
      room: () => this.roomSample(),
      inspectWheels: (enabled) => this.inspectWheels(enabled),
      look: (yaw, pitch, distance) => this.look(yaw, pitch, distance),
      peers: () => [...(app.multiplayer?.avatars?.values?.() || [])].map(remote => {
        const combat = remote.character?.combatAction || null;
        const network = remote.character?.networkAnimation || null;
        return {
          name: remote.player?.name || null,
          position: remote.mesh?.position?.toArray?.().map(value => +value.toFixed(2)) || null,
          motion: remote.character?.activeAction?.getClip?.().name || remote.character?.lastState || null,
          combat: combat ? { key: combat.key, time: +Number(combat.time || 0).toFixed(3), duration: +Number(combat.duration || 0).toFixed(3) } : null,
          network: network ? { key: network.key, time: +Number(network.time || 0).toFixed(3) } : null,
        };
      }),
      spikes: () => this.spikes.slice(),
      diagnostics: () => this.diagnostics(),
    };
  }

  captureErrors() {
    const push = (kind, detail) => {
      this.errors.push({ t: performance.now(), kind, detail: String(detail).slice(0, 500) });
      if (this.errors.length > 80) this.errors.shift();
      this.paint();
    };
    const previous = console.error;
    console.error = (...args) => {
      push('console.error', args.map(item => item instanceof Error ? item.stack || item.message : String(item)).join(' '));
      previous.apply(console, args);
    };
    window.addEventListener('error', event => push('error', event.message));
    window.addEventListener('unhandledrejection', event => push('rejection', event.reason?.stack || event.reason));
  }

  wrapAudio() {
    const audio = this.app.audio;
    if (!audio) return;
    const proto = Object.getPrototypeOf(audio);
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (!key.startsWith('play') || typeof audio[key] !== 'function') continue;
      const original = audio[key];
      audio[key] = (...args) => {
        this.audioCounts[key] = (this.audioCounts[key] || 0) + 1;
        return original.apply(audio, args);
      };
    }
  }

  wrapVfx() {
    const vfx = this.app.vfx;
    if (!vfx) return;
    for (const key of ['spawn', 'spawnWebImpact', 'spawnLandingDust', 'spawnLandingShockwave']) {
      if (typeof vfx[key] !== 'function') continue;
      const original = vfx[key];
      vfx[key] = (...args) => {
        this.vfxCounts[key] = (this.vfxCounts[key] || 0) + 1;
        return original.apply(vfx, args);
      };
    }
  }

  mountPanel() {
    const panel = document.createElement('aside');
    panel.id = 'quality-director-panel';
    panel.setAttribute('data-quality-director', 'dev');
    panel.style.cssText = 'position:fixed;right:8px;top:46px;z-index:40;max-width:220px;background:#071018cc;color:#d5fff4;font:11px/1.35 ui-monospace,monospace;padding:4px 6px;pointer-events:none';
    panel.textContent = 'QUALITY DIRECTOR · 개발 전용';
    document.body.append(panel);
    return panel;
  }

  paint() {
    if (!this.panel) return;
    const snap = this.latest;
    this.panel.textContent = snap
      ? `DEV ${snap.state} ${snap.animation || '-'} ${snap.speed.toFixed(1)}m/s lock:${snap.pointerLock ? 'yes' : 'no'} err:${this.errors.length}`
      : `DEV 대기 err:${this.errors.length}`;
  }

  bone(id) {
    return Object.values(this.app.character?.bones || {}).find(bone => boneId(bone.name) === id) || null;
  }

  foot(id) {
    const bone = this.bone(id);
    if (!bone) return null;
    const point = bone.getWorldPosition(new (bone.position.constructor)());
    const support = this.app.physics?.supportHeight?.(this.app.physics.position);
    const ground = Number.isFinite(support) ? support : null;
    return {
      x: +point.x.toFixed(3),
      y: +point.y.toFixed(3),
      z: +point.z.toFixed(3),
      support: ground === null ? null : +ground.toFixed(3),
      gap: ground === null ? null : +(point.y - ground).toFixed(3),
    };
  }

  // Read-only pose sample for local QA. It does not write bones or physics.
  poseSample() {
    const app = this.app;
    const support = app.physics?.supportHeight?.(app.physics.position);
    const hips = this.bone('hips');
    const hipPoint = hips?.getWorldPosition(new THREE.Vector3()) || null;
    const axisAngle = (a, b) => {
      if (!a || !b) return null;
      const ay = new THREE.Vector3(0, 1, 0).applyQuaternion(a.getWorldQuaternion(new THREE.Quaternion()));
      const by = new THREE.Vector3(0, 1, 0).applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()));
      return +THREE.MathUtils.radToDeg(ay.angleTo(by)).toFixed(1);
    };
    const side = prefix => ({
      wrist: axisAngle(this.bone(prefix + 'forearm'), this.bone(prefix + 'hand')),
      knee: axisAngle(this.bone(prefix + 'upleg'), this.bone(prefix + 'leg')),
    });
    const gestures = app.character?.webGestures || {};
    return {
      hipsHeight: hipPoint && Number.isFinite(support) ? +(hipPoint.y - support).toFixed(3) : null,
      left: side('left'),
      right: side('right'),
      webShotTimer: +Number(app.character?.webShotTimer || 0).toFixed(3),
      shoot: { left: +Number(gestures.left?.shoot || 0).toFixed(2), right: +Number(gestures.right?.shoot || 0).toFixed(2) },
      roll: +app.camera.rotation.z.toFixed(4),
      rigRoll: +Number(app.tpsCamera.roll || 0).toFixed(4),
      fov: app.camera.fov,
      pitch: +app.tpsCamera.pitch.toFixed(4),
      wristCock: { left: this.wristCock('left'), right: this.wristCock('right') },
    };
  }

  // Angle between the hand's local up (the aimed finger axis) and the line to
  // the live wire anchor. This is the launch cock, not the forearm-to-hand bend.
  wristCock(side) {
    const hand = this.bone(side + 'hand');
    const webs = this.app.physics?.webs || [];
    const web = webs.find(item => item.hand === side) || null;
    const anchor = web?.anchor || null;
    if (!hand || !anchor) return null;
    const origin = hand.getWorldPosition(new THREE.Vector3());
    const shot = anchor.clone().sub(origin);
    if (shot.lengthSq() < 1e-6) return null;
    const finger = new THREE.Vector3(0, 1, 0).applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion()));
    return +THREE.MathUtils.radToDeg(finger.angleTo(shot.normalize())).toFixed(1);
  }

  roomSample() {
    const online = this.app.multiplayer;
    if (!online) return null;
    const me = online.players?.find(player => player.id === online.id) || null;
    return {
      phase: online.room?.phase || null,
      mode: online.room?.mode || null,
      id: online.id || null,
      health: me?.health ?? null,
      notice: document.getElementById('combat-feedback')?.textContent || '',
      others: (online.players || []).filter(player => player.id !== online.id).map(player => ({
        id: player.id, name: player.name || null, health: player.health ?? null, team: player.team || null,
        x: Number.isFinite(player.x) ? +player.x.toFixed(2) : null,
        y: Number.isFinite(player.y) ? +player.y.toFixed(2) : null,
        z: Number.isFinite(player.z) ? +player.z.toFixed(2) : null,
      })),
    };
  }

  combatSample() {
    const combat = this.app.combat;
    if (!combat) return null;
    const action = combat.action;
    return {
      mode: combat.mode,
      stamina: +Number(combat.stamina).toFixed(2),
      specialCooldown: +Number(combat.specialCooldown).toFixed(3),
      blocking: !!combat.blocking,
      allowGuardInWeb: !!combat.allowGuardInWeb,
      action: action ? { key: action.key, time: +Number(action.time).toFixed(3), duration: action.duration } : null,
    };
  }

  motionSources() {
    const clip = key => {
      const data = this.app.character?.actions?.[key]?.getClip?.();
      if (!data) return null;
      return {
        name: data.name,
        duration: +data.duration.toFixed(3),
        source: data.userData?.source || null,
        authored: !!data.userData?.authoredMixamo,
        choreography: data.userData?.choreography || null,
      };
    };
    return {
      hook: clip('hook'), heavy: clip('heavy'), fall: clip('fall'), fallVariant: clip('fallVariant'),
      land: clip('land'), slamLand: clip('slamLand'), roll: clip('roll'), special: clip('special'),
      dodgeLeft: clip('dodgeLeft'), dodgeRight: clip('dodgeRight'), dodgeBack: clip('dodgeBack'), dodgeForward: clip('dodgeForward'),
    };
  }

  // Local QA teleport. It is not a player move and it does not change fall formulas.
  place(x, y, z, yaw) {
    const physics = this.app.physics;
    const nx = Number(x), ny = Number(y), nz = Number(z);
    if (![nx, ny, nz].every(Number.isFinite)) return { ok: false };
    physics.clearWebAnchor?.();
    physics.velocity.set(0, 0, 0);
    physics.position.set(nx, ny, nz);
    physics.previousFixedPosition?.copy(physics.position);
    physics.renderPosition.copy(physics.position);
    physics.accumulator = 0;
    physics.state = 'IDLE';
    this.app.character?.group?.position.copy(physics.position);
    this.app.city.playerPosition?.copy(physics.position);
    if (Number.isFinite(Number(yaw))) {
      const facing = Number(yaw);
      physics.facingAngle = facing;
      if (this.app.character) {
        this.app.character.targetFacingAngle = facing;
        this.app.character.visualYaw = facing;
      }
    }
    this.app.tpsCamera?.placeBehind(physics.position, physics.facingAngle || 0, 0.35);
    return { ok: true, position: physics.position.toArray().map(value => +value.toFixed(2)), yaw: physics.facingAngle };
  }

  sidewalks() {
    const nodes = this.app.city.footpaths?.nodes || [];
    const player = this.app.physics.position;
    return nodes.filter(node => node.kind !== 'cross')
      .map(node => ({ x: +node.x.toFixed(2), z: +node.z.toFixed(2), kind: node.kind, d: +Math.hypot(node.x - player.x, node.z - player.z).toFixed(1) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 12);
  }

  roofs() {
    return (this.app.city.rooftopSpawns || []).slice(0, 8).map(spawn => ({
      x: +spawn.x.toFixed(2), y: +spawn.y.toFixed(2), z: +spawn.z.toFixed(2),
    }));
  }

  raise(meters) {
    const physics = this.app.physics;
    const height = Number(meters);
    if (!Number.isFinite(height) || height < 0.05 || height > 30) return { ok: false, reason: 'range' };
    physics.clearWebAnchor();
    physics.velocity.set(0, 0, 0);
    physics.position.y += height;
    physics.previousFixedPosition.copy(physics.position);
    physics.renderPosition.copy(physics.position);
    physics.state = 'FALLING';
    return { ok: true, y: +physics.position.y.toFixed(3) };
  }

  shove(x, z) {
    const velocity = this.app.physics.velocity;
    velocity.x = Number(x) || 0;
    velocity.z = Number(z) || 0;
    return { x: +velocity.x.toFixed(3), z: +velocity.z.toFixed(3) };
  }

  reviewDodge(direction) {
    const combat = this.app.combat;
    if (!combat || combat.mode !== 'combat') return { started: false, reason: 'not-combat' };
    const input = { left: direction === 'left', right: direction === 'right', forward: direction === 'forward', backward: direction === 'back' };
    const before = this.app.physics.position.clone();
    const started = combat.dodge(input, this.app.camera);
    return {
      started: !!started,
      key: combat.action?.key || null,
      stamina: +Number(combat.stamina).toFixed(2),
      from: before.toArray().map(value => +value.toFixed(3)),
    };
  }

  snapshot(delta) {
    const app = this.app;
    const physics = app.physics;
    const velocity = physics.velocity.clone();
    let acceleration = null;
    if (this.previousVelocity && delta > 0) acceleration = velocity.clone().sub(this.previousVelocity).multiplyScalar(1 / delta).toArray();
    if (delta > 0) this.previousVelocity = velocity.clone();
    const action = app.character?.activeAction || null;
    const blends = Object.entries(app.character?.actions || {})
      .map(([key, clip]) => ({ key, weight: clip.getEffectiveWeight?.() || 0, time: clip.time || 0 }))
      .filter(item => item.weight > 0.02)
      .map(item => ({ key: item.key, weight: +item.weight.toFixed(3), time: +item.time.toFixed(3) }));
    const webs = (physics.webs || []).map(web => {
      const current = physics.position.distanceTo(web.anchor);
      return {
        hand: web.hand,
        button: web.button ?? null,
        length: +web.length.toFixed(3),
        current: +current.toFixed(3),
        slack: +(current - web.length).toFixed(3),
        anchor: web.anchor.toArray().map(value => +value.toFixed(2)),
      };
    });
    const attack = app.combat?.action;
    const info = app.renderer?.info;
    const support = physics.supportHeight?.(physics.position);
    this.latest = {
      t: performance.now(),
      scenario: this.scenario,
      scenarioMs: this.recording ? performance.now() - this.scenarioStarted : 0,
      dt: delta,
      position: physics.position.toArray().map(value => +value.toFixed(3)),
      velocity: velocity.toArray().map(value => +value.toFixed(3)),
      acceleration: acceleration ? acceleration.map(value => +value.toFixed(3)) : null,
      speed: +velocity.length().toFixed(3),
      facing: +physics.facingAngle.toFixed(4),
      state: physics.state,
      grounded: GROUNDED.includes(physics.state),
      support: Number.isFinite(support) ? +support.toFixed(3) : null,
      animation: action?.getClip?.().name || null,
      animationTime: action ? +action.time.toFixed(3) : null,
      blends,
      combatMode: app.combat?.mode || null,
      attack: attack ? { key: attack.key, time: +attack.time.toFixed(3), duration: +attack.duration.toFixed(3) } : null,
      feet: { left: this.foot('leftfoot'), right: this.foot('rightfoot') },
      camera: {
        position: app.camera.position.toArray().map(value => +value.toFixed(3)),
        yaw: +app.tpsCamera.yaw.toFixed(4),
        pitch: +app.tpsCamera.pitch.toFixed(4),
        fov: app.camera.fov,
      },
      webs,
      swinging: !!physics.isSwinging,
      ropeLength: Number.isFinite(physics.ropeLength) ? +physics.ropeLength.toFixed(3) : null,
      // SwingPhysics stores rope length. It does not simulate a tension scalar.
      swingTension: null,
      pointerLock: document.pointerLockElement === app.canvas,
      fps: delta > 0 ? +(1 / delta).toFixed(2) : null,
      memory: Number.isFinite(performance.memory?.usedJSHeapSize) ? performance.memory.usedJSHeapSize : null,
      drawCalls: info?.render?.calls ?? null,
      triangles: info?.render?.triangles ?? null,
      geometries: info?.memory?.geometries ?? null,
      textures: info?.memory?.textures ?? null,
      latencyMs: Number.isFinite(app.multiplayer?.latency) ? app.multiplayer.latency : null,
      paused: !!app.isPaused,
      playing: !!app.isPlaying,
    };
    if (delta >= 0.05) {
      this.spikes.push({
        t: this.latest.t,
        dt: +delta.toFixed(4),
        state: this.latest.state,
        animation: this.latest.animation,
        webs: webs.length,
        programs: app.renderer?.info?.programs?.length ?? null,
        drawCalls: this.latest.drawCalls,
        triangles: this.latest.triangles,
        heap: this.latest.memory,
      });
      if (this.spikes.length > 60) this.spikes.shift();
    }
    if (this.recording) {
      this.samples.push(this.latest);
      if (this.samples.length > 3600) this.samples.shift();
    }
    this.paint();
    return this.latest;
  }

  sample(delta) { this.snapshot(delta); }

  // Settles the same yaw and pitch the mouse-look path writes, then accepts
  // only an anchor findBestAnchor would accept. A single smoothing step can
  // raycast a building the settled camera no longer sees.
  seekWebTarget() {
    const app = this.app;
    const origin = app.physics.facingAngle || 0;
    const meshes = app.city?.buildingMeshes || [];
    for (let step = 0; step < 12; step++) {
      const yaw = origin + (step / 12) * Math.PI * 2;
      for (const pitch of [-0.9, -1.05, -1.2, -0.7]) {
        this.aim(yaw, pitch);
        for (let frame = 0; frame < 24; frame++) {
          app.tpsCamera.update(0.05, app.physics.renderPosition, app.physics.velocity, false,
            meshes, app.city.raycast?.bind(app.city), app.physics.facingAngle, { forward: false });
        }
        const rays = this.webRays();
        if (rays.anchor) return { ok: true, distance: rays.hits[0]?.distance ?? null, yaw: +yaw.toFixed(3), pitch: rays.pitch, anchor: rays.anchor };
      }
    }
    const rays = this.webRays();
    return { ok: false, meshes: meshes.length, pitch: rays.pitch, yaw: rays.yaw, reason: rays.reason };
  }

  // Picks a far, elevated anchor the existing finder already accepts.
  // It only aims the QA camera. Rope length and pendulum code stay as they are.
  seekFarAnchor() {
    const app = this.app;
    const origin = app.physics.position;
    const meshes = app.city?.buildingMeshes || [];
    let best = null;
    for (let step = 0; step < 16; step++) {
      const yaw = (step / 16) * Math.PI * 2;
      for (const pitch of [-0.55, -0.75, -0.95, -1.15]) {
        this.aim(yaw, pitch);
        for (let frame = 0; frame < 10; frame++) {
          app.tpsCamera.update(0.05, app.physics.renderPosition, app.physics.velocity, false,
            meshes, app.city.raycast?.bind(app.city), app.physics.facingAngle, { forward: false });
        }
        const anchor = app.physics.findBestAnchor(app.camera);
        if (!anchor) continue;
        const horizontal = Math.hypot(anchor.x - origin.x, anchor.z - origin.z);
        const vertical = anchor.y - origin.y;
        if (horizontal < 18 || horizontal > 120 || vertical < 3) continue;
        if (!best || horizontal > best.horizontal) {
          best = {
            ok: true,
            horizontal: +horizontal.toFixed(2),
            vertical: +vertical.toFixed(2),
            yaw: +yaw.toFixed(3),
            pitch,
            anchor: anchor.toArray().map(value => +value.toFixed(2)),
          };
        }
      }
    }
    if (best) this.aim(best.yaw, best.pitch);
    return best || { ok: false, meshes: meshes.length };
  }

  approachCitizen() {
    const found = this.citizenProbe();
    const person = found.people?.[0];
    if (!person) return { ok: false, reason: 'none', count: found.count || 0 };
    const physics = this.app.physics;
    const dx = person.x - physics.position.x;
    const dz = person.z - physics.position.z;
    const length = Math.hypot(dx, dz) || 1;
    physics.clearWebAnchor();
    physics.velocity.set(0, 0, 0);
    physics.position.x = person.x - (dx / length) * 3.5;
    physics.position.z = person.z - (dz / length) * 3.5;
    const support = physics.supportHeight(physics.position);
    if (Number.isFinite(support)) physics.position.y = support + 0.1;
    physics.previousFixedPosition.copy(physics.position);
    physics.renderPosition.copy(physics.position);
    physics.state = 'IDLE';
    this.aim(Math.atan2(dx, dz), 0.08);
    return { ok: true, person, support: Number.isFinite(support) ? +support.toFixed(2) : null };
  }

  // Moves the QA body onto a wide collider so a landing roll has support ahead.
  // It does not change roll speed, impact thresholds, or the city.
  findRollDeck() {
    const physics = this.app.physics;
    const boxes = this.app.city?.colliders || [];
    let best = null;
    for (const box of boxes) {
      const width = box.maxX - box.minX;
      const depth = box.maxZ - box.minZ;
      if (width < 12 || depth < 12) continue;
      const area = width * depth;
      if (best && area <= best.area) continue;
      best = {
        area: +area.toFixed(1),
        x: +((box.minX + box.maxX) / 2).toFixed(2),
        z: +(box.minZ + 1.2).toFixed(2),
        y: +(box.maxY + 0.12).toFixed(3),
        depth: +depth.toFixed(2),
      };
    }
    if (!best) return { ok: false, boxes: boxes.length };
    physics.clearWebAnchor();
    physics.velocity.set(0, 0, 0);
    physics.position.set(best.x, best.y, best.z);
    physics.previousFixedPosition.copy(physics.position);
    physics.renderPosition.copy(physics.position);
    physics.state = 'IDLE';
    physics.facingAngle = 0;
    return { ok: true, ...best };
  }

  aim(yaw, pitch) {
    const app = this.app;
    app.tpsCamera.yaw = yaw;
    if (Number.isFinite(pitch)) app.tpsCamera.pitch = pitch;
    app.tpsCamera.lockBehind = false;
    app.tpsCamera.isRecentering = false;
    // Physics reads this on the next tick. The follow update would otherwise
    // keep the previous yaw until the render camera catches up.
    app.camera.userData.movementYaw = yaw;
    return { yaw, pitch: app.tpsCamera.pitch };
  }

  cameraClearance() {
    const app = this.app;
    const center = app.physics.renderPosition.clone();
    center.y += 1.6;
    const camera = app.camera.position.clone();
    const offset = camera.clone().sub(center);
    const distance = offset.length();
    if (distance < 1e-4) return { distance: 0, blocked: false, hit: null, boom: app.tpsCamera.collisionDistance ?? null };
    const raycaster = new THREE.Raycaster(center, offset.normalize(), 0.05, Math.max(0.05, distance - 0.15));
    const hit = raycaster.intersectObjects(app.city?.buildingMeshes || [], true)[0] || null;
    const look = new THREE.Vector3();
    app.camera.getWorldDirection(look);
    return {
      distance: +distance.toFixed(3),
      blocked: !!hit,
      hit: hit ? +hit.distance.toFixed(3) : null,
      boom: +Number(app.tpsCamera.collisionDistance || 0).toFixed(3),
      fov: app.camera.fov,
      lookYaw: +Math.atan2(look.x, look.z).toFixed(4),
      rigYaw: +app.tpsCamera.yaw.toFixed(4),
      pitch: +app.tpsCamera.pitch.toFixed(4),
    };
  }

  webRays() {
    const app = this.app;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), app.camera);
    const hits = raycaster.intersectObjects(app.city?.buildingMeshes || [], true).slice(0, 5).map(hit => ({
      distance: +hit.distance.toFixed(3),
      name: hit.object?.name || hit.object?.type || 'mesh',
      point: hit.point.toArray().map(value => +value.toFixed(2)),
    }));
    const anchor = app.physics.findBestAnchor(app.camera);
    return {
      aim: app.physics.webAimNdc.toArray(),
      hits,
      anchor: anchor ? anchor.toArray().map(value => +value.toFixed(2)) : null,
      // A successful anchor leaves the previous miss string in SwingPhysics.
      // The probe reports that string only when no anchor was found.
      reason: anchor ? null : app.physics.webFailureReason,
      pitch: +app.tpsCamera.pitch.toFixed(3),
      yaw: +app.tpsCamera.yaw.toFixed(3),
    };
  }

  begin(name) {
    this.scenario = String(name || 'scenario');
    this.scenarioStarted = performance.now();
    this.recording = true;
    this.samples = [];
    return this.scenario;
  }

  end() {
    this.recording = false;
    const samples = this.samples;
    const summary = summarize(samples);
    this.scenario = null;
    return { summary, samples: decimate(samples, 8) };
  }

  diagnostics() {
    const info = this.app.renderer?.info;
    return {
      programs: info?.programs?.length ?? null,
      drawCalls: info?.render?.calls ?? null,
      triangles: info?.render?.triangles ?? null,
      geometries: info?.memory?.geometries ?? null,
      textures: info?.memory?.textures ?? null,
      heap: Number.isFinite(performance.memory?.usedJSHeapSize) ? performance.memory.usedJSHeapSize : null,
    };
  }

  wheelMarker(wheel) {
    if (wheel.__qaMarker) return wheel.__qaMarker;
    const spinMeshes = [];
    wheel.spin?.traverse(node => { if (node.isMesh) spinMeshes.push(node); });
    const fixedMeshes = [];
    for (const child of wheel.pivot?.children || []) {
      if (child === wheel.spin) continue;
      child.traverse(node => { if (node.isMesh) fixedMeshes.push(node); });
    }
    const hub = new THREE.Vector3();
    wheel.pivot.getWorldPosition(hub);
    let tread = null;
    let best = 0;
    const spinSamples = [];
    for (const mesh of spinMeshes) {
      const position = mesh.geometry.attributes?.position;
      if (!position) continue;
      const step = Math.max(1, Math.floor(position.count / 48));
      for (let index = 0; index < position.count; index += step) {
        const local = new THREE.Vector3().fromBufferAttribute(position, index);
        const world = mesh.localToWorld(local.clone());
        spinSamples.push({ mesh, local });
        const radius = Math.hypot(world.y - hub.y, world.z - hub.z);
        if (radius > best) { best = radius; tread = { mesh, local }; }
      }
    }
    const stride = Math.max(1, Math.ceil(spinSamples.length / 36));
    const fixedMesh = fixedMeshes[0];
    const fixed = fixedMesh?.geometry?.attributes?.position
      ? { mesh: fixedMesh, local: new THREE.Vector3().fromBufferAttribute(fixedMesh.geometry.attributes.position, 0) }
      : null;
    wheel.__qaMarker = { tread, fixed, spinSamples: spinSamples.filter((_, index) => index % stride === 0) };
    return wheel.__qaMarker;
  }

  vehicleProbe() {
    const system = this.app.vehicle;
    if (!system) return null;
    const asset = system.asset;
    const controller = system.controller;
    const round = vector => vector.toArray().map(value => +value.toFixed(3));
    const wheels = [];
    for (const wheel of asset?.wheels || []) {
      if (!wheel.pivot || !wheel.spin) continue;
      wheel.pivot.updateWorldMatrix(true, true);
      const hub = wheel.pivot.getWorldPosition(new THREE.Vector3());
      const marker = this.wheelMarker(wheel);
      const tread = marker.tread ? marker.tread.mesh.localToWorld(marker.tread.local.clone()) : null;
      const fixedWorld = marker.fixed ? marker.fixed.mesh.localToWorld(marker.fixed.local.clone()) : null;
      const fixedLocal = fixedWorld ? wheel.pivot.worldToLocal(fixedWorld.clone()) : null;
      let contact = Infinity;
      for (const sample of marker.spinSamples) {
        const world = sample.mesh.localToWorld(sample.local.clone());
        if (world.y < contact) contact = world.y;
      }
      wheels.push({
        front: !!wheel.front,
        radius: +Number(wheel.radius).toFixed(3),
        hub: round(hub),
        contactY: Number.isFinite(contact) ? +contact.toFixed(3) : null,
        tread: tread ? round(tread) : null,
        fixedLocal: fixedLocal ? fixedLocal.toArray().map(value => +value.toFixed(3)) : null,
        steer: +wheel.pivot.rotation.y.toFixed(4),
        // Quaternion angle around the axle. It wraps, so distance checks use controller.spin.
        spin: +spinAboutAxle(wheel).toFixed(4),
        commandError: controller ? +angleDelta(spinAboutAxle(wheel), controller.spin * (meanRadius(asset) / (wheel.radius || 0.38))).toFixed(4) : null,
        axle: wheel.axle ? wheel.axle.toArray().map(value => +value.toFixed(3)) : null,
        drop: +Number(wheel.drop || 0).toFixed(3),
      });
    }
    const doorWorld = asset?.frame?.visible ? system.doorPoint() : null;
    const door = doorWorld ? +this.app.physics.position.distanceTo(doorWorld).toFixed(2) : null;
    return {
      state: system.state,
      model: asset?.modelId || system.selected,
      loading: !!system.loading,
      speed: controller ? +controller.speed.toFixed(3) : 0,
      spin: controller ? +controller.spin.toFixed(4) : 0,
      steering: controller ? +controller.steering.toFixed(4) : 0,
      yaw: controller ? +controller.yaw.toFixed(4) : null,
      pitch: controller ? +Number(controller.pitch || 0).toFixed(4) : null,
      roll: controller ? +Number(controller.roll || 0).toFixed(4) : null,
      position: controller ? round(controller.position) : null,
      wheelRadius: controller?.wheelRadius ?? null,
      groundY: controller ? +(controller.position.y - 0.02).toFixed(3) : null,
      door,
      doorPoint: doorWorld ? round(doorWorld) : null,
      wheels,
    };
  }

  citizenProbe() {
    const manager = this.app.citizens;
    if (!manager) return { count: 0, people: [], metrics: null };
    const paths = this.app.city?.footpaths || null;
    const streamed = !!(this.app.city?.isStreamed && !paths);
    const people = (manager.targets || []).map(person => {
      let anchor = null;
      if (streamed) {
        const found = sidewalkAnchor(manager, person.position);
        anchor = found ? +found.distance.toFixed(2) : null;
      }
      return {
        id: person.id,
        state: person.state,
        x: +person.position.x.toFixed(2),
        y: +person.position.y.toFixed(2),
        z: +person.position.z.toFixed(2),
        yaw: +person.yaw.toFixed(3),
        speed: +Number(person.speed || 0).toFixed(2),
        allows: paths ? !!paths.allows(person.position.x, person.position.z) : null,
        route: person.route?.length || 0,
        anim: person.actor?.current?.getClip?.()?.name || null,
        anchor,
      };
    });
    return {
      count: people.length,
      streamed,
      hasFootpaths: !!paths,
      metrics: manager.metrics ? { lastMs: manager.metrics.lastMs, raycasts: manager.metrics.raycasts, active: manager.targets.length } : null,
      people,
    };
  }

  // Dev-only orbit. Driving sets lockBehind, which would hide the wheels behind the bumper.
  look(yaw, pitch, distance) {
    const camera = this.app.tpsCamera;
    if (!camera || ![yaw, pitch, distance].every(Number.isFinite)) return false;
    camera.lockBehind = false;
    camera.followMovement = false;
    camera.isRecentering = false;
    camera.yaw = yaw;
    camera.pitch = pitch;
    camera.minDistance = Math.min(camera.minDistance, distance);
    camera.maxDistance = Math.max(camera.maxDistance, distance);
    camera.targetDistance = distance;
    camera.distance = distance;
    camera.camera.userData.movementYaw = yaw;
    return true;
  }

  // Dev-only chase-camera nudge so a wheel frame can see the tread. Restored by passing false.
  inspectWheels(enabled) {
    const camera = this.app.tpsCamera;
    if (!camera) return false;
    if (enabled) {
      this.savedInspect = this.savedInspect || { pitch: camera.pitch, distance: camera.targetDistance, lock: camera.lockBehind, yaw: camera.yaw };
      camera.lockBehind = false;
      camera.pitch = 0.2;
      camera.targetDistance = 7.4;
      camera.yaw += 1.15;
      camera.camera.userData.movementYaw = camera.yaw;
    } else if (this.savedInspect) {
      camera.lockBehind = this.savedInspect.lock;
      camera.pitch = this.savedInspect.pitch;
      camera.targetDistance = this.savedInspect.distance;
      camera.yaw = this.savedInspect.yaw;
      camera.camera.userData.movementYaw = this.savedInspect.yaw;
      this.savedInspect = null;
    }
    return true;
  }

  dump() {
    return {
      build: 'quality-director-v5',
      href: location.href,
      ready: !!(this.app.assetsReady && this.app.character?.isLoaded),
      map: this.app.city?.mapId || (this.app.city?.isStreamed ? 'hong-kong' : 'unknown'),
      errors: this.errors.slice(),
      audioCounts: { ...this.audioCounts },
      vfxCounts: { ...this.vfxCounts },
      latest: this.latest || null,
    };
  }
}

function meanRadius(asset) {
  const wheels = asset?.wheels || [];
  if (!wheels.length) return 0.38;
  return wheels.reduce((sum, wheel) => sum + (wheel.radius || 0.38), 0) / wheels.length;
}

function spinAboutAxle(wheel) {
  const quaternion = wheel.spin?.quaternion;
  if (!quaternion) return 0;
  const axis = new THREE.Vector3(quaternion.x, quaternion.y, quaternion.z);
  const length = axis.length();
  if (length < 1e-8) return 0;
  const angle = 2 * Math.atan2(length, quaternion.w);
  const axle = wheel.axle || new THREE.Vector3(1, 0, 0);
  return angle * (axis.dot(axle) >= 0 ? 1 : -1);
}

function angleDelta(left, right) {
  return Math.atan2(Math.sin(left - right), Math.cos(left - right));
}

function decimate(samples, stride) {
  return samples.filter((_, index) => index % stride === 0 || index === samples.length - 1);
}

function summarize(samples) {
  if (!samples.length) return { frames: 0 };
  const speeds = samples.map(sample => sample.speed);
  const dts = samples.map(sample => sample.dt).filter(dt => dt > 0).sort((a, b) => a - b);
  const fps = dts.map(dt => 1000 / (dt * 1000));
  const start = samples[0];
  const end = samples[samples.length - 1];
  const travel = Math.hypot(end.position[0] - start.position[0], end.position[1] - start.position[1], end.position[2] - start.position[2]);
  const states = [...new Set(samples.map(sample => sample.state))];
  const animations = [...new Set(samples.map(sample => sample.animation).filter(Boolean))];
  const attacks = [...new Set(samples.map(sample => sample.attack?.key).filter(Boolean))];
  const low = dts.length ? dts[Math.max(0, Math.ceil(dts.length * 0.99) - 1)] : null;
  return {
    frames: samples.length,
    seconds: +((end.t - start.t) / 1000).toFixed(3),
    travel: +travel.toFixed(3),
    start: start.position,
    end: end.position,
    maxSpeed: +Math.max(...speeds).toFixed(3),
    states,
    animations,
    attacks,
    swingingFrames: samples.filter(sample => sample.swinging).length,
    maxWebs: samples.reduce((max, sample) => Math.max(max, sample.webs.length), 0),
    averageFps: fps.length ? +(fps.reduce((sum, value) => sum + value, 0) / fps.length).toFixed(2) : null,
    low1Fps: low ? +(1 / low).toFixed(2) : null,
    maxDt: dts.length ? +Math.max(...dts).toFixed(4) : null,
    maxDrawCalls: samples.reduce((max, sample) => Math.max(max, sample.drawCalls || 0), 0),
    maxTriangles: samples.reduce((max, sample) => Math.max(max, sample.triangles || 0), 0),
    memoryStart: start.memory,
    memoryEnd: end.memory,
    pitch: [start.camera.pitch, end.camera.pitch],
    yaw: [start.camera.yaw, end.camera.yaw],
  };
}
