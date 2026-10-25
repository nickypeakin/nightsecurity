// Jobs. A mission is a list of steps (shared/story.js) worked through one
// after another. Everyone in the game shares the job: any player can do
// any step. Walk into the next job's marker (with no police after you) to
// start it.

import { MISSIONS, PEOPLE } from '../shared/story.js';
import { PLACES } from '../shared/city.js';
import { INTERIOR, GIVER_ROOMS } from '../shared/interiors.js';
import { WEAPON_INDEX, WEAPONS } from '../shared/config.js';
import { makePed, LOOK_GANG, LOOK_CREW, LOOK_BOSS, LOOK_MQ, LOOK_MQ2, A } from './peds.js';
import { Driver } from './drivers.js';

const MARKER_R = 2.2;

export class Missions {
  constructor(m, save) {
    this.m = m;
    this.done = Math.min(MISSIONS.length, save?.done || 0);
    this.active = null;
    this.version = 0;          // bumped whenever what players should see changes
    this.cool = 0;
  }

  get next() { return MISSIONS[this.done] || null; }

  // where the next job starts: in front of the giver's desk (and, for the
  // radar, their front door)
  marker() {
    const n = this.next;
    if (!n || this.active) return null;
    const R = INTERIOR[GIVER_ROOMS[n.giver]];
    return { x: R.spots.job.x, z: R.spots.job.z, giver: n.giver, door: R.door };
  }

  changed() { this.version++; }

  step(dt) {
    const m = this.m;
    this.cool = Math.max(0, this.cool - dt);
    if (!this.active) {
      const mk = this.marker();
      if (!mk || this.cool > 0) return;
      for (const p of m.players) {
        if (p.state !== 'alive' || p.car != null || p.wanted) continue;
        if (Math.hypot(p.x - mk.x, p.z - mk.z) < MARKER_R) { this.start(this.next, p); break; }
      }
      return;
    }
    const A0 = this.active;
    // everyone down: that's the job gone
    if (m.players.every((p) => p.state !== 'alive')) { this.fail('You were taken out.'); return; }
    const st = A0.def.steps[A0.idx];
    if (!st) { this.pass(); return; }
    if (!A0.begun) { A0.begun = true; A0.s = {}; this.begin(st); if (!this.active) return; this.changed(); }
    const done = this.tick(st, dt);
    if (!this.active) return;
    if (done) { A0.idx++; A0.begun = false; A0.text = A0.idx < A0.def.steps.length ? A0.text : ''; this.changed(); }
  }

  start(def, by) {
    const m = this.m;
    this.active = { def, idx: 0, begun: false, s: {}, cars: {}, groups: {}, pickups: {}, objects: {}, text: '', cut: false, timer: null };
    m.emit({ t: 'banner', text: def.title, sub: PEOPLE[def.giver].name, kind: 'mission' });
    m.sound('missionStart');
    this.changed();
    void by;
  }

