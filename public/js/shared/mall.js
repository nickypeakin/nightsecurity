// Kingsgate Mall: one floor of it, after closing. x runs east, z runs
// south, y is up, in metres; the middle of the centre court is the origin.
//
//   Halvorsen's (the dead department store) fills the west end; the main
//   concourse runs east from it, through the centre court (fountain,
//   escalators to the closed upper level, the main doors to the south lot),
//   to the food court and its carousel at the east end. Sixteen shops line
//   the concourse, each behind a roll-down security gate. Behind the north
//   shops a service corridor runs the length of the mall: the security
//   office, the mall office, the electrical room, the loading dock, the
//   walk-in freezer and the back door into Halvorsen's stockroom.
//
// Everything here is plain data shared by the host (collision, the AI's
// paths and sight lines) and the clients (who build the 3D mall from it).

import { makeRng } from './rng.js';

// ------------------------------------------------------------------ shops
// side 'n' shops face south onto the concourse from z = -17 .. -6; side
// 's' shops face north from z = 6 .. 17.
export const STORES = [
  { id: 'N1', name: 'Spin City Records', type: 'records', x0: -40, x1: -32.5, side: 'n', wall: '#2c2540', back: true, sign: { text: 'SPIN CITY', bg: '#140b1f', fg: '#ff5ad8', font: 'italic bold 84px Arial Black, Impact, sans-serif', neon: true } },
  { id: 'N2', name: 'Kingsgate Jewelers', type: 'jewelry', x0: -32.5, x1: -25, side: 'n', wall: '#e9e1d0', sign: { text: 'Kingsgate Jewelers', bg: '#0e1a2a', fg: '#e8cf8a', font: 'italic 66px Georgia, serif' } },
  { id: 'N3', name: 'Photo Finish', type: 'photo', x0: -25, x1: -17.5, side: 'n', wall: '#d9e4ea', back: true, sign: { text: 'PHOTO FINISH · 1 HR', bg: '#f2c200', fg: '#1a1a1a', font: 'bold 64px Arial, sans-serif' } },
  { id: 'N4', name: 'Sole Sports', type: 'shoes', x0: -17.5, x1: -10, side: 'n', wall: '#c9d2c4', sign: { text: 'SOLE SPORTS', bg: '#111', fg: '#ff3b1f', font: 'italic bold 78px Arial Black, Impact, sans-serif' } },
  { id: 'N5', name: 'Video Vault', type: 'video', x0: 10, x1: 17.5, side: 'n', wall: '#1d2a4a', sign: { text: 'VIDEO VAULT', bg: '#0b2a6b', fg: '#ffd21f', font: 'bold 76px Arial Black, Impact, sans-serif' } },
  { id: 'N6', name: 'Galaxy Zone', type: 'arcade', x0: 17.5, x1: 25, side: 'n', wall: '#120f24', back: true, sign: { text: 'GALAXY ZONE', bg: '#07051a', fg: '#4ff0ff', font: 'bold 80px Arial Black, Impact, sans-serif', neon: true } },
  { id: 'N7', name: 'Radio Hut', type: 'electronics', x0: 25, x1: 32.5, side: 'n', wall: '#dedad2', sign: { text: 'RADIO HUT', bg: '#b0121b', fg: '#ffffff', font: 'bold 80px Arial, sans-serif' } },
  { id: 'N8', name: 'Pages & Co.', type: 'books', x0: 32.5, x1: 40, side: 'n', wall: '#5a3f2c', sign: { text: 'Pages & Co.', bg: '#24331f', fg: '#efe3c0', font: 'italic 76px Georgia, serif' } },
  { id: 'S1', name: 'Belle Mode', type: 'boutique', x0: -40, x1: -32.5, side: 's', wall: '#ead8da', sign: { text: 'Belle Mode', bg: '#1b1b1b', fg: '#f4c6d0', font: 'italic 80px Georgia, serif' } },
  { id: 'S2', name: 'Kiddie Kingdom', type: 'toys', x0: -32.5, x1: -25, side: 's', wall: '#f2e2a0', sign: { text: 'KIDDIE KINGDOM', bg: '#1f5fbf', fg: '#ffe14d', font: 'bold 66px Comic Sans MS, Arial Rounded MT Bold, sans-serif' } },
  { id: 'S3', name: 'Vacant', type: 'vacant', x0: -25, x1: -17.5, side: 's', wall: '#bdb7aa', sign: { text: 'COMING SOON', bg: '#d8d2c4', fg: '#6a645a', font: 'bold 60px Arial, sans-serif' } },
  { id: 'S4', name: 'Cinnamon Twist', type: 'pretzel', x0: -17.5, x1: -10, side: 's', wall: '#f0dcc0', sign: { text: 'Cinnamon Twist', bg: '#6b3410', fg: '#ffe6b0', font: 'italic bold 66px Georgia, serif' } },
  { id: 'S5', name: 'Greetings & Things', type: 'cards', x0: 10, x1: 17.5, side: 's', wall: '#e8d4e8', sign: { text: 'Greetings & Things', bg: '#5b2a6e', fg: '#fff', font: 'italic 60px Georgia, serif' } },
  { id: 'S6', name: 'Sunrise Pharmacy', type: 'pharmacy', x0: 17.5, x1: 25, side: 's', wall: '#eef2f2', sign: { text: 'SUNRISE PHARMACY', bg: '#0f6d5a', fg: '#fff', font: 'bold 58px Arial, sans-serif' } },
  { id: 'S7', name: 'Threads', type: 'clothes', x0: 25, x1: 32.5, side: 's', wall: '#3a3a3e', sign: { text: 'THREADS', bg: '#000', fg: '#f0f0f0', font: 'bold 84px Arial Black, Impact, sans-serif' } },
  { id: 'S8', name: 'Store closing', type: 'closing', x0: 32.5, x1: 40, side: 's', wall: '#cfc9bb', sign: { text: 'EVERYTHING MUST GO', bg: '#d81e1e', fg: '#fff', font: 'bold 54px Arial, sans-serif' } },
];
for (const s of STORES) {
  s.z0 = s.side === 'n' ? -17 : 6;
  s.z1 = s.side === 'n' ? -6 : 17;
  s.front = s.side === 'n' ? -6 : 6;          // z of the storefront
  s.cx = (s.x0 + s.x1) / 2;
  s.cz = (s.z0 + s.z1) / 2;
  s.inward = s.side === 'n' ? -1 : 1;          // which way is into the shop (z)
}
export const store = (id) => STORES.find((s) => s.id === id);

// the food court's counters, three on each side
export const STALLS = [
  { id: 'FN1', name: 'Golden Wok', x0: 44, x1: 49, side: 'n', sign: { text: 'GOLDEN WOK', bg: '#a3121a', fg: '#ffd84a' } },
  { id: 'FN2', name: 'Pizza Piazza', x0: 49, x1: 54, side: 'n', sign: { text: 'PIZZA PIAZZA', bg: '#1f6b2a', fg: '#fff' } },
  { id: 'FN3', name: 'Burger Barn', x0: 54, x1: 59, side: 'n', sign: { text: 'BURGER BARN', bg: '#7a3b12', fg: '#ffcf6a' } },
  { id: 'FS1', name: 'Taco Loco', x0: 44, x1: 49, side: 's', sign: { text: 'TACO LOCO', bg: '#e86b10', fg: '#2a1400' } },
  { id: 'FS2', name: 'Hot Dog Hut', x0: 49, x1: 54, side: 's', sign: { text: 'HOT DOG HUT', bg: '#d8b40a', fg: '#b3121a' } },
  { id: 'FS3', name: 'Sunny Squeeze', x0: 54, x1: 59, side: 's', sign: { text: 'SUNNY SQUEEZE', bg: '#ff9a1f', fg: '#fff' } },
];
for (const s of STALLS) {
  s.front = s.side === 'n' ? -9 : 9;
  s.z0 = s.side === 'n' ? -13 : 9;
  s.z1 = s.side === 'n' ? -9 : 13;
  s.cx = (s.x0 + s.x1) / 2;
}

