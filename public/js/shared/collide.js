// Collision for the city, shared by the host and every client. Everything
// solid that doesn't move is an axis-aligned box { x0, x1, y0, y1, z0, z1 }
// kept in a hash grid. People are circles on the ground; cars are oriented
// boxes; bullets are rays in 3D.
//
// A box can be `small` (a lamp post, a hydrant, a bench): people walk round
// it, cars go straight through (with a clang).

const CELL = 8;
const key = (ix, iz) => ix * 100003 + iz;

export class Solids {
  constructor(boxes = []) {
    this.grid = new Map();
    this.all = [];
    for (const b of boxes) this.add(b);
  }

  add(b) {
    this.all.push(b);
    for (let ix = Math.floor(b.x0 / CELL); ix <= Math.floor(b.x1 / CELL); ix++) {
      for (let iz = Math.floor(b.z0 / CELL); iz <= Math.floor(b.z1 / CELL); iz++) {
        const k = key(ix, iz);
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(b);
      }
    }
  }

  // every box within r of (x, z) (and maybe a few more)
  near(x, z, r, out = new Set()) {
    out.clear();
    for (let ix = Math.floor((x - r) / CELL); ix <= Math.floor((x + r) / CELL); ix++) {
      for (let iz = Math.floor((z - r) / CELL); iz <= Math.floor((z + r) / CELL); iz++) {
        const l = this.grid.get(key(ix, iz));
        if (l) for (const b of l) out.add(b);
      }
    }
    return out;
  }

  // push a circle ({x, z}, radius r, standing at height y) out of every box
  // it's in; true if it touched one
  resolveCircle(pos, r, y = 0, small = true) {
    let hit = false;
    const near = this.near(pos.x, pos.z, r + 1, this._set || (this._set = new Set()));
    for (let pass = 0; pass < 2; pass++) {
      for (const b of near) {
        if (!small && b.small) continue;
        if (b.y1 < y + 0.3 || b.y0 > y + 1.6) continue;
        const cx = Math.max(b.x0, Math.min(pos.x, b.x1));
        const cz = Math.max(b.z0, Math.min(pos.z, b.z1));
        const dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        hit = true;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * r;
          pos.z = cz + (dz / d) * r;
        } else {
          const l = pos.x - b.x0, rr = b.x1 - pos.x, t = pos.z - b.z0, bt = b.z1 - pos.z;
          const m = Math.min(l, rr, t, bt);
          if (m === l) pos.x = b.x0 - r;
          else if (m === rr) pos.x = b.x1 + r;
          else if (m === t) pos.z = b.z0 - r;
          else pos.z = b.z1 + r;
        }
      }
    }
    return hit;
  }

  // the first box a ray from o along unit d (3D) hits within maxD:
  // { t, box, nx, ny, nz } or null
  ray(ox, oy, oz, dx, dy, dz, maxD, small = false) {
    const seen = this._raySeen || (this._raySeen = new Set());
    seen.clear();
    let best = null;
    const steps = Math.ceil(maxD / (CELL * 0.5)) + 1;
    for (let k = 0; k <= steps; k++) {
      const t = Math.min(maxD, k * CELL * 0.5);
      const x = ox + dx * t, z = oz + dz * t;
      const l = this.grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
      if (l) {
        for (const b of l) {
          if (seen.has(b) || (b.small && !small)) continue;
          seen.add(b);
          const h = rayBox(ox, oy, oz, dx, dy, dz, b, maxD);
          if (h && (!best || h.t < best.t)) best = { ...h, box: b };
        }
      }
      if (best && best.t < t - CELL) break;
    }
    return best;
  }

  // can you see from a to b (eye heights included)?
  clear(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1e-3) return true;
    const h = this.ray(ax, ay, az, dx / d, dy / d, dz / d, d);
    return !h || h.t >= d - 0.05;
  }
}

// slab test: a ray against an axis-aligned box
export function rayBox(ox, oy, oz, dx, dy, dz, b, maxD) {
  let t0 = 0, t1 = maxD, n = 0;
  const axes = [[ox, dx, b.x0, b.x1], [oy, dy, b.y0, b.y1], [oz, dz, b.z0, b.z1]];
  for (let i = 0; i < 3; i++) {
    const [o, d, lo, hi] = axes[i];
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let a = (lo - o) / d, c = (hi - o) / d;
    let sign = -1;
    if (a > c) { [a, c] = [c, a]; sign = 1; }
    if (a > t0) { t0 = a; n = (i + 1) * sign; }
    if (c < t1) t1 = c;
    if (t0 > t1) return null;
  }
  if (t0 <= 0 && n === 0) return { t: 0, nx: -dx, ny: -dy, nz: -dz };
  return { t: t0, nx: Math.abs(n) === 1 ? Math.sign(n) : 0, ny: Math.abs(n) === 2 ? Math.sign(n) : 0, nz: Math.abs(n) === 3 ? Math.sign(n) : 0 };
}

