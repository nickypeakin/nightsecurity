// The thing in Dale's uniform, as the host runs it. It walks Dale's round
// the way Dale walked it: every clock station, turning the key, with Dale's
// keys. On the way it unlocks things: Halvorsen's gate, a shop or two, the
// outside doors, a breaker. If it sees one of you it comes for you,
// faster than you walk and slower than you run; break its line of sight
// long enough and it goes back to its round. It can't open the security
// office's deadbolt. A flashlight full in its face stops it for a moment.

import { STALKER as S } from '../shared/config.js';
import { DOORS, DOOR_INDEX, STATIONS, STORES, SPOTS, HIDES } from '../shared/mall.js';
import { follow, stepTo, yawTo, turn } from './nav.js';

const near = (s, dx = 0, dz = 0) => ({ x: s.x + dx, z: s.z + dz });

export class Stalker {
  constructor(match) {
    this.m = match;
    this.on = false;
    this.x = this.z = 0;
    this.ry = 0;
    this.anim = 'stand';
    this.mode = 'off';
    this.plan = [];
    this.pi = 0;
    this.busy = 0;
    this.lostT = 0;
    this.stunT = 0;
    this.stunCool = 0;
    this.lastSeen = null;
    this.rounds = 0;
    this.light = true;
  }

  spawn(x, z, ry = 0) {
    Object.assign(this, { on: true, x, z, ry, mode: 'round', anim: 'walk', target: null, busy: 0 });
    this.newRound();
  }

  despawn() {
    this.on = false;
    this.mode = 'off';
    this.target = null;
  }

  // Dale's round, and the mischief along the way
  newRound() {
    const rng = this.m.rng;
    const st = (n, dx, dz) => ({ ...near(STATIONS[n - 1], dx, dz), act: 'punch', n });
    const gates = rng.shuffle(STORES.filter((s) => s.type !== 'vacant').map((s) => s.id)).slice(0, 2 + (this.rounds > 0 ? 1 : 0));
    const gateAt = (id) => { const d = DOORS[DOOR_INDEX[id]]; return { x: d.x, z: d.z + (d.at < 0 ? 0.9 : -0.9), act: 'unlock', door: id, raise: 0.45 }; };
    const westGates = gates.filter((id) => DOORS[DOOR_INDEX[id]].x < 0).map(gateAt);
    const eastGates = gates.filter((id) => DOORS[DOOR_INDEX[id]].x >= 0).map(gateAt);
    const breaker = rng.pick(this.rounds === 0 ? ['concourse', 'court'] : ['cams', 'concourse', 'back', 'food']);
    this.plan = [
      st(3, 0, 0.6),
      { x: -40.9, z: 0, act: 'unlock', door: 'H', raise: 0.55 },
      st(2, 0, 0.5),
      ...westGates,
      st(6, 0.6, 0),
      { x: 0, z: 14.2, act: 'unlock', door: 'south' },
      ...eastGates,
      st(5, -0.6, 0),
      { x: 65.2, z: 0, act: 'unlock', door: 'east' },
      { x: 41, z: -14.0, act: 'walk' },
      st(4, -0.6, 0),
      { x: 37, z: -30.4, act: 'unlock', door: 'dockDoor' },
      st(1, 0, 0.6),
      { x: -11.5, z: -26.6, act: 'breaker', id: breaker },
      { x: -39.2, z: -19, act: 'unlock', door: 'halvBack' },
    ];
    this.pi = 0;
    this.rounds++;
  }