// ------------------------------------------------------------------ rooms
// Every space you can be in. `group` is which lights reach it: the whole
// open mall (concourse, shops, food court, Halvorsen's) shares one, each
// back room has its own. `ceil` is the ceiling height.
export const ROOMS = [
  { id: 'court', name: 'Centre Court', x0: -10, x1: 10, z0: -10, z1: 10, group: 1, ceil: 11 },
  { id: 'westHall', name: 'West Concourse', x0: -40, x1: -10, z0: -6, z1: 6, group: 1, ceil: 7 },
  { id: 'eastHall', name: 'East Concourse', x0: 10, x1: 40, z0: -6, z1: 6, group: 1, ceil: 7 },
  { id: 'food', name: 'Food Court', x0: 40, x1: 62, z0: -13, z1: 13, group: 1, ceil: 8.5 },
  { id: 'eastVest', name: 'Food Court Entrance', x0: 62, x1: 66, z0: -3, z1: 3, group: 1, ceil: 3.5 },
  { id: 'southVest', name: 'South Entrance', x0: -4, x1: 4, z0: 10, z1: 15, group: 1, ceil: 3.5 },
  { id: 'halv', name: "Halvorsen's", x0: -64, x1: -40, z0: -13, z1: 17.25, group: 1, ceil: 5.5 },
  { id: 'halvNorth', name: "Halvorsen's", x0: -64, x1: -52, z0: -22, z1: -13, group: 1, ceil: 5.5 },
  { id: 'stock', name: "Halvorsen's Stockroom", x0: -52, x1: -40, z0: -22, z1: -13, group: 13, ceil: 4 },
  { id: 'corridor', name: 'Service Corridor', x0: -40, x1: 56, z0: -20.75, z1: -17.25, group: 2, ceil: 3.2 },
  { id: 'fcHall', name: 'Food Court Service Hall', x0: 40, x1: 42, z0: -17.25, z1: -13, group: 2, ceil: 3.2 },
  { id: 'janitor', name: 'Janitor', x0: -22, x1: -16, z0: -28, z1: -20.75, group: 7, ceil: 3 },
  { id: 'electrical', name: 'Electrical Room', x0: -16, x1: -7, z0: -28, z1: -20.75, group: 5, ceil: 3 },
  { id: 'security', name: 'Security Office', x0: -7, x1: 7, z0: -28, z1: -20.75, group: 3, ceil: 3 },
  { id: 'office', name: 'Mall Office', x0: 7, x1: 15, z0: -28, z1: -20.75, group: 4, ceil: 3 },
  { id: 'break', name: 'Break Room', x0: 15, x1: 23, z0: -28, z1: -20.75, group: 6, ceil: 3 },
  { id: 'dock', name: 'Loading Dock', x0: 30, x1: 44, z0: -31, z1: -20.75, group: 8, ceil: 5 },
  { id: 'freezer', name: 'Walk-in Freezer', x0: 50, x1: 56, z0: -25, z1: -20.75, group: 9, ceil: 2.8 },
  { id: 'women', name: "Women's Restroom", x0: -10, x1: -1.75, z0: -17.25, z1: -10, group: 10, ceil: 3 },
  { id: 'men', name: "Men's Restroom", x0: 1.75, x1: 10, z0: -17.25, z1: -10, group: 11, ceil: 3 },
  { id: 'restHall', name: 'Restroom Hall', x0: -1.75, x1: 1.75, z0: -17.25, z1: -10, group: 12, ceil: 3.2 },
];
for (const s of STORES) ROOMS.push({ id: s.id, name: s.name, x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1, group: 1, ceil: 3.8, store: true });
for (const s of STALLS) ROOMS.push({ id: s.id, name: s.name, x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1, group: 1, ceil: 3.6, store: true });

// the room you're in (shops and stalls before the big spaces they open off)
export function roomAt(x, z) {
  let best = null;
  for (const r of ROOMS) {
    if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
    if (!best || (r.x1 - r.x0) * (r.z1 - r.z0) < (best.x1 - best.x0) * (best.z1 - best.z0)) best = r;
  }
  return best;
}

// --------------------------------------------------------- doors and gates
// axis 'x': the opening spans x from a to b in a wall at z = at; axis 'z':
// it spans z from a to b in a wall at x = at. kinds: 'gate' (a shop's
// roll-down grille), 'glass' (the doors to the parking lots), 'door' (a
// steel service door), 'rollup' (the dock door), 'cage' (chain link).
// `swing` is the side a door opens into (+1: towards +z or +x), `hinge`
// the end it hangs from ('a' or 'b'). `key`: needs Dale's spare keys.
// `outside`: an exterior door; `panel`: shown on the alarm panel.
export const DOORS = [];
{
  const D = (o) => DOORS.push({ panel: true, lock: true, h: 2.2, swing: 1, hinge: 'a', ...o });
  for (const s of STORES) {
    D({ id: s.id, kind: 'gate', name: s.name === 'Vacant' || s.name === 'Store closing' ? `the empty shop (${s.id})` : s.name, axis: 'x', at: s.front, a: s.x0 + 0.7, b: s.x1 - 0.7, h: 3.4, store: s.id });
  }
  for (const s of STALLS) D({ id: s.id, kind: 'gate', name: s.name, axis: 'x', at: s.front, a: s.x0 + 0.3, b: s.x1 - 0.3, h: 2.8, store: s.id, panel: false });
  D({ id: 'H', kind: 'gate', name: "Halvorsen's main gate", axis: 'z', at: -40, a: -3.5, b: 3.5, h: 3.6 });
  D({ id: 'south', kind: 'glass', name: 'the south entrance', axis: 'x', at: 15, a: -2, b: 2, h: 2.6, outside: true });
  D({ id: 'east', kind: 'glass', name: 'the food court entrance', axis: 'z', at: 66, a: -2, b: 2, h: 2.6, outside: true });
  D({ id: 'halvWest', kind: 'glass', name: "Halvorsen's west doors", axis: 'z', at: -64, a: -2, b: 2, h: 2.6, outside: true });
  D({ id: 'dockDoor', kind: 'rollup', name: 'the loading dock door', axis: 'x', at: -31.25, a: 33, b: 41, h: 4, outside: true });
  D({ id: 'security', kind: 'door', name: 'the security office door', axis: 'x', at: -20.75, a: -0.6, b: 0.6, swing: -1, deadbolt: true });
  D({ id: 'office', kind: 'door', name: 'the mall office door', axis: 'x', at: -20.75, a: 10.4, b: 11.6, swing: -1 });
  D({ id: 'electrical', kind: 'door', name: 'the electrical room door', axis: 'x', at: -20.75, a: -12.1, b: -10.9, swing: -1 });
  D({ id: 'janitor', kind: 'door', name: 'the janitor\'s closet', axis: 'x', at: -20.75, a: -19.6, b: -18.4, swing: -1, panel: false });
  D({ id: 'breakroom', kind: 'door', name: 'the break room door', axis: 'x', at: -20.75, a: 18.4, b: 19.6, swing: -1, panel: false });
  D({ id: 'fcHall', kind: 'door', name: 'the food court service door', axis: 'x', at: -13, a: 40.4, b: 41.6, swing: 1 });
  D({ id: 'halvBack', kind: 'door', name: "Halvorsen's receiving door", axis: 'z', at: -40, a: -19.6, b: -18.4, swing: -1 });
  D({ id: 'stockFloor', kind: 'door', name: "Halvorsen's stockroom door", axis: 'x', at: -13, a: -46.6, b: -45.4, swing: 1, panel: false });
  D({ id: 'N1back', kind: 'door', name: 'the back door of Spin City Records', axis: 'x', at: -17.25, a: -35.4, b: -34.2, swing: 1, panel: false });
  D({ id: 'N3back', kind: 'door', name: 'the back door of Photo Finish', axis: 'x', at: -17.25, a: -20.4, b: -19.2, swing: 1, panel: false });
  D({ id: 'N6back', kind: 'door', name: 'the back door of Galaxy Zone', axis: 'x', at: -17.25, a: 23.2, b: 24.4, swing: 1, panel: false });
  D({ id: 'cage', kind: 'cage', name: 'the stockroom cage', axis: 'z', at: -47, a: -20.6, b: -19.4, swing: 1, hinge: 'b', key: true, panel: false, h: 2.3 });
  D({ id: 'freezer', kind: 'door', name: 'the walk-in freezer', axis: 'x', at: -20.75, a: 52.4, b: 53.6, swing: 1, key: true, panel: false });
  D({ id: 'elevator', kind: 'cage', name: 'the freight elevator', axis: 'z', at: 33.3, a: -26.4, b: -24.1, swing: 1, key: true, panel: false, h: 2.5 });
}
for (const d of DOORS) {
  d.mid = (d.a + d.b) / 2;
  // the middle of the opening on the floor
  d.x = d.axis === 'x' ? d.mid : d.at;
  d.z = d.axis === 'x' ? d.at : d.mid;
  d.w = d.b - d.a;
}
export const door = (id) => DOORS.find((d) => d.id === id);
export const DOOR_INDEX = Object.fromEntries(DOORS.map((d, i) => [d.id, i]));

