// Checks the city and the island itself, without running them: every lane,
// junction and parking space has room for a car; the pavements, crossings
// and every named place have room for a person; everywhere that matters
// (the jobs, the tapes, the pickups) can be walked to from your place; the
// traffic lights never show green both ways; the highways reach every part
// of the island and stay out of the sea; and the car physics drives, brakes,
// steers, slides, crashes and climbs hills the way it should.
//
// usage: node test/walk.test.js

import { NODES, EDGES, CITY_EDGES, EXITS, lane, light, hasLights, CYCLE, PARKING, WALK_NODES, PLACES, BUILDINGS, LAMPS, onRoad, areaName, makeSolids, openAt, groundY, inWater } from '../public/js/shared/city.js';
import { ROUTES, COUNTRY, FLORA, PEAKS, SUMMIT, LAKE, SEA_Y, ROOMS_BOX, heightAt, shoreDist, lakeQ } from '../public/js/shared/world.js';
import { makeCar, stepCar, CAR_TYPES } from '../public/js/shared/car.js';
import { carVsBox, carVsCar } from '../public/js/shared/collide.js';
import { MISSIONS, TAPES } from '../public/js/shared/story.js';
import { PLAYER_R } from '../public/js/shared/config.js';
import { INTERIORS, INTERIOR, interiorAt, worldSolids, IX } from '../public/js/shared/interiors.js';
import { FIXTURES } from '../public/js/shared/lights.js';

let failures = 0;
const check = (ok, what) => { if (!ok) { failures++; console.log('  FAIL:', what); } };
const solids = makeSolids();
// does a car of this type at (x, z, h) hit anything it can't drive through?
const carBlocked = (type, x, z, h) => {
  const c = makeCar(0, type, x, z, h);
  for (const b of solids.near(x, z, c.hl + 2)) if (!b.small && b.y0 < c.y + 1.2 && b.y1 > c.y + 0.25 && carVsBox(c, b)) return b;
  return null;
};

// ------------------------------------------------------------ the roads
{
  console.log('roads');
  check(NODES.filter((n) => n.city).length === 36 && CITY_EDGES === 60, `a 6 by 6 grid of streets in town (${CITY_EDGES} streets)`);
  check(EXITS.length === 5 && NODES.length > 300, `and highways out of town on all sides (${EXITS.length} ways out, ${NODES.length} junctions in all)`);
  let samples = 0, bad = 0, off = 0;
  for (const e of EDGES) {
    for (const from of [e.a, e.b]) {
      const L = lane(e.id, from);
      for (let t = 0; t <= L.len; t += 2) {
        const x = L.x0 + L.dx * t, z = L.z0 + L.dz * t;
        samples++;
        if (carBlocked('van', x, z, L.h)) bad++;
        if (!onRoad(x, z)) off++;
      }
    }
  }
  check(bad === 0, `every lane has room for a van (${bad} of ${samples} spots blocked)`);
  check(off === 0, `every lane is on the asphalt (${off} off)`);
  // junctions: room to turn
  let jBad = 0;
  for (const n of NODES) for (let dx = -5; dx <= 5; dx += 2.5) for (let dz = -5; dz <= 5; dz += 2.5) for (const h of [0, Math.PI / 4, Math.PI / 2]) if (carBlocked('sedan', n.x + dx, n.z + dz, h)) jBad++;
  check(jBad === 0, `junctions are clear to turn in (${jBad} blocked)`);
  // traffic lights
  let both = 0, red = 0;
  for (const n of NODES) {
    if (!hasLights(n.id)) continue;
    for (let t = 0; t < CYCLE * 2; t += 0.25) {
      const a = light(n.id, 'x', t), b = light(n.id, 'z', t);
      if (a !== 'r' && b !== 'r') both++;
      if (a === 'r' && b === 'r') red++;
    }
  }
  check(both === 0, 'the lights never let both ways go at once');
  check(red > 0, 'and have an all-red moment between');
  check(NODES.filter((n) => hasLights(n.id)).length >= 30, 'nearly every junction in town has lights');
  check(NODES.every((n) => n.city || !hasLights(n.id)), "and there aren't any out on the highways");
  // you can drive from anywhere to anywhere, and never hit a dead end
  const seen = new Set([0]), q = [0];
  while (q.length) { const u = q.pop(); for (const eid of NODES[u].edges) { const e = EDGES[eid], v = e.a === u ? e.b : e.a; if (!seen.has(v)) { seen.add(v); q.push(v); } } }
  check(seen.size === NODES.length, `every road joins up (${seen.size} of ${NODES.length})`);
  check(NODES.every((n) => n.edges.length >= 2), 'no dead ends');
}

