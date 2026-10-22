// Kingsgate Mall from this guard's point of view: the opening, then first
// person through the night. Walk the mall, pull down and lock the gates,
// open and shut doors, turn the key in the clock stations, read what Dale
// left behind, watch the cameras, throw the breakers, hide, talk on the
// walkie, and keep looking at the mannequins. The host decides everything
// that matters; this file shows it and sends back what you do.

import * as THREE from 'three';
import { PLAYER_R, EYE, WALK, SPRINT, CROUCH, STAMINA_MAX, STAMINA_REGEN, REACH } from '../shared/config.js';
import { DOORS, STATIONS, CAMERAS, HIDES, SPOTS, START_SPOTS, BREAKERS, UNIFORM_HOME, Solids, staticSolids, doorBox, roomAt } from '../shared/mall.js';
import { FIXTURES, lightAt } from '../shared/lights.js';
import { HOURS, CLUES, CLUE_ORDER, REPORT, SHOUTS, RADIO_LINES, logbook } from '../shared/story.js';
import { WATCHED } from '../host/match.js';
import { Avatar, Actor, MannequinsView, hideView } from './avatar.js';
import { Cutscene } from './cutscene.js';
import { CCTV } from './cctv.js';
import { drawMap, doorState } from './mapview.js';
import { makePerson } from './humans.js';
import { MALL_UNIFORMS } from './lighting.js';
import { esc, clockText } from './ui.js';
import { sound } from './audio.js';
import { voice } from './voice.js';
import { lerp, clamp01, span } from './util.js';

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const DOOR_SPOT = (d) => ({ x: d.x, y: 1.0, z: d.z });
const NAMES = Object.fromEntries(DOORS.map((d) => [d.id, d.name]));

export class Game {
  constructor({ renderer, post, world, link, start, hud, input, settings }) {
    this.renderer = renderer;
    this.post = post;
    this.world = world;
    this.link = link;
    this.hud = hud;
    this.input = input;
    this.settings = settings;
    this.me = link.id;
    this.isHost = start.host === link.id;
    this.roster = start.roster;
    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 260);
    this.camera.rotation.order = 'YXZ';
    this.myIndex = Math.max(0, this.roster.findIndex((r) => r.id === this.me));
    const spot = START_SPOTS[this.myIndex % 4];
    this.p = { x: spot.x, z: spot.z, ry: spot.ry, rx: 0, eye: EYE, vx: 0, vz: 0, stamina: STAMINA_MAX, tired: false, flash: false, crouch: false, stepDist: 0, mv: 0 };
    this.mode = 'intro';
    this.t = 0;
    this.clock = 21.92;
    this.hourIdx = -1;
    this.fx = { fade: 1, fadeColor: 0x000000, bars: 1, fear: 0, staticAmt: 0, glitch: 0, exposure: 1, cctv: false };
    this.fadeTo = 0;
    this.fear = 0;
    this.doors = DOORS.map(() => 1000);
    this.breakers = Object.fromEntries(BREAKERS.map((b) => [b.id, true]));
    this.flags = 0;
    this.round = { n: 0, punched: [0, 0, 0, 0, 0, 0] };
    this.radioOpts = [];
    this.clues = new Set();
    this.objectives = [];
    this.report = { open: false, answers: [null, null, null], q: 0 };
    this.code = null;
    this.tape = null;
    this.hide = null;
    this.camIdx = 0;
    this.viewing = null;
    this.target = null;
    this.sendT = 0;
    this.heartT = 0;
    this.lookT = 0;
    this.lookSent = new Set();
    this.creakT = new Map();
    this.solids = new Solids(staticSolids());
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
    this.flicker = new Map();
    this.flickerT = 0;

    const W = world;
    // a flashlight per guard: build the shaders for that now, not on the
    // first frame someone switches one on
    if (W.useFlashlights(this.roster.length)) renderer.compile(W.scene, this.camera);
    W.setBreakers({ concourse: true, court: true, food: true, stores: false, back: true, cams: true }, false, { force: true });
    W.setFlags(0);
    this.avatars = new Map();
    for (const r of this.roster) this.avatars.set(r.id, new Avatar(r, this, r.id === this.me));
    this.mq = new MannequinsView(this);
    this.dale = new Actor('dale', this);
    this.stalker = null;
    this.manager = null;
    this.cctv = new CCTV(W);
    this.cutscene = new Cutscene(this, 'intro');
    this.scare = { mannequin: makePerson('mq1'), stalker: makePerson('mqGuard') };
    for (const s of Object.values(this.scare)) { s.visible = false; W.scene.add(s); }

    const L = this.link;
    this.off = [
      L.on('s', (m) => this.onSnapshot(m)),
      L.on('hour', (m) => this.onHour(m)),
      L.on('obj', (m) => { this.objectives = m.list; this.hud.objectives(m.list, m.done); if (m.done) sound.chime(); }),
      L.on('say', (m) => this.onSay(m)),
      L.on('fx', (m) => this.onFx(m)),
      L.on('clue', (m) => this.onClue(m.k)),
      L.on('logbook', (m) => { this.code = m.code; this.openLog(); }),
      L.on('tape', (m) => { this.tape = m.rows; this.openTape(); }),
      L.on('vcr', () => this.openVcr()),
      L.on('photos', () => this.openPhotos()),
      L.on('tp', (m) => this.teleport(m)),
      L.on('taken', (m) => this.onTaken(m)),
      L.on('report', (m) => this.onReport(m)),
      L.on('toast', (m) => this.hud.toast(m.text)),
      L.on('dropped', (m) => this.hud.toast(`${this.nameOf(m.id)} lost connection.`)),
    ];

