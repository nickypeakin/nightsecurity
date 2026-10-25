// The buildings you can walk into: your place, Kingsgate Arms, Sal's Diner,
// and the offices of the three people with work for you. Each has a door on
// the front of its building in the city; walk into it and you're inside.
// The rooms themselves are laid out out at sea off the south-east coast
// (world.js's ROOMS_BOX), where nobody outside will see them, a row of the
// light grid's squares apart so their ceiling lights (shared/lights.js)
// light only their own room. Positions inside are ordinary world coordinates, so
// collision, the host and the network treat a room like anywhere else.
//
// Every room is a box with the door in the middle of its south wall
// (local x across from the west wall, z down from the north wall).

import { PLACES, BUILDINGS, SIDEWALK_Y, staticSolids, groundY } from './city.js';
import { heightAt } from './world.js';
import { Solids } from './collide.js';

export const IX = 960;               // the rooms start here (and run south from z = 296)
export const ROOM_H = 3.2;           // floor to ceiling
const WALL_T = 0.25;

// the spot just outside a building's door: in front of the face nearest the
// named place, facing out (the way you leave)
function doorOf(place, building) {
  const p = PLACES[place];
  const b = BUILDINGS.find((q) => q.name === building) || BUILDINGS.find((q) => q.name && q.name.toUpperCase() === building.toUpperCase());
  const faces = [
    { side: 'n', d: Math.abs(p.z - b.z0), x: p.x, z: b.z0 - 0.9, h: Math.PI },
    { side: 's', d: Math.abs(p.z - b.z1), x: p.x, z: b.z1 + 0.9, h: 0 },
    { side: 'w', d: Math.abs(p.x - b.x0), x: b.x0 - 0.9, z: p.z, h: -Math.PI / 2 },
    { side: 'e', d: Math.abs(p.x - b.x1), x: b.x1 + 0.9, z: p.z, h: Math.PI / 2 },
  ];
  // the building's front if it has one, else the side nearest the place
  const f = faces.find((q) => q.side === b.face) || faces.sort((a, c) => a.d - c.d)[0];
  // along the face, keep within the building
  const x = Math.max(b.x0 + 1, Math.min(b.x1 - 1, f.x)), z = Math.max(b.z0 + 1, Math.min(b.z1 - 1, f.z));
  return { x: f.h === 0 || f.h === Math.PI ? x : f.x, z: f.h === 0 || f.h === Math.PI ? f.z : z, h: f.h, side: f.side, building: b };
}

export const INTERIORS = [];

// a room w by d metres with its north-west corner at (x0, z0)
function room(id, o) {
  const { x0, z0, w, d } = o;
  const L = (x, z) => ({ x: x0 + x, z: z0 + z });
  const R = {
    id, name: o.name, kind: o.kind, place: o.place,
    box: { x0, x1: x0 + w, z0, z1: z0 + d },
    door: doorOf(o.place, o.building),
    // just inside, facing in; and the spot by the door that takes you out
    entry: { ...L(o.doorX, d - 1.4), h: Math.PI },
    exit: L(o.doorX, d - 0.45),
    doorX: x0 + o.doorX,
    floor: o.floor, wall: o.wall,
    lights: (o.lights || []).map(([x, z]) => L(x, z)),
    // furniture: { t, x, z (centre), w, d, h, y, solid, col, rot }
    items: (o.items || []).map((it) => ({ solid: true, y: 0, rot: 0, ...it, ...L(it.x, it.z) })),
    walls: (o.walls || []).map(([ax, az, bx, bz]) => ({ x0: x0 + Math.min(ax, bx), x1: x0 + Math.max(ax, bx), z0: z0 + Math.min(az, bz), z1: z0 + Math.max(az, bz) })),
    spots: Object.fromEntries(Object.entries(o.spots || {}).map(([k, v]) => [k, { ...v, ...L(v.x, v.z) }])),
    people: (o.people || []).map((p) => ({ ...p, ...L(p.x, p.z) })),
  };
  INTERIORS.push(R);
  return R;
}

