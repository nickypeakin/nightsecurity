// The island Kingsgate stands on: the shape of the coast, the lie of the
// land and the highways out of town. Shared by the host and every client, so
// everybody builds the same island from the same numbers.
//
// The city sits flat on the south coast with its harbour (its streets and
// blocks come from city.js). West of it is Pelican Beach and its pier; to
// the north the Kingsgate Hills (with the sign), then the flat Redwater
// Desert and Lake Corrigan, Dust Creek on the lake's south-east shore, Mount
// Calder in the east and Mount Harlow in the north-west, with the pine
// forests round it and Port Kerry at the island's northern tip. The Coast
// Highway runs up the west side, the Eastern Freeway up the east, the
// Desert Road across the middle and the Hill Road over the hills from
// town.
//
// The ground is a height every 5 m (`heightAt` reads it between the
// samples exactly as the terrain mesh is drawn). Roads are pressed flat into
// it, with banks and cuttings either side.
//
// x runs east, z runs south (north is -z), as in city.js.

export const SEA_Y = -1.1;                // the sea's surface
export const CITY_BOX = { x0: -209, x1: 209, z0: -209, z1: 236 };   // the city's own ground
// the rooms you can walk into are out at sea, off the south-east coast,
// where nobody outside will ever see them (see interiors.js)
export const ROOMS_BOX = { x0: 957, x1: 985, z0: 294, z1: 428 };
export const LAKE = { x: 120, z: -1480, rx: 250, rz: 160, y: 8 };
export const ROAD_W = 6;                  // highway asphalt half-width
const FLAT = 14, BANK = 30;               // flat either side of a road, then the bank

// the height grid
export const GRID = { x0: -1000, z0: -2800, cell: 5, nx: 385, nz: 647 };
const { x0: GX, z0: GZ, cell: GC, nx: NX, nz: NZ } = GRID;
export const HEIGHT = new Float32Array(NX * NZ);
const ROAD_D = new Float32Array(NX * NZ).fill(1e9);   // how far to the nearest road
const ROAD_H = new Float32Array(NX * NZ);
export const PAD = new Uint8Array(NX * NZ);           // paved (1), dirt (2), asphalt (3)

// -------------------------------------------------------------- noise --
function hash2(i, j) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z);
  const fx = x - i, fz = z - j;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// -1..1
