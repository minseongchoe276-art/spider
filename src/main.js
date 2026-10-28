import {initLobbySelection} from './LobbySelection.js';
import {localMap,mapName} from './MapCatalog.js';
import {initLanguage,t,language} from './I18n.js';
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
// Loaded only for the streamed map; local cities do not download the tile/physics engine.
let UrbanGroundCity;
import { Preferences } from './Preferences.js';
import { HongKongMinimap } from './Minimap.js';
import { Multiplayer } from './Multiplayer.js';
import { GROUNDED } from './MotionCatalog.js';
import {canonicalKey,keyLabel} from './PlayerSettings.js';
import {SettingsPanel} from './SettingsPanel.js';
import {GamepadInput} from './GamepadInput.js';
import {TouchControls} from './TouchControls.js';
import {PlayerExperience} from './PlayerExperience.js';
import {CombatPractice} from './CombatPractice.js';
import {startLoadingStatus} from './LoadingStatus.js';
import {HudLayout} from './HudLayout.js';
import {COMBAT_GROUND_STATES} from './AttackRules.js';
import {AmbientCitizens,AMBIENT_COUNTS} from './AmbientCitizens.js';
import {VehicleSystem} from './VehicleSystem.js';
import {abilitySlotState,updateVitalsHud} from './VitalsHud.js';
let stopLoadingStatus=()=>{};

const ONE_SHOT_KEYS = new Set(['Space','KeyG','KeyE','KeyT','KeyR','KeyC','KeyX','KeyV','KeyQ','KeyB','ControlLeft','ControlRight']);

export class GameApp {
  constructor() {
    const entry=new URL(location.href),soloEntry=entry.searchParams.get('play')==='solo';
    if(soloEntry){entry.searchParams.delete('play');history.replaceState(null,'',entry.pathname+entry.search+entry.hash);}
    initLanguage();
    initCitySelection();
    initLobbySelection();
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
    this.hudLayout=new HudLayout(container);
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
    if(soloEntry)queueMicrotask(()=>this.multiplayer.beginSolo());

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
    this.scene.fog = new THREE.FogExp2(0xaed9eb, 0.00032);

    // Camera
    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.2, 1200);

    // Lighting
    const localCity=selectedCity(location.search)!=='hong-kong';
    const profile=localMap(selectedCity(location.search));
    if(localCity){this.scene.background.setHex(profile.sky);this.scene.fog.color.setHex(profile.sky);}
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
      color: localCity?profile.sky:0x9bd5f0,
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
    this.hudLayout?.schedule();
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
      : new City(this.scene,selectedCity(location.search));

