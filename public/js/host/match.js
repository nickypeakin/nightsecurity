// One night at Kingsgate Mall, run by the hosting player's browser. It
// keeps the clock and the story moving, owns everything shared (every
// gate and door and whether it's locked, the breakers, the clock stations,
// what you've found out), runs the mannequins and the thing in Dale's
// uniform, and decides who they catch. Clients move their own guards and
// report where they are and what they're looking at. No DOM or three.js
// here, so the tests run it in Node.

import { makeRng } from '../shared/rng.js';
import { INTRO_LEN, SNAP_EVERY, REACH, HOUR_LEN, MANNEQUIN as MQ, EYE } from '../shared/config.js';
import { DOORS, DOOR_INDEX, STORES, STATIONS, CAMERAS, HIDES, SPOTS, START_SPOTS, BREAKERS, DALE_SPOTS, UNIFORM_HOME, Solids, NavGrid, staticSolids, doorBox, roomAt } from '../shared/mall.js';
import { lightAt } from '../shared/lights.js';
import { HOURS, DISPATCH, RADIO_LINES, CHANNEL2, PA_LINES, DALE, CLUES, CLUE_ORDER, REPORT, SHOUTS, ENDINGS } from '../shared/story.js';
import { Mannequins } from './mannequins.js';
import { Stalker } from './stalker.js';
import { FieldCache, follow } from './nav.js';
import { later, runTimers } from './timers.js';

const r2 = (v) => Math.round(v * 100) / 100;
const PLACES = ['cage', 'freezer', 'elevator'];
const REPORT_PLACE = { cage: 1, freezer: 2, elevator: 3 };
// the doors that count on the alarm panel: every gate onto the concourse,
// the doors to the outside, and the back ways in
export const WATCHED = DOORS.map((d, k) => (d.panel && (d.kind !== 'door' || d.id === 'fcHall' || d.id === 'halvBack') ? k : -1)).filter((k) => k >= 0);
const POWER = ['concourse', 'court', 'food', 'back', 'cams'];
const DOOR_SPEED = { gate: 0.42, door: 2.2, cage: 1.6, glass: 3, rollup: 0.5 };

// the tape in the watchclock: last week's punches, before tonight's
const OLD_TAPE = [
  ['10/21', '23:02', 1, 'D. MERCER'], ['10/21', '23:09', 2, 'D. MERCER'], ['10/21', '23:15', 3, 'D. MERCER'],
  ['10/21', '23:31', 4, 'D. MERCER'], ['10/22', '02:47', 3, 'D. MERCER'], ['10/22', '03:31', 3, '---'],
  ['10/23', '03:12', 3, '---'], ['10/23', '03:19', 2, '---'], ['10/23', '03:40', 6, '---'],
  ['10/24', '03:14', 3, '---'], ['10/24', '03:22', 2, '---'],
];

export class Match {
  // roster: [{ id, name, color }]; send(to, msg): to is a player id or null for everyone
  constructor({ seed, roster, send, start = 0 }) {
    this.seed = seed;
    this.send = send;
    this.rng = makeRng(`${seed}:host`);
    this.t = 0;
    this.ticks = 0;
    this.over = false;
    this.players = roster.map((r, i) => ({
      id: r.id, name: r.name, color: r.color, i,
      x: START_SPOTS[i % 4].x, z: START_SPOTS[i % 4].z, ry: START_SPOTS[i % 4].ry, rx: 0,
      st: 'in', fl: false, mv: 0, cr: false, cam: -1, hide: null, hideT: 0, tEnd: null, punches: 0,
    }));
    const rng = this.rng;
    this.code = [1, 2, 3].map(() => 1 + Math.floor(rng() * 9)).join('');
    this.place = rng.pick(PLACES);
    // the gates the shop staff forgot to pull down
    const open = new Set(rng.shuffle(STORES.filter((s) => s.type !== 'vacant' && s.type !== 'closing').map((s) => s.id)).slice(0, 4));
    this.leftOpen = [...open];
    this.doors = DOORS.map((d) => {
      const s = { open: 0, target: 0, locked: true, hp: 100, broken: false };
      if (open.has(d.id)) Object.assign(s, { open: 1, target: 1, locked: false });
      if (['south', 'east', 'dockDoor', 'office', 'electrical', 'janitor', 'breakroom', 'stockFloor'].includes(d.id)) s.locked = false;
      if (d.id === 'security') Object.assign(s, { open: 1, target: 1, locked: false });
      return s;
    });
    this.breakers = { concourse: true, court: true, food: true, stores: false, back: true, cams: true };
    this.flags = { pa: false, carousel: false, tvs: false, keys: false, uniformGone: false, stockroom: false };
    this.clues = new Set();
    this.obj = [];
    this.round = { n: 0, punched: [0, 0, 0, 0, 0, 0] };
    this.punchTotal = 0;
    this.tape = [];
    this.radioBusy = 0;
    this.radioUsed = new Set();
    this.solids = new Solids(staticSolids());
    this.nav = new NavGrid(this.solids);
    this.fields = new FieldCache(this.nav);
    this.mq = new Mannequins(this);
    this.stalker = new Stalker(this);
    this.siege = false;
    this.manager = { on: true, x: 0, z: 3.4, ry: 0, anim: 'stand', path: null };
    const ds = DALE_SPOTS[this.place];
    this.dale = { mode: 'trapped', x: ds.x, z: ds.z, ry: 0, anim: 'huddle', leader: null, talkT: 25, px: ds.x, pz: ds.z };
    this.report = { open: false, answers: [null, null, null], at: 0 };
    this.hourIdx = -1;
    this.hourT = 0;
    this.clock = 21.92;
    this.startHour = Math.max(0, Math.min(HOURS.length - 1, start | 0));
    this.endAt = null;
    this.paT = 0;
    this.paLine = 0;
    this.panelOpen = this.openCount();
    this.updateDoorSolids();
  }