// ------------------------------------------------------------ parking
{
  console.log('parking');
  let bad = 0, inLane = 0, overlap = 0;
  const cars = PARKING.map((p) => makeCar(0, p.type || 'van', p.x, p.z, p.h));
  PARKING.forEach((p, i) => {
    if (carBlocked(p.type || 'van', p.x, p.z, p.h)) bad++;
    // clear of the traffic lane (traffic passes 2.6 m from the middle)
    for (const e of EDGES) {
      for (const from of [e.a, e.b]) {
        const L = lane(e.id, from);
        const t = (p.x - L.x0) * L.dx + (p.z - L.z0) * L.dz;
        if (t < -4 || t > L.len + 4) continue;
        const side = Math.abs((p.x - L.x0) * L.rx + (p.z - L.z0) * L.rz);
        const across = Math.abs(Math.sin(p.h - L.h)) > 0.5;
        if (!across && side < 2.0) inLane++;
      }
    }
    for (let j = i + 1; j < cars.length; j++) if (Math.abs(cars[i].x - cars[j].x) < 7 && Math.abs(cars[i].z - cars[j].z) < 7 && carVsCar(cars[i], cars[j])) overlap++;
  });
  check(PARKING.length >= 80, `plenty of parking (${PARKING.length})`);
  check(bad === 0, `every space has room for a van (${bad} blocked)`);
  check(inLane === 0, `no space sits in a traffic lane (${inLane})`);
  check(overlap === 0, `no two spaces overlap (${overlap})`);
}

// ------------------------------------------------------------ pavements
{
  console.log('pavements');
  check(WALK_NODES.length >= 100, `a walking network (${WALK_NODES.length} corners)`);
  const blockedNodes = WALK_NODES.filter((n) => !openAt(solids, n.x, n.z, 0.3));
  check(blockedNodes.length === 0, `every corner has room to stand (${blockedNodes.length} blocked${blockedNodes.length ? `, e.g. ${blockedNodes[0].x.toFixed(1)}, ${blockedNodes[0].z.toFixed(1)}` : ''})`);
  let samples = 0, blocked = 0, crossings = 0;
  for (const a of WALK_NODES) {
    for (const l of a.links) {
      if (l.to < a.id) continue;
      const b = WALK_NODES[l.to];
      if (l.cross) crossings++;
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      for (let t = 0; t <= d; t += 1) {
        samples++;
        if (!openAt(solids, a.x + (b.x - a.x) * t / d, a.z + (b.z - a.z) * t / d, 0.25)) blocked++;
      }
    }
  }
  check(crossings >= 60, `crossings between blocks (${crossings})`);
  check(blocked / samples < 0.04, `the pavements are clear enough to walk (${blocked} of ${samples} spots have something in the way)`);
  check(WALK_NODES.every((n) => n.links.length >= 2), 'no dead ends');
  check(LAMPS.length >= 150, `street lamps (${LAMPS.length})`);
}

