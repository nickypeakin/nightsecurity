// People on foot, run by the host: pedestrians walking the sidewalks (they
// wait for the lights to cross, run from gunfire, get knocked flying by
// cars and drop their cash), police officers (chase, arrest, shoot),
// gang members (shoot), a getaway crew, and, for one job, the mannequins
// from Halvorsen's, who only move while nobody is looking at them.

import { WALK_NODES, light, nodeAt } from '../shared/city.js';
import { circleVsCar } from '../shared/collide.js';
import { PED, COP, WEAPONS, WEAPON_INDEX } from '../shared/config.js';
import { BARKS } from '../shared/story.js';

// pedestrian looks: the client has a body for each (0..PED_LOOKS-1)
export const PED_LOOKS = 14;
export const LOOK_COP = 100, LOOK_GANG = 101, LOOK_CREW = 102, LOOK_MQ = 103, LOOK_BOSS = 104, LOOK_MQ2 = 105;

// anim codes the client understands
export const A = { idle: 0, walk: 1, run: 2, aim: 3, down: 4, dead: 5, hands: 6, punch: 7, still: 8, cower: 9 };

let nextId = 1;

export function makePed(kind, x, z, look) {
  return {
    id: nextId++, kind, look, x, z, h: 0, v: 0, anim: A.idle, hp: kind === 'cop' ? COP.hp : PED.hp,
    mode: 'walk', t: 0, w: 0, dead: false, deadT: 0, downT: 0, fleeT: 0, from: null, to: null, wait: 0,
    cash: kind === 'civ' ? 5 + Math.floor(Math.random() * 40) : 20,
    vx: 0, vz: 0, shootT: 1 + Math.random(), barkT: 0,
  };
}

const TAU = Math.PI * 2;
const turnTo = (h, want, k) => {
  let d = want - h;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return h + d * Math.min(1, k);
};

export class Crowd {
  constructor(m) {
    this.m = m;
  }

  // ------------------------------------------------------------- moving
  // walk p towards (x, z) at speed; returns the distance left
  moveTo(p, x, z, speed, dt) {
    const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
    if (d < 0.05) { p.v = 0; return d; }
    const s = Math.min(d, speed * dt);
    p.x += (dx / d) * s;
    p.z += (dz / d) * s;
    p.h = turnTo(p.h, Math.atan2(dx, dz), dt * 10);
    p.v = speed;
    this.collide(p);
    return d - s;
  }

  collide(p) {
    const m = this.m;
    m.solids.resolveCircle(p, PED.r, 0, true);
    // shoved out of the way by cars (being hit is dealt with by the host)
    for (const c of m.cars.values()) {
      if (Math.abs(c.x - p.x) > 4 || Math.abs(c.z - p.z) > 4) continue;
      const h = circleVsCar(p.x, p.z, PED.r, c);
      if (h) { p.x += h.nx * h.depth; p.z += h.nz * h.depth; }
    }
  }

  // ------------------------------------------------------------- civilians
  // somewhere on the sidewalk network between two corners
  placeOnWalk(p, a, b, t) {
    const A = WALK_NODES[a], B = WALK_NODES[b];
    p.x = A.x + (B.x - A.x) * t;
    p.z = A.z + (B.z - A.z) * t;
    p.from = a; p.to = b;
    p.h = Math.atan2(B.x - A.x, B.z - A.z);
    // keep to one side of the sidewalk
    p.side = (Math.random() - 0.5) * 1.6;
  }

  stepCiv(p, dt) {
    const m = this.m;
    if (p.mode === 'flee') {
      p.fleeT -= dt;
      const dx = p.x - p.fromX, dz = p.z - p.fromZ, d = Math.hypot(dx, dz) || 1;
      this.moveTo(p, p.x + (dx / d) * 4, p.z + (dz / d) * 4, PED.run, dt);
      p.anim = A.run;
      if (p.fleeT <= 0) this.resumeWalk(p);
      return;
    }
    if (p.mode === 'cower') {
      p.fleeT -= dt;
      p.anim = A.cower;
      p.v = 0;
      if (p.fleeT <= 0) { p.mode = 'flee'; p.fleeT = 6; }
      return;
    }
    if (p.mode === 'idle') {
      p.wait -= dt;
      p.anim = A.idle;
      p.v = 0;
      if (p.wait <= 0) p.mode = 'walk';
      return;
    }
    // walking the sidewalks
    const B = WALK_NODES[p.to];
    const A0 = WALK_NODES[p.from];
    // a crossing: wait for the cars on the crossed road to have a red
    const link = A0.links.find((l) => l.to === p.to);
    if (link && link.cross && !p.crossing) {
      const l = light(link.cross.node, link.cross.axis, m.t);
      const atKerb = Math.hypot(A0.x - p.x, A0.z - p.z) < 1.2;
      if (atKerb && l !== 'r') { p.anim = A.idle; p.v = 0; return; }
      if (atKerb) p.crossing = true;
    }
    const ox = -(B.z - A0.z), oz = B.x - A0.x, ol = Math.hypot(ox, oz) || 1;
    const left = this.moveTo(p, B.x + (ox / ol) * p.side * 0.5, B.z + (oz / ol) * p.side * 0.5, PED.walk * (p.pace || 1), dt);
    p.anim = A.walk;
    if (left < 0.6) {
      p.crossing = false;
      // on to the next corner: rarely back the way we came
      const links = B.links.filter((l) => l.to !== p.from);
      const pick = links.length && Math.random() < 0.92 ? links[Math.floor(Math.random() * links.length)] : B.links[0];
      p.from = p.to;
      p.to = pick.to;
      if (Math.random() < 0.12) { p.mode = 'idle'; p.wait = 2 + Math.random() * 6; }
    }
  }

