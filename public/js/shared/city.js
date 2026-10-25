// San Cielo, the whole city, as plain numbers: the host builds its collision
// and traffic from this, and every client builds the 3D city from the same
// plan, so they always agree. The streets follow the plan in plan.js: a
// grid, but not a square one (downtown's blocks are smaller, some blocks
// take up two or more squares, the city stops where the beach and the hills
// begin). Each street is one lane each way plus room to park, with
// sidewalks; between them are the blocks: Pelican Beach on the sand to the
// west, the mansions of Palm Ridge, Starlight with its theatres, the
// Downtown towers and City Hall, the Flats where you live, Eastgate and its
// car lots, Mill End's warehouses and the Docks on the harbour.
//
// The city is on the south coast of an island (shared/world.js): highways
// leave it for the rest of the island, and join the road graph here as
// chains of junctions a couple of dozen metres apart, so traffic, the
// police and the jobs all just work out there too.
//
// x runs east, z runs south (north is -z). A heading h faces (sin h, cos h).

import { makeRng } from './rng.js';
import { Solids } from './collide.js';
import { XS, ZS, COLS, ROWS, CURB, PLAN, HARBOR, cellBlock, inTown, colAt, rowAt } from './plan.js';
import { ROUTES, JUNCTIONS, COUNTRY, FLORA, ROOMS_BOX, SEA_Y, LAKE, heightAt, countryName, waterY } from './world.js';

export { XS, ZS, CURB, HARBOR, inTown };
export const ROAD = 6;            // asphalt half-width
export const LANE = 2.6;          // traffic keeps this far right of the middle
export const PARK = 4.9;          // parked cars sit this far from the middle
export const STOP = 10;           // stop lines this far from a junction's middle
export const SIDEWALK_Y = 0.12;

// ---------------------------------------------------------------- roads --
// junctions where the plan's streets cross (`stop`: how far short of the
// middle traffic stops), and the stretches of street between them: one
// along every side of every block (and not through the middle of the big
// ones)
export const NODES = [];
const GRIDNODE = new Map();
export const nodeAt = (i, j) => GRIDNODE.get(j * 100 + i) || null;
const gridNode = (i, j) => {
  if (!GRIDNODE.has(j * 100 + i)) {
    const n = { id: NODES.length, i, j, x: XS[i], z: ZS[j], y: 0, edges: [], city: true, stop: STOP };
    NODES.push(n);
    GRIDNODE.set(j * 100 + i, n);
  }
  return GRIDNODE.get(j * 100 + i);
};
export const EDGES = [];
const street = (a, b, axis) => {
  const e = { id: EDGES.length, a: a.id, b: b.id, axis, len: Math.hypot(b.x - a.x, b.z - a.z) };
  EDGES.push(e);
  a.edges.push(e.id);
  b.edges.push(e.id);
  return e;
};
// (the blocks either side of a stretch: either can be -1, none)
export const sides = (e) => {
  const A = NODES[e.a], B = NODES[e.b], i = Math.min(A.i, B.i), j = Math.min(A.j, B.j);
  return e.axis === 'x' ? [cellBlock(i, j - 1), cellBlock(i, j)] : [cellBlock(i - 1, j), cellBlock(i, j)];
};
for (let j = 0; j <= ROWS; j++) {
  for (let i = 0; i <= COLS; i++) {
    const up = cellBlock(i, j - 1), down = cellBlock(i, j);
    if (i < COLS && (up >= 0 || down >= 0) && up !== down) street(gridNode(i, j), gridNode(i + 1, j), 'x');
    const left = cellBlock(i - 1, j), right = cellBlock(i, j);
    if (j < ROWS && (left >= 0 || right >= 0) && left !== right) street(gridNode(i, j), gridNode(i, j + 1), 'z');
  }
}
export const CITY_EDGES = EDGES.length;

// The highways: each route's curve, a junction every couple of dozen metres
// (shared where routes meet, or the city's own junction where one leaves
// town).
export const EXITS = [];         // { node, dx, dz }: where highways leave the city's streets
{
  const named = new Map();
  const nodeFor = (pt, route) => {
    const city = NODES.find((n) => n.city && Math.abs(n.x - pt[0]) < 0.5 && Math.abs(n.z - pt[1]) < 0.5);
    if (city) return city;
    const key = Object.keys(JUNCTIONS).find((k) => JUNCTIONS[k] === pt);
    if (!key) throw new Error(`route ${route.id} ends nowhere (${pt})`);
    if (!named.has(key)) {
      const r = route.pts.find((q) => Math.abs(q.x - pt[0]) < 0.5 && Math.abs(q.z - pt[1]) < 0.5) || route.pts[0];
      const n = { id: NODES.length, x: pt[0], z: pt[1], y: r.y, edges: [], hw: true, stop: 6, name: key };
      NODES.push(n);
      named.set(key, n);
    }
    return named.get(key);
  };
  const join = (a, b, route) => {
    const dx = b.x - a.x, dz = b.z - a.z;
    const e = { id: EDGES.length, a: a.id, b: b.id, axis: Math.abs(dx) > Math.abs(dz) ? 'x' : 'z', len: Math.hypot(dx, dz), hw: route.id };
    EDGES.push(e);
    a.edges.push(e.id);
    b.edges.push(e.id);
  };
  for (const r of ROUTES) {
    const A = nodeFor(r.from, r), B = nodeFor(r.to, r);
    const n = Math.max(1, Math.round(r.len / 24));
    let prev = A, first = null;
    for (let k = 1; k < n; k++) {
      const s = (r.len * k) / n;
      // the route's point nearest that far along
      let lo = 0, hi = r.pts.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (r.pts[m].s <= s) lo = m; else hi = m; }
      const p = r.pts[s - r.pts[lo].s < r.pts[hi].s - s ? lo : hi];
      const q = { id: NODES.length, x: p.x, z: p.z, y: p.y, edges: [], hw: true, stop: 2, route: r.id };
      NODES.push(q);
      join(prev, q, r);
      first ||= q;
      prev = q;
    }
    join(prev, B, r);
    for (const [end, next] of [[A, first || B], [B, prev]]) {
      if (!end.city) continue;
      const l = Math.hypot(next.x - end.x, next.z - end.z);
      EXITS.push({ node: end.id, dx: Math.round((next.x - end.x) / l), dz: Math.round((next.z - end.z) / l) });
    }
  }
}