export function fbm(x, z, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let k = 0; k < oct; k++) { s += a * (vnoise(x * f + k * 17.3, z * f - k * 9.1) * 2 - 1); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
// 0..1, sharp crests
function ridged(x, z, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let k = 0; k < oct; k++) { const r = 1 - Math.abs(vnoise(x * f + k * 31.7, z * f + k * 5.3) * 2 - 1); s += a * r * r; n += a; a *= 0.5; f *= 2.1; }
  return s / n;
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
// a smooth minimum (k: how wide the blend)
const smin = (a, b, k) => { const h = Math.max(0, Math.min(1, 0.5 + (b - a) / (2 * k))); return lerp(b, a, h) - k * h * (1 - h); };

// ------------------------------------------------------------ the coast --
// round the island clockwise from the harbour's east end (x, z)
export const COAST = [
  [215, 237], [-215, 237], [-245, 300], [-335, 348], [-520, 362], [-700, 335], [-792, 255], [-772, 172], [-652, 150],
  [-482, 162], [-405, 172], [-372, 138], [-362, 60], [-372, -60], [-402, -170], [-470, -262],
  [-522, -385], [-565, -560], [-640, -700], [-700, -850], [-655, -975], [-725, -1080], [-822, -1150],
  [-862, -1350], [-902, -1600], [-882, -1850], [-822, -2050], [-762, -2250], [-642, -2420], [-462, -2560],
  [-252, -2682], [-62, -2722], [122, -2662], [262, -2562], [372, -2600], [452, -2470], [562, -2202], [682, -1952],
  [782, -1652], [712, -1500], [842, -1352], [862, -1052], [822, -802], [800, -600], [770, -420], [730, -240],
  [700, -60], [660, 80], [580, 180], [440, 238], [300, 252],
];

// signed distance to the coast (+ on land), exact (for the coarse grid)
function coastSD(x, z) {
  let best = Infinity, inside = false;
  for (let i = 0, j = COAST.length - 1; i < COAST.length; j = i++) {
    const [ax, az] = COAST[j], [bx, bz] = COAST[i];
    if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
    const vx = bx - ax, vz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
    const d = Math.hypot(x - ax - vx * t, z - az - vz * t);
    if (d < best) best = d;
  }
  return inside ? best : -best;
}

// the coarse (20 m) grid of coast distances, read smoothly
const SDC = 20, SNX = Math.ceil((NX - 1) * GC / SDC) + 2, SNZ = Math.ceil((NZ - 1) * GC / SDC) + 2;
const SD = new Float32Array(SNX * SNZ);
for (let j = 0; j < SNZ; j++) for (let i = 0; i < SNX; i++) SD[j * SNX + i] = coastSD(GX + i * SDC, GZ + j * SDC);
function coastAt(x, z) {
  const fx = (x - GX) / SDC, fz = (z - GZ) / SDC;
  const i = Math.max(0, Math.min(SNX - 2, Math.floor(fx))), j = Math.max(0, Math.min(SNZ - 2, Math.floor(fz)));
  const u = fx - i, v = fz - j;
  const a = SD[j * SNX + i], b = SD[j * SNX + i + 1], c = SD[(j + 1) * SNX + i], d = SD[(j + 1) * SNX + i + 1];
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

// how far (x, z) is from the city's ground (0 inside it)
export function cityDist(x, z) {
  const dx = Math.max(CITY_BOX.x0 - x, 0, x - CITY_BOX.x1), dz = Math.max(CITY_BOX.z0 - z, 0, z - CITY_BOX.z1);
  return Math.hypot(dx, dz);
}

// distance to the coast (+ on land), with the wiggles the coast really has
// (none near the city's quays)
export function shoreDist(x, z) {
  const calm = smooth(60, 260, cityDist(x, z));
  return coastAt(x, z) + (fbm(x / 95, z / 95, 3) * 14 + fbm(x / 230 + 5, z / 230, 2) * 26) * calm;
}

// how much of the desert (x, z) is in (0..1)
export function desertness(x, z) {
  const q = Math.hypot((x - 60) / 560, (z + 1130) / 380) + fbm(x / 300, z / 300, 2) * 0.18;
  return 1 - smooth(0.7, 1.05, q);
}
// how far into the lake (under 1 is water)
export function lakeQ(x, z) {
  return Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz) + fbm(x / 120 + 40, z / 120, 3) * 0.1;
}

// the mountains and hills: [x, z, radius, height, sharpness]
export const PEAKS = [
  [-380, -2060, 430, 300, 1.6],     // Mount Harlow
  [-110, -2260, 260, 110, 1.4],
  [-610, -1760, 280, 120, 1.5],
  [-560, -1160, 230, 75, 1.4],
  [-560, -560, 200, 60, 1.3],
  [-280, -430, 200, 62, 1.3],       // Kingsgate Hills
  [-20, -480, 180, 52, 1.3],
  [250, -450, 170, 48, 1.3],
  [640, -1180, 280, 170, 1.5],      // Mount Calder
  [570, -1720, 220, 90, 1.4],
  [690, -720, 190, 70, 1.4],
  [230, -2120, 200, 60, 1.3],
  [0, -1880, 250, 70, 1.3],
  [-300, -1480, 200, 55, 1.3],
  [310, -1840, 200, 60, 1.3],
  [540, -150, 220, 65, 1.3],        // the hills east of town
];
function mountains(x, z) {
  let h = 0;
  for (const [px, pz, r, ph, sh] of PEAKS) {
    const dx = x - px, dz = z - pz;
    if (Math.abs(dx) > r || Math.abs(dz) > r) continue;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < r) h += ph * Math.pow(1 - d / r, sh);
  }
  return h;
}

// the land before the roads are cut into it
function rawHeight(x, z) {
  const sd = shoreDist(x, z);
  if (sd < -30) return Math.max(-16, -1.6 + sd * 0.15);
  const inland = smooth(0, 300, sd);
  const desert = Math.abs(x - 60) < 720 && Math.abs(z + 1130) < 520 ? desertness(x, z) : 0;
  const m = mountains(x, z);
  let e = 4 + 14 * inland + fbm(x / 260, z / 260, 4) * 9 * inland;
  e = lerp(e, 15 + fbm(x / 180, z / 180, 3) * 3, desert * 0.8);
  if (m > 0) e += m + ridged(x / 150, z / 150, 4) * Math.min(1, m / 70) * 34;
  e += fbm(x / 40, z / 40, 2) * 1.4 * inland;
  // the lake's hollow
  const q = Math.abs(x - LAKE.x) < LAKE.rx * 1.9 && Math.abs(z - LAKE.z) < LAKE.rz * 1.9 ? lakeQ(x, z) : 9;
  if (q < 1.7) {
    const r = Math.max(0, q - 1.25);
    const bowl = q < 1 ? LAKE.y - 1.2 - 7 * (1 - q) : LAKE.y - 1.2 + (q - 1) * 26 + r * r * 600;
    e = smin(e, bowl, 3);
  }
  // flat round the city
  e = lerp(0.1, e, smooth(25, 230, cityDist(x, z)));
  // beaches, mostly; cliffs where the hills run into the sea
  const cliff = smooth(-0.08, 0.22, fbm(x / 420 + 3.1, z / 420 - 7.7, 2)) * smooth(250, 700, cityDist(x, z)) * (1 - smooth(120, 360, sd));
  e += cliff * 22 * smooth(0, 90, sd);
  const far = Math.max(0, sd - 50);
  const shore = -1.6 + sd * lerp(0.075, 0.9, cliff) + far * far * 0.04;
  return sd < 0 ? Math.max(-16, -1.6 + sd * 0.15) : smin(e, shore, 2.5);
}

