// Halvorsen's mannequins, as the host runs them. All night they stand
// where they were left. Once one wakes up it only moves while nobody can
// see it: not in anybody's view, not in a flashlight, not on the camera
// somebody in the office is watching. Then it comes for whoever is
// nearest, lifting any gate that isn't locked and opening any door that
// isn't. A locked gate stops it. In the last hour they stop asking.

import { MANNEQUIN as M } from '../shared/config.js';
import { MANNEQUIN_HOMES, DOORS, roomAt } from '../shared/mall.js';
import { follow, stepTo, yawTo, turn } from './nav.js';

const POSES = 9;     // the client has this many frozen poses

export class Mannequins {
  constructor(match) {
    this.m = match;
    const rng = match.rng;
    this.list = MANNEQUIN_HOMES.map(([x, z, ry], id) => ({
      id, home: { x, z, ry }, x, z, ry, pose: id % 3, active: false, moving: false,
      target: null, goal: null, wait: 0, doorT: 0, bangT: 0, seenT: -99, away: false, stirT: 5 + rng() * 30,
    }));
    // the order they wake up in
    this.order = rng.shuffle(this.list.map((q) => q.id));
    this.awake = 0;
    this.siege = false;
    this.moved = 0;            // how far they've moved in total (for tests)
  }

  // wake the first n
  wake(n) {
    n = Math.min(n, this.list.length);
    for (let k = this.awake; k < n; k++) this.list[this.order[k]].active = true;
    this.awake = Math.max(this.awake, n);
  }

  // back where they belong, still (dawn, or a fresh start)
  sendHome() {
    for (const q of this.list) {
      Object.assign(q, { x: q.home.x, z: q.home.z, ry: q.home.ry, active: false, moving: false, target: null, goal: null, away: false });
    }
    this.awake = 0;
    this.siege = false;
  }

  speed() {
    const k = Math.max(0, Math.min(1, (this.m.clock - 24) / 5));
    return M.speed + (M.speedLate - M.speed) * k;
  }

  // which doors a mannequin can get through: open ones, and any that
  // aren't locked (it lifts the gate, or opens the door). In the siege it
  // goes for the locked ones too, and breaks them.
  passFn() {
    const D = this.m.doors;
    return (k) => {
      const d = DOORS[k], s = D[k];
      if (d.kind === 'glass' || d.kind === 'rollup') return false;
      if (s.open >= 0.35) return true;
      if (!s.locked) return true;
      return this.siege && !d.key && !d.outside;
    };
  }

  step(dt) {
    const m = this.m;
    const pass = this.passFn();
    const passKey = this.siege ? 'mqS' : 'mq';
    const speed = this.speed();
    for (const q of this.list) {
      const seen = m.observed(q.x, 1.25, q.z, q);
      const was = q.moving;
      q.moving = false;
      if (seen) {
        if (q.active && q.away) m.sawMove(q, seen);
        q.seenT = m.t;
        continue;
      }
      if (!q.active) {
        // asleep, but not still: when nobody's looking they turn their heads
        q.stirT -= dt;
        if (q.stirT <= 0) {
          q.stirT = 20 + m.rng() * 50;
          if (m.clock > 23.2) { q.pose = (q.pose + 1 + Math.floor(m.rng() * (POSES - 1))) % POSES; q.ry = q.home.ry + (m.rng() - 0.5) * 1.6; }
        }
        continue;
      }
      // someone to go after?
      let tgt = null, td = M.notice;
      for (const p of m.alive) {
        if (p.hide != null) continue;
        const d = Math.hypot(p.x - q.x, p.z - q.z);
        if (d < td) { td = d; tgt = p; }
      }
      let D, goalX, goalZ;
      if (tgt) {
        D = m.fields.get(m.t, tgt.x, tgt.z, passKey, pass, 0.5);
        goalX = tgt.x; goalZ = tgt.z;
        if (D[m.nav.idx(q.x, q.z)] >= 1e8) tgt = null;     // locked in: can't get to them
      }
      if (!tgt) {
        // wander: somewhere near people if it can get there, else round its own room
        if (!q.goal || q.wait > 0) { q.wait -= dt; if (q.wait > 0) continue; }
        if (!q.goal) q.goal = this.wanderGoal(q);
        goalX = q.goal.x; goalZ = q.goal.z;
        D = m.fields.get(m.t, goalX, goalZ, passKey, pass, 3);
      }
      const close = tgt && td < 2.2 && m.nav.los(q.x, q.z, tgt.x, tgt.z);
      const r = close ? { left: td, door: -1, stuck: false } : follow(m.nav, m.solids, q, D, speed, dt, M.radius, pass, (k) => m.doors[k].open < 0.35);
      if (close) stepTo(m.solids, q, tgt.x, tgt.z, speed, dt, M.radius);
      if (r.door >= 0) this.atDoor(q, r.door, dt);
      else q.doorT = 0;
      if (r.stuck || (!tgt && r.left < 0.8)) { q.goal = null; q.wait = 1 + m.rng() * 4; }
      const moved = Math.hypot(q.x - (q.px ?? q.x), q.z - (q.pz ?? q.z));
      q.px = q.x; q.pz = q.z;
      if (moved > 1e-4) {
        q.moving = true;
        this.moved += moved;
        if (!was) q.pose = Math.floor(m.rng() * POSES);
        q.away = Math.hypot(q.x - q.home.x, q.z - q.home.z) > 2.5;
      }
      if (tgt) {
        // they stop just short and face you, reaching
        q.ry = turn(q.ry, yawTo(tgt.x - q.x, tgt.z - q.z), 12 * dt);
        if (td < M.catchDist + 0.1) m.capture(tgt, 'mannequin', q);
      }
    }
  }

