import { initCitySelection, selectedCity } from './CitySelection.js';
import { createHongKongAudit } from './HongKongAudit.js';
import { CombatSystem } from './Combat.js';
import * as THREE from 'three';
import { City } from './City.js';
import { Character } from './Character.js';
import { SwingPhysics } from './SwingPhysics.js';
import { ThirdPersonCamera } from './Camera.js';
import { SoundController } from './Audio.js';
import { SpeedLinesEffect } from './SpeedLines.js';
import { WorldMap } from './WorldMap.js';
import { DisplayMode } from './DisplayMode.js';
import { VFXManager } from './VFX.js';
import { UrbanGroundCity } from './UrbanGroundCity.js';
import { Preferences } from './Preferences.js';
import { HongKongMinimap } from './Minimap.js';
import { Multiplayer } from './Multiplayer.js';
import { GROUNDED } from './MotionCatalog.js';
import {canonicalKey} from './PlayerSettings.js';
import {SettingsPanel} from './SettingsPanel.js';
import {GamepadInput} from './GamepadInput.js';
import {TouchControls} from './TouchControls.js';
import {PlayerExperience} from './PlayerExperience.js';
import {CombatPractice} from './CombatPractice.js';

const ONE_SHOT_KEYS = new Set(['Space','KeyG','KeyE','KeyT','KeyC','KeyV','KeyQ','ControlLeft','ControlRight']);

export class GameApp {
  constructor() {
    initCitySelection();
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

    this.startupAt=performance.now();
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
      webHoldRight: false,
      webTapRight: false,
      webFireHeldRight: false,
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
    this.experience=new PlayerExperience(this,storage);
    this.practice=new CombatPractice(this);
    this.settingsPanel=new SettingsPanel(this);
    this.gamepad=new GamepadInput(this);
    this.initInputListeners();
    this.initUIListeners();
    this.touchControls=new TouchControls(this);
    this.applyPreferences();
    this.multiplayer = new Multiplayer(this);
    this.displayMode = new DisplayMode(this);

    this.canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      this.contextLost = true;
      this.setPaused(true);
      this.showLoadingError('그래픽 연결이 중단되었습니다. 복구를 기다리거나 다시 불러오세요.');
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      if(this.assetsReady)this.loadingScreen?.classList.add('hidden');
      document.getElementById('loading-recovery')?.classList.add('hidden');
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
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
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
    const localCity=selectedCity(location.search)==='procedural';
    const ambientLight = new THREE.HemisphereLight(0xd8f1ff, localCity?0xb8c6d5:0x536273, localCity?2.4:1.25);
    this.scene.add(ambientLight);
    if(localCity){
      this.scene.add(new THREE.AmbientLight(0xffffff,.55));
      const fill=new THREE.DirectionalLight(0xe4f1ff,1.2);
      fill.position.set(-160,180,-140);this.scene.add(fill);
    }

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

    window.addEventListener('resize', () => this.resizeViewport());
  }

  resizeViewport() {
    const bounds=this.canvas.parentElement?.getBoundingClientRect();
    const width=Math.max(1,Math.round(bounds?.width || window.innerWidth || 1));
    const height=Math.max(1,Math.round(bounds?.height || window.innerHeight || 1));
    if(this.viewportWidth===width && this.viewportHeight===height)return;
    this.viewportWidth=width;this.viewportHeight=height;
    this.camera.aspect=width/height;this.camera.updateProjectionMatrix();
    this.renderer.setSize(width,height,false);
    this.speedLines?.resize(width,height);this.minimap?.resize();
  }