  // ------------------------------------------------------------ the steps
  begin(st) {
    const m = this.m, A0 = this.active, s = A0.s;
    if (st.text) A0.text = st.text;
    switch (st.do) {
      case 'say': {
        const intro = A0.idx === 0;
        s.end = m.t + m.dialog(st.lines);
        A0.cut = intro;
        if (st.wait === false) s.end = m.t;
        break;
      }
      case 'car': {
        const c = m.spawnCar(st.type, st.at.x, st.at.z, st.at.h, { paint: st.paint, keep: true, mission: true });
        c.ai = new Driver(m, c, 'park');
        A0.cars[st.id] = c.id;
        break;
      }
      case 'give':
        for (const p of m.players) m.giveWeapon(p, st.weapon, st.ammo);
        s.end = m.t + 4;
        break;
      case 'wanted': {
        // whoever's in (or by) one of the job's cars; everyone, if nobody is
        const cars = Object.values(A0.cars).map((id) => m.cars.get(id)).filter(Boolean);
        const at = m.players.filter((p) => p.state === 'alive' && cars.some((c) => p.car === c.id || Math.hypot(p.x - c.x, p.z - c.z) < 40));
        for (const p of at.length ? at : m.players) if (p.state === 'alive') m.police.crime(p, 0, st.stars);
        s.end = m.t + 3;
        break;
      }
      case 'peds': {
        const ids = [];
        for (let k = 0; k < st.n; k++) {
          const a = (k / st.n) * Math.PI * 2;
          const boss = st.boss && k === 0;
          const look = st.kind === 'crew' ? LOOK_CREW : boss ? LOOK_BOSS : LOOK_GANG;
          const p = makePed(st.kind === 'crew' ? 'crew' : 'gang', st.at.x + Math.cos(a) * (boss ? 0 : 2.5), st.at.z + Math.sin(a) * 1.2, look);
          p.hp = boss ? 110 : 60;
          p.w = WEAPON_INDEX[st.weapon] || 1;
          p.group = st.group;
          p.boss = boss;
          p.keep = true;
          m.addPed(p);
          ids.push(p.id);
        }
        A0.groups[st.group] = ids;
        break;
      }
      case 'pickup': {
        let at = st.at;
        if (st.atGroupBoss) {
          const boss = (A0.groups[st.atGroupBoss] || []).map((id) => m.peds.get(id)).find((p) => p && p.boss);
          at = boss ? { x: boss.x, z: boss.z } : at || { x: 0, z: 0 };
          if (boss) { boss.cash = 0; }
        }
        const pk = m.addPickup(st.kind, at.x, at.z, { mission: true });
        A0.pickups[st.id] = pk.id;
        break;
      }
      case 'board':
        s.car = A0.cars[st.car];
        break;
      case 'unboard':
        for (const id of A0.groups[st.group] || []) {
          const p = m.peds.get(id);
          if (!p) continue;
          const c = m.cars.get(p.inCar);
          p.inCar = null;
          if (c) { p.x = c.x + Math.cos(c.h) * 2; p.z = c.z - Math.sin(c.h) * 2; c.riders = (c.riders || []).filter((r) => r !== id); }
          p.walkTo = { x: p.x + 10, z: p.z + 6 };
          p.keep = false;
          p.leaveT = m.t + 6;
        }
        break;
      case 'race': {
        const car = m.cars.get(A0.cars[st.car]);
        s.idx = 0;
        s.racers = [];
        s.go = m.t + 4;
        m.emit({ t: 'countdown', at: s.go });
        // the other racers line up beside and behind
        for (let k = 0; k < st.racers; k++) {
          const s0 = Math.sin(car.h), c0 = Math.cos(car.h);
          const back = 7 + k * 7, side = (k % 2 ? -1 : 1) * 2.6;
          const r = m.spawnCar('sports', car.x - s0 * back - c0 * side, car.z - c0 * back + s0 * side, car.h, { paint: [2, 5, 9][k % 3], keep: true, mission: true });
          r.ai = new Driver(m, r, 'park');
          r.driverLook = k % 14;
          s.racers.push(r.id);
        }
        break;
      }
      case 'convoy':
        st.ids.forEach((id, k) => {
          const at = st.at[k];
          const c = m.spawnCar(st.type, at.x, at.z, at.h, { paint: 4 + k, keep: true, mission: true });
          c.ai = new Driver(m, c, 'cruise');
          c.ai.ignoreLights = true;
          c.driverLook = LOOK_GANG;
          c.hp = 160;
          A0.cars[id] = c.id;
        });
        break;
      case 'mannequins': {
        const ids = [];
        for (let k = 0; k < st.n; k++) {
          // among the containers, out of the way
          let x = st.at.x, z = st.at.z, ok = false;
          for (let tries = 0; tries < 60 && !ok; tries++) {
            x = st.at.x + (m.rng() - 0.5) * 70; z = st.at.z - 2 - m.rng() * 18;
            ok = m.openAt(x, z, 0.5) && (tries > 40 || !m.anyoneSees(x, 1.2, z));
          }
          if (!ok) { x = st.at.x + (k - st.n / 2) * 1.5; z = st.at.z - 4; }
          const p = makePed('mq', x, z, k % 2 ? LOOK_MQ : LOOK_MQ2);
          p.hp = 9999;
          p.group = st.group;
          p.keep = true;
          p.anim = A.still;
          m.addPed(p);
          ids.push(p.id);
        }
        A0.groups[st.group] = ids;
        break;
      }
      case 'target': {
        const o = m.addObject('crate', st.at.x + 1.5, st.at.z, st.hp);
        A0.objects[st.id] = o.id;
        // whoever was carrying it has put it down
        for (const p of m.players) if (p.carry === st.id) p.carry = null;
        break;
      }
      case 'clear':
        for (const id of A0.groups[st.group] || []) {
          const p = m.peds.get(id);
          if (p) { p.dead = true; p.deadT = 0; p.keep = false; p.anim = A.dead; }
        }
        m.emit({ t: 'fx', k: 'collapse' });
        break;
      case 'wait':
        s.end = m.t + st.s;
        break;
      default:
    }
  }