  // can it see this person?
  sees(p) {
    if (!this.on || p.st !== 'in' || p.hide != null) return false;
    const m = this.m;
    const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz);
    if (d < 1.6) return true;
    const L = m.lightAt(p.x, 1.2, p.z);
    let range = L > 0.12 ? S.seeLit : S.seeDark;
    if (p.fl) range = Math.max(range, S.seeFlash);
    if (d > range) return false;
    const fx = -Math.sin(this.ry), fz = -Math.cos(this.ry);
    if ((fx * dx + fz * dz) / d < S.fov && d > 4) return false;
    return m.nav.los(this.x, this.z, p.x, p.z);
  }

  passFn() {
    const D = this.m.doors;
    return (k) => {
      const d = DOORS[k], s = D[k];
      if (d.kind === 'glass' || d.kind === 'rollup' || d.key) return false;
      if (d.deadbolt && s.locked) return false;
      return true;
    };
  }

  step(dt) {
    if (!this.on) return;
    const m = this.m;
    this.stunCool -= dt;
    if (this.stunT > 0) { this.stunT -= dt; this.anim = 'stunned'; return; }
    this.checkStun();
    if (this.stunT > 0) return;
    if (this.busy > 0) { this.busy -= dt; this.anim = 'work'; if (this.busy <= 0) this.finishWork(); return; }

    // anyone in sight?
    let seen = null, sd = Infinity;
    for (const p of m.alive) {
      if (this.sees(p)) {
        const d = Math.hypot(p.x - this.x, p.z - this.z);
        if (d < sd) { sd = d; seen = p; }
      }
    }
    if (m.siege && this.mode !== 'chase' && this.mode !== 'siege') this.mode = 'siege';
    if (seen && (this.mode !== 'chase' || seen.id !== this.target)) {
      if (this.mode !== 'chase') m.spotted(seen, this);
      this.mode = 'chase';
      this.target = seen.id;
    }
    if (this.mode === 'chase') this.stepChase(dt, seen);
    else if (this.mode === 'search') this.stepSearch(dt);
    else if (this.mode === 'siege') this.stepSiege(dt);
    else this.stepRound(dt);
  }

  move(gx, gz, speed, dt, ttl = 0.5) {
    const m = this.m, pass = this.passFn();
    const D = m.fields.get(m.t, gx, gz, 'sk', pass, ttl);
    const r = follow(m.nav, m.solids, this, D, speed, dt, S.radius, pass, (k) => m.doors[k].open < 0.6);
    if (r.door >= 0) {
      const s = m.doors[r.door];
      // a locked door on the way: out with Dale's keys
      this.busy = s.locked ? S.unlockTime : 0.5;
      this.work = { act: 'pass', door: DOORS[r.door].id };
      this.anim = 'work';
      if (s.locked) m.emit({ t: 'fx', k: 'keys', x: this.x, z: this.z });
    }
    return r;
  }

  stepRound(dt) {
    const w = this.plan[this.pi];
    if (!w) { this.newRound(); return; }
    this.anim = 'walk';
    const r = this.move(w.x, w.z, S.walk, dt, 2);
    if (this.busy > 0) return;
    if (r.stuck || Math.hypot(w.x - this.x, w.z - this.z) < 0.55 || r.left < 0.45) {
      this.work = w;
      this.busy = w.act === 'walk' ? 0.01 : w.act === 'punch' ? 1.4 : w.act === 'breaker' ? 2.0 : S.unlockTime;
      if (w.act === 'unlock') {
        const s = this.m.doors[DOOR_INDEX[w.door]];
        if (!s.locked && s.open > 0.3) this.busy = 0.01;
        else this.m.emit({ t: 'fx', k: 'keys', x: this.x, z: this.z });
      }
    }
  }

  finishWork() {
    const m = this.m, w = this.work;
    this.work = null;
    if (!w) return;
    if (w.act === 'pass') { m.stalkerOpens(DOOR_INDEX[w.door], 1); return; }
    if (this.mode !== 'round') return;
    if (w.act === 'punch') m.punch(null, w.n);
    else if (w.act === 'unlock') m.stalkerOpens(DOOR_INDEX[w.door], w.raise ?? 0);
    else if (w.act === 'breaker') m.stalkerBreaker(w.id);
    this.pi++;
  }

  stepChase(dt, seen) {
    const m = this.m;
    const p = m.player(this.target);
    if (!p || p.st !== 'in') { this.toSearch(); return; }
    if (seen === p) { this.lastSeen = { x: p.x, z: p.z, t: m.t }; this.lostT = 0; } else this.lostT += dt;
    // they hid while it was watching: it saw where
    if (p.hide != null) {
      const H = HIDES.find((h) => h.id === p.hide);
      if (H && p.hideT - (this.lastSeen?.t ?? -99) < 1.2 && Math.hypot(H.x - this.x, H.z - this.z) < 14) {
        this.anim = 'run';
        this.move(H.x, H.z, S.chase, dt);
        if (Math.hypot(H.x - this.x, H.z - this.z) < 1.3) m.capture(p, 'stalker', this);
        return;
      }
      this.toSearch();
      return;
    }
    if (this.lostT > S.giveUp) { this.toSearch(); return; }
    const gx = this.lostT > 0 && this.lastSeen ? this.lastSeen.x : p.x, gz = this.lostT > 0 && this.lastSeen ? this.lastSeen.z : p.z;
    this.anim = 'run';
    // close enough to grab: straight at them
    if (this.lostT === 0 && Math.hypot(p.x - this.x, p.z - this.z) < 2.5) stepTo(m.solids, this, p.x, p.z, S.chase, dt, S.radius);
    else this.move(gx, gz, S.chase, dt, 0.3);
    if (Math.hypot(p.x - this.x, p.z - this.z) < S.catchDist) m.capture(p, 'stalker', this);
  }

  toSearch() {
    this.mode = 'search';
    this.target = null;
    this.searchT = 5;
  }

  stepSearch(dt) {
    const L = this.lastSeen;
    this.searchT -= dt;
    if (L && Math.hypot(L.x - this.x, L.z - this.z) > 0.8 && this.searchT > 0) {
      this.anim = 'walk';
      this.move(L.x, L.z, S.walk * 1.2, dt, 1);
    } else {
      this.anim = 'look';
      this.ry += dt * 1.2;
    }
    if (this.searchT <= 0) {
      // back to the round, from the nearest stop
      this.mode = 'round';
      let best = this.pi, bd = Infinity;
      this.plan.forEach((w, i) => { const d = Math.hypot(w.x - this.x, w.z - this.z); if (d < bd) { bd = d; best = i; } });
      this.pi = best;
    }
  }

  // the last hour: it goes to the office and waits at the glass
  stepSiege(dt) {
    const w = SPOTS.monitors, m = this.m;
    const door = m.doors[DOOR_INDEX.security];
    const gx = door.locked ? 3.5 : w.x, gz = door.locked ? -19.6 : w.z + 1.5;
    if (Math.hypot(gx - this.x, gz - this.z) > 0.6) {
      this.anim = 'walk';
      this.move(gx, gz, S.walk * 1.3, dt, 1);
    } else {
      this.anim = 'stand';
      this.ry = turn(this.ry, yawTo(0, -1), 4 * dt);
      this.knockT = (this.knockT ?? 6) - dt;
      if (this.knockT <= 0) { this.knockT = 7 + m.rng() * 6; m.emit({ t: 'fx', k: 'tap', x: 3.5, z: -20.75 }); }
    }
  }

  // a flashlight beam full in its face, close enough, stops it
  checkStun() {
    if (this.stunCool > 0) return;
    const m = this.m;
    for (const p of m.alive) {
      if (!p.fl || p.hide != null || p.cam >= 0) continue;
      const dx = this.x - p.x, dz = this.z - p.z, d = Math.hypot(dx, dz);
      if (d > 9 || d < 0.5) continue;
      const vx = -Math.sin(p.ry) * Math.cos(p.rx), vy = Math.sin(p.rx), vz = -Math.cos(p.ry) * Math.cos(p.rx);
      const eye = p.cr ? 1.05 : 1.62;
      const tx = dx, ty = 1.65 - eye, tz = dz, tl = Math.hypot(tx, ty, tz);
      if ((vx * tx + vy * ty + vz * tz) / tl < 0.965) continue;
      const fx = -Math.sin(this.ry), fz = -Math.cos(this.ry);
      if ((fx * -dx + fz * -dz) / d < 0.2) continue;
      if (!m.nav.los(p.x, p.z, this.x, this.z)) continue;
      this.stunT = S.stun;
      this.stunCool = 9;
      m.emit({ t: 'fx', k: 'stun', x: this.x, z: this.z, by: p.id });
      return;
    }
  }

  row() {
    const r = (v) => Math.round(v * 100) / 100;
    return [r(this.x), r(this.z), r(this.ry), this.anim, (this.light ? 1 : 0) | (this.mode === 'chase' ? 2 : 0)];
  }
}