// ------------------------------------------------------------ getting about on foot
// flood the city (and a little way out of it) on a half-metre grid from
// your place: everywhere a person fits and can reach
const BOUND = 250;
const R = 0.5, W = Math.ceil((BOUND * 2) / R);
const reach = new Uint8Array(W * W);
{
  console.log('getting about on foot');
  const idx = (x, z) => (x < -BOUND || z < -BOUND || x >= BOUND || z >= BOUND ? -1 : Math.floor((z + BOUND) / R) * W + Math.floor((x + BOUND) / R));
  const fits = new Int8Array(W * W).fill(-1);
  const fit = (i) => {
    if (fits[i] < 0) { const x = -BOUND + (i % W + 0.5) * R, z = -BOUND + (Math.floor(i / W) + 0.5) * R; fits[i] = openAt(solids, x, z, PLAYER_R) ? 1 : 0; }
    return fits[i];
  };
  const start = idx(PLACES.safehouse.x, PLACES.safehouse.z + 1.5);
  check(fit(start), 'you start somewhere open');
  const q = [start];
  reach[start] = 1;
  while (q.length) {
    const i = q.pop();
    const ix = i % W;
    for (const j of [ix > 0 ? i - 1 : -1, ix < W - 1 ? i + 1 : -1, i - W, i + W]) {
      if (j < 0 || j >= W * W || reach[j] || !fit(j)) continue;
      reach[j] = 1;
      q.push(j);
    }
  }
  // near a spot: anywhere within r of it reachable?
  const reachable = (x, z, r = 1.5) => {
    for (let dz = -r; dz <= r; dz += R) for (let dx = -r; dx <= r; dx += R) {
      const i = idx(x + dx, z + dz);
      if (i >= 0 && i < W * W && reach[i]) return true;
    }
    return false;
  };
  let n = 0;
  for (const [key, p] of Object.entries(PLACES)) {
    n++;
    check(reachable(p.x, p.z), `you can walk to ${p.name} (${key})`);
  }
  TAPES.forEach(([x, z], i) => {
    check(openAt(solids, x, z, 0.3), `tape ${i + 1} isn't inside anything (${x}, ${z})`);
    check(reachable(x, z, 1.0), `tape ${i + 1} can be reached (${x}, ${z})`);
  });
  for (const [x, z] of [[-150, 152], [15, 231], [158, -128], [0.5, -3.5], [-88, 84], [PLACES.hospital.x + 3, PLACES.hospital.z], [PLACES.police.x + 4, PLACES.police.z]]) {
    check(reachable(x, z, 1.0), `the pickup at ${x}, ${z} can be reached`);
  }
  check(reachable(PLACES.hospital.x, PLACES.hospital.z + 1) && reachable(PLACES.police.x, PLACES.police.z + 1), 'you come back somewhere you can walk from');
  for (const r of INTERIORS) check(reachable(r.door.x, r.door.z, 0.5), `you can walk up to the door of ${r.name}`);
  void n;
}

// ------------------------------------------------------------ indoors
{
  console.log('indoors');
  const all = worldSolids();
  check(INTERIORS.length >= 6, `rooms to walk into (${INTERIORS.length})`);
  for (const r of INTERIORS) {
    check(r.box.x0 >= ROOMS_BOX.x0 && r.box.x1 <= ROOMS_BOX.x1 && r.box.z0 >= ROOMS_BOX.z0 && r.box.z1 <= ROOMS_BOX.z1 && shoreDist((r.box.x0 + r.box.x1) / 2, (r.box.z0 + r.box.z1) / 2) < -200, `${r.name} is well out of sight, out at sea`);
    check(groundY(r.entry.x, r.entry.z) > 0 && !inWater(r.entry.x, r.entry.z), `${r.name} has a floor to stand on`);
    check(interiorAt(r.entry.x, r.entry.z) === r && !interiorAt(r.door.x, r.door.z), `${r.name}: the door goes from the street to the room`);
    check(FIXTURES.some((f) => f.room === r.id), `${r.name} has a light`);
    for (const o of INTERIORS) if (o !== r) check(o.box.x1 < r.box.x0 || o.box.x0 > r.box.x1 || o.box.z1 + 10 < r.box.z0 || o.box.z0 > r.box.z1 + 10, `${r.name} and ${o.name} don't share walls`);
    // walk from the door: can you get to everything that matters?
    const G = 0.25, nx = Math.ceil((r.box.x1 - r.box.x0) / G), nz = Math.ceil((r.box.z1 - r.box.z0) / G);
    const at = (i) => ({ x: r.box.x0 + (i % nx + 0.5) * G, z: r.box.z0 + (Math.floor(i / nx) + 0.5) * G });
    const ok = (i) => { const p = at(i); return openAt(all, p.x, p.z, PLAYER_R); };
    const seen = new Uint8Array(nx * nz);
    const start = Math.floor((r.entry.z - r.box.z0) / G) * nx + Math.floor((r.entry.x - r.box.x0) / G);
    check(ok(start), `${r.name}: you come in somewhere open`);
    const q = [start];
    seen[start] = 1;
    while (q.length) {
      const i = q.pop(), ix = i % nx;
      for (const j of [ix > 0 ? i - 1 : -1, ix < nx - 1 ? i + 1 : -1, i - nx, i + nx]) {
        if (j < 0 || j >= nx * nz || seen[j] || !ok(j)) continue;
        seen[j] = 1;
        q.push(j);
      }
    }
    const near = (x, z, d) => { for (let i = 0; i < seen.length; i++) if (seen[i]) { const p = at(i); if (Math.hypot(p.x - x, p.z - z) < d) return true; } return false; };
    check(near(r.exit.x, r.exit.z, 0.6), `${r.name}: you can get back out`);
    for (const [k, sp] of Object.entries(r.spots)) {
      if (k === 'giver' || k === 'wake') { check(openAt(all, sp.x, sp.z, 0.3), `${r.name}: room to stand at the ${k} spot`); continue; }
      check(near(sp.x, sp.z, k === 'save' ? 0.9 : 1.2), `${r.name}: you can walk to the ${k} spot`);
    }
  }
  check(!!INTERIOR.home.spots.save && !!INTERIOR.guns.spots.shop && !!INTERIOR.diner.spots.eat, 'a bed, a gun counter and a diner counter');
  void IX;
}