  emit(msg) { this.send(null, msg); }
  tell(p, msg) { this.send(p.id, msg); }
  player(id) { return this.players.find((p) => p.id === id); }
  get alive() { return this.players.filter((p) => p.st === 'in'); }
  get hourId() { return this.hourIdx >= 0 ? HOURS[this.hourIdx].id : 'intro'; }
  we(text) {
    const solo = this.players.length === 1;
    return text.replace(/\{We\}/g, solo ? 'I' : 'We').replace(/\{we\}/g, solo ? 'I' : 'we').replace(/\{us\}/g, solo ? 'me' : 'us')
      .replace(/\{our\}/g, solo ? 'my' : 'our').replace(/\{your\}/g, solo ? 'your' : 'your').replace(/\{place\}/g, DALE_SPOTS[this.place].room);
  }

  // ----------------------------------------------------------- the light
  lightState() { return { breakers: this.breakers, carousel: this.flags.carousel, stockroom: this.flags.stockroom }; }
  lightAt(x, y, z) { return lightAt(x, y, z, this.lightState()); }

  // Is anybody looking at (x, y, z)? Returns who, or null. Players see
  // what's in front of them, near, lit or in their beam, with nothing in
  // the way; whoever's at the monitors sees what their camera does.
  observed(x, y, z) {
    let lit = -1;
    for (const p of this.players) {
      if (p.st !== 'in' || p.hide != null) continue;
      if (p.cam >= 0) {
        if (!this.breakers.cams) continue;
        const c = CAMERAS[p.cam];
        const dx = x - c.pos[0], dy = y - c.pos[1], dz = z - c.pos[2], d = Math.hypot(dx, dy, dz);
        if (d > MQ.camSee) continue;
        const lx = c.look[0] - c.pos[0], ly = c.look[1] - c.pos[1], lz = c.look[2] - c.pos[2], ll = Math.hypot(lx, ly, lz);
        if ((dx * lx + dy * ly + dz * lz) / (d * ll) < MQ.camFov) continue;
        if (lit < 0) lit = this.lightAt(x, y, z);
        if (lit < 0.05 && d > 9) continue;
        if (!this.nav.los(c.pos[0], c.pos[2], x, z)) continue;
        return p;
      }
      const eye = p.cr ? 1.05 : EYE;
      const dx = x - p.x, dy = y - eye, dz = z - p.z, d = Math.hypot(dx, dy, dz);
      if (d < 0.9) return p;
      const vx = -Math.sin(p.ry) * Math.cos(p.rx), vy = Math.sin(p.rx), vz = -Math.cos(p.ry) * Math.cos(p.rx);
      const cos = (vx * dx + vy * dy + vz * dz) / d;
      if (cos < MQ.fov) continue;
      if (lit < 0) lit = this.lightAt(x, y, z);
      let range = lit > 0.08 ? Math.min(MQ.seeLit, 6 + lit * 60) : MQ.seeDark;
      if (p.fl && cos > MQ.beam) range = Math.max(range, MQ.seeFlash);
      if (d > range) continue;
      if (!this.nav.los(p.x, p.z, x, z)) continue;
      return p;
    }
    return null;
  }

  // ------------------------------------------------------- objectives --
  setObjectives(list) {
    this.obj = list.map((o) => ({ n: 0, done: false, ...o }));
    this.emit({ t: 'obj', list: this.obj });
  }
  addObjective(o, top = false) {
    if (this.obj.some((x) => x.id === o.id && !x.done)) return;
    this.obj = this.obj.filter((x) => x.id !== o.id);
    const item = { n: 0, done: false, ...o };
    if (top) this.obj.unshift(item); else this.obj.push(item);
    this.emit({ t: 'obj', list: this.obj });
  }
  objective(id) { return this.obj.find((o) => o.id === id); }
  done(id) {
    const o = this.objective(id);
    if (!o || o.done) return false;
    o.done = true;
    if (o.of) o.n = o.of;
    this.emit({ t: 'obj', list: this.obj, done: id });
    return true;
  }
  progress(id, n, text = null) {
    const o = this.objective(id);
    if (!o || (o.n === n && (!text || o.text === text))) return;
    o.n = n;
    if (text) o.text = text;
    if (o.of && n >= o.of) this.done(id);
    else this.emit({ t: 'obj', list: this.obj });
  }
  isDone(id) { const o = this.objective(id); return !!(o && o.done); }

  // ---------------------------------------------------------- talking --
  say(who, text, extra = {}) { this.emit({ t: 'say', who, text: this.we(text), ...extra }); }
  // dispatch (or Dale on channel two) over everyone's walkie, a line at a time
  radioSay(lines, { who = 'Gatehouse', voice = 'radio', then = null, ch2 = false } = {}) {
    let at = Math.max(0, this.radioBusy - this.t) + 0.6;
    for (const ln of lines) {
      const text = this.we(ln);
      later(this, at, () => { if (!this.over) this.emit({ t: 'say', who, text, voice, radio: true, ch2 }); });
      at += 1.4 + text.length * 0.058;
    }
    this.radioBusy = this.t + at;
    if (then) later(this, at, then);
  }
  clue(k) {
    if (!CLUES[k] || this.clues.has(k)) return;
    this.clues.add(k);
    this.emit({ t: 'clue', k });
  }

