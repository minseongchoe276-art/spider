// Web Audio API Procedural Sound Synthesizer (Zero external audio files required!)
export class SoundController {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.windGain = null;
    this.windFilter = null;
    this.windNode = null;
    this.initialized = false;
    this.slowMoFilter = null;
    this.masterGain = null;
    this.lastWindSpeed = 0;
    this.volumes={effectsVolume:.8,environmentVolume:.55,musicVolume:.35};this.musicClock=0;this.musicNote=0;
  }

  init() {
    if (this.initialized) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.isMuted ? 0 : 1;
    this.masterGain.connect(this.ctx.destination);
    this.effectsGain=this.ctx.createGain();this.environmentGain=this.ctx.createGain();this.musicGain=this.ctx.createGain();
    for(const bus of [this.effectsGain,this.environmentGain,this.musicGain])bus.connect(this.masterGain);
    this.configure(this.volumes);
    this.initWind();
    this.initialized = true;
  }

  ensureContext() {
    if (!this.initialized) {
      try { this.init(); } catch (error) {
        // A partially created context is not usable by the later sound calls.
        // Release it so retrying does not leak devices or route into null buses.
        try { Promise.resolve(this.ctx?.close?.()).catch(()=>{}); } catch {}
        this.ctx=null;this.initialized=false;this.masterGain=null;
        this.effectsGain=this.environmentGain=this.musicGain=null;
        this.windGain=this.windFilter=this.windNode=null;
        console.warn('Audio unavailable; continuing silently:', error);return;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  initWind() {
    if (!this.ctx) return;
    // White noise generator for dynamic high-speed wind whoosh
    const bufferSize = 2 * this.ctx.sampleRate;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 400;
    this.windFilter.Q.value = 1.2;

    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0; // starts silent

    whiteNoise.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.environmentGain);
    whiteNoise.start(0);
    this.windNode = whiteNoise;
  }

  setWindSpeed(speed) {
    this.lastWindSpeed = speed;
    if (!this.initialized || !this.windGain || this.isMuted) return;
    // Speed expected 0 ~ 120+ km/h
    const normalized = Math.min(Math.max((speed - 15) / 60, 0), 1);
    const targetGain = normalized * 0.35;
    const targetFreq = 280 + normalized * 1400;

    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(targetGain, t, 0.08);
    this.windFilter.frequency.setTargetAtTime(targetFreq, t, 0.08);
  }

  // Classic Spider-Man "THWIP!" web shooter sound
  playWebShoot() {
    if (!this.initialized || this.isMuted) return;
    this.ensureContext();
    const t = this.ctx.currentTime;

    // 1. High frequency snap (Noise sweep)
    const dur = 0.14;
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.035));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;

    const nFilter = this.ctx.createBiquadFilter();
    nFilter.type = 'bandpass';
    nFilter.frequency.setValueAtTime(3600, t);
    nFilter.frequency.exponentialRampToValueAtTime(600, t + dur);
    nFilter.Q.setValueAtTime(4.5, t);

    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.45, t);
    nGain.gain.exponentialRampToValueAtTime(0.01, t + dur);

    noise.connect(nFilter);
    nFilter.connect(nGain);
    nGain.connect(this.effectsGain);
    noise.onended=()=>{noise.disconnect();nFilter.disconnect();nGain.disconnect();};
    noise.start(t);
    noise.stop(t + dur);

    // 2. High-speed zip tone
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1800, t);
    osc.frequency.exponentialRampToValueAtTime(260, t + 0.16);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.4, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

    osc.connect(oscGain);
    oscGain.connect(this.effectsGain);
    osc.onended=()=>{osc.disconnect();oscGain.disconnect();};
    osc.start(t);
    osc.stop(t + 0.17);
  }

  // Web release slingshot launch whoosh
  playSlingshotBoost() {
    if (!this.initialized || this.isMuted) return;
    this.ensureContext();
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(750, t + 0.18);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.35);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(gain);
    gain.connect(this.effectsGain);
    osc.onended=()=>{osc.disconnect();gain.disconnect();};
    osc.start(t);
    osc.stop(t + 0.36);
  }

  // Air Trick / Acrobatic Flip whoosh
  playTrickSound() {
    if (!this.initialized || this.isMuted) return;
    this.ensureContext();
    const t = this.ctx.currentTime;

    const osc1 = this.ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(440, t);
    osc1.frequency.exponentialRampToValueAtTime(880, t + 0.12);
    osc1.frequency.exponentialRampToValueAtTime(350, t + 0.28);

    const gain1 = this.ctx.createGain();
    gain1.gain.setValueAtTime(0.3, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

    osc1.connect(gain1);
    gain1.connect(this.effectsGain);
    osc1.onended=()=>{osc1.disconnect();gain1.disconnect();};
    osc1.start(t);
    osc1.stop(t + 0.29);
  }

  playJump() {
    if (!this.initialized || this.isMuted) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(620, t + 0.16);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    osc.connect(gain);
    gain.connect(this.effectsGain);
    osc.onended=()=>{osc.disconnect();gain.disconnect();};
    osc.start(t);
    osc.stop(t + 0.19);
  }

  playLand() {
    if (!this.initialized || this.isMuted) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.16);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

    osc.connect(gain);
    gain.connect(this.effectsGain);
    osc.onended=()=>{osc.disconnect();gain.disconnect();};
    osc.start(t);
    osc.stop(t + 0.17);
  }

  // Checkpoint Ring Collection Chime
  playCheckpointChime() {
    if (!this.initialized || this.isMuted) return;
    this.ensureContext();
    const t = this.ctx.currentTime;

    const notes = [587.33, 880, 1174.66]; // D5, A5, D6 triumphant chord
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + idx * 0.05);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, t + idx * 0.05);
      gain.gain.linearRampToValueAtTime(0.25, t + idx * 0.05 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.05 + 0.35);

      osc.connect(gain);
      gain.connect(this.effectsGain);
      osc.onended=()=>{osc.disconnect();gain.disconnect();};
      osc.start(t + idx * 0.05);
      osc.stop(t + idx * 0.05 + 0.36);
    });
  }

  playCombatHit(heavy=false) {
    if(!this.ctx || this.isMuted)return;
    const t=this.ctx.currentTime,osc=this.ctx.createOscillator(),gain=this.ctx.createGain();
    osc.type='triangle';osc.frequency.setValueAtTime(heavy?100:180,t);osc.frequency.exponentialRampToValueAtTime(45,t+0.1);
    gain.gain.setValueAtTime(0.22,t);gain.gain.exponentialRampToValueAtTime(0.001,t+0.13);
    osc.connect(gain);gain.connect(this.effectsGain);osc.onended=()=>{osc.disconnect();gain.disconnect();};osc.start(t);osc.stop(t+0.14);
  }
  configure(settings) {
    for(const key of ['effectsVolume','environmentVolume','musicVolume'])if(Number.isFinite(settings[key]))this.volumes[key]=Math.max(0,Math.min(1,settings[key]));
    if(!this.ctx)return;
    for(const [bus,key]of [[this.effectsGain,'effectsVolume'],[this.environmentGain,'environmentVolume'],[this.musicGain,'musicVolume']])bus?.gain.setTargetAtTime(this.volumes[key],this.ctx.currentTime,.03);
  }
  tone(frequency,duration=.12,volume=.08,bus=this.effectsGain,type='sine') {
    if(!this.ctx||this.isMuted||this.ctx.state!=='running')return;
    const osc=this.ctx.createOscillator(),gain=this.ctx.createGain(),t=this.ctx.currentTime;
    osc.type=type;osc.frequency.setValueAtTime(frequency,t);gain.gain.setValueAtTime(volume,t);gain.gain.exponentialRampToValueAtTime(.001,t+duration);
    osc.connect(gain);gain.connect(bus||this.masterGain);osc.onended=()=>{osc.disconnect();gain.disconnect();};osc.start(t);osc.stop(t+duration+.01);
  }
  playWebFailure(){this.tone(145,.12,.08,this.effectsGain,'triangle');}
  playSurfaceStep(surface='roof',strength=.4){this.tone(surface==='street'?105:surface==='landing'?65:165,.07,Math.max(.01,strength*.07),this.effectsGain,'triangle');}
  updateMusic(delta,intense=false) {
    if(!this.ctx||this.isMuted||this.volumes.musicVolume<=0)return;
    this.musicClock+=delta;const beat=intense?.32:.65;if(this.musicClock<beat)return;this.musicClock=0;
    const notes=[146.83,220,293.66,196,146.83,246.94,220,196];this.tone(notes[this.musicNote++%notes.length],beat*.85,.035,this.musicGain,'sine');
  }
  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain) this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 1, this.ctx.currentTime, 0.01);
    if (!this.isMuted) this.setWindSpeed(this.lastWindSpeed);
    return this.isMuted;
  }
}