  resumeWalk(p) {
    // back to the nearest corner
    let best = null, bd = Infinity;
    for (const n of WALK_NODES) { const d = Math.hypot(n.x - p.x, n.z - p.z); if (d < bd) { bd = d; best = n; } }
    p.mode = 'walk';
    p.from = best.id;
    p.to = best.links[Math.floor(Math.random() * best.links.length)].to;
    p.crossing = false;
  }

  // someone (or something) frightening at (x, z)
  scare(x, z, r, { cower = false } = {}) {
    for (const p of this.m.peds.values()) {
      if (p.kind !== 'civ' || p.dead || p.downT > 0 || p.inCar != null) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d > r) continue;
      if (p.mode !== 'flee' && Math.random() < 0.3) this.m.bark(p, 'flee');
      p.fromX = x; p.fromZ = z;
      if (cower && d < 8 && Math.random() < 0.5) { p.mode = 'cower'; p.fleeT = 1 + Math.random() * 2; } else { p.mode = 'flee'; p.fleeT = 8 + Math.random() * 8; }
    }
  }

  // ------------------------------------------------------------- the law
  stepCop(p, dt) {
    const m = this.m;
    const tgt = p.target ? m.player(p.target) : null;
    if (!tgt || tgt.state !== 'alive' || tgt.wanted === 0) {
      // nobody to chase: walk back to the car or wander off
      p.target = m.police.pickTarget(p);
      if (!p.target) { p.anim = A.idle; p.v = 0; p.idleT = (p.idleT || 0) + dt; return; }
      return;
    }
    p.idleT = 0;
    const tx = tgt.car != null ? m.cars.get(tgt.car)?.x ?? tgt.x : tgt.x;
    const tz = tgt.car != null ? m.cars.get(tgt.car)?.z ?? tgt.z : tgt.z;
    const d = Math.hypot(tx - p.x, tz - p.z);
    const see = d < COP.sight && m.solids.clear(p.x, 1.6, p.z, tx, 1.2, tz);
    if (see) { p.lastX = tx; p.lastZ = tz; m.police.saw(tgt, p); }
    const shoot = tgt.wanted >= 2 || p.provoked;
    if (shoot && see && d < 32) {
      // stand and shoot (stepping in closer if far)
      p.anim = A.aim;
      p.h = turnTo(p.h, Math.atan2(tx - p.x, tz - p.z), dt * 8);
      if (d > 18) this.moveTo(p, tx, tz, 2.2, dt), p.anim = A.aim;
      else p.v = 0;
      p.w = WEAPON_INDEX.pistol;
      this.fireAt(p, tgt, dt, 0.95, 0.5);
      return;
    }
    // run them down (arrest when close)
    const gx = see ? tx : p.lastX ?? tx, gz = see ? tz : p.lastZ ?? tz;
    p.w = tgt.wanted >= 2 ? WEAPON_INDEX.pistol : 0;
    if (d > 1.1) { this.moveTo(p, gx, gz, COP.run, dt); p.anim = A.run; } else { p.v = 0; p.anim = A.hands; p.h = turnTo(p.h, Math.atan2(tx - p.x, tz - p.z), dt * 8); }
    p.barkT -= dt;
    if (p.barkT <= 0 && d < 25) { p.barkT = 4 + Math.random() * 4; m.bark(p, 'cop'); }
  }

  // a shot at a player from an NPC: hits are a matter of distance and luck
  fireAt(p, tgt, dt, rate, acc) {
    const m = this.m;
    p.shootT -= dt;
    if (p.shootT > 0) return;
    p.shootT = rate * (0.8 + Math.random() * 0.5);
    const inCar = tgt.car != null ? m.cars.get(tgt.car) : null;
    const tx = inCar ? inCar.x : tgt.x, tz = inCar ? inCar.z : tgt.z;
    const d = Math.hypot(tx - p.x, tz - p.z);
    const moving = inCar ? Math.abs(inCar.v) > 4 : tgt.speed > 3;
    const chance = Math.max(0.08, acc - d * 0.012 - (moving ? 0.15 : 0));
    const hit = Math.random() < chance;
    const w = WEAPONS[p.w || WEAPON_INDEX.pistol];
    // where the bullet goes: at them, or past them
    const miss = hit ? 0 : 1;
    const ex = tx + (Math.random() - 0.5) * 2.5 * miss, ez = tz + (Math.random() - 0.5) * 2.5 * miss, ey = 0.8 + Math.random() * 0.9;
    m.emit({ t: 'fx', k: 'shot', w: p.w || 1, o: [r2(p.x + Math.sin(p.h) * 0.5), 1.4, r2(p.z + Math.cos(p.h) * 0.5)], e: [r2(ex), r2(ey), r2(ez)], hit: hit ? (inCar ? 3 : 2) : 0, by: -p.id });
    if (!hit) return;
    if (inCar) m.hurtCar(inCar, w.dmg * 0.7, null);
    else m.hurtPlayer(tgt, w.dmg * (0.45 + Math.random() * 0.3), { by: p, dir: [tx - p.x, tz - p.z] });
  }

  // ------------------------------------------------------------- gangs
  stepGang(p, dt) {
    const m = this.m;
    // the nearest player
    let tgt = null, td = Infinity;
    for (const q of m.players) {
      if (q.state !== 'alive') continue;
      const c = q.car != null ? m.cars.get(q.car) : null;
      const d = Math.hypot((c ? c.x : q.x) - p.x, (c ? c.z : q.z) - p.z);
      if (d < td) { td = d; tgt = q; }
    }
    if (!tgt || td > 70) { p.anim = A.idle; p.v = 0; return; }
    const c = tgt.car != null ? m.cars.get(tgt.car) : null;
    const tx = c ? c.x : tgt.x, tz = c ? c.z : tgt.z;
    const see = m.solids.clear(p.x, 1.6, p.z, tx, 1.2, tz);
    p.w = p.w || WEAPON_INDEX.pistol;
    if (see && td < 30) {
      p.anim = A.aim;
      p.h = turnTo(p.h, Math.atan2(tx - p.x, tz - p.z), dt * 8);
      if (td > 16) this.moveTo(p, tx, tz, 2, dt);
      else if (td < 6) this.moveTo(p, p.x - (tx - p.x), p.z - (tz - p.z), 2.5, dt);
      else p.v = 0;
      p.anim = A.aim;
      this.fireAt(p, tgt, dt, p.w === WEAPON_INDEX.smg ? 0.35 : 0.9, 0.45);
      p.barkT -= dt;
      if (p.barkT <= 0) { p.barkT = 6 + Math.random() * 6; m.bark(p, 'gang'); }
    } else {
      this.moveTo(p, tx, tz, PED.run * 0.9, dt);
      p.anim = A.run;
    }
  }

  // ------------------------------------------------------------- mannequins
  // They only move while no player can see them: not in anyone's view (the
  // way their camera faces), or too far away in the dark. They're quick.
  stepMannequin(p, dt) {
    const m = this.m;
    let tgt = null, td = Infinity;
    for (const q of m.players) {
      if (q.state !== 'alive') continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < td) { td = d; tgt = q; }
    }
    p.anim = A.still;
    p.v = 0;
    if (!tgt) return;
    const seen = m.players.some((q) => q.state === 'alive' && m.sees(q, p.x, 1.2, p.z));
    p.seen = seen;
    if (seen) return;
    if (td > 1.0) this.moveTo(p, tgt.x, tgt.z, 6.5, dt);
    p.anim = A.still;
    p.h = turnTo(p.h, Math.atan2(tgt.x - p.x, tgt.z - p.z), 1);
    p.grabT = (p.grabT || 0) - dt;
    if (td < 1.3 && p.grabT <= 0) {
      p.grabT = 1.2;
      m.hurtPlayer(tgt, 22, { by: p, dir: [tgt.x - p.x, tgt.z - p.z] });
      m.emit({ t: 'fx', k: 'grab', x: r2(p.x), z: r2(p.z), id: tgt.id });
    }
  }

  // ------------------------------------------------------------- every tick
  step(dt) {
    const m = this.m;
    for (const p of m.peds.values()) {
      p.t += dt;
      if (p.dead) { p.deadT += dt; p.anim = A.dead; continue; }
      if (p.inCar != null) continue;
      if (p.downT > 0) {
        // knocked over: skid, then get up
        p.downT -= dt;
        p.x += p.vx * dt; p.z += p.vz * dt;
        p.vx *= Math.exp(-4 * dt); p.vz *= Math.exp(-4 * dt);
        m.solids.resolveCircle(p, PED.r, 0, true);
        p.anim = A.down;
        if (p.downT <= 0 && p.kind === 'civ') { p.mode = 'flee'; p.fleeT = 8; p.fromX = p.x - p.vx; p.fromZ = p.z - p.vz; }
        continue;
      }
      if (p.kind === 'civ') this.stepCiv(p, dt);
      else if (p.kind === 'cop') this.stepCop(p, dt);
      else if (p.kind === 'gang') this.stepGang(p, dt);
      else if (p.kind === 'mq') this.stepMannequin(p, dt);
      else if (p.kind === 'crew' && p.walkTo) {
        const left = this.moveTo(p, p.walkTo.x, p.walkTo.z, PED.run, dt);
        p.anim = left > 0.3 ? A.run : A.idle;
      }
    }
  }
}

export const r2 = (v) => Math.round(v * 100) / 100;
export { nodeAt };