  // ------------------------------------------------- messages from people --
  handle(id, msg) {
    const p = this.player(id);
    if (!p || this.over) return;
    if (msg.t === 'st') {
      if (p.st !== 'in') return;
      if (p.hide == null && Number.isFinite(msg.x) && Number.isFinite(msg.z)) { p.x = msg.x; p.z = msg.z; }
      if (Number.isFinite(msg.ry)) p.ry = msg.ry;
      if (Number.isFinite(msg.rx)) p.rx = Math.max(-1.5, Math.min(1.5, msg.rx));
      p.mv = msg.mv | 0;
      p.fl = !!msg.fl;
      p.cr = !!msg.cr;
      const cam = Number.isInteger(msg.cam) ? msg.cam : -1;
      p.cam = cam >= 0 && cam < CAMERAS.length && this.near(p, 'monitors', 1.5) ? cam : -1;
      return;
    }
    if (p.st !== 'in' || this.hourIdx < 0) {
      if (msg.t === 'report' || msg.t === 'file') this.reportMsg(p, msg);
      return;
    }
    switch (msg.t) {
      case 'use': this.use(p, String(msg.k || '')); break;
      case 'lock': this.lockDoor(p, String(msg.k || '')); break;
      case 'code': this.tryCode(p, String(msg.v || '')); break;
      case 'radio': this.radio(p, String(msg.k || '')); break;
      case 'look': this.look(p, String(msg.k || '')); break;
      case 'shout': if (SHOUTS[msg.k]) this.emit({ t: 'say', id: p.id, who: p.name, text: SHOUTS[msg.k], voice: 'friend', pos: [r2(p.x), 1.6, r2(p.z)] }); break;
      case 'report': case 'file': this.reportMsg(p, msg); break;
    }
  }

  near(p, spot, extra = 0.9) {
    const s = SPOTS[spot];
    return !!s && Math.hypot(p.x - s.x, p.z - s.z) < REACH + s.r + extra;
  }
  nearDoor(p, d) {
    // anywhere along the opening, either side
    const along = d.axis === 'x' ? p.x : p.z, across = d.axis === 'x' ? p.z : p.x;
    const off = Math.max(0, d.a - along, along - d.b);
    return Math.hypot(off, across - d.at) < REACH + 1.0;
  }

  use(p, k) {
    if (k.startsWith('door:')) { this.useDoor(p, k.slice(5)); return; }
    if (k.startsWith('breaker:')) { this.useBreaker(p, k.slice(8)); return; }
    if (k.startsWith('hide:')) { this.useHide(p, k.slice(5)); return; }
    if (k.startsWith('station')) {
      const n = k.slice(7) | 0;
      if (n >= 1 && n <= 6 && this.near(p, k)) this.punch(p, n);
      return;
    }
    if (!SPOTS[k] || !this.near(p, k)) return;
    switch (k) {
      case 'logbook':
        this.clue('logbook');
        this.tell(p, { t: 'logbook', code: this.code });
        this.done('logbook');
        if (this.hourIdx >= 2) this.photosObjective();
        break;
      case 'watchclock':
        this.clue('tape');
        this.tell(p, { t: 'tape', rows: [...OLD_TAPE, ...this.tape] });
        break;
      case 'vcr': this.clue('vcr'); this.tell(p, { t: 'vcr' }); break;
      case 'photos': this.clue('photos'); this.done('photos'); this.tell(p, { t: 'photos' }); break;
      case 'inventory': this.clue('inventory'); break;
      case 'car': this.clue('car'); break;
      case 'keyCabinet': this.tell(p, { t: 'toast', text: 'Every hook is labelled. CAGE, FREEZER and FREIGHT ELEV are empty. So is MERCER (MASTER).' }); break;
      case 'lostFound': this.tell(p, { t: 'toast', text: 'Lost and found: three umbrellas, a Walkman, one mitten, and a Gatehouse Security patch that\'s been torn off a sleeve.' }); break;
      case 'pa':
        if (this.flags.pa) {
          this.flags.pa = false;
          this.done('pa');
          this.emit({ t: 'fx', k: 'paOff' });
        } else this.tell(p, { t: 'toast', text: 'The PA\'s quiet. Keep it that way.' });
        break;
      case 'carousel':
        if (this.flags.carousel) { this.flags.carousel = false; this.done('carousel'); this.emit({ t: 'fx', k: 'carouselOff' }); }
        break;
      case 'radio': break;
      case 'locker': break;
    }
  }

  // ------------------------------------------------------ doors and gates
  // E: open or shut it (pull a gate down, push it up)
  useDoor(p, id) {
    const k = DOOR_INDEX[id];
    if (k == null) return;
    const d = DOORS[k], s = this.doors[k];
    if (!this.nearDoor(p, d)) return;
    if (d.kind === 'glass' || d.kind === 'rollup') { this.tell(p, { t: 'toast', text: d.kind === 'glass' ? 'Your post is inside. Lock it, don\'t leave by it.' : 'The dock door stays down. Lock it.' }); return; }
    if (s.locked && s.open < 0.05) { this.emit({ t: 'fx', k: 'locked', door: id }); return; }
    const opening = s.target < 0.5;
    s.target = opening ? 1 : 0;
    this.emit({ t: 'fx', k: opening ? 'open' : 'shut', door: id });
    if (opening) this.openedBy(p, k);
  }

  // R: lock it or unlock it (only when it's shut)
  lockDoor(p, id) {
    const k = DOOR_INDEX[id];
    if (k == null) return;
    const d = DOORS[k], s = this.doors[k];
    if (!this.nearDoor(p, d) || !d.lock) return;
    if (s.broken) { this.tell(p, { t: 'toast', text: 'The lock\'s broken.' }); return; }
    if (s.open > 0.05) { this.tell(p, { t: 'toast', text: d.kind === 'gate' ? 'Pull it all the way down first.' : 'Shut it first.' }); return; }
    if (d.key && !this.flags.keys) { this.emit({ t: 'fx', k: 'locked', door: id }); this.tell(p, { t: 'toast', text: 'None of your keys fit. Dale had the only key to this.' }); return; }
    s.locked = !s.locked;
    s.hp = 100;
    this.emit({ t: 'fx', k: s.locked ? 'lock' : 'unlock', door: id });
    if (s.locked && d.id === 'security' && this.hourId === 'last') this.done('deadbolt');
    if (!s.locked && d.id === 'south' && this.hourId === 'dawn') this.letManagerIn();
    this.checkLockup();
  }