    sound.setScene('mall', 2);
    hud.show();
    hud.cinematic(true);
    hud.prompt(this.isHost ? 'Hold SPACE to skip' : null);
    this.applyBrightness();
    this.updateTeam();
  }

  nameOf(id) {
    const r = this.roster.find((x) => x.id === id);
    return r ? r.name : '???';
  }

  applyBrightness() {
    MALL_UNIFORMS.mallScale.value = this.settings.bright ?? 1;
  }

  // ----------------------------------------------------------- network --
  onSnapshot(m) {
    this.clock = m.T;
    this.hourIdx = m.h;
    for (const row of m.ps) {
      const a = this.avatars.get(row[0]);
      if (!a) continue;
      a.apply(row);
      if (a.isMe) {
        const hide = row[6] || null;
        if (hide !== this.hide) this.setHide(hide);
      }
    }
    this.mq.apply(m.mq, (m.f & 16) !== 0);
    if (m.sk) {
      if (!this.stalker) this.stalker = new Actor('mqGuard', this);
      this.stalker.apply(m.sk);
    } else if (this.stalker) { this.stalker.dispose(); this.stalker = null; }
    this.dale.apply(m.dl.slice(0, 4));
    this.daleMode = m.dl[4];
    if (m.mg) {
      if (!this.manager) this.manager = new Actor('manager', this);
      this.manager.apply(m.mg);
    } else if (this.manager && this.mode !== 'intro') { this.manager.dispose(); this.manager = null; }
    this.doors = m.d;
    this.world.setDoors(m.d);
    const dyn = [];
    DOORS.forEach((d, k) => {
      const st = doorState(m.d[k]);
      if (d.kind === 'glass' || d.kind === 'rollup' || st.open < (d.kind === 'gate' ? 0.6 : 0.5)) dyn.push(doorBox(d));
    });
    this.solids.dynamic = dyn;
    const B = {};
    BREAKERS.forEach((b, i) => { B[b.id] = !!m.b[i]; });
    this.breakers = B;
    this.flags = m.f;
    this.world.setFlags(m.f);
    if (this.mode !== 'intro') this.world.setBreakers(B, (m.f & 2) !== 0);
    sound.setCarousel((m.f & 2) !== 0, SPOTS.carousel);
    if ((m.f & 1) !== 0) { if (!this.paOn) { this.paOn = true; sound.paChime(); sound.startMuzak(0.45, true); } }
    else if (this.paOn) { this.paOn = false; sound.stopMuzak(1); }
    this.round = { n: m.rn, punched: m.rp };
    this.radioOpts = m.ro;
    this.updateTeam();
  }

  updateTeam() {
    this.hud.team(this.roster.map((r) => {
      const a = this.avatars.get(r.id);
      const room = a && !a.isMe && a.alive ? roomAt(a.x, a.z) : null;
      return { name: r.name, me: r.id === this.me, color: r.color, out: a && a.taken, where: a && a.hidden ? 'hiding' : a && a.cctv ? 'on the cameras' : room ? room.name : '' };
    }));
  }

  onHour(m) {
    if (this.mode === 'intro') this.endIntro();
    this.hud.card(m.title, m.sub, 4.5);
    if (m.i > 0) sound.paChime();
  }

  // where a voice comes from
  onSay(m) {
    if (m.radio) {
      // everyone's walkie
      sound.radio(1 + m.text.length * 0.05);
      if (m.ch2) sound.static(1.2);
      this.hud.say(m.ch2 ? 'Channel 2' : m.who, m.text, m.ch2 ? 'ch2' : 'radio');
      if (!m.id || m.id !== this.me) voice.say(m.text, m.voice || (m.id ? 'friend' : 'radio'), { salt: 3 });
      return;
    }
    if (m.pa) {
      this.hud.say('PA', m.text, 'pa');
      voice.say(m.text, 'pa');
      return;
    }
    if (m.id) {
      const r = this.roster.find((x) => x.id === m.id);
      this.hud.say(r ? r.name : '???', m.text);
      const a = this.avatars.get(m.id);
      if (a) a.rig.talk(1.3);
      if (m.id !== this.me) voice.say(m.text, 'friend', { salt: r ? r.color : 0, sex: r && r.color % 2 ? 'f' : 'm' });
      return;
    }
    // someone in the mall: only if you're near enough to hear
    if (m.at) {
      const c = this.camera.position;
      if (Math.hypot(c.x - m.at[0], c.z - m.at[2]) > 22) return;
    }
    if (m.who === 'Dale') this.dale.rig.talk(1.6);
    if (m.who === 'Ray Okafor' && this.manager) this.manager.rig.talk(1.6);
    this.hud.say(m.who, m.text);
    voice.say(m.text, m.voice || 'friend');
  }

  onFx(m) {
    const door = m.door ? DOORS.find((d) => d.id === m.door) : null;
    const at = door ? DOOR_SPOT(door) : m.x != null ? { x: m.x, y: 1.2, z: m.z } : null;
    switch (m.k) {
      case 'open':
        if (door.kind === 'gate') sound.gate(at, 2.2, true); else sound.doorCreak(0.8, 1, at);
        break;
      case 'shut':
        if (door.kind === 'gate') sound.gate(at, 2.2, false); else setTimeout(() => sound.shut(0.9, at), 350);
        break;
      case 'lock': case 'unlock':
        if (door.kind === 'gate') sound.padlock(m.k === 'lock', at); else sound.bolt(m.k === 'lock', at);
        if (m.by === 'nobody') this.hud.toast(`The alarm panel chirps: ${NAMES[m.door]} just came unlocked. Nobody's near it.`);
        break;
      case 'locked': sound.locked(at); break;
      case 'rattle': sound.rattle(at); sound.gate(at, 1.2, true); break;
      case 'creak': sound.doorCreak(1.2, 0.8, at); break;
      case 'break': sound.splinter(at); this.hud.flash('THE DOOR'); this.fear = 1; break;
      case 'bang': sound.bang(at); this.fear = Math.max(this.fear, 0.6); break;
      case 'tap': sound.tapGlass(at); break;
      case 'knock': sound.knock(at, 3, 1); break;
      case 'keys': sound.keys(at, 7); break;
      case 'panel': sound.panelBeep(); break;
      case 'punch': {
        const s = STATIONS[m.n - 1];
        sound.punch({ x: s.x, y: s.y, z: s.z });
        const st = this.world.stations[m.n - 1];
        if (st) { const k = st.userData.key; k.rotation.z = 0; let a = 0; const spin = () => { a += 0.25; k.rotation.z = a; if (a < Math.PI / 2) requestAnimationFrame(spin); else k.rotation.z = 0; }; spin(); }
        break;
      }
      case 'breaker': sound.breaker(!m.off, at); if (m.off && m.id !== 'cams') sound.powerDown(); break;
      case 'power': sound.powerDown(); this.hud.flash('POWER'); this.fear = Math.max(this.fear, 0.7); break;
      case 'paOff': sound.stopMuzak(0.5); this.paOn = false; break;
      case 'paCrackle': sound.static(1.5); break;
      case 'carousel': this.hud.toast('From the food court: music. The carousel is turning.'); break;
      case 'carouselOff': break;
      case 'static': sound.static(3); break;
      case 'saw':
        if (m.id === this.me) { sound.stinger(0.8); this.fear = Math.max(this.fear, 0.8); }
        break;
      case 'spotted':
        if (m.id === this.me) { sound.stinger(1.3); this.hud.flash('IT SEES YOU'); this.fear = 1; }
        break;
      case 'stun': sound.gasp(); if (m.by === this.me) this.hud.toast('It flinches from the light, hands over its face.'); break;
      case 'hideIn': sound.doorCreak(0.5, 1.3, HIDES.find((h) => h.id === m.id)); break;
      case 'hideOut': sound.doorCreak(0.5, 1.2, HIDES.find((h) => h.id === m.id)); break;
      case 'lockerOpen': sound.bolt(false, SPOTS.locker); this.world.live.lockers?.userData.doors[2] && (this.world.live.lockers.userData.doors[2].rotation.y = -1.6); break;
      case 'wrongCode': sound.buzz(); if (this.panelKind === 'keypad') { this.keypad = ''; this.renderKeypad('WRONG'); } break;
    }
  }

  onClue(k) {
    if (this.clues.has(k)) return;
    this.clues.add(k);
    if (CLUES[k]) this.hud.toast(`In your notes: ${CLUES[k].title}. [J]`);
  }

  onReport(m) {
    this.report.open = m.open;
    this.report.answers = m.answers;
    if (this.mode === 'panel' && this.panelKind === 'notes') this.renderNotes();
    else if (m.open && !m.by && (this.mode === 'play' || this.mode === 'cctv')) { if (this.mode === 'cctv') this.leaveCctv(); this.openNotes(); }
  }

  teleport(m) {
    const p = this.p;
    p.x = m.x; p.z = m.z;
    p.vx = p.vz = 0;
  }

  setHide(id) {
    this.hide = id;
    if (id) {
      const v = hideView(id);
      this.mode = 'hidden';
      this.p.ry = v.ry;
      this.p.rx = 0;
      this.hideBase = v;
      this.p.flash = false;
      this.closePanel();
    } else if (this.mode === 'hidden') this.mode = 'play';
  }

  endIntro() {
    this.cutscene.finish();
    this.hud.cinematic(false);
    this.hud.prompt(null);
    this.fx.bars = 0;
    this.mode = 'play';
    this.world.setBreakers(this.breakers, (this.flags & 2) !== 0, { force: true });
    for (const a of this.avatars.values()) a.snapNext = true;
    const spot = START_SPOTS[this.myIndex % 4];
    this.p.x = spot.x; this.p.z = spot.z;
    // facing the south doors he just left by
    this.p.ry = Math.atan2(spot.x - 0, spot.z - 16);
    if (this.manager) { this.manager.dispose(); this.manager = null; }
    sound.stopMuzak(2);
  }

  onTaken(m) {
    if (m.id === this.me) { this.startTaken(m.by); return; }
    this.hud.toast(`${this.nameOf(m.id)} is gone.`);
    sound.gasp();
    if (this.viewing && this.viewing.id === m.id) this.viewing = null;
    this.updateTeam();
  }

  send() {
    const p = this.p;
    this.link.send({
      t: 'st', x: +p.x.toFixed(2), z: +p.z.toFixed(2), ry: +p.ry.toFixed(3), rx: +p.rx.toFixed(3),
      mv: p.mv, fl: p.flash && this.mode !== 'cctv' ? 1 : 0, cr: p.crouch ? 1 : 0, cam: this.mode === 'cctv' ? this.camIdx : -1,
    });
  }

  // --------------------------------------------------------------- tick --
  update(dt) {
    dt = Math.min(dt, 0.1);
    this.t += dt;
    const inp = this.input, p = this.p;
    const sens = 0.0022 * this.settings.sens;
    const inv = this.settings.invert ? -1 : 1;
    if ((this.mode === 'play' || this.mode === 'hidden') && inp.locked) {
      p.ry -= inp.mx * sens;
      p.rx -= inp.my * sens * inv;
      p.rx = Math.max(-1.45, Math.min(1.45, p.rx));
      if (this.mode === 'hidden' && this.hideBase) {
        let d = p.ry - this.hideBase.ry;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        p.ry = this.hideBase.ry + Math.max(-0.7, Math.min(0.7, d));
        p.rx = Math.max(-0.5, Math.min(0.5, p.rx));
      }
    }

    switch (this.mode) {
      case 'intro': this.updateIntro(dt); break;
      case 'play':
        this.move(dt);
        this.interact();
        this.keys();
        break;
      case 'hidden':
        if (inp.hit('KeyE')) this.link.send({ t: 'use', k: `hide:${this.hide}` });
        this.panelKeys();
        break;
      case 'cctv': this.updateCctv(); break;
      case 'panel': this.updatePanel(); break;
      case 'taken': this.updateTaken(dt); break;
      case 'spectate': this.updateSpectate(); break;
    }

    for (const a of this.avatars.values()) a.update(dt);
    const me = this.camera.position;
    if (this.stalker) this.stalker.update(dt, this.t, me);
    // Dale, shut away somewhere, is only drawn (and posed) when you're near
    const view = this.mode === 'cctv' ? this.cctv.cams[this.camIdx].position : me;
    const daleNear = this.daleMode !== 'trapped' || this.dale.fresh || Math.hypot(view.x - this.dale.x, view.z - this.dale.z) < 18;
    this.dale.root.visible = daleNear;
    if (daleNear) this.dale.update(dt, this.t, this.daleMode === 'trapped' ? null : me);
    if (this.manager) this.manager.update(dt, this.t, me);
    this.stepSounds(dt);

    this.sendT -= dt;
    if (this.sendT <= 0 && ['play', 'cctv', 'panel', 'hidden'].includes(this.mode)) {
      this.sendT = 0.05;
      this.send();
    }
    this.placeCamera(dt);
    this.lookAround(dt);
    this.updateWorld(dt);
    this.updateMood(dt);
    this.updateFx(dt);
    this.updateHud();
    inp.endFrame();
  }

  placeCamera(dt) {
    const cam = this.camera, p = this.p;
    if (this.mode === 'intro') {
      cam.position.copy(this.cutscene.pos);
      cam.lookAt(this.cutscene.lookAt);
    } else if (this.mode === 'spectate' && this.viewing) {
      const v = this.viewing;
      cam.position.set(v.x, EYE, v.z);
      cam.rotation.set(v.rx * 0.8, v.ry, 0);
    } else if (this.mode === 'hidden' && this.hideBase) {
      cam.position.set(this.hideBase.x, this.hideBase.y, this.hideBase.z);
      cam.rotation.set(p.rx, p.ry, 0);
    } else if (this.mode !== 'taken') {
      const speed = Math.hypot(p.vx, p.vz);
      const bob = this.mode === 'play' ? Math.abs(Math.sin((p.stepDist / (p.mv === 2 ? 0.95 : 0.72)) * Math.PI)) * 0.035 * Math.min(1, speed / 2.5) : 0;
      p.eye = lerp(p.eye, p.crouch ? 1.05 : EYE, 1 - Math.exp(-dt * 10));
      cam.position.set(p.x, p.eye + bob, p.z);
      cam.rotation.set(p.rx, p.ry, 0);
    }
    cam.updateMatrixWorld();
    sound.setListener(cam);
  }

  // ---------------------------------------------------------- the intro --
  updateIntro(dt) {
    this.cutscene.update(dt);
    this.fx.fade = lerp(this.fx.fade, this.fadeTo, 1 - Math.exp(-dt * 1.5));
    if (this.isHost) {
      this.skipHeld = this.input.down('Space') ? (this.skipHeld || 0) + dt : 0;
      if (this.skipHeld > 0.6 && !this.skipSent) {
        this.skipSent = true;
        this.link.send({ t: 'skip' });
      }
    }
  }

  // ---------------------------------------------------------- walking --
  move(dt) {
    const inp = this.input, p = this.p;
    const f = (inp.down('KeyW') || inp.down('ArrowUp') ? 1 : 0) - (inp.down('KeyS') || inp.down('ArrowDown') ? 1 : 0);
    const s = (inp.down('KeyD') || inp.down('ArrowRight') ? 1 : 0) - (inp.down('KeyA') || inp.down('ArrowLeft') ? 1 : 0);
    const len = Math.hypot(f, s);
    if (inp.hit('KeyC') || inp.hit('ControlLeft')) p.crouch = !p.crouch;
    const sprint = (inp.down('ShiftLeft') || inp.down('ShiftRight')) && f > 0 && !p.tired && !p.crouch;
    if (sprint && len > 0) {
      p.stamina = Math.max(0, p.stamina - dt);
      if (p.stamina <= 0) { p.tired = true; sound.breath(true, 0.8); }
    } else {
      p.stamina = Math.min(STAMINA_MAX, p.stamina + dt * STAMINA_REGEN);
      if (p.tired && p.stamina > 1.5) p.tired = false;
    }
    const speed = p.crouch ? CROUCH : sprint && len > 0 ? SPRINT : WALK;
    let wx = 0, wz = 0;
    if (len > 0) {
      const fx = -Math.sin(p.ry), fz = -Math.cos(p.ry);
      const rx = Math.cos(p.ry), rz = -Math.sin(p.ry);
      wx = ((fx * f + rx * s) / len) * speed;
      wz = ((fz * f + rz * s) / len) * speed;
    }
    const k = 1 - Math.exp(-dt * 12);
    p.vx = lerp(p.vx, wx, k);
    p.vz = lerp(p.vz, wz, k);
    const ox = p.x, oz = p.z;
    const pos = { x: p.x + p.vx * dt, z: p.z + p.vz * dt };
    this.solids.resolve(pos, PLAYER_R);
    p.x = pos.x; p.z = pos.z;
    const moved = Math.hypot(p.x - ox, p.z - oz);
    const v = moved / dt;
    p.mv = v > 3.2 ? 2 : v > 0.3 ? 1 : 0;
    const stride = p.mv === 2 ? 0.95 : 0.72;
    const before = Math.floor(p.stepDist / stride);
    p.stepDist += moved;
    if (Math.floor(p.stepDist / stride) !== before) sound.step(this.surface(p.x, p.z), (p.mv === 2 ? 1.1 : 0.7) * (p.crouch ? 0.35 : 1));
  }

  surface(x, z) {
    const r = roomAt(x, z);
    if (!r) return 'concrete';
    if (r.id === 'halv' || r.id === 'halvNorth' || ['N2', 'N5', 'N6', 'N8', 'S1', 'S5'].includes(r.id)) return 'carpet';
    if (['stock', 'dock', 'S3'].includes(r.id)) return 'concrete';
    if (r.id === 'freezer') return 'metal';
    return 'hard';
  }

  // ------------------------------------------------------- using things --
  doorPrompt(d, k) {
    const st = doorState(this.doors[k]);
    const moving = d.kind === 'gate' && st.open > 0.05 && st.open < 0.95 && !st.locked;
    const keyOk = !d.key || (this.flags & 8) !== 0;
    if (st.broken) return { e: st.open > 0.5 ? null : null, r: null, text: 'The lock is smashed.' };
    if (d.kind === 'glass' || d.kind === 'rollup') return { e: null, r: st.locked ? '[R] Unlock' : '[R] Lock it', text: st.locked ? `${cap(d.name)} (locked)` : `${cap(d.name)} (unlocked)` };
    if (d.kind === 'gate') {
      if (moving) return { text: 'The gate rattles on its rollers...' };
      if (st.open > 0.5) return { e: '[E] Pull the gate down', text: null };
      if (st.open > 0.05) return { e: '[E] Pull it down', text: null };
      return st.locked ? { r: '[R] Unlock the padlock', text: `${cap(d.name)}: locked` } : { e: '[E] Push the gate up', r: '[R] Lock it', text: null };
    }
    if (st.open > 0.3) return { e: '[E] Shut it', text: null };
    if (st.locked) return { r: keyOk ? '[R] Unlock' : '[R] Unlock (none of your keys fit)', text: `${cap(d.name)}: locked` };
    return { e: '[E] Open', r: '[R] Lock it', text: null };
  }

  // what you can use from here, as rays to test against
  targets() {
    const p = this.p, out = [];
    const add = (key, at, r, label, extra = {}) => out.push({ kind: 'spot', key, pos: v3(at.x, at.y, at.z), r, label, ...extra });
    const near = (s, d = 6) => Math.hypot(s.x - p.x, s.z - p.z) < d;
    for (const s of STATIONS) if (near(s)) add(`station${s.n}`, s, 0.24, this.round.n ? (this.round.punched[s.n - 1] ? `${s.name}: punched this round` : `[E] Turn the key (${s.name})`) : `[E] Turn the key (${s.name})`);
    const S = SPOTS;
    if (near(S.monitors, 8)) {
      add('monitors', S.monitors, 1.0, '[E] Watch the cameras');
      add('alarmPanel', S.alarmPanel, 0.55, '[E] Read the alarm panel');
      add('logbook', S.logbook, 0.25, '[E] Read Dale\'s logbook');
      add('watchclock', S.watchclock, 0.25, '[E] Read the watchclock tape');
      add('vcr', S.vcr, 0.2, '[E] Play the tape in the VCR');
      add('keyCabinet', S.keyCabinet, 0.35, '[E] Look in the key cabinet');
      add('locker', S.locker, 0.28, (this.flags & 8) ? 'Dale\'s locker (empty)' : '[E] Dale\'s locker: try the combination');
      add('radio', S.radio, 0.2, '[E] The base radio');
    }
    if (near(S.breaker, 6)) add('breaker', S.breaker, 1.0, '[E] Open the breaker panel');
    if (near(S.pa)) add('pa', S.pa, 0.3, (this.flags & 1) ? '[E] Turn off the PA' : 'The PA system');
    if (near(S.lostFound)) add('lostFound', S.lostFound, 0.4, '[E] Look in the lost and found');
    if (near(S.photos) && !this.clues.has('photos')) add('photos', S.photos, 0.25, '[E] An envelope: MERCER, D. (24 exp.)');
    if (near(S.inventory)) add('inventory', S.inventory, 0.25, '[E] Read the clipboard');
    if (near(S.carousel) && (this.flags & 2)) add('carousel', S.carousel, 0.4, '[E] Turn off the carousel');
    for (const h of HIDES) if (near(h, 3)) add(`hide:${h.id}`, { x: h.x, y: 1.0, z: h.z }, 0.6, `[E] Hide in ${h.name}`);
    return out;
  }

  // the door or gate you're looking at, if any: where the view ray meets
  // its opening, within reach
  doorTarget(o, dir) {
    let best = null, bd = REACH + 0.6;
    DOORS.forEach((d, k) => {
      if (Math.hypot(d.x - o.x, d.z - o.z) > d.w / 2 + 4) return;
      // the plane of the opening
      const n = d.axis === 'x' ? [0, 1] : [1, 0];
      const den = dir.x * n[0] + dir.z * n[1];
      if (Math.abs(den) < 1e-4) return;
      const tt = ((d.axis === 'x' ? d.at - o.z : d.at - o.x)) / den;
      if (tt < 0.1 || tt > bd) return;
      const hx = o.x + dir.x * tt, hy = o.y + dir.y * tt, hz = o.z + dir.z * tt;
      const along = d.axis === 'x' ? hx : hz;
      if (along < d.a - 0.15 || along > d.b + 0.15 || hy < -0.1 || hy > d.h + 0.4) return;
      bd = tt;
      best = { kind: 'door', key: d.id, k, d, dist: tt };
    });
    return best;
  }

  interact() {
    const inp = this.input, p = this.p;
    if (inp.hit('KeyF')) { p.flash = !p.flash; sound.click(); }
    const cam = this.camera, o = cam.position, dir = cam.getWorldDirection(this.tmp);
    let best = null, bestScore = Infinity;
    for (const c of this.targets()) {
      if (!c.label) continue;
      const v = c.pos.clone().sub(o);
      const along = v.dot(dir);
      if (along < 0.1 || along > REACH) continue;
      const perp = v.clone().sub(dir.clone().multiplyScalar(along)).length();
      const r = c.r + along * 0.02;
      if (perp > r) continue;
      const score = perp / r + along * 0.05;
      if (score < bestScore) { bestScore = score; best = c; }
    }
    const door = this.doorTarget(o, dir);
    if (door && (!best || door.dist < best.pos.distanceTo(o) - 0.2)) best = door;
    this.target = best;
    // R is always for the door or gate in front of you
    this.doorInView = door;
    if (door && best !== door && inp.hit('KeyR') && this.doorPrompt(door.d, door.k).r) this.link.send({ t: 'lock', k: door.key });
    if (!best) return;
    if (best.kind === 'door') {
      const pr = this.doorPrompt(best.d, best.k);
      if (inp.hit('KeyE')) {
        if (best.d.kind === 'glass' || best.d.kind === 'rollup') this.link.send({ t: 'use', k: `door:${best.key}` });
        else if (pr.e) this.link.send({ t: 'use', k: `door:${best.key}` });
        else if (doorState(this.doors[best.k]).locked) sound.locked(DOOR_SPOT(best.d));
      }
      if (inp.hit('KeyR') && pr.r) this.link.send({ t: 'lock', k: best.key });
      return;
    }
    if (!inp.hit('KeyE') || !best.label.startsWith('[E]')) return;
    switch (best.key) {
      case 'monitors': this.enterCctv(); return;
      case 'alarmPanel': this.openAlarm(); return;
      case 'locker': this.openKeypad(); return;
      case 'radio': this.openRadio(); return;
      case 'breaker': this.openBreakers(); return;
      default: this.link.send({ t: 'use', k: best.key });
    }
  }

  // keys that work while walking about
  keys() {
    const inp = this.input;
    if (inp.hit('KeyV')) { this.openRadio(); return; }
    if (inp.hit('KeyM')) { this.openMap(); return; }
    if (inp.hit('KeyJ')) { this.openNotes(); return; }
    for (let i = 0; i < 4; i++) if (inp.hit(`Digit${i + 1}`) || inp.hit(`Numpad${i + 1}`)) this.link.send({ t: 'shout', k: i });
  }

  // while hidden you can still check the map and your notes, and the walkie
  panelKeys() {
    const inp = this.input;
    if (inp.hit('KeyV')) this.openRadio();
    else if (inp.hit('KeyM')) this.openMap();
    else if (inp.hit('KeyJ')) this.openNotes();
  }

  // things you notice just by looking at them
  lookAround(dt) {
    this.lookT -= dt;
    if (this.lookT > 0 || this.mode === 'intro') return;
    this.lookT = 0.25;
    const view = this.mode === 'cctv' ? this.cctv.cams[this.camIdx] : this.camera;
    const c = view.position, d = view.getWorldDirection(this.tmp);
    const looking = (x, y, z, maxD, cos = 0.97) => {
      const v = v3(x - c.x, y - c.y, z - c.z), l = v.length();
      return l < maxD && v.dot(d) / l > cos;
    };
    const send = (k) => { if (this.lookSent.has(k)) return; this.lookSent.add(k); this.link.send({ t: 'look', k }); };
    if (this.mode === 'play') {
      if (!(this.flags & 16) && looking(UNIFORM_HOME[0], 1.55, UNIFORM_HOME[1], 8)) {
        send('uniform');
        if (!this.uniformToast) { this.uniformToast = true; this.hud.toast('That one in the window is wearing a Gatehouse uniform. The name tag says MERCER.'); }
      }
      if (c.z > 11 && Math.abs(c.x) < 4 && looking(5.6, 1.0, 25.5, 20, 0.9)) send('car');
    }
    if (this.stalker && (this.mode === 'play' || this.mode === 'cctv')) {
      const s = this.stalker;
      if (looking(s.x, 1.5, s.z, this.mode === 'cctv' ? 30 : 14, this.mode === 'cctv' ? 0.85 : 0.95)) send('stalker');
    }
  }

  // --------------------------------------------------- the cameras --
  enterCctv() {
    this.mode = 'cctv';
    this.hud.cctv(true);
    sound.click();
    sound.radio(0.15);
  }

  leaveCctv() {
    this.mode = 'play';
    this.hud.cctv(false);
  }

  updateCctv() {
    const inp = this.input;
    const n = CAMERAS.length;
    if (inp.hit('KeyD') || inp.hit('ArrowRight') || inp.clicks > 0) { this.camIdx = (this.camIdx + 1) % n; sound.click(); }
    if (inp.hit('KeyA') || inp.hit('ArrowLeft') || inp.rightClicks > 0) { this.camIdx = (this.camIdx + n - 1) % n; sound.click(); }
    for (let i = 0; i < n; i++) if (inp.hit(`Digit${i + 1}`) || inp.hit(`Numpad${i + 1}`)) { this.camIdx = i; sound.click(); }
    if (inp.hit('KeyE') || inp.hit('KeyQ') || inp.hit('KeyS')) this.leaveCctv();
  }

  // ------------------------------------------------------------- panels --
  openPanel(html, cls = '', kind = null) {
    this.hud.panel(html, cls);
    this.mode = 'panel';
    this.panelKind = kind;
    this.panelOpenedAt = this.t;
    this.lastPanelHtml = null;
  }
  closePanel() {
    this.hud.panel(null);
    this.panelKind = null;
    if (this.mode === 'panel') this.mode = this.hide ? 'hidden' : 'play';
  }
  refreshPanel(html) {
    if (html !== this.lastPanelHtml) { this.lastPanelHtml = html; this.hud.panel(html, this.panelCls || ''); }
  }

  updatePanel() {
    const inp = this.input;
    const kind = this.panelKind;
    if (kind === 'radio') this.renderRadio();
    if (kind === 'map' && this.t - (this.mapT || 0) > 0.25) { this.mapT = this.t; this.drawMapNow(); }
    if (kind === 'alarm') this.renderAlarm();
    if (kind === 'breakers') this.renderBreakers();
    let k = -1;
    for (let i = 0; i < 9; i++) if (inp.hit(`Digit${i + 1}`) || inp.hit(`Numpad${i + 1}`)) k = i;
    if (kind === 'keypad') { this.keypadKeys(); return; }
    if (kind === 'notes' && this.report.open && this.reportKeys(k)) return;
    if (k >= 0 && this.panelActions && this.panelActions[k]) this.panelActions[k]();
    const closeKeys = inp.hit('KeyE') || inp.hit('Escape') || inp.hit('KeyQ') || inp.clicks > 0
      || (kind === 'radio' && inp.hit('KeyV')) || (kind === 'map' && inp.hit('KeyM')) || (kind === 'notes' && inp.hit('KeyJ'));
    if (this.t - this.panelOpenedAt > 0.15 && closeKeys) this.closePanel();
  }

  openRadio() {
    this.panelCls = '';
    this.openPanel('<div class="sheet radio"></div>', '', 'radio');
    sound.radio(0.2);
    this.renderRadio();
  }

  renderRadio() {
    const acts = [];
    const rows = [];
    for (const k of this.radioOpts) {
      acts.push(() => { this.link.send({ t: 'radio', k }); this.closePanel(); });
      rows.push(`<div><b>${acts.length}</b>${esc(RADIO_LINES[k])}</div>`);
    }
    if (!rows.length) rows.push('<div class="dead">Nothing to say right now.</div>');
    this.panelActions = acts;
    this.refreshPanel(`<div class="sheet radio"><h3>WALKIE · CH 1 · GATEHOUSE DISPATCH</h3>${rows.join('')}<div class="close">[V] PUT IT AWAY</div></div>`);
  }

  openLog() {
    const rows = logbook(this.code ? this.code.split('').join('-') : '?-?-?').map(([d, t], i, a) => `<p class="${i === a.length - 1 ? 'last' : ''}"><b>${esc(d)}</b>${esc(t)}</p>`).join('');
    this.panelActions = [];
    this.openPanel(`<div class="sheet log"><h3>Kingsgate Mall · Night Security Log · D. Mercer</h3>${rows}<div class="close">[E] CLOSE THE BOOK</div></div>`, '', 'log');
  }

  openTape() {
    const rows = (this.tape || []).map(([d, t, n, who]) => `<div><span>${esc(d)}</span><span>${esc(t)}</span><span>STA ${n}</span><span>${esc(who)}</span></div>`).join('');
    this.panelActions = [];
    this.openPanel(`<div class="sheet tape"><h3>DETEX WATCHCLOCK · KINGSGATE</h3><div class="head"><span>DATE</span><span>TIME</span><span>STATION</span><span>KEY</span></div>${rows}<div class="close">[E] TEAR IT OFF</div></div>`, '', 'tape');
  }

  openAlarm() {
    this.panelActions = [];
    this.openPanel('<div class="sheet alarm"></div>', '', 'alarm');
    this.lastPanelHtml = null;
    this.renderAlarm();
  }

  renderAlarm() {
    const rows = WATCHED.map((k) => {
      const d = DOORS[k], st = doorState(this.doors[k]);
      const cls = st.open > 0.05 ? 'open' : st.locked ? 'ok' : 'warn';
      const txt = st.open > 0.05 ? 'OPEN' : st.locked ? 'LOCKED' : 'UNLOCKED';
      return `<div class="${cls}"><i></i>${esc(cap(d.name))}<span>${txt}</span></div>`;
    }).join('');
    const cams = this.breakers.cams;
    this.refreshPanel(`<div class="sheet alarm"><h3>KINGSGATE · ACCESS CONTROL</h3>${cams ? `<div class="grid">${rows}</div>` : '<div class="dead">NO POWER TO PANEL (check the CCTV / ALARM breaker)</div>'}<div class="close">[E] STEP AWAY</div></div>`);
  }

  openBreakers() {
    this.openPanel('<div class="sheet breakers"></div>', '', 'breakers');
    this.lastPanelHtml = null;
    this.renderBreakers();
  }

  renderBreakers() {
    this.panelActions = BREAKERS.map((b) => () => this.link.send({ t: 'use', k: `breaker:${b.id}` }));
    const rows = BREAKERS.map((b, i) => `<div class="${this.breakers[b.id] ? 'on' : 'off'}"><b>${i + 1}</b>${esc(b.name)}<span>${this.breakers[b.id] ? 'ON' : 'OFF'}</span></div>`).join('');
    this.refreshPanel(`<div class="sheet breakers"><h3>MAIN DISTRIBUTION · 480V</h3>${rows}<p class="note">Halvorsen's was disconnected in April. Tenant lights are off after closing.</p><div class="close">[1]-[6] THROW A BREAKER · [E] SHUT THE PANEL</div></div>`);
  }

  openKeypad() {
    this.keypad = '';
    this.openPanel('<div class="sheet keypad"></div>', '', 'keypad');
    this.renderKeypad();
  }

  renderKeypad(msg = '') {
    const shown = [0, 1, 2].map((i) => this.keypad[i] || '_').join(' ');
    this.hud.panel(`<div class="sheet keypad"><h3>D. MERCER</h3><div class="dial">${shown}</div><div class="dead">${esc(msg)}</div><div class="close">TYPE THE COMBINATION · [ENTER] TRY IT · [E] STEP AWAY</div></div>`);
  }

  keypadKeys() {
    const inp = this.input;
    for (let i = 0; i < 10; i++) {
      if ((inp.hit(`Digit${i}`) || inp.hit(`Numpad${i}`)) && this.keypad.length < 3) { this.keypad += String(i); sound.click(SPOTS.locker); this.renderKeypad(); }
    }
    if (inp.hit('Backspace')) { this.keypad = this.keypad.slice(0, -1); this.renderKeypad(); }
    if (inp.hit('Enter') && this.keypad.length === 3) {
      this.link.send({ t: 'code', v: this.keypad });
      this.keypad = '';
      setTimeout(() => { if (this.panelKind === 'keypad') { if (this.flags & 8) this.closePanel(); else this.renderKeypad(); } }, 400);
    }
    if (this.t - this.panelOpenedAt > 0.15 && (inp.hit('KeyE') || inp.hit('Escape') || inp.hit('KeyQ'))) this.closePanel();
  }

  openMap() {
    this.openPanel('<div class="mapwrap"><canvas id="mapCanvas"></canvas><div class="legend"><span class="g">■</span> locked <span class="a">■</span> shut, not locked <span class="r">■</span> open · <span class="s">●</span> clock station · C camera · [M] put it away</div></div>', '', 'map');
    this.drawMapNow();
  }

  drawMapNow() {
    const c = document.getElementById('mapCanvas');
    if (!c) return;
    const players = this.roster.map((r) => {
      const a = this.avatars.get(r.id);
      if (r.id === this.me) return { x: this.p.x, z: this.p.z, ry: this.p.ry, color: r.color, me: true, out: a.taken };
      return { x: a.x, z: a.z, ry: a.ry, color: r.color, me: false, out: a.taken || a.hidden };
    });
    drawMap(c, { doors: this.doors, punched: this.round.punched, round: this.round.n, players, dale: this.daleMode && this.daleMode !== 'trapped' ? { x: this.dale.x, z: this.dale.z } : null });
  }

  openNotes() {
    this.openPanel('<div class="sheet notes"></div>', '', 'notes');
    this.renderNotes();
  }

  renderNotes() {
    const R = this.report;
    let html;
    if (R.open) {
      const qs = REPORT.map((q, i) => {
        const opts = q.a.map((a, j) => `<div class="${R.answers[i] === j ? 'picked' : ''}"><b>${j + 1}</b>${esc(a)}</div>`).join('');
        return `<div class="q ${i === R.q ? 'cur' : ''}"><h4>${i + 1}. ${esc(q.q)}</h4>${opts}</div>`;
      }).join('');
      const ready = R.answers.every((a) => a != null);
      html = `<div class="sheet notes report"><h3>GATEHOUSE SECURITY · INCIDENT REPORT · KINGSGATE MALL · 10/25/96</h3>${qs}<div class="close">[1]-[4] ANSWER · [TAB] NEXT QUESTION · ${ready ? '[ENTER] FILE THE REPORT' : 'ANSWER ALL THREE TO FILE IT'}</div></div>`;
    } else {
      const items = CLUE_ORDER.filter((k) => this.clues.has(k)).map((k) => `<p><b>${esc(CLUES[k].title)}</b>${esc(CLUES[k].text)}</p>`).join('');
      html = `<div class="sheet notes"><h3>Notes · night of 10/24</h3>${items || '<p class="empty">Nothing yet. Dale\'s logbook is on the desk in the security office.</p>'}<div class="close">[J] CLOSE</div></div>`;
    }
    this.lastPanelHtml = null;
    this.refreshPanel(html);
  }

  reportKeys(k) {
    const inp = this.input, R = this.report;
    if (k >= 0 && k < REPORT[R.q].a.length) {
      this.link.send({ t: 'report', q: R.q, a: k });
      R.answers[R.q] = k;
      R.q = Math.min(REPORT.length - 1, R.q + 1);
      this.renderNotes();
      return true;
    }
    if (inp.hit('Tab')) { R.q = (R.q + 1) % REPORT.length; this.renderNotes(); return true; }
    if (inp.hit('Enter') && R.answers.every((a) => a != null)) { this.link.send({ t: 'file' }); this.closePanel(); return true; }
    return false;
  }

  // the tape in the VCR, Tuesday night, off camera 2 (the west concourse)
  openVcr() {
    const W = this.world;
    const dale = makePerson({ ...(this.dale.root.userData.rig.look), top: 'uniform', topColor: 0x2c3a52, hat: 'police', hatColor: 0x1e2636 });
    const it = makePerson('mqGuard');
    W.scene.add(dale, it);
    const hidden = this.hideDynamic();
    const C = CAMERAS[1];
    const shots = [
      { stamp: 'TUE 10/22  02:47:12', who: dale, at: [-37.5, 1.2], ry: Math.PI / 2, pose: { pose: 'walk', speed: 1.2 } },
      { stamp: 'TUE 10/22  02:47:31', who: dale, at: [-40.9, -0.5], ry: Math.PI / 2, pose: { pose: 'reach' } },
      { stamp: 'TUE 10/22  03:31:05', who: it, at: [-39.0, 0.6], ry: -Math.PI / 2, pose: { pose: 'walk', speed: 1 } },
      { stamp: 'TUE 10/22  03:31:09', who: it, at: [-33.5, -0.4], ry: -Math.PI / 2 - 0.5, pose: { pose: 'stand', lookYaw: 0.9, lookPitch: 0.15 } },
    ];
    const frames = shots.map((s) => this.cctv.still(this.renderer, {
      pos: C.pos, look: C.look, fov: 58, w: 360, h: 240, stamp: s.stamp,
      setup: () => {
        dale.visible = s.who === dale; it.visible = s.who === it;
        s.who.position.set(s.at[0], 0, s.at[1]);
        s.who.rotation.y = s.ry + Math.PI;
        for (let i = 0; i < 30; i++) s.who.userData.rig.update(0.05, { ...s.pose, stiff: s.who === it, noBlink: s.who === it });
      },
    }));
    dale.removeFromParent();
    it.removeFromParent();
    for (const o of hidden) o.visible = true;
    this.panelActions = [];
    this.openPanel(`<div class="photos vcr">${frames.map((f) => `<figure class="tv"><img src="${f}"></figure>`).join('')}</div><div class="caption">TAPE: "TUE 10/22 · CAM 2". DALE GOES INTO HALVORSEN'S. SOMETHING IN HIS UNIFORM COMES OUT. [E]</div>`, '', 'vcr');
  }

  // Dale's roll of film from Photo Finish: four nights of Halvorsen's window
  openPhotos() {
    const W = this.world;
    const hidden = this.hideDynamic();
    const mq = this.mq.list.slice(0, 5);
    const keep = mq.map((m) => ({ ry: m.root.rotation.y, x: m.root.position.x, z: m.root.position.z, y: m.root.position.y, pose: m.pose }));
    const face = makePerson('mq1');
    W.scene.add(face);
    face.visible = false;
    const pos = [-36.5, 1.5, -1.0], look = [-41, 1.3, -4.6];
    const flash = W.hisLight;
    const kf = { i: flash.intensity, p: flash.position.clone(), t: flash.target.position.clone(), a: flash.angle };
    const shots = [
      { stamp: "'96 10 15", arrange: () => {} },
      { stamp: "'96 10 17", arrange: () => mq.forEach((m) => { m.root.rotation.y = Math.atan2(-(pos[0] - m.root.position.x), -(pos[2] - m.root.position.z)) + Math.PI; }) },
      { stamp: "'96 10 19", arrange: () => { mq[0].root.position.x += 1.4; mq[0].root.position.y = 0; mq[1].root.visible = false; } },
      { stamp: "'96 10 21", arrange: () => { face.visible = true; face.position.set(pos[0] - 0.7, 0, pos[2] - 0.5); face.rotation.y = Math.atan2(-(pos[0] - face.position.x), -(pos[2] - face.position.z)) + Math.PI; for (let i = 0; i < 30; i++) face.userData.rig.update(0.05, { pose: 'reach', stiff: true, noBlink: true, lookPitch: 0.25 }); } },
    ];
    const frames = shots.map((s) => this.cctv.still(this.renderer, {
      pos, look, fov: 50, w: 300, h: 220, stamp: s.stamp, mono: false, flash: true,
      setup: () => {
        s.arrange();
        flash.intensity = 120; flash.angle = 0.9;
        flash.position.set(...pos);
        flash.target.position.set(...look);
      },
      undo: () => {
        mq.forEach((m, i) => { m.root.rotation.y = keep[i].ry; m.root.position.set(keep[i].x, keep[i].y, keep[i].z); m.root.visible = true; });
        face.visible = false;
      },
    }));
    flash.intensity = kf.i; flash.position.copy(kf.p); flash.target.position.copy(kf.t); flash.angle = kf.a;
    face.removeFromParent();
    for (const o of hidden) o.visible = true;
    this.panelActions = [];
    this.openPanel(`<div class="photos">${frames.map((f, i) => `<figure style="--r:${(i % 2 ? 2 : -2) + i * 0.5}deg"><img src="${f}"></figure>`).join('')}</div><div class="caption">DALE'S ROLL, FROM PHOTO FINISH: HALVORSEN'S WINDOW, FOUR NIGHTS. [E]</div>`, '', 'photos');
  }

  // everyone and everything that moves, out of the picture for a still
  hideDynamic() {
    const list = [...this.avatars.values()].map((a) => a.root).concat(this.stalker ? [this.stalker.root] : [], this.manager ? [this.manager.root] : [], [this.dale.root]);
    const vis = list.filter((o) => o.visible);
    for (const o of vis) o.visible = false;
    return vis;
  }

  // ------------------------------------------------------- taken -------
  startTaken(by) {
    this.mode = 'taken';
    this.cine = { t: 0 };
    sound.jumpscare();
    voice.stop();
    this.closePanel();
    this.hud.cctv(false);
    const cam = this.camera;
    if (this.hide) {
      const v = hideView(this.hide);
      cam.position.set(v.x, v.y, v.z);
    }
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    fwd.y = 0;
    fwd.normalize();
    const s = (this.scareModel = by === 'stalker' ? this.scare.stalker : this.scare.mannequin);
    s.position.set(cam.position.x + fwd.x * 0.45, cam.position.y - 1.7, cam.position.z + fwd.z * 0.45);
    s.rotation.y = Math.atan2(-fwd.x, -fwd.z);
    s.visible = true;
    this.hud.prompt(null);
    this.p.flash = false;
  }

  updateTaken(dt) {
    const c = this.cine, t = (c.t += dt);
    this.scareModel.userData.rig.update(dt, { pose: 'reach', speed: 0, lookYaw: 0, lookPitch: 0.25, stiff: true, noBlink: true });
    this.camera.rotation.z = (Math.random() - 0.5) * 0.1 * (1 - span(t, 0.8, 1.5));
    this.fx.glitch = t < 1.6 ? 1 : 0;
    this.fx.staticAmt = t < 1.3 ? (Math.random() < 0.3 ? 0.5 : 0.08) : span(t, 1.3, 1.7);
    this.fear = 1;
    if (t > 1.7) { this.scareModel.visible = false; this.fadeTo = 1; }
    if (t > 3.2) {
      this.fx.staticAmt = 0;
      this.fx.glitch = 0;
      this.fadeTo = 0;
      this.camera.rotation.z = 0;
      this.hud.banner('YOU WERE TAKEN', 'Watching the others...');
      setTimeout(() => this.hud.banner(null), 4000);
      this.mode = 'spectate';
      this.viewing = null;
    }
  }

  updateSpectate() {
    const list = [...this.avatars.values()].filter((a) => a.alive && !a.isMe);
    if (!list.length) { this.viewing = null; this.hud.prompt(null); return; }
    let i = list.indexOf(this.viewing);
    if (i < 0) i = 0;
    else if (this.input.clicks > 0 || this.input.hit('Space')) i = (i + 1) % list.length;
    this.viewing = list[i];
    this.hud.prompt(`Watching ${this.viewing.name}. Click to switch.`);
  }

  // a mannequin moved somewhere you couldn't see: you hear it
  mannequinMoved(m) {
    const last = this.creakT.get(m) || 0;
    if (this.t - last < 0.7) return;
    this.creakT.set(m, this.t);
    const c = this.camera.position;
    const d = Math.hypot(m.x - c.x, m.z - c.z);
    if (d > 26) return;
    sound.creak({ x: m.x, y: 1.0, z: m.z }, d < 6 ? 1.6 : 1);
    if (d < 7) this.fear = Math.max(this.fear, 0.8 - d / 10);
  }

  // --------------------------------------------------- the world, sound --
  updateWorld(dt) {
    const W = this.world;
    // everyone's flashlights: yours first (it casts the shadows)
    const flashes = [];
    for (const r of this.roster) {
      const a = this.avatars.get(r.id);
      if (r.id === this.me) {
        const cam = this.camera;
        const on = this.p.flash && (this.mode === 'play' || this.mode === 'panel');
        flashes.unshift({ on, pos: cam.position.clone().add(new THREE.Vector3(0.14, -0.2, 0).applyEuler(cam.rotation)), dir: cam.getWorldDirection(new THREE.Vector3()) });
      } else {
        const on = a && a.flash && a.alive && !a.hidden && !a.cctv;
        flashes.push({ on, pos: a.lightPos.clone(), dir: a.lightDir.clone() });
      }
    }
    const his = this.stalker && this.stalker.light.on ? this.stalker.light : null;
    // the lights near it misbehave
    this.flickerT -= dt;
    if (this.flickerT <= 0) {
      this.flickerT = 0.08;
      const fl = new Map();
      const s = this.stalker;
      if (s) for (const f of FIXTURES) {
        const d = Math.hypot(f.x - s.x, f.z - s.z);
        if (d < 9 && !['moon', 'lot', 'desk'].includes(f.breaker)) fl.set(f, Math.random() < (s.flags & 2 ? 0.45 : 0.2) ? 0.05 : 0.7 + Math.random() * 0.3);
      }
      const dawn = this.clock > 29.95 ? clamp01((this.t - (this.dawnStart ?? (this.dawnStart = this.t))) / 8) : 0;
      if (fl.size || this.flicker.size || dawn !== this.lastDawn) W.setBreakers(this.breakers, (this.flags & 2) !== 0, { force: true, flicker: fl, dawn });
      this.lastDawn = dawn;
      this.flicker = fl;
    }
    W.update(dt, this.t, { flashes, his, camera: this.camera });
    // the monitors, if you're in the office and facing them
    const c = this.camera.position;
    const room = roomAt(c.x, c.z);
    const facing = room && room.id === 'security' && this.camera.getWorldDirection(this.tmp).dot(this.tmp2.set(-c.x, 0, -26.6 - c.z).normalize()) > 0.2;
    this.cctv.update(this.renderer, dt, this.mode !== 'cctv' && facing, this.breakers.cams);
    const lit = lightAt(c.x, 1.5, c.z, { breakers: this.breakers, carousel: (this.flags & 2) !== 0 });
    sound.setEnv({ lit, room: room ? (room.group === 1 ? 'big' : ['women', 'men', 'restHall'].includes(room.id) ? 'restroom' : 'back') : 'big', outdoor: room && (room.id === 'southVest' || room.id === 'eastVest') ? 1 : 0 });
    sound.update(dt);
  }

  // its footsteps and keys, everyone else's footsteps
  stepSounds(dt) {
    const s = this.stalker;
    if (s && s.moved > 0) {
      s.stepAcc += s.moved;
      if (s.stepAcc > 0.85) {
        s.stepAcc = 0;
        sound.heavyStep({ x: s.x, y: 0.1, z: s.z });
        if (Math.random() < 0.5) sound.keys({ x: s.x, y: 1.0, z: s.z }, 3);
      }
    }
    for (const a of this.avatars.values()) {
      if (a.isMe || !a.alive || a.hidden || a.cctv) continue;
      a.stepAcc = (a.stepAcc || 0) + a.speed * dt;
      if (a.stepAcc > 0.75) { a.stepAcc = 0; sound.step(this.surface(a.x, a.z), 0.55, { x: a.x, y: 0.1, z: a.z }); }
    }
    const D = this.dale;
    if (this.daleMode === 'follow' && D.moved > 0) {
      D.stepAcc += D.moved;
      if (D.stepAcc > 0.7) { D.stepAcc = 0; sound.step(this.surface(D.x, D.z), 0.5, { x: D.x, y: 0.1, z: D.z }); }
    }
  }

  // the drone, your heart
  updateMood(dt) {
    if (this.mode === 'intro') return;
    const night = this.hourIdx >= 2 ? 1 : 0.4;
    let tension = 0.04 + night * 0.08 + (this.hourIdx >= 7 && this.hourIdx < 8 ? 0.25 : 0);
    const cam = this.camera.position;
    let near = 99;
    for (const m of this.mq.list) if (m.active) near = Math.min(near, Math.hypot(m.x - cam.x, m.z - cam.z));
    tension = Math.max(tension, clamp01((14 - near) / 14) * 0.7);
    const s = this.stalker;
    if (s) {
      const d = Math.hypot(s.x - cam.x, s.z - cam.z);
      tension = Math.max(tension, clamp01((30 - d) / 30) * 0.6);
      if (s.flags & 2) tension = 1;
      if (d < 10 || (s.flags & 2 && d < 25)) this.fear = Math.max(this.fear, clamp01((10 - d) / 10));
    }
    if (this.fear > 0.4 && this.mode !== 'spectate' && this.mode !== 'taken') {
      this.heartT -= dt;
      if (this.heartT <= 0) { this.heartT = 0.45 + (1 - this.fear) * 0.5; sound.heartbeat(1 + this.fear, 0.3 + this.fear * 0.5); }
    }
    if (Math.abs(tension - sound.tension) > 0.04) sound.setTension(tension, 2.5);
    this.fear = Math.max(0, this.fear - dt * 0.25);
  }

  updateFx(dt) {
    const fx = this.fx;
    if (this.mode !== 'intro') fx.bars = 0;
    fx.fear = this.fear * 0.8;
    fx.cctv = this.mode === 'cctv';
    fx.exposure = this.mode === 'cctv' ? 1.45 : 1.0;
    fx.saturation = 1;
    if (this.mode === 'cctv' && !this.breakers.cams) fx.staticAmt = 0.92;
    else if (this.mode !== 'taken' && this.mode !== 'intro') { fx.staticAmt = lerp(fx.staticAmt, 0, 1 - Math.exp(-dt * 6)); fx.glitch = lerp(fx.glitch, 0, 1 - Math.exp(-dt * 6)); }
    if (this.mode !== 'taken' && this.mode !== 'intro') this.fadeTo = 0;
    fx.fade = lerp(fx.fade, this.fadeTo, 1 - Math.exp(-dt * 2));
  }

  updateHud() {
    const hud = this.hud, p = this.p;
    if (this.mode === 'intro') return;
    const H = HOURS[Math.max(0, this.hourIdx)];
    hud.clock(this.clock, this.hourIdx >= 0 ? H.sub : '');
    const playing = this.mode === 'play';
    hud.stamina(playing && p.stamina < STAMINA_MAX - 0.05 ? p.stamina / STAMINA_MAX : null);
    hud.flashlight(p.flash);
    hud.crosshair(playing);
    if (this.mode === 'cctv') {
      const C = CAMERAS[this.camIdx];
      hud.camOverlay(C.name, C.n, this.clock, this.breakers.cams);
      hud.prompt(null);
    } else if (this.mode === 'hidden') hud.prompt('Hiding. Keep still.', '[E] Get out');
    else if (playing && this.target) {
      if (this.target.kind === 'door') {
        const pr = this.doorPrompt(this.target.d, this.target.k);
        hud.prompt(pr.text || pr.e || pr.r, pr.text ? [pr.e, pr.r].filter(Boolean).join('   ') : pr.e && pr.r ? pr.r : null);
      } else {
        const dv = this.doorInView, pr = dv ? this.doorPrompt(dv.d, dv.k) : null;
        hud.prompt(this.target.label, pr && pr.r ? pr.r : null);
      }
    } else if (this.mode !== 'spectate') hud.prompt(null);
    hud.hint(playing ? '[F] flashlight   [V] walkie   [M] map   [J] notes   [1-4] shout   [C] crouch' : '');
    if (Math.floor(this.t * 2) !== this.teamT) { this.teamT = Math.floor(this.t * 2); this.updateTeam(); }
  }

  render() {
    const fx = this.fx;
    fx.time = this.t;
    // the flashlight's shadows only need redrawing while it's on
    this.renderer.shadowMap.needsUpdate = this.world.flashlights[0].intensity > 0;
    if (this.mode === 'cctv') {
      const cam = this.cctv.cams[this.camIdx];
      cam.aspect = this.camera.aspect;
      cam.updateProjectionMatrix();
      this.cctv.gain(true);
      this.post.render((target) => this.world.render(this.renderer, cam, target), fx);
      this.cctv.gain(false);
      return;
    }
    this.post.render((target) => this.world.render(this.renderer, this.camera, target), fx);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // the end
  over() {
    this.mode = 'over';
    this.hud.cctv(false);
    sound.setTension(0, 3);
  }

  dispose() {
    for (const f of this.off) f();
    sound.quiet();
    voice.stop();
    this.cutscene.finish();
    for (const a of this.avatars.values()) a.dispose();
    if (this.stalker) this.stalker.dispose();
    if (this.manager) this.manager.dispose();
    this.dale.dispose();
    this.mq.dispose();
    this.cctv.dispose();
    for (const s of Object.values(this.scare)) s.removeFromParent();
    this.world.setBreakers({ concourse: true, court: true, food: true, stores: false, back: true, cams: true }, false, { force: true });
    this.world.setFlags(0);
    MALL_UNIFORMS.mallScale.value = 1;
  }
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
void clockText;