  // true when the step is done
  tick(st, dt) {
    const m = this.m, A0 = this.active, s = A0.s;
    const car = (id) => m.cars.get(A0.cars[id]);
    const driven = (c) => c && m.players.some((p) => p.car === c.id && p.seat === 0 && p.state === 'alive');
    switch (st.do) {
      case 'say':
        if (m.t >= s.end) { A0.cut = false; return true; }
        return false;
      case 'car': return true;
      case 'give':
      case 'wanted':
        return m.t >= s.end || true;
      case 'enter': {
        const c = car(st.car);
        if (!c || c.dead) { this.fail('The car was wrecked.'); return false; }
        return driven(c);
      }
      case 'deliver': {
        const c = car(st.car);
        if (!c || c.dead) { this.fail(st.car === 'getaway' ? 'The getaway car was wrecked.' : 'The car was wrecked.'); return false; }
        if (!driven(c) && !A0.warned) { /* get back in */ }
        return driven(c) && Math.hypot(c.x - st.at.x, c.z - st.at.z) < st.r && Math.abs(c.v) < 4;
      }
      case 'goto': {
        for (const p of m.players) {
          if (p.state !== 'alive') continue;
          if (st.onFoot && p.car != null) continue;
          if (st.inCar) { const c = car(st.inCar); if (!c || c.dead) { this.fail('The car was wrecked.'); return false; } if (p.car !== c.id) continue; }
          if (st.carry && !m.players.some((q) => q.carry === st.carry && (q.id === p.id || (q.car != null && q.car === p.car)))) continue;
          const pos = m.playerPos(p);
          if (Math.hypot(pos.x - st.at.x, pos.z - st.at.z) < st.r) return true;
        }
        return false;
      }
      case 'lose': return m.players.every((p) => !p.wanted);
      case 'peds': return true;
      case 'kill': return (A0.groups[st.group] || []).every((id) => { const p = m.peds.get(id); return !p || p.dead; });
      case 'pickup': return !m.pickups.has(A0.pickups[st.id]);
      case 'board': {
        const c = m.cars.get(s.car);
        if (!c || c.dead) { this.fail('The getaway car was wrecked.'); return false; }
        let all = true;
        for (const id of A0.groups[st.group] || []) {
          const p = m.peds.get(id);
          if (!p || p.dead) continue;
          if (p.inCar != null) continue;
          all = false;
          const d = Math.hypot(c.x - p.x, c.z - p.z);
          p.walkTo = { x: c.x, z: c.z };
          if (d < 2.6 && Math.abs(c.v) < 2) {
            p.inCar = c.id;
            c.riders = [...(c.riders || []), p.id];
            p.walkTo = null;
          }
        }
        return all;
      }
      case 'unboard': return true;
      case 'race': return this.tickRace(st, dt);
      case 'convoy': return true;
      case 'destroy': {
        // the vans run when someone gets close
        for (const id of st.cars) {
          const c = car(id);
          if (!c || c.dead || !c.ai) continue;
          let near = null;
          for (const p of m.players) { const pos = m.playerPos(p); if (Math.hypot(pos.x - c.x, pos.z - c.z) < 50) near = pos; }
          if (near && c.ai.mode !== 'flee') { c.ai.mode = 'flee'; c.ai.lane = null; c.ai.pts = []; }
          if (near) c.ai.target = { x: near.x, z: near.z };
        }
        return st.cars.every((id) => { const c = car(id); return !c || c.dead; });
      }
      case 'mannequins': return true;
      case 'target': return !m.objects.has(A0.objects[st.id]);
      case 'clear': return true;
      case 'wait': return m.t >= s.end;
      default: return true;
    }
  }