  openedBy(p, k) {
    const d = DOORS[k];
    // the door Dale's behind
    if (this.dale.mode === 'trapped' && d.id === DALE_SPOTS[this.place].door) {
      this.dale.mode = 'follow';
      this.dale.leader = p.id;
      this.dale.anim = 'stand';
      this.clue('dale');
      this.done('free');
      this.done('locker');
      this.addObjective({ id: 'escort', text: 'Get Dale to the security office' }, true);
      later(this, 1.0, () => this.say('Dale', DALE.found[0], { voice: 'dale', at: [r2(this.dale.x), 1.5, r2(this.dale.z)] }));
      later(this, 4.5, () => this.say('Dale', DALE.found[1], { voice: 'dale', at: [r2(this.dale.x), 1.5, r2(this.dale.z)] }));
    }
  }

  // a mannequin lifts a gate that isn't locked, or opens a door
  forceDoor(k, by) {
    const d = DOORS[k], s = this.doors[k];
    if (s.locked && !s.broken) return;
    s.target = d.kind === 'gate' ? Math.max(s.open, 0.5) : 1;
    this.emit({ t: 'fx', k: d.kind === 'gate' ? 'rattle' : 'creak', door: d.id, by });
  }

  breakDoor(k) {
    const s = this.doors[k];
    s.locked = false;
    s.broken = true;
    s.target = 1;
    this.emit({ t: 'fx', k: 'break', door: DOORS[k].id });
  }

  // the thing with Dale's keys unlocks k (and lifts it, if raise)
  stalkerOpens(k, raise) {
    const d = DOORS[k], s = this.doors[k];
    const was = s.locked;
    if (s.broken) return;
    s.locked = false;
    if (raise > 0 && d.kind !== 'glass' && d.kind !== 'rollup') s.target = d.kind === 'gate' ? Math.max(s.open, raise) : 1;
    this.emit({ t: 'fx', k: 'unlock', door: d.id, by: 'stalker' });
    if (was && d.id === 'H' && !this.flags.halvTold) { this.flags.halvTold = true; this.radioSay(DISPATCH.halvOpen); }
  }

  stalkerBreaker(id) {
    if (!this.breakers[id]) return;
    this.breakers[id] = false;
    this.emit({ t: 'fx', k: 'breaker', id, off: true, x: SPOTS.breaker.x, z: SPOTS.breaker.z });
    this.powerObjective();
    if (id === 'cams') this.radioSay(DISPATCH.cams);
  }

  useBreaker(p, id) {
    if (!(id in this.breakers) || !this.near(p, 'breaker')) return;
    this.breakers[id] = !this.breakers[id];
    this.emit({ t: 'fx', k: 'breaker', id, off: !this.breakers[id], x: SPOTS.breaker.x, z: SPOTS.breaker.z });
    if (POWER.every((b) => this.breakers[b])) this.done('power');
  }

  powerObjective() {
    if (POWER.every((b) => this.breakers[b])) return;
    this.addObjective({ id: 'power', text: 'Reset the breakers (electrical room, off the service corridor)' }, true);
  }

  useHide(p, id) {
    const H = HIDES.find((h) => h.id === id);
    if (!H) return;
    if (p.hide === id) {
      p.hide = null;
      const out = { n: [0, -0.9], s: [0, 0.9], e: [0.9, 0], w: [-0.9, 0] }[H.face];
      p.x = H.x + out[0]; p.z = H.z + out[1];
      this.tell(p, { t: 'tp', x: p.x, z: p.z });
      this.emit({ t: 'fx', k: 'hideOut', id: H.id });
      return;
    }
    if (p.hide != null || Math.hypot(p.x - H.x, p.z - H.z) > REACH + 1.2) return;
    if (this.players.some((q) => q.hide === id)) { this.tell(p, { t: 'toast', text: 'Somebody\'s already in there.' }); return; }
    p.hide = id;
    p.hideT = this.t;
    p.x = H.x; p.z = H.z;
    p.cam = -1;
    this.emit({ t: 'fx', k: 'hideIn', id: H.id });
  }

  tryCode(p, v) {
    if (!this.near(p, 'locker')) return;
    if (this.flags.keys) return;
    if (v.replace(/\D/g, '') === this.code) {
      this.flags.keys = true;
      this.clue('locker');
      this.done('locker');
      this.emit({ t: 'fx', k: 'lockerOpen' });
      this.emit({ t: 'toast', text: 'Dale\'s locker: his spare keys. Cage, freezer, freight elevator.' });
      if (this.clues.has('channel2')) this.addObjective({ id: 'free', text: `Find Dale and get him out` }, true);
    } else this.tell(p, { t: 'fx', k: 'wrongCode' });
  }

  look(p, k) {
    if (k === 'uniform' && !this.flags.uniformGone && Math.hypot(p.x - UNIFORM_HOME[0], p.z - UNIFORM_HOME[1]) < 9) this.clue('uniform');
    if (k === 'car' && p.z > 5) this.clue('car');
    if (k === 'stalker' && this.stalker.on) this.clue('stalker');
  }

  // ------------------------------------------------------------- radio --
  radioOptions() {
    const o = [];
    const h = this.hourIdx;
    if (h < 0 || this.hourId === 'dawn') return o;
    if (!this.flags.checkin) o.push('checkin');
    else {
      o.push('allquiet');
      if (h >= 2 || this.clues.has('seen')) o.push('moved');
      if (this.clues.has('stalker')) o.push('sawDale');
      if (h >= 3) o.push('help');
      if (this.dale.mode !== 'trapped' && !this.radioUsed.has('foundDale')) o.push('foundDale');
    }
    return o.filter((k) => k === 'allquiet' || k === 'help' || !this.radioUsed.has(k));
  }