// ---------------------------------------------------------------- your place
// a living room with a kitchen at one end, and a bedroom through the back
room('home', {
  name: 'Your Place', kind: 'home', place: 'safehouse', building: 'Your Place',
  x0: IX, z0: 296, w: 22, d: 10, doorX: 6, floor: 'wood', wall: 0xd8ccb4,
  lights: [[6, 5], [18, 5]],
  walls: [[14, 0, 14.15, 6.2], [14, 7.8, 14.15, 10]],
  items: [
    { t: 'rug', x: 6.5, z: 3.6, w: 4.2, d: 3, h: 0.01, solid: false, col: 0x7a2a2a },
    { t: 'sofa', x: 6.5, z: 5.2, w: 3, d: 1, h: 0.85, col: 0x3a4a6a, face: 'n' },
    { t: 'tv', x: 6.5, z: 0.45, w: 1.6, d: 0.5, h: 1.3 },
    { t: 'table', x: 6.5, z: 3.2, w: 1.3, d: 0.7, h: 0.45, col: 0x6a4a30 },
    { t: 'counter', x: 0.4, z: 3.5, w: 0.75, d: 5, h: 0.95, col: 0xe0dcd0, face: 'e' },
    { t: 'fridge', x: 0.45, z: 7.2, w: 0.85, d: 0.8, h: 1.9, face: 'e' },
    { t: 'table', x: 3, z: 8, w: 1.2, d: 1.2, h: 0.76, col: 0x8a6a48 },
    { t: 'chair', x: 2.2, z: 8, w: 0.45, d: 0.45, h: 0.9, col: 0x5a3a22, face: 'e' },
    { t: 'chair', x: 3.8, z: 8, w: 0.45, d: 0.45, h: 0.9, col: 0x5a3a22, face: 'w' },
    { t: 'plant', x: 13.3, z: 0.7, w: 0.6, d: 0.6, h: 1.4 },
    { t: 'shelf', x: 11, z: 0.3, w: 2.2, d: 0.4, h: 1.9, col: 0x6a4a30 },
    { t: 'window', x: 3, z: 0.02, w: 1.8, d: 0.04, h: 1.3, y: 1.0, solid: false },
    { t: 'bed', x: 19.5, z: 2.2, w: 2, d: 2.3, h: 0.6, col: 0x2a4a7a },
    { t: 'nightstand', x: 21.5, z: 0.6, w: 0.5, d: 0.5, h: 0.6 },
    { t: 'wardrobe', x: 21.6, z: 7.5, w: 0.7, d: 1.8, h: 2.1, col: 0x5a3a22, face: 'w' },
    { t: 'desk', x: 15.3, z: 1.2, w: 1.6, d: 0.7, h: 0.76, col: 0x6a4a30 },
    { t: 'window', x: 18, z: 0.02, w: 1.6, d: 0.04, h: 1.2, y: 1.0, solid: false },
    { t: 'poster', x: 21.96, z: 4.2, w: 0.02, d: 1.0, h: 1.4, y: 1.0, solid: false, col: 0xc84a2a, face: 'w' },
  ],
  spots: { save: { x: 19.5, z: 4.4 }, wake: { x: 18.2, z: 4.2, h: Math.PI / 2 } },
});

// ---------------------------------------------------------- Kingsgate Arms
room('guns', {
  name: 'Kingsgate Arms', kind: 'shop', place: 'guns', building: 'Kingsgate Arms',
  x0: IX, z0: 320, w: 12, d: 10, doorX: 6, floor: 'tile', wall: 0x8a8478,
  lights: [[6, 5]],
  items: [
    { t: 'counter', x: 6, z: 3.4, w: 7, d: 0.8, h: 1.05, col: 0x3a2a1c, glass: true },
    { t: 'gunrack', x: 6, z: 0.2, w: 8, d: 0.3, h: 2.2, y: 0.4, solid: true },
    { t: 'case', x: 1, z: 5.5, w: 1, d: 3, h: 1.0, glass: true, face: 'e' },
    { t: 'case', x: 11, z: 5.5, w: 1, d: 3, h: 1.0, glass: true, face: 'w' },
    { t: 'armor', x: 10.6, z: 1.4, w: 0.6, d: 0.4, h: 1.7, face: 's' },
    { t: 'poster', x: 0.04, z: 2.5, w: 0.02, d: 1.2, h: 1.6, y: 1.0, solid: false, col: 0x1a3a7a, face: 'e' },
    { t: 'flag', x: 11.96, z: 7.6, w: 0.02, d: 1.6, h: 1.0, y: 1.5, solid: false, face: 'w' },
  ],
  spots: { shop: { x: 6, z: 4.6 } },
  people: [{ look: 'clerk', x: 6, z: 2.3, h: 0 }],
});