// the box a door fills while it's shut
export function doorBox(d) {
  const t = d.kind === 'gate' ? 0.08 : 0.12;
  const box = d.axis === 'x'
    ? { x0: d.a, x1: d.b, z0: d.at - t, z1: d.at + t }
    : { x0: d.at - t, x1: d.at + t, z0: d.a, z1: d.b };
  return { ...box, y0: 0, y1: d.h, door: d.id, see: d.kind === 'gate' || d.kind === 'glass' || d.kind === 'cage' };
}

// ------------------------------------------------------------------ walls
// Boxes { x0, x1, z0, z1, y0, y1, faces } where faces names the material
// on each side ({ n, s, e, w }; 'n' faces -z). `see`: you can see through
// it (glass, chain link).
export const WALLS = [];
{
  const push = (b) => { if (b.x1 - b.x0 > 1e-3 && b.z1 - b.z0 > 1e-3 && b.y1 - b.y0 > 1e-3) WALLS.push(b); };
  // a wall along x at z (thin in z); gaps [{ a, b, h }] (h: the opening's
  // height, with the wall closing over it above; null: open to the top)
  const wz = (z, x0, x1, { t = 0.3, y0 = 0, y1 = 7, gaps = [], n = 'block', s = 'block', see = false, top = null } = {}) => {
    const faces = { n, s, e: n, w: n, top };
    let x = x0;
    for (const g of [...gaps].sort((p, q) => p.a - q.a)) {
      push({ x0: x, x1: g.a, z0: z - t / 2, z1: z + t / 2, y0, y1, faces, see });
      if (g.h != null && g.h < y1) push({ x0: g.a, x1: g.b, z0: z - t / 2, z1: z + t / 2, y0: Math.max(y0, g.h), y1, faces, header: true });
      if (g.sill) {
        // a window: wall up to the sill, glass from there to the top
        push({ x0: g.a, x1: g.b, z0: z - t / 2, z1: z + t / 2, y0, y1: g.sill, faces, see: true });
        push({ x0: g.a, x1: g.b, z0: z - 0.03, z1: z + 0.03, y0: g.sill, y1: g.h, faces: { n: 'glass', s: 'glass', e: 'glass', w: 'glass' }, see: true, glass: true });
      }
      x = g.b;
    }
    push({ x0: x, x1, z0: z - t / 2, z1: z + t / 2, y0, y1, faces, see });
  };
  // a wall along z at x (thin in x)
  const wx = (x, z0, z1, { t = 0.3, y0 = 0, y1 = 7, gaps = [], w = 'block', e = 'block', see = false, top = null } = {}) => {
    const faces = { w, e, n: w, s: w, top };
    let z = z0;
    for (const g of [...gaps].sort((p, q) => p.a - q.a)) {
      push({ x0: x - t / 2, x1: x + t / 2, z0: z, z1: g.a, y0, y1, faces, see });
      if (g.h != null && g.h < y1) push({ x0: x - t / 2, x1: x + t / 2, z0: g.a, z1: g.b, y0: Math.max(y0, g.h), y1, faces, header: true });
      z = g.b;
    }
    push({ x0: x - t / 2, x1: x + t / 2, z0: z, z1, y0, y1, faces, see });
  };
  const gap = (id) => { const d = door(id); return { a: d.a, b: d.b, h: d.h }; };
  const sm = (id) => `store:${id}`;

  // ---- the shops: storefronts, dividing walls, back walls
  for (const s of STORES) {
    const out = s.side === 'n' ? { n: sm(s.id), s: 'pilaster' } : { n: 'pilaster', s: sm(s.id) };
    wz(s.front, s.x0, s.x1, { t: 0.4, y1: 7, gaps: [gap(s.id)], ...out });
  }
  for (const side of ['n', 's']) {
    const row = STORES.filter((s) => s.side === side);
    const z0 = side === 'n' ? -17.25 : 6, z1 = side === 'n' ? -6 : 17.25;
    for (let i = 0; i < row.length - 1; i++) {
      const L = row[i], R = row[i + 1];
      if (L.x1 !== R.x0) continue;
      wx(L.x1, z0, z1, { w: sm(L.id), e: sm(R.id), y1: 7 });
    }
  }
  // north shops' back wall is the corridor's south wall (with the
  // restroom hall and the food court service hall opening off it)
  for (const s of STORES.filter((q) => q.side === 'n')) {
    const backDoor = DOORS.find((d) => d.id === `${s.id}back`);
    wz(-17.25, s.x0, s.x1, { t: 0.5, y1: 7, n: 'block', s: sm(s.id), gaps: backDoor ? [gap(backDoor.id)] : [] });
  }
  wz(-17.25, -10, 10, { t: 0.5, y1: 3.2, n: 'block', s: 'tile', gaps: [{ a: -1.75, b: 1.75, h: 2.4 }] });
  wz(-17.25, 42, 56, { t: 0.5, y1: 3.2, n: 'block', s: 'block' });
  // south shops' back wall is the outside of the building
  for (const s of STORES.filter((q) => q.side === 's')) wz(17.25, s.x0, s.x1, { t: 0.5, y1: 7, n: sm(s.id), s: 'brick' });

  // ---- the centre court
  wz(-10, -10, 10, { y1: 11, n: 'tile', s: 'mall', gaps: [{ a: -1.75, b: 1.75, h: 3.0 }] });
  wz(10, -10, 10, { y1: 11, n: 'mall', s: 'brick', gaps: [{ a: -4, b: 4, h: 3.5 }] });
  wx(-10, -17.25, -10, { w: sm('N4'), e: 'tile', y1: 7 });
  wx(-10, -10, -6, { w: sm('N4'), e: 'mall', y1: 11 });
  wx(-10, 6, 10, { w: sm('S4'), e: 'mall', y1: 11 });
  wx(-10, 10, 17.25, { w: sm('S4'), e: 'brick', y1: 7 });
  wx(10, -17.25, -10, { w: 'tile', e: sm('N5'), y1: 7 });
  wx(10, -10, -6, { w: 'mall', e: sm('N5'), y1: 11 });
  wx(10, 6, 10, { w: 'mall', e: sm('S5'), y1: 11 });
  wx(10, 10, 17.25, { w: 'brick', e: sm('S5'), y1: 7 });
  // the court is taller than the concourse: bulkheads over where they meet
  wx(-10, -6, 6, { y0: 7, y1: 11, w: 'mall', e: 'mall' });
  wx(10, -6, 6, { y0: 7, y1: 11, w: 'mall', e: 'mall' });
  // the south entrance's vestibule
  wx(-4, 10, 15, { y1: 3.5, w: 'brick', e: 'mall' });
  wx(4, 10, 15, { y1: 3.5, w: 'mall', e: 'brick' });
  wz(15, -4, 4, { y1: 3.5, n: 'mall', s: 'brick', gaps: [gap('south')] });

  // ---- restrooms
  wx(-1.75, -17.25, -10, { t: 0.2, y1: 3.2, w: 'tile', e: 'mall', gaps: [{ a: -14.6, b: -13.4, h: 2.2 }] });
  wx(1.75, -17.25, -10, { t: 0.2, y1: 3.2, w: 'mall', e: 'tile', gaps: [{ a: -14.6, b: -13.4, h: 2.2 }] });

  // ---- the food court
  wx(40, -17.25, -13, { y1: 3.2, w: sm('N8'), e: 'block' });
  wx(40, -13, -6, { y1: 8.5, w: sm('N8'), e: 'food' });
  wx(40, 6, 13, { y1: 8.5, w: sm('S8'), e: 'food' });
  wx(40, 13, 17.25, { y1: 7, w: sm('S8'), e: 'brick' });
  wx(40, -6, 6, { y0: 7, y1: 8.5, w: 'mall', e: 'food' });
  wx(42, -17.25, -13, { t: 0.3, y1: 3.2, w: 'block', e: 'block' });
  wz(-13, 40, 62, { y1: 8.5, n: 'block', s: 'food', gaps: [gap('fcHall')] });
  wz(13, 40, 62, { y1: 8.5, n: 'food', s: 'brick' });
  wx(62, -13, 13, { y1: 8.5, w: 'food', e: 'brick', gaps: [{ a: -3, b: 3, h: 3.5 }] });
  wz(-3, 62, 66, { y1: 3.5, n: 'brick', s: 'mall' });
  wz(3, 62, 66, { y1: 3.5, n: 'mall', s: 'brick' });
  wx(66, -3, 3, { y1: 3.5, w: 'mall', e: 'brick', gaps: [gap('east')] });
  // the counters: dividers and the fronts over their grilles
  for (const side of ['n', 's']) {
    const row = STALLS.filter((s) => s.side === side);
    const zf = side === 'n' ? -9 : 9, zb = side === 'n' ? -13 : 13;
    for (const x of [44, 49, 54, 59]) wx(x, Math.min(zf, zb), Math.max(zf, zb), { t: 0.25, y1: 3.6, w: 'counter', e: 'counter' });
    wz(zf, 44, 59, { t: 0.3, y1: 3.6, n: side === 'n' ? 'counter' : 'food', s: side === 'n' ? 'food' : 'counter', gaps: row.map((s) => gap(s.id)) });
  }

  // ---- the service corridor and the back rooms
  wz(-20.75, -40, -22, { t: 0.5, y1: 3.2, n: 'block', s: 'block' });
  wz(-20.75, -22, -16, { t: 0.5, y1: 3.2, n: 'block', s: 'block', gaps: [gap('janitor')] });
  wz(-20.75, -16, -7, { t: 0.5, y1: 3.2, n: 'block', s: 'block', gaps: [gap('electrical')] });
  wz(-20.75, -7, 7, { t: 0.5, y1: 3.2, n: 'office', s: 'block', gaps: [gap('security'), { a: 2.2, b: 4.8, h: 2.0, sill: 1.0 }] });
  wz(-20.75, 7, 15, { t: 0.5, y1: 3.2, n: 'office', s: 'block', gaps: [gap('office')] });
  wz(-20.75, 15, 23, { t: 0.5, y1: 3.2, n: 'office', s: 'block', gaps: [gap('breakroom')] });
  wz(-20.75, 23, 30, { t: 0.5, y1: 3.2, n: 'block', s: 'block' });
  wz(-20.75, 30, 44, { t: 0.5, y1: 5, n: 'block', s: 'block', gaps: [{ a: 35, b: 39, h: 3.0 }] });
  wz(-20.75, 44, 56, { t: 0.5, y1: 3.2, n: 'block', s: 'block', gaps: [gap('freezer')] });
  wx(56, -20.75, -17.25, { y1: 3.2 });
  wz(-28.25, -22, 23, { t: 0.5, y1: 3.2, n: 'brick', s: 'block' });
  wx(-22, -28, -20.75, { y1: 3.2 });
  wx(-16, -28, -20.75, { y1: 3.2 });
  wx(-7, -28, -20.75, { y1: 3.2, w: 'block', e: 'office' });
  wx(7, -28, -20.75, { y1: 3.2, w: 'office', e: 'office' });
  wx(15, -28, -20.75, { y1: 3.2, w: 'office', e: 'office' });
  wx(23, -28, -20.75, { y1: 3.2, w: 'office', e: 'block' });
  // the dock
  wx(30, -31.25, -20.75, { y1: 5 });
  wx(44, -31.25, -20.75, { y1: 5 });
  wz(-31.25, 30, 44, { t: 0.5, y1: 5, n: 'brick', s: 'block', gaps: [{ ...gap('dockDoor') }] });
  // the freight elevator's shaft, on the dock's west side
  wz(-27, 30, 33.3, { t: 0.25, y1: 5, n: 'block', s: 'steel' });
  wz(-23.5, 30, 33.3, { t: 0.25, y1: 5, n: 'steel', s: 'block' });
  wx(33.3, -27, -23.5, { t: 0.15, y0: 2.6, y1: 5, w: 'steel', e: 'block' });
  wx(33.3, -27, -26.4, { t: 0.15, y1: 2.6, w: 'steel', e: 'block' });
  wx(33.3, -24.1, -23.5, { t: 0.15, y1: 2.6, w: 'steel', e: 'block' });
  // the freezer
  wx(50, -25.25, -20.75, { y1: 3.2, w: 'block', e: 'steel' });
  wx(56, -25.25, -20.75, { y1: 3.2, w: 'steel', e: 'block' });
  wz(-25.25, 50, 56, { y1: 3.2, n: 'block', s: 'steel' });

  // ---- Halvorsen's
  wx(-40, -22, -17.25, { y1: 5.5, w: 'block', e: 'block', gaps: [gap('halvBack')] });
  wx(-40, -17.25, -13, { y1: 7, w: 'block', e: sm('N1') });
  wx(-40, -13, -6, { y1: 7, w: 'halv', e: sm('N1') });
  wx(-40, 6, 17.25, { y1: 7, w: 'halv', e: sm('S1') });
  // the front onto the concourse: the main gate between two display windows
  wx(-40, -6, -3.5, { t: 0.2, y0: 0, y1: 0.6, w: 'halv', e: 'pilaster' });
  wx(-40, 3.5, 6, { t: 0.2, y0: 0, y1: 0.6, w: 'halv', e: 'pilaster' });
  wx(-40, -6, -3.5, { t: 0.06, y0: 0.6, y1: 3.6, see: true, w: 'glass', e: 'glass' });
  wx(-40, 3.5, 6, { t: 0.06, y0: 0.6, y1: 3.6, see: true, w: 'glass', e: 'glass' });
  for (const w of WALLS.slice(-2)) w.glass = true;
  wx(-40, -6, 6, { t: 0.4, y0: 3.6, y1: 7, w: 'halv', e: 'pilaster' });
  wz(-22.25, -64, -40, { t: 0.5, y1: 5.5, n: 'brick', s: 'halv' });
  wz(17.5, -64, -40, { t: 0.5, y1: 7, n: 'halv', s: 'brick' });
  wx(-64.25, -22, 17.5, { t: 0.5, y1: 5.5, w: 'brick', e: 'halv', gaps: [gap('halvWest')] });
  // the stockroom in its north-east corner, and the cage inside it
  wz(-13, -52, -40, { t: 0.25, y1: 5.5, n: 'block', s: 'halv', gaps: [gap('stockFloor')] });
  wx(-52, -22, -13, { t: 0.25, y1: 5.5, w: 'halv', e: 'block' });
  wx(-47, -22, -17.5, { t: 0.06, y1: 2.6, see: true, w: 'chain', e: 'chain', gaps: [{ ...gap('cage'), h: null }] });
  wz(-17.5, -52, -47, { t: 0.06, y1: 2.6, see: true, n: 'chain', s: 'chain' });
  // fitting rooms in the south-west corner
  wz(11.5, -64, -58, { t: 0.15, y1: 2.4, n: 'halv', s: 'halv', gaps: [{ a: -63.2, b: -62.2, h: 2.4 }, { a: -61.2, b: -60.2, h: 2.4 }, { a: -59.2, b: -58.2, h: 2.4 }] });
  for (const x of [-62, -60]) wx(x, 11.5, 17.25, { t: 0.1, y1: 2.4, w: 'halv', e: 'halv' });
  wx(-58, 11.5, 17.25, { t: 0.15, y1: 2.4, w: 'halv', e: 'halv' });
}