// edges by 64 m squares, to find the ones near a spot quickly
const ECELL = 64;
const EGRID = new Map();
for (const e of EDGES) {
  const A = NODES[e.a], B = NODES[e.b];
  for (let i = Math.floor((Math.min(A.x, B.x) - ROAD) / ECELL); i <= Math.floor((Math.max(A.x, B.x) + ROAD) / ECELL); i++) {
    for (let j = Math.floor((Math.min(A.z, B.z) - ROAD) / ECELL); j <= Math.floor((Math.max(A.z, B.z) + ROAD) / ECELL); j++) {
      const k = i * 4099 + j;
      if (!EGRID.has(k)) EGRID.set(k, []);
      EGRID.get(k).push(e);
    }
  }
}
// every edge within about r of (x, z)
export function edgesNear(x, z, r, out = []) {
  out.length = 0;
  const seen = new Set();
  for (let i = Math.floor((x - r) / ECELL); i <= Math.floor((x + r) / ECELL); i++) {
    for (let j = Math.floor((z - r) / ECELL); j <= Math.floor((z + r) / ECELL); j++) {
      for (const e of EGRID.get(i * 4099 + j) || []) if (!seen.has(e.id)) { seen.add(e.id); out.push(e); }
    }
  }
  return out;
}

// A lane: one way along an edge, from junction `from` to junction `to`,
// LANE metres right of the middle, between the stop lines. (Made once, and
// shared: don't change one.)
const LANES = new Map();
export function lane(edgeId, fromId) {
  const e = EDGES[edgeId];
  const key = edgeId * 2 + (e.a === fromId ? 0 : 1);
  let L = LANES.get(key);
  if (L) return L;
  const A = NODES[fromId], B = NODES[e.a === fromId ? e.b : e.a];
  const l = Math.hypot(B.x - A.x, B.z - A.z) || 1;
  const dx = (B.x - A.x) / l, dz = (B.z - A.z) / l;
  const rx = -dz, rz = dx;       // right of travel
  L = {
    edge: edgeId, from: A.id, to: B.id, dx, dz, rx, rz,
    x0: A.x + dx * A.stop + rx * LANE, z0: A.z + dz * A.stop + rz * LANE,
    x1: B.x - dx * B.stop + rx * LANE, z1: B.z - dz * B.stop + rz * LANE,
    len: Math.max(1, e.len - A.stop - B.stop),
    h: Math.atan2(dx, dz),
    hw: !!e.hw,
  };
  LANES.set(key, L);
  return L;
}

// Traffic lights: every junction in town where three or four roads meet.
// Each runs a 24 s cycle (east-west green, amber, all red, north-south
// green, amber, all red), offset junction to junction. Returns 'g', 'y' or
// 'r' for traffic travelling along `axis`.
export const CYCLE = 24;
export function hasLights(nodeId) { return NODES[nodeId].city && NODES[nodeId].edges.length >= 3; }
export function light(nodeId, axis, t) {
  if (!hasLights(nodeId)) return 'g';
  const k = ((t + nodeId * 5.3) % CYCLE + CYCLE) % CYCLE;
  const ph = axis === 'x' ? k : (k + CYCLE / 2) % CYCLE;
  return ph < 9 ? 'g' : ph < 11 ? 'y' : 'r';
}

// is (x, z) on the asphalt (not a sidewalk or a block)?
const NEAR = [];
export function onRoad(x, z) {
  for (const e of edgesNear(x, z, 1, NEAR)) {
    const A = NODES[e.a], B = NODES[e.b];
    if (!e.hw) {
      // a street: a box from junction to junction
      if (x > Math.min(A.x, B.x) - ROAD && x < Math.max(A.x, B.x) + ROAD && z > Math.min(A.z, B.z) - ROAD && z < Math.max(A.z, B.z) + ROAD) return true;
      continue;
    }
    const vx = B.x - A.x, vz = B.z - A.z;
    const t = Math.max(0, Math.min(1, ((x - A.x) * vx + (z - A.z) * vz) / (vx * vx + vz * vz)));
    if (Math.hypot(x - A.x - vx * t, z - A.z - vz * t) < ROAD) return true;
  }
  return false;
}
// The height of the ground at (x, z): the city's streets and sidewalks, the
// rooms you walk into, the pier, or the land.
const PIER = COUNTRY.pier;
export function groundY(x, z) {
  if (x > ROOMS_BOX.x0 && x < ROOMS_BOX.x1 && z > ROOMS_BOX.z0 && z < ROOMS_BOX.z1) return SIDEWALK_Y;
  if (inTown(x, z)) return onRoad(x, z) ? 0 : SIDEWALK_Y;
  if (x >= PIER.x0 && x <= PIER.x1 && z >= PIER.z0 && z <= PIER.z1) return x > PIER.x1 - PIER.ramp ? PIER.y + (PIER.land - PIER.y) * (x - PIER.x1 + PIER.ramp) / PIER.ramp : PIER.y;
  return heightAt(x, z);
}
// too deep to walk or drive (the sea, the lake)?
export function inWater(x, z) {
  const g = groundY(x, z);
  return g < SEA_Y + 0.3 || (g < LAKE.y + 0.3 && g < waterY(x, z) + 0.3);
}

// the junction nearest a point
export function nearestNode(x, z) {
  let best = null, bd = Infinity;
  for (const n of NODES) { const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = n; } }
  return best;
}

// ---------------------------------------------------------------- blocks --
// the part of town a block is in
function district(kind, x, z) {
  switch (kind) {
    case 'mansions': case 'estate': return 'Palm Ridge';
    case 'beach': return 'Pelican Beach';
    case 'starlight': return 'Starlight';
    case 'down': case 'site': return 'Downtown';
    case 'plaza': return 'City Hall';
    case 'park': return 'Grand Park';
    case 'hospital': return 'Mercy Hill';
    case 'res': return z < -150 ? 'Mirror Hills' : 'Eastgate';
    case 'flats': case 'home': case 'police': return 'The Flats';
    case 'shops': return x < -260 ? 'Seaview' : x > 150 ? 'Eastgate' : z > 0 ? 'The Flats' : 'Downtown';
    case 'strip': return 'The Strip';
    case 'carlot': case 'gas': return 'Eastgate';
    case 'mill': return x > 240 && z > 0 ? 'The Docks' : 'Mill End';
    case 'yard': case 'spray': return 'Mill End';
    case 'voss': case 'docks': return 'The Docks';
    default: return 'San Cielo';
  }
}

