// The cars nobody's playing: ordinary traffic (keeps right, stops at red
// lights, brakes for whatever's in front), police cars (sirens, straight
// through the lights, after whoever's wanted), getaway drivers, racers.
// Every AI car follows a polyline of points built lane by lane from the
// road graph, steering for a point a little way ahead. Out on the highways
// traffic goes faster, easing off only for the tighter bends.

import { NODES, EDGES, lane, light, hasLights, STOP, nodeAt, edgesNear } from '../shared/city.js';
import { stepCar, CAR_TYPES } from '../shared/car.js';

const TAU = Math.PI * 2;

// the junction graph: shortest routes between junctions
const DIST = (() => {
  const n = NODES.length, D = [];
  for (let s = 0; s < n; s++) {
    const d = new Array(n).fill(Infinity);
    d[s] = 0;
    const q = [s];
    while (q.length) {
      const u = q.shift();
      for (const eid of NODES[u].edges) {
        const e = EDGES[eid], v = e.a === u ? e.b : e.a;
        if (d[u] + e.len < d[v]) { d[v] = d[u] + e.len; q.push(v); }
      }
    }
    D.push(d);
  }
  return D;
})();
export const roadDist = (a, b) => DIST[a][b];

const other = (e, n) => (e.a === n ? e.b : e.a);

// points along a lane, the last one at the stop line (knowing which light)
function lanePoints(edgeId, from, out) {
  const L = lane(edgeId, from);
  const steps = Math.max(2, Math.round(L.len / 8));
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const p = { x: L.x0 + (L.x1 - L.x0) * t, z: L.z0 + (L.z1 - L.z0) * t, hw: L.hw };
    if (k === steps && hasLights(L.to)) p.stop = { node: L.to, axis: EDGES[edgeId].axis };
    out.push(p);
  }
  return L;
}

// how sharply lane A turns into lane B (radians, 0 = straight on)
const turnAngle = (A, B) => Math.atan2(Math.abs(A.dx * B.dz - A.dz * B.dx), A.dx * B.dx + A.dz * B.dz);

// A curve through a junction from the end of lane A to the start of lane B.
// Each point knows the bend's radius, so drivers know how fast to take it.
function turnPoints(A, B, out) {
  const P = { x: A.x1, z: A.z1 }, Q = { x: B.x0, z: B.z0 };
  const ang = turnAngle(A, B);
  if (ang < 0.06) { out.push({ x: (P.x + Q.x) / 2, z: (P.z + Q.z) / 2, junction: A.to, hw: A.hw }); return; }
  // the corner where the two lane lines cross
  const den = A.dx * B.dz - A.dz * B.dx;
  let C = { x: (P.x + Q.x) / 2, z: (P.z + Q.z) / 2 };
  if (Math.abs(den) > 1e-3) {
    const s = ((Q.x - P.x) * B.dz - (Q.z - P.z) * B.dx) / den;
    if (s > 0 && s < 40) C = { x: P.x + A.dx * s, z: P.z + A.dz * s };
  }
  // a highway's gentle bend is as wide as its stretches are long; a street
  // corner is as tight as the turn itself
  const len = Math.hypot(P.x - C.x, P.z - C.z) + Math.hypot(Q.x - C.x, Q.z - C.z);
  const node = NODES[A.to];
  const span = node.city ? len : Math.max(len, Math.min(EDGES[A.edge].len, EDGES[B.edge].len));
  const bend = span / ang;
  const n = ang > 0.7 ? 5 : 2;
  for (let k = 1; k <= n; k++) {
    const t = k / (n + 1), u = 1 - t;
    out.push({ x: u * u * P.x + 2 * u * t * C.x + t * t * Q.x, z: u * u * P.z + 2 * u * t * C.z + t * t * Q.z, junction: A.to, bend, hw: A.hw });
  }
}

export class Driver {
  // mode: 'cruise' (traffic), 'chase', 'flee', 'route' (to a junction),
  // 'race' (through points), 'park' (stopped)
  constructor(m, car, mode = 'cruise') {
    this.m = m;
    this.car = car;
    this.mode = mode;
    this.pts = [];
    this.lane = null;          // the lane we're on (or heading for)
    this.cruise = 9 + m.rng() * 4;
    this.fast = 19 + m.rng() * 7;          // on the highways
    this.stuckT = 0;
    this.hornT = 0;
    this.panicT = 0;
    this.target = null;        // { x, z } for chase / flee
    this.goal = null;          // junction id for route
    this.raceIdx = 0;
    this.ignoreLights = false;
  }