    if (!useUrbanGround) {
      const subtitle = document.querySelector('.badge-sub');
      if (subtitle) subtitle.textContent = `${this.city.profile.en.toUpperCase()} · SHADOW PULSE`;
      const lobbyEdition = document.querySelector('.lobby-edition');
      if (lobbyEdition) lobbyEdition.textContent = `${this.city.profile.en.toUpperCase()} · OPEN WORLD`;
      const district = document.querySelector('.hud-district');
      if (district) district.textContent = mapName(this.city.mapId||'procedural',language());
      const lobbyDescription = document.querySelector('.lobby-hero > p');
      if (lobbyDescription) lobbyDescription.textContent = t('지도를 고르고 탐험을 시작하세요.');
      const heading = document.querySelector('#overlay-click-to-play h2');
      if (heading) heading.textContent = mapName(this.city.mapId||'procedural',language());
      const footer = document.querySelector('.lobby-footer span:first-child');
      if (footer) footer.textContent = `SHADOW PULSE · ${mapName(this.city.mapId||'procedural',language())}`;
      const credit = document.querySelector('.data-credit');
      if (credit) {
        credit.replaceChildren(document.createTextNode('도시 데이터: 절차 생성 로컬 도시'),document.createElement('br'));
        const link = document.createElement('a');link.href = `?city=hong-kong&lang=${language()}`;link.textContent = '홍콩 도시로 플레이';credit.append(link);
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
    this.combat=new CombatSystem(this.scene,this.physics,this.character,{vfx:this.vfx,audio:this.audio,onNotice:message=>this.showNotice(message),getBindings:()=>this.preferences.values.settings.bindings,onImpact:strength=>this.tpsCamera?.triggerShake?.(strength)});
    // Hong Kong keeps the streamed sidewalk walk. Local maps reuse that same
    // population on their footpath graph. Counts follow the walkable network,
    // not one number pasted onto every map.
    const ambientMax=AMBIENT_COUNTS[useUrbanGround?'hong-kong':this.city.mapId]??6;
    this.citizens=new AmbientCitizens({scene:this.scene,city:this.city,player:this.physics,camera:this.camera,max:ambientMax,onNotice:message=>this.showNotice(message),onPlayerHit:(amount,n)=>{if(this.vehicle?.driving)return;this.combat.receiveDamage(amount,n);this.audio?.playCombatHit?.(false);},onError:error=>console.warn('Citizen assets unavailable',error)});
    this.combat.getTargets=()=>[...this.combat.enemies,...this.citizens.targets];
    this.combat.onDeferredStrike=()=>this.multiplayer?.attack('punch');
    this.physics.onWebAttach=anchor=>this.vfx.spawnWebImpact(anchor);
    this.physics.onLanding = (position, impact, surfaceNormal) => {
      if(impact>14)this.citizens?.alarm(position,Math.min(18,impact*.6));
      if (this.vfx?.spawnLandingShockwave) {
        this.vfx.spawnLandingShockwave(position, impact, surfaceNormal);
      } else if (impact > 7) {
        this.vfx?.spawnLandingDust(position);
      }
      // Landing impact is conveyed by animation, sound and ground VFX.
      // Random camera offsets on every landing made ordinary movement jitter.
    };
    this.tpsCamera = new ThirdPersonCamera(this.camera, this.canvas);
    this.vehicle=new VehicleSystem({scene:this.scene,city:this.city,physics:this.physics,character:this.character,cameraRig:this.tpsCamera,combat:this.combat,onControlReset:()=>this.clearInput(),onNotice:message=>this.showNotice(message),allowed:()=>!this.multiplayer?.spectating&&(!this.multiplayer?.room||this.multiplayer.room.phase==='playing'),getOtherVehicles:()=>this.multiplayer?.players?.filter(p=>p.id!==this.multiplayer.id&&!p.eliminated).map(p=>p.vehicle).filter(Boolean)||[],getCitizens:()=>this.citizens?.targets||[]});
    if(this.citizens)this.citizens.obstacleRay=(origin,direction,distance)=>this.vehicle.blocksRay(origin,direction,distance);
    this.worldMap = new WorldMap(this);
    this.hongKongAudit=createHongKongAudit(this);
    if(import.meta.env?.DEV && typeof location!=='undefined' && new URLSearchParams(location.search).has('qualityDirector') && (location.hostname==='127.0.0.1' || location.hostname==='localhost')){
      this.qualityDirector=null;
      import('./QualityDirector.js').then(module=>module.attachQualityDirector(this)).catch(error=>console.error(error));
    }
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
      objective: () => this.multiplayer?.solo&&!this.practice?.active?this.experience?.journey?.target:null,
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

    // Start on a supported roof facing this district’s landmark.
    const bounds = document.getElementById('world-limit');
    if (bounds) bounds.textContent = `구역 원점 기준 ±${this.city.playableHalfExtent || 2400}m`;
    const spawn = this.city.getRooftopSpawn(95);
    this.physics.position.copy(spawn);
    this.physics.previousFixedPosition.copy(spawn);
    this.physics.renderPosition.copy(spawn);
    this.physics.velocity.set(0, 0, 0);
    this.physics.state = 'IDLE';
    this.physics.facingAngle=this.city.getSpawnFacing?.(spawn)||0;
    this.character.targetFacingAngle=this.physics.facingAngle;
    this.character.visualYaw=this.physics.facingAngle;
    this.tpsCamera.placeBehind(spawn, this.physics.facingAngle,this.city.mapId&&this.city.mapId!=='procedural'?.48:.16);
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
    if (this.city.isStreamed && !this.city.isReady) {
      this.updateLoadingProgress(75, '홍콩 도시의 건물·도로와 충돌 지형을 준비 중...');
      return;
    }
    if (this.assetsReady) return;
    this.assetsReady = true;
    stopLoadingStatus();
    this.loadingScreen?.setAttribute('data-ready-ms', String(Math.round(performance.now())));
    this.loadingScreen?.setAttribute('data-character-ready-ms', String(Math.round(this.character.readyMilliseconds || 0)));
    this.loadingScreen?.setAttribute('data-city-ready-ms', String(Math.round(this.city.readyAt || 0)));
    this.readyMilliseconds=performance.now()-this.startupAt;
    if (this.city.isStreamed) {
      this.physics.resetPosition();
      this.resetCamera();
    }
    this.updateLoadingProgress(100, this.character.loadWarning || '준비 완료!');
    if (this.character.loadWarning) this.showNotice(this.character.loadWarning);
    document.getElementById('loading-recovery')?.classList.add('hidden');
    setTimeout(() => {
      if (this.loadingScreen && !this.contextLost) {
        this.loadingScreen.classList.add('hidden');
        globalThis.CrazyGames?.SDK?.game?.gameplayStart?.();
      }
    }, 400);
  }

  initInputListeners() {
    // HUD actions use the same remappable event path as keyboard and touch.
    for(const button of (document.querySelectorAll?.('#ability-bar button') || [])){
      const send=down=>{
        const action=['wall','guard'].includes(button.dataset.ability)?'wall':button.dataset.ability;
        const code=action==='special'?'KeyG':this.preferences?.values.settings?.bindings?.[action];
        if(!code)return;
        const event=new KeyboardEvent(down?'keydown':'keyup',{code,bubbles:true});
        Object.defineProperty(event,'touchInput',{value:true});window.dispatchEvent(event);
      };
      button.addEventListener('pointerdown',event=>{
        if(button.disabled)return;event.preventDefault();button.setPointerCapture(event.pointerId);send(true);
        if(!['wall','guard'].includes(button.dataset.ability))send(false);
      });
      button.addEventListener('pointerup',()=>send(false));
      button.addEventListener('pointercancel',()=>send(false));
      button.addEventListener('lostpointercapture',()=>send(false));
      button.addEventListener('click',event=>{if(event.detail===0){send(true);send(false);}});
    }
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
        'KeyG', 'KeyE', 'KeyT', 'KeyR', 'KeyF', 'KeyC', 'KeyX', 'KeyV', 'KeyQ', 'KeyB', 'ControlLeft', 'ControlRight'
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
      if(k==='KeyB'){this.vehicle?.interact();return;}
      if(this.vehicle?.driving && !['KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','Space','Escape','KeyM','KeyH'].includes(k))return;
      if(k==='KeyQ'){
        if(this.multiplayer?.locksCombatToggle()){this.showNotice('도망자는 에너지 와이어로만 이동합니다.');return;}
        this.combat.toggle(this.input);this.syncHeldInput();return;
      }
      // Retired procedural Ctrl evasion: never starts a pose or consumes stamina.
      if(k==='ControlLeft'||k==='ControlRight')return;
      if (!e.repeat && k === 'KeyX') {
        this.tpsCamera.recenterBehind(this.physics.facingAngle);
      }
      if (!e.repeat && k === 'KeyV') {
        const mode = this.tpsCamera.cycleMode();
        this.showCameraMode(mode);
      }
      if(this.vehicle?.driving && k==='Space')return;
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
      if(k==='KeyR'){
        this.physics.performAirTrick(Math.random() < .5 ? 'front' : 'back');
        return;
      }
      if(k==='KeyG' && this.combat?.mode==='combat'){if(this.combat.special(this.camera))this.multiplayer?.attack('punch');return;}
      if (k === 'KeyF' && this.combat?.mode==='combat') this.combat.guard(true);
      if (k === 'KeyE') {
        if (this.combat?.mode==='combat') {
          if (this.combat.heavy(this.camera)) this.multiplayer?.attack('punch');
        } else this.physics.performAirJump(this.camera, this.physics.webAimNdc);
      }
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
      if(k==='KeyF' && !this.heldKeys.has(k) && !this.gamepadHeldKeys?.has(k) && !this.touchHeldKeys?.has(k))this.combat?.guard(false);
      this.syncHeldInput();
      // Jump is a one-shot request consumed by physics, not a held button.
      // Clearing it on keyup loses taps completed between two render frames.
    });