// { id, i0, j0, i1, j1, kind, name, x0, x1, z0, z1 } (the block itself,
// inside its sidewalks)
export const BLOCKS = PLAN.map((p) => {
  const x0 = XS[p.i0] + CURB, x1 = XS[p.i1 + 1] - CURB, z0 = ZS[p.j0] + CURB, z1 = ZS[p.j1 + 1] - CURB;
  return { ...p, x0, x1, z0, z1, name: district(p.kind, (x0 + x1) / 2, (z0 + z1) / 2) };
});
// the block (x, z) is in (or on the street beside)
export function blockAt(x, z) {
  const id = cellBlock(colAt(x), rowAt(z));
  if (id < 0) return null;
  const b = BLOCKS[id];
  return x >= b.x0 - CURB && x <= b.x1 + CURB && z >= b.z0 - CURB && z <= b.z1 + CURB ? b : null;
}

export function areaName(x, z) {
  if (!inTown(x, z)) return countryName(x, z);
  if (x >= HARBOR.x0 && x <= HARBOR.x1 && z >= HARBOR.z0 - 2) return 'The Harbour';
  const b = blockAt(x, z);
  if (b) return b.name;
  // on an outer street: the nearest block's
  let best = null, bd = Infinity;
  for (const q of BLOCKS) { const d = Math.hypot(Math.max(q.x0 - x, 0, x - q.x1), Math.max(q.z0 - z, 0, z - q.z1)); if (d < bd) { bd = d; best = q; } }
  return best ? best.name : 'San Cielo';
}

// ------------------------------------------------------------ the plan --
// Filled in by build() below:
export const BUILDINGS = [];   // { x0, x1, z0, z1, h, kind, roof, sign? }
export const PROPS = [];       // { t, x, z, h (heading), ... }
export const GROUNDS = [];     // { x0, x1, z0, z1, kind } (what a block is paved with)
export const PARKING = [];     // { x, z, h, kind, type? }
export const LAMPS = [];       // { x, z, y, kind }
export const PLACES = {};      // named spots
export const SOLID_EXTRA = []; // walls and fences

const rng = makeRng('san-cielo-city-7');

function building(x0, x1, z0, z1, h, kind, extra = {}) {
  const b = { x0, x1, z0, z1, h, kind, ...extra };
  BUILDINGS.push(b);
  return b;
}
const prop = (t, x, z, h = 0, extra = {}) => { const p = { t, x, z, h, ...extra }; PROPS.push(p); return p; };
const park = (x, z, h, kind, type = null) => PARKING.push({ x, z, h, kind, type });

// shops all round a block's edge, a car park in the middle (with a way in
// from the south)
const SHOP_NAMES = {
  beach: ['Surf Shack', 'Taco Wave', 'Beach Rentals', 'Muscle Beach Gym', 'Smoothies', 'Tattoo', 'Ice Cream', 'Hostel', 'Sunglasses', 'Skate Shop'],
  starlight: ['Starlight Theatre', 'Grand Hotel', 'Comedy Club', 'Wax Museum', 'Night Club', 'Records', 'Souvenirs', 'Cinema', 'Steakhouse', 'Talent Agency'],
  seaview: ['Laundromat', 'Video Store', 'Liquor', 'Hair Salon', 'Pharmacy', 'Donuts', 'Pizza', 'Shoes'],
};
function shops(b, names = []) {
  const depth = 14, gap = 10;
  GROUNDS.push({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, kind: 'asphalt' });
  let n = 0;
  const strip = (along0, along1, fixed, side) => {
    let a = along0;
    while (a < along1 - 6) {
      let w = rng.range(10, 16);
      if (along1 - (a + w) < 8) w = along1 - a;
      const h = rng.range(5, 9.5);
      const name = names[n++] || null;
      let bx;
      if (side === 'n') bx = building(a, a + w, fixed, fixed + depth, h, 'shop', { face: 'n', name });
      else if (side === 's') bx = building(a, a + w, fixed - depth, fixed, h, 'shop', { face: 's', name });
      else if (side === 'w') bx = building(fixed, fixed + depth, a, a + w, h, 'shop', { face: 'w', name });
      else bx = building(fixed - depth, fixed, a, a + w, h, 'shop', { face: 'e', name });
      bx.awning = rng.chance(0.5);
      a += w;
    }
  };
  strip(b.x0, b.x1, b.z0, 'n');
  // the south side has the driveway into the car park
  const mid = (b.x0 + b.x1) / 2;
  strip(b.x0, mid - gap / 2, b.z1, 's');
  strip(mid + gap / 2, b.x1, b.z1, 's');
  strip(b.z0 + depth, b.z1 - depth, b.x0, 'w');
  strip(b.z0 + depth, b.z1 - depth, b.x1, 'e');
  // the car park
  for (let k = 0; k < 4; k++) {
    const x = b.x0 + depth + 4 + k * 5.6;
    if (x > b.x1 - depth - 2) break;
    if (rng.chance(0.75)) park(x, b.z0 + depth + 4, Math.PI, 'lot');
    if (rng.chance(0.5)) park(x, b.z1 - depth - 4, 0, 'lot');
  }
  prop('lotLamp', mid, (b.z0 + b.z1) / 2);
  LAMPS.push({ x: mid, z: (b.z0 + b.z1) / 2, y: 7, kind: 'lot' });
}