  // join the road at the nearest lane heading roughly the way we face
  join() {
    const c = this.car;
    let best = null, bd = Infinity;
    let near = edgesNear(c.x, c.z, 50);
    if (!near.length) near = EDGES;
    for (const e of near) {
      for (const from of [e.a, e.b]) {
        const L = lane(e.id, from);
        // distance from the car to the lane segment
        const vx = L.x1 - L.x0, vz = L.z1 - L.z0, len2 = vx * vx + vz * vz;
        let t = ((c.x - L.x0) * vx + (c.z - L.z0) * vz) / len2;
        t = Math.max(0, Math.min(1, t));
        const px = L.x0 + vx * t, pz = L.z0 + vz * t;
        let d = Math.hypot(c.x - px, c.z - pz);
        const dot = Math.sin(c.h) * L.dx + Math.cos(c.h) * L.dz;
        if (dot < 0.3) d += 30;
        if (d < bd) { bd = d; best = { L, t }; }
      }
    }
    this.pts = [];
    const { L, t } = best;
    this.lane = L;
    const tmp = [];
    lanePoints(L.edge, L.from, tmp);
    // the points still ahead of us
    for (const p of tmp) {
      const along = ((p.x - L.x0) * (L.x1 - L.x0) + (p.z - L.z0) * (L.z1 - L.z0)) / (L.len * L.len);
      if (along >= t - 0.02) this.pts.push(p);
    }
    if (!this.pts.length) this.pts.push(tmp[tmp.length - 1]);
  }

  // where to go at the end of the lane: the next lane
  pickNext(L) {
    const n = NODES[L.to];
    const opts = n.edges.filter((eid) => eid !== L.edge);
    if (!opts.length) return L.edge;     // (never: the grid has no dead ends)
    const aim = this.mode === 'chase' ? this.target : this.mode === 'race' ? this.raceTarget : null;
    if (aim && (this.goal == null || this.goal === L.to)) {
      // at the junction nearest them (or the checkpoint): the road that
      // points their way
      let best = opts[0], bd = -Infinity;
      for (const eid of opts) {
        const v = NODES[other(EDGES[eid], L.to)], u = NODES[L.to];
        const dx = v.x - u.x, dz = v.z - u.z, tx = aim.x - u.x, tz = aim.z - u.z;
        const d = (dx * tx + dz * tz) / (Math.hypot(dx, dz) * (Math.hypot(tx, tz) || 1));
        if (d > bd) { bd = d; best = eid; }
      }
      return best;
    }
    if (this.mode === 'route' || this.mode === 'race' || (this.mode === 'chase' && this.goal != null)) {
      // the way that's shortest to the goal junction
      const goal = this.goal ?? L.to;
      let best = opts[0], bd = Infinity;
      for (const eid of opts) {
        const v = other(EDGES[eid], L.to);
        const d = EDGES[eid].len + DIST[v][goal];
        if (d < bd) { bd = d; best = eid; }
      }
      return best;
    }
    if (this.mode === 'flee' && this.target) {
      // the way that leads furthest from what we're running from
      let best = opts[0], bd = -Infinity;
      for (const eid of opts) {
        const v = NODES[other(EDGES[eid], L.to)];
        const d = Math.hypot(v.x - this.target.x, v.z - this.target.z) + this.m.rng() * 25;
        if (d > bd) { bd = d; best = eid; }
      }
      return best;
    }
    // traffic: mostly straight on, sometimes turning (and never back the
    // way it came)
    let straight = null, sa = Infinity;
    for (const eid of opts) { const a = turnAngle(L, lane(eid, L.to)); if (a < sa) { sa = a; straight = eid; } }
    if (opts.length === 1 || this.m.rng() < 0.55) return straight;
    const turns = opts.filter((eid) => turnAngle(L, lane(eid, L.to)) < 2.6);
    return turns.length ? turns[Math.floor(this.m.rng() * turns.length)] : straight;
  }

  extend() {
    while (this.pts.length < 14) {
      const L = this.lane;
      const next = this.pickNext(L);
      const L2 = lane(next, L.to);
      turnPoints(L, L2, this.pts);
      lanePoints(L2.edge, L2.from, this.pts);
      this.lane = L2;
    }
  }

  // speed we can do and still stop by the point (d metres away)
  stopSpeed(d) { return Math.sqrt(Math.max(0, 2 * 6 * Math.max(0, d))); }