// ------------------------------------------------------------ the jobs
{
  console.log('the jobs');
  const spots = [];
  for (const M of MISSIONS) {
    for (const st of M.steps) {
      if (st.do === 'car') {
        const b = carBlocked(st.type, st.at.x, st.at.z, st.at.h);
        check(!b, `${M.title}: the ${st.id} has room where it's parked (${st.at.x.toFixed(1)}, ${st.at.z.toFixed(1)})`);
      }
      if (st.do === 'convoy') st.at.forEach((a, k) => check(!carBlocked(st.type, a.x, a.z, a.h) && onRoad(a.x, a.z), `${M.title}: van ${k + 1} starts on the road`));
      if (st.do === 'race') {
        st.points.forEach(([x, z], k) => check(onRoad(x, z), `${M.title}: checkpoint ${k + 1} is on the road (${x}, ${z})`));
        let len = 0;
        for (let k = 1; k < st.points.length; k++) len += Math.hypot(st.points[k][0] - st.points[k - 1][0], st.points[k][1] - st.points[k - 1][1]);
        check(len > 600, `${M.title}: a proper race (${len.toFixed(0)} m)`);
      }
      if (st.do === 'goto' || st.do === 'deliver') spots.push([M.title, st.do, st.at]);
      if (st.do === 'peds' || st.do === 'pickup' || st.do === 'target') if (st.at) spots.push([M.title, st.do, st.at]);
    }
    check(M.pay > 0 && M.steps.length >= 3, `${M.title} pays and has steps`);
  }
  for (const [title, what, at] of spots) {
    let ok = false;
    for (let r = 0; r <= 4 && !ok; r += 0.5) for (let a = 0; a < 6.3 && !ok; a += 0.5) if (openAt(solids, at.x + Math.cos(a) * r, at.z + Math.sin(a) * r, 0.4)) ok = true;
    check(ok, `${title}: somewhere open by the ${what} spot (${at.x.toFixed(1)}, ${at.z.toFixed(1)})`);
  }
  check(MISSIONS.filter((m) => m.final).length === 1 && MISSIONS[MISSIONS.length - 1].final, 'one last job, last');
  check(BUILDINGS.some((b) => b.name === 'Pool Hall'), "there's a Pool Hall");
  let named = 0, total = 0;
  for (const e of EDGES) { const L = lane(e.id, e.a); total++; if (areaName((L.x0 + L.x1) / 2, (L.z0 + L.z1) / 2)) named++; }
  check(named === total, 'every street is in a named part of town');
}