function towers(b) {
  GROUNDS.push({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, kind: 'plaza' });
  const half = (b.x1 - b.x0) / 2, halfZ = (b.z1 - b.z0) / 2;
  const lots = [[b.x0, b.x0 + half - 2, b.z0, b.z0 + halfZ - 2], [b.x0 + half + 2, b.x1, b.z0, b.z0 + halfZ - 2], [b.x0, b.x0 + half - 2, b.z0 + halfZ + 2, b.z1], [b.x0 + half + 2, b.x1, b.z0 + halfZ + 2, b.z1]];
  // the middle of downtown is taller
  const tall = Math.max(0, 1 - Math.hypot((b.x0 + b.x1) / 2 + 20, (b.z0 + b.z1) / 2 + 60) / 260);
  if (rng.chance(0.55)) {
    // one big tower over half the block
    const [l1, l2] = rng.chance(0.5) ? [lots[0], lots[1]] : [lots[2], lots[3]];
    building(l1[0] + 2, l2[1] - 2, l1[2] + 2, l1[3] - 2, rng.range(50, 80) + tall * 50, rng.pick(['glass', 'office', 'glass']));
    const rest = lots.filter((l) => l !== l1 && l !== l2);
    for (const l of rest) building(l[0] + 2, l[1] - 2, l[2] + 2, l[3] - 2, rng.range(22, 46) + tall * 20, rng.pick(['office', 'glass', 'stone']));
  } else {
    for (const l of lots) {
      if (rng.chance(0.15)) {
        // a little square with a tree
        prop('tree', (l[0] + l[1]) / 2, (l[2] + l[3]) / 2, 0, { big: true });
        prop('bench', (l[0] + l[1]) / 2 + 3, (l[2] + l[3]) / 2, Math.PI / 2);
        continue;
      }
      building(l[0] + 2, l[1] - 2, l[2] + 2, l[3] - 2, rng.range(20, 62) + tall * 30, rng.pick(['office', 'glass', 'stone', 'brick']));
    }
  }
  for (let k = 0; k < 3; k++) prop('planter', rng.range(b.x0 + 4, b.x1 - 4), b.z0 + halfZ, 0);
}

// houses along the north and south sides, gardens behind; in the Flats
// they're smaller, closer and older, with chain-link between the yards
function houses(b, { home = false, flats = false } = {}) {
  GROUNDS.push({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, kind: 'grass' });
  const per = flats ? 5 : 4;
  const lot = (b.x1 - b.x0) / per;
  for (const side of ['n', 's']) {
    for (let k = 0; k < per; k++) {
      const lx = b.x0 + k * lot;
      const w = flats ? rng.range(6.8, 8) : rng.range(8.5, 10.5), d = flats ? rng.range(7, 8.5) : rng.range(8, 10);
      const x0 = lx + 1.2, z0 = side === 'n' ? b.z0 + (flats ? 4.5 : 6) : b.z1 - (flats ? 4.5 : 6) - d;
      const hb = building(x0, x0 + w, z0, z0 + d, flats ? rng.range(4.6, 5.6) : rng.range(5.2, 6.8), 'house', { roof: 'pitched', face: side, tint: rng.int(0, 5) });
      // a driveway beside it, sometimes with a car on it
      const dx = x0 + w + 2.1;
      if (dx + 1 < lx + lot && rng.chance(flats ? 0.65 : 0.55)) park(dx, side === 'n' ? b.z0 + 4.5 : b.z1 - 4.5, side === 'n' ? 0 : Math.PI, 'drive');
      if (home && side === 's' && k === 1) {
        hb.name = 'Your Place';
        PLACES.safehouse = { x: (x0 + x0 + w) / 2, z: b.z1 + 2, h: 0, name: 'Your Place' };
      }
      if (rng.chance(flats ? 0.35 : 0.6)) prop('tree', lx + lot / 2 + rng.range(-2, 2), side === 'n' ? b.z0 + 20 : b.z1 - 20, 0);
      prop('mailbox', x0 - 0.5, side === 'n' ? b.z0 + 0.8 : b.z1 - 0.8, side === 'n' ? Math.PI : 0);
    }
  }
  // fences between the back gardens
  const zm = (b.z0 + b.z1) / 2;
  if (flats) SOLID_EXTRA.push({ x0: b.x0 + 2, x1: b.x1 - 2, z0: zm - 0.05, z1: zm + 0.05, y0: 0, y1: 1.8, fence: 'site' });
  else SOLID_EXTRA.push({ x0: b.x0 + 2, x1: b.x1 - 2, z0: zm - 0.08, z1: zm + 0.08, y0: 0, y1: 1.6, fence: 'wood' });
  for (const z of [b.z0 + 24, b.z1 - 24]) if (!flats) prop('tree', b.x0 + 4, z, 0);
}

// Palm Ridge: two big houses to a block, a pool behind each, palms out
// front; one block is all one estate
function mansions(b, { estate = false } = {}) {
  GROUNDS.push({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, kind: 'grass' });
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  if (estate) {
    const m = building(cx - 16, cx + 16, b.z1 - 30, b.z1 - 8, 10, 'house', { roof: 'flat', villa: true, tint: 5, face: 's', name: 'Moreno Estate' });
    PLACES.vince = { x: cx, z: b.z1 + 2, h: 0, name: 'Moreno Estate' };
    prop('pool', cx, b.z0 + 14, 0, { w: 14, d: 7 });
    for (const s of [-1, 1]) { prop('palm', cx + s * 20, b.z1 - 4, 0); prop('palm', cx + s * 22, b.z0 + 6, 0); }
    park(cx + 22, b.z1 - 14, 0, 'drive', 'sports');
    void m;
    return;
  }
  for (const side of ['n', 's']) {
    const w = rng.range(18, 24), d = rng.range(12, 15);
    const x0 = cx - w / 2 + rng.range(-4, 4);
    const z0 = side === 'n' ? b.z0 + 6 : b.z1 - 6 - d;
    building(x0, x0 + w, z0, z0 + d, rng.range(6.5, 8.5), 'house', { roof: rng.chance(0.5) ? 'flat' : 'pitched', villa: true, tint: rng.int(0, 5), face: side });
    prop('pool', x0 + w / 2, side === 'n' ? z0 + d + 5 : z0 - 5, 0, { w: 9, d: 4.5 });
    park(x0 + w + 3, side === 'n' ? b.z0 + 4.5 : b.z1 - 4.5, side === 'n' ? 0 : Math.PI, 'drive', rng.chance(0.4) ? 'sports' : null);
  }
  for (const [x, z] of [[b.x0 + 3, b.z0 + 3], [b.x1 - 3, b.z0 + 3], [b.x0 + 3, b.z1 - 3], [b.x1 - 3, b.z1 - 3], [b.x0 + 3, cz], [b.x1 - 3, cz]]) prop('palm', x, z, 0);
}