// ------------------------------------------------------------ the grid --
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) HEIGHT[j * NX + i] = rawHeight(GX + i * GC, GZ + j * GC);

// The ground's height at (x, z), between samples just as the mesh's
// triangles are drawn (each square split corner (i, j+1) to (i+1, j)).
export function heightAt(x, z) {
  const fx = (x - GX) / GC, fz = (z - GZ) / GC;
  if (fx < 0 || fz < 0 || fx >= NX - 1 || fz >= NZ - 1) return -16;
  const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j;
  const k = j * NX + i;
  if (u + v <= 1) {
    const h00 = HEIGHT[k];
    return h00 + (HEIGHT[k + 1] - h00) * u + (HEIGHT[k + NX] - h00) * v;
  }
  const h11 = HEIGHT[k + NX + 1];
  return h11 + (HEIGHT[k + NX] - h11) * (1 - u) + (HEIGHT[k + 1] - h11) * (1 - v);
}

// ------------------------------------------------------------ highways --
// Each route runs between two ends (a junction on the city's ring road, or
// one out in the country) through control points, smoothed into a curve.
// ends: [x, z] exactly at a city junction, or a named junction below.
export const JUNCTIONS = {
  coastW: [-585, -760], desertW: [-150, -980], east: [300, -900], dust: [338, -1130], port: [0, -2572], beach: [-312, 62],
};
const J = JUNCTIONS;
export const ROUTE_DEFS = [
  // the Coast Highway: out to Pelican Beach and up the west coast
  { id: 'coastS0', name: 'Coast Highway', pts: [[-200, 120], [-232, 120], [-282, 108], J.beach] },
  { id: 'coastS', name: 'Coast Highway', pts: [J.beach, [-322, -30], [-345, -140], [-395, -245], [-445, -390], [-485, -560], [-545, -690], J.coastW] },
  // out to the airport, and round to the beach
  { id: 'airport', name: 'Airport Road', pts: [[-200, 200], [-232, 200], [-292, 214], [-342, 204], [-338, 150], [-326, 100], J.beach] },
  { id: 'coastN', name: 'Coast Highway', pts: [J.coastW, [-578, -880], [-562, -1000], [-640, -1130], [-742, -1252], [-792, -1452], [-800, -1680], [-760, -1900], [-682, -2140], [-560, -2350], [-392, -2492], [-182, -2572], J.port] },
  // the Hill Road, up through the Kingsgate Hills from Northside
  { id: 'hill', name: 'Hill Road', pts: [[-120, -200], [-120, -232], [-128, -300], [-160, -380], [-118, -470], [-150, -560], [-128, -660], [-168, -770], [-152, -880], J.desertW] },
  // the Eastern Freeway, from Eastgate to Port Kerry
  { id: 'eastS', name: 'Eastern Freeway', pts: [[120, -200], [120, -232], [128, -300], [165, -400], [222, -545], [272, -722], J.east] },
  { id: 'eastM', name: 'Eastern Freeway', pts: [J.east, [322, -1012], J.dust] },
  { id: 'eastN', name: 'Eastern Freeway', pts: [J.dust, [400, -1300], [472, -1500], [492, -1722], [452, -1962], [362, -2200], [232, -2400], [112, -2530], J.port] },
  // the Desert Road, across the middle
  { id: 'desertW', name: 'Desert Road', pts: [J.coastW, [-490, -820], [-382, -880], [-262, -940], J.desertW] },
  { id: 'desertE', name: 'Desert Road', pts: [J.desertW, [-22, -1030], [120, -1078], [240, -1110], J.dust] },
  // the Shore Road, up the east coast from Eastgate
  { id: 'shore', name: 'Shore Road', pts: [[200, 40], [232, 40], [280, 30], [325, -5], [372, -112], [420, -262], [466, -420], [442, -600], [382, -762], J.east] },
];

// a Catmull-Rom curve through the points, every `step` metres or so
function curve(pts, step) {
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  P[0] = [2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]];
  const n = pts.length;
  P[n + 1] = [2 * pts[n - 1][0] - pts[n - 2][0], 2 * pts[n - 1][1] - pts[n - 2][1]];
  const out = [];
  for (let s = 1; s < n; s++) {
    const [p0, p1, p2, p3] = [P[s - 1], P[s], P[s + 1], P[s + 2]];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const k = Math.max(2, Math.ceil(len / step));
    for (let q = 0; q < k; q++) {
      const t = q / k, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      out.push({ x: f(p0[0], p1[0], p2[0], p3[0]), z: f(p0[1], p1[1], p2[1], p3[1]) });
    }
  }
  out.push({ x: pts[n - 1][0], z: pts[n - 1][1] });
  let s = 0;
  out.forEach((p, i) => { if (i) s += Math.hypot(p.x - out[i - 1].x, p.z - out[i - 1].z); p.s = s; });
  return out;
}