  step(dt) {
    const c = this.car, m = this.m;
    if (c.dead) { stepCar(c, { throttle: 0, steer: 0, handbrake: true }, dt, m.carEnv(c)); return; }
    if (this.mode === 'park') { stepCar(c, { throttle: 0, steer: 0, handbrake: true }, dt, m.carEnv(c)); return; }
    this.panicT = Math.max(0, this.panicT - dt);
    const T = CAR_TYPES[c.type];
    const s = Math.sin(c.h), co = Math.cos(c.h);

    // chasing something close by: straight at it, not round the roads
    let direct = null;
    if (this.mode === 'chase' && this.target) {
      const d = Math.hypot(this.target.x - c.x, this.target.z - c.z);
      if (d < 60 && m.solids.clear(c.x, 1, c.z, this.target.x, 1, this.target.z)) direct = this.target;
      else {
        // route to the junction nearest the target
        let best = null, bd = Infinity;
        for (const n of NODES) { const dd = Math.hypot(n.x - this.target.x, n.z - this.target.z); if (dd < bd) { bd = dd; best = n; } }
        if (this.goal !== best.id) { this.goal = best.id; this.rejoinT = 0; }
      }
    }
    if (this.mode === 'race' && this.racePts) {
      const p = this.racePts[this.raceIdx];
      if (p) {
        const d = Math.hypot(p[0] - c.x, p[1] - c.z);
        // through it: plan the way to the next one afresh
        if (d < 14) { this.raceIdx++; this.onCheckpoint?.(this.raceIdx); this.lane = null; this.pts.length = 0; }
        const q = this.racePts[this.raceIdx];
        if (q) {
          this.raceTarget = { x: q[0], z: q[1] };
          let best = null, bd = Infinity;
          for (const n of NODES) { const dd = Math.hypot(n.x - q[0], n.z - q[1]); if (dd < bd) { bd = dd; best = n; } }
          if (this.goal !== best.id) { this.goal = best.id; }
          if (Math.hypot(q[0] - c.x, q[1] - c.z) < 30) direct = { x: q[0], z: q[1] };
        }
      }
    }

    const pace = this.pts[0] && this.pts[0].hw ? Math.max(this.cruise, this.fast) : this.cruise;
    let tx, tz, want = this.panicT > 0 || this.mode === 'flee' ? T.top * 0.8 : this.mode === 'chase' || this.mode === 'race' ? T.top * 0.92 : pace;
    // pulling up by someone on foot (the police, to get out and grab them)
    if (this.mode === 'chase' && this.approach && this.target) want = Math.min(want, Math.max(2, this.stopSpeed(Math.hypot(this.target.x - c.x, this.target.z - c.z) - 9)));
    if (this.mode === 'race' && this.rubber) want *= this.rubber;
    const ignore = this.ignoreLights || this.mode !== 'cruise' || this.panicT > 0;
    if (direct) {
      tx = direct.x; tz = direct.z;
      this.pts.length = 0;
      this.lane = null;
    } else {
      if (!this.lane || !this.pts.length) this.join();
      // drop points we've passed
      // (not too far, or we cut the corners)
      const look = Math.min(9, 4 + Math.abs(c.v) * 0.35);
      while (this.pts.length > 1) {
        const p = this.pts[0];
        const d = Math.hypot(p.x - c.x, p.z - c.z);
        const ahead = (p.x - c.x) * s + (p.z - c.z) * co;
        if (d < look || ahead < -1) this.pts.shift(); else break;
      }
      this.extend();
      const p = this.pts[0];
      tx = p.x; tz = p.z;
      // slow for corners, soon enough to make them
      let ahead = 0;
      const window = Math.max(18, c.v * c.v / 14 + 6);
      const grip = this.mode === 'cruise' || this.mode === 'route' ? 5.5 : 9.5;
      for (let k = 0; k < this.pts.length && ahead < window; k++) {
        ahead += Math.hypot(this.pts[k].x - (k ? this.pts[k - 1].x : c.x), this.pts[k].z - (k ? this.pts[k - 1].z : c.z));
        const b = this.pts[k].bend;
        if (b) {
          const corner = Math.max(6, Math.sqrt(grip * b));
          if (corner < want) want = Math.min(want, Math.sqrt(corner * corner + 2 * 7 * Math.max(0, ahead - 4)));
        }
      }
      // red lights
      if (!ignore) {
        let along = Math.hypot(this.pts[0].x - c.x, this.pts[0].z - c.z);
        for (let k = 0; k < this.pts.length; k++) {
          const q = this.pts[k];
          if (k > 0) along += Math.hypot(q.x - this.pts[k - 1].x, q.z - this.pts[k - 1].z);
          if (along > 45) break;
          if (q.stop) {
            const l = light(q.stop.node, q.stop.axis, m.t);
            const stopAt = along - 1;
            if (l === 'r' || (l === 'y' && stopAt > Math.abs(c.v) * 1.2)) want = Math.min(want, this.stopSpeed(stopAt));
            break;
          }
        }
      }
    }

    // anything in the way?
    const gap = this.gapAhead();
    if (gap < 40) want = Math.min(want, this.mode === 'chase' && direct ? want : Math.max(0, (gap - 3) * 0.8));
    // stuck behind something that isn't going anywhere (a parked car we
    // swung into, a wreck, a jam): back up and go round. Traffic waits a
    // while for traffic; anyone in a hurry doesn't.
    if (gap < 4 && Math.abs(c.v) < 1.5) this.blockT = (this.blockT || 0) + dt; else this.blockT = Math.max(0, (this.blockT || 0) - dt);
    const b = this.blocker;
    const waiting = b && b.ai && b.ai.mode !== 'park' && !b.dead && (b.ai.blockT || 0) < 2;
    const patience = this.mode !== 'cruise' && this.mode !== 'route' ? 1.2 : waiting ? 10 : b && !b.hl ? 4 : 2.5;
    if (this.blockT > patience) { this.reverseT = 1.3; this.blockT = 0; }

    // steer for the target point
    const dx = tx - c.x, dz = tz - c.z;
    const fwd = dx * s + dz * co, right = dx * -co + dz * s;
    const ang = Math.atan2(right, Math.max(0.01, fwd));
    let steer = Math.max(-1, Math.min(1, ang * 2.2));
    if (fwd < 0 && direct) steer = right > 0 ? 1 : -1;
    // keep off walls when driving straight at something
    if (direct) steer += this.whiskers();
    let throttle = Math.max(-1, Math.min(1, (want - c.v) * 0.35));
    if (want < 0.5 && c.v < 0.5) throttle = 0;
    const handbrake = want < 0.3 && Math.abs(c.v) < 2;

    // stuck (against a wall, nose in)? back up a bit
    if (Math.abs(c.v) < 0.6 && want > 3) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt * 2);
    if (this.stuckT > 1.5) { this.reverseT = 1.4; this.stuckT = 0; }
    if (this.reverseT > 0) { this.reverseT -= dt; throttle = -0.8; steer = -steer; }
    // honk at whoever's blocking
    this.hornT -= dt;
    this.horn = false;
    if (gap < 8 && want > 4 && Math.abs(c.v) < 1 && this.hornT <= 0 && this.mode === 'cruise') { this.hornT = 3 + m.rng() * 4; this.horn = true; }
    this.waitT = (Math.abs(c.v) < 0.5 ? (this.waitT || 0) + dt : 0);