function warehouses(b, { yard = true, name = null } = {}) {
  GROUNDS.push({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, kind: 'concrete' });
  const W = b.x1 - b.x0;
  const w1 = Math.min(rng.range(24, 30), W - 6);
  building(b.x0 + 3, b.x0 + 3 + w1, b.z0 + 3, b.z0 + 25, rng.range(9, 12), 'warehouse', { name });
  if (W > 58) building(b.x1 - 3 - rng.range(18, 24), b.x1 - 3, b.z0 + 3, b.z0 + rng.range(18, 26), rng.range(8, 11), rng.pick(['warehouse', 'brick']));
  if (yard) {
    for (let k = 0; k < Math.round(W / 9); k++) {
      const x = rng.range(b.x0 + 6, b.x1 - 6), z = rng.range(b.z0 + 32, b.z1 - 8);
      const h = rng.chance(0.5) ? 0 : Math.PI / 2;
      prop('container', x, z, h, { color: rng.int(0, 5), stack: rng.chance(0.3) ? 2 : 1 });
    }
    prop('lotLamp', (b.x0 + b.x1) / 2, b.z0 + 30);
    LAMPS.push({ x: (b.x0 + b.x1) / 2, z: b.z0 + 30, y: 7, kind: 'lot' });
    park(b.x0 + 8, b.z1 - 5, Math.PI / 2, 'lot', rng.chance(0.5) ? 'van' : 'pickup');
  }
}