// ------------------------------------------------------------- furniture
// Props: { type, x, z, rot (quarter turns), w, d, h, solid, ... }.
// Everything faces +z at rot 0. Solid props block people (by their
// footprint); low ones don't block the view.
export const PROPS = [];
{
  const P = (type, x, z, o = {}) => PROPS.push({ type, x, z, rot: 0, solid: true, ...o });
  const rng = makeRng('kingsgate-props');

  // ---- centre court
  P('fountain', 0, 0, { w: 6.4, d: 6.4, h: 0.8, low: true });
  for (const [x, z, r] of [[-6.5, 4.5, 1], [6.5, 4.5, 3], [-6.5, -4.5, 1], [6.5, -4.5, 3]]) P('bench', x, z, { rot: r, w: 2.0, d: 0.7, h: 0.5, low: true });
  for (const [x, z] of [[-8.6, 8.6], [8.6, 8.6]]) P('planter', x, z, { w: 1.6, d: 1.6, h: 0.8, low: true });
  // escalators up to the closed upper level, against the north wall
  P('escalator', -6.2, -6.0, { rot: 0, w: 1.4, d: 7.2, h: 5.5 });
  P('escalator', 6.2, -6.0, { rot: 0, w: 1.4, d: 7.2, h: 5.5 });
  P('directory', -3.8, 7.6, { w: 1.2, d: 0.4, h: 2.2 });
  P('kiosk', 3.9, 7.2, { w: 2.2, d: 1.3, h: 1.1, low: true, sign: 'SUNGLASS SHACK' });
  P('payphones', -9.6, 2.5, { rot: 1, w: 1.8, d: 0.45, h: 2.0 });

  // ---- the concourse: benches, planters, a cart
  for (const x of [-34, -22, 22, 34]) {
    P('planter', x, 0, { w: 2.4, d: 1.4, h: 0.75, low: true, palm: true });
    P('bench', x - 3.2, 0, { rot: 0, w: 1.8, d: 0.65, h: 0.5, low: true });
    P('bench', x + 3.2, 0, { rot: 2, w: 1.8, d: 0.65, h: 0.5, low: true });
  }
  P('cart', -15.5, 1.4, { w: 2.4, d: 1.3, h: 1.2, low: true, sign: 'PRETZEL PALACE' });
  P('cart', 15.5, -1.4, { rot: 2, w: 2.4, d: 1.3, h: 1.2, low: true, sign: 'CELL PHONES' });
  for (const x of [-27.5, -12.5, 12.5, 27.5]) for (const z of [-5.2, 5.2]) P('trash', x, z, { w: 0.55, d: 0.55, h: 0.9, low: true });

  // ---- food court
  P('carousel', 52, 0, { w: 7.6, d: 7.6, h: 4.5, round: 3.8 });
  for (const [x, z] of [[44.5, -5.5], [44.5, 5.5], [59.5, -5.5], [59.5, 5.5], [47.5, -6.6], [56.5, 6.6], [56.5, -6.6], [47.5, 6.6], [44.5, 0], [59.5, 0]]) {
    P('table', x, z, { w: 1.5, d: 1.5, h: 0.75, low: true, seed: Math.floor(rng() * 9) });
  }
  for (const [x, z] of [[41.5, -10.5], [60.5, 10.5]]) P('trash', x, z, { w: 0.55, d: 0.55, h: 0.9, low: true });

  // ---- the shops
  for (const s of STORES) {
    const { x0, x1, z0, z1 } = s, dz = s.inward, front = s.front, back = s.side === 'n' ? z0 : z1;
    const midX = s.cx, wallX0 = x0 + 0.5, wallX1 = x1 - 0.5;
    const along = (k) => front + dz * k;           // k metres in from the gate
    const backWall = (type, o) => P(type, midX, back - dz * 0.4, { rot: s.side === 'n' ? 0 : 2, w: x1 - x0 - 1.2, d: 0.6, h: 2.2, ...o });
    const sideWalls = (type, o) => {
      P(type, wallX0, (front + back) / 2 + dz * 0.6, { rot: 1, w: Math.abs(back - front) - 3.4, d: 0.6, h: 2.2, ...o });
      P(type, wallX1, (front + back) / 2 + dz * 0.6, { rot: 3, w: Math.abs(back - front) - 3.4, d: 0.6, h: 2.2, ...o });
    };
    const counter = (o) => P('counter', x1 - 2.0, back - dz * 2.4, { rot: s.side === 'n' ? 0 : 2, w: 2.6, d: 0.8, h: 1.05, low: true, ...o });
    switch (s.type) {
      case 'records':
        sideWalls('shelf', { stock: 'records' });
        for (const k of [3.4, 6.2]) P('recordBin', midX, along(k), { w: 3.2, d: 1.0, h: 0.95, low: true });
        counter({ register: true });
        break;
      case 'jewelry':
        for (const [dx, k] of [[-1.8, 2.6], [1.8, 2.6], [-1.8, 6], [1.8, 6]]) P('glassCase', midX + dx, along(k), { w: 2.2, d: 0.8, h: 1.0, low: true });
        backWall('shelf', { stock: 'velvet' });
        break;
      case 'photo':
        P('counter', midX, along(3.2), { w: 4.6, d: 0.8, h: 1.05, low: true, register: true });
        P('photoMachine', x0 + 1.6, back - dz * 1.4, { rot: s.side === 'n' ? 0 : 2, w: 2.2, d: 1.2, h: 1.6 });
        sideWalls('shelf', { stock: 'film' });
        break;
      case 'shoes':
        sideWalls('shelf', { stock: 'shoes' });
        backWall('shelf', { stock: 'shoes' });
        for (const k of [3.5, 6.5]) P('bench', midX, along(k), { w: 1.8, d: 0.55, h: 0.45, low: true, rot: 0 });
        break;
      case 'video':
        sideWalls('shelf', { stock: 'videos' });
        for (const k of [3.6, 6.8]) P('gondola', midX, along(k), { w: 3.4, d: 0.9, h: 1.6, stock: 'videos' });
        counter({ register: true });
        break;
      case 'arcade':
        for (let i = 0; i < 3; i++) P('arcade', x0 + 1.0 + i * 1.75, back - dz * 0.6, { rot: s.side === 'n' ? 0 : 2, w: 0.75, d: 0.8, h: 1.85, seed: i });
        for (let i = 0; i < 3; i++) P('arcade', wallX0 + 0.1, along(2.6 + i * 1.6), { rot: 1, w: 0.75, d: 0.8, h: 1.85, seed: i + 4 });
        for (let i = 0; i < 3; i++) P('arcade', wallX1 - 0.1, along(2.6 + i * 1.6), { rot: 3, w: 0.75, d: 0.8, h: 1.85, seed: i + 7 });
        P('prize', midX, along(4.2), { w: 1.4, d: 1.1, h: 1.9 });
        break;
      case 'electronics':
        backWall('tvWall', { h: 2.6 });
        for (const k of [3.4, 6.4]) P('gondola', midX, along(k), { w: 3.4, d: 0.9, h: 1.5, stock: 'boxes' });
        P('counter', wallX0 + 0.9, along(2.4), { rot: 1, w: 2.4, d: 0.8, h: 1.05, low: true, register: true });
        break;
      case 'books':
        sideWalls('shelf', { stock: 'books' });
        backWall('shelf', { stock: 'books' });
        for (const k of [3.4, 6.2]) P('table', midX, along(k), { w: 2.2, d: 1.1, h: 0.8, low: true, books: true });
        break;
      case 'boutique':
        for (const [dx, k] of [[-1.5, 3.4], [1.5, 3.4], [-1.5, 6.6], [1.5, 6.6]]) P('rack', midX + dx, along(k), { w: 1.5, d: 0.6, h: 1.5, seed: Math.floor(rng() * 9) });
        sideWalls('shelf', { stock: 'folded' });
        counter({ register: true });
        break;
      case 'toys':
        sideWalls('shelf', { stock: 'toys' });
        for (const k of [3.4, 6.4]) P('gondola', midX, along(k), { w: 3.4, d: 0.9, h: 1.5, stock: 'toys' });
        break;
      case 'pretzel':
        P('counter', midX, along(2.6), { w: 5.4, d: 0.9, h: 1.05, low: true, register: true, oven: true });
        backWall('shelf', { stock: 'kitchen' });
        break;
      case 'cards':
        sideWalls('shelf', { stock: 'cards' });
        for (const k of [3.4, 6.4]) P('gondola', midX, along(k), { w: 3.0, d: 0.8, h: 1.5, stock: 'cards' });
        counter({ register: true });
        break;
      case 'pharmacy':
        for (const k of [2.8, 5.2]) P('gondola', midX, along(k), { w: 3.6, d: 0.9, h: 1.6, stock: 'pharmacy' });
        P('counter', midX, back - dz * 2.0, { w: 5.0, d: 0.8, h: 1.05, low: true, register: true });
        backWall('shelf', { stock: 'pharmacy' });
        break;
      case 'clothes':
        for (const [dx, k] of [[-1.6, 3.2], [1.6, 3.2], [-1.6, 6.2], [1.6, 6.2]]) P('rack', midX + dx, along(k), { w: 1.5, d: 0.6, h: 1.5, seed: Math.floor(rng() * 9) });
        sideWalls('shelf', { stock: 'folded' });
        break;
      case 'vacant':
        P('boxes', midX + 1.5, back - dz * 1.5, { w: 1.4, d: 1.2, h: 1.2 });
        P('ladder', midX - 1.8, along(4.5), { w: 0.6, d: 1.2, h: 2.2, low: true, solid: false });
        break;
      case 'closing':
        for (const k of [3.4, 6.4]) P('gondola', midX, along(k), { w: 3.4, d: 0.9, h: 1.4, stock: 'sparse' });
        P('boxes', x0 + 1.2, back - dz * 1.2, { w: 1.4, d: 1.2, h: 1.0 });
        break;
    }
  }
  // food counters
  for (const s of STALLS) P('foodCounter', s.cx, s.front + (s.side === 'n' ? -1.2 : 1.2), { rot: s.side === 'n' ? 0 : 2, w: s.x1 - s.x0 - 0.8, d: 0.8, h: 1.05, low: true, stall: s.id });

  // ---- Halvorsen's: cosmetics by the door, clothing beyond, the dead escalator
  for (const [x, z, r] of [[-44, -6.5, 0], [-44, 6.5, 0], [-47.5, -9, 1], [-47.5, 9, 1]]) P('glassCase', x, z, { rot: r, w: 2.6, d: 0.8, h: 1.0, low: true, perfume: true });
  for (const [x, z] of [[-50, -3], [-50, 3], [-56, -5], [-56, 5], [-56, 11], [-50, 11], [-60, -8], [-60, 2], [-46, 12.5], [-58, -16], [-55, -19]]) {
    P('rack', x, z, { rot: Math.floor(rng() * 2), w: 1.5, d: 0.6, h: 1.5, seed: Math.floor(rng() * 9), dusty: true });
  }
  P('escalator', -52.5, -6.5, { rot: 0, w: 1.5, d: 8, h: 5.2, dead: true });
  P('shelf', -63.5, -4, { rot: 1, w: 6, d: 0.6, h: 2.2, stock: 'folded' });
  P('shelf', -63.5, 6, { rot: 1, w: 6, d: 0.6, h: 2.2, stock: 'folded' });
  P('counter', -60, -12, { rot: 0, w: 3, d: 0.8, h: 1.05, low: true, register: true });
  // the stockroom
  P('boxes', -50.5, -15, { w: 1.6, d: 1.2, h: 1.4 });
  P('boxes', -42, -21, { w: 1.8, d: 1.2, h: 1.2 });
  P('shelf', -42.5, -15.2, { rot: 3, w: 3.2, d: 0.6, h: 2.4, stock: 'boxes' });
  P('mannequinParts', -44.5, -20.8, { w: 1.6, d: 1.0, h: 0.6, low: true });
  P('cot', -50.6, -20.4, { rot: 1, w: 1.9, d: 0.8, h: 0.45, low: true, solid: false });

  // ---- the back rooms
  // security office (x -7..7, z -28..-20.75)
  P('cctvDesk', 0, -27.0, { w: 6.4, d: 1.1, h: 1.0, low: true });
  P('monitorBank', 0, -27.75, { w: 5.6, d: 0.6, h: 2.6 });
  P('alarmPanel', -6.75, -25.4, { rot: 1, w: 2.2, d: 0.15, h: 1.3, y: 1.0, solid: false });
  P('desk', -4.6, -22.6, { rot: 2, w: 2.2, d: 0.9, h: 0.76, low: true, logbook: true });
  P('officeChair', -4.6, -23.6, { solid: false });
  P('officeChair', 0, -25.8, { rot: 2, solid: false });
  P('watchclock', -6.75, -22.4, { rot: 1, w: 0.6, d: 0.3, h: 0.5, y: 1.0, solid: false });
  P('keyCabinet', -5.4, -27.9, { w: 0.9, d: 0.2, h: 1.1, y: 1.1, solid: false });
  P('lockers', 6.55, -26.1, { rot: 3, w: 2.6, d: 0.5, h: 1.9, n: 4, daleAt: 2 });
  P('coffee', 5.0, -22.0, { rot: 2, w: 1.4, d: 0.6, h: 0.9, low: true });
  // mall office (x 7..15)
  P('desk', 11, -26.6, { w: 2.2, d: 0.9, h: 0.76, low: true, pa: true });
  P('safe', 14.4, -27.4, { rot: 3, w: 0.8, d: 0.8, h: 1.1 });
  P('filing', 7.6, -27.4, { rot: 1, w: 0.9, d: 0.6, h: 1.4 });
  P('lostFound', 13.6, -22.0, { rot: 2, w: 1.2, d: 0.6, h: 0.7, low: true });
  // electrical room (x -16..-7)
  P('breakerPanel', -11.5, -27.85, { w: 3.2, d: 0.3, h: 1.8, y: 0.4 });
  P('boxes', -15.2, -22.0, { w: 1.0, d: 1.0, h: 0.8 });
  // janitor (x -22..-16)
  P('mopSink', -21.2, -27.2, { w: 1.0, d: 0.8, h: 0.9, low: true });
  P('shelf', -16.6, -24.5, { rot: 3, w: 3.0, d: 0.5, h: 2.0, stock: 'cleaning' });
  // break room (x 15..23)
  P('table', 19, -24.5, { w: 1.6, d: 1.0, h: 0.75, low: true, seed: 3 });
  P('vending', 22.4, -26.6, { rot: 3, w: 1.0, d: 0.9, h: 1.9 });
  P('fridge', 15.6, -27.3, { rot: 1, w: 0.8, d: 0.75, h: 1.8 });
  P('lockers', 22.55, -22.6, { rot: 3, w: 1.4, d: 0.5, h: 1.9, n: 2 });
  // dock
  P('boxes', 42.5, -29.5, { w: 1.6, d: 1.3, h: 1.6 });
  P('boxes', 40.8, -22.4, { w: 1.4, d: 1.1, h: 1.0 });
  P('pallet', 37.0, -26.5, { w: 1.2, d: 1.0, h: 0.9 });
  P('dumpster', 31.6, -29.8, { w: 2.2, d: 1.2, h: 1.3 });
  // freezer
  P('shelf', 51.1, -23.2, { rot: 1, w: 3.6, d: 0.6, h: 2.0, stock: 'frozen' });
  P('shelf', 54.9, -23.2, { rot: 3, w: 3.6, d: 0.6, h: 2.0, stock: 'frozen' });
  // restrooms: sinks and stalls
  for (const sx of [-1, 1]) {
    P('sinks', sx * 3.2, -10.7, { rot: 0, w: 2.6, d: 0.6, h: 0.9, low: true });
    P('stalls', sx * 5.8, -16.15, { w: 4.8, d: 1.8, h: 2.0, mirror: sx < 0 });
  }
  // service corridor clutter
  P('boxes', -30, -20.0, { w: 1.0, d: 0.9, h: 0.9 });
  P('cart2', 26.5, -19.8, { rot: 1, w: 0.7, d: 1.3, h: 1.0 });
}