const isCity = ([x, z]) => cityDist(x, z) < 1;
// the height a junction out in the country sits at: the land round it
const junctionY = {};
for (const [k, [x, z]] of Object.entries(J)) {
  let s = 0, n = 0;
  for (let a = 0; a < 8; a++) for (const r of [0, 25, 50]) { s += heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r); n++; }
  junctionY[k] = Math.max(SEA_Y + 3, s / n);
}
const endY = (p) => {
  if (isCity(p)) return 0;
  const k = Object.keys(J).find((q) => J[q] === p);
  return junctionY[k];
};

// The routes: dense points { x, z, y, s } every 4 m, with the road's height
// following the land, smoothed, and never steeper than 1 in 9.
export const ROUTES = ROUTE_DEFS.map((def) => {
  const pts = curve(def.pts, 4);
  const n = pts.length;
  let h = pts.map((p) => Math.max(SEA_Y + 2.5, heightAt(p.x, p.z)));
  const y0 = endY(def.pts[0]), y1 = endY(def.pts[def.pts.length - 1]);
  // smooth (a running average over ~70 m, three times)
  for (let pass = 0; pass < 3; pass++) {
    const w = 9, out = new Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let k = Math.max(0, i - w); k <= Math.min(n - 1, i + w); k++) { s += h[k]; c++; }
      out[i] = s / c;
    }
    h = out;
  }
  // meet the ends exactly, easing in over the last 160 m
  const L = pts[n - 1].s;
  h = h.map((y, i) => {
    const s = pts[i].s;
    const a = 1 - smooth(0, 160, s), b = 1 - smooth(0, 160, L - s);
    return y + (y0 - h[0]) * a + (y1 - h[n - 1]) * b;
  });
  // no steeper than the grade, either way along
  const G = 0.11;
  h[0] = y0; h[n - 1] = y1;
  for (let it = 0; it < 2; it++) {
    for (let i = 1; i < n - 1; i++) { const ds = pts[i].s - pts[i - 1].s; h[i] = Math.max(h[i - 1] - G * ds, Math.min(h[i - 1] + G * ds, h[i])); }
    for (let i = n - 2; i > 0; i--) { const ds = pts[i + 1].s - pts[i].s; h[i] = Math.max(h[i + 1] - G * ds, Math.min(h[i + 1] + G * ds, h[i])); }
  }
  pts.forEach((p, i) => { p.y = h[i]; });
  return { id: def.id, name: def.name, pts, len: L, from: def.pts[0], to: def.pts[def.pts.length - 1] };
});
export const ROUTE = Object.fromEntries(ROUTES.map((r) => [r.id, r]));

// a point along a route, s metres from its start: { x, z, y, dx, dz }
export function along(route, s) {
  const P = route.pts;
  s = Math.max(0, Math.min(route.len, s));
  let lo = 0, hi = P.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m].s <= s) lo = m; else hi = m; }
  const a = P[lo], b = P[hi], t = (s - a.s) / Math.max(1e-6, b.s - a.s);
  const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), y: lerp(a.y, b.y, t), dx: (b.x - a.x) / l, dz: (b.z - a.z) / l };
}

// press each road into the ground: note, for every sample near one, how far
// it is and how high the road is there
const cellRange = (lo, hi, o, n) => [Math.max(0, Math.floor((lo - o) / GC)), Math.min(n - 1, Math.ceil((hi - o) / GC))];
function stampSegment(a, b, reach) {
  const [i0, i1] = cellRange(Math.min(a.x, b.x) - reach, Math.max(a.x, b.x) + reach, GX, NX);
  const [j0, j1] = cellRange(Math.min(a.z, b.z) - reach, Math.max(a.z, b.z) + reach, GZ, NZ);
  const vx = b.x - a.x, vz = b.z - a.z, l2 = vx * vx + vz * vz || 1;
  for (let j = j0; j <= j1; j++) {
    const z = GZ + j * GC;
    for (let i = i0; i <= i1; i++) {
      const x = GX + i * GC;
      const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / l2));
      const d = Math.hypot(x - a.x - vx * t, z - a.z - vz * t);
      const k = j * NX + i;
      if (d < ROAD_D[k]) { ROAD_D[k] = d; ROAD_H[k] = a.y + (b.y - a.y) * t; }
    }
  }
}
for (const r of ROUTES) for (let i = 1; i < r.pts.length; i++) stampSegment(r.pts[i - 1], r.pts[i], FLAT + BANK);

// ---------------------------------------------------- the towns, the pier --
// Buildings out in the country: { x0, x1, z0, z1, y, h, kind, face, name?,
// roof?, tint? }, each on its own flat pad. Parking, lamps and props too.
export const COUNTRY = { buildings: [], parking: [], lamps: [], props: [], pads: [], towns: [] };
const C = COUNTRY;
let seed = 7;
const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 8) / 16777216; };