  radio(p, k) {
    if (!this.radioOptions().includes(k) || this.radioBusy > this.t + 1) return;
    this.radioUsed.add(k);
    this.emit({ t: 'say', id: p.id, who: p.name, text: RADIO_LINES[k], radio: true });
    const reply = {
      checkin: this.hourIdx >= 1 ? DISPATCH.checkinLate : DISPATCH.checkin,
      allquiet: DISPATCH.allquiet, moved: DISPATCH.moved, sawDale: DISPATCH.sawDale, help: DISPATCH.help, foundDale: DISPATCH.foundDale,
    }[k];
    this.radioBusy = this.t + 2;
    this.radioSay(reply);
    if (k === 'checkin') { this.flags.checkin = true; this.done('checkin'); this.checkLockup(); }
  }

  // --------------------------------------------------------- the round --
  punch(p, n) {
    const hh = Math.floor(this.clock) % 24, mm = Math.floor((this.clock % 1) * 60);
    const time = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    this.tape.push([this.clock >= 24 ? '10/25' : '10/24', time, n, p ? p.name.toUpperCase().slice(0, 10) : '---']);
    this.emit({ t: 'fx', k: 'punch', n, by: p ? p.id : 'stalker' });
    if (!p) { this.stalkerPunched = true; return; }
    const R = this.round;
    if (!R.n) { this.tell(p, { t: 'toast', text: `${STATIONS[n - 1].name}: punched. Rounds start at eleven.` }); return; }
    if (R.punched[n - 1]) { this.tell(p, { t: 'toast', text: `${STATIONS[n - 1].name}: already punched this round.` }); return; }
    R.punched[n - 1] = 1;
    p.punches++;
    this.punchTotal++;
    const got = R.punched.reduce((a, b) => a + b, 0);
    this.progress('round', got);
    this.tell(p, { t: 'toast', text: `${STATIONS[n - 1].name}: punched (${got} of 6).` });
  }

  startRound(n) {
    this.round = { n, punched: [0, 0, 0, 0, 0, 0] };
    const by = ['', '1 AM', '3 AM', '5 AM'][n];
    this.addObjective({ id: 'round', text: `Round ${n}: turn the key in every clock station (by ${by})`, of: 6 }, true);
  }

  // ---------------------------------------------------------- the hours --
  toHour(i) {
    this.hourIdx = i;
    this.hourT = this.t;
    const H = HOURS[i];
    this.clock = Math.max(this.clock, H.h);
    // what's done stays off the list; what isn't carries over
    this.obj = this.obj.filter((o) => !o.done && !['gates', 'south', 'east', 'dock', 'logbook'].includes(o.id));
    this.emit({ t: 'hour', i, title: H.title, sub: H.sub });
    const f = this[`hour_${H.id}`];
    if (f) f.call(this);
    // from one in the morning it's out there, whichever hour you start at
    if (i >= 3 && i < 8 && !this.stalker.on && !this.flags.uniformGone) {
      later(this, 2, () => { if (!this.stalker.on && this.hourId !== 'dawn') { this.flags.uniformGone = true; this.stalker.spawn(UNIFORM_HOME[0] - 1.0, UNIFORM_HOME[1] - 0.4, Math.PI / 2); } });
    }
    this.emit({ t: 'obj', list: this.obj });
  }

  hour_lockup() {
    this.manager.on = false;
    const gates = this.leftOpen.length;
    this.obj = [];
    this.addObjective({ id: 'south', text: 'Lock the south entrance behind Mr. Okafor' });
    this.addObjective({ id: 'east', text: 'Lock the food court entrance' });
    this.addObjective({ id: 'dock', text: 'Lock the loading dock door' });
    this.addObjective({ id: 'gates', text: 'Pull down and lock the shop gates left open', of: gates });
    this.addObjective({ id: 'checkin', text: 'Find the security office and radio in to Gatehouse ([V] walkie)' });
    this.addObjective({ id: 'logbook', text: 'Read Dale\'s logbook (security office)', optional: true });
    if (this.startHour > 0) this.fastForward();
    this.checkLockup();
  }

  // starting later in the night (?hour=N): the lockup's done
  fastForward() {
    for (const k of WATCHED) { const s = this.doors[k]; if (DOORS[k].kind !== 'door' || DOORS[k].id === 'fcHall' || DOORS[k].id === 'halvBack') { s.open = s.target = 0; s.locked = true; } }
    this.flags.checkin = true;
    this.radioUsed.add('checkin');
    for (const id of ['south', 'east', 'dock', 'gates', 'checkin']) this.done(id);
    const target = this.startHour;
    this.startHour = 0;
    this.clock = HOURS[target].h;
    this.toHour(target);
    // the round that would be under way
    const round = [0, 1, 1, 2, 2, 3, 3, 0, 0][target];
    if (round && this.round.n !== round) this.startRound(round);
  }

  checkLockup() {
    const L = (id) => this.doors[DOOR_INDEX[id]].locked && this.doors[DOOR_INDEX[id]].open < 0.05;
    if (L('south')) this.done('south');
    if (L('east')) this.done('east');
    if (L('dockDoor')) this.done('dock');
    this.progress('gates', this.leftOpen.filter((id) => L(id)).length);
  }

  hour_round1() {
    this.startRound(1);
    this.radioSay(DISPATCH.round1);
    // a light in Halvorsen's window turns... and its west doors come unlocked
    later(this, 45, () => { this.emit({ t: 'fx', k: 'paCrackle' }); });
    later(this, 85, () => {
      const k = DOOR_INDEX.halvWest;
      if (this.doors[k].locked) { this.doors[k].locked = false; this.emit({ t: 'fx', k: 'unlock', door: 'halvWest', by: 'nobody' }); }
    });
  }