    // Mouse Buttons
    window.addEventListener('mousedown', (e) => {
      if (e.sourceCapabilities?.firesTouchEvents || this.vehicle?.driving) return;
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
        if(!e.touchTraversal && this.multiplayer?.attack('web'))return;
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
        if(!e.touchTraversal && this.multiplayer?.attack('web','right'))return;
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
    document.body?.classList?.toggle('help-open',!!open);
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
      globalThis.CrazyGames?.SDK?.game?.gameplayStart?.();
    }
    this.isPaused = paused;
    if (paused) {
      globalThis.CrazyGames?.SDK?.game?.gameplayStop?.();
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
    this.input.wallRun = this.combat?.mode !== 'combat' && held('KeyF');
    this.input.guard = this.combat?.mode === 'combat' && held('KeyF');
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
    notice.textContent = t(message);
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
    document.body.classList.toggle('show-performance',!!settings.showPerformance);
    this.physics.aimAssist=false;
    this.physics.softBoundary=true;
    this.audio.configure?.(settings);
    for(const id of ['hud-top-left','alt-readout','minimap-panel','session-hud']){const el=document.getElementById(id);if(el)el.style.scale=String(settings.hudScale);}
    this.hudLayout?.schedule();
    if (this.audio.isMuted !== muted) this.audio.toggleMute();
    const motionButton = document.getElementById('reduced-motion');
    motionButton?.setAttribute('aria-pressed', String(reducedMotion));
    const motionValue = motionButton?.querySelector('.setting-value');
    if (motionValue) motionValue.textContent = reducedMotion ? '켜짐' : '꺼짐';
    document.getElementById('graphics-quality').value = quality;
    this.tpsCamera.reducedMotion = reducedMotion;
    this.vfx.reducedMotion = reducedMotion;
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
    const pitch = this.touchControls?.enabled ? 0.12 : (this.city.mapId&&this.city.mapId!=='procedural' ? 0.48 : 0.16);
    this.tpsCamera.placeBehind(this.physics.position,this.physics.facingAngle,pitch);
    this.camera.position.copy(this.tpsCamera.currentPos);
    this.camera.lookAt(this.tpsCamera.lookAtTarget);
    this.camera.updateMatrixWorld(true);
  }

  restartGame() {
    if (this.multiplayer?.room) return;
    this.clearInput();
    if(this.vehicle?.driving){this.vehicle.exitPoint=this.city.getRooftopSpawn();this.vehicle.finishExit();}
    this.physics.resetPosition();
    this.resetCamera();
    this.showNotice('시작점으로 돌아왔습니다. 계속하기를 눌러 플레이하세요.');
  }

  syncHudChrome() {
    const admin=document.getElementById('admin-overlay');
    const lobby=document.getElementById('online-overlay');
    const covered=!!(this.isPaused || this.helpOpen || this.worldMap?.isOpen || (admin && !admin.classList.contains('hidden')) || (lobby && !lobby.classList.contains('hidden')));
    document.body?.classList?.toggle('hud-covered', covered);
    document.body?.classList?.toggle('help-open', !!this.helpOpen);
  }

  updateVitals() {
    const combatHud=document.getElementById('combat-status');
    if(combatHud && this.combat){
      const room=this.multiplayer?.room;
      const me=room?this.multiplayer.players?.find(p=>p.id===this.multiplayer.id):null;
      const health=me?.health??this.combat.health;
      const spectating=!!(this.multiplayer?.spectating || me?.eliminated);
      const playing=!!this.isPlaying && !this.isPaused;
      const wire=this.combat.mode==='web' && !spectating;
      const fighting=!!(this.practice?.active || this.combat.mode==='combat') && !spectating;
      const visible=playing && (wire || fighting || spectating || health<100 || (!!room && ['tag','custom'].includes(room.mode)));
      updateVitalsHud(combatHud,{health,stamina:this.combat.stamina,mode:me?.eliminated?'spectating':this.vehicle?.driving?'driving':this.combat.mode,
        warning:!this.vehicle?.driving&&this.combat.enemies.some(e=>e.windup>0),visible,translate:t});
      document.body?.classList?.toggle('combat-hud-active',fighting && playing);
      document.body?.classList?.toggle('wire-hud',wire && playing);
      document.body?.classList?.toggle('skills-hud',playing && !spectating);
      document.body?.classList?.toggle('vitals-active',visible);
      document.body?.classList?.toggle('hud-low',health<=25 && playing);
      this.updateAbilityBar();
    }
  }

  updateAbilityBar() {
    const bar=document.getElementById('ability-bar');
    if(!bar || !this.combat)return;
    const bindings=this.preferences?.values?.settings?.bindings;
    const pad=this.gamepad?.lastPad!=null && !this.touchControls?.enabled;
    const padLabel={mode:'Y',zip:'X',wall:'LB',guard:'LB'};
    for(const slot of bar.querySelectorAll('kbd[data-key]')){
      const label=pad?padLabel[slot.dataset.key]:bindings?keyLabel(bindings[slot.dataset.key]):'';
      if(label && slot.textContent!==label)slot.textContent=label;
    }
    const slots=abilitySlotState({
      mode:this.combat.mode,
      locked:!!this.multiplayer?.locksCombatToggle?.(),
      grounded:GROUNDED.includes(this.physics?.state),
      stamina:this.combat.stamina,
      strikeGround:COMBAT_GROUND_STATES.includes(this.physics?.state),
      busy:!!this.combat.action,blocking:!!this.combat.blocking,
      zipBlocked:this.physics?.state==='MANTLING',
      specialCooldown:this.combat.specialCooldown,
      zipCooling:(this.physics?.zipCooldown||0)>0 || this.physics?.state==='WEB_ZIP',
    });
    if(bar.dataset.mode!==slots.mode)bar.dataset.mode=slots.mode;
    if(bar.getAttribute('aria-label')!==slots.label)bar.setAttribute('aria-label',slots.label);
    for(const [name,flags] of Object.entries(slots.slots)){
      const slot=bar.querySelector(`[data-ability="${name}"]`);
      if(!slot)continue;
      const labels={special:`돌진 어퍼컷 · G · 기력 35${this.combat.specialCooldown>0?' · '+this.combat.specialCooldown.toFixed(1)+'초 대기':''}`,mode:slots.mode==='web'?'전투 모드로 전환':'와이어 모드로 전환',zip:slots.mode==='web'?'공중 와이어 집':'훅 · 기력 18',wall:'벽 타기 · 누르고 이동',guard:'방어 · 누르고 유지'};
      if(name==='special'){const remaining=slot.querySelector('.ability-cooldown');if(remaining)remaining.textContent=this.combat.specialCooldown>0?Math.ceil(this.combat.specialCooldown)+'s':'';}
      slot.title=t(labels[name]);slot.setAttribute('aria-label',t(labels[name]));
      slot.hidden=(name==='special' && slots.mode==='web') || (name==='guard' && slots.mode==='web') || (name==='wall' && slots.mode==='combat');
      slot.disabled=!!(flags.unavailable || flags.dry || flags.cooling);
      slot.classList.toggle('is-active',flags.active);
      slot.classList.toggle('is-unavailable',flags.unavailable);
      slot.classList.toggle('is-dry',flags.dry);
      slot.classList.toggle('is-cooling',flags.cooling);
    }
  }

  updateWorldMarker() {
    const node=document.getElementById('world-marker');
    if(!node)return;
    const playing=this.isPlaying && !this.isPaused && !this.gameplaySuspended && !this.multiplayer?.spectating;
    const journey=this.multiplayer?.solo && !this.practice?.active ? this.experience?.journey?.target : null;
    const goal=!journey && this.multiplayer?.goalLive ? this.multiplayer.goalMarker?.position : null;
    const source=journey||goal;
    if(!playing || !source || !this.camera || !this.physics?.position){node.hidden=true;node.classList.remove('is-edge');return;}
    const point=this._markerPoint||(this._markerPoint=new THREE.Vector3());
    point.set(source.x,source.y+(goal?0:2.6),source.z);
    const flat=this._markerFlat||(this._markerFlat=new THREE.Vector3());
    flat.set(source.x,source.y,source.z);
    const dist=this.physics.position.distanceTo(flat);
    const fade=THREE.MathUtils.smoothstep(dist,14,32);
    if(!Number.isFinite(dist) || fade<0.04){node.hidden=true;node.classList.remove('is-edge');return;}
    const projected=this._markerProjected||(this._markerProjected=new THREE.Vector3());
    projected.copy(point).project(this.camera);
    if(!Number.isFinite(projected.x) || !Number.isFinite(projected.y) || !Number.isFinite(projected.z)){node.hidden=true;node.classList.remove('is-edge');return;}
    const view=this.renderer?.domElement;
    const w=view?.clientWidth||window.innerWidth,h=view?.clientHeight||window.innerHeight;
    const margin=64;
    let sx=projected.x,sy=projected.y;
    if(projected.z>1){sx=-sx;sy=-sy;}
    const maxX=Math.max(0.35,1-(margin*2)/Math.max(w,1));
    const maxY=Math.max(0.35,1-(margin*2)/Math.max(h,1));
    const ax=Math.abs(sx)/maxX,ay=Math.abs(sy)/maxY;
    const edge=projected.z>1 || ax>1 || ay>1;
    if(edge){const scale=1/Math.max(ax,ay,1e-4);sx*=scale;sy*=scale;}
    const left=(sx*0.5+0.5)*w,top=(-sy*0.5+0.5)*h;
    node.hidden=false;
    node.classList.toggle('is-edge',edge);
    node.style.setProperty('--aim',`${Math.atan2(top-h/2,left-w/2)}rad`);
    node.style.left=`${left}px`;
    node.style.top=`${top}px`;
    node.style.opacity=fade.toFixed(2);
    const label=node.querySelector('b');
    const text=`${Math.round(dist)} m`;
    if(label && label.textContent!==text)label.textContent=text;
  }

  updateHUD(speedKmh, altitude, state) {
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
        this.webStatusText.textContent = this.physics.webs?.length===2 ? t('양손 스윙') : t('스윙 중');
        if (this.webStatusDot) this.webStatusDot.className = 'status-dot swinging';
      } else if (state === 'WALL_RUNNING') {
        this.webStatusText.textContent = t('벽 이동');
        if (this.webStatusDot) this.webStatusDot.className = 'status-dot';
      } else if (state === 'FALLING') {
        this.webStatusText.textContent = this.physics.velocity.y < -12 ? t('급강하') : t('공중');
        if (this.webStatusDot) this.webStatusDot.className = 'status-dot';
      } else if (['WEB_ZIP','LANDING','ROLLING','TURNING','JUMPING','MANTLING'].includes(state)) {
        this.webStatusText.textContent = t({WEB_ZIP:'와이어 당기기',LANDING:'착지',ROLLING:'구르기',TURNING:'방향 전환',JUMPING:'점프',MANTLING:'턱 오르기'}[state]);
        if (this.webStatusDot) this.webStatusDot.className = 'status-dot';
      } else {
        this.webStatusText.textContent = this.combat?.mode==='combat'?t('전투 준비'):t('와이어 준비');
        if (this.webStatusDot) this.webStatusDot.className = 'status-dot';
      }
    }
    const heldWeb=(this.physics?.webs?.length||0)>0 || state==='WEB_ZIP';
    document.body?.classList?.toggle('hud-swing', state === 'SWINGING' || state === 'WEB_ZIP' || speedKmh >= 55);
    document.body?.classList?.toggle('hud-web', heldWeb);
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
        (!(this.city.isStreamed) || this.city.isReady)) this.onAssetsLoaded();

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
      if(!this.vehicle?.driving){
        this.combat?.before(delta,this.camera,this.input);
        this.physics.update(delta, this.input, this.camera);
        this.combat?.after(delta);
        this.practice?.update(delta);
      }
      this.vehicle?.update(delta,{...this.input,jump:!!(this.heldKeys?.has('Space')||this.touchHeldKeys?.has('Space')||this.gamepadHeldKeys?.has('Space'))});
      this.vehicle?.resolvePedestrian();
      // Mouse release owns held input; a temporarily lost anchor can reconnect.

      // 2. Update 3rd Person Follow Camera
      this.tpsCamera.stanceDrop=this.vehicle?.driving?0:.44*(this.character?.crouchWeight || 0);
      const strike=this.combat?.action;
      // 0.72 rad sits the boom on the character's right during a grounded punch.
      // Web swing, driving, and the special dash do not take this path.
      this.tpsCamera.strikeOrbit=!this.vehicle?.driving && !this.physics.isSwinging && this.combat?.mode==='combat' && strike && ['jab','cross','heavy'].includes(strike.key) ? 0.72 : 0;
      this.tpsCamera.update(
        delta,
        this.vehicle?.driving?this.vehicle.cameraTarget:this.physics.renderPosition,
        this.physics.velocity,
        this.physics.isSwinging,
        this.city.getCameraCollisionMeshes?.(this.physics.renderPosition) || this.city.buildingMeshes,
        this.city.raycast?.bind(this.city),
        this.physics.facingAngle,
        this.vehicle?.driving?{forward:true}:this.input
      );
      if(import.meta.env?.DEV) this.qualityDirector?.sample(delta);
      this.citizens?.update(delta);
      // 3. Update Visuals & FX
      const speedKmh = this.physics.velocity.length() * 3.6;
      if (this.speedLines) {
        this.speedLines.setSpeed(this.preferences.values.reducedMotion ? 0 : speedKmh*this.preferences.values.settings.speedLines, delta);
      }
      this.vfx.update(delta);
      // 4. Update HUD
      this.updateHUD(speedKmh, this.physics.position.y, this.physics.state);
    } else {
      this.vehicle?.update(0,{},false);
      document.body?.classList?.toggle('hud-swing', false);
      document.body?.classList?.toggle('hud-web', false);
    }

    this.experience?.update(delta,elapsed);
    this.multiplayer?.update(delta);
    this.updateVitals();
    this.updateWorldMarker();
    this.syncHudChrome();
    if (this.assetsReady) this.minimap?.update((spectating && this.multiplayer.spectatePoint()) || this.physics.renderPosition,
      this.physics.facingAngle, this.clock.elapsedTime);

    this.worldMap?.update();
    this.hongKongAudit?.update(this.clock.elapsedTime);

    // Render 3D Scene
    if(this.character?.model)this.character.model.visible=this.vehicle?.driving||!this.tpsCamera?.localAvatarOccluded;
    if (this.assetsReady && !this.contextLost && !globalThis.document?.hidden) {
      const interactive=this.isPlaying&&!this.isPaused&&!this.gameplaySuspended;
      const now=performance.now();
      if(interactive||spectating||now-(this.lastIdleRender||0)>=100){this.renderer.render(this.scene,this.camera);this.lastIdleRender=now;}
    }

    // Render 2D Speed lines overlay
    if (this.speedLines) {
      this.speedLines.render(this.isPlaying && !this.isPaused && !this.gameplaySuspended ? delta : 0);
    }
  }
}

