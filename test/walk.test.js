// Walks a guard around the mall with the same rules the game uses (the
// walls, the furniture, the doors, the guard's size) and checks the things
// that matter: you can get from the centre court to every room, every
// clock station and everything you can use; a locked gate keeps you out
// (and its key-holder in); and nothing you need is stuck inside a wall.
//
// usage: node test/walk.test.js

import { PLAYER_R, WALK, REACH } from '../public/js/shared/config.js';
import { Solids, NavGrid, staticSolids, doorBox, DOORS, DOOR_INDEX, ROOMS, STATIONS, SPOTS, HIDES, START_SPOTS, DALE_SPOTS, roomAt } from '../public/js/shared/mall.js';
import { follow, stepTo } from '../public/js/host/nav.js';

let failures = 0;
const check = (ok, what) => { if (!ok) { failures++; console.log('  FAIL:', what); } else console.log('  ok:', what); };

const solids = new Solids(staticSolids());
const nav = new NavGrid(solids, { radius: PLAYER_R + 0.04 });
const DT = 1 / 30;

// shut: the ids of doors that are shut (everything else is open)
function setDoors(shut) {
  solids.dynamic = DOORS.filter((d) => shut.has(d.id) || d.kind === 'glass' || d.kind === 'rollup').map((d) => doorBox(d));
}

// walk from p towards (gx, gz) the way the game's own walkers steer (down
// the grid's distance field, cutting corners only where it's clear), with
// a guard's size and the guard's collision; returns how close you got
function walk(p, gx, gz, pass, maxT = 120) {
  const D = Float32Array.from(nav.field(gx, gz, pass));
  const a = { x: p.x, z: p.z, ry: 0 };
  let t = 0, best = Infinity;
  while (t < maxT) {
    const d = Math.hypot(gx - a.x, gz - a.z);
    best = Math.min(best, d);
    if (d < 0.35) break;
    const r = follow(nav, solids, a, D, WALK, DT, PLAYER_R, pass, (k) => !pass(k));
    if (r.stuck || r.door >= 0) break;
    if (r.left < 0.3) { stepTo(solids, a, gx, gz, WALK, DT, PLAYER_R); }
    t += DT;
  }
  p.x = a.x; p.z = a.z;
  return best;
}

const allOpen = () => true;
const passShut = (shut) => (k) => !shut.has(DOORS[k].id) && DOORS[k].kind !== 'glass' && DOORS[k].kind !== 'rollup';

// ---- every room from the centre court, everything open
setDoors(new Set());
console.log('every room, from the fountain');
// (behind the food court counters is nobody's business)
for (const r of ROOMS.filter((q) => !q.id.startsWith('F'))) {
  // a walkable point in the room, as near its middle as possible
  let best = null, bd = Infinity;
  for (let i = 0; i < nav.n; i++) {
    if (!nav.walk[i]) continue;
    const x = nav.cx(i), z = nav.cz(i);
    if (roomAt(x, z)?.id !== r.id) continue;
    const d = Math.hypot(x - (r.x0 + r.x1) / 2, z - (r.z0 + r.z1) / 2);
    if (d < bd) { bd = d; best = { x, z }; }
  }
  if (!best) { check(false, `${r.id}: has floor to stand on`); continue; }
  const p = { x: 0, z: 5.5 };
  const got = walk(p, best.x, best.z, passShut(new Set()));
  check(got < 0.6, `${r.name} (${r.id}): reached (closest ${got.toFixed(2)} m)`);
}

// ---- every clock station and everything you use, within reach
console.log('stations and things to use');
const reachable = (s, label) => {
  // some open floor near enough to reach it (and walk there)
  let best = null, bd = Infinity;
  for (let i = 0; i < nav.n; i++) {
    if (!nav.walk[i] || nav.doorAt[i] >= 0) continue;
    const x = nav.cx(i), z = nav.cz(i);
    const d = Math.hypot(x - s.x, z - s.z);
    if (d < bd) { bd = d; best = { x, z }; }
  }
  const ok = best && bd < REACH + (s.r || 0.3) - 0.3;
  if (!ok) { check(false, `${label}: floor within reach (nearest ${bd.toFixed(2)} m)`); return; }
  const p = { x: 0, z: 5.5 };
  const got = walk(p, best.x, best.z, passShut(new Set()));
  check(got < 0.6, `${label}: walk there (closest ${got.toFixed(2)} m)`);
};
for (const s of STATIONS) reachable(s, s.name);
for (const [k, s] of Object.entries(SPOTS)) if (!k.startsWith('station') && !k.startsWith('hide:') && k !== 'uniform' && k !== 'car' && k !== 'cot') reachable(s, `spot ${k}`);
for (const h of HIDES) reachable({ x: h.x, z: h.z, r: 0.6 }, `hiding place ${h.id}`);
for (const [k, s] of Object.entries(DALE_SPOTS)) {
  setDoors(new Set());
  const p = { x: 0, z: 5.5 };
  check(walk(p, s.x, s.z, passShut(new Set())) < 0.8, `Dale's ${k}: reachable once its door is open`);
}

// ---- locked gates keep you out
console.log('locked gates');
{
  const shut = new Set(['H', 'halvBack', 'halvWest']);
  setDoors(shut);
  const p = { x: -30, z: 0 };
  const got = walk(p, -52, 0, allOpen, 40);
  check(got > 5 && p.x > -40, `Halvorsen's gate shut: you stay on the concourse (got to x ${p.x.toFixed(1)})`);
  setDoors(new Set(['halvBack', 'halvWest']));
  const q = { x: -30, z: 0 };
  check(walk(q, -52, 0, passShut(new Set(['halvBack', 'halvWest'])), 60) < 0.6, "Halvorsen's gate up: in you go");
  for (const sid of ['N3', 'S6']) {
    const d = DOORS[DOOR_INDEX[sid]];
    setDoors(new Set([sid, 'N3back']));
    const r = { x: d.x, z: d.z + (d.at < 0 ? 2 : -2) };
    const inside = { x: d.x, z: d.z + (d.at < 0 ? -4 : 4) };
    walk(r, inside.x, inside.z, allOpen, 20);
    check(roomAt(r.x, r.z)?.id !== sid, `${sid}'s gate shut: you can't get into the shop (ended in ${roomAt(r.x, r.z)?.id})`);
  }
}

// ---- you start somewhere sensible
console.log('start');
for (const s of START_SPOTS) check(roomAt(s.x, s.z)?.id === 'court' && nav.walk[nav.idx(s.x, s.z)], `start spot (${s.x}, ${s.z}) is open floor in the court`);

console.log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