  tickRace(st, dt) {
    const m = this.m, A0 = this.active, s = A0.s;
    const c = m.cars.get(A0.cars[st.car]);
    if (!c || c.dead) { this.fail('You wrecked the Kestrel.'); return false; }
    if (m.t < s.go) return false;
    if (!s.started) {
      s.started = true;
      for (const id of s.racers) {
        const r = m.cars.get(id);
        if (!r) continue;
        r.ai.mode = 'race';
        r.ai.racePts = st.points;
        r.ai.raceIdx = 0;
        r.ai.lane = null;
      }
    }
    // the player's progress (whoever's driving the car)
    const p = st.points[s.idx];
    if (p && Math.hypot(c.x - p[0], c.z - p[1]) < 13 && driven(m, c)) {
      s.idx++;
      m.sound('checkpoint');
      A0.text = s.idx < st.points.length ? `Win the race! Checkpoint ~y~${s.idx + 1}~w~ of ${st.points.length}.` : '';
      this.changed();
    }
    if (s.idx >= st.points.length) {
      for (const id of s.racers) { const r = m.cars.get(id); if (r) { r.ai.mode = 'cruise'; r.keep = false; r.mission = false; } }
      return true;
    }
    // keep it close: racers ahead ease off, racers behind push
    for (const id of s.racers) {
      const r = m.cars.get(id);
      if (!r || !r.ai) continue;
      const ahead = r.ai.raceIdx - s.idx;
      r.ai.rubber = ahead > 1 ? 0.8 : ahead > 0 ? 0.92 : ahead < -1 ? 1.08 : 1;
      if (r.ai.raceIdx >= st.points.length) { this.fail('You lost the race.'); return false; }
    }
    return false;
  }

  // ------------------------------------------------------------ outcomes
  pass() {
    const m = this.m, def = this.active.def;
    for (const p of m.players) m.addMoney(p, def.pay);
    m.emit({ t: 'banner', text: 'MISSION PASSED', sub: `$${def.pay}`, kind: 'passed' });
    m.sound('passed');
    this.cleanup(true);
    this.done++;
    this.active = null;
    this.cool = 4;
    m.save();
    if (def.final) m.emit({ t: 'credits' });
    this.changed();
  }

  fail(why) {
    const m = this.m;
    if (!this.active) return;
    m.emit({ t: 'banner', text: 'MISSION FAILED', sub: why, kind: 'failed' });
    m.sound('failed');
    this.cleanup(false);
    this.active = null;
    this.cool = 6;
    this.changed();
  }