// a prop's footprint, turned by its quarter turns
export function propBox(p) {
  const q = ((p.rot || 0) % 2 + 2) % 2;
  const w = q ? p.d : p.w, d = q ? p.w : p.d;
  return { x0: p.x - w / 2, x1: p.x + w / 2, z0: p.z - d / 2, z1: p.z + d / 2, y0: p.y || 0, y1: (p.y || 0) + (p.h || 1) };
}

// ----------------------------------------------------- things you can use
// the clock stations on the guard's round: turn the key in each one
export const STATIONS = [
  { n: 1, name: 'Station 1 · Service Corridor', x: -3.0, y: 1.35, z: -20.45, face: 's' },
  { n: 2, name: "Station 2 · Halvorsen's Front", x: -39.65, y: 1.35, z: -5.75, face: 's' },
  { n: 3, name: "Station 3 · Inside Halvorsen's", x: -44.0, y: 1.35, z: -12.85, face: 's' },
  { n: 4, name: 'Station 4 · Loading Dock', x: 43.75, y: 1.35, z: -25.0, face: 'w' },
  { n: 5, name: 'Station 5 · Food Court', x: 61.75, y: 1.35, z: 8.0, face: 'w' },
  { n: 6, name: 'Station 6 · South Entrance', x: -3.75, y: 1.35, z: 12.5, face: 'e' },
];