// ------------------------------------------------------------ driving
{
  console.log('driving');
  const empty = { solids: makeSolids(), cars: [] };
  // straight down x = 40 southbound lane (heading 0 is +z)
  const L = lane(EDGES.find((e) => e.axis === 'z' && NODES[e.a].x === 40 && NODES[e.a].z === -200).id, NODES.find((n) => n.x === 40 && n.z === -200).id);
  const c = makeCar(1, 'sedan', L.x0, L.z0, L.h);
  for (let t = 0; t < 4; t += 1 / 60) stepCar(c, { throttle: 1, steer: 0 }, 1 / 60, empty);
  check(c.v > 17 && c.v < CAR_TYPES.sedan.top, `a Marlin gets going (${c.v.toFixed(1)} m/s after 4 s)`);
  check(Math.abs(c.h - L.h) < 0.01 && Math.abs(c.x - L.x0) < 0.05, 'and drives straight');
  const z0 = c.z;
  let stopT = 0;
  while (c.v > 0.1 && stopT < 6) { stepCar(c, { throttle: -1, steer: 0 }, 1 / 60, empty); stopT += 1 / 60; }
  check(stopT < 2.5, `the brakes stop it (${stopT.toFixed(2)} s)`);
  check(c.z - z0 < 40, `within ${(c.z - z0).toFixed(1)} m`);
  for (let t = 0; t < 2; t += 1 / 60) stepCar(c, { throttle: -1, steer: 0 }, 1 / 60, empty);
  check(c.v < -3 && c.v > -CAR_TYPES.sedan.top * 0.31, `reverse (${c.v.toFixed(1)} m/s)`);
  // turning right lowers the heading
  const d = makeCar(2, 'sports', 0, -160, Math.PI / 2);
  d.v = 10;
  const h0 = d.h;
  for (let t = 0; t < 1; t += 1 / 60) stepCar(d, { throttle: 0.3, steer: 1 }, 1 / 60, null);
  check(d.h < h0 - 0.5, `steering right turns right (${(d.h - h0).toFixed(2)} rad)`);
  // the handbrake slides
  const e = makeCar(3, 'sports', 0, -160, Math.PI / 2), f = makeCar(4, 'sports', 0, -160, Math.PI / 2);
  e.v = f.v = 25;
  let se = 0, sf = 0;
  for (let t = 0; t < 1; t += 1 / 60) { stepCar(e, { throttle: 0.5, steer: 1, handbrake: true }, 1 / 60, null); stepCar(f, { throttle: 0.5, steer: 1 }, 1 / 60, null); se = Math.max(se, Math.abs(e.s)); sf = Math.max(sf, Math.abs(f.s)); }
  check(se > sf * 1.5 && se > 1, `the handbrake slides it (${se.toFixed(2)} vs ${sf.toFixed(2)} m/s sideways)`);
  // into a building at speed
  const b = BUILDINGS.find((q) => q.x1 - q.x0 > 10 && q.z1 - q.z0 > 10);
  let impact = 0;
  const g = makeCar(5, 'sedan', (b.x0 + b.x1) / 2, b.z0 - 12, 0);
  g.v = 22;
  let inside = 0;
  for (let t = 0; t < 2; t += 1 / 60) {
    stepCar(g, { throttle: 1, steer: 0 }, 1 / 60, { solids: empty.solids, cars: [], onHit: (car, n) => { impact = Math.max(impact, n); } });
    inside = Math.max(inside, g.z + g.hl - b.z0);
  }
  check(impact > 15, `hitting a wall is a crash (${impact.toFixed(1)} m/s)`);
  check(inside < 0.5, `and the wall holds (${inside.toFixed(2)} m in)`);
  check(Math.abs(g.v) < 8, `and stops you (${g.v.toFixed(1)} m/s)`);
  // a shunt: the car in front gets pushed along
  const back = makeCar(6, 'van', 0, -165, Math.PI / 2), front = makeCar(7, 'sedan', 5.4, -165, Math.PI / 2);
  back.v = 15;
  const env = { solids: empty.solids, cars: [front], canPush: () => true };
  for (let t = 0; t < 0.6; t += 1 / 60) stepCar(back, { throttle: 0, steer: 0 }, 1 / 60, env);
  check(front.v > 5 && back.v < 15, `a shunt pushes the car in front (${front.v.toFixed(1)} m/s) and slows you (${back.v.toFixed(1)})`);
  // cars can drive through the small stuff (lamp posts)
  const lamp = solids.all.find((q) => q.small && q.prop === 'lamp');
  check(!!lamp, 'lamp posts');
}