  cleanup(passed) {
    const m = this.m, A0 = this.active;
    for (const id of Object.values(A0.cars)) {
      const c = m.cars.get(id);
      if (!c) continue;
      c.mission = false;
      const someone = m.players.some((p) => p.car === c.id);
      if (!someone && !passed && !c.dead) m.removeCar(c);
      else c.keep = someone;
    }
    for (const ids of Object.values(A0.groups)) {
      for (const id of ids) {
        const p = m.peds.get(id);
        if (!p) continue;
        if (p.kind === 'mq') { m.removePed(p); continue; }
        p.keep = false;
        if (p.inCar != null) { const c = m.cars.get(p.inCar); if (c) c.riders = []; m.removePed(p); }
      }
    }
    for (const id of Object.values(A0.pickups)) m.pickups.delete(id);
    for (const id of Object.values(A0.objects)) m.objects.delete(id);
    for (const p of m.players) p.carry = null;
  }

  // ------------------------------------------------------------ the HUD
  // the objective text, the timer, and what's on the radar for the job
  view() {
    const m = this.m, A0 = this.active;
    const blips = [];
    const mk = this.marker();
    if (mk) blips.push({ x: mk.door.x, z: mk.door.z, k: 'giver', l: PEOPLE[mk.giver].blip, c: PEOPLE[mk.giver].color, ix: mk.x, iz: mk.z });
    if (!A0) return { title: '', text: '', blips, cut: false, active: false };
    const st = A0.def.steps[A0.idx];
    const car = (id) => m.cars.get(A0.cars[id]);
    if (st) {
      const dest = (p, r = 4) => blips.push({ x: p.x, z: p.z, k: 'dest', r });
      switch (st.do) {
        case 'enter': { const c = car(st.car); if (c) blips.push({ car: c.id, k: 'car' }); break; }
        case 'deliver': { const c = car(st.car); const inIt = c && m.players.some((p) => p.car === c.id); if (inIt) dest(st.at, st.r); else if (c) blips.push({ car: c.id, k: 'car' }); break; }
        case 'goto': dest(st.at, st.r); break;
        case 'kill': for (const id of A0.groups[st.group] || []) { const p = m.peds.get(id); if (p && !p.dead) blips.push({ ped: p.id, k: 'enemy' }); } break;
        case 'pickup': { const pk = m.pickups.get(A0.pickups[st.id]); if (pk) blips.push({ x: pk.x, z: pk.z, k: 'pickup' }); break; }
        case 'board': { const c = m.cars.get(A0.s.car); if (c) blips.push({ car: c.id, k: 'car' }); for (const id of A0.groups[st.group] || []) { const p = m.peds.get(id); if (p && p.inCar == null && !p.dead) blips.push({ ped: p.id, k: 'friend' }); } break; }
        case 'race': { const pts = st.points; const i = A0.s.idx || 0; if (pts[i]) blips.push({ x: pts[i][0], z: pts[i][1], k: 'check', r: 13 }); if (pts[i + 1]) blips.push({ x: pts[i + 1][0], z: pts[i + 1][1], k: 'check2' }); for (const id of A0.s.racers || []) blips.push({ car: id, k: 'enemy' }); break; }
        case 'destroy': for (const id of st.cars) { const c = car(id); if (c && !c.dead) blips.push({ car: c.id, k: 'enemy' }); } break;
        case 'target': { const o = m.objects.get(A0.objects[st.id]); if (o) blips.push({ x: o.x, z: o.z, k: 'enemy' }); break; }
        default:
      }
    }
    return { title: A0.def.title, text: A0.text, blips, cut: A0.cut, active: true, giver: A0.def.giver };
  }

  // a dialogue being skipped (Space, by anyone)
  skip() {
    const A0 = this.active;
    if (!A0) return;
    const st = A0.def.steps[A0.idx];
    if (st && st.do === 'say' && A0.begun) { A0.s.end = this.m.t; this.m.emit({ t: 'shush' }); }
  }
}

function driven(m, c) { return m.players.some((p) => p.car === c.id && p.seat === 0 && p.state === 'alive'); }

export { WEAPONS };