// a building beside a route: `side` +1 right of travel, -1 left; `off` from
// the middle of the road to the building's near edge; `w` along the road,
// `d` deep
function beside(routeId, s, side, off, w, d, h, kind, extra = {}) {
  const r = ROUTE[routeId];
  const p = along(r, s);
  const rx = -p.dz * side, rz = p.dx * side;
  // square it up to the nearest compass direction, facing the road
  const cx = p.x + rx * (off + d / 2), cz = p.z + rz * (off + d / 2);
  const ns = Math.abs(rz) > Math.abs(rx);
  const face = ns ? (rz > 0 ? 'n' : 's') : (rx > 0 ? 'w' : 'e');
  const [hw, hd] = ns ? [w / 2, d / 2] : [d / 2, w / 2];
  const b = { x0: cx - hw, x1: cx + hw, z0: cz - hd, z1: cz + hd, y: p.y + 0.12, h, kind, face, ...extra };
  C.buildings.push(b);
  // its pad, a little bigger, reaching to the road
  C.pads.push({ x0: b.x0 - 4, x1: b.x1 + 4, z0: b.z0 - 4, z1: b.z1 + 4, y: p.y + 0.05, kind: extra.pad || 1 });
  return { b, p, rx, rz };
}
function parkBeside(routeId, s, side, off, h = null) {
  const r = ROUTE[routeId], p = along(r, s);
  const rx = -p.dz * side, rz = p.dx * side;
  C.parking.push({ x: p.x + rx * off, z: p.z + rz * off, h: h ?? Math.atan2(-rx, -rz), kind: 'lot' });
}
function lampBeside(routeId, s, side, kind = 'street') {
  const r = ROUTE[routeId], p = along(r, s);
  const rx = -p.dz * side, rz = p.dx * side;
  const x = p.x + rx * (ROAD_W + 1.2), z = p.z + rz * (ROAD_W + 1.2);
  C.props.push({ t: 'lamp', x, z, h: Math.atan2(-rx, -rz), y: p.y });
  C.lamps.push({ x: x - rx * 1.4, z: z - rz * 1.4, y: p.y + 7.2, kind });
}
const nearS = (routeId, x, z) => {
  let best = 0, bd = Infinity;
  for (const p of ROUTE[routeId].pts) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p.s; } }
  return best;
};

// Pelican Beach: a pier, lifeguard huts, a café and beach houses along the
// Coast Highway
{
  const z = 60;
  C.pier = { x0: -455, x1: -322, z0: z - 6, z1: z + 6, y: 1.9 };
  C.props.push({ t: 'pierRail', x0: C.pier.x0, x1: C.pier.x1, z0: C.pier.z0, z1: C.pier.z1, y: C.pier.y, x: (C.pier.x0 + C.pier.x1) / 2, z });
  C.buildings.push({ x0: -452, x1: -436, z0: z - 5, z1: z + 5, y: C.pier.y, h: 4.2, kind: 'shop', face: 'e', name: 'Pier Café', low: true, onPier: true });
  for (const [x, zz] of [[-356, -60], [-360, 110], [-357, 0]]) C.props.push({ t: 'lifeguard', x, z: zz, h: -Math.PI / 2 });
  for (let k = 0; k < 6; k++) beside('coastS', 40 + k * 46, 1, 14, 12, 10, 6.2, 'house', { roof: 'pitched', tint: k % 6 });
  for (let k = 0; k < 4; k++) parkBeside('coastS', 62 + k * 46, 1, 10);
  for (let k = 0; k < 10; k++) lampBeside('coastS', 20 + k * 38, k % 2 ? 1 : -1);
  for (const id of ['coastS0', 'airport']) for (let k = 0; k < 4; k++) lampBeside(id, 24 + k * 36, k % 2 ? 1 : -1);
  C.towns.push({ name: 'Pelican Beach', x: -330, z: 0, r: 180 });
}

// Kingsgate International, out on the peninsula south-west of town: a
// runway and a taxiway, the apron with a couple of airliners, the terminal
// and its car park, the tower, two hangars
C.strips = [];
{
  const y = 3.2;
  C.airport = { x0: -730, x1: -330, z0: 172, z1: 334, y };
  C.pads.push({ ...C.airport, kind: 4, blend: 22 });
  C.pads.push({ x0: -575, x1: -380, z0: 220, z1: 262, y, kind: 1 });
  C.strips.push({ x0: -690, x1: -380, z0: 286, z1: 308, y, marks: true }, { x0: -660, x1: -400, z0: 258, z1: 268, y });
  C.buildings.push({ x0: -440, x1: -380, z0: 180, z1: 214, y, h: 12, kind: 'glass', face: 'e', name: 'Kingsgate International' });
  C.buildings.push({ x0: -462, x1: -452, z0: 226, z1: 236, y, h: 26, kind: 'glass', name: 'Tower' });
  C.buildings.push({ x0: -560, x1: -524, z0: 186, z1: 216, y, h: 11, kind: 'warehouse', face: 's', name: 'Hangar 1' });
  C.buildings.push({ x0: -620, x1: -584, z0: 186, z1: 216, y, h: 11, kind: 'warehouse', face: 's', name: 'Hangar 2' });
  C.pads.push({ x0: -378, x1: -358, z0: 178, z1: 216, y, kind: 1 });
  for (let k = 0; k < 5; k++) C.parking.push({ x: -368, z: 182 + k * 6.5, h: -Math.PI / 2, kind: 'lot' });
  for (const [x, h] of [[-500, Math.PI / 2], [-430, Math.PI / 2]]) C.props.push({ t: 'plane', x, z: 244, y, h });
  for (const [x, z] of [[-480, 240], [-410, 240], [-368, 196]]) { C.props.push({ t: 'lotLamp', x, z, y }); C.lamps.push({ x, z, y: y + 7, kind: 'white' }); }
}

