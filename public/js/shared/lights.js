// The mall's lights. Every ceiling fixture sits in the middle of a 4 m
// square of one grid laid over the whole building, so the client's shader
// only has to look at the nine squares around a point to light it, and the
// host can tell how well lit any spot is (it matters: the mannequins can't
// move while someone can see them). Each fixture belongs to a breaker in
// the electrical room, and to a "group": the room it's in. Light only
// reaches surfaces in the same group, so it doesn't shine through walls.

import { ROOMS } from './mall.js';

export const LGRID = { x0: -66, z0: -34, cell: 4, nx: 34, nz: 17 };
// the room-group map: half-metre squares over the same area
export const GMAP = { x0: -66, z0: -34, cell: 0.5, nx: 272, nz: 136 };

const WARM = [1.0, 0.92, 0.78], COOL = [0.92, 0.97, 1.0], MOON = [0.5, 0.62, 1.0], SODIUM = [1.0, 0.62, 0.28], EMERG = [1.0, 0.86, 0.74], COLD = [0.75, 0.9, 1.0];

// [x, z, height, breaker, power, colour, group]
const F = [];
const fx = (x, z, y, breaker, power, color, group) => F.push({ x, z, y, breaker, power, color, group });
// the concourse: a zig-zag down its length, and moonlight from the skylights
for (const [x, z] of [[-36, -4], [-32, 4], [-28, -4], [-24, 4], [-20, -4], [-16, 4], [-12, -4], [12, 4], [16, -4], [20, 4], [24, -4], [28, 4], [32, -4], [36, 4]]) fx(x, z, 6.8, 'concourse', 6, WARM, 1);
for (const x of [-32, -24, -16, 16, 24, 32]) fx(x, 0, 7.4, 'moon', 1.6, MOON, 1);
// the centre court: pendants round the edge, the dome over the fountain
for (const [x, z] of [[-8, -8], [8, -8], [-8, 8], [8, 8], [0, -8], [0, 8], [-8, 0], [8, 0]]) fx(x, z, 9.0, 'court', 8, WARM, 1);
fx(0, 0, 11, 'moon', 4, MOON, 1);
for (const [x, z] of [[-4, -4], [4, 4], [-4, 4], [4, -4]]) fx(x, z, 11, 'moon', 1.4, MOON, 1);
fx(0, 12, 3.3, 'court', 3, WARM, 1);
// the food court, and the carousel's own bulbs
for (const [x, z] of [[44, -8], [52, -8], [60, -8], [48, 0], [56, 0], [44, 8], [52, 8], [60, 8]]) fx(x, z, 8.0, 'food', 7, WARM, 1);
for (const [x, z] of [[48, -4], [56, 4]]) fx(x, z, 8.4, 'moon', 1.8, MOON, 1);
fx(52, 0, 4.2, 'carousel', 5, [1.0, 0.8, 0.5], 1);
fx(64, 0, 3.3, 'food', 3, WARM, 1);
// a light in every shop (off after closing)
for (const x of [-36, -28, -20, -16, 16, 20, 28, 36]) { fx(x, -12, 3.6, 'stores', 3.2, COOL, 1); fx(x, 12, 3.6, 'stores', 3.2, COOL, 1); }
// Halvorsen's power was cut off when it closed: emergency lights only
for (const [x, z] of [[-44, -8], [-56, 0], [-48, 12], [-60, -16], [-60, 8]]) fx(x, z, 5.2, 'emergency', 0.9, EMERG, 1);
fx(-44, -16, 3.8, 'emergency', 0.6, EMERG, 13);
fx(-48, -20, 3.8, 'stockroom', 1.8, COOL, 13);
// behind the scenes
for (const x of [-36, -28, -20, -12, -4, 4, 12, 20, 28, 36, 44, 52]) fx(x, -20, 3.0, 'back', 2.2, COOL, 2);
fx(40, -16, 3.0, 'back', 1.5, COOL, 2);
fx(-4, -24, 2.9, 'back', 2.6, COOL, 3);
fx(4, -24, 2.9, 'back', 2.6, COOL, 3);
fx(0, -28, 1.5, 'desk', 0.7, WARM, 3);            // the desk lamp (on the UPS)
fx(12, -24, 2.9, 'back', 2.4, COOL, 4);
fx(-12, -24, 2.9, 'back', 2.4, COOL, 5);
fx(20, -24, 2.9, 'back', 2.4, COOL, 6);
fx(-20, -24, 2.9, 'back', 1.8, WARM, 7);
for (const [x, z] of [[36, -24], [40, -28], [32, -28]]) fx(x, z, 4.8, 'back', 3, SODIUM, 8);
fx(52, -24, 2.7, 'back', 1.6, COLD, 9);
fx(-8, -12, 2.9, 'back', 2.2, COOL, 10); fx(-4, -16, 2.9, 'back', 2.2, COOL, 10);
fx(8, -12, 2.9, 'back', 2.2, COOL, 11); fx(4, -16, 2.9, 'back', 2.2, COOL, 11);
fx(0, -12, 3.0, 'back', 1.6, COOL, 12); fx(0, -16, 3.0, 'back', 1.6, COOL, 12);
// the canopy light over the south doors, outside
fx(0, 16, 3.4, 'lot', 2.6, SODIUM, 14);
// the parking lot's sodium lamps
for (const x of [-24, -8, 8, 24]) fx(x, 28, 8, 'lot', 14, SODIUM, 14);
for (const x of [-16, 0, 16]) fx(x, 32, 8, 'lot', 6, SODIUM, 14);