  initSystems() {
    this.audio = new SoundController();
    if (this.speedLinesCanvas) {
      this.speedLines = new SpeedLinesEffect(this.speedLinesCanvas);
    }

    const useUrbanGround = selectedCity(location.search) === 'hong-kong';
    this.city = useUrbanGround
      ? new UrbanGroundCity(this.scene, this.camera, this.renderer, (pct, desc) => {
        this.updateLoadingProgress(pct, desc);
      })
      : new City(this.scene);

    if (!useUrbanGround) {
      const subtitle = document.querySelector('.badge-sub');
      if (subtitle) subtitle.textContent = 'LOCAL CITY · SHADOW PULSE';
      const lobbyEdition = document.querySelector('.lobby-edition');
      if (lobbyEdition) lobbyEdition.textContent = 'LOCAL CITY · OPEN WORLD';
      const district = document.querySelector('.hud-district');
      if (district) district.innerHTML = 'LOCAL CITY <i></i> FREE ROAM';
      const lobbyDescription = document.querySelector('.lobby-hero > p');
      if (lobbyDescription) lobbyDescription.innerHTML = '건물 사이를 스윙하고, 추격전을 시작하고,<br>나만의 도시를 네 방식대로 누벼봐.';
      const heading = document.querySelector('#overlay-click-to-play h2');
      if (heading) heading.textContent = '로컬 도시가 기다리고 있습니다.';
      const footer = document.querySelector('.lobby-footer span:first-child');
      if (footer) footer.innerHTML = 'SHADOW PULSE <b>·</b> LOCAL CITY';
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
    this.worldMap = new WorldMap(this);
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
      players: () => this.multiplayer?.minimapPlayers() || [],
    });

    this.city.onError = error => this.showLoadingError(error.message || '도시 데이터를 불러오지 못했습니다.');
    this.physics.onRecovery = reason => {
      this.combat?.cancel();this.combat?.clearEnemies();
      this.input.webHold = false;
      this.input.webFireHeld = false;
      this.input.webHoldRight = false;
      this.input.webFireHeldRight = false;
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
    this.loadingScreen?.setAttribute('data-ready-ms', String(Math.round(performance.now())));
    this.loadingScreen?.setAttribute('data-character-ready-ms', String(Math.round(this.character.readyMilliseconds || 0)));
    this.loadingScreen?.setAttribute('data-city-ready-ms', String(Math.round(this.city.readyAt || 0)));
    this.readyMilliseconds=performance.now()-this.startupAt;
    if (this.city instanceof UrbanGroundCity) {
      this.physics.resetPosition();
      this.resetCamera();
    }
    this.updateLoadingProgress(100, this.character.loadWarning || '준비 완료!');
    if (this.character.loadWarning) this.showNotice(this.character.loadWarning);
    document.getElementById('loading-recovery')?.classList.add('hidden');
    setTimeout(() => {
      if (this.loadingScreen && !this.contextLost) {
        this.loadingScreen.classList.add('hidden');
      }
    }, 400);
  }