// the security cameras, as numbered on the office monitors
export const CAMERAS = [
  { n: 1, name: 'CENTER COURT', pos: [9.2, 6.6, 9.2], look: [-3, 0.5, -3] },
  { n: 2, name: 'WEST CONCOURSE', pos: [-11, 6.2, -5.4], look: [-40, 0.8, 1.5] },
  { n: 3, name: 'EAST CONCOURSE', pos: [11, 6.2, 5.4], look: [40, 0.8, -1.5] },
  { n: 4, name: 'FOOD COURT', pos: [61.3, 7.6, -12.4], look: [45, 0, 6] },
  { n: 5, name: "HALVORSEN'S", pos: [-41, 5.0, -12.3], look: [-56, 0, 4] },
  { n: 6, name: 'SERVICE CORRIDOR', pos: [-39.4, 2.9, -17.6], look: [0, 1.0, -19.6] },
  { n: 7, name: 'LOADING DOCK', pos: [43.4, 4.4, -21.3], look: [33, 0, -29] },
  { n: 8, name: 'SOUTH LOT', pos: [-9, 5.4, 17.8], look: [6, 0, 29] },
];

// hiding places: get in, shut the door, keep still
export const HIDES = [
  { id: 'locker1', name: 'a locker', x: 22.55, z: -22.25, face: 'w', y: 0 },
  { id: 'locker2', name: 'a locker', x: 22.55, z: -22.95, face: 'w', y: 0 },
  { id: 'stallW', name: 'a stall', x: -7.4, z: -16.3, face: 's', y: 0 },
  { id: 'stallM', name: 'a stall', x: 7.4, z: -16.3, face: 's', y: 0 },
  { id: 'fit1', name: 'a fitting room', x: -62.7, z: 14.5, face: 'n', y: 0 },
  { id: 'fit2', name: 'a fitting room', x: -59.0, z: 14.5, face: 'n', y: 0 },
  { id: 'janitorHide', name: 'behind the shelves', x: -17.4, z: -27.2, face: 's', y: 0 },
];

