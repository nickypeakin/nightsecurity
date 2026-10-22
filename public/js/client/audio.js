// All sound is synthesised with the Web Audio API: the air handlers and
// the fluorescent buzz of an empty mall, the PA's easy-listening tape (and
// what it turns into), the carousel's waltz, footsteps on terrazzo and
// carpet and tile, roll-down gates, padlocks, steel doors, the clock
// stations, the walkie, the breakers, keys jingling somewhere you can't
// see, plastic creaking in the dark, your heartbeat, and a low drone under
// all of it. (Built on Cinder Peak's sound engine, with the hum and muzak
// from The Backrooms.)

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

class Sound {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.tension = 0;
    this.env = { lit: 1, room: 'big' };
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
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }

    // a big hard room: a long, bright reverb
    this.verb = ctx.createConvolver();
    const ir = ctx.createBuffer(2, ctx.sampleRate * 2.8, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3.2) * 0.5;
    }
    this.verb.buffer = ir;
    this.verbSend = ctx.createGain();
    this.verbSend.gain.value = 0.22;
    this.verbSend.connect(this.verb).connect(this.master);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.sfx.connect(this.verbSend);
    // what you hear over the walkie: narrow, crackly
    this.radioBus = ctx.createGain();
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 400;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2800;
    this.radioBus.connect(hp).connect(lp).connect(this.master);

    this.loops = new Map();
    this.buildAmbience();
    this.buildHum();
    this.buildMuzak();
    this.buildDrone();
    this.timers = { far: 20, drip: 8 };
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

  panner(x, y, z, ref = 1.5, roll = 1.2) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = roll;
    p.maxDistance = 300;
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
  out(pos, ref = 1.5, roll = 1.2) {
    if (!pos) return this.sfx;
    const p = this.panner(pos.x, pos.y ?? 1.4, pos.z, ref, roll);
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

  // ---------------------------------------------------------- ambience --
  buildAmbience() {
    const ctx = this.ctx;
    const mk = (buf, type, freq, q, gain) => {
      const s = this.src(buf, true);
      const f = ctx.createBiquadFilter();
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      s.connect(f).connect(g).connect(this.master);
      s.start(0, Math.random() * 1.5);
      return { g, f, base: gain };
    };
    this.amb = {
      air: mk(this.brown, 'lowpass', 180, 0.7, 0.22),        // the air handlers on the roof
      hiss: mk(this.noise, 'bandpass', 900, 0.4, 0.008),      // air through the vents
      wind: mk(this.noise, 'bandpass', 420, 0.8, 0.0),        // wind past the doors
    };
    this.ambLevel = 0;
  }

  // the fluorescent buzz: louder when the lights are on and you're under them
  buildHum() {
    const ctx = this.ctx;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    this.humGain.connect(this.master);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    lp.connect(this.humGain);
    for (const [f, type, g] of [[120, 'sawtooth', 0.04], [240, 'sine', 0.025], [119.4, 'sawtooth', 0.02], [360, 'sine', 0.006]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const gg = ctx.createGain();
      gg.gain.value = g;
      o.connect(gg).connect(lp);
      o.start();
    }
  }

  // easy listening on the PA, from the tape that's been in the deck since 1989
  buildMuzak() {
    const ctx = this.ctx;
    this.muzakGain = ctx.createGain();
    this.muzakGain.gain.value = 0;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 260;
    this.muzakLP = ctx.createBiquadFilter();
    this.muzakLP.type = 'lowpass';
    this.muzakLP.frequency.value = 2600;
    this.muzakBus = ctx.createGain();
    this.muzakBus.connect(hp).connect(this.muzakLP).connect(this.muzakGain).connect(this.master);
    this.muzakGain.connect(this.verbSend);
    this.muzakOn = false;
    this.muzakDetune = 0;
  }

  startMuzak(level = 0.5, warped = false) {
    if (!this.ctx) return;
    this.muzakDetune = warped ? -220 : 0;
    this.muzakLP.frequency.setTargetAtTime(warped ? 900 : 2600, this.now, 0.4);
    this.muzakGain.gain.setTargetAtTime(level, this.now, 0.5);
    if (this.muzakOn) return;
    this.muzakOn = true;
    const beat = 60 / 84;
    const chords = [[60, 64, 67, 71], [57, 60, 64, 67], [62, 65, 69, 72], [55, 59, 62, 65]];
    const scale = [72, 74, 76, 79, 81, 84];
    let next = this.now + 0.1, step = 0;
    const tick = () => {
      if (!this.muzakOn) return;
      while (next < this.now + 0.4) {
        const bar = Math.floor(step / 8) % 4, half = step % 8;
        const ch = chords[bar];
        if (half === 0) for (const m of ch) this.note(this.muzakBus, mtof(m), next, beat * 3.8, 'triangle', 0.035);
        if (half === 0 || half === 4) this.note(this.muzakBus, mtof(ch[0] - 24), next, beat * 1.6, 'sine', 0.12);
        if (Math.random() < 0.45) this.note(this.muzakBus, mtof(scale[Math.floor(Math.random() * scale.length)]), next, beat * 0.9, 'sine', 0.05, true);
        next += beat / 2;
        step++;
      }
    };
    tick();
    this.muzakTimer = setInterval(tick, 120);
  }

  stopMuzak(time = 1) {
    if (!this.ctx || !this.muzakOn) return;
    this.muzakOn = false;
    clearInterval(this.muzakTimer);
    this.muzakGain.gain.setTargetAtTime(0, this.now, time / 3);
  }

  note(bus, freq, t, dur, type, peak, vibrato = false, detune = this.muzakDetune) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune + (detune ? Math.sin(t * 0.7) * 60 : 0);
    if (vibrato) {
      const v = ctx.createOscillator();
      v.frequency.value = 5;
      const vg = ctx.createGain();
      vg.gain.value = 6;
      v.connect(vg).connect(o.detune);
      v.start(t);
      v.stop(t + dur + 0.1);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + Math.min(0.08, dur * 0.2));
    g.gain.setTargetAtTime(0.0001, t + dur * 0.6, dur * 0.2);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.5);
  }

  // the carousel's music box waltz, from the food court
  setCarousel(on, pos) {
    if (!this.ctx) return;
    if (!this.carBus) {
      this.carPan = this.panner(pos.x, 2, pos.z, 4, 1.0);
      this.carBus = this.ctx.createGain();
      this.carBus.gain.value = 0;
      this.carBus.connect(this.carPan).connect(this.sfx);
    }
    this.carBus.gain.setTargetAtTime(on ? 0.55 : 0, this.now, on ? 1 : 0.6);
    if (on === this.carOn) return;
    this.carOn = on;
    clearInterval(this.carTimer);
    if (!on) return;
    const beat = 60 / 132;
    const tune = [79, 76, 76, 77, 74, 74, 72, 74, 76, 77, 79, 79, 79, 0, 79, 76, 76, 77, 74, 74, 72, 76, 79, 79, 72, 0];
    let next = this.now + 0.1, step = 0;
    const tick = () => {
      while (next < this.now + 0.4) {
        const m = tune[step % tune.length];
        if (m) {
          this.note(this.carBus, mtof(m), next, beat * 1.4, 'sine', 0.09, false, -25 + Math.sin(step * 0.3) * 20);
          this.note(this.carBus, mtof(m + 12), next, beat * 0.8, 'triangle', 0.02, false, -25);
        }
        if (step % 3 === 0) this.note(this.carBus, mtof([48, 53, 55][Math.floor(step / 3) % 3]), next, beat * 2.5, 'triangle', 0.06, false, -25);
        next += beat;
        step++;
      }
    };
    tick();
    this.carTimer = setInterval(tick, 120);
  }

  // what kind of place you're in: 'mall', 'title', 'silent'
  setScene(kind, time = 1.5) {
    if (!this.ctx) return;
    this.scene = kind;
    const t = this.now, tc = time / 3;
    this.ambLevel = kind === 'silent' ? 0 : 1;
    const A = this.amb;
    A.air.g.gain.setTargetAtTime(this.ambLevel * A.air.base, t, tc);
    A.hiss.g.gain.setTargetAtTime(this.ambLevel * A.hiss.base, t, tc);
  }

  // { lit (0..2, how lit it is where you stand), outdoor (0..1, near the doors) }
  setEnv(e) {
    Object.assign(this.env, e);
  }

  update(dt) {
    if (!this.ctx) return;
    const E = this.env, T = this.timers, t = this.now;
    this.humGain.gain.setTargetAtTime(this.ambLevel * Math.min(1, E.lit) * 0.5, t, 0.4);
    this.amb.wind.g.gain.setTargetAtTime(this.ambLevel * (E.outdoor || 0) * 0.05, t, 0.6);
    if (this.ambLevel <= 0) return;
    // the building settling, a drip somewhere
    T.far -= dt;
    if (T.far <= 0) {
      T.far = 18 + Math.random() * 30;
      const a = Math.random() * Math.PI * 2;
      this.thump(this.now, this.out({ x: Math.cos(a) * 40, y: 6, z: Math.sin(a) * 20 }, 8), 0.25, 0.5);
    }
    T.drip -= dt;
    if (T.drip <= 0) {
      T.drip = 4 + Math.random() * 9;
      if (E.room === 'restroom' || E.room === 'back') this.osc('sine', 1400 + Math.random() * 600, this.now, 0.08, this.sfx, 0.02).frequency.exponentialRampToValueAtTime(500, this.now + 0.07);
    }
  }

  // a low, uneasy pad that rises with tension (0..1)
  buildDrone() {
    const ctx = this.ctx;
    this.drone = ctx.createGain();
    this.drone.gain.value = 0;
    const f = (this.droneF = ctx.createBiquadFilter());
    f.type = 'lowpass';
    f.frequency.value = 300;
    f.connect(this.drone).connect(this.master);
    for (const [m, det] of [[33, 0], [33, 9], [40, -6], [44, 4], [46, 12]]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(m);
      o.detune.value = det;
      const g = ctx.createGain();
      g.gain.value = 0.035;
      o.connect(g).connect(f);
      o.start();
    }
  }

  setTension(k, time = 2) {
    if (!this.ctx) return;
    this.tension = k;
    this.drone.gain.setTargetAtTime(0.01 + k * 0.32, this.now, time / 3);
    this.droneF.frequency.setTargetAtTime(220 + k * 900, this.now, time / 3);
  }

  // -------------------------------------------------------------- steps --
  // surface: 'hard' (terrazzo, tile), 'carpet', 'concrete', 'metal'
  step(surface, loud = 1, pos = null) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos);
    if (surface === 'carpet') {
      this.burst(t, 0.12, dst, 0.1 * loud, 'lowpass', 500, 0.8, 0.02);
    } else if (surface === 'metal') {
      this.burst(t, 0.05, dst, 0.22 * loud, 'bandpass', 1100 + Math.random() * 400, 3);
      this.osc('triangle', 380 + Math.random() * 60, t, 0.25, dst, 0.03 * loud, 0.002);
    } else if (surface === 'concrete') {
      this.burst(t, 0.09, dst, 0.2 * loud, 'bandpass', 900 + Math.random() * 300, 0.9, 0.005);
    } else {
      // boot heels on terrazzo, echoing down the concourse
      this.burst(t, 0.06, dst, 0.3 * loud, 'bandpass', 1500 + Math.random() * 500, 1.4, 0.002);
      this.burst(t + 0.005, 0.03, dst, 0.08 * loud, 'highpass', 3800, 1, 0.002);
      this.osc('sine', 180, t, 0.05, dst, 0.05 * loud, 0.002);
    }
  }

  // its steps: slow, heavy, a little hollow
  heavyStep(pos) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos, 2);
    this.osc('sine', 75, t, 0.16, dst, 0.28).frequency.exponentialRampToValueAtTime(45, t + 0.14);
    this.burst(t, 0.07, dst, 0.22, 'bandpass', 1300, 1.6);
    this.osc('triangle', 640, t, 0.05, dst, 0.03, 0.002);
  }

  // keys on a ring, jingling as somebody walks
  keys(pos, n = 5) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos, 1.5);
    for (let i = 0; i < n; i++) this.osc('triangle', 3200 + Math.random() * 2600, t + i * 0.05 + Math.random() * 0.03, 0.12, dst, 0.025, 0.002);
  }

  // plastic: a mannequin shifting where you can't see it
  creak(pos, loud = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now, dst = this.out(pos, 2, 1.0);
    this.burst(t, 0.18, dst, 0.18 * loud, 'bandpass', 700 + Math.random() * 500, 4, 0.03);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(140 + Math.random() * 80, t);
    o.frequency.linearRampToValueAtTime(90 + Math.random() * 40, t + 0.25);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 12;
    const g = ctx.createGain();
    this.envelope(g, t, 0.04, 0.09 * loud, 0.3);
    o.connect(f).connect(g).connect(dst);
    o.start(t); o.stop(t + 0.35);
    // and a hollow knock of a foot coming down
    this.osc('sine', 260, t + 0.22, 0.08, dst, 0.12 * loud, 0.002).frequency.exponentialRampToValueAtTime(140, t + 0.3);
  }

  // ---------------------------------------------------- doors and locks --
  thump(t, dst, loud = 1, low = 1) {
    this.osc('sine', 110 * low, t, 0.22, dst, 0.55 * loud).frequency.exponentialRampToValueAtTime(55 * low, t + 0.15);
    this.burst(t, 0.09, dst, 0.5 * loud, 'bandpass', 260 * low, 1.6);
    this.burst(t, 0.05, dst, 0.18 * loud, 'bandpass', 1400, 2);
  }

  // a roll-down gate coming down (or going up): a long metal rattle
  gate(pos, dur = 2.2, up = false) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos, 2);
    const f = this.burst(t, dur, dst, 0.22, 'bandpass', up ? 1200 : 1600, 2.5, 0.05);
    f.frequency.linearRampToValueAtTime(up ? 1700 : 1100, t + dur);
    for (let i = 0; i < dur * 14; i++) this.burst(t + i / 14 + Math.random() * 0.03, 0.03, dst, 0.07, 'bandpass', 2400 + Math.random() * 1200, 6);
    if (!up) this.thump(t + dur, dst, 0.7, 1.3);
  }

  // something rattling a gate from the other side
  rattle(pos, t = this.now) {
    if (!this.ctx) return;
    const dst = this.out(pos, 2);
    for (let i = 0; i < 12; i++) this.burst(t + i * 0.06 + Math.random() * 0.03, 0.04, dst, 0.18, 'bandpass', 2200 + Math.random() * 1500, 5);
  }

  padlock(on, pos = null) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos);
    this.burst(t, 0.03, dst, 0.3, 'bandpass', on ? 2600 : 2100, 5);
    this.burst(t + 0.06, 0.02, dst, 0.25, 'bandpass', on ? 3400 : 1800, 6);
    this.osc('triangle', on ? 1900 : 1500, t + 0.06, 0.08, dst, 0.04);
  }

  bolt(on, pos = null) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos);
    this.burst(t, 0.04, dst, 0.3, 'bandpass', on ? 1800 : 1500, 4);
    this.osc('square', on ? 160 : 140, t + 0.02, 0.06, dst, 0.08);
    this.burst(t + 0.05, 0.05, dst, 0.25, 'bandpass', 900, 3);
  }

  locked(pos = null) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos);
    for (let i = 0; i < 3; i++) this.burst(t + i * 0.09, 0.04, dst, 0.25, 'bandpass', 1300, 4);
  }

  doorCreak(dur = 0.9, pitch = 1, pos = null) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(380 * pitch, t);
    for (let k = 0; k < 8; k++) o.frequency.setValueAtTime((300 + Math.random() * 260) * pitch, t + (k / 8) * dur);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1100 * pitch; f.Q.value = 10;
    const g = ctx.createGain();
    this.envelope(g, t, 0.1, 0.05, dur);
    o.connect(f).connect(g).connect(this.out(pos));
    o.start(t); o.stop(t + dur + 0.1);
  }

  shut(loud = 1, pos = null) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos);
    this.thump(t, dst, 1.2 * loud, 0.8);
    this.burst(t + 0.03, 0.05, dst, 0.25 * loud, 'bandpass', 2200, 4);
  }

  knock(pos, n = 3, loud = 1) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos);
    for (let i = 0; i < n; i++) this.thump(t + i * 0.3 + Math.random() * 0.04, dst, loud * (0.85 + Math.random() * 0.3), 1.1);
  }

  bang(pos) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos);
    for (let i = 0; i < 3; i++) this.thump(t + i * 0.2 + Math.random() * 0.04, dst, 1.6, 0.75);
    this.rattle(pos, t + 0.1);
  }

  // a door giving way
  splinter(pos = null) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos);
    for (let i = 0; i < 6; i++) this.burst(t + i * 0.025, 0.08, dst, 0.6, 'bandpass', 900 + Math.random() * 2500, 2);
    this.thump(t, dst, 2.6, 0.5);
    this.thump(t + 0.3, dst, 1.8, 0.6);
  }

  tapGlass(pos) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos);
    for (let i = 0; i < 3; i++) {
      this.burst(t + i * 0.45, 0.03, dst, 0.4, 'bandpass', 3800, 6);
      this.osc('sine', 2100, t + i * 0.45, 0.12, dst, 0.05);
    }
  }

  click(pos = null) {
    if (!this.ctx) return;
    this.burst(this.now, 0.012, this.out(pos), 0.25, 'bandpass', 2600, 4);
  }

  // a clock station: the key turns, the box prints
  punch(pos) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos);
    for (let i = 0; i < 4; i++) this.burst(t + i * 0.05, 0.02, dst, 0.3, 'bandpass', 1800 + i * 200, 5);
    this.osc('square', 220, t + 0.25, 0.25, dst, 0.03);
    this.burst(t + 0.25, 0.25, dst, 0.06, 'bandpass', 3000, 2);
  }

  // a breaker thrown, and the building answering
  breaker(on, pos) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos);
    this.thump(t, dst, 1.1, 1.4);
    this.burst(t, 0.03, dst, 0.4, 'bandpass', 2600, 3);
    if (on) for (let i = 0; i < 5; i++) this.burst(t + 0.2 + i * 0.12, 0.05, this.sfx, 0.05, 'bandpass', 4000, 8);
  }

  // every light in the place going out at once
  powerDown() {
    if (!this.ctx) return;
    const t = this.now;
    this.thump(t, this.sfx, 2.2, 0.4);
    const o = this.osc('sawtooth', 120, t, 2.4, this.master, 0.08, 0.01);
    o.frequency.exponentialRampToValueAtTime(30, t + 2.2);
  }

  // the alarm panel chirping in the office (and on your walkie)
  panelBeep() {
    if (!this.ctx) return;
    const t = this.now;
    for (let i = 0; i < 2; i++) this.osc('square', 2400, t + i * 0.16, 0.08, this.radioBus, 0.03, 0.002);
  }

  // the PA's ding-dong
  paChime() {
    if (!this.ctx) return;
    const t = this.now;
    for (const [m, d] of [[76, 0], [72, 0.55]]) this.osc('sine', mtof(m), t + d, 1.4, this.muzakBus || this.sfx, 0.12, 0.01);
  }

  // ------------------------------------------------------- the walkie --
  radio(len = 2, pos = null) {
    if (!this.ctx) return;
    const t = this.now;
    const dst = pos ? this.out(pos, 2) : this.radioBus;
    this.burst(t, 0.08, dst, 0.3, 'highpass', 1500, 0.7);
    this.burst(t, len, dst, 0.03, 'bandpass', 1800, 0.5, 0.05);
    this.burst(t + len, 0.12, dst, 0.25, 'highpass', 1500, 0.7);
  }

  static(len = 2.5) {
    if (!this.ctx) return;
    this.burst(this.now, len, this.radioBus, 0.18, 'bandpass', 2000, 0.4, 0.05);
  }

  // ----------------------------------------------------------- the body --
  heartbeat(rate = 1, loud = 1) {
    if (!this.ctx) return;
    const t = this.now;
    for (const [dt, a] of [[0, 1], [0.28 / rate, 0.7]]) {
      this.osc('sine', 52, t + dt, 0.18, this.master, 0.5 * loud * a, 0.01).frequency.exponentialRampToValueAtTime(38, t + dt + 0.15);
    }
  }

  breath(out = true, loud = 1) {
    if (!this.ctx) return;
    const t = this.now;
    const f = this.burst(t, out ? 0.9 : 0.7, this.master, 0.05 * loud, 'bandpass', out ? 700 : 1100, 0.8, 0.25);
    f.frequency.linearRampToValueAtTime(out ? 450 : 1400, t + 0.7);
  }

  gasp() {
    if (!this.ctx) return;
    const t = this.now;
    const f = this.burst(t, 0.6, this.master, 0.3, 'bandpass', 1300, 1.2, 0.03);
    f.frequency.linearRampToValueAtTime(2200, t + 0.3);
  }

  whisper(pan = Math.random() < 0.5 ? -0.8 : 0.8) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now;
    const n = this.src();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 7;
    for (let k = 0; k < 12; k++) bp.frequency.setValueAtTime(600 + Math.random() * 2200, t + k * 0.13);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (let k = 0; k < 12; k++) g.gain.setValueAtTime(Math.random() < 0.7 ? 0.2 : 0.02, t + k * 0.13);
    g.gain.setValueAtTime(0.0001, t + 1.6);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    n.connect(bp).connect(g).connect(p).connect(this.sfx);
    n.start(t, Math.random(), 1.7);
  }

  distort(amount) {
    const ws = this.ctx.createWaveShaper();
    const k = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      k[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
    }
    ws.curve = k;
    return ws;
  }

  // a dissonant hit when something isn't right
  stinger(loud = 1) {
    if (!this.ctx) return;
    const t = this.now;
    for (const m of [38, 39, 45, 50, 51]) {
      const o = this.osc('sawtooth', mtof(m), t, 2.5, this.master, 0.05 * loud, 0.02);
      o.detune.linearRampToValueAtTime(-60, t + 2.5);
    }
    this.burst(t, 0.6, this.master, 0.25 * loud, 'lowpass', 200, 1, 0.01, this.brown);
  }

  jumpscare() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now;
    const ws = this.distort(90);
    const g = ctx.createGain();
    this.envelope(g, t, 0.01, 0.9, 1.8);
    ws.connect(g).connect(this.master);
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(220 + i * 140, t);
      for (let k = 0; k < 16; k++) o.frequency.setValueAtTime(200 + Math.random() * 1300, t + k * 0.1);
      o.connect(ws);
      o.start(t);
      o.stop(t + 1.8);
    }
    const n = this.src();
    n.connect(ws);
    n.start(t, 0, 1.8);
  }

  chime() {
    if (!this.ctx) return;
    const t = this.now;
    for (const [f, d] of [[880, 0], [1320, 0.12]]) this.osc('sine', f, t + d, 0.8, this.sfx, 0.05, 0.01);
  }

  buzz() {
    if (!this.ctx) return;
    const t = this.now;
    this.osc('square', 140, t, 0.3, this.master, 0.04, 0.01);
  }

  // ------------------------------------------------- positional loops ---
  // its keys and its footfalls follow it; the dread follows you
  setLoop(name, pos, level) {
    if (!this.ctx) return;
    let L = this.loops.get(name);
    if (!L) {
      const ctx = this.ctx;
      const p = this.panner(0, 1.6, 0, 1.6, 1.4);
      const g = ctx.createGain();
      g.gain.value = 0;
      const s = this.src(this.brown, true);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 160; f.Q.value = 3;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.3;
      const lg = ctx.createGain();
      lg.gain.value = 0.5;
      const amp = ctx.createGain();
      amp.gain.value = 0.5;
      lfo.connect(lg).connect(amp.gain);
      s.connect(f).connect(amp).connect(g).connect(p).connect(this.sfx);
      s.start(); lfo.start();
      L = { p, g };
      this.loops.set(name, L);
    }
    if (pos) this.place(L.p, pos.x, pos.y ?? 1.6, pos.z);
    L.g.gain.setTargetAtTime(level, this.now, 0.2);
  }

  quiet() {
    if (!this.ctx) return;
    for (const L of this.loops.values()) L.g.gain.setTargetAtTime(0, this.now, 0.1);
    this.stopMuzak(0.5);
    this.setCarousel(false, { x: 52, z: 0 });
    this.humGain.gain.setTargetAtTime(0, this.now, 0.3);
    this.setTension(0, 0.5);
  }
}

export const sound = new Sound();