// ------------------------------------------------------------ walking into things
{
  console.log('walking into things');
  const b = BUILDINGS[0];
  const p = { x: (b.x0 + b.x1) / 2, z: b.z0 - 0.1 };
  solids.resolveCircle(p, PLAYER_R, 0, true);
  check(p.z <= b.z0 - PLAYER_R + 0.01, 'you can\'t walk into a building');
  const c = COUNTRY.buildings.find((q) => q.name === 'The Rusty Spur');
  const q = { x: (c.x0 + c.x1) / 2, z: c.z0 - 0.1 };
  solids.resolveCircle(q, PLAYER_R, groundY(q.x, q.z), true);
  check(q.z <= c.z0 - PLAYER_R + 0.01, 'nor into one up in the hills or out in the desert');
}

// ------------------------------------------------------------ the island
{
  console.log('the island');
  const flat = [[0, 0], [-150, 150], [190, -190], [0, 230]].every(([x, z]) => Math.abs(groundY(x, z)) < 0.2);
  check(flat, 'the city is flat');
  // sea all round the edge
  let wet = 0, n = 0;
  for (let x = -990; x <= 910; x += 50) for (const z of [-2790, 425]) { if (x > ROOMS_BOX.x0 - 5 && x < ROOMS_BOX.x1 + 5) continue; n++; if (inWater(x, z)) wet++; }
  for (let z = -2790; z <= 425; z += 50) for (const x of [-990, 910]) { n++; if (inWater(x, z)) wet++; }
  check(wet === n, `the sea all the way round (${wet} of ${n})`);
  check(SUMMIT.y > 250 && Math.hypot(SUMMIT.x - PEAKS[0][0], SUMMIT.z - PEAKS[0][1]) < 150, `Mount Harlow towers over everything (${SUMMIT.y.toFixed(0)} m)`);
  check(inWater(LAKE.x, LAKE.z) && heightAt(LAKE.x, LAKE.z) < LAKE.y - 3 && !inWater(LAKE.x, LAKE.z + LAKE.rz * 1.6), 'Lake Corrigan, with a shore round it');
  // the highways: above the water, never too steep, the right way out of town
  let low = 0, steep = 0, wetLane = 0, pts = 0;
  for (const r of ROUTES) {
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1], b = r.pts[i];
      pts++;
      if (b.y < SEA_Y + 1 || inWater(b.x, b.z)) low++;
      if (Math.abs(b.y - a.y) / (b.s - a.s) > 0.12) steep++;
      if (Math.abs(groundY(b.x, b.z) - b.y) > 0.3 && Math.abs(b.x) > 215) wetLane++;
    }
  }
  check(low === 0, `the highways stay out of the water (${low} of ${pts} points)`);
  check(steep === 0, `and are never steeper than 1 in 8 (${steep})`);
  check(wetLane === 0, `the land's cut and banked to fit them (${wetLane} points off)`);
  check(ROUTES.reduce((s, r) => s + r.len, 0) > 8000, `kilometres of highway (${(ROUTES.reduce((s, r) => s + r.len, 0) / 1000).toFixed(1)} km)`);
  // the towns
  const towns = new Set(COUNTRY.towns.map((t) => t.name));
  check(['Pelican Beach', 'Dust Creek', 'Port Kerry'].every((t) => towns.has(t)), 'towns out of town');
  let tilted = 0, sunk = 0;
  for (const b of COUNTRY.buildings) {
    if (b.onPier) continue;
    for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]]) if (Math.abs(heightAt(x, z) - b.y) > 0.6) tilted++;
    if (inWater((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2)) sunk++;
  }
  check(tilted === 0, `every building out of town stands on level ground (${tilted} corners off)`);
  check(sunk === 0, 'and none of them is in the water');
  check(FLORA.length > 3000 && FLORA.every((f) => !inWater(f.x, f.z)), `trees, bushes and rocks (${FLORA.length}), none in the water`);
  const P = COUNTRY.pier;
  check(groundY((P.x0 + P.x1) / 2, (P.z0 + P.z1) / 2) === P.y && inWater(P.x0 + 5, P.z0 - 3) && !inWater(P.x0 + 5, (P.z0 + P.z1) / 2), 'the pier runs out over the sea, and you can walk on it');
  // where you are
  const at = (x, z) => areaName(x, z);
  check(at(-330, 40) === 'Pelican Beach' && at(0, -2560) === 'Port Kerry' && at(SUMMIT.x, SUMMIT.z) === 'Mount Harlow' && at(LAKE.x, LAKE.z) === 'Lake Corrigan' && at(-100, -420) === 'Kingsgate Hills', 'the island has names');
  check(lakeQ(LAKE.x, LAKE.z) < 0.5, '(the lake is where it says)');
  // you can't see through a mountain
  const S = SUMMIT;
  check(!solids.clear(S.x - 400, 2, S.z, S.x + 400, 2, S.z), "hills block the view (and the bullets)");
  check(solids.clear(-100, 1.6, -120, 100, 1.6, -120), 'but a straight street in town does not');
}