// the mannequins' places in Halvorsen's windows and on its display
// platforms (and two in Belle Mode's window): [x, z, facing (radians)]
export const MANNEQUIN_HOMES = [
  [-41.2, -5.3, -Math.PI / 2], [-41.6, -4.3, -Math.PI / 2 + 0.3],
  [-41.2, 4.4, -Math.PI / 2], [-41.6, 5.3, -Math.PI / 2 - 0.25], [-42.2, 4.85, -Math.PI / 2],
  [-47.0, -1.0, -Math.PI / 2], [-47.0, 1.2, -Math.PI / 2 - 0.4],
  [-54.0, 9.8, 0.4], [-55.2, 10.6, -0.2],
  [-58.5, -9.6, Math.PI / 2], [-58.5, -11.0, Math.PI / 2 + 0.3],
  [-36.5, 7.2, Math.PI], [-35.0, 7.4, Math.PI - 0.3],
];
// the one in a security guard's uniform, in the middle of the north window
export const UNIFORM_HOME = [-42.0, -4.8, -Math.PI / 2 - 0.2];

// display platforms the window mannequins stand on (low, walk-on-able)
export const PLATFORMS = [
  { x0: -43, x1: -40.2, z0: -6, z1: -3.6 },
  { x0: -43, x1: -40.2, z0: 3.6, z1: 6 },
  { x0: -48, x1: -46, z0: -1.8, z1: 2 },
  { x0: -56, x1: -53.2, z0: 9, z1: 11.4 },
  { x0: -59.4, x1: -57.6, z0: -12, z1: -8.8 },
];

// where Dale might be hiding (one per night, chosen by the seed)
export const DALE_SPOTS = {
  cage: { x: -50.0, z: -19.6, door: 'cage', room: "Halvorsen's stockroom", report: 2 },
  freezer: { x: 53.0, z: -23.6, door: 'freezer', room: 'the walk-in freezer', report: 3 },
  elevator: { x: 31.6, z: -25.2, door: 'elevator', room: 'the freight elevator', report: 4 },
};

// Things you can use, and where. The host checks you're close enough; the
// client shows the prompt for whichever one you're looking at.
export const SPOTS = {
  monitors: { x: 0, y: 1.25, z: -27.3, r: 1.2 },
  alarmPanel: { x: -6.6, y: 1.65, z: -25.4, r: 0.7 },
  logbook: { x: -4.4, y: 0.82, z: -22.5, r: 0.3 },
  watchclock: { x: -6.55, y: 1.25, z: -22.4, r: 0.3 },
  vcr: { x: 2.4, y: 1.08, z: -26.9, r: 0.25 },
  keyCabinet: { x: -5.4, y: 1.65, z: -27.75, r: 0.4 },
  locker: { x: 6.25, y: 1.3, z: -25.78, r: 0.3 },
  radio: { x: -1.6, y: 1.12, z: -26.75, r: 0.25 },
  breaker: { x: -11.5, y: 1.3, z: -27.65, r: 1.5 },
  pa: { x: 11.4, y: 0.95, z: -26.5, r: 0.35 },
  lostFound: { x: 13.6, y: 0.8, z: -22.0, r: 0.45 },
  photos: { x: -20.4, y: 1.1, z: -9.2, r: 0.3 },
  inventory: { x: -43.0, y: 1.4, z: -13.2, r: 0.3 },
  car: { x: 0, y: 1.3, z: 14.85, r: 1.1 },
  uniform: { x: UNIFORM_HOME[0], y: 1.5, z: UNIFORM_HOME[1], r: 0.5 },
  cot: { x: -50.6, y: 0.5, z: -20.4, r: 0.5 },
  carousel: { x: 52, y: 1.0, z: 3.95, r: 0.6 },
};
for (const s of STATIONS) SPOTS[`station${s.n}`] = { x: s.x, y: s.y, z: s.z, r: 0.3 };
for (const h of HIDES) SPOTS[`hide:${h.id}`] = { x: h.x, y: 1.0, z: h.z, r: 0.5 };

// where everyone stands when the manager hands over the keys
export const START_SPOTS = [[-2.2, 5.6], [-0.7, 6.3], [0.8, 6.3], [2.3, 5.6]].map(([x, z]) => ({ x, z, ry: Math.atan2(x - 0, z - 1.5) }));
export const MANAGER_SPOT = { x: 0, z: 3.4 };
export const OFFICE_SPOT = { x: 0, z: -24.4 };

// the breakers in the electrical room, in order on the panel
export const BREAKERS = [
  { id: 'concourse', name: 'CONCOURSE' },
  { id: 'court', name: 'CENTER COURT' },
  { id: 'food', name: 'FOOD COURT' },
  { id: 'stores', name: 'TENANT SPACES' },
  { id: 'back', name: 'SERVICE / BACK' },
  { id: 'cams', name: 'CCTV / ALARM' },
];

// --------------------------------------------------------------- solids
// everything that stops you: walls and solid props (low ones only stop
// legs; they don't hide anyone)
export function staticSolids() {
  const out = [];
  for (const w of WALLS) if (w.y0 < 2.0) out.push({ x0: w.x0, x1: w.x1, z0: w.z0, z1: w.z1, y0: w.y0, y1: w.y1, see: !!w.see || w.y1 < 1.6 });
  for (const p of PROPS) {
    if (!p.solid) continue;
    if (p.type === 'fountain') {
      for (const [w, d] of [[6.4, 2.6], [2.6, 6.4], [4.6, 4.6]]) out.push({ x0: p.x - w / 2, x1: p.x + w / 2, z0: p.z - d / 2, z1: p.z + d / 2, y0: 0, y1: 0.8, see: true });
      continue;
    }
    if (p.round) {
      const r = p.round;
      for (const [w, d] of [[2 * r, r * 0.9], [r * 0.9, 2 * r], [1.5 * r, 1.5 * r]]) out.push({ x0: p.x - w / 2, x1: p.x + w / 2, z0: p.z - d / 2, z1: p.z + d / 2, y0: 0, y1: p.h, see: false });
      continue;
    }
    const b = propBox(p);
    if (b.y0 > 1.2) continue;
    out.push({ ...b, see: !!p.low || b.y1 < 1.6 });
  }
  for (const pl of PLATFORMS) out.push({ ...pl, y0: 0, y1: 0.25, see: true, platform: true });
  // the parking lots are out of bounds
  return out.filter((b) => !b.platform);
}