function build() {
  for (const b of BLOCKS) {
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    switch (b.kind) {
      case 'res': houses(b); break;
      case 'flats': houses(b, { flats: true }); break;
      case 'home': houses(b, { flats: true, home: true }); break;
      case 'mansions': mansions(b); break;
      case 'estate': mansions(b, { estate: true }); break;
      case 'down': towers(b); break;
      case 'shops': {
        let names = [];
        if (b.name === 'Seaview') names = rng.shuffle([...SHOP_NAMES.seaview]);
        if (b.name === 'Downtown' && !BUILDINGS.some((q) => q.name === 'Diamond Exchange')) names = ['Diamond Exchange', 'Bank', 'Electronics', 'Fashion', 'Cafe', 'Shoes'];
        shops(b, names);
        break;
      }
      case 'beach': {
        shops(b, rng.shuffle([...SHOP_NAMES.beach]));
        // palms along the beach side
        if (b.i0 === 0) for (let z = b.z0 + 4; z < b.z1; z += 12) prop('palm', b.x0 - CURB - ROAD - 1.5, z, 0);
        break;
      }
      case 'starlight': {
        shops(b, rng.shuffle([...SHOP_NAMES.starlight]));
        for (const x of [b.x0 + 2, b.x1 - 2]) prop('palm', x, b.z1 + 2, 0);
        break;
      }
      case 'strip':
        shops(b, ["Sal's Diner", 'Freedom Arms', 'Lucky Star', 'Pool Hall', 'Motel', 'Arcade']);
        PLACES.diner = { x: b.x0 + 6, z: b.z0 - 2, h: Math.PI, name: "Sal's Diner" };
        PLACES.guns = { x: BUILDINGS.find((q) => q.name === 'Freedom Arms').x0 + 5, z: b.z0 - 2, h: Math.PI, name: 'Freedom Arms' };
        break;
      case 'park': {
        GROUNDS.push({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, kind: 'grass' });
        GROUNDS.push({ x0: cx - 2, x1: cx + 2, z0: b.z0, z1: b.z1, kind: 'path' });
        GROUNDS.push({ x0: b.x0, x1: b.x1, z0: cz - 2, z1: cz + 2, kind: 'path' });
        prop('fountain', cx, cz, 0);
        for (let k = 0; k < 70; k++) {
          const x = rng.range(b.x0 + 3, b.x1 - 3), z = rng.range(b.z0 + 3, b.z1 - 3);
          if (Math.abs(x - cx) < 5 || Math.abs(z - cz) < 5) continue;
          prop(rng.chance(0.2) ? 'palm' : 'tree', x, z, 0, { big: rng.chance(0.4) });
        }
        for (const [x, z, h] of [[cx - 10, cz - 3.5, 0], [cx + 10, cz + 3.5, Math.PI], [cx + 3.5, cz - 12, Math.PI / 2], [cx - 3.5, cz + 12, -Math.PI / 2]]) prop('bench', x, z, h);
        for (const [x, z] of [[cx - 16, cz], [cx + 16, cz], [cx, cz - 16], [cx, cz + 16], [cx - 40, cz], [cx + 40, cz], [cx, cz - 45], [cx, cz + 45]]) { prop('parkLamp', x + 2.6, z + 2.6); LAMPS.push({ x: x + 2.6, z: z + 2.6, y: 4.2, kind: 'park' }); }
        PLACES.park = { x: cx, z: cz + 6, name: 'Grand Park' };
        break;
      }
      case 'plaza': {
        GROUNDS.push({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, kind: 'plaza' });
        building(cx - 22, cx + 22, b.z0 + 4, b.z0 + 26, 20, 'civic', { name: 'City Hall', columns: true });
        prop('fountain', cx, cz + 12, 0);
        for (const s of [-1, 1]) { prop('tree', cx + s * 30, cz + 8, 0, { big: true }); prop('palm', cx + s * 40, cz + 18, 0); prop('palm', cx + s * 50, cz + 4, 0); }
        for (const s of [-1, 1]) { prop('parkLamp', cx + s * 9, cz + 4); LAMPS.push({ x: cx + s * 9, z: cz + 4, y: 4.2, kind: 'park' }); }
        PLACES.cityhall = { x: cx, z: b.z1 + 2, name: 'City Hall' };
        break;
      }
      case 'hospital': {
        GROUNDS.push({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, kind: 'concrete' });
        building(b.x0 + 6, b.x1 - 6, b.z0 + 4, b.z0 + 30, 24, 'hospital', { name: 'Mercy General' });
        building(cx - 6, cx + 6, b.z0 + 30, b.z0 + 36, 4.5, 'civic', { name: 'EMERGENCY' });
        PLACES.hospital = { x: cx, z: b.z0 + 40, h: 0, name: 'Mercy General' };
        for (let k = 0; k < 5; k++) park(b.x0 + 8 + k * 5.6, b.z1 - 6, 0, 'lot');
        prop('lotLamp', cx, b.z1 - 14); LAMPS.push({ x: cx, z: b.z1 - 14, y: 7, kind: 'white' });
        break;
      }
      case 'police': {
        GROUNDS.push({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, kind: 'concrete' });
        building(b.x0 + 6, b.x1 - 6, b.z0 + 4, b.z0 + 24, 11, 'station', { name: 'San Cielo Police' });
        PLACES.police = { x: cx, z: b.z0 + 28, h: 0, name: 'San Cielo Police' };
        for (let k = 0; k < 6; k++) park(b.x0 + 8 + k * 5.6, b.z1 - 7, 0, 'lot', 'police');
        prop('lotLamp', cx, b.z1 - 16); LAMPS.push({ x: cx, z: b.z1 - 16, y: 7, kind: 'white' });
        prop('flag', cx, b.z0 + 26);
        break;
      }
      case 'gas': {
        GROUNDS.push({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, kind: 'asphalt' });
        building(b.x1 - 20, b.x1 - 4, b.z0 + 6, b.z0 + 18, 4.5, 'shop', { name: 'Gas-N-Go', face: 'w' });
        prop('canopy', cx - 6, cz, 0, { w: 22, d: 14 });
        for (const dx of [-11, -1]) for (const dz of [-3, 3]) prop('pump', cx - 6 + dx + 5, cz + dz, 0);
        LAMPS.push({ x: cx - 6, z: cz, y: 5, kind: 'canopy' });
        building(b.x0 + 3, b.x0 + 22, b.z1 - 20, b.z1 - 3, 6, 'shop', { name: 'Tire World', face: 'w' });
        PLACES.gas = { x: cx - 6, z: cz, name: 'Gas-N-Go' };
        break;
      }
      case 'carlot': {
        GROUNDS.push({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, kind: 'asphalt' });
        building(b.x0 + 4, b.x0 + 18, b.z0 + 4, b.z0 + 12, 4.2, 'office', { name: "Okafor's Motors", face: 'n', low: true });
        PLACES.okafor = { x: b.x0 + 11, z: b.z0 - 2, h: Math.PI, name: "Okafor's Motors" };
        PLACES.lot = { x: b.x0 + 11, z: b.z0 + 22, name: "Okafor's lot" };
        for (let r = 0; r < 3; r++) for (let k = 0; k < 7; k++) {
          if (rng.chance(0.15)) continue;
          park(b.x0 + 26 + k * 5.2, b.z0 + 8 + r * 12, Math.PI, 'sale', rng.pick(['sedan', 'sports', 'pickup', 'sedan', 'sports']));
        }
        for (const x of [b.x0 + 30, b.x1 - 8]) { prop('lotLamp', x, b.z1 - 10); LAMPS.push({ x, z: b.z1 - 10, y: 7, kind: 'white' }); }
        prop('bunting', (b.x0 + b.x1) / 2 + 8, b.z0 + 1.5, 0, { w: 38 });
        break;
      }
      case 'site': {
        // a tower going up: a fence all round with a gate on the north side,
        // diggers and heaps of rubble
        GROUNDS.push({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, kind: 'dirt' });
        const f = (x0, x1, z0, z1) => SOLID_EXTRA.push({ x0, x1, z0, z1, y0: 0, y1: 2.2, fence: 'site' });
        f(b.x0 + 1, cx - 5, b.z0 + 1, b.z0 + 1.2); f(cx + 5, b.x1 - 1, b.z0 + 1, b.z0 + 1.2);
        f(b.x0 + 1, b.x1 - 1, b.z1 - 1.2, b.z1 - 1);
        f(b.x0 + 1, b.x0 + 1.2, b.z0 + 1, b.z1 - 1); f(b.x1 - 1.2, b.x1 - 1, b.z0 + 1, b.z1 - 1);
        for (let k = 0; k < 6; k++) prop('rubble', rng.range(b.x0 + 8, b.x1 - 8), rng.range(b.z0 + 10, b.z1 - 8), rng.range(0, 6), { s: rng.range(2.5, 5) });
        building(cx - 2, cx + 14, cz - 8, cz + 8, 16, 'warehouse', { frame: true });
        prop('excavator', cx - 14, cz + 6, 0.6);
        PLACES.site = { x: cx, z: b.z0 + 6, name: 'the construction site' };
        break;
      }
      case 'spray': {
        warehouses(b, { yard: false });
        // the spray shop: a garage open to the south road
        const x0 = cx - 7, x1 = cx + 7, z0 = b.z1 - 16, z1 = b.z1;
        SOLID_EXTRA.push({ x0, x1: x0 + 0.4, z0, z1, y0: 0, y1: 6, wall: 'spray' }, { x0: x1 - 0.4, x1, z0, z1, y0: 0, y1: 6, wall: 'spray' }, { x0, x1, z0, z1: z0 + 0.4, y0: 0, y1: 6, wall: 'spray' });
        prop('sprayShop', cx, z0, 0, { x0, x1, z0, z1 });
        PLACES.spray = { x: cx, z: z0 + 8, x0: x0 + 1, x1: x1 - 1, z0: z0 + 2, z1: z1 - 1, name: 'Spray-N-Go' };
        break;
      }
      case 'voss':
        warehouses(b, { name: 'VOSS FREIGHT' });
        PLACES.voss = { x: b.x0 + 16, z: b.z0 + 28, h: Math.PI, name: 'Voss Freight' };
        break;
      case 'yard':
        warehouses(b);
        PLACES.yard = { x: cx, z: b.z1 - 12, name: 'the rail yard' };
        break;
      case 'docks': {
        // the container terminal: stacks in rows, lamps over them
        GROUNDS.push({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, kind: 'concrete' });
        for (let x = b.x0 + 10; x < b.x1 - 10; x += 16) {
          for (const z of [b.z0 + 12, b.z0 + 26, b.z0 + 40]) if (rng.chance(0.8)) prop('container', x + rng.range(-1, 1), z, Math.PI / 2, { color: rng.int(0, 5), stack: rng.int(1, 3) });
        }
        for (const x of [b.x0 + 40, (b.x0 + b.x1) / 2, b.x1 - 40]) { prop('lotLamp', x, b.z0 + 19); LAMPS.push({ x, z: b.z0 + 19, y: 7, kind: 'lot' }); }
        PLACES.terminal = { x: cx, z: b.z0 + 33, name: 'the container terminal' };
        break;
      }
      default: warehouses(b);
    }
  }

  // the harbour: warehouses on the quay, containers, cranes, bollards
  GROUNDS.push({ x0: HARBOR.x0, x1: HARBOR.x1, z0: HARBOR.z0, z1: HARBOR.z1, kind: 'quay' });
  for (const x of [-240, -150, 60, 340, 420]) building(x, x + 28, HARBOR.z0 + 6, HARBOR.z0 + 18, 10, 'warehouse');
  for (const x of [-40, 10, 200, 260]) prop('crane', x, HARBOR.z1 - 6, 0);
  for (let k = 0; k < 24; k++) {
    const x = rng.range(HARBOR.x0 + 6, HARBOR.x1 - 6);
    if (Math.abs(x - 140) < 16) continue;      // (room by the pier)
    prop('container', x, rng.range(HARBOR.z0 + 20, HARBOR.z1 - 4), Math.PI / 2 * rng.int(0, 1), { color: rng.int(0, 5), stack: rng.chance(0.4) ? 2 : 1 });
  }
  PLACES.pier = { x: 140, z: HARBOR.z1 - 4, name: 'Pier 9' };
  for (let x = HARBOR.x0 + 4; x <= HARBOR.x1 - 4; x += 6) prop('bollard', x, HARBOR.z1 + 0.6);

  // street lamps along every street, on alternate sides (palms instead,
  // here and there, in the parts of town that have them)
  const palmy = (x, z) => { const b = blockAt(x, z); return b && ['beach', 'mansions', 'estate', 'starlight', 'plaza'].includes(b.kind); };
  for (const e of EDGES.slice(0, CITY_EDGES)) {
    const A = NODES[e.a], B = NODES[e.b];
    const dx = Math.sign(B.x - A.x), dz = Math.sign(B.z - A.z);
    const down = sides(e).some((id) => id >= 0 && ['down', 'plaza', 'starlight'].includes(BLOCKS[id].kind));
    let side = 1;
    for (let d = 14; d <= e.len - 14; d += 13) {
      const rx = -dz * side, rz = dx * side;
      const x = A.x + dx * d + rx * (ROAD + 0.5), z = A.z + dz * d + rz * (ROAD + 0.5);
      // (only on a sidewalk)
      if (!inTown(x + rx * 2, z + rz * 2)) { side = -side; continue; }
      prop('lamp', x, z, Math.atan2(-rx, -rz));
      LAMPS.push({ x: x - rx * 1.4, z: z - rz * 1.4, y: 7.2, kind: down ? 'white' : 'street' });
      if (d + 6.5 <= e.len - 12 && palmy(x + rx * 3, z + rz * 3)) prop('palm', A.x + dx * (d + 6.5) + rx * (ROAD + 1.3), A.z + dz * (d + 6.5) + rz * (ROAD + 1.3), 0);
      side = -side;
    }
  }
  // traffic lights at the junctions that have them
  for (const n of NODES) {
    if (!hasLights(n.id)) continue;
    for (const [sx, sz] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const x = n.x + sx * (ROAD + 0.7), z = n.z + sz * (ROAD + 0.7);
      if (inTown(x, z)) prop('signal', x, z, 0, { node: n.id, sx, sz });
    }
  }
  // hydrants, bins and phone boxes along the sidewalks; parking at the kerb
  // (on the sides with a block)
  for (const e of EDGES.slice(0, CITY_EDGES)) {
    const A = NODES[e.a], B = NODES[e.b];
    const dx = Math.sign(B.x - A.x), dz = Math.sign(B.z - A.z);
    const [s0, s1] = sides(e);
    for (const side of [1, -1]) {
      const rx = -dz * side, rz = dx * side;
      // which block is on this side (right of travel from A to B)
      const blk = (e.axis === 'x' ? (rz > 0 ? s1 : s0) : (rx < 0 ? s0 : s1));
      if (blk < 0) continue;
      const kind = BLOCKS[blk].kind;
      for (let d = 22; d <= e.len - 22; d += 13) {
        const x = A.x + dx * d + rx * PARK, z = A.z + dz * d + rz * PARK;
        // facing along the lane on this side (traffic keeps right)
        const h = side > 0 ? Math.atan2(dx, dz) : Math.atan2(-dx, -dz);
        if (rng.chance(kind === 'park' || kind === 'plaza' ? 0.15 : 0.42)) park(x, z, h, 'kerb');
      }
      for (let d = 26; d <= e.len - 26; d += 31) {
        const x = A.x + dx * d + rx * (CURB - 1.1), z = A.z + dz * d + rz * (CURB - 1.1);
        prop(rng.pick(['hydrant', 'bin', 'bin', 'phone', 'newsbox']), x, z, Math.atan2(rx, rz));
      }
    }
  }

  // out in the country: the towns' buildings (each at its own height), their
  // parking, props and lamps
  for (const b of COUNTRY.buildings) BUILDINGS.push({ ...b, country: true });
  for (const p of COUNTRY.props) PROPS.push({ ...p, country: true });
  for (const sp of COUNTRY.parking) PARKING.push({ ...sp, country: true });
  for (const l of COUNTRY.lamps) LAMPS.push({ ...l });
}
build();