  // stuck at a shut door: lift it or open it if it isn't locked; in the
  // siege, beat on it until it gives
  atDoor(q, k, dt) {
    const m = this.m, s = m.doors[k], d = DOORS[k];
    q.doorT += dt;
    if (!s.locked) {
      if (q.doorT > 0.8) { m.forceDoor(k, 'mannequin'); q.doorT = 0; }
      return;
    }
    if (!this.siege) return;
    q.bangT -= dt;
    s.hp -= dt * (d.deadbolt ? 4.5 : 9);
    if (q.bangT <= 0) { q.bangT = 1.1 + m.rng() * 0.6; m.emit({ t: 'fx', k: 'bang', door: d.id }); }
    if (s.hp <= 0) m.breakDoor(k);
  }

  wanderGoal(q) {
    const m = this.m, rng = m.rng;
    // half the time: towards whoever is closest, wherever they are
    const people = m.alive.filter((p) => p.hide == null);
    if (people.length && rng() < 0.55) {
      const p = people.reduce((a, b) => (Math.hypot(a.x - q.x, a.z - q.z) < Math.hypot(b.x - q.x, b.z - q.z) ? a : b));
      for (let k = 0; k < 8; k++) {
        const x = p.x + (rng() - 0.5) * 16, z = p.z + (rng() - 0.5) * 16;
        const i = m.nav.idx(x, z);
        if (i >= 0 && m.nav.walk[i] && roomAt(x, z)) return { x, z };
      }
    }
    // otherwise somewhere in the room it's in
    const room = roomAt(q.x, q.z);
    for (let k = 0; k < 12; k++) {
      const x = room ? room.x0 + 1 + rng() * Math.max(0.1, room.x1 - room.x0 - 2) : q.x + (rng() - 0.5) * 10;
      const z = room ? room.z0 + 1 + rng() * Math.max(0.1, room.z1 - room.z0 - 2) : q.z + (rng() - 0.5) * 10;
      const i = m.nav.idx(x, z);
      if (i >= 0 && m.nav.walk[i]) return { x, z };
    }
    return { x: q.home.x, z: q.home.z };
  }

  // straight back to the windows, at dawn (when nobody's looking)
  walkHome(dt) {
    for (const q of this.list) {
      if (this.m.observed(q.x, 1.25, q.z, q)) continue;
      stepTo(this.m.solids, q, q.home.x, q.home.z, 3, dt, M.radius);
    }
  }

  rows() {
    return this.list.map((q) => [Math.round(q.x * 100) / 100, Math.round(q.z * 100) / 100, Math.round(q.ry * 100) / 100, q.pose, (q.moving ? 1 : 0) | (q.active ? 2 : 0)]);
  }
}