// ------------------------------------------------------------ collision
// Walls and solids in a coarse grid, so a step only checks what's near.
export class Solids {
  constructor(boxes) {
    this.cell = 4;
    this.grid = new Map();
    this.dynamic = [];
    for (const b of boxes) this.add(b);
  }

  add(b) {
    const c = this.cell;
    for (let ix = Math.floor(b.x0 / c); ix <= Math.floor(b.x1 / c); ix++) {
      for (let iz = Math.floor(b.z0 / c); iz <= Math.floor(b.z1 / c); iz++) {
        const k = ix * 100003 + iz;
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(b);
      }
    }
  }

  near(x, z, r) {
    const c = this.cell, out = new Set(this.dynamic);
    for (let ix = Math.floor((x - r) / c); ix <= Math.floor((x + r) / c); ix++) {
      for (let iz = Math.floor((z - r) / c); iz <= Math.floor((z + r) / c); iz++) {
        const l = this.grid.get(ix * 100003 + iz);
        if (l) for (const b of l) out.add(b);
      }
    }
    return out;
  }

  // push the circle at pos ({x, z}) out of everything it's in
  resolve(pos, r) {
    let hit = false;
    for (let pass = 0; pass < 2; pass++) {
      for (const b of this.near(pos.x, pos.z, r + 0.5)) {
        if (b.y0 > 1.3 || b.y1 < 0.2) continue;
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
}

// -------------------------------------------------- the grid the AI uses
// Half-metre squares over the whole floor. Each knows whether it's open
// floor, which door (if any) is in it, and whether it blocks the view.
// Sight lines walk the squares; paths are distance fields spread out from
// the goal, which every walker heading there can share.
export const GRID = { x0: -66, z0: -33, cell: 0.5, nx: 268, nz: 102 };

export class NavGrid {
  constructor(solids, { radius = 0.3 } = {}) {
    const G = GRID, n = G.nx * G.nz;
    this.n = n;
    this.walk = new Uint8Array(n);      // 1 open floor
    this.opaque = new Uint8Array(n);    // 1 blocks the view
    this.doorAt = new Int16Array(n).fill(-1);
    this.dist = new Float32Array(n);
    this.heap = new Int32Array(n * 4);
    this.heapD = new Float32Array(n * 4);
    for (let iz = 0; iz < G.nz; iz++) {
      for (let ix = 0; ix < G.nx; ix++) {
        const i = iz * G.nx + ix;
        const x = G.x0 + (ix + 0.5) * G.cell, z = G.z0 + (iz + 0.5) * G.cell;
        if (!roomAt(x, z)) continue;
        let open = true, opq = false;
        for (const b of solids.near(x, z, radius + 0.5)) {
          if (b.y0 > 1.3 || b.y1 < 0.2) continue;
          const cx = Math.max(b.x0, Math.min(x, b.x1)), cz = Math.max(b.z0, Math.min(z, b.z1));
          const d = Math.hypot(x - cx, z - cz);
          if (d < radius) open = false;
          // anything tall and solid in this square hides what's behind it
          const h = G.cell / 2;
          if (!b.see && b.y1 > 1.6 && x + h > b.x0 && x - h < b.x1 && z + h > b.z0 && z - h < b.z1) opq = true;
        }
        this.walk[i] = open ? 1 : 0;
        this.opaque[i] = opq ? 1 : 0;
      }
    }
    // the squares each door fills (open floor only while it's open)
    DOORS.forEach((d, k) => {
      const b = doorBox(d);
      const pad = radius;
      for (let iz = 0; iz < G.nz; iz++) {
        const z = G.z0 + (iz + 0.5) * G.cell;
        if (z < b.z0 - pad || z > b.z1 + pad) continue;
        for (let ix = 0; ix < G.nx; ix++) {
          const x = G.x0 + (ix + 0.5) * G.cell;
          if (x < b.x0 - pad || x > b.x1 + pad) continue;
          const i = iz * G.nx + ix;
          // only squares a walker fits through, not the frame either side
          const along = d.axis === 'x' ? x : z;
          if (along < d.a + 0.22 || along > d.b - 0.22) continue;
          this.doorAt[i] = k;
          this.walk[i] = 1;
        }
      }
    });
    this.doorOpaque = DOORS.map((d) => d.kind === 'door' || d.kind === 'rollup');
    this.doorShut = DOORS.map(() => true);
  }

  idx(x, z) {
    const G = GRID;
    const ix = Math.floor((x - G.x0) / G.cell), iz = Math.floor((z - G.z0) / G.cell);
    if (ix < 0 || iz < 0 || ix >= G.nx || iz >= G.nz) return -1;
    return iz * G.nx + ix;
  }
  cx(i) { return GRID.x0 + ((i % GRID.nx) + 0.5) * GRID.cell; }
  cz(i) { return GRID.z0 + (Math.floor(i / GRID.nx) + 0.5) * GRID.cell; }

  // is anything solid (or a shut door) between two points at eye height?
  los(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(d / 0.25);
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      const i = this.idx(ax + (bx - ax) * t, az + (bz - az) * t);
      if (i < 0) return false;
      if (this.opaque[i]) return false;
      const dk = this.doorAt[i];
      if (dk >= 0 && this.doorOpaque[dk] && this.doorShut[dk]) return false;
    }
    return true;
  }

  // Distances to (gx, gz) from everywhere reachable, for a walker that
  // can pass the doors pass(k) allows. Returns this.dist (shared: copy it
  // if you need to keep it).
  field(gx, gz, pass, maxD = 1e9) {
    const G = GRID, D = this.dist, nx = G.nx;
    D.fill(1e9);
    let g = this.idx(gx, gz);
    if (g < 0) return D;
    if (!this.walk[g]) g = this.nearestOpen(g);
    if (g < 0) return D;
    const H = this.heap, HD = this.heapD;
    let size = 0;
    const push = (i, d) => {
      let k = size++;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (HD[p] <= d) break;
        H[k] = H[p]; HD[k] = HD[p];
        k = p;
      }
      H[k] = i; HD[k] = d;
    };
    const pop = () => {
      const top = H[0];
      const last = H[--size], ld = HD[size];
      let k = 0;
      for (;;) {
        let c = 2 * k + 1;
        if (c >= size) break;
        if (c + 1 < size && HD[c + 1] < HD[c]) c++;
        if (HD[c] >= ld) break;
        H[k] = H[c]; HD[k] = HD[c];
        k = c;
      }
      H[k] = last; HD[k] = ld;
      return top;
    };
    D[g] = 0;
    push(g, 0);
    const ok = (i) => {
      if (!this.walk[i]) return false;
      const dk = this.doorAt[i];
      return dk < 0 || pass(dk);
    };
    while (size > 0) {
      const d0 = HD[0];
      const i = pop();
      if (d0 > D[i]) continue;
      if (d0 > maxD) break;
      const ix = i % nx, iz = (i - ix) / nx;
      for (let dz = -1; dz <= 1; dz++) {
        const jz = iz + dz;
        if (jz < 0 || jz >= G.nz) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const jx = ix + dx;
          if (jx < 0 || jx >= nx) continue;
          const j = jz * nx + jx;
          if (!ok(j)) continue;
          if (dx && dz && (!ok(iz * nx + jx) || !ok(jz * nx + ix))) continue;
          const nd = d0 + (dx && dz ? 1.4142 : 1) * G.cell;
          if (nd < D[j] && size < H.length - 1) { D[j] = nd; push(j, nd); }
        }
      }
    }
    return D;
  }

  nearestOpen(i) {
    const nx = GRID.nx;
    for (let r = 1; r < 6; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const j = i + dz * nx + dx;
          if (j >= 0 && j < this.n && this.walk[j]) return j;
        }
      }
    }
    return -1;
  }
}
