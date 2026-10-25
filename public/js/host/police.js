// The Kingsgate Police Department. Each player has their own wanted level:
// crimes add heat, heat makes stars, stars bring police cars (sirens, on
// the road network until they're close, then straight at you) and officers
// on foot. From two stars they shoot. Get out of every cop's sight long
// enough (longer with more stars), or drive into Spray-N-Go, and they lose
// you. Let one hold on to you and you're busted.

import { WANTED } from '../shared/config.js';
import { NODES, EDGES, lane, areaName } from '../shared/city.js';
import { Driver } from './drivers.js';
import { makePed, LOOK_COP, A } from './peds.js';
import { DISPATCH } from '../shared/story.js';

export class Police {
  constructor(m) {
    this.m = m;
    this.spawnT = 0;
  }

  // a crime by player p: add heat (in stars), at least `min` stars
  crime(p, heat, min = 0) {
    if (!p || p.state !== 'alive') return;
    const before = p.wanted;
    p.heat = Math.min(5.99, Math.max(p.heat + heat, min));
    p.wanted = Math.min(5, Math.floor(p.heat));
    if (p.wanted > 0) {
      if (before === 0) { p.found = false; p.lastSeen = { x: p.x, z: p.z }; }
      p.seenT = this.m.t;
    }
    if (p.wanted > before) {
      this.m.emit({ t: 'fx', k: 'wanted', id: p.id, n: p.wanted });
      this.m.radio(DISPATCH[p.wanted].replace('{area}', areaName(p.x, p.z)));
    }
  }

  clear(p, why = 'lost') {
    if (!p.wanted && !p.heat) return;
    p.wanted = 0;
    p.heat = 0;
    this.m.emit({ t: 'fx', k: 'wanted', id: p.id, n: 0 });
    if (why === 'lost') this.m.radio(DISPATCH.clear);
  }

  // a cop (or police car) has eyes on player p
  saw(p, by) {
    p.seenT = this.m.t;
    const pos = this.m.outPos(p);
    p.lastSeen = { x: pos.x, z: pos.z };
  }

  // the wanted player nearest a cop
  pickTarget(cop) {
    let best = null, bd = 140;
    for (const p of this.m.players) {
      if (p.state !== 'alive' || !p.wanted) continue;
      const pos = this.m.outPos(p);
      const d = Math.hypot(pos.x - cop.x, pos.z - cop.z);
      if (d < bd) { bd = d; best = p.id; }
    }
    return best;
  }