export const FIXTURES = F.map((f) => ({ ...f, i: Math.round((f.x - LGRID.x0) / LGRID.cell - 0.5), j: Math.round((f.z - LGRID.z0) / LGRID.cell - 0.5) }));
{
  const seen = new Set();
  for (const f of FIXTURES) {
    const k = `${f.i},${f.j}`;
    if (seen.has(k)) throw new Error(`two lights in one square at ${f.x}, ${f.z}`);
    if (Math.abs(LGRID.x0 + (f.i + 0.5) * LGRID.cell - f.x) > 0.01 || Math.abs(LGRID.z0 + (f.j + 0.5) * LGRID.cell - f.z) > 0.01) throw new Error(`light off the grid at ${f.x}, ${f.z}`);
    seen.add(k);
  }
}

// breakers you can switch in the electrical room, and the ones that just
// are (moonlight, the emergency lights, the desk lamp, the lot)
export const ALWAYS = new Set(['moon', 'emergency', 'desk', 'lot']);

// which group each half-metre square belongs to (0: solid or outside)
export const GROUPS = (() => {
  const g = new Uint8Array(GMAP.nx * GMAP.nz);
  const fill = (x0, x1, z0, z1, v) => {
    for (let j = Math.max(0, Math.floor((z0 - GMAP.z0) / GMAP.cell)); j < Math.min(GMAP.nz, Math.ceil((z1 - GMAP.z0) / GMAP.cell)); j++) {
      for (let i = Math.max(0, Math.floor((x0 - GMAP.x0) / GMAP.cell)); i < Math.min(GMAP.nx, Math.ceil((x1 - GMAP.x0) / GMAP.cell)); i++) g[j * GMAP.nx + i] = v;
    }
  };
  fill(-70, 74, 17.6, 40, 14);                       // outside, to the south
  fill(-4, 4, 15.1, 17.6, 14);                        // the walk outside the south doors
  const pad = 0.3;
  // big shared spaces first, the small rooms over them
  const order = [...ROOMS].sort((a, b) => (a.group === 1 ? 0 : 1) - (b.group === 1 ? 0 : 1));
  for (const r of order) fill(r.x0 - pad, r.x1 + pad, r.z0 - pad, r.z1 + pad, r.group);
  return g;
})();

export function groupAt(x, z) {
  const i = Math.floor((x - GMAP.x0) / GMAP.cell), j = Math.floor((z - GMAP.z0) / GMAP.cell);
  if (i < 0 || j < 0 || i >= GMAP.nx || j >= GMAP.nz) return 0;
  return GROUPS[j * GMAP.nx + i];
}

export const FALLOFF = 0.09;    // how fast light fades with distance
const REACH = LGRID.cell * 1.45;

// is this fixture lit, given the breakers ({ id: bool }) and the carousel?
export function fixtureOn(f, st) {
  if (ALWAYS.has(f.breaker)) return true;
  if (f.breaker === 'carousel') return !!st.carousel;
  if (f.breaker === 'stockroom') return !!st.stockroom;
  return !!(st.breakers && st.breakers[f.breaker]);
}

// Roughly how much light falls on (x, y, z): 0 is pitch dark, about 0.5
// is a dim pool under a night light, 1+ is well lit.
const byCell = new Map(FIXTURES.map((f) => [f.j * LGRID.nx + f.i, f]));
export function lightAt(x, y, z, st, flicker = null) {
  const g = groupAt(x, z);
  if (!g) return 0;
  const ci = Math.floor((x - LGRID.x0) / LGRID.cell), cj = Math.floor((z - LGRID.z0) / LGRID.cell);
  let sum = 0;
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const f = byCell.get((cj + dj) * LGRID.nx + ci + di);
      if (!f || f.group !== g || !fixtureOn(f, st)) continue;
      if (flicker && flicker.has(f)) continue;
      const dx = f.x - x, dy = f.y - y, dz = f.z - z;
      const h = Math.hypot(dx, dz) / REACH;
      let win = Math.max(0, 1 - h * h);
      win *= win;
      sum += f.power * win / (1 + (dx * dx + dy * dy + dz * dz) * FALLOFF);
    }
  }
  return sum;
}
