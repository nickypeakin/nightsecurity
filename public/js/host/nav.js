// Getting about the mall for everything the host moves itself: the
// mannequins, the thing in Dale's uniform, and Dale. Paths come from the
// distance fields NavGrid spreads out from a goal; a walker looks a few
// squares down the slope and heads for the furthest one it can walk to in
// a straight line, so it cuts corners like a person instead of zig-zagging
// square by square.

import { GRID } from '../shared/mall.js';

export const yawTo = (dx, dz) => Math.atan2(-dx, -dz);

export function turn(from, to, rate) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + Math.max(-rate, Math.min(rate, d));
}

// Fields cached by goal square and door rules, rebuilt every `ttl` seconds.
export class FieldCache {
  constructor(nav) {
    this.nav = nav;
    this.cache = new Map();
  }

  get(t, x, z, passKey, pass, ttl = 0.6) {
    const i = this.nav.idx(x, z);
    const key = `${passKey}:${i}`;
    const c = this.cache.get(key);
    if (c && t - c.t < ttl) return c.D;
    const D = c && c.D.length === this.nav.n ? c.D : new Float32Array(this.nav.n);
    D.set(this.nav.field(x, z, pass));
    this.cache.set(key, { t, D });
    // forget fields nobody's asked for in a while
    if (this.cache.size > 24) for (const [k, v] of this.cache) if (t - v.t > 5) this.cache.delete(k);
    return D;
  }

  clear() { this.cache.clear(); }
}

// can a walker go straight from a to b on open floor (doors per pass)?
function straight(nav, ax, az, bx, bz, pass) {
  const d = Math.hypot(bx - ax, bz - az);
  const steps = Math.ceil(d / (GRID.cell * 0.5));
  for (let k = 1; k <= steps; k++) {
    const t = k / steps;
    const i = nav.idx(ax + (bx - ax) * t, az + (bz - az) * t);
    if (i < 0 || !nav.walk[i]) return false;
    const dk = nav.doorAt[i];
    if (dk >= 0 && !pass(dk)) return false;
  }
  return true;
}

// is a walker of radius r clear of every solid all the way from a to b?
function clearLine(solids, ax, az, bx, bz, r) {
  const d = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(d / 0.2));
  const boxes = solids.near((ax + bx) / 2, (az + bz) / 2, d / 2 + r + 0.5);
  for (let k = 1; k <= steps; k++) {
    const t = k / steps, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    for (const b of boxes) {
      if (b.y0 > 1.3 || b.y1 < 0.2) continue;
      const cx = Math.max(b.x0, Math.min(x, b.x1)), cz = Math.max(b.z0, Math.min(z, b.z1));
      if ((x - cx) * (x - cx) + (z - cz) * (z - cz) < r * r) return false;
    }
  }
  return true;
}

// One step of `a` ({ x, z, ry }) down field D at `speed`. Returns
// { left: path distance remaining, door: index of a shut door just ahead
// (the walker waits there) or -1, stuck: no way there }.
export function follow(nav, solids, a, D, speed, dt, r, pass, isShut) {
  let i = nav.idx(a.x, a.z);
  if (i < 0) return { left: 1e9, door: -1, stuck: true };
  const nx = GRID.nx;
  const open = (j) => j >= 0 && j < nav.n && nav.walk[j] && D[j] < 1e8;
  if (!open(i)) {
    // off the open floor (squeezed into a corner or a doorframe): carry on
    // from the nearest square that leads somewhere
    let best = -1, bd = 1e9;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const j = i + dz * nx + dx;
      if (!open(j)) continue;
      const d = Math.hypot(nav.cx(j) - a.x, nav.cz(j) - a.z) + D[j] * 0.02;
      if (d < bd) { bd = d; best = j; }
    }
    if (best < 0) return { left: 1e9, door: -1, stuck: true };
    i = best;
  }
  const left = D[i];
  if (left < 0.3) return { left, door: -1, stuck: false };
  // walk the slope down a few squares (never diagonally round a corner)
  const chain = [];
  let cur = i;
  for (let k = 0; k < 14; k++) {
    let best = -1, bd = D[cur];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const j = cur + dz * nx + dx;
      if (!open(j)) continue;
      if (dx && dz && (!open(cur + dx) || !open(cur + dz * nx))) continue;
      if (D[j] < bd) { bd = D[j]; best = j; }
    }
    if (best < 0) break;
    chain.push(best);
    cur = best;
    if (bd <= 0) break;
  }
  if (!chain.length) return { left, door: -1, stuck: false };
  // a shut door in the next couple of metres: wait at it
  for (let k = 0; k < Math.min(chain.length, 5); k++) {
    const dk = nav.doorAt[chain[k]];
    if (dk >= 0 && isShut(dk)) {
      const tx = nav.cx(chain[Math.max(0, k - 1)]), tz = nav.cz(chain[Math.max(0, k - 1)]);
      if (k > 1) stepTo(solids, a, tx, tz, speed, dt, r);
      return { left, door: dk, stuck: false };
    }
  }
  let target = chain[0];
  for (let k = chain.length - 1; k > 0; k--) {
    const tx = nav.cx(chain[k]), tz = nav.cz(chain[k]);
    if (straight(nav, a.x, a.z, tx, tz, pass) && clearLine(solids, a.x, a.z, tx, tz, r * 0.95)) { target = chain[k]; break; }
  }
  const want = speed * dt * 0.25;
  // caught on a corner: make for the very next square, or the middle of
  // this one, instead
  if (stepTo(solids, a, nav.cx(target), nav.cz(target), speed, dt, r) < want) {
    if (target === chain[0] || stepTo(solids, a, nav.cx(chain[0]), nav.cz(chain[0]), speed, dt, r) < want) {
      stepTo(solids, a, nav.cx(i), nav.cz(i), speed, dt, r);
    }
  }
  return { left, door: -1, stuck: false };
}

// straight towards (tx, tz), sliding along whatever's in the way
export function stepTo(solids, a, tx, tz, speed, dt, r) {
  const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
  if (d < 1e-4) return 0;
  const s = Math.min(d, speed * dt);
  const pos = { x: a.x + (dx / d) * s, z: a.z + (dz / d) * s };
  solids.resolve(pos, r);
  const moved = Math.hypot(pos.x - a.x, pos.z - a.z);
  a.x = pos.x;
  a.z = pos.z;
  a.ry = turn(a.ry, yawTo(dx, dz), 9 * dt);
  return moved;
}