// Bootstrap application on DOM ready or immediately if document is already ready
async function bootstrap() {
  if (import.meta.env?.DEV && new URLSearchParams(location.search).has('motionAuditReview')) {
    import('./MotionAuditReview.js').then(m => m.startMotionAuditReview());
  } else if (import.meta.env?.DEV && new URLSearchParams(location.search).has('traversalPlaytest')) {
    import('./TraversalPlaytest.js').then(async m => {
      if(selectedCity(location.search)==='hong-kong')({UrbanGroundCity}=await import('./UrbanGroundCity.js'));
      m.startTraversalPlaytest(GameApp);
    });
  } else if (new URLSearchParams(location.search).has('webHandReview')) {
    import('./WebHandReview.js').then(m => m.startWebHandReview());
  } else if (new URLSearchParams(location.search).has('combatReview')) {
    import('./CombatReview.js').then(m => m.startCombatReview());
  } else if (new URLSearchParams(location.search).has('effectsReview')) {
    import('./EffectsReview.js').then(m => m.startEffectsReview());
  } else if (new URLSearchParams(location.search).has('motionReview')) {
    import('./MotionReview.js').then(m => m.startMotionReview());
  } else {
    stopLoadingStatus=startLoadingStatus(selectedCity(location.search)==='hong-kong');
    try {
      if(selectedCity(location.search)==='hong-kong')({UrbanGroundCity}=await import('./UrbanGroundCity.js'));
      new GameApp();
    }catch(error){
      console.error(error);
      const message=document.getElementById('loading-desc');if(message)message.textContent=t('도시 엔진을 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도하세요.');
      document.getElementById('loading-recovery')?.classList.remove('hidden');
      document.getElementById('btn-retry-load')?.addEventListener('click',()=>location.reload());
    }
  }
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
}