  hour_midnight() {
    this.flags.pa = true;
    this.paT = 6;
    this.addObjective({ id: 'pa', text: 'Turn off the PA (mall office, off the service corridor)' }, true);
    this.radioSay(DISPATCH.midnight);
    this.mq.wake(2);
    this.photosObjective();
  }

  photosObjective() {
    if (!this.clues.has('logbook') || this.clues.has('photos')) return;
    this.addObjective({ id: 'photos', text: 'Dale left a roll of film at Photo Finish. Find it.', optional: true });
  }

  hour_round2() {
    this.startRound(2);
    this.mq.wake(4);
    later(this, 3, () => {
      for (const b of ['concourse', 'court', 'food', 'stores']) this.breakers[b] = false;
      this.emit({ t: 'fx', k: 'power' });
      this.powerObjective();
      this.radioSay(DISPATCH.power);
    });
    later(this, 9, () => {
      this.flags.uniformGone = true;
      this.stalker.spawn(UNIFORM_HOME[0] - 1.0, UNIFORM_HOME[1] - 0.4, Math.PI / 2);
    });
    later(this, 75, () => { if (this.stalkerPunched) this.radioSay(DISPATCH.round2); });
  }

  hour_channel2() {
    this.mq.wake(6);
    if (!this.stalker.on) { this.flags.uniformGone = true; this.stalker.spawn(UNIFORM_HOME[0] - 1, UNIFORM_HOME[1], Math.PI / 2); }
    later(this, 8, () => {
      this.emit({ t: 'fx', k: 'static' });
      const lines = [...CHANNEL2.open, ...CHANNEL2[this.place], ...CHANNEL2.close];
      this.radioSay(lines, { who: 'Channel 2', voice: 'dale', ch2: true, then: () => {
        this.clue('channel2');
        if (this.dale.mode !== 'trapped') return;
        if (!this.flags.keys) this.addObjective({ id: 'locker', text: 'Open Dale\'s locker in the security office (the combination\'s in his logbook)' }, true);
        this.addObjective({ id: 'free', text: 'Find Dale and get him out' }, true);
      } });
    });
  }

  hour_round3() {
    this.startRound(3);
    this.mq.wake(9);
    later(this, 6, () => {
      this.flags.carousel = true;
      this.emit({ t: 'fx', k: 'carousel' });
      this.addObjective({ id: 'carousel', text: 'The carousel started by itself. Turn it off.', optional: true });
    });
    later(this, 30, () => { this.flags.tvs = true; });
    later(this, 70, () => { if (!this.flags.pa) { this.flags.pa = true; this.paT = 2; this.addObjective({ id: 'pa', text: 'The PA\'s on again. Turn it off (mall office).' }, true); } });
  }

  hour_lockdown() {
    this.mq.wake(11);
    this.radioSay(DISPATCH.lockdown);
  }

  hour_last() {
    this.mq.wake(99);
    this.siege = true;
    this.mq.siege = true;
    this.radioSay(DISPATCH.last);
    this.addObjective({ id: 'gather', text: 'Get everyone into the security office', of: this.alive.length }, true);
    this.addObjective({ id: 'deadbolt', text: 'Lock the security office door' }, true);
    if (this.doors[DOOR_INDEX.security].locked) this.done('deadbolt');
  }

  hour_dawn() {
    this.siege = false;
    this.mq.sendHome();
    this.stalker.despawn();
    this.flags.uniformGone = false;
    this.flags.pa = this.flags.carousel = this.flags.tvs = false;
    for (const b of Object.keys(this.breakers)) this.breakers[b] = true;
    this.emit({ t: 'fx', k: 'dawn' });
    this.radioSay(DISPATCH.dawn);
    this.obj = this.obj.filter((o) => o.id === 'escort' && !o.done);
    this.manager = { on: true, x: 0, z: 16.4, ry: 0, anim: 'stand', path: null, waitT: 40 };
    if (this.doors[DOOR_INDEX.south].locked) {
      this.addObjective({ id: 'letIn', text: 'Mr. Okafor is at the south doors. Unlock them.' }, true);
      later(this, 3, () => this.emit({ t: 'fx', k: 'knock', door: 'south' }));
    } else later(this, 2, () => this.letManagerIn());
  }

  letManagerIn() {
    if (this.manager.inside) return;
    this.manager.inside = true;
    this.done('letIn');
    this.doors[DOOR_INDEX.south].locked = false;
    this.doors[DOOR_INDEX.south].target = 1;
    this.manager.path = [[0, 12], [0, 8.4]];
    later(this, 4.5, () => {
      this.say('Ray Okafor', this.alive.length ? 'Morning. You look like you\'ve seen a ghost. Write it all up for Gatehouse, would you?' : '...Hello? Night crew?', { voice: 'manager', at: [0, 1.7, 8.4] });
      if (this.alive.length) this.openReport();
      else later(this, 4, () => this.finish('taken'));
    });
  }

  openReport() {
    this.report.open = true;
    this.report.at = this.t;
    this.addObjective({ id: 'report', text: 'File the incident report ([J])' }, true);
    this.emit({ t: 'report', open: true, answers: this.report.answers });
  }

  reportMsg(p, msg) {
    const R = this.report;
    if (!R.open || this.over) return;
    if (msg.t === 'report') {
      const q = msg.q | 0, a = msg.a | 0;
      if (q < 0 || q >= REPORT.length || a < 0 || a >= REPORT[q].a.length) return;
      R.answers[q] = a;
      this.emit({ t: 'report', open: true, answers: R.answers, by: p.id });
    } else if (msg.t === 'file' && R.answers.every((a) => a != null)) this.fileReport();
  }

