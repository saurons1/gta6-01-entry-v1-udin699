// audio.js — all sound is synthesized with WebAudio. No audio files.
// One clear job: engine hum, sirens, gunshots, UI blips, and three procedural
// radio stations (bassline + hats + lead) the player switches with R.

const STATIONS = [
  {
    name: 'VERDE FM',
    bpm: 96, root: 55, // A1
    scale: [0, 3, 5, 7, 10, 12, 15],
    bass: [0, 0, 7, 5, 0, 0, 10, 7],
    lead: [12, -1, 15, 12, -1, 19, 15, 12],
    wave: 'sawtooth', bright: 0.5,
  },
  {
    name: 'OLA 88',
    bpm: 118, root: 65.41, // C2
    scale: [0, 2, 4, 7, 9, 12, 14],
    bass: [0, 0, 0, 7, 0, 5, 7, 9],
    lead: [12, 14, 16, 14, 12, 9, 7, 12],
    wave: 'square', bright: 0.35,
  },
  {
    name: 'NOCHE LO-FI',
    bpm: 72, root: 49, // G1
    scale: [0, 3, 5, 7, 10, 12],
    bass: [0, -1, 10, 7, 0, -1, 5, 3],
    lead: [12, 10, 12, 15, 12, 10, 7, 10],
    wave: 'triangle', bright: 0.8,
  },
];

function midi(root, semitone) {
  return root * Math.pow(2, semitone / 12);
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.muted = false;
    this.station = 0;
    this.musicOn = true;
    this.step = 0;
    this.nextStepTime = 0;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenOn = false;
    this.started = false;
  }

  init() {
    if (this.started) return;
    this.started = true;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.5;
    this.sfxGain.connect(this.master);
    // engine: sawtooth through a lowpass, pitch follows speed
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 50;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    // police siren: two-tone triangle, toggled by wanted level
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 750;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.nextStepTime = this.ctx.currentTime + 0.1;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  setEngine(speedNorm, driving) {
    if (!this.ctx) return;
    const target = driving ? 0.05 + speedNorm * 0.09 : 0.015;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    this.engineOsc.frequency.setTargetAtTime(48 + speedNorm * 150, this.ctx.currentTime, 0.08);
    this.engineFilter.frequency.setTargetAtTime(280 + speedNorm * 900, this.ctx.currentTime, 0.1);
  }

  setSiren(on) {
    if (!this.ctx) return;
    this.sirenOn = on;
    this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx.currentTime, 0.2);
  }

  // Radio step sequencer: call every frame; schedules notes slightly ahead.
  updateMusic() {
    if (!this.ctx || !this.musicOn || this.muted) return;
    const st = STATIONS[this.station];
    const stepDur = 60 / st.bpm / 2; // 8th notes
    while (this.nextStepTime < this.ctx.currentTime + 0.15) {
      const t = this.nextStepTime;
      const s = this.step % 8;
      const bassNote = st.bass[s];
      if (bassNote >= 0) this._note(midi(st.root, bassNote), t, stepDur * 1.8, 'sawtooth', 0.5, 300);
      if (s % 2 === 0) this._hat(t);
      if (s === 0 || s === 4) this._kick(t);
      const leadNote = st.lead[s];
      if (leadNote >= 0 && this.step % 2 === 0) {
        this._note(midi(st.root * 2, leadNote), t, stepDur * 0.9, st.wave, 0.16, 2400);
      }
      this.step++;
      this.nextStepTime += stepDur;
    }
    // siren wail
    if (this.sirenOn && this.sirenOsc) {
      const ph = (this.ctx.currentTime % 1.2) / 1.2;
      this.sirenOsc.frequency.setTargetAtTime(ph < 0.5 ? 720 : 980, this.ctx.currentTime, 0.03);
    }
  }

  _note(freq, t, dur, type, vol, cutoff) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t + dur + 0.05);
  }

  _hat(t) {
    const len = 0.04;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 6000;
    const g = this.ctx.createGain();
    g.gain.value = 0.12;
    src.connect(f); f.connect(g); g.connect(this.musicGain);
    src.start(t);
  }

  _kick(t) {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t + 0.2);
  }

  gunshot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = 0.14;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 2400;
    const g = this.ctx.createGain();
    g.gain.value = 0.8;
    src.connect(f); f.connect(g); g.connect(this.sfxGain);
    src.start(t);
  }

  punch() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.09);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + 0.12);
  }

  crash() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = 0.25;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 900;
    const g = this.ctx.createGain();
    g.gain.value = 0.6;
    src.connect(f); f.connect(g); g.connect(this.sfxGain);
    src.start(t);
  }

  // Short two-tone car horn.
  horn() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [370, 466].forEach((fr) => {
      const o = this.ctx.createOscillator();
      o.type = 'square'; o.frequency.value = fr;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.connect(g); g.connect(this.sfxGain);
      o.start(t); o.stop(t + 0.4);
    });
  }

  cash() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [880, 1174, 1568].forEach((fr, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'triangle'; o.frequency.value = fr;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.07);
      g.gain.linearRampToValueAtTime(0.22, t + i * 0.07 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.25);
      o.connect(g); g.connect(this.sfxGain);
      o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.3);
    });
  }

  blip(freq = 660) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine'; o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + 0.14);
  }

  nextStation() {
    this.station = (this.station + 1) % STATIONS.length;
    this.step = 0;
    return STATIONS[this.station].name;
  }

  stationName() { return STATIONS[this.station].name; }
}