    stepCar(c, { throttle, steer, handbrake: handbrake || (this.reverseT > 0 ? false : false) }, dt, m.carEnv(c));
    this.inp = { throttle, steer };
  }

  // the nearest car or person in front of us, in our lane (metres to them)
  gapAhead() {
    const c = this.car, m = this.m;
    const s = Math.sin(c.h), co = Math.cos(c.h);
    let gap = Infinity;
    this.blocker = null;
    const check = (x, z, half, w, o) => {
      const dx = x - c.x, dz = z - c.z;
      const f = dx * s + dz * co, r = dx * -co + dz * s;
      if (f < 0 || f > 40) return;
      // in our lane (cars parked at the kerb are not)
      if (Math.abs(r) > (w + c.hw) * 0.8) return;
      if (f - c.hl - half < gap) { gap = f - c.hl - half; this.blocker = o; }
    };
    for (const o of m.cars.values()) {
      if (o === c || o.gone) continue;
      if (Math.abs(o.x - c.x) > 42 || Math.abs(o.z - c.z) > 42) continue;
      check(o.x, o.z, o.hl * 0.7, o.hw, o);
    }
    if (this.mode === 'cruise' || this.mode === 'route') {
      for (const p of m.peds.values()) if (!p.dead && p.inCar == null && Math.abs(p.x - c.x) < 40 && Math.abs(p.z - c.z) < 40) check(p.x, p.z, 0.3, 0.6, p);
      for (const p of m.players) if (p.car == null && p.state === 'alive') check(p.x, p.z, 0.3, 0.6, p);
    }
    return gap;
  }

  // feelers left and right: steer away from walls close ahead
  whiskers() {
    const c = this.car, m = this.m;
    let steer = 0;
    for (const side of [-1, 1]) {
      const a = c.h - side * 0.45;
      const dx = Math.sin(a), dz = Math.cos(a);
      const h = m.solids.ray(c.x, (c.y || 0) + 0.8, c.z, dx, 0, dz, 9);
      if (h) steer -= side * (1 - h.t / 9) * 0.9;
    }
    return steer;
  }
}

// a heading in (-pi, pi]
export function wrap(a) {
  while (a > Math.PI) a -= TAU;
  while (a <= -Math.PI) a += TAU;
  return a;
}

export { nodeAt, STOP };