// ---------------------------------------------------------- Sal's Diner
room('diner', {
  name: "Sal's Diner", kind: 'diner', place: 'diner', building: "Sal's Diner",
  x0: IX, z0: 344, w: 22, d: 10, doorX: 6, floor: 'checker', wall: 0xe8dcc0,
  lights: [[6, 5], [18, 5]],
  items: [
    { t: 'counter', x: 11, z: 2.3, w: 14, d: 0.8, h: 1.05, col: 0xc83a3a },
    { t: 'kitchen', x: 11, z: 0.4, w: 16, d: 0.8, h: 0.95 },
    ...[5, 7, 9, 11, 13, 15, 17].map((x) => ({ t: 'stool', x, z: 3.2, w: 0.4, d: 0.4, h: 0.75, col: 0xc83a3a })),
    { t: 'booth', x: 20.9, z: 5.0, w: 2, d: 0.6, h: 1.1, col: 0xb82a2a },
    { t: 'table', x: 20.9, z: 5.85, w: 1.5, d: 0.8, h: 0.75, col: 0xe8e4dc },
    { t: 'booth', x: 20.9, z: 6.7, w: 2, d: 0.6, h: 1.1, col: 0xb82a2a, face: 'n' },
    { t: 'booth', x: 20.9, z: 7.9, w: 2, d: 0.6, h: 1.1, col: 0xb82a2a },
    { t: 'table', x: 20.9, z: 8.75, w: 1.5, d: 0.8, h: 0.75, col: 0xe8e4dc },
    { t: 'booth', x: 1.2, z: 6.4, w: 0.6, d: 2, h: 1.1, col: 0xb82a2a, face: 'e' },
    { t: 'table', x: 2.3, z: 6.4, w: 0.8, d: 1.4, h: 0.75, col: 0xe8e4dc },
    { t: 'jukebox', x: 13.5, z: 9.4, w: 1, d: 0.6, h: 1.6, face: 'n' },
    { t: 'window', x: 15.5, z: 9.96, w: 4, d: 0.04, h: 1.4, y: 0.9, solid: false, face: 'n' },
    { t: 'window', x: 2.2, z: 9.96, w: 2.4, d: 0.04, h: 1.4, y: 0.9, solid: false, face: 'n' },
  ],
  spots: { eat: { x: 11, z: 3.9 } },
  people: [{ look: 'cook', x: 11, z: 1.4, h: 0 }],
});

// ------------------------------------------------------------- the offices
room('okafor', {
  name: "Okafor's Motors", kind: 'office', place: 'okafor', building: "Okafor's Motors",
  x0: IX, z0: 368, w: 12, d: 10, doorX: 6, floor: 'carpet', wall: 0xc8c0a8,
  lights: [[6, 5]],
  items: [
    { t: 'desk', x: 6, z: 3, w: 2.4, d: 1.1, h: 0.76, col: 0x5a3a22, face: 'n' },
    { t: 'chair', x: 5.2, z: 4.6, w: 0.5, d: 0.5, h: 0.9, col: 0x2a2a2a, face: 'n' },
    { t: 'chair', x: 6.8, z: 4.6, w: 0.5, d: 0.5, h: 0.9, col: 0x2a2a2a, face: 'n' },
    { t: 'cabinet', x: 0.4, z: 1, w: 0.6, d: 1.2, h: 1.4, face: 'e' },
    { t: 'cabinet', x: 0.4, z: 2.3, w: 0.6, d: 1.2, h: 1.4, face: 'e' },
    { t: 'plant', x: 11.3, z: 0.7, w: 0.6, d: 0.6, h: 1.3 },
    { t: 'poster', x: 3, z: 0.02, w: 1.6, d: 0.02, h: 1.0, y: 1.3, solid: false, col: 0xd8a818 },
    { t: 'poster', x: 9, z: 0.02, w: 1.6, d: 0.02, h: 1.0, y: 1.3, solid: false, col: 0x2a6a9a },
    { t: 'window', x: 11.96, z: 5, w: 0.04, d: 2.4, h: 1.4, y: 1.0, solid: false, face: 'w' },
    { t: 'sofa', x: 11.4, z: 7.8, w: 0.9, d: 2.2, h: 0.85, col: 0x6a4a3a, face: 'w' },
  ],
  spots: { giver: { x: 6, z: 1.7, h: 0 }, job: { x: 6, z: 5.6 } },
});

