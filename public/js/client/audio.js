// All sound is synthesised with the Web Audio API: the city's hum (distant
// traffic, wind between the towers), engines that rise with the revs,
// sirens, gunshots, glass and metal, explosions, footsteps, horns, the
// jingles when a job's done, and a late-night radio station in every car.
// (Built on Cinder Peak's sound engine.)

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

class Sound {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.radioLevel = 0.6;
  }

  // must be called from a user gesture
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 5;
    this.master.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    // streets: a short slap off the buildings
    this.verb = ctx.createConvolver();
    const ir = ctx.createBuffer(2, ctx.sampleRate * 1.6, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 4) * 0.5;
    }
    this.verb.buffer = ir;
    this.verbSend = ctx.createGain();
    this.verbSend.gain.value = 0.16;
    this.verbSend.connect(this.verb).connect(this.master);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.sfx.connect(this.verbSend);
    // the walkie and the dispatcher: narrow and crackly
    this.radioBus = ctx.createGain();
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 400;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2800;
    this.radioBus.connect(hp).connect(lp).connect(this.master);
    this.engines = new Map();
    this.sirens = new Map();
    this.buildCity();
    this.buildMusic();
    this.scene = 'title';
  }

  get ready() { return !!this.ctx; }
  get now() { return this.ctx.currentTime; }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.now, 0.05);
  }

  setListener(cam) {
    if (!this.ctx) return;
    const l = this.ctx.listener, p = cam.position;
    const f = cam.getWorldDirection(this._fwd || (this._fwd = cam.position.clone()));
    if (l.positionX) {
      const t = this.now;
      l.positionX.setValueAtTime(p.x, t); l.positionY.setValueAtTime(p.y, t); l.positionZ.setValueAtTime(p.z, t);
      l.forwardX.setValueAtTime(f.x, t); l.forwardY.setValueAtTime(f.y, t); l.forwardZ.setValueAtTime(f.z, t);
      l.upX.setValueAtTime(0, t); l.upY.setValueAtTime(1, t); l.upZ.setValueAtTime(0, t);
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
    this.lx = p.x; this.lz = p.z;
  }

  // ------------------------------------------------------------ helpers --
  src(buf = this.noise, loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = loop;
    return s;
  }
  envelope(gainNode, t, a, peak, dur) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  panner(x, y, z, ref = 2, roll = 1.1) {
    const p = this.ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = roll;
    p.maxDistance = 400;
    this.place(p, x, y, z);
    return p;
  }
  place(p, x, y, z) {
    if (p.positionX) {
      const t = this.now;
      p.positionX.setTargetAtTime(x, t, 0.03); p.positionY.setTargetAtTime(y, t, 0.03); p.positionZ.setTargetAtTime(z, t, 0.03);
    } else p.setPosition(x, y, z);
  }
  // where a one-shot goes: straight to the mix, or placed in the world
  out(pos, ref = 2, roll = 1.1) {
    if (!pos) return this.sfx;
    if (this.lx != null && Math.hypot(pos.x - this.lx, pos.z - this.lz) > 160) return null;
    const p = this.panner(pos.x, pos.y ?? 1.2, pos.z, ref, roll);
    p.connect(this.sfx);
    return p;
  }
  osc(type, f, t, dur, dst, peak, a = 0.005) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    const g = this.ctx.createGain();
    this.envelope(g, t, a, peak, dur);
    o.connect(g).connect(dst);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }
  burst(t, dur, dst, peak, type, freq, q = 1, a = 0.002, buf = this.noise) {
    const n = this.src(buf);
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    this.envelope(g, t, a, peak, dur);
    n.connect(f).connect(g).connect(dst);
    n.start(t, Math.random() * 1.5, dur + 0.05);
    return f;
  }

  // ---------------------------------------------------------- the city
  buildCity() {
    const ctx = this.ctx;
    // distant traffic: brown noise, low and slow
    const mk = (buf, type, f, q, level) => {
      const s = this.src(buf, true);
      const flt = ctx.createBiquadFilter();
      flt.type = type; flt.frequency.value = f; flt.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      s.connect(flt).connect(g).connect(this.master);
      s.start();
      return { g, base: level, flt };
    };
    this.amb = { rumble: mk(this.brown, 'lowpass', 220, 0.7, 0.22), wind: mk(this.noise, 'bandpass', 520, 0.4, 0.015), hiss: mk(this.noise, 'highpass', 5000, 0.5, 0.004) };
    this.timers = { far: 3, dog: 25, siren: 40 };
    // tyres sliding
    const sq = this.src(this.noise, true);
    const sf = ctx.createBiquadFilter();
    sf.type = 'bandpass'; sf.frequency.value = 1800; sf.Q.value = 6;
    this.screechG = ctx.createGain();
    this.screechG.gain.value = 0;
    sq.connect(sf).connect(this.screechG).connect(this.sfx);
    sq.start();
  }

  // 'title', 'city', 'silent'
  setScene(kind, time = 1.5) {
    if (!this.ctx) return;
    this.scene = kind;
    const t = this.now, tc = time / 3;
    const k = kind === 'silent' ? 0 : kind === 'title' ? 0.6 : 1;
    for (const a of Object.values(this.amb)) a.g.gain.setTargetAtTime(a.base * k, t, tc);
  }

  update(dt) {
    if (!this.ctx || this.scene === 'silent') return;
    const T = this.timers;
    // somewhere else in the city: a horn, a dog, a far siren
    T.far -= dt;
    if (T.far <= 0) {
      T.far = 6 + Math.random() * 14;
      const a = Math.random() * Math.PI * 2;
      const pos = { x: (this.lx || 0) + Math.cos(a) * 70, y: 3, z: (this.lz || 0) + Math.sin(a) * 70 };
      if (Math.random() < 0.6) this.horn(pos, 0.25 + Math.random() * 0.4, 0.35); else this.bark(pos);
    }
    T.siren -= dt;
    if (T.siren <= 0) {
      T.siren = 40 + Math.random() * 60;
      const a = Math.random() * Math.PI * 2;
      this.farSiren({ x: (this.lx || 0) + Math.cos(a) * 140, y: 5, z: (this.lz || 0) + Math.sin(a) * 140 });
    }
  }

  // ------------------------------------------------------------- engines
  // one engine voice per car id (the nearest few): rpm 0..1, load 0..1
  engine(id, pos, rpm, load, mine = false) {
    if (!this.ctx) return;
    let E = this.engines.get(id);
    if (!E) {
      const ctx = this.ctx;
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
      o1.type = 'sawtooth'; o2.type = 'square';
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 400; f.Q.value = 2;
      const g = ctx.createGain();
      g.gain.value = 0;
      const p = mine ? null : this.panner(pos.x, 0.6, pos.z, 3, 1.3);
      o1.connect(f); o2.connect(f);
      f.connect(g).connect(p || this.sfx);
      if (p) p.connect(this.sfx);
      o1.start(); o2.start();
      E = { o1, o2, f, g, p, seen: 0 };
      this.engines.set(id, E);
    }
    const t = this.now;
    const base = 32 + rpm * 120;
    E.o1.frequency.setTargetAtTime(base, t, 0.05);
    E.o2.frequency.setTargetAtTime(base * 0.5, t, 0.05);
    E.f.frequency.setTargetAtTime(260 + rpm * 900 + load * 600, t, 0.05);
    E.g.gain.setTargetAtTime((mine ? 0.06 : 0.05) * (0.5 + load * 0.6 + rpm * 0.3), t, 0.05);
    if (E.p) this.place(E.p, pos.x, 0.6, pos.z);
    E.seen = t;
  }
  // engines not updated this frame go quiet (and away)
  sweepEngines() {
    if (!this.ctx) return;
    const t = this.now;
    for (const [id, E] of this.engines) {
      if (t - E.seen > 0.25) {
        E.g.gain.setTargetAtTime(0, t, 0.05);
        if (t - E.seen > 1) { E.o1.stop(); E.o2.stop(); this.engines.delete(id); }
      }
    }
    for (const [id, S] of this.sirens) {
      if (t - S.seen > 0.25) {
        S.g.gain.setTargetAtTime(0, t, 0.05);
        if (t - S.seen > 1) { S.o.stop(); S.lfo.stop(); this.sirens.delete(id); }
      }
    }
  }

  // a police siren on car id
  siren(id, pos) {
    if (!this.ctx) return;
    let S = this.sirens.get(id);
    if (!S) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 900;
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.45;
      const lg = ctx.createGain();
      lg.gain.value = 320;
      lfo.connect(lg).connect(o.frequency);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 2200;
      const g = ctx.createGain();
      g.gain.value = 0;
      const p = this.panner(pos.x, 1.4, pos.z, 6, 1.0);
      o.connect(f).connect(g).connect(p).connect(this.sfx);
      o.start(); lfo.start();
      S = { o, lfo, g, p, seen: 0 };
      this.sirens.set(id, S);
    }
    S.g.gain.setTargetAtTime(0.05, this.now, 0.1);
    this.place(S.p, pos.x, 1.4, pos.z);
    S.seen = this.now;
  }
  farSiren(pos) {
    const t = this.now, dst = this.out(pos, 20, 1);
    if (!dst) return;
    for (let k = 0; k < 6; k++) this.osc('square', k % 2 ? 700 : 950, t + k * 0.55, 0.5, dst, 0.02, 0.05);
  }

  screech(level) {
    if (!this.ctx) return;
    this.screechG.gain.setTargetAtTime(Math.min(0.12, level * 0.12), this.now, 0.05);
  }

  // ------------------------------------------------------------- one-shots
  gun(w, pos, mine = false) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(mine ? null : pos, 6, 0.9);
    if (!dst) return;
    const loud = mine ? 1 : 0.8;
    if (w === 3) {
      this.burst(t, 0.35, dst, 0.9 * loud, 'lowpass', 1600, 0.7, 0.001);
      this.osc('sine', 80, t, 0.25, dst, 0.6 * loud, 0.001).frequency.exponentialRampToValueAtTime(40, t + 0.2);
    } else if (w === 2) {
      this.burst(t, 0.09, dst, 0.55 * loud, 'bandpass', 2200, 0.8, 0.001);
      this.osc('sine', 120, t, 0.07, dst, 0.3 * loud, 0.001);
    } else {
      this.burst(t, 0.16, dst, 0.7 * loud, 'bandpass', 1800, 0.6, 0.001);
      this.osc('sine', 110, t, 0.12, dst, 0.4 * loud, 0.001).frequency.exponentialRampToValueAtTime(60, t + 0.1);
    }
    // the echo between the buildings
    this.burst(t + 0.12, 0.4, dst, 0.08 * loud, 'lowpass', 900, 0.5, 0.02);
  }
  ricochet(pos, kind) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos, 2);
    if (!dst) return;
    if (kind === 3) { this.osc('triangle', 1400 + Math.random() * 800, t, 0.12, dst, 0.08, 0.001); this.burst(t, 0.05, dst, 0.2, 'highpass', 3000, 1); } else this.burst(t, 0.06, dst, 0.12, 'bandpass', 900, 1);
  }
  click() { if (!this.ctx) return; const t = this.now; this.burst(t, 0.03, this.sfx, 0.15, 'highpass', 3000, 2); }
  reload() { if (!this.ctx) return; const t = this.now; this.burst(t, 0.04, this.sfx, 0.2, 'bandpass', 2400, 3); this.burst(t + 0.35, 0.05, this.sfx, 0.25, 'bandpass', 1600, 3); }
  punch(pos, hit) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos, 2);
    if (!dst) return;
    this.burst(t, 0.08, dst, hit ? 0.35 : 0.08, 'lowpass', hit ? 600 : 1500, 1);
    if (hit) this.osc('sine', 90, t, 0.08, dst, 0.3, 0.001);
  }
  crash(pos, n) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos, 5);
    if (!dst) return;
    this.burst(t, 0.4 + n * 0.4, dst, 0.3 + n * 0.6, 'lowpass', 1200, 0.6, 0.001);
    this.osc('sine', 60, t, 0.3, dst, 0.4 * n, 0.001);
    if (n > 0.4) for (let k = 0; k < 6; k++) this.osc('triangle', 2000 + Math.random() * 3000, t + Math.random() * 0.2, 0.15, dst, 0.03, 0.001);
  }
  thud(pos, n) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos, 3);
    if (!dst) return;
    this.osc('sine', 70, t, 0.2, dst, 0.4 * n + 0.1, 0.001);
    this.burst(t, 0.15, dst, 0.2 + n * 0.3, 'lowpass', 500, 1);
  }
  explosion(pos) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos, 12, 0.8);
    if (!dst) return;
    this.burst(t, 2.2, dst, 1.2, 'lowpass', 500, 0.5, 0.002, this.brown);
    this.burst(t, 0.6, dst, 0.8, 'lowpass', 2500, 0.5, 0.001);
    this.osc('sine', 50, t, 1.2, dst, 1.0, 0.002).frequency.exponentialRampToValueAtTime(25, t + 1);
  }
  horn(pos, len = 0.4, loud = 1) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos, 4);
    if (!dst) return;
    this.osc('square', 420, t, len, dst, 0.06 * loud, 0.01);
    this.osc('square', 525, t, len, dst, 0.05 * loud, 0.01);
  }
  bark(pos) {
    const t = this.now, dst = this.out(pos, 6);
    if (!dst) return;
    for (let k = 0; k < 2; k++) { this.burst(t + k * 0.3, 0.12, dst, 0.12, 'bandpass', 700, 2); this.osc('sawtooth', 300, t + k * 0.3, 0.1, dst, 0.03).frequency.exponentialRampToValueAtTime(180, t + k * 0.3 + 0.1); }
  }
  step(pos, run = false) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos, 1.5);
    if (!dst) return;
    this.burst(t, 0.06, dst, run ? 0.22 : 0.14, 'bandpass', 1200 + Math.random() * 400, 1.2, 0.003);
  }
  door() { if (!this.ctx) return; const t = this.now; this.burst(t, 0.12, this.sfx, 0.3, 'lowpass', 700, 1); this.osc('sine', 110, t, 0.1, this.sfx, 0.2, 0.001); }
  alarm(pos) {
    const t = this.now, dst = this.out(pos, 6);
    if (!dst) return;
    for (let k = 0; k < 10; k++) this.osc('square', k % 2 ? 800 : 1100, t + k * 0.22, 0.2, dst, 0.04, 0.01);
  }

  // --------------------------------------------------------------- jingles
  jingle(kind) {
    if (!this.ctx) return;
    const t = this.now;
    const play = (notes, type = 'triangle', step = 0.14, peak = 0.12) => notes.forEach((m, i) => m && this.osc(type, mtof(m), t + i * step, step * 2.2, this.master, peak, 0.01));
    if (kind === 'passed') { play([60, 64, 67, 72, 0, 67, 72], 'square', 0.12, 0.07); play([48, 0, 55, 0, 60], 'triangle', 0.24, 0.12); }
    if (kind === 'failed') play([60, 58, 55, 51], 'square', 0.22, 0.06);
    if (kind === 'missionStart') play([55, 60, 64], 'triangle', 0.12, 0.1);
    if (kind === 'wasted' || kind === 'busted') { this.burst(t, 1.5, this.master, 0.4, 'lowpass', 300, 0.5, 0.01, this.brown); play(kind === 'wasted' ? [48, 47, 46, 45] : [55, 52, 48], 'sawtooth', 0.3, 0.05); }
    if (kind === 'pickup') play([76, 83], 'square', 0.06, 0.05);
    if (kind === 'cash') play([84, 88, 91], 'triangle', 0.05, 0.08);
    if (kind === 'checkpoint') play([79, 84], 'square', 0.07, 0.06);
    if (kind === 'wanted') play([67, 0, 67], 'square', 0.08, 0.05);
    if (kind === 'tape') play([72, 76, 79, 84], 'triangle', 0.1, 0.1);
    if (kind === 'count') play([72], 'square', 0.2, 0.08);
    if (kind === 'go') play([84], 'square', 0.4, 0.1);
  }

  // the dispatcher's squelch before and after
  radio() {
    if (!this.ctx) return;
    const t = this.now;
    this.burst(t, 0.12, this.radioBus, 0.15, 'bandpass', 1800, 0.8);
  }

  // --------------------------------------------------------------- the radio
  // K-NITE 96.1: synth pop for driving at night, made up as it goes along
  buildMusic() {
    const ctx = this.ctx;
    this.music = ctx.createGain();
    this.music.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 3800;
    this.music.connect(lp).connect(this.master);
    this.musicOn = false;
    this.beat = 0;
    this.nextNote = 0;
    this.song = 0;
  }

  setRadio(on) {
    if (!this.ctx) return;
    if (on === this.musicOn) return;
    this.musicOn = on;
    this.music.gain.setTargetAtTime(on ? this.radioLevel * 0.5 : 0, this.now, 0.3);
    if (on && !this.musicTimer) {
      this.nextNote = this.now + 0.1;
      this.musicTimer = setInterval(() => this.sequence(), 100);
    }
    if (!on && this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }
  nextSong() { this.song = (this.song + 1) % 3; this.beat = 0; }

  sequence() {
    const SONGS = [
      { bpm: 104, prog: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], bass: [45, 41, 36, 43], lead: [76, 74, 72, 69, 72, 74, 76, 79] },
      { bpm: 92, prog: [[50, 53, 57], [55, 58, 62], [52, 55, 59], [57, 60, 64]], bass: [38, 43, 40, 45], lead: [69, 72, 74, 72, 69, 67, 69, 0] },
      { bpm: 118, prog: [[52, 55, 59], [48, 52, 55], [50, 53, 57], [47, 50, 54]], bass: [40, 36, 38, 35], lead: [76, 0, 76, 79, 81, 79, 76, 74] },
    ];
    const S = SONGS[this.song];
    const step = 60 / S.bpm / 2;
    while (this.nextNote < this.now + 0.25) {
      const t = this.nextNote, b = this.beat;
      const bar = Math.floor(b / 8) % 4;
      const chord = S.prog[bar];
      if (b % 8 === 0) for (const m of chord) this.pad(mtof(m), t, step * 8);
      this.osc('sawtooth', mtof(S.bass[bar] + (b % 2 ? 12 : 0)), t, step * 0.9, this.music, 0.05, 0.005);
      if (b % 4 === 0) { this.osc('sine', 60, t, 0.18, this.music, 0.35, 0.001).frequency.exponentialRampToValueAtTime(40, t + 0.15); }
      if (b % 4 === 2) this.burst(t, 0.12, this.music, 0.16, 'bandpass', 1800, 0.8);
      this.burst(t, 0.03, this.music, 0.05, 'highpass', 8000, 1);
      if (Math.floor(b / 32) % 2 === 1) { const m = S.lead[b % 8]; if (m) this.osc('square', mtof(m), t, step * 0.8, this.music, 0.025, 0.01); }
      this.nextNote += step;
      this.beat++;
      if (this.beat >= 64 * 3) { this.beat = 0; this.song = (this.song + 1) % 3; }
    }
  }
  pad(f, t, dur) {
    for (const det of [-7, 7]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      const flt = this.ctx.createBiquadFilter();
      flt.type = 'lowpass'; flt.frequency.value = 1100;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.012, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(flt).connect(g).connect(this.music);
      o.start(t); o.stop(t + dur + 0.1);
    }
  }

  quiet() {
    if (!this.ctx) return;
    this.setRadio(false);
    this.screech(0);
    for (const E of this.engines.values()) E.g.gain.setTargetAtTime(0, this.now, 0.05);
    for (const S of this.sirens.values()) S.g.gain.setTargetAtTime(0, this.now, 0.05);
  }
}

export const sound = new Sound();