  initInputListeners() {
    // Keyboard
    window.addEventListener('blur', () => { this.clearInput(); if (this.isPlaying) this.setPaused(true); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.clearInput(); if (this.isPlaying) this.setPaused(true); } });
    window.addEventListener('keydown', (e) => {
      const k = canonicalKey(e.code,this.preferences?.values.settings);
      if (e.target?.closest?.('input, select, textarea, [contenteditable="true"]') && k !== 'Escape') return;
      if (!this.isPlaying && e.target?.closest?.('button, a') && k !== 'Escape') return;
      if (k === 'Escape' && performance.now() < (this.ignoreEscapeUntil || 0)) return;
      // Native dialogs own Escape and focus until they close.
      if(document.getElementById?.('fullscreen-help')?.open)return;
      if(k==='Escape' && this.worldMap?.isOpen){e.preventDefault();this.worldMap.close();return;}
      if(this.worldMap?.isOpen && k!=='KeyM')return;
      if(k==='Escape' && this.helpOpen){e.preventDefault();if(!e.repeat)this.toggleHelp();return;}
      if(k==='Escape' && !e.repeat && this.multiplayer?.admin?.isOpen){e.preventDefault();this.multiplayer.admin.close();return;}
      const gameplayKey = [
        'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown',
        'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'ShiftLeft', 'ShiftRight', 'Space',
        'KeyG', 'KeyE', 'KeyT', 'KeyF', 'KeyC', 'KeyV', 'KeyQ', 'KeyB', 'ControlLeft', 'ControlRight'
      ].includes(k);
      if (gameplayKey && document.getElementById?.('controls-guide') && !document.getElementById('controls-guide').classList.contains('hidden')) return;
      if (gameplayKey && (!this.isPlaying || this.isPaused || this.multiplayer?.spectating)) return;
      if (gameplayKey) e.preventDefault();
      if (gameplayKey && e.repeat && ONE_SHOT_KEYS.has(k)) return;

      if (gameplayKey) {
        const keys=e.touchInput?(this.touchHeldKeys??=new Set()):e.gamepadInput?(this.gamepadHeldKeys??=new Set()):this.heldKeys;
        const sources=e.touchInput?(this.touchKeySources??=new Map()):e.gamepadInput?(this.gamepadKeySources??=new Map()):(this.keyboardKeySources??=new Map());
        const wasHeld=this.heldKeys.has(k) || this.gamepadHeldKeys?.has(k) || this.touchHeldKeys?.has(k);
        sources.set(e.code,k);
        keys.add(k);
        if(k==='ShiftLeft' && !wasHeld && !e.repeat && this.preferences?.values.settings?.sprintToggle)this.sprintLatched=!this.sprintLatched;
        this.syncHeldInput();
        // Register every source, but discrete actions belong to the first
        // press. A second device or modifier alias must not toggle it twice.
        if(wasHeld && ONE_SHOT_KEYS.has(k))return;
      }
      if(k==='KeyB'){this.combat.guard(true);return;}
      if(k==='KeyG'){if(GROUNDED.includes(this.physics.state)){if(this.combat.special(this.camera))this.multiplayer?.attack('punch');}else this.combat.airStrike?.(this.camera);return;}
      if(k==='KeyQ'){
        if(this.multiplayer?.locksCombatToggle()){this.showNotice('도망자는 에너지 와이어로만 이동합니다.');return;}
        this.combat.toggle(this.input);return;
      }
      if(k==='ControlLeft'||k==='ControlRight'){this.combat.dodge(this.input,this.camera);return;}
      if (!e.repeat && k === 'KeyC') {
        this.tpsCamera.recenterBehind(this.physics.facingAngle);
      }
      if (!e.repeat && k === 'KeyV') {
        const mode = this.tpsCamera.cycleMode();
        this.showCameraMode(mode);
      }
      if (k === 'Space') {
        this.input.jump = true;
        const swinging = this.physics.isSwinging;
        const onWeb = swinging || this.physics.state === 'WEB_ZIP';
        if (onWeb) {
          const groundedWeb=swinging && this.physics.supportHeight(this.physics.position)!==null;
          this.input.webHold = false;
          this.input.webFireHeld = false;
          this.input.webTap = false;
          this.input.webHoldRight = false;
          this.input.webFireHeldRight = false;
          this.input.webTapRight = false;
          if (swinging) this.physics.releaseSwing(false);
          else this.physics.clearWebAnchor();
          // Space is a deliberate jump off the strand, including a stationary
          // hang. Mouse release alone continues to preserve swing momentum.
          if (!groundedWeb) {
            this.physics.velocity.y = Math.max(this.physics.velocity.y, this.physics.jumpForce);
            this.audio.playJump?.();
          }
          this.physics.state = groundedWeb?'IDLE':this.physics.velocity.y > 0 ? 'JUMPING' : 'FALLING';
          this.input.jump = groundedWeb;
          this.physics.clearPendingInput();
        }
      }
      if (k === 'KeyF') this.input.wallRun = true;
      if (k === 'KeyE') {
        const groundedCombat = this.combat?.mode==='combat' && GROUNDED.includes(this.physics.state);
        if (groundedCombat) {
          if (this.combat.heavy(this.camera)) this.multiplayer?.attack('punch');
        } else this.physics.performAirJump(this.camera, this.physics.webAimNdc);
      }
      if (k === 'KeyT') this.physics.performAirTrick(this.input);
      if (k === 'KeyM' && !e.repeat && this.isPlaying) { e.preventDefault(); this.worldMap.toggle(); return; }
      if (k === 'KeyH' && !e.repeat) this.toggleHelp();
      if (k === 'Escape' && !e.repeat) this.togglePause();
    });

