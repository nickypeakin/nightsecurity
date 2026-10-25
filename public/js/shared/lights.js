// Kingsgate's street lights. There are hundreds of lamps, far too many for
// ordinary three.js lights, so they live on a grid of 12 m squares laid
// over the whole city (at most one lamp to a square, anywhere inside it):
// the client's shader looks at the nine squares round each pixel, and a
// lamp lights everything within one square's width of it. Knocked-down
// lamps go dark by clearing their square.

import { LAMPS } from './city.js';
import { INTERIORS, ROOM_H } from './interiors.js';

// (the grid runs on east past the city's wall to cover the rooms you can
// walk into; their lights are always on)
export const LGRID = { x0: -252, z0: -252, cell: 12, nx: 45, nz: 42 };
export const REACH = LGRID.cell;
export const FALLOFF = 0.022;

// colour and strength by kind of lamp
const KINDS = {
  street: { color: [1.0, 0.62, 0.3], power: 10 },     // sodium orange
  white: { color: [0.92, 0.94, 1.0], power: 9 },      // downtown and car parks
  park: { color: [1.0, 0.86, 0.6], power: 4.5 },
  lot: { color: [1.0, 0.72, 0.42], power: 11 },
  canopy: { color: [0.9, 0.96, 1.0], power: 16 },
  indoor: { color: [1.0, 0.92, 0.8], power: 7 },
};

export const FIXTURES = [];
{
  const taken = new Set();
  for (const l of LAMPS) {
    const i = Math.floor((l.x - LGRID.x0) / LGRID.cell), j = Math.floor((l.z - LGRID.z0) / LGRID.cell);
    if (i < 0 || j < 0 || i >= LGRID.nx || j >= LGRID.nz) continue;
    const k = j * LGRID.nx + i;
    if (taken.has(k)) continue;     // one lamp to a square
    taken.add(k);
    const K = KINDS[l.kind] || KINDS.street;
    FIXTURES.push({ i, j, k, x: l.x, z: l.z, y: l.y, kind: l.kind, color: K.color, power: K.power, lamp: l });
  }
  for (const r of INTERIORS) {
    for (const l of r.lights) {
      const i = Math.floor((l.x - LGRID.x0) / LGRID.cell), j = Math.floor((l.z - LGRID.z0) / LGRID.cell);
      const k = j * LGRID.nx + i;
      if (taken.has(k)) throw new Error(`two lights in one square in ${r.id}`);
      taken.add(k);
      const K = KINDS.indoor;
      FIXTURES.push({ i, j, k, x: l.x, z: l.z, y: ROOM_H - 0.15, kind: 'indoor', indoor: true, color: K.color, power: K.power, room: r.id });
    }
  }
}

// Roughly how much light falls on (x, y, z): 0 is dark, 1+ is well lit.
const byCell = new Map(FIXTURES.map((f) => [f.k, f]));
export function lightAt(x, y, z, off = null) {
  const ci = Math.floor((x - LGRID.x0) / LGRID.cell), cj = Math.floor((z - LGRID.z0) / LGRID.cell);
  let sum = 0;
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const f = byCell.get((cj + dj) * LGRID.nx + ci + di);
      if (!f || (off && off.has(f.k))) continue;
      const dx = f.x - x, dy = f.y - y, dz = f.z - z;
      const h = Math.hypot(dx, dz) / REACH;
      if (h >= 1) continue;
      const win = (1 - h * h) * (1 - h * h);
      sum += f.power * win / (1 + (dx * dx + dy * dy + dz * dz) * FALLOFF);
    }
  }
  return sum;
}