  step(dt) {
    const m = this.m;
    for (const p of m.players) {
      if (p.state !== 'alive') continue;
      if (!p.wanted) { p.arrestT = 0; continue; }
      const pos = m.outPos(p);
      // police cars see you too
      for (const c of m.cars.values()) {
        if (!c.police || c.dead || !c.ai) continue;
        const d = Math.hypot(c.x - pos.x, c.z - pos.z);
        if (d < 55 && m.solids.clear(c.x, 1.3, c.z, pos.x, 1.2, pos.z)) this.saw(p, c);
      }
      // until a unit has caught up with them, dispatch knows where they
      // are; after that it's down to what the police can see
      if (!p.found) {
        for (const c of m.cars.values()) if (c.police && c.chasing === p.id && Math.hypot(c.x - pos.x, c.z - pos.z) < 70) p.found = true;
        for (const c of m.peds.values()) if (c.kind === 'cop' && !c.dead && Math.hypot(c.x - pos.x, c.z - pos.z) < 70) p.found = true;
        if (!p.found) this.saw(p, null);
      }
      // out of sight long enough: gone
      const unseen = m.t - (p.seenT ?? m.t);
      p.searching = unseen > 2.5;
      if (unseen > WANTED.lose[p.wanted]) this.clear(p);
      // held by a cop: busted
      let held = false;
      for (const c of m.peds.values()) {
        if (c.kind !== 'cop' || c.dead || c.downT > 0) continue;
        const d = Math.hypot(c.x - pos.x, c.z - pos.z);
        if (p.car == null && d < 1.3 && p.speed < 3.2) held = true;
        if (p.car != null && d < 2.6) { const car = m.cars.get(p.car); if (car && Math.abs(car.v) < 1) held = true; }
      }
      p.arrestT = held ? p.arrestT + dt : Math.max(0, p.arrestT - dt * 2);
      if (p.arrestT > WANTED.arrest) m.busted(p);
    }
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 1.5; this.dispatch(); }
    this.stepCars(dt);
  }

  // keep enough police cars after each wanted player
  dispatch() {
    const m = this.m;
    for (const p of m.players) {
      if (p.state !== 'alive' || !p.wanted) continue;
      const after = [...m.cars.values()].filter((c) => c.police && c.ai && c.ai.mode === 'chase' && c.chasing === p.id && !c.dead).length;
      if (after >= WANTED.cars[p.wanted]) continue;
      const cops = [...m.peds.values()].filter((c) => c.kind === 'cop' && !c.dead).length;
      if (cops > 14) continue;
      const pos = m.outPos(p);
      // a lane 70-120 m away, out of sight if we can
      let best = null, bs = -Infinity;
      for (let k = 0; k < 24; k++) {
        const e = EDGES[Math.floor(m.rng() * EDGES.length)];
        const from = m.rng() < 0.5 ? e.a : e.b;
        const L = lane(e.id, from);
        const t = 0.2 + m.rng() * 0.6;
        const x = L.x0 + (L.x1 - L.x0) * t, z = L.z0 + (L.z1 - L.z0) * t;
        const d = Math.hypot(x - pos.x, z - pos.z);
        if (d < 65 || d > 125) continue;
        let score = -Math.abs(d - 90) + (m.anyoneSees(x, 1, z) ? -60 : 0);
        if (m.carAt(x, z, 5)) score -= 100;
        if (score > bs) { bs = score; best = { x, z, h: L.h }; }
      }
      if (!best) continue;
      const c = m.spawnCar('police', best.x, best.z, best.h, { police: true });
      c.ai = new Driver(m, c, 'chase');
      c.chasing = p.id;
      c.siren = true;
      c.crew = 2;
    }
  }

  stepCars(dt) {
    const m = this.m;
    for (const c of m.cars.values()) {
      if (!c.police || !c.ai || c.dead) continue;
      const p = c.chasing ? m.player(c.chasing) : null;
      if (!p || p.state !== 'alive' || !p.wanted) {
        // back to patrolling: drive away, and go when nobody's looking
        c.chasing = null;
        c.siren = false;
        if (c.ai.mode === 'chase') { c.ai.mode = 'cruise'; c.ai.target = null; c.ai.goal = null; c.ai.lane = null; }
        // a new target?
        const t = this.pickTarget(c);
        if (t && Math.hypot(m.outPos(m.player(t)).x - c.x, m.outPos(m.player(t)).z - c.z) < 90) { c.chasing = t; c.ai.mode = 'chase'; c.siren = true; }
        continue;
      }
      const pos = m.outPos(p);
      // chase where they were last seen (or where they are, if we're close)
      const d = Math.hypot(pos.x - c.x, pos.z - c.z);
      c.ai.target = d < 45 || !p.lastSeen ? { x: pos.x, z: pos.z } : p.lastSeen;
      // close, and they're on foot (or stopped): out we get
      const pc = p.car != null ? m.cars.get(p.car) : null;
      const stopped = !pc || Math.abs(pc.v) < 3;
      c.ai.approach = c.crew > 0 && stopped;
      if (c.crew > 0 && d < (pc ? 16 : 24) && stopped && Math.abs(c.v) < 6) {
        for (let k = 0; k < c.crew; k++) {
          const side = k === 0 ? 1 : -1;
          const s = Math.sin(c.h), co = Math.cos(c.h);
          const cop = makePed('cop', c.x - co * 1.4 * side, c.z + s * 1.4 * side, LOOK_COP);
          cop.target = p.id;
          cop.anim = A.run;
          cop.w = p.wanted >= 2 ? 1 : 0;
          m.addPed(cop);
        }
        c.crew = 0;
        c.ai.mode = 'park';
        c.siren = true;
      }
    }
    // cops on foot whose target got away, far from everyone: gone
    for (const c of m.peds.values()) {
      if (c.kind !== 'cop' || c.target) continue;
      if ((c.idleT || 0) > 8 && !m.anyoneSees(c.x, 1, c.z)) m.removePed(c);
    }
  }
}

export { NODES };