    window.addEventListener('keyup', (e) => {
      const sources=e.touchInput?(this.touchKeySources??=new Map()):e.gamepadInput?this.gamepadKeySources:this.keyboardKeySources;
      const k = sources?.get(e.code) || canonicalKey(e.code,this.preferences?.values.settings);
      sources?.delete(e.code);
      if(!sources || ![...sources.values()].includes(k))
        (e.touchInput?this.touchHeldKeys:e.gamepadInput?this.gamepadHeldKeys:this.heldKeys)?.delete(k);
      if(k==='KeyB' && !this.heldKeys.has(k) && !this.gamepadHeldKeys?.has(k) && !this.touchHeldKeys?.has(k))this.combat?.guard(false);
      this.syncHeldInput();
      // Jump is a one-shot request consumed by physics, not a held button.
      // Clearing it on keyup loses taps completed between two render frames.
    });

    // Mouse Buttons
    window.addEventListener('mousedown', (e) => {
      if (e.sourceCapabilities?.firesTouchEvents) return;
      if (!this.isPlaying || this.isPaused || this.multiplayer?.spectating) return;
      if (document.getElementById?.('controls-guide') && !document.getElementById('controls-guide').classList.contains('hidden')) return;
      if (e.target !== this.canvas) return;
      const buttons=e.touchInput?(this.touchMouseButtons??=new Set()):e.gamepadInput?(this.gamepadMouseButtons??=new Set()):(this.mouseButtons??=new Set());
      const wasHeld=this.mouseButtons?.has(e.button) || this.gamepadMouseButtons?.has(e.button) || this.touchMouseButtons?.has(e.button);
      buttons.add(e.button);
      if(wasHeld)return;
      this.audio.ensureContext();
      if(this.combat?.blocking && (e.button===0 || e.button===2))return;

      const groundedCombat = this.combat?.mode==='combat' && GROUNDED.includes(this.physics.state);
      if(groundedCombat && (e.button===0 || e.button===2)) {
        const started=e.button===0?this.combat.attack(this.camera):this.combat.straight(this.camera);
        if(started)this.multiplayer?.attack('punch');
        return;
      }
      if(this.combat?.mode==='combat' && (e.button===0 || e.button===2))return;
      if (e.button === 0) {
        if(!e.touchInput && this.preferences?.values.settings?.webToggle && this.input.webHold){this.input.webTap=this.input.webHold=this.input.webFireHeld=false;this.physics.releaseWebButton(0);return;}
        // Holding the left button keeps one rope. Releasing lets it go.
        this.physics.setWebAimPoint(
          e.clientX,
          e.clientY,
          this.canvas.getBoundingClientRect(),
          true // Both hands fire through the fixed screen-center reticle.
        );
        if(this.multiplayer?.attack('web'))return;
        this.input.webTap = true;
        this.input.webFireHeld = true;
        this.input.webHold = true;
      }
      if (e.button === 2) {
        if(!e.touchInput && this.preferences?.values.settings?.webToggle && this.input.webHoldRight){this.input.webTapRight=this.input.webHoldRight=this.input.webFireHeldRight=false;this.physics.releaseWebButton(2);return;}
        // The opposite hand uses the same held pendulum as the left button.
        this.physics.setWebAimPoint(
          e.clientX,
          e.clientY,
          this.canvas.getBoundingClientRect(),
          true
        );
        if(this.multiplayer?.attack('web','right'))return;
        this.input.webTapRight = true;
        this.input.webFireHeldRight = true;
        this.input.webHoldRight = true;
      }
      if (e.button === 1 && document.pointerLockElement !== this.canvas) {
        e.preventDefault();
        this.cameraDragActive = true;
        this.lastMousePosition = { x: e.clientX, y: e.clientY };
      }
    });