// ------------------------------------------------------------ hills and the sea
{
  console.log('hills and the sea');
  const env = { solids, cars: [] };
  // find a steep stretch of highway, and park on it facing uphill
  let best = null;
  for (const r of ROUTES) for (let i = 4; i < r.pts.length - 4; i++) {
    const a = r.pts[i - 4], b = r.pts[i + 4], g = (b.y - a.y) / (b.s - a.s);
    if (!best || Math.abs(g) > Math.abs(best.g)) best = { a, b, g };
  }
  const up = best.g > 0 ? [best.a, best.b] : [best.b, best.a];
  const h = Math.atan2(up[1].x - up[0].x, up[1].z - up[0].z);
  const mid = { x: (up[0].x + up[1].x) / 2, z: (up[0].z + up[1].z) / 2 };
  // coasting uphill you slow sooner than on the flat
  const coast = (x, z, hh) => {
    const c = makeCar(1, 'sedan', x, z, hh);
    c.v = 14;
    let d = 0;
    while (c.v > 0.5 && d < 300) { const px = c.x, pz = c.z; stepCar(c, { throttle: 0, steer: 0 }, 1 / 60, env); d += Math.hypot(c.x - px, c.z - pz); }
    return d;
  };
  const dUp = coast(mid.x, mid.z, h), dFlat = coast(0, -40 + 2.6, Math.PI / 2);
  check(dUp < dFlat * 0.75, `coasting up a hill you stop sooner (${dUp.toFixed(0)} m, against ${dFlat.toFixed(0)} m on the flat; a ${(Math.abs(best.g) * 100).toFixed(0)}% grade)`);
  const d = makeCar(2, 'sedan', mid.x, mid.z, h);
  const y0 = d.y;
  for (let t = 0; t < 2; t += 1 / 60) stepCar(d, { throttle: 1, steer: 0 }, 1 / 60, env);
  check(d.v > 8 && d.y > y0 + 1, `and drives on up it (${d.v.toFixed(1)} m/s, ${(d.y - y0).toFixed(1)} m up)`);
  // flat out at the sea from the beach: the water's edge stops you
  const e = makeCar(3, 'sports', -335, 120, -Math.PI / 2);
  e.v = 30;
  let hit = 0;
  for (let t = 0; t < 4; t += 1 / 60) stepCar(e, { throttle: 1, steer: 0 }, 1 / 60, { ...env, onHit: (car, n) => { hit = Math.max(hit, n); } });
  check(!inWater(e.x, e.z) && hit > 5, `you can't drive into the sea (stopped at ${e.x.toFixed(0)}, ${e.z.toFixed(0)})`);
}

if (failures) { console.log(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nall good');