// ---------------------------------------------------- pedestrian network --
// The middle of the sidewalk round every block: four corners each, joined
// along the block's sides, and across the street to the next block's corner
// at each junction.
export const WALK_NODES = [];
for (const b of BLOCKS) {
  const o = (CURB - ROAD) / 2;
  b.walk = [
    { x: b.x0 - o, z: b.z0 - o }, { x: b.x1 + o, z: b.z0 - o },
    { x: b.x1 + o, z: b.z1 + o }, { x: b.x0 - o, z: b.z1 + o },
  ].map((p, k) => {
    const n = { id: WALK_NODES.length, x: p.x, z: p.z, block: b.id, corner: k, links: [] };
    WALK_NODES.push(n);
    return n.id;
  });
}
function link(a, b, cross = null) {
  WALK_NODES[a].links.push({ to: b, cross });
  WALK_NODES[b].links.push({ to: a, cross });
}
for (const b of BLOCKS) for (let k = 0; k < 4; k++) link(b.walk[k], b.walk[(k + 1) % 4]);
for (const n of NODES) {
  if (!n.city) continue;
  const { i, j } = n;
  // the corner of the block in each quarter round the junction, if a block
  // has its corner right here
  const corner = (ci, cj, k) => {
    const id = cellBlock(ci, cj);
    if (id < 0) return null;
    const b = BLOCKS[id];
    const at = [[b.i0, b.j0], [b.i1 + 1, b.j0], [b.i1 + 1, b.j1 + 1], [b.i0, b.j1 + 1]][k];
    return at[0] === i && at[1] === j ? b.walk[k] : null;
  };
  const NW = corner(i - 1, j - 1, 2), NE = corner(i, j - 1, 3), SE = corner(i, j, 0), SW = corner(i - 1, j, 1);
  const has = (a, axis) => n.edges.some((eid) => { const e = EDGES[eid]; if (e.hw || e.axis !== axis) return false; const o = NODES[e.a === n.id ? e.b : e.a]; return axis === 'z' ? o.z < n.z === a : o.x > n.x === a; });
  // across the street north, east, south and west of the junction
  if (NW != null && NE != null && has(true, 'z')) link(NW, NE, { node: n.id, axis: 'z' });
  if (NE != null && SE != null && has(true, 'x')) link(NE, SE, { node: n.id, axis: 'x' });
  if (SW != null && SE != null && has(false, 'z')) link(SW, SE, { node: n.id, axis: 'z' });
  if (NW != null && SW != null && has(false, 'x')) link(NW, SW, { node: n.id, axis: 'x' });
}