    window.addEventListener('mouseup', (e) => {
      (e.touchInput?this.touchMouseButtons:e.gamepadInput?this.gamepadMouseButtons:this.mouseButtons)?.delete(e.button);
      if(e.button===1){this.cameraDragActive = false;this.lastMousePosition = null;}
      if(this.mouseButtons?.has(e.button) || this.gamepadMouseButtons?.has(e.button) || this.touchMouseButtons?.has(e.button))return;
      if (e.button === 0 && (e.touchInput || !this.preferences?.values.settings?.webToggle)) {
        this.input.webFireHeld = false;
        this.input.webHold = false;
        this.physics?.releaseWebButton?.(0);
      }
      if (e.button === 2 && (e.touchInput || !this.preferences?.values.settings?.webToggle)) {
        this.input.webFireHeldRight = false;
        this.input.webHoldRight = false;
        this.physics?.releaseWebButton?.(2);
      }
    });

    // Prevent default context menu on right click
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Mouse-wheel zoom, matching the on-screen controls.
    this.canvas.addEventListener('wheel', (e) => {
      if (!this.isPlaying || this.isPaused || this.helpOpen) return;
      e.preventDefault();
      this.tpsCamera.handleWheel(e.deltaY);
    }, { passive: false });

    // Mouse Look (Pointer Lock)
    window.addEventListener('mousemove', (e) => {
      if (this.multiplayer?.spectating || this.helpOpen) return;
      if (this.isPlaying && !this.isPaused && document.pointerLockElement === this.canvas) {
        this.tpsCamera.handleMouseMove(e.movementX, e.movementY);
        this.physics.setWebAimPoint(0, 0, null, true);
      } else if (this.isPlaying && !this.isPaused && this.cameraDragActive && this.lastMousePosition) {
        const dx = e.clientX - this.lastMousePosition.x;
        const dy = e.clientY - this.lastMousePosition.y;
        this.lastMousePosition = { x: e.clientX, y: e.clientY };
        this.tpsCamera.handleMouseMove(dx, dy);
      } else if (this.isPlaying && !this.isPaused) {
        this.physics.setWebAimPoint(0, 0, null, true);
      }
    });

    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      if (this.hadPointerLock && !locked && this.isPlaying && !this.isPaused && !this.helpOpen && !this.displayTransition) {
        this.setPaused(true);
        this.ignoreEscapeUntil = performance.now() + 100;
      }
      this.hadPointerLock = locked;
    });

    // Canvas click to resume / lock pointer
    this.canvas.addEventListener('click', () => {
      if(this.touchControls?.enabled)return;
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
      this.pointerLockWanted = lock && !this.touchControls?.enabled;
      this.setPaused(false);
      if (this.pointerLockWanted) Promise.resolve(this.canvas.requestPointerLock?.()).catch(() => {});
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
    document.getElementById('btn-close-guide')?.addEventListener('click', () => this.toggleHelp());
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
    const labels = { close: '근접 추적 시점', follow: '기본 3인칭 시점', swing: '원거리 스윙 시점' };
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
    this.setHelpOpen(!this.helpOpen);
  }

  setHelpOpen(open, restoreControls = true) {
    const guide = document.getElementById('controls-guide');
    // A dialog behind a lobby/menu can silently suspend the next solo game.
    if(open && (!guide || !this.isPlaying || this.isPaused || this.contextLost))return;
    const wasSuspended=this.gameplaySuspended,wasOpen=!!this.helpOpen;
    this.helpOpen=open;
    if(guide && guide.classList.contains('hidden')===open)guide.classList.toggle('hidden');
    if(wasSuspended && !this.gameplaySuspended)this.clock?.getDelta();
    if(open){
      this.clearInput();this.speedLines?.setSpeed(0,1);this.audio.setWindSpeed(0);
      const hint=guide.querySelector?.('.guide-hint');
      if(hint)hint.textContent=this.multiplayer?.room?'온라인 경기는 계속 진행됩니다 · H / Esc 닫기':'혼자 플레이 일시정지 · H / Esc 닫기';
      this.helpHadPointerLock=document.pointerLockElement===this.canvas;
      if(this.helpHadPointerLock)document.exitPointerLock?.();
      document.getElementById('btn-close-guide')?.focus?.();
    }else if(wasOpen){
      const relock=this.helpHadPointerLock && this.pointerLockWanted;
      this.helpHadPointerLock=false;
      if(restoreControls && this.isPlaying && !this.isPaused && !this.contextLost){
        this.canvas.focus?.();
        if(relock)Promise.resolve(this.canvas.requestPointerLock?.()).catch(()=>{});
      }
    }
  }

  get gameplaySuspended() { return !!this.helpOpen && !this.multiplayer?.room; }

  togglePause() {
    if (!this.isPlaying) return;
    if(this.worldMap?.isOpen || document.getElementById?.('fullscreen-help')?.open)return;
    this.setPaused(!this.isPaused);
    if (!this.isPaused && this.pointerLockWanted) {
      Promise.resolve(this.canvas.requestPointerLock?.()).catch(() => {});
    }
  }

  async toggleFullscreen() {
    if(this.displayMode)return this.displayMode.toggle();
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else this.showNotice('이 브라우저에서는 전체화면을 사용할 수 없습니다.');
    } catch { this.showNotice('전체화면을 사용할 수 없습니다.'); }
  }

  setPaused(paused) {
    if(!paused && this.contextLost){this.showNotice('그래픽 연결을 복구한 뒤 계속할 수 있습니다.');return;}
    // An interruption after a dialog opens must survive closing that dialog.
    if(paused && this.worldMap?.isOpen)this.worldMap.wasPaused=true;
    if(paused && document.getElementById?.('fullscreen-help')?.open && this.displayMode)this.displayMode.resumeAfterHelp=false;
    this.setHelpOpen(false,false);
    if(!paused){
      // A background tab may receive no animation frames for minutes. Drain
      // that interval before resuming the simulation.
      if(this.isPaused)this.clock?.getDelta();
      this.settingsPanel?.cancel();
    }
    this.isPaused = paused;
    if (paused) {
      if(this.multiplayer?.room?.phase==='playing'){
        this.multiplayer.pendingPunch=null;
        this.combat?.cancel();
      }
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
    if (paused) setTimeout(() => {if(this.isPaused && this.isPlaying)document.getElementById('btn-start-game')?.focus();}, 0);
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
    this.touchControls?.release();
    this.touchHeldKeys?.clear();this.touchKeySources?.clear();this.touchMouseButtons?.clear();this.touchDirections={};
    this.combat?.clearHeld();
    this.heldKeys.clear();
    this.gamepadHeldKeys?.clear();
    this.keyboardKeySources?.clear();this.gamepadKeySources?.clear();
    this.mouseButtons?.clear();this.gamepadMouseButtons?.clear();
    this.sprintLatched=false;this.gamepadDirections={};
    for (const key of Object.keys(this.input)) this.input[key] = key === 'strafe' ? 0 : false;
    this.cameraDragActive = false;
    if (this.physics) this.physics.clearPendingInput();
  }

  syncHeldInput() {
    const held = (...keys) => keys.some(key => this.heldKeys.has(key) || this.gamepadHeldKeys?.has(key) || this.touchHeldKeys?.has(key));
    const pad=this.gamepadDirections||{},touch=this.touchDirections||{};
    this.input.forward = !!pad.forward || !!touch.forward || held('KeyW','ArrowUp');
    this.input.backward = !!pad.backward || !!touch.backward || held('KeyS','ArrowDown');
    this.input.left = !!pad.left || !!touch.left || held('KeyA','ArrowLeft');
    this.input.right = !!pad.right || !!touch.right || held('KeyD','ArrowRight');
    this.input.sprint = !!touch.sprint || (this.preferences?.values.settings.sprintToggle?!!this.sprintLatched:held('ShiftLeft','ShiftRight'));
    this.input.wallRun = held('KeyF');
    this.input.guard = held('KeyB');
    this.input.webZipHeld = held('KeyE') && this.combat?.mode !== 'combat';
    this.input.strafe = Number(this.input.right) - Number(this.input.left);
  }

  showLoadingError(message) {
    if (this.assetsReady && !this.contextLost) { this.showNotice(message); return; }
    this.loadingScreen?.classList.remove('hidden');
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
    if (!pts) this.showNotice(name);
  }

  applyPreferences() {
    const { muted, reducedMotion, quality,settings } = this.preferences.values;
    this.appliedFov=settings.fov;
    Object.assign(this.tpsCamera,{sensitivity:settings.sensitivity,invertY:settings.invertY,baseFov:settings.fov,maxFov:Math.min(95,settings.fov+12),shakeStrength:settings.shake,speedFov:settings.speedFov,followStrength:settings.follow});
    this.physics.aimAssist=false;
    this.physics.softBoundary=true;
    this.audio.configure?.(settings);
    for(const id of ['hud-top-left','minimap-panel','session-hud']){const el=document.getElementById(id);if(el)el.style.scale=String(settings.hudScale);}
    if (this.audio.isMuted !== muted) this.audio.toggleMute();
    const motionButton = document.getElementById('reduced-motion');
    motionButton?.setAttribute('aria-pressed', String(reducedMotion));
    const motionValue = motionButton?.querySelector('.setting-value');
    if (motionValue) motionValue.textContent = reducedMotion ? '켜짐' : '꺼짐';
    document.getElementById('graphics-quality').value = quality;
    this.tpsCamera.reducedMotion = reducedMotion;
    this.city.reducedMotion = reducedMotion;
    document.body.classList.toggle('reduced-motion', reducedMotion);
    if(this.appliedQuality!==quality || this.appliedAutoQuality!==settings.autoQuality){
      const ceiling={ low: 1, balanced: 1.5, high: 2 }[quality] || 1.5;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,ceiling));
      this.experience?.performance.reset(ceiling);
      this.appliedQuality=quality;
      this.appliedAutoQuality=settings.autoQuality;
    }
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.applyWebTheme();
  }

  applyWebTheme() {
    const color=this.progression?.color||0xf4f8ff;
    for(const mesh of [this.character.webMesh,this.character.webMeshOffhand])mesh?.material?.color?.setHex(color);
    for(const line of [this.character.webLine,this.character.webLineOffhand])line?.material?.color?.setHex(color);
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
    this.resetCamera();
    this.showNotice('시작점으로 돌아왔습니다. 계속하기를 눌러 플레이하세요.');
  }

  updateHUD(speedKmh, altitude, state) {
    const combatHud=document.getElementById('combat-status');
    if(combatHud && this.combat){const airborne=!GROUNDED.includes(state);combatHud.textContent=this.multiplayer?.room?'':`${airborne?(this.combat.mode==='combat'?'공중 · 전투 모드':'공중 · 양손 에너지 와이어'):this.combat.mode==='web'?'에너지 와이어 이동':'전투'} · HP ${Math.ceil(this.combat.health)} · 기력 ${Math.ceil(this.combat.stamina)} · ${this.combat.enemies.some(e=>e.windup>0)?'공격 예고! · 방어 / 회피':'모드 '+this.preferences.values.settings.bindings.mode.replace('Key','')}`;combatHud.classList.toggle('hidden',!!this.multiplayer?.room);}
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
        this.webStatusText.textContent = this.physics.webs?.length===2 ? 'DUAL TETHER SWING' : 'SWINGING';
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
        this.webStatusText.textContent = this.combat?.mode==='combat'?'COMBAT READY':'PULSE READY';
        if (this.webStatusDot) this.webStatusDot.className = 'status-dot';
      }
    }
  }

  animate() {
    requestAnimationFrame(this.animate);

    let elapsed = this.clock.getDelta();
    let delta = Math.min(elapsed, 0.1);
    this.frameTime = (this.frameTime || 0) + elapsed;
    this.frameCount = (this.frameCount || 0) + 1;
    if (this.frameTime >= 1) {
      const output = document.getElementById('performance-status');
      if (output) output.textContent = `${Math.round(this.frameCount / this.frameTime)} FPS · ${(this.frameTime * 1000 / this.frameCount).toFixed(1)} ms · P95 ${(this.experience?.performance.p95||0).toFixed(1)} ms`;
      this.frameTime = 0; this.frameCount = 0;
    }

    // Keep streamed city tiles advancing while the start overlay is visible;
    // TilesRenderer performs visibility/LOD work independently of gameplay.
    this.city.update(this.clock.elapsedTime);
    if (!this.assetsReady && this.character.isLoaded &&
        (!(this.city instanceof UrbanGroundCity) || this.city.isReady)) this.onAssetsLoaded();

    const spectating = !!this.multiplayer?.spectating;
    const wasSuspended=!this.isPlaying || this.isPaused || spectating || this.gameplaySuspended;
    this.touchControls?.update();
    this.gamepad?.update(delta);
    // Start can resume from inside this callback after elapsed was read.
    // Begin timing with the next frame in that case, including for quality QA.
    if(wasSuspended && this.isPlaying && !this.isPaused && !spectating && !this.gameplaySuspended)elapsed=delta=0;
    if (this.isPlaying && !this.isPaused && !spectating && !this.gameplaySuspended) {
      if(!this.helpOpen && ['Home','End','PageUp','PageDown'].some(key=>this.heldKeys?.has(key)))
        this.tpsCamera.handleKeyboardLook(this.heldKeys,delta);
      // 1. Update Physics and Character
      this.combat?.before(delta,this.camera,this.input);
      this.physics.update(delta, this.input, this.camera);
      this.combat?.after(delta);
      this.practice?.update(delta);
      // Mouse release owns held input; a temporarily lost anchor can reconnect.

      // 2. Update 3rd Person Follow Camera
      this.tpsCamera.update(
        delta,
        this.physics.renderPosition,
        this.physics.velocity,
        this.physics.isSwinging,
        this.city.getCameraCollisionMeshes?.(this.physics.renderPosition) || this.city.buildingMeshes,
        this.city.raycast?.bind(this.city),
        this.physics.facingAngle,
        this.input
      );
      // 3. Update Visuals & FX
      const speedKmh = this.physics.velocity.length() * 3.6;
      if (this.speedLines) {
        this.speedLines.setSpeed(this.preferences.values.reducedMotion ? 0 : speedKmh*this.preferences.values.settings.speedLines, delta);
      }
      this.vfx.update(delta);
      // 4. Update HUD
      this.updateHUD(speedKmh, this.physics.position.y, this.physics.state);
    }

    this.experience?.update(delta,elapsed);
    this.multiplayer?.update(delta);
    if (this.assetsReady) this.minimap?.update((spectating && this.multiplayer.spectatePoint()) || this.physics.renderPosition,
      this.physics.facingAngle, this.clock.elapsedTime);

    this.worldMap?.update();
    this.hongKongAudit?.update(this.clock.elapsedTime);

    // Render 3D Scene
    if (this.assetsReady && !this.contextLost) this.renderer.render(this.scene, this.camera);

    // Render 2D Speed lines overlay
    if (this.speedLines) {
      this.speedLines.render(this.isPlaying && !this.isPaused && !this.gameplaySuspended ? delta : 0);
    }
  }
}

// Bootstrap application on DOM ready or immediately if document is already ready
function bootstrap() {
  if (import.meta.env?.DEV && new URLSearchParams(location.search).has('motionAuditReview')) {
    import('./MotionAuditReview.js').then(m => m.startMotionAuditReview());
  } else if (import.meta.env?.DEV && new URLSearchParams(location.search).has('traversalPlaytest')) {
    import('./TraversalPlaytest.js').then(m => m.startTraversalPlaytest(GameApp));
  } else if (new URLSearchParams(location.search).has('webHandReview')) {
    import('./WebHandReview.js').then(m => m.startWebHandReview());
  } else if (new URLSearchParams(location.search).has('combatReview')) {
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
