import { createHongKongAudit } from './HongKongAudit.js';
import { CombatSystem } from './Combat.js';
import * as THREE from 'three';
import { City } from './City.js';
import { Character } from './Character.js';
import { SwingPhysics } from './SwingPhysics.js';
import { ThirdPersonCamera } from './Camera.js';
import { SoundController } from './Audio.js';
import { SpeedLinesEffect } from './SpeedLines.js';
import { TimeTrialSystem } from './TimeTrial.js';
import { VFXManager } from './VFX.js';
import { UrbanGroundCity } from './UrbanGroundCity.js';
import { Preferences } from './Preferences.js';
import { HongKongMinimap } from './Minimap.js';
import { Multiplayer } from './Multiplayer.js';
import { GROUNDED } from './MotionCatalog.js';

export class GameApp {
  constructor() {
    // 1. Locate or create Canvas elements
    const container = document.getElementById('game-container') || document.body;
    let canvas = document.getElementById('webgl-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'webgl-canvas';
      container.prepend(canvas);
    }
    this.canvas = canvas;

    this.speedLinesCanvas =
      document.getElementById('speedlines-canvas') ||
      document.getElementById('speed-lines-canvas');

    this.isPlaying = false;
    this.isPaused = false;
    this.cameraDragActive = false;
    this.lastMousePosition = null;
    this.heldKeys = new Set();

    this.input = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      sprint: false,
      jump: false,
      webHold: false,
      webTap: false,
      webFireHeld: false,
      wallRun: false,
      strafe: 0
    };

    // HUD Elements Cache
    this.speedDisplay = document.getElementById('speed-display');
    this.speedBarFill = document.getElementById('speed-bar-fill');
    this.altDisplay = document.getElementById('alt-display');
    this.altBarFill = document.getElementById('alt-bar-fill');
    this.webStatusDot = document.getElementById('web-status-dot');
    this.webStatusText = document.getElementById('web-status-text');
    this.crosshair = document.getElementById('crosshair');

    // Loading Screen Elements
    this.loadingScreen = document.getElementById('loading-screen');
    this.loadingBarFill = document.getElementById('loading-bar-fill');
    this.loadingPct = document.getElementById('loading-pct');
    this.loadingDesc = document.getElementById('loading-desc');
    this.clickToPlayOverlay = document.getElementById('overlay-click-to-play');

    let storage = null;
    try { storage = window.localStorage; } catch {}
    this.preferences = new Preferences(storage, window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false);
    try {
      this.initThree();
      this.initSystems();
    } catch (error) {
      this.showLoadingError('그래픽 초기화에 실패했습니다. WebGL 지원과 브라우저 설정을 확인하세요.');
      console.error(error);
      document.getElementById('btn-retry-load')?.addEventListener('click', () => location.reload());
      return;
    }
    this.initInputListeners();
    this.initUIListeners();
    this.applyPreferences();
    this.multiplayer = new Multiplayer(this);