// --------------------------------------------------------------- solids --
const PROP_SOLID = {
  lifeguard: [[1.3, 1.3], 3.2, false], plane: [[2.2, 14], 5, false], palm: [0.28, 8, false],
  lamp: [0.18, 7, true], parkLamp: [0.14, 4.2, true], lotLamp: [0.22, 7, true], signal: [0.15, 4.5, true],
  hydrant: [0.22, 0.8, true], bin: [0.3, 1.1, true], phone: [0.45, 2.2, true], newsbox: [0.3, 1.1, true], mailbox: [0.25, 1.2, true],
  bench: [[0.9, 0.3], 0.9, true], tree: [0.3, 6, false], planter: [[1.0, 1.0], 0.6, true], pump: [[0.5, 0.35], 1.6, false],
  fountain: [[3.4, 3.4], 1.0, false], container: [[1.25, 3.05], 2.6, false], rubble: [null, 1.2, false], bollard: [0.18, 0.9, false],
  crane: [[5.5, 1.2], 30, false], excavator: [[1.6, 3.2], 3, false], flag: [0.1, 9, true],
};

// (out in the country, things stand on the ground: heights are from there)
const FLORA_SOLID = { pine: [0.35, 9, false], oak: [0.4, 7, false], palm: [0.3, 8, false], rock: [1.3, 1.6, false], cactus: [0.3, 2.4, true] };
export function staticSolids() {
  const out = [];
  for (const b of BUILDINGS) { const y = b.y || 0; out.push({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, y0: y - 1, y1: y + b.h, building: b }); }
  for (const w of SOLID_EXTRA) out.push({ ...w });
  for (const p of PROPS) {
    const S = PROP_SOLID[p.t];
    if (!S) continue;
    let [r, h, small] = S;
    const y = p.country ? p.y - 0.5 : 0;
    if (p.t === 'rubble') r = [p.s * 0.5, p.s * 0.5];
    if (p.t === 'tree' && p.big) r = 0.4;
    if (Array.isArray(r)) {
      let [hx, hz] = r;
      if (Math.abs(Math.sin(p.h)) > 0.7) [hx, hz] = [hz, hx];
      out.push({ x0: p.x - hx, x1: p.x + hx, z0: p.z - hz, z1: p.z + hz, y0: y, y1: y + h * (p.stack || 1), small, prop: p.t });
    } else out.push({ x0: p.x - r, x1: p.x + r, z0: p.z - r, z1: p.z + r, y0: y, y1: y + h, small, prop: p.t });
  }
  for (const p of PROPS.filter((q) => q.t === 'canopy')) {
    const y = p.country ? groundY(p.x, p.z) : 0;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = p.x + sx * (p.w / 2 - 0.6), z = p.z + sz * (p.d / 2 - 0.6);
      out.push({ x0: x - 0.25, x1: x + 0.25, z0: z - 0.25, z1: z + 0.25, y0: y - 0.5, y1: y + 5, small: false });
    }
  }
  for (const f of FLORA) {
    const S = FLORA_SOLID[f.t];
    if (!S) continue;
    const r = S[0] * f.s;
    out.push({ x0: f.x - r, x1: f.x + r, z0: f.z - r, z1: f.z + r, y0: f.y - 0.5, y1: f.y + S[1] * f.s, small: S[2], prop: f.t });
  }
  // the quay's edge
  out.push({ x0: HARBOR.x0, x1: HARBOR.x1, z0: HARBOR.z1 + 0.3, z1: HARBOR.z1 + 1.2, y0: -2, y1: 1.0 });
  return out;
}

export function makeSolids() { return new Solids(staticSolids(), { ground: groundY, terrain: heightAt }); }

// is (x, z) somewhere a person could stand (not inside anything)?
export function openAt(solids, x, z, r = 0.4) {
  const p = { x, z };
  return !inWater(x, z) && !solids.resolveCircle(p, r, groundY(x, z), true);
}