room('voss', {
  name: 'Voss Freight', kind: 'office', place: 'voss', building: 'VOSS FREIGHT',
  x0: IX, z0: 392, w: 12, d: 10, doorX: 6, floor: 'concrete', wall: 0x7a8088,
  lights: [[6, 5]],
  items: [
    { t: 'desk', x: 4, z: 2.6, w: 2.6, d: 1.1, h: 0.76, col: 0x2a2a2e, face: 'n' },
    { t: 'crate', x: 10.5, z: 1.4, w: 1.6, d: 1.6, h: 1.2 },
    { t: 'crate', x: 10.4, z: 1.5, w: 1.2, d: 1.2, h: 0.9, y: 1.2 },
    { t: 'crate', x: 10.6, z: 3.4, w: 1.4, d: 1.4, h: 1.0 },
    { t: 'map', x: 0.04, z: 5, w: 0.02, d: 3, h: 1.8, y: 0.9, solid: false, face: 'e' },
    { t: 'cabinet', x: 0.4, z: 1, w: 0.6, d: 1.2, h: 1.6, face: 'e' },
    { t: 'window', x: 6, z: 0.02, w: 3, d: 0.04, h: 1.2, y: 1.2, solid: false },
  ],
  spots: { giver: { x: 4, z: 1.4, h: 0 }, job: { x: 4.6, z: 5.2 } },
});

room('dale', {
  name: "Mercer's Pawn", kind: 'office', place: 'dale', building: "Mercer's Pawn",
  x0: IX, z0: 416, w: 12, d: 10, doorX: 6, floor: 'lino', wall: 0x8a7a5a,
  lights: [[6, 5]],
  items: [
    { t: 'counter', x: 6, z: 3, w: 6, d: 0.8, h: 1.0, col: 0x4a3a28, glass: true },
    { t: 'shelf', x: 6, z: 0.3, w: 9, d: 0.5, h: 2.2, col: 0x5a4a32, junk: true },
    { t: 'shelf', x: 0.3, z: 6, w: 0.5, d: 5, h: 2.0, col: 0x5a4a32, junk: true, face: 'e' },
    { t: 'tvstack', x: 11.2, z: 6.5, w: 1.2, d: 1.2, h: 1.6, face: 'w' },
    { t: 'guitar', x: 11.9, z: 3, w: 0.1, d: 0.4, h: 1.1, y: 0.9, solid: false, face: 'w' },
  ],
  spots: { giver: { x: 6, z: 1.9, h: 0 }, job: { x: 6, z: 4.6 } },
});

export const INTERIOR = Object.fromEntries(INTERIORS.map((r) => [r.id, r]));

// which room (x, z) is in, if any
export function interiorAt(x, z) {
  if (x < IX - 1) return null;
  for (const r of INTERIORS) if (x >= r.box.x0 - 0.5 && x <= r.box.x1 + 0.5 && z >= r.box.z0 - 0.5 && z <= r.box.z1 + 0.5) return r;
  return null;
}

// where the jobs' givers wait (in their offices)
export const GIVER_ROOMS = { okafor: 'okafor', voss: 'voss', dale: 'dale' };

// the walls, the ceiling (for the camera) and the furniture, as solid boxes
export function interiorSolids() {
  const out = [];
  const y1 = ROOM_H + 0.3;
  for (const r of INTERIORS) {
    const { x0, x1, z0, z1 } = r.box;
    out.push({ x0: x0 - WALL_T, x1: x1 + WALL_T, z0: z0 - WALL_T, z1: z0, y0: 0, y1 });
    out.push({ x0: x0 - WALL_T, x1: x1 + WALL_T, z0: z1, z1: z1 + WALL_T, y0: 0, y1 });
    out.push({ x0: x0 - WALL_T, x1: x0, z0, z1, y0: 0, y1 });
    out.push({ x0: x1, x1: x1 + WALL_T, z0, z1, y0: 0, y1 });
    out.push({ x0, x1, z0, z1, y0: ROOM_H, y1: ROOM_H + 0.3, ceiling: true });
    for (const w of r.walls) out.push({ ...w, y0: 0, y1 });
    for (const it of r.items) {
      if (!it.solid) continue;
      const rot = Math.abs(Math.sin(it.rot || 0)) > 0.7;
      const hw = (rot ? it.d : it.w) / 2, hd = (rot ? it.w : it.d) / 2;
      out.push({ x0: it.x - hw, x1: it.x + hw, z0: it.z - hd, z1: it.z + hd, y0: it.y || 0, y1: (it.y || 0) + it.h, furniture: it.t });
    }
  }
  return out;
}

export const FLOOR_Y = SIDEWALK_Y;

// everything solid: the city and the rooms
export function worldSolids() { return new Solids([...staticSolids(), ...interiorSolids()], { ground: groundY, terrain: heightAt }); }