  fileReport() {
    const R = this.report;
    const right = REPORT.map((q, i) => (i === 2 ? REPORT_PLACE[this.place] : q.right));
    const correct = R.answers.filter((a, i) => a === right[i]).length;
    this.reportScore = correct;
    this.done('report');
    const found = this.dale.mode !== 'trapped';
    this.finish(correct === 3 ? (found ? 'best' : 'noDale') : correct === 2 ? (found ? 'good' : 'noDale') : 'wrong');
  }

  // ------------------------------------------------- the night's events --
  // a mannequin moved and somebody saw where it had got to
  sawMove(q, p) {
    if (q.sawT && this.t - q.sawT < 20) return;
    q.sawT = this.t;
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (p.cam < 0 && d > 16) return;
    if (!this.clues.has('seen')) this.clue('seen');
    this.emit({ t: 'fx', k: 'saw', id: p.id, m: q.id });
  }

  spotted(p, s) {
    this.clue('stalker');
    this.emit({ t: 'fx', k: 'spotted', id: p.id });
  }

  capture(p, by) {
    if (p.st !== 'in') return;
    p.st = 'taken';
    p.hide = null;
    p.cam = -1;
    p.tEnd = this.clock;
    this.emit({ t: 'taken', id: p.id, by });
    if (!this.alive.length && this.endAt == null) this.endAt = this.t + 5;
    if (this.hourId === 'last') this.progress('gather', this.gathered(), null);
  }

  // someone left: they're out of the night
  leave(id) {
    const p = this.player(id);
    if (!p) return;
    p.st = 'gone';
    p.hide = null;
    this.emit({ t: 'dropped', id });
    if (!this.alive.length && this.endAt == null) this.endAt = this.t + 1;
  }

  skipIntro() {
    if (this.hourIdx < 0) this.t = Math.max(this.t, INTRO_LEN);
  }

  gathered() { return this.alive.filter((p) => roomAt(p.x, p.z)?.id === 'security').length; }

  openCount() {
    let n = 0;
    for (const k of WATCHED) { const s = this.doors[k]; if (!(s.locked && s.open < 0.05)) n++; }
    return n;
  }

  finish(ending) {
    if (this.over) return;
    this.over = true;
    const E = ENDINGS[ending] || ENDINGS.taken;
    for (const p of this.players) if (p.st === 'in') p.st = 'survived';
    const results = this.players.map((p) => ({ id: p.id, name: p.name, color: p.color, st: p.st, time: p.tEnd, punches: p.punches }));
    const locked = WATCHED.length - this.openCount();
    const stats = {
      locked, lockTotal: WATCHED.length,
      punches: this.punchTotal, punchTotal: 18,
      clues: this.clues.size, clueTotal: CLUE_ORDER.length,
      dale: this.dale.mode === 'safe' ? 'safe' : this.dale.mode === 'follow' ? 'found' : 'missing',
      report: this.reportScore ?? null,
      place: DALE_SPOTS[this.place].room,
    };
    let score = locked / WATCHED.length * 25 + this.punchTotal / 18 * 20 + this.clues.size / CLUE_ORDER.length * 15 + (stats.dale === 'safe' ? 15 : stats.dale === 'found' ? 10 : 0) + (stats.report ?? 0) / 3 * 25;
    if (ending === 'taken') score = Math.min(score, 30);
    stats.grade = score >= 88 ? 'A' : score >= 72 ? 'B' : score >= 55 ? 'C' : score >= 38 ? 'D' : 'F';
    this.emit({ t: 'over', ending, title: E.title, lines: E.lines.map((l) => this.we(l)), results, stats });
  }

  // --------------------------------------------------------------- tick --
  step(dt) {
    if (this.over) return;
    this.t += dt;
    this.ticks++;
    runTimers(this);
    if (this.hourIdx < 0) {
      if (this.t >= INTRO_LEN) this.toHour(0);
    } else {
      this.stepClock(dt);
      this.stepDoors(dt);
      if (this.hourId !== 'dawn') {
        this.mq.step(dt);
        this.stalker.step(dt);
      } else this.mq.walkHome(dt);
      this.stepDale(dt);
      this.stepManager(dt);
      this.stepWorld(dt);
    }
    if (this.endAt != null && this.t >= this.endAt) this.finish('taken');
    if (this.ticks % SNAP_EVERY === 0) this.emit(this.snapshot());
  }

  stepClock(dt) {
    if (this.hourIdx >= HOURS.length - 1) {
      // the report: filed by the players, or for them after a while
      if (this.report.open && this.t - this.report.at > 150) {
        for (let i = 0; i < 3; i++) if (this.report.answers[i] == null) this.report.answers[i] = 0;
        this.fileReport();
      }
      return;
    }
    let next = this.clock + dt / HOUR_LEN;
    // the lockup hour waits (a while) for the lockup
    if (this.hourIdx === 0 && next > 22.95) {
      const ready = ['south', 'east', 'dock', 'gates', 'checkin'].every((id) => this.isDone(id));
      if (!ready && this.t - this.hourT < HOUR_LEN + 150) next = 22.95;
    }
    this.clock = next;
    const h = Math.floor(this.clock + 1e-6);
    if (h > HOURS[this.hourIdx].h && this.hourIdx + 1 < HOURS.length) {
      this.toHour(this.hourIdx + 1);
      // the hour before's round ends on the hour: the missed clocks are missed
    }
  }

  stepDoors(dt) {
    DOORS.forEach((d, k) => {
      const s = this.doors[k];
      const rate = (DOOR_SPEED[d.kind] || 2) * dt;
      if (s.open !== s.target) s.open += Math.max(-rate, Math.min(rate, s.target - s.open));
      if (s.open > 0.05 && s.locked) s.locked = false;
    });
    this.updateDoorSolids();
  }