// up in the hills: three big houses on the Hill Road, and the sign
{
  for (const [s, side] of [[260, -1], [420, 1], [610, -1]]) {
    const { b } = beside('hill', s, side, 20, 22, 16, 7.5, 'house', { roof: 'flat', tint: 5, villa: true });
    C.props.push({ t: 'pool', x: (b.x0 + b.x1) / 2, z: side > 0 ? b.z1 + 7 : b.z0 - 7, y: b.y, w: 10, d: 5 });
    C.pads.push({ x0: b.x0 - 2, x1: b.x1 + 2, z0: b.z0 - 14, z1: b.z1 + 14, y: b.y - 0.07, kind: 1 });
  }
  for (let k = 0; k < 8; k++) lampBeside('hill', 30 + k * 40, k % 2 ? 1 : -1);
}
export const SIGN = { x: -262, z: -372, text: 'KINGSGATE', letter: 9, gap: 1.2 };

// Dust Creek: on the lake's south-east shore where the freeway meets the
// Desert Road: a bar, a motel, a gas station, trailers, an airstrip
{
  const s = nearS('eastN', 380, -1240);
  beside('eastN', s - 70, -1, 12, 16, 12, 5, 'shop', { name: 'The Rusty Spur', tint: 2 });
  beside('eastN', s - 40, -1, 12, 24, 10, 4.5, 'shop', { name: 'Lakeview Motel', tint: 3 });
  beside('eastN', s - 70, 1, 12, 18, 14, 4.6, 'shop', { name: 'Redwater Gas', tint: 1 });
  {
    const p = along(ROUTE.eastN, s - 44);
    C.props.push({ t: 'canopy', x: p.x - p.dz * 17, z: p.z + p.dx * 17, w: 14, d: 9, h: 0 });
    for (const k of [-3, 3]) C.props.push({ t: 'pump', x: p.x - p.dz * 17 + k, z: p.z + p.dx * 17, h: 0 });
    C.pads.push({ x0: p.x - p.dz * 17 - 9, x1: p.x - p.dz * 17 + 9, z0: p.z + p.dx * 17 - 7, z1: p.z + p.dx * 17 + 7, y: p.y + 0.05, kind: 1 });
    C.lamps.push({ x: p.x - p.dz * 17, z: p.z + p.dx * 17, y: p.y + 5, kind: 'canopy' });
  }
  for (let k = 0; k < 7; k++) beside('eastN', s + 10 + k * 22, k % 2 ? 1 : -1, 14 + (k % 3) * 3, 12, 4.5, 3.2, 'trailer', { tint: k % 6 });
  for (let k = 0; k < 6; k++) parkBeside('eastN', s - 90 + k * 30, k % 2 ? 1 : -1, 10);
  for (let k = 0; k < 7; k++) lampBeside('eastN', s - 110 + k * 36, k % 2 ? 1 : -1);
  C.towns.push({ name: 'Dust Creek', x: 395, z: -1235, r: 190 });
}

// the airstrip, out in the desert south of the Desert Road
C.strips.push({ x0: -60, x1: 200, z0: -945, z1: -915, marks: true, desert: true });
C.buildings.push({ x0: 150, x1: 176, z0: -988, z1: -962, y: 0, h: 9, kind: 'warehouse', face: 's', name: 'Hangar' });
C.towns.push({ name: 'Redwater Airstrip', x: 70, z: -930, r: 170 });