    this.canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      this.setPaused(true);
      this.contextLost = true;
      this.showLoadingError('그래픽 연결이 중단되었습니다. 복구를 기다리거나 다시 불러오세요.');
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.loadingScreen?.classList.add('hidden');
      this.showNotice('그래픽 연결 복구 완료. 계속하기를 눌러 재개하세요.');
    });

    // Start render loop
    this.clock = new THREE.Clock();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initThree() {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8fc8e8);
    // Stream the nearby district, not twenty kilometres of textured terrain
    // into the startup cache. The neighbourhood advances with the player.
    this.scene.fog = new THREE.FogExp2(0xaed9eb, 0.0004);

    // Camera
    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.2, 1000);

    // Lighting
    const ambientLight = new THREE.HemisphereLight(0xd8f1ff, 0x536273, 1.25);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfff8e8, 3.2);
    sunLight.position.set(160, 280, 140);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 50;
    sunLight.shadow.camera.far = 600;
    const shadowD = 180;
    sunLight.shadow.camera.left = -shadowD;
    sunLight.shadow.camera.right = shadowD;
    sunLight.shadow.camera.top = shadowD;
    sunLight.shadow.camera.bottom = -shadowD;
    sunLight.shadow.bias = -0.0003;
    this.scene.add(sunLight);

    // Sky Dome Gradient
    const skyGeom = new THREE.SphereGeometry(1900, 32, 16);
    const skyMat = new THREE.MeshBasicMaterial({
      color: 0x9bd5f0,
      side: THREE.BackSide
    });
    const sky = new THREE.Mesh(skyGeom, skyMat);
    this.scene.add(sky);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  initSystems() {
    this.audio = new SoundController();
    if (this.speedLinesCanvas) {
      this.speedLines = new SpeedLinesEffect(this.speedLinesCanvas);
    }

    const useUrbanGround = new URLSearchParams(location.search).get('city') !== 'procedural';
    this.city = useUrbanGround
      ? new UrbanGroundCity(this.scene, this.camera, this.renderer, (pct, desc) => {
        this.updateLoadingProgress(pct, desc);
      })
      : new City(this.scene);

    if (!useUrbanGround) {
      const subtitle = document.querySelector('.badge-sub');
      if (subtitle) subtitle.textContent = 'LOCAL CITY WEB RUNNER';
      const lobbyEdition = document.querySelector('.lobby-edition');
      if (lobbyEdition) lobbyEdition.textContent = 'LOCAL CITY · OPEN WORLD';
      const district = document.querySelector('.hud-district');
      if (district) district.innerHTML = 'LOCAL CITY <i></i> FREE ROAM';
      const lobbyDescription = document.querySelector('.lobby-hero > p');
      if (lobbyDescription) lobbyDescription.innerHTML = '건물 사이를 스윙하고, 추격전을 시작하고,<br>나만의 도시를 네 방식대로 누벼봐.';
      const heading = document.querySelector('#overlay-click-to-play h2');
      if (heading) heading.textContent = '로컬 도시가 기다리고 있습니다.';
      const footer = document.querySelector('.lobby-footer span:first-child');
      if (footer) footer.innerHTML = 'WEB RUNNER <b>©</b> LOCAL CITY';
      const credit = document.querySelector('.data-credit');
      if (credit) {
        credit.replaceChildren(document.createTextNode('도시 데이터: 절차 생성 로컬 도시'),document.createElement('br'));
        const link = document.createElement('a');link.href = '?city=hong-kong';link.textContent = '홍콩 도시로 플레이';credit.append(link);
      }
    }

    this.updateLoadingProgress(25, useUrbanGround
      ? 'UrbanGround 홍콩 3D 도시 스트리밍 연결 중...'
      : '도시 마천루 및 지형 생성 완료...');

    // Initialize character with loading callbacks
    this.character = new Character(
      this.scene,
      (pct, desc) => {
        this.updateLoadingProgress(pct, desc);
      },
      () => {
        this.onAssetsLoaded();
      }
    );

    this.vfx = new VFXManager(this.scene);
    this.physics = new SwingPhysics(this.scene, this.city, this.character, this.audio);
    this.combat=new CombatSystem(this.scene,this.physics,this.character,{vfx:this.vfx,audio:this.audio,onNotice:message=>this.showNotice(message)});
    this.physics.onWebAttach=anchor=>this.vfx.spawnWebImpact(anchor);
    this.physics.onLanding = (position, impact, surfaceNormal) => {
      if (this.vfx?.spawnLandingShockwave) {
        this.vfx.spawnLandingShockwave(position, impact, surfaceNormal);
      } else if (impact > 7) {
        this.vfx?.spawnLandingDust(position);
      }
      // Landing impact is conveyed by animation, sound and ground VFX.
      // Random camera offsets on every landing made ordinary movement jitter.
    };
    this.tpsCamera = new ThirdPersonCamera(this.camera, this.canvas);
    this.character.setFirstPersonCamera(this.camera);
    this.timeTrial = new TimeTrialSystem(this.scene, this.city, this.audio);
    this.hongKongAudit=createHongKongAudit(this);
    this.minimap = new HongKongMinimap({
      canvas: document.getElementById('minimap-canvas'),
      status: document.getElementById('minimap-status'),
      coordinates: document.getElementById('minimap-coordinates'),
      rangeLabel: document.getElementById('minimap-range'),
      title: document.getElementById('minimap-title'),
      subtitle: document.getElementById('minimap-subtitle'),
      city: this.city,
      combat: this.combat,
    });

    this.city.onError = error => this.showLoadingError(error.message || '도시 데이터를 불러오지 못했습니다.');
    this.physics.onRecovery = reason => {
      this.combat?.cancel();this.combat?.clearEnemies();
      this.input.webHold = false;
      this.input.webFireHeld = false;
      if (this.timeTrial.isActive) { this.timeTrial.stop(); this.updateTrialHUD(); }
      this.resetCamera();
      this.showNotice(reason === 'boundary' ? `플레이 구역(±${this.city.playableHalfExtent || 2400}m)을 벗어나 시작점으로 돌아왔습니다.` : '안전한 시작점으로 돌아왔습니다.');
    };

    // Set initial spawn on tall central building
    const bounds = document.getElementById('world-limit');
    if (bounds) bounds.textContent = `구역 원점 기준 ±${this.city.playableHalfExtent || 2400}m`;
    const spawn = this.city.getRooftopSpawn(95);
    this.physics.position.copy(spawn);
    this.physics.previousFixedPosition.copy(spawn);
    this.physics.renderPosition.copy(spawn);
    this.physics.velocity.set(0, 0, 0);
    this.physics.state = 'IDLE';
    this.tpsCamera.placeBehind(spawn, this.physics.facingAngle);
    this.camera.position.copy(this.tpsCamera.currentPos);
    this.scene.add(this.camera);
    this.camera.lookAt(this.tpsCamera.lookAtTarget);
    this.camera.updateMatrixWorld(true);

    // Stunt callback
    this.physics.onStuntCallback = (name, pts) => {
      this.showStuntNotice(name, pts);
    };
  }

  updateLoadingProgress(pct, desc) {
    if (this.loadingBarFill) this.loadingBarFill.style.width = `${pct}%`;
    if (this.loadingPct) this.loadingPct.textContent = `${pct}%`;
    if (this.loadingDesc && desc) this.loadingDesc.textContent = desc;
  }

  onAssetsLoaded() {
    if (this.city instanceof UrbanGroundCity && !this.city.isReady) {
      this.updateLoadingProgress(75, '홍콩 도시의 건물·도로와 충돌 지형을 준비 중...');
      return;
    }
    if (this.assetsReady) return;
    this.assetsReady = true;
    if (this.city instanceof UrbanGroundCity) {
      this.physics.resetPosition();
      this.resetCamera();
    }
    this.updateLoadingProgress(100, this.character.loadWarning || '준비 완료!');
    if (this.character.loadWarning) this.showNotice(this.character.loadWarning);
    document.getElementById('loading-recovery')?.classList.add('hidden');
    setTimeout(() => {
      if (this.loadingScreen) {
        this.loadingScreen.classList.add('hidden');
      }
    }, 400);
  }

  initInputListeners() {
    // Keyboard
    window.addEventListener('blur', () => { this.clearInput(); if (this.isPlaying) this.setPaused(true); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.clearInput(); if (this.isPlaying) this.setPaused(true); } });
    window.addEventListener('keydown', (e) => {
      const k = e.code;
      if (e.target?.closest?.('input, select, textarea, button, a') && k !== 'Escape') return;
      if (k === 'Escape' && performance.now() < (this.ignoreEscapeUntil || 0)) return;
      const gameplayKey = [
        'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown',
        'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space',
        'KeyG', 'KeyE', 'KeyT', 'KeyF', 'KeyC', 'KeyV', 'KeyR', 'KeyQ', 'KeyB', 'ControlLeft', 'ControlRight'
      ].includes(k);
      if (gameplayKey && document.getElementById?.('controls-guide') && !document.getElementById('controls-guide').classList.contains('hidden')) return;
      if (gameplayKey && (!this.isPlaying || this.isPaused || this.multiplayer?.spectating)) return;
      if (gameplayKey) e.preventDefault();
      if (gameplayKey && e.repeat && ['Space','KeyG','KeyE','KeyT','KeyC','KeyV','KeyQ','ControlLeft','ControlRight'].includes(k)) return;

      if (gameplayKey) { this.heldKeys.add(k); this.syncHeldInput(); }
      if(k==='KeyB'){this.combat.guard(true);return;}
      if(k==='KeyG'){if(this.combat.special(this.camera))this.multiplayer?.attack('punch');return;}
      if(k==='KeyQ'){
        if(this.multiplayer?.locksCombatToggle()){this.showNotice('도망자는 거미줄로만 이동합니다.');return;}
        this.combat.toggle(this.input);return;
      }
      if(k==='ControlLeft'||k==='ControlRight'){this.combat.dodge(this.input,this.camera);return;}
      if (k === 'KeyR' && !e.repeat && !this.multiplayer?.room) this.toggleTimeTrial();
      if (!e.repeat && k === 'KeyC') {
        if (this.tpsCamera.mode === 'first') {
          this.tpsCamera.mode = 'follow';
          this.character.setFirstPersonMode(false);
          this.showCameraMode('follow');
        }
        this.tpsCamera.recenterBehind(this.physics.facingAngle);
      }
      if (!e.repeat && k === 'KeyV') {
        const previousMode = this.tpsCamera.mode;
        const mode = this.tpsCamera.cycleMode();
        if (mode === 'first') {
          this.tpsCamera.yaw = this.physics.facingAngle;
          this.tpsCamera.pitch = 0;
          this.tpsCamera.lockBehind = false;
          this.tpsCamera.orbitReturnTime = Infinity;
        } else if (previousMode === 'first') {
          this.tpsCamera.recenterBehind(this.physics.facingAngle);
        }
        this.character.setFirstPersonMode(mode === 'first');
        this.showCameraMode(mode);
      }
      if (k === 'Space') {
        this.input.jump = true;
        const swinging = this.physics.isSwinging;
        const onWeb = swinging || this.physics.state === 'WEB_ZIP' || this.physics.lastWebAnchor;
        if (onWeb) {
          this.input.webHold = false;
          this.input.webFireHeld = false;
          this.input.webTap = false;
          if (swinging) this.physics.releaseSwing(true);
          else this.physics.clearWebAnchor();
          this.physics.velocity.y = Math.max(this.physics.velocity.y, this.physics.jumpForce);
          this.physics.state = 'JUMPING';
        }
      }
      if (k === 'KeyF') this.input.wallRun = true;
      if (k === 'KeyE') {
        const groundedCombat = this.combat?.mode==='combat' && GROUNDED.includes(this.physics.state);
        if (groundedCombat) {
          if (this.combat.heavy(this.camera)) this.multiplayer?.attack('punch');
        } else this.physics.performAirJump(this.camera);
      }
      if (k === 'KeyT') this.physics.performAirTrick();
      if (k === 'KeyM' && !e.repeat) this.toggleMute();
      if (k === 'KeyH' && !e.repeat) this.toggleHelp();
      if (k === 'Escape' && !e.repeat) this.togglePause();
    });

    window.addEventListener('keyup', (e) => {
      const k = e.code;
      this.heldKeys.delete(k);
      if(k==='KeyB')this.combat?.guard(false);
      this.syncHeldInput();
      // Jump is a one-shot request consumed by physics, not a held button.
      // Clearing it on keyup loses taps completed between two render frames.
    });

    // Mouse Buttons
    window.addEventListener('mousedown', (e) => {
      if (!this.isPlaying || this.isPaused || this.multiplayer?.spectating) return;
      if (document.getElementById?.('controls-guide') && !document.getElementById('controls-guide').classList.contains('hidden')) return;
      if (e.target !== this.canvas) return;
      this.audio.ensureContext();

      const groundedCombat = this.combat?.mode==='combat' && GROUNDED.includes(this.physics.state);
      if(groundedCombat && (e.button===0 || e.button===2)) {
        const started=e.button===0?this.combat.attack(this.camera):this.combat.straight(this.camera);
        if(started)this.multiplayer?.attack('punch');
        return;
      }
      if (e.button === 0) {
        this.multiplayer?.attack('web');
        // Holding the left button keeps one rope. Releasing lets it go.
        this.physics.setWebAimPoint(
          e.clientX,
          e.clientY,
          this.canvas.getBoundingClientRect(),
          document.pointerLockElement === this.canvas
        );
        this.physics.findBestAnchor(this.camera);
        this.input.webTap = true;
        this.input.webFireHeld = true;
        this.input.webHold = true;
      } else if (e.button === 2) {
        // Right-click zips to the aimed point. A miss falls back to the current rope.
        this.physics.setWebAimPoint(
          e.clientX,
          e.clientY,
          this.canvas.getBoundingClientRect(),
          document.pointerLockElement === this.canvas
        );
        this.input.webHold = false;
        this.physics.webLatch = false;
        if (this.physics.performWebPull(this.camera, this.physics.webAimNdc) && this.physics.zipAnchor) {
          this.input.webHold = true;
          this.physics.webLatch = true;
        }
      }
      if (e.button === 1 && document.pointerLockElement !== this.canvas) {
        e.preventDefault();
        this.cameraDragActive = true;
        this.lastMousePosition = { x: e.clientX, y: e.clientY };
      }
    });

    window.addEventListener('mouseup', (e) => {
      this.cameraDragActive = false;
      this.lastMousePosition = null;
      if (e.button === 0) {
        this.input.webFireHeld = false;
        // A right-click reel keeps its latch until arrival. A tap that has not
        // reached physics yet must still attach, then release, in that update.
        if (this.physics?.state === 'WEB_ZIP') {
          // Leave webHold so the zip can become a swing.
        } else if (this.input.webTap) {
          this.input.webHold = false;
        } else {
          this.input.webHold = false;
          if (this.physics?.isSwinging) this.physics.releaseSwing(true);
        }
      }
    });

    // Prevent default context menu on right click
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Mouse-wheel zoom, matching the on-screen controls.
    this.canvas.addEventListener('wheel', (e) => {
      if (!this.isPlaying || this.isPaused) return;
      e.preventDefault();
      this.tpsCamera.handleWheel(e.deltaY);
    }, { passive: false });

    // Mouse Look (Pointer Lock)
    window.addEventListener('mousemove', (e) => {
      if (this.multiplayer?.spectating) return;
      if (this.isPlaying && !this.isPaused && document.pointerLockElement === this.canvas) {
        this.tpsCamera.handleMouseMove(e.movementX, e.movementY);
        this.physics.setWebAimPoint(0, 0, null, true);
      } else if (this.isPlaying && !this.isPaused && this.cameraDragActive && this.lastMousePosition) {
        const dx = e.clientX - this.lastMousePosition.x;
        const dy = e.clientY - this.lastMousePosition.y;
        this.lastMousePosition = { x: e.clientX, y: e.clientY };
        this.tpsCamera.handleMouseMove(dx, dy);
      } else if (this.isPlaying && !this.isPaused) {
        this.physics.setWebAimPoint(e.clientX, e.clientY, this.canvas.getBoundingClientRect(), false);
      }
    });

    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      if (this.hadPointerLock && !locked && this.isPlaying && !this.isPaused) {
        this.setPaused(true);
        this.ignoreEscapeUntil = performance.now() + 100;
      }
      this.hadPointerLock = locked;
    });

    // Canvas click to resume / lock pointer
    this.canvas.addEventListener('click', () => {
      if (this.isPlaying && document.pointerLockElement !== this.canvas) {
        if (this.pointerLockWanted) {
        Promise.resolve(this.canvas.requestPointerLock?.()).catch(() => {});
        }
        this.setPaused(false);
      }
    });
  }

  initUIListeners() {
    // Start Game Button
    const btnStart = document.getElementById('btn-start-game');
    const startAction = (lock = true) => {
      if (!this.character.isLoaded || !this.assetsReady) return;
      if (!this.isPlaying && this.city.isStreamed) {
        this.physics.resetPosition();
        this.resetCamera();
      }
      this.audio.ensureContext();
      if (this.clickToPlayOverlay) this.clickToPlayOverlay.classList.add('hidden');
      this.isPlaying = true;
      this.canvas.focus();
      this.pointerLockWanted = lock;
      this.setPaused(false);
      if (lock) Promise.resolve(this.canvas.requestPointerLock?.()).catch(() => {});
    };

    if (btnStart) btnStart.addEventListener('click', () => startAction(true));
    document.getElementById('btn-start-drag')?.addEventListener('click', () => startAction(false));
    if (this.clickToPlayOverlay) {
      this.clickToPlayOverlay.addEventListener('click', (e) => {
        if (e.target === this.clickToPlayOverlay) startAction();
      });
    }

    document.getElementById('btn-retry-load')?.addEventListener('click', () => location.reload());
    document.getElementById('btn-restart')?.addEventListener('click', () => this.restartGame());
    document.getElementById('btn-time-trial')?.addEventListener('click', () => this.toggleTimeTrial());
    document.getElementById('reduced-motion')?.addEventListener('click', () => {
      this.preferences.values.reducedMotion = !this.preferences.values.reducedMotion;
      if (!this.preferences.save()) this.showNotice('설정을 저장할 수 없어 이번 실행에만 적용합니다.');
      this.applyPreferences();
    });
    document.getElementById('graphics-quality')?.addEventListener('change', event => {
      this.preferences.values.quality = event.target.value;
      if (!this.preferences.save()) this.showNotice('설정을 저장할 수 없어 이번 실행에만 적용합니다.');
      this.applyPreferences();
    });

  }

  showCameraMode(mode) {
    const toast = document.getElementById('camera-mode-toast');
    if (!toast) return;
    const labels = { close: '근접 추적 시점', follow: '기본 3인칭 시점', swing: '원거리 스윙 시점', first: '1인칭 시점' };
    toast.textContent = labels[mode] || labels.follow;
    toast.classList.add('visible');
    clearTimeout(this.cameraModeToastTimer);
    this.cameraModeToastTimer = setTimeout(() => toast.classList.remove('visible'), 1300);
  }

  toggleMute() {
    const isMuted = this.audio.toggleMute();
    this.preferences.values.muted = isMuted;
    if (!this.preferences.save()) this.showNotice('소리 설정은 이번 실행에만 적용됩니다.');
  }

  toggleHelp() {
    const guide = document.getElementById('controls-guide');
    if (guide) {
      guide.classList.toggle('hidden');
      if (!guide.classList.contains('hidden')) this.clearInput();
    }
  }

  togglePause() {
    if (!this.isPlaying) return;
    this.setPaused(!this.isPaused);
    if (!this.isPaused && this.pointerLockWanted) {
      Promise.resolve(this.canvas.requestPointerLock?.()).catch(() => {});
    }
  }

  async toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else this.showNotice('이 브라우저에서는 전체화면을 사용할 수 없습니다.');
    } catch { this.showNotice('전체화면을 사용할 수 없습니다.'); }
  }

  setPaused(paused) {
    const wasPaused = this.isPaused;
    this.isPaused = paused;
    if (!paused && wasPaused && (this.physics?.isSwinging ||
        (this.physics?.state === 'WEB_ZIP' && this.physics.zipAnchor))) {
      this.input.webHold = true;
      this.physics.webLatch = true;
    }
    if (paused) {
      this.clearInput();
      this.speedLines?.setSpeed(0, 1);
      if (document.pointerLockElement === this.canvas) document.exitPointerLock?.();
    }
    const resume = this.isPlaying;
    const startLabel = document.querySelector('#btn-start-game span');
    if (startLabel) startLabel.textContent = resume ? '계속 플레이' : '게임 시작';
    const dragButton = document.getElementById('btn-start-drag');
    if (dragButton) dragButton.textContent = resume ? '마우스 잠금 없이 계속하기' : '마우스 잠금 없이 시작 · 휠 버튼 드래그';
    document.getElementById('btn-restart')?.classList.toggle('hidden', !resume || !!this.multiplayer?.room);
    if (paused) setTimeout(() => document.getElementById('btn-start-game')?.focus(), 0);
    if (paused) this.audio.setWindSpeed(0);
    if (this.clickToPlayOverlay) {
      if (this.isPaused) {
        this.clickToPlayOverlay.classList.remove('hidden');
      } else {
        this.clickToPlayOverlay.classList.add('hidden');
      }
    }
  }

  clearInput() {
    this.combat?.clearHeld();
    this.heldKeys.clear();
    for (const key of Object.keys(this.input)) this.input[key] = key === 'strafe' ? 0 : false;
    this.cameraDragActive = false;
    if (this.physics) this.physics.clearPendingInput();
  }

  syncHeldInput() {
    const held = (...keys) => keys.some(key => this.heldKeys.has(key));
    this.input.forward = held('KeyW','ArrowUp');
    this.input.backward = held('KeyS','ArrowDown');
    this.input.left = held('KeyA','ArrowLeft');
    this.input.right = held('KeyD','ArrowRight');
    this.input.sprint = held('ShiftLeft','ShiftRight');
    this.input.wallRun = held('KeyF');
    this.input.strafe = Number(this.input.right) - Number(this.input.left);
  }

  showLoadingError(message) {
    if (this.assetsReady && !this.contextLost) { this.showNotice(message); return; }
    if (this.loadingDesc) this.loadingDesc.textContent = message;
    document.getElementById('loading-recovery')?.classList.remove('hidden');
  }

  showNotice(message) {
    const notice = document.getElementById('game-notice');
    if (!notice) return;
    notice.textContent = message;
    notice.classList.add('visible');
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => notice.classList.remove('visible'), 5000);
  }

  showStuntNotice(name, pts) {
    this.showNotice(pts > 0 ? `${name} +${pts}` : name);
  }

  applyPreferences() {
    const { muted, reducedMotion, quality } = this.preferences.values;
    if (this.audio.isMuted !== muted) this.audio.toggleMute();
    const motionButton = document.getElementById('reduced-motion');
    motionButton?.setAttribute('aria-pressed', String(reducedMotion));
    const motionValue = motionButton?.querySelector('.setting-value');
    if (motionValue) motionValue.textContent = reducedMotion ? '켜짐' : '꺼짐';
    document.getElementById('graphics-quality').value = quality;
    this.tpsCamera.reducedMotion = reducedMotion;
    this.city.reducedMotion = reducedMotion;
    this.timeTrial.reducedMotion = reducedMotion;
    document.body.classList.toggle('reduced-motion', reducedMotion);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, { low: 1, balanced: 1.5, high: 2 }[quality] || 1.5));
    this.renderer.shadowMap.enabled = quality !== 'low';
  }

  resetCamera() {
    this.tpsCamera.placeBehind(this.physics.position, this.physics.facingAngle);
    this.camera.position.copy(this.tpsCamera.currentPos);
    this.camera.lookAt(this.tpsCamera.lookAtTarget);
    this.camera.updateMatrixWorld(true);
  }

  restartGame() {
    if (this.multiplayer?.room) return;
    this.clearInput();
    this.physics.resetPosition();
    this.physics.stuntScore = 0;
    this.timeTrial.stop();
    this.updateTrialHUD();
    this.resetCamera();
    this.showNotice('시작점으로 돌아왔습니다. 계속하기를 눌러 플레이하세요.');
  }

  toggleTimeTrial() {
    if (this.multiplayer?.room) return;
    if (!this.isPlaying || this.isPaused) return;
    if (this.timeTrial.isActive && !this.timeTrial.isCompleted) this.timeTrial.stop();
    else {
      this.clearInput();
      this.physics.resetPosition();
      this.resetCamera();
      if (!this.timeTrial.start()) this.showNotice('코스 지형이 아직 준비되지 않았거나 링을 놓을 공간이 부족합니다. 로컬 도시를 이용하거나 잠시 후 다시 시도하세요.');
      else this.showNotice('타임트라이얼 시작! 금색 링을 순서대로 통과하세요. R로 종료합니다.');
    }
    this.updateTrialHUD();
  }

  updateTrialHUD(result = null) {
    const status = document.getElementById('trial-status');
    const course = this.timeTrial.courseId;
    const best = this.preferences.values.bestTimes[course];
    if (result?.completed) {
      const newBest = this.preferences.recordTime(course, result.totalTime);
      const saveWarning = newBest && !this.preferences.lastSaveSucceeded
        ? ' · 저장할 수 없어 최고 기록은 이번 실행에만 적용됩니다.' : '';
      this.showNotice(`완주 ${result.totalTime.toFixed(2)}초${newBest ? ' · 최고 기록!' : ''}${saveWarning}`);
    }
    if (status) status.textContent = this.timeTrial.isActive
      ? this.timeTrial.isCompleted ? `완주 ${this.timeTrial.elapsedTime.toFixed(2)}초 · R 재도전`
        : `링 ${this.timeTrial.currentIndex + 1}/${this.timeTrial.checkpoints.length} · ${this.timeTrial.elapsedTime.toFixed(2)}초`
      : `R 타임트라이얼${best ? ` · 최고 ${best.toFixed(2)}초` : ''}`;
    const target = document.getElementById('trial-target');
    const checkpoint = this.timeTrial.isActive && !this.timeTrial.isCompleted
      ? this.timeTrial.checkpoints[this.timeTrial.currentIndex] : null;
    if (target) {
      target.textContent = '';
      if (checkpoint) {
        const offset = checkpoint.position.clone().sub(this.physics.position);
        const forward = new THREE.Vector3(); this.camera.getWorldDirection(forward); forward.y=0; forward.normalize();
        const right = new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0));
        const angle = Math.atan2(offset.dot(right),offset.dot(forward));
        const arrows = ['↑','↗','→','↘','↓','↙','←','↖'];
        const arrow = arrows[(Math.round(angle/(Math.PI/4))+8)%8];
        target.textContent = `다음 링 ${Math.round(offset.length())}m ${arrow} · 높이 ${offset.y>=0?'+':''}${Math.round(offset.y)}m`;
      }
    }
    const button = document.getElementById('btn-time-trial');
    if (button) { button.textContent = this.timeTrial.isActive && !this.timeTrial.isCompleted ? '레이스 종료' : '레이스 시작'; }
  }

  updateHUD(speedKmh, altitude, state) {
    const score = document.getElementById('stunt-score');
    if (score) score.textContent = String(this.physics.stuntScore);
    const combatHud=document.getElementById('combat-status');
    if(combatHud && this.combat)combatHud.textContent=`${this.combat.mode==='web'?'거미줄 ON':'전투 모드'} · HP ${Math.ceil(this.combat.health)} · 기력 ${Math.ceil(this.combat.stamina)} · Q 모드 전환`;
    // 1. Speedometer
    if (this.speedDisplay) {
      this.speedDisplay.textContent = Math.round(speedKmh);
    }
    if (this.speedBarFill) {
      const speedPct = Math.min(speedKmh / 120, 1) * 100;
      this.speedBarFill.style.width = `${speedPct}%`;
    }

    // 2. Altitude
    if (this.altDisplay) {
      this.altDisplay.textContent = Math.round(altitude);
    }
    if (this.altBarFill) {
      const altPct = THREE.MathUtils.clamp(altitude / 220, 0, 1) * 100;
      this.altBarFill.style.width = `${altPct}%`;
    }

    // 3. Web Status Pill
    if (this.webStatusText && !this.webStatusText.textContent.includes('★')) {
      if (state === 'SWINGING') {
        this.webStatusText.textContent = this.physics.webs?.length===2 ? 'DUAL WEB SWING' : 'SWINGING';
        if (this.webStatusDot) this.webStatusDot.className = 'status-dot swinging';
      } else if (state === 'WALL_RUNNING') {
        this.webStatusText.textContent = 'WALL RUN';
        if (this.webStatusDot) this.webStatusDot.className = 'status-dot';
      } else if (state === 'FALLING') {
        this.webStatusText.textContent = this.physics.velocity.y < -12 ? 'AIR DIVE' : 'SHORT FALL';
        if (this.webStatusDot) this.webStatusDot.className = 'status-dot';
      } else if (['WEB_ZIP','LANDING','ROLLING','TURNING','JUMPING','MANTLING'].includes(state)) {
        this.webStatusText.textContent = state.replace('_',' ');
        if (this.webStatusDot) this.webStatusDot.className = 'status-dot';
      } else {
        this.webStatusText.textContent = this.combat?.mode==='combat'?'COMBAT READY':'WEB READY';
        if (this.webStatusDot) this.webStatusDot.className = 'status-dot';
      }
    }
  }

  animate() {
    requestAnimationFrame(this.animate);

    const elapsed = this.clock.getDelta();
    const rawDelta = Math.min(elapsed, 0.1);
    const delta = rawDelta;
    this.frameTime = (this.frameTime || 0) + elapsed;
    this.frameCount = (this.frameCount || 0) + 1;
    if (this.frameTime >= 1) {
      const output = document.getElementById('performance-status');
      if (output) output.textContent = `${Math.round(this.frameCount / this.frameTime)} FPS · ${(this.frameTime * 1000 / this.frameCount).toFixed(1)} ms`;
      this.frameTime = 0; this.frameCount = 0;
    }

    // Keep streamed city tiles advancing while the start overlay is visible;
    // TilesRenderer performs visibility/LOD work independently of gameplay.
    this.city.update(this.clock.elapsedTime);
    this.minimap?.update(this.physics.position, this.physics.facingAngle, this.clock.elapsedTime);
    if (!this.assetsReady && this.character.isLoaded &&
        (!(this.city instanceof UrbanGroundCity) || this.city.isReady)) this.onAssetsLoaded();

    const spectating = !!this.multiplayer?.spectating;
    if (this.isPlaying && !this.isPaused && !spectating) {
      // 1. Update Physics and Character
      const wasSwinging = this.physics.isSwinging;
      this.combat?.before(delta,this.camera);
      this.physics.update(delta, this.input, this.camera);
      this.combat?.after(delta);
      if (wasSwinging && !this.physics.isSwinging) this.input.webHold = false;

      // 2. Update 3rd Person Follow Camera
      this.tpsCamera.update(
        rawDelta,
        this.physics.renderPosition,
        this.physics.velocity,
        this.physics.isSwinging,
        this.city.buildingMeshes,
        this.city.raycast?.bind(this.city),
        this.physics.facingAngle
      );

      // 3. Update Visuals & FX
      const speedKmh = this.physics.velocity.length() * 3.6;
      if (this.speedLines) {
        this.speedLines.setSpeed(this.preferences.values.reducedMotion ? 0 : speedKmh, delta);
      }
      this.vfx.update(delta);
      // Simulation steps stay bounded, but active race time includes frame stalls.
      const trialResult = this.timeTrial.update(this.physics.position, elapsed);
      this.updateTrialHUD(trialResult);
      // 4. Update HUD
      this.updateHUD(speedKmh, this.physics.position.y, this.physics.state);
    }

    this.multiplayer?.update(delta);

    this.hongKongAudit?.update(this.clock.elapsedTime);

    // Render 3D Scene
    if (!this.contextLost) this.renderer.render(this.scene, this.camera);

    // Render 2D Speed lines overlay
    if (this.speedLines) {
      this.speedLines.render(this.isPlaying && !this.isPaused ? delta : 0);
    }
  }
}

// Bootstrap application on DOM ready or immediately if document is already ready
function bootstrap() {
  if (new URLSearchParams(location.search).has('combatReview')) {
    import('./CombatReview.js').then(m => m.startCombatReview());
  } else if (new URLSearchParams(location.search).has('effectsReview')) {
    import('./EffectsReview.js').then(m => m.startEffectsReview());
  } else if (new URLSearchParams(location.search).has('motionReview')) {
    import('./MotionReview.js').then(m => m.startMotionReview());
  } else {
    new GameApp();
  }
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
}