  updateDoorSolids() {
    const dyn = [];
    DOORS.forEach((d, k) => {
      const s = this.doors[k];
      const shut = d.kind === 'glass' || d.kind === 'rollup' || s.open < (d.kind === 'gate' ? 0.6 : 0.5);
      if (shut) dyn.push(doorBox(d));
      this.nav.doorShut[k] = s.open < 0.3;
    });
    this.solids.dynamic = dyn;
  }

  stepDale(dt) {
    const D = this.dale;
    if (D.mode === 'trapped' || D.mode === 'safe') return;
    let lead = this.player(D.leader);
    if (!lead || lead.st !== 'in') {
      lead = this.alive.reduce((a, b) => (!a || Math.hypot(b.x - D.x, b.z - D.z) < Math.hypot(a.x - D.x, a.z - D.z) ? b : a), null);
      if (lead) D.leader = lead.id;
    }
    if (roomAt(D.x, D.z)?.id === 'security') {
      D.mode = 'safe';
      D.anim = 'stand';
      this.done('escort');
      this.say('Dale', DALE.office[0], { voice: 'dale', at: [r2(D.x), 1.4, r2(D.z)] });
      return;
    }
    if (!lead) { D.anim = 'stand'; return; }
    const d = Math.hypot(lead.x - D.x, lead.z - D.z);
    D.anim = 'stand';
    if (d > 1.8) {
      const pass = (k) => DOORS[k].kind !== 'glass' && DOORS[k].kind !== 'rollup' && (this.doors[k].open >= 0.5 || !this.doors[k].locked);
      const F = this.fields.get(this.t, lead.x, lead.z, 'dale', pass, 0.5);
      const r = follow(this.nav, this.solids, D, F, d > 5 ? 2.7 : 2.1, dt, 0.28, pass, (k) => this.doors[k].open < 0.5);
      if (r.door >= 0 && !this.doors[r.door].locked) { this.doors[r.door].target = 1; this.emit({ t: 'fx', k: 'open', door: DOORS[r.door].id }); }
      D.anim = 'walk';
    }
    D.talkT -= dt;
    if (D.talkT <= 0) {
      D.talkT = 18 + this.rng() * 20;
      this.say('Dale', this.rng.pick(DALE.follow), { voice: 'dale', at: [r2(D.x), 1.5, r2(D.z)] });
    }
  }

  stepManager(dt) {
    const M = this.manager;
    if (!M.on || !M.path || !M.path.length) { if (M.on) M.anim = 'stand'; return; }
    const [tx, tz] = M.path[0];
    const dx = tx - M.x, dz = tz - M.z, d = Math.hypot(dx, dz);
    if (d < 0.1) { M.path.shift(); return; }
    const s = Math.min(d, 1.3 * dt);
    M.x += dx / d * s; M.z += dz / d * s;
    M.ry = Math.atan2(-dx, -dz);
    M.anim = 'walk';
  }

  stepWorld(dt) {
    // the panel
    const n = this.openCount();
    if (n !== this.panelOpen) {
      if (n > this.panelOpen) this.emit({ t: 'fx', k: 'panel', n });
      this.panelOpen = n;
    }
    if (this.hourIdx >= 1 && this.hourId !== 'dawn') {
      const o = this.objective('panel');
      if (n > 0) {
        const text = `The alarm panel shows ${n} gate${n > 1 ? 's and doors' : ' or door'} open. Lock ${n > 1 ? 'them' : 'it'}.`;
        if (!o || o.done) this.addObjective({ id: 'panel', text });
        else if (o.text !== text) { o.text = text; this.emit({ t: 'obj', list: this.obj }); }
      } else if (o && !o.done) this.done('panel');
    }
    if (this.hourIdx === 0) this.checkLockup();
    if (this.hourId === 'last') {
      const g = this.gathered();
      const o = this.objective('gather');
      if (o) { o.of = Math.max(1, this.alive.length); this.progress('gather', g); }
    }
    // the PA, talking to nobody
    if (this.flags.pa) {
      this.paT -= dt;
      if (this.paT <= 0) {
        this.paT = 22 + this.rng() * 10;
        this.emit({ t: 'say', who: 'PA', text: PA_LINES[this.paLine++ % PA_LINES.length], voice: 'pa', pa: true });
      }
    }
    // people at the monitors when the cameras lose power
    if (!this.breakers.cams) for (const p of this.players) p.cam = -1;
  }

  snapshot() {
    const F = (p) => (p.st !== 'in' && p.st !== 'survived' ? 1 : 0) | (p.fl ? 2 : 0) | (p.cr ? 4 : 0) | (p.cam >= 0 ? 8 : 0) | (p.hide != null ? 16 : 0) | (p.mv === 2 ? 32 : 0);
    const st = this.stalker, D = this.dale, M = this.manager;
    const fl = this.flags;
    return {
      t: 's',
      T: Math.round(this.clock * 1000) / 1000,
      h: this.hourIdx,
      ps: this.players.map((p) => [p.id, r2(p.x), r2(p.z), r2(p.ry), r2(p.rx), F(p), p.hide || '', p.cam]),
      mq: this.mq.rows(),
      sk: st.on ? st.row() : null,
      dl: [r2(D.x), r2(D.z), r2(D.ry), D.anim, D.mode],
      mg: M.on ? [r2(M.x), r2(M.z), r2(M.ry), M.anim] : null,
      d: this.doors.map((s) => Math.round(s.open * 100) + (s.locked ? 1000 : 0) + (s.broken ? 2000 : 0)),
      b: BREAKERS.map((b) => (this.breakers[b.id] ? 1 : 0)),
      f: (fl.pa ? 1 : 0) | (fl.carousel ? 2 : 0) | (fl.tvs ? 4 : 0) | (fl.keys ? 8 : 0) | (fl.uniformGone ? 16 : 0) | (fl.stockroom ? 32 : 0) | (this.siege ? 64 : 0),
      rp: this.round.punched,
      rn: this.round.n,
      ro: this.radioOptions(),
    };
  }
}