// Port Kerry: houses, shops and the sheriff along the highway at the
// island's northern tip, and a sawmill
{
  const r1 = 'coastN', r2 = 'eastN';
  const sW = ROUTE[r1].len, sE = ROUTE[r2].len;
  const names = ["Kerry's Diner", 'General Store', 'Port Kerry Sheriff', 'Bait & Tackle', 'Hardware', 'Bank'];
  for (let k = 0; k < 6; k++) beside(r1, sW - 40 - k * 26, k % 2 ? 1 : -1, 12, 18, 13, 6 + (k % 3), k === 2 ? 'station' : 'shop', { name: names[k], tint: k % 6 });
  for (let k = 0; k < 6; k++) beside(r2, sE - 50 - k * 28, k % 2 ? 1 : -1, 14, 11, 10, 6.2, 'house', { roof: 'pitched', tint: (k + 2) % 6 });
  for (let k = 0; k < 3; k++) beside(r1, sW - 230 - k * 30, 1, 14, 11, 10, 6.2, 'house', { roof: 'pitched', tint: (k + 4) % 6 });
  beside(r2, sE - 230, 1, 16, 34, 22, 10, 'warehouse', { name: 'KERRY SAWMILL' });
  for (let k = 0; k < 5; k++) parkBeside(r1, sW - 30 - k * 30, k % 2 ? -1 : 1, 10);
  for (let k = 0; k < 4; k++) parkBeside(r2, sE - 40 - k * 30, k % 2 ? -1 : 1, 10);
  for (let k = 0; k < 7; k++) { lampBeside(r1, sW - 10 - k * 36, k % 2 ? 1 : -1); lampBeside(r2, sE - 10 - k * 36, k % 2 ? -1 : 1); }
  C.towns.push({ name: 'Port Kerry', x: 0, z: -2560, r: 260 });
}

// lamps along the highways where they leave town
for (const id of ['eastS', 'shore']) for (let k = 0; k < 7; k++) lampBeside(id, 30 + k * 40, k % 2 ? 1 : -1);

// the summit of Mount Harlow (the highest point near the peak), for the mast
export const SUMMIT = (() => {
  let best = { x: PEAKS[0][0], z: PEAKS[0][1], y: -Infinity };
  for (let dz = -120; dz <= 120; dz += 5) for (let dx = -120; dx <= 120; dx += 5) {
    const x = PEAKS[0][0] + dx, z = PEAKS[0][1] + dz, y = heightAt(x, z);
    if (y > best.y) best = { x, z, y };
  }
  return best;
})();

// wind turbines on the hills east of the freeway
export const TURBINES = [[650, -650], [700, -720], [735, -800], [640, -790], [600, -700]].map(([x, z]) => ({ x, z, y: heightAt(x, z) }));

// flatten each pad (not over a road), and the airstrip
function pad(P, blend = 8) {
  const [i0, i1] = cellRange(P.x0 - blend, P.x1 + blend, GX, NX);
  const [j0, j1] = cellRange(P.z0 - blend, P.z1 + blend, GZ, NZ);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = GX + i * GC, z = GZ + j * GC, k = j * NX + i;
    if (ROAD_D[k] < FLAT - 2 || HEIGHT[k] < SEA_Y + 0.3) continue;      // (never out over the sea)
    const d = Math.hypot(Math.max(P.x0 - x, 0, x - P.x1), Math.max(P.z0 - z, 0, z - P.z1));
    const w = smooth(0, blend, d);
    HEIGHT[k] = lerp(P.y, HEIGHT[k], w);
    if (d < 1) PAD[k] = P.kind;
  }
}
// the roads first, then the pads beside them
for (let k = 0; k < NX * NZ; k++) {
  const d = ROAD_D[k];
  if (d < FLAT + BANK) HEIGHT[k] = lerp(ROAD_H[k], HEIGHT[k], smooth(FLAT, FLAT + BANK, d));
}
for (const P of C.pads) pad(P, P.blend || 8);
{
  const S = C.strips.find((q) => q.desert);
  S.y = heightAt((S.x0 + S.x1) / 2, (S.z0 + S.z1) / 2) + 0.05;
  pad({ ...S, y: S.y, kind: 3 }, 20);
  C.buildings.find((b) => b.name === 'Hangar').y = S.y + 0.07;
  pad({ x0: 146, x1: 180, z0: -992, z1: S.z0, y: S.y, kind: 1 }, 10);
  for (const R of C.strips) if (!R.desert) pad({ ...R, kind: 3 }, 4);
}
// the city's own ground hides the land under it
{
  const [i0, i1] = cellRange(CITY_BOX.x0, CITY_BOX.x1, GX, NX), [j0, j1] = cellRange(CITY_BOX.z0, CITY_BOX.z1, GZ, NZ);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = GX + i * GC, z = GZ + j * GC;
    if (x > CITY_BOX.x0 && x < CITY_BOX.x1 && z > CITY_BOX.z0 && z < CITY_BOX.z1) HEIGHT[j * NX + i] = -0.3;
  }
}
// where the pier meets the sand
{
  const P = C.pier;
  P.y = Math.max(1.6, heightAt(P.x1 + 1, (P.z0 + P.z1) / 2) + 0.12);
  for (const b of C.buildings) if (b.onPier) b.y = P.y;
  for (const p of C.props) if (p.t === 'pierRail') p.y = P.y;
}
// buildings stand on their pads
for (const b of C.buildings) if (!b.onPier && b.name !== 'Hangar') b.y = heightAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2) + 0.07;
for (const sp of C.parking) sp.y = heightAt(sp.x, sp.z);
for (const p of C.props) if (p.y == null || p.t === 'lifeguard') p.y = heightAt(p.x, p.z);