// A ray against a car: an oriented box (centre x, z, heading h, half
// length hl, half width hw, height ht). Returns t or -1.
export function rayCar(ox, oy, oz, dx, dy, dz, c, maxD) {
  const s = Math.sin(c.h), co = Math.cos(c.h);
  // into the car's frame: forward f = (s, co), right r = (-co, s)
  const px = ox - c.x, pz = oz - c.z;
  const lf = px * s + pz * co, lr = -px * co + pz * s;
  const df = dx * s + dz * co, dr = -dx * co + dz * s;
  const h = rayBox(lr, oy, lf, dr, dy, df, { x0: -c.hw, x1: c.hw, y0: 0.15, y1: c.ht, z0: -c.hl, z1: c.hl }, maxD);
  return h ? h.t : -1;
}

// A ray against a standing person (a cylinder from the ground to 1.85 m;
// lying down, a low one). Returns t or -1.
export function rayPerson(ox, oy, oz, dx, dy, dz, p, maxD, r = 0.38, top = 1.85) {
  const fx = ox - p.x, fz = oz - p.z;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return -1;
  const b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
    if (t < 0 || t > maxD) continue;
    const y = oy + dy * t - (p.y || 0);
    if (y >= 0 && y <= top) return t;
  }
  return -1;
}

// ------------------------------------------------- oriented boxes (cars) --
// corners of a car's box: [[x, z] * 4]
export function corners(c) {
  const s = Math.sin(c.h), co = Math.cos(c.h);
  const fx = s * c.hl, fz = co * c.hl, rx = -co * c.hw, rz = s * c.hw;
  return [
    [c.x + fx + rx, c.z + fz + rz], [c.x + fx - rx, c.z + fz - rz],
    [c.x - fx - rx, c.z - fz - rz], [c.x - fx + rx, c.z - fz + rz],
  ];
}

function project(pts, ax, az) {
  let lo = Infinity, hi = -Infinity;
  for (const [x, z] of pts) { const p = x * ax + z * az; if (p < lo) lo = p; if (p > hi) hi = p; }
  return [lo, hi];
}

// Separating axes between two convex quads (corner lists). Returns the
// push for A out of B { nx, nz, depth } (n points from B to A) or null.
function sat(A, B, axes) {
  let best = null;
  for (const [ax, az] of axes) {
    const [a0, a1] = project(A, ax, az), [b0, b1] = project(B, ax, az);
    const o = Math.min(a1, b1) - Math.max(a0, b0);
    if (o <= 0) return null;
    if (!best || o < best.depth) {
      // point the normal from B to A
      const sign = (a0 + a1) / 2 >= (b0 + b1) / 2 ? 1 : -1;
      best = { nx: ax * sign, nz: az * sign, depth: o };
    }
  }
  return best;
}

export function carVsBox(c, b) {
  if (c.x + c.hl + c.hw < b.x0 || c.x - c.hl - c.hw > b.x1 || c.z + c.hl + c.hw < b.z0 || c.z - c.hl - c.hw > b.z1) return null;
  const s = Math.sin(c.h), co = Math.cos(c.h);
  const B = [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]];
  return sat(corners(c), B, [[1, 0], [0, 1], [s, co], [-co, s]]);
}

export function carVsCar(a, b) {
  const r = a.hl + a.hw + b.hl + b.hw;
  if (Math.abs(a.x - b.x) > r || Math.abs(a.z - b.z) > r) return null;
  const sa = Math.sin(a.h), ca = Math.cos(a.h), sb = Math.sin(b.h), cb = Math.cos(b.h);
  return sat(corners(a), corners(b), [[sa, ca], [-ca, sa], [sb, cb], [-cb, sb]]);
}

// is the circle (x, z, r) touching the car? returns the push for the circle
export function circleVsCar(x, z, r, c) {
  const s = Math.sin(c.h), co = Math.cos(c.h);
  const px = x - c.x, pz = z - c.z;
  const lf = px * s + pz * co, lr = -px * co + pz * s;
  const qf = Math.max(-c.hl, Math.min(c.hl, lf)), qr = Math.max(-c.hw, Math.min(c.hw, lr));
  const df = lf - qf, dr = lr - qr;
  const d2 = df * df + dr * dr;
  if (d2 >= r * r) return null;
  let nf, nr, depth;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    nf = df / d; nr = dr / d; depth = r - d;
  } else {
    // inside: out the nearest side
    const outF = c.hl - Math.abs(lf), outR = c.hw - Math.abs(lr);
    if (outF < outR) { nf = Math.sign(lf) || 1; nr = 0; depth = outF + r; } else { nf = 0; nr = Math.sign(lr) || 1; depth = outR + r; }
  }
  // back to world: forward (s, co), right (-co, s)
  return { nx: nf * s - nr * co, nz: nf * co + nr * s, depth };
}