// how far (x, z) is from a highway's middle (to ~44 m; beyond, a big number)
export function roadDist(x, z) {
  const i = Math.round((x - GX) / GC), j = Math.round((z - GZ) / GC);
  if (i < 0 || j < 0 || i >= NX || j >= NZ) return 1e9;
  return ROAD_D[j * NX + i];
}

// the water's surface over (x, z): the lake's or the sea's
const nearLake = (x, z) => Math.abs(x - LAKE.x) < LAKE.rx * 1.8 && Math.abs(z - LAKE.z) < LAKE.rz * 1.8;
export function waterY(x, z) { return nearLake(x, z) && lakeQ(x, z) < 1.6 ? LAKE.y : SEA_Y; }

// -------------------------------------------------------------- places --
const REGIONS = [
  (x, z) => (x > -800 && x < -290 && z > 140 && z < 380 ? 'Kingsgate International' : null),
  (x, z) => C.towns.find((t) => Math.hypot(x - t.x, z - t.z) < t.r)?.name,
  (x, z) => (lakeQ(x, z) < 1.25 ? 'Lake Corrigan' : null),
  (x, z) => (Math.hypot(x - PEAKS[0][0], z - PEAKS[0][1]) < 430 ? 'Mount Harlow' : null),
  (x, z) => (Math.hypot(x - PEAKS[8][0], z - PEAKS[8][1]) < 300 ? 'Mount Calder' : null),
  (x, z) => (x < -215 && z > -230 ? 'Pelican Beach' : null),
  (x, z) => (z < -209 && z > -760 && x > -470 && x < 430 ? 'Kingsgate Hills' : null),
  (x, z) => (x > 209 && z > -420 ? 'Eastgate Shore' : null),
  (x, z) => (desertness(x, z) > 0.4 ? 'Redwater Desert' : null),
  (x, z) => (z < -1650 ? 'Cedar Forest' : null),
  (x, z) => (x < -380 ? 'West Coast' : null),
  (x, z) => (x > 420 ? 'East Shore' : null),
];
export function countryName(x, z) {
  if (shoreDist(x, z) < -20) return 'Open Sea';
  for (const f of REGIONS) { const n = f(x, z); if (n) return n; }
  return 'Long Valley';
}

// ------------------------------------------------------------- the trees --
// Everything growing out in the country, by what the land's like:
// { t: 'pine' | 'oak' | 'palm' | 'bush' | 'cactus' | 'rock', x, z, y, s }
export const FLORA = [];
{
  let fs = 99;
  const r = () => { fs = (Math.imul(fs, 1664525) + 1013904223) >>> 0; return fs / 4294967296; };
  const away = (x, z) => {
    if (cityDist(x, z) < 20) return false;
    if (roadDist(x, z) < 14) return false;
    const i = Math.round((x - GX) / GC), j = Math.round((z - GZ) / GC);
    if (PAD[j * NX + i]) return false;
    for (const t of C.towns) if (Math.hypot(x - t.x, z - t.z) < t.r * 0.45) return false;
    return true;
  };
  for (let n = 0; n < 60000 && FLORA.length < 5200; n++) {
    const x = GX + 20 + r() * (NX * GC - 40), z = GZ + 20 + r() * (NZ * GC - 40);
    const y = heightAt(x, z);
    const sd = shoreDist(x, z);
    if (sd < 6 || y < SEA_Y + 1.2) continue;
    if (lakeQ(x, z) < 1.12) continue;
    // steep?
    const sl = Math.hypot(heightAt(x + 3, z) - heightAt(x - 3, z), heightAt(x, z + 3) - heightAt(x, z - 3)) / 6;
    const des = desertness(x, z);
    const pick = r();
    let t = null;
    if (sl > 0.9) { if (pick < 0.12) t = 'rock'; } else if (sd < 70 && y < 5) { if (pick < 0.12) t = 'palm'; } else if (des > 0.55) {
      t = pick < 0.06 ? 'cactus' : pick < 0.14 ? 'bush' : pick < 0.17 ? 'rock' : null;
    } else if (y > 210) { t = pick < 0.1 ? 'rock' : pick < 0.2 ? 'pine' : null; } else if (z < -1600 || (z < -1300 && x < -400)) {
      // the forests in the north
      const dense = 0.3 + 0.4 * (fbm(x / 160, z / 160, 2) * 0.5 + 0.5);
      t = pick < dense ? 'pine' : pick < dense + 0.05 ? 'bush' : pick < dense + 0.07 ? 'rock' : null;
    } else {
      const thick = 0.1 + 0.22 * (fbm(x / 140 + 9, z / 140, 2) * 0.5 + 0.5) * (1 - des);
      t = pick < thick ? (z < -700 && r() < 0.4 ? 'pine' : 'oak') : pick < thick + 0.08 ? 'bush' : pick < thick + 0.095 ? 'rock' : null;
    }
    if (!t || !away(x, z)) continue;
    FLORA.push({ t, x, z, y, s: 0.75 + r() * 0.6, h: r() * Math.PI * 2 });
  }
}
