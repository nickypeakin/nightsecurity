// Runs the city on the host simulation, in Node, with scripted players.
// Checks the streets come alive (traffic that drives on the roads and
// keeps moving, people on the pavements), that crimes bring the police and
// the police can bust you, that you can be wasted and come back, that
// shooting, carjacking, running people over, burning cars, pickups and
// hidden packages, the gun shop, Spray-N-Go, saving and co-op all work, and
// plays every job from the first to the credits.
//
// usage: node test/sim.test.js

import { Match, INTRO_LEN } from '../public/js/host/match.js';
import { TICK, WEAPONS, PRICES, MAX_HP } from '../public/js/shared/config.js';
import { PLACES, NODES, WALK_NODES, XS, ZS, onRoad, openAt, inWater, groundY, areaName } from '../public/js/shared/city.js';
import { ROUTE, along } from '../public/js/shared/world.js';
import { Driver } from '../public/js/host/drivers.js';
import { INTERIOR, interiorAt } from '../public/js/shared/interiors.js';
import { MISSIONS, PACKAGES, PACKAGE_PAY } from '../public/js/shared/story.js';
import { LOOK_OF } from '../public/js/host/peds.js';

let failures = 0;
const check = (ok, what) => { if (!ok) { failures++; console.log('  FAIL:', what); } };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// the street corner nearest (x, z), to stand on
const corner = (x, z) => WALK_NODES.reduce((b, n) => (Math.hypot(n.x - x, n.z - z) < Math.hypot(b.x - x, b.z - z) ? n : b));
const HOME = INTERIOR.home.door;
const areaOf = (c) => areaName(c.x, c.z);

function setup(n, seed, { start = 'skip', save = null, immortal = false } = {}) {
  const log = [];
  const roster = Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: ['Ana', 'Ben', 'Cal', 'Dee'][i], color: i }));
  const m = new Match({ seed, roster, send: (to, msg) => log.push({ to, msg }), start, save });
  if (immortal) m.hurtPlayer = () => {};
  const P = (i) => m.players[i];
  const H = {
    m, log, P,
    // what each player's browser would send: where they are (or where
    // their car is, if they're driving it)
    st: (i, extra = {}) => {
      const p = P(i);
      const msg = { t: 'st', x: p.x, z: p.z, y: 0, h: p.h, ay: p.ay, ap: 0, v: 0, a: 0, w: p.w, ...extra };
      const c = p.car != null ? m.cars.get(p.car) : null;
      if (c && p.seat === 0) msg.cs = [c.x, c.z, c.h, c.v, c.s, c.w, c.steer];
      m.handle(p.id, msg);
    },
    step: (sec, each = null) => {
      for (let k = 0; k < sec / TICK; k++) {
        for (let i = 0; i < m.players.length; i++) H.st(i);
        if (each) each();
        m.step(TICK);
        if (m.over) break;
      }
    },
    // walk (teleport) to a spot
    go: (i, x, z) => { const p = P(i); p.x = x; p.z = z; },
    // put the car player i drives somewhere (as their browser would)
    driveTo: (i, x, z, h = null) => { const c = m.cars.get(P(i).car); c.x = x; c.z = z; if (h != null) c.h = h; c.v = 0; c.s = 0; c.w = 0; },
    enter: (i, c) => { H.go(i, c.x + Math.cos(c.h) * 1.8, c.z - Math.sin(c.h) * 1.8); H.st(i); m.handle(P(i).id, { t: 'enter', car: c.id }); },
    exit: (i) => m.handle(P(i).id, { t: 'exit' }),
    // shoot at a point from where player i stands
    shoot: (i, x, y, z, w = P(i).w) => {
      const p = P(i), pos = m.playerPos(p);
      // (heights over the ground, as a browser aims: the vans may be out in the hills)
      const o = [pos.x, groundY(pos.x, pos.z) + 1.45, pos.z], d = [x - o[0], y + groundY(x, z) - o[1], z - o[2]], l = Math.hypot(...d);
      m.handle(p.id, { t: 'fire', w, o, d: d.map((v) => v / l) });
    },
    msgs: (t) => log.filter((e) => e.msg.t === t).map((e) => e.msg),
    banners: () => log.filter((e) => e.msg.t === 'banner').map((e) => e.msg.text),
    clear: () => { log.length = 0; },
  };
  return H;
}

// ------------------------------------------------------ home, and your car
{
  console.log('home, and your own car');
  const H = setup(2, 'home');
  const { m, P } = H;
  for (const p of m.players) {
    check(interiorAt(p.x, p.z)?.id === 'home', `${p.name} wakes up at home`);
    const c = m.cars.get(p.ownCar);
    check(!!c && c.owner === p.id, `${p.name} has a car`);
    const D = INTERIOR.home.door;
    check(c && Math.hypot(c.x - D.x, c.z - D.z) < 30, `parked by the house (${c && Math.hypot(c.x - D.x, c.z - D.z).toFixed(1)} m)`);
  }
  // the street stays busy outside while you're in
  H.step(30);
  const D = INTERIOR.home.door;
  const near = [...m.peds.values()].filter((q) => q.kind === 'civ' && Math.hypot(q.x - D.x, q.z - D.z) < 120).length;
  check(near >= 15, `people out on the street while you're inside (${near})`);
  check(m.cars.size >= 15, `and traffic (${m.cars.size} cars)`);
  // your car is yours: no alarm, no stars, and it stays
  const p = P(0), c = m.cars.get(p.ownCar);
  H.go(0, D.x, D.z);
  H.step(0.2);
  H.enter(0, c);
  check(p.car === c.id && p.wanted === 0, 'get in your own car, no questions asked');
  H.driveTo(0, XS[4], ZS[6] + 2.6, Math.PI / 2);
  H.step(0.5);
  H.exit(0);
  const far = corner(XS[10], ZS[1]);
  H.go(0, far.x, far.z);
  H.go(1, far.x, far.z + 2);
  H.step(5);
  check(m.cars.has(c.id), "and it's still where you left it");
  // wreck it: a new one turns up at home
  m.hurtCar(c, 999, null);
  H.step(30);
  check(m.cars.get(p.ownCar) && !m.cars.get(p.ownCar).dead && p.ownCar !== c.id, 'a wrecked car of yours is replaced at home');
  // the police come for you where you went in, not through the wall
  H.go(0, INTERIOR.guns.entry.x, INTERIOR.guns.entry.z);
  m.police.crime(p, 0, 1);
  check(m.outPos(p) === INTERIOR.guns.door, 'indoors, the street thinks you are at the door');
}

// ------------------------------------------------------ the streets alive
{
  console.log('the city comes alive');
  const H = setup(2, 'streets');
  const { m } = H;
  const at = corner(XS[6], ZS[3]);
  H.go(1, at.x, at.z);
  let maxTick = 0;
  const moved = new Map();
  let offRoad = 0, samples = 0, blocked = 0, pedSamples = 0;
  for (let k = 0; k < 90 / TICK; k++) {
    for (let i = 0; i < 2; i++) H.st(i);
    const a = performance.now();
    m.step(TICK);
    maxTick = Math.max(maxTick, k > 40 ? performance.now() - a : 0);
    if (k % 20 === 0) {
      for (const c of m.cars.values()) {
        if (!c.ai || c.ai.mode === 'park') continue;
        const s = moved.get(c.id) || { x: c.x, z: c.z, d: 0 };
        s.d += Math.hypot(c.x - s.x, c.z - s.z); s.x = c.x; s.z = c.z;
        moved.set(c.id, s);
        samples++;
        if (!onRoad(c.x, c.z)) offRoad++;
      }
      for (const p of m.peds.values()) {
        if (p.dead || p.kind !== 'civ') continue;
        pedSamples++;
        if (!openAt(m.solids, p.x, p.z, 0.15)) blocked++;
      }
    }
  }
  const traffic = [...m.cars.values()].filter((c) => c.ai && c.ai.mode === 'cruise');
  const civs = [...m.peds.values()].filter((p) => p.kind === 'civ' && !p.dead);
  const walking = civs.filter((p) => p.v > 0.5);
  const far = [...moved.values()].filter((s) => s.d > 120).length;
  console.log(`  ${m.cars.size} cars (${traffic.length} in traffic, ${far} drove 120 m+), ${civs.length} people (${walking.length} walking), slowest tick ${maxTick.toFixed(1)} ms`);
  check(traffic.length >= 12, `traffic appears (${traffic.length})`);
  check(far >= 8, `traffic keeps moving (${far} cars drove 120 m+)`);
  check(offRoad / samples < 0.03, `traffic stays on the roads (${offRoad} of ${samples} off)`);
  check(civs.length >= 25, `people on the streets (${civs.length})`);
  check(walking.length >= civs.length * 0.5, `people walk about (${walking.length} of ${civs.length})`);
  check(blocked / pedSamples < 0.02, `people stay out of walls (${blocked} of ${pedSamples})`);
  check([...m.cars.values()].some((c) => c.parkedSpot != null), 'parked cars at the kerbs');
  check(maxTick < 60, `the host keeps up (slowest tick ${maxTick.toFixed(1)} ms)`);
  const snap = H.msgs('s').pop();
  const bytes = JSON.stringify(snap).length;
  check(bytes < 24000, `snapshots stay small (${bytes} bytes)`);
  check(snap.p.length === 2 && snap.c.length === m.cars.size, 'snapshots carry everyone');
  check(snap.intro === -1, 'the intro was skipped');
}

// ------------------------------------------------------ out of town
{
  console.log('out of town');
  const H = setup(1, 'country');
  const { m, P } = H;
  // stand by the Eastern Freeway out in the country: traffic comes past at
  // highway speeds, and stays on the road (and out of the lake)
  const R = ROUTE.eastN, mid = along(R, R.len * 0.3);
  H.go(0, mid.x - mid.dz * 12, mid.z + mid.dx * 12);
  let offRoad = 0, samples = 0, fast = 0, wet = 0, floating = 0;
  const moved = new Map();
  for (let k = 0; k < 60 / TICK; k++) {
    H.st(0);
    m.step(TICK);
    if (k % 20 || k < 100) continue;
    for (const c of m.cars.values()) {
      if (!c.ai || c.ai.mode !== 'cruise') continue;
      samples++;
      if (!onRoad(c.x, c.z)) offRoad++;
      if (inWater(c.x, c.z)) wet++;
      if (Math.abs(c.y - groundY(c.x, c.z)) > 0.05) floating++;
      if (c.v > 15) fast++;
      const q = moved.get(c.id) || { x: c.x, z: c.z, d: 0 };
      q.d += Math.hypot(c.x - q.x, c.z - q.z); q.x = c.x; q.z = c.z;
      moved.set(c.id, q);
    }
  }
  const far = [...moved.values()].filter((q) => q.d > 150).length;
  console.log(`  ${moved.size} cars came by, ${far} drove 150 m+, ${Math.round((fast / samples) * 100)}% of the time over 54 km/h`);
  check(moved.size >= 5, `traffic out on the highway (${moved.size})`);
  check(far >= 4, `and it keeps moving (${far})`);
  check(fast / samples > 0.3, `at highway speeds (${fast} of ${samples})`);
  check(offRoad / samples < 0.05, `on the road (${offRoad} of ${samples} off)`);
  check(wet === 0 && floating === 0, 'never in the water, never off the ground');
  // a long drive: from town to Port Kerry at the top of the island
  const port = NODES.find((n) => n.name === 'port');
  const s0 = along(ROUTE.eastS, 60);
  const c = m.spawnCar('sedan', s0.x + s0.dz * 2.6 * -1, s0.z + s0.dx * 2.6, Math.atan2(s0.dx, s0.dz));
  c.mission = true;
  c.ai = new Driver(m, c, 'route');
  c.ai.goal = port.id;
  let t = 0, stuck = 0;
  while (t < 400 && Math.hypot(c.x - port.x, c.z - port.z) > 40) {
    H.go(0, c.x + 30, c.z);
    H.st(0);
    m.step(TICK);
    t += TICK;
    if (Math.abs(c.v) < 1) stuck += TICK;
  }
  console.log(`  town to Port Kerry in ${t.toFixed(0)} s (${stuck.toFixed(0)} s stopped)`);
  check(Math.hypot(c.x - port.x, c.z - port.z) <= 40, `a car can drive from town to Port Kerry (${Math.hypot(c.x - port.x, c.z - port.z).toFixed(0)} m off after ${t.toFixed(0)} s)`);
  // crime out in the hills still brings the police
  const p = P(0);
  H.go(0, along(ROUTE.hill, 400).x + 10, along(ROUTE.hill, 400).z);
  H.step(3);
  m.police.crime(p, 3, 2);
  let units = 0;
  for (let k = 0; k < 40 / TICK && !units; k++) { H.st(0); m.step(TICK); units = [...m.cars.values()].filter((q) => q.police && q.chasing === p.id).length; }
  check(units >= 1, 'the police come out to the hills too');
}

// ------------------------------------------------------ the intro
{
  console.log('the intro');
  const H = setup(1, 'intro', { start: 0 });
  H.step(2);
  check(H.msgs('s').pop().intro > 0, 'the intro plays');
  H.m.handle('p1', { t: 'skip' });
  H.step(0.2);
  check(H.msgs('s').pop().intro === -1, 'Space skips it');
  const H2 = setup(1, 'intro2', { start: 0 });
  H2.step(INTRO_LEN + 0.5);
  check(H2.msgs('s').pop().intro === -1, 'and it ends by itself');
}

// ------------------------------------------------------ crime and the police
{
  console.log('crime, the police, busted');
  const H = setup(1, 'police');
  const { m, P } = H;
  const p = P(0);
  const spot = corner(XS[6], ZS[3]);
  H.go(0, spot.x, spot.z);
  H.step(5);
  // shoot somebody in the street
  m.giveWeapon(p, 'pistol', 48);
  const ped = [...m.peds.values()].filter((q) => q.kind === 'civ' && !q.dead).sort((a, b) => dist(a, p) - dist(b, p))[0];
  check(!!ped, 'somebody to shoot');
  const from = [[-4, 0], [4, 0], [0, -4], [0, 4], [-3, -3], [3, 3]].map(([dx, dz]) => ({ x: ped.x + dx, z: ped.z + dz })).find((q) => openAt(m.solids, q.x, q.z, 0.4) && m.solids.clear(q.x, 1.45, q.z, ped.x, 1.2, ped.z));
  H.go(0, from.x, from.z);
  for (let k = 0; k < 10 && !ped.dead; k++) { ped.walkTo = null; H.go(0, from.x, from.z); H.shoot(0, ped.x, 1.2, ped.z, 1); H.step(0.35); }
  check(ped.dead, 'a pistol kills');
  check(p.wanted >= 1, `killing a civilian brings stars (${p.wanted})`);
  check(p.ammo[1] < 48, 'shots use ammo');
  check(H.msgs('fx').some((f) => f.k === 'shot'), 'shots are seen');
  check(H.msgs('say').some((s) => s.radio), 'dispatch calls it in');
  const money = p.money;
  // stand still: the police come and arrest you
  let units = 0, cops = 0, at = null;
  for (let k = 0; k < 90 / TICK; k++) {
    H.st(0, { x: p.x, z: p.z });
    m.step(TICK);
    units = Math.max(units, [...m.cars.values()].filter((c) => c.police && c.chasing === p.id).length);
    cops = Math.max(cops, [...m.peds.values()].filter((c) => c.kind === 'cop' && !c.dead).length);
    if (p.state !== 'alive') { at = k * TICK; break; }
  }
  console.log(`  ${units} police cars came, ${cops} officers on foot, ${p.state} after ${at?.toFixed(1)} s`);
  check(units >= 1, 'police cars come');
  check(cops >= 1, 'officers get out');
  check(p.state === 'busted' || p.state === 'wasted', `standing still gets you caught (${p.state})`);
  check(H.banners().includes(p.state.toUpperCase()), 'the big words');
  const busted = p.state === 'busted';
  H.step(7);
  check(p.state === 'alive', 'back on your feet');
  check(p.wanted === 0, 'and nobody wants you');
  const back = busted ? PLACES.police : PLACES.hospital;
  check(dist(p, back) < 6, `at the ${busted ? 'police station' : 'hospital'}`);
  check(p.money === Math.max(0, money - (busted ? PRICES.busted : PRICES.hospital)), 'and it cost you');
  if (busted) check(p.ammo[1] === -1, 'busted takes your guns');
  check(H.msgs('respawn').length === 1, 'the client is told');
}

// ------------------------------------------------------ getting away
{
  console.log('losing the police');
  const H = setup(1, 'getaway');
  const { m, P } = H;
  const p = P(0);
  const at = corner(XS[5], ZS[5]);
  H.go(0, at.x, at.z);
  H.step(3);
  m.police.crime(p, 0, 1);
  check(p.wanted === 1, 'one star');
  // wait for them to find you
  for (let k = 0; k < 40 / TICK && !p.found && p.state === 'alive'; k++) { H.st(0); m.step(TICK); }
  check(p.found, 'the police find you');
  // then get clean away (as if you'd driven off fast), out of sight
  const away = corner(XS[11], ZS[7]);
  H.go(0, away.x, away.z);
  let lost = null;
  for (let k = 0; k < 60 / TICK && lost == null && p.state === 'alive'; k++) {
    H.st(0, { v: 0 });
    m.step(TICK);
    if (!p.wanted) lost = k * TICK;
  }
  console.log(`  ${lost != null ? `lost them after ${lost.toFixed(1)} s` : `still wanted (${p.state})`}`);
  check(lost != null, 'one star wears off once they lose you');
  check(H.msgs('say').some((s) => s.radio && /gone/.test(s.text)), 'dispatch calls it off');
  H.step(20);
  check(![...m.cars.values()].some((c) => c.police && c.chasing), 'and the police stop chasing');
}

// ------------------------------------------------------ cars
{
  console.log('cars: stealing, jacking, running people over, burning');
  const H = setup(2, 'cars', { immortal: false });
  const { m, P } = H;
  const p = P(0);
  const at = corner(XS[8], ZS[5]);
  H.go(0, at.x, at.z);
  H.go(1, at.x, at.z + 3);
  H.step(20);
  // jack a car out of traffic
  const victim = [...m.cars.values()].filter((c) => c.ai && c.ai.mode === 'cruise' && c.driverLook != null && !c.police).sort((a, b) => dist(a, p) - dist(b, p))[0];
  check(!!victim, 'traffic to jack');
  const pedsBefore = m.peds.size;
  victim.v = 0;
  H.enter(0, victim);
  check(p.car === victim.id && p.seat === 0, 'F takes the wheel');
  check(m.peds.size === pedsBefore + 1, 'the driver is thrown out');
  check(victim.ai === null, 'and the car is yours');
  check(H.msgs('entered').length === 1, 'your browser is told');
  // a friend climbs in the other side
  H.enter(1, victim);
  check(P(1).car === victim.id && P(1).seat === 1, 'a friend rides along');
  // drive (as the browser would) and the host follows
  H.step(0.2);
  victim.x += 10;
  H.step(0.2);
  check(Math.abs(m.playerPos(p).x - victim.x) < 0.01, 'the host follows your car');
  check(Math.abs(m.playerPos(P(1)).x - victim.x) < 0.01, 'and your passenger with it');
  // run somebody over
  const ped = [...m.peds.values()].find((q) => q.kind === 'civ' && !q.dead);
  ped.x = victim.x + Math.sin(victim.h) * 3; ped.z = victim.z + Math.cos(victim.h) * 3; ped.walkTo = null;
  victim.v = 14;
  m.stepImpacts();
  victim.x += Math.sin(victim.h) * 1.5; victim.z += Math.cos(victim.h) * 1.5;
  m.stepImpacts();
  check(ped.hp < 40, `running people over hurts them (hp ${ped.hp.toFixed(0)})`);
  check(H.msgs('fx').some((f) => f.k === 'thud'), 'thud');
  victim.v = 0;
  H.exit(1);
  H.exit(0);
  check(p.car == null && P(1).car == null, 'F gets you out');
  check(victim.ai && victim.ai.mode === 'park', 'and the car stays put');
  // set a car on fire: it burns, then goes up and takes you with it
  // (somewhere to shoot it from: open, and in sight of it)
  const standOff = (c) => [[0, 6], [0, -6], [6, 0], [-6, 0], [4, 4], [-4, 4], [4, -4], [-4, -4]].map(([dx, dz]) => ({ x: c.x + dx, z: c.z + dz }))
    .find((q) => m.openAt(q.x, q.z, 0.4) && m.solids.clear(q.x, 1.45, q.z, c.x, 0.8, c.z));
  const parked = [...m.cars.values()].filter((c) => c.parkedSpot != null && standOff(c)).sort((a, b) => dist(a, P(1)) - dist(b, P(1)))[0] || victim;
  const front = standOff(parked);
  H.go(1, front.x, front.z);
  m.giveWeapon(P(1), 'smg', 240);
  let shots = 0;
  while (parked.hp > 0 && shots < 200) { H.go(1, front.x, front.z); H.shoot(1, parked.x, 0.8, parked.z, 2); H.step(0.12); shots++; }
  check(parked.fire, `a shot-up car catches fire (${shots} shots)`);
  H.go(1, (front.x + parked.x) / 2, (front.z + parked.z) / 2);
  const hp = P(1).hp;
  H.step(5);
  check(parked.dead, 'and explodes');
  check(H.msgs('fx').some((f) => f.k === 'boom'), 'boom');
  check(P(1).hp < hp || P(1).state === 'wasted', 'too close hurts');
  H.go(0, parked.x + 1, parked.z + 1);
  H.st(0);
  m.handle(p.id, { t: 'enter', car: parked.id });
  check(p.car == null, "you can't drive a wreck");
}

// ------------------------------------------------------ guns, pickups, shop
{
  console.log('pickups and the gun shop');
  const H = setup(1, 'shop');
  const { m, P } = H;
  const p = P(0);
  // a hidden package
  const pkgs = [...m.pickups.values()].filter((k) => k.kind === 'package');
  check(pkgs.length === PACKAGES.length, `${pkgs.length} hidden packages out there`);
  const pkg = pkgs[0];
  const before = p.money;
  H.go(0, pkg.x, pkg.z);
  H.step(0.3);
  check(!m.pickups.has(pkg.id), 'walk into a package to take it');
  check(p.money === before + PACKAGE_PAY, 'packages pay');
  check(H.banners().includes(`HIDDEN PACKAGE 1 OF ${PACKAGES.length}`), 'and count');
  check(H.msgs('save').length >= 1 && H.msgs('save').pop().data.packages.includes(pkg.pkg), 'and save the game');
  // health
  p.hp = 30;
  const hk = [...m.pickups.values()].find((k) => k.kind === 'health');
  H.go(0, hk.x, hk.z);
  H.step(0.3);
  check(p.hp === MAX_HP, 'health pickups heal');
  check(hk.gone, 'and come back later');
  // the gun shop (inside Freedom Arms)
  const G = INTERIOR.guns.spots.shop;
  H.go(0, G.x, G.z);
  p.money = 1000;
  m.handle(p.id, { t: 'buy', item: 'pistol' });
  check(p.ammo[1] === WEAPONS[1].ammo && p.money === 1000 - WEAPONS[1].price, 'buy a pistol');
  m.handle(p.id, { t: 'buy', item: 'pistol' });
  check(p.ammo[1] === WEAPONS[1].ammo * 2 && p.money === 1000 - WEAPONS[1].price - WEAPONS[1].ammoPrice, 'then ammo for it');
  m.handle(p.id, { t: 'buy', item: 'shotgun' });
  check(p.ammo[3] === -1, "you can't buy what you can't afford");
  check(H.msgs('shop').some((s) => s.ok === false), 'the shop says so');
  m.handle(p.id, { t: 'buy', item: 'armor' });
  check(p.armor === 100, 'body armour');
  // a meal at Sal's
  const E = INTERIOR.diner.spots.eat;
  H.go(0, E.x, E.z);
  p.hp = 40; p.money = 100;
  m.handle(p.id, { t: 'buy', item: 'meal' });
  check(p.hp === MAX_HP && p.money === 100 - PRICES.meal, "a meal at Sal's puts you right");
  H.go(0, corner(0, 0).x, corner(0, 0).z);
  p.money = 5000;
  m.handle(p.id, { t: 'buy', item: 'smg' });
  check(p.ammo[2] === -1, 'only at the counter');
  // reloads
  p.w = 1;
  const clip = p.clip[1];
  for (let k = 0; k < clip; k++) { H.shoot(0, 0, 1, 20, 1); m.t += 0.5; }
  check(H.msgs('reload').length === 1, `a clip of ${clip} then a reload`);
  // a punch
  const ped = [...m.peds.values()].find((q) => q.kind === 'civ') || null;
  if (ped) {
    H.go(0, ped.x, ped.z - 1); p.h = 0; ped.vx = 0; ped.vz = 0;
    const hp0 = ped.hp;
    m.punch(p);
    check(ped.hp < hp0, 'fists hurt');
  }
}

// ------------------------------------------------------ saving and continuing
{
  console.log('continuing a saved game');
  const H = setup(1, 'saved', { save: { done: 3, money: 999, ammo: [0, 30, -1, -1], packages: [0, 1, 2] } });
  const { m, P } = H;
  check(m.missions.done === 3, 'jobs done are remembered');
  check(m.missions.next.id === 'm4', 'the next job is offered');
  check(P(0).money === 999 && P(0).ammo[1] === 30 && P(0).ammo[2] === -1, 'money and guns are remembered');
  check([...m.pickups.values()].filter((k) => k.kind === 'package').length === PACKAGES.length - 3, 'packages found stay found');
  // walking up to your bed saves
  H.go(0, INTERIOR.home.spots.save.x, INTERIOR.home.spots.save.z);
  H.clear();
  H.step(0.5);
  check(H.banners().includes('GAME SAVED'), 'walk up to your bed to save');
  check(H.msgs('save').pop()?.data.done === 3, 'the save says where you are');
}

// ------------------------------------------------------ co-op
{
  console.log('co-op');
  const H = setup(4, 'coop');
  const { m } = H;
  H.step(1);
  check(m.players.length === 4, 'four players');
  check(H.msgs('s').pop().p.length === 4, 'everyone in the snapshot');
  m.leave('p3');
  check(m.players.length === 3 && !m.over, 'one leaves, the game goes on');
  for (const id of ['p1', 'p2', 'p4']) m.leave(id);
  check(m.over, 'everyone leaves: it ends');
}

// ------------------------------------------------------ every job
{
  console.log('every job, start to finish (two players)');
  const H = setup(2, 'story', { immortal: true });
  const { m, P } = H;
  const p = P(0);
  const A = () => m.missions.active;
  const stepIs = (what) => A() && A().def.steps[A().idx]?.do === what;
  const car = (id) => m.cars.get(A().cars[id]);
  // talk through any dialogue
  const talk = () => { for (let k = 0; k < 40 && stepIs('say'); k++) { m.handle('p2', { t: 'skip' }); H.step(0.2); } };
  // (and one tick more, so the step has begun)
  const untilStep = (what, sec = 20) => { for (let k = 0; k < sec / 0.1 && A() && !stepIs(what); k++) H.step(0.1); H.step(TICK); return stepIs(what); };
  const cool = () => { for (const q of m.players) m.police.clear(q, 'test'); };
  const startNext = () => {
    for (const q of m.players) if (q.car != null) H.exit(q.idx);
    cool();
    H.step(7);
    cool();
    // (standing on the next one's marker already starts it)
    const mk = m.missions.marker();
    if (mk) { H.go(0, mk.x, mk.z); H.step(0.5); }
    check(!!A(), `job ${m.missions.done + 1} starts at the marker`);
    check(H.msgs('mission').pop()?.active, 'the HUD is told');
    talk();
  };
  let credits = 0;
  const passed = (title) => {
    const ok = !A() && H.banners().includes('MISSION PASSED');
    check(ok, `${title} passed`);
    if (!ok) console.log('   state:', A()?.def.title, A()?.idx, A()?.def.steps[A()?.idx]?.do, A()?.text, H.banners().slice(-3));
    credits += H.msgs('credits').length;
    H.clear();
  };
  const mBlip = () => H.msgs('mission').pop()?.blips || [];
  const drain = (sec) => H.step(sec);
  let money;

  // whoever's in `group` (Lamar, Michael, Trevor) gets in the car player 0
  // is driving
  const ride = (group) => {
    const c = m.cars.get(p.car), q = m.peds.get(A().groups[group][0]);
    H.driveTo(0, q.x + 1.5, q.z);
    for (let k = 0; k < 30 && q.inCar !== c.id; k++) H.step(0.1);
    return q.inCar === c.id;
  };
  // your own car (or, if it's been wrecked, a new one beside you)
  const myCar = () => { const c = m.cars.get(p.ownCar); return c && !c.dead ? c : m.spawnCar('sedan', p.x + 3, p.z, 0); };
  const shootDown = (group, w) => {
    const list = A().groups[group].map((id) => m.peds.get(id));
    for (let k = 0; k < 600 && stepIs('kill'); k++) {
      const g = list.find((q) => q && !q.dead);
      if (!g) break;
      H.go(0, g.x + 3, g.z);
      H.shoot(0, g.x, 1.2, g.z, w);
      p.ammo[w] = Math.max(p.ammo[w], 20);
      H.step(0.3);
    }
    return list;
  };
  // drive through every checkpoint of the race
  const race = () => { for (const [x, z] of A().def.steps[A().idx].points) { H.driveTo(0, x, z); H.step(0.2); } };
  // the next job's giver rings you a few seconds after the last one
  const rings = (who) => {
    H.step(9);
    const call = H.msgs('say').filter((q) => q.phone);
    check(call.length > 0 && call.every((q) => q.who === who) && H.msgs('fx').some((f) => f.k === 'ring'), `${who} phones about the next job`);
  };

  // 1. Franklin and Lamar: down to the beach together, then race back
  money = p.money;
  startNext();
  untilStep('board', 4);
  check(stepIs('board'), 'job 1: Lamar waits outside');
  check(mBlip().some((b) => b.k === 'friend'), 'Lamar is on the radar');
  const lamar = m.peds.get(A().groups.lamar[0]);
  check(dist(lamar, HOME) < 6 && lamar.look === LOOK_OF.lamar, 'Lamar, by your front door');
  H.enter(0, myCar());
  check(ride('lamar'), 'Lamar gets in your car');
  untilStep('goto', 3);
  check(stepIs('goto'), 'job 1: drive to the beach');
  const beach = A().def.steps[A().idx].at;
  H.driveTo(0, beach.x - 12, beach.z);
  H.step(0.5);
  untilStep('enter', 3);
  check(stepIs('enter') && lamar.inCar == null, 'Lamar gets out at the beach');
  H.exit(0);
  H.enter(0, car('repo'));
  H.step(0.3);
  check(stepIs('race'), 'and you race him back');
  const rival = m.cars.get(A().s.racers[0]);
  check(A().s.racers.length === 1 && rival.driverLook === LOOK_OF.lamar && !m.peds.has(lamar.id), "Lamar's at the wheel of the other car");
  H.step(10);
  check(rival.ai.raceIdx >= 1, `Lamar races (${rival.ai.raceIdx} checkpoints)`);
  race();
  untilStep('deliver', 2);
  H.driveTo(0, PLACES.lot.x, PLACES.lot.z);
  H.step(0.5);
  talk();
  drain(0.3);
  passed('Franklin and Lamar');
  check(p.money === money + MISSIONS[0].pay && P(1).money >= MISSIONS[0].pay, 'everyone is paid');
  rings('simeon');

  // 2. Repossession: a car out of a Ballas yard
  startNext();
  untilStep('enter', 3);
  const yard = A().groups.ballas.map((id) => m.peds.get(id));
  check(yard.length === 4 && yard.every((q) => q.look !== LOOK_OF.lamar), 'the Ballas are watching the car');
  H.enter(0, car('ride'));
  H.step(0.3);
  untilStep('deliver', 3);
  check(stepIs('deliver'), 'job 2: get it back to the lot');
  H.driveTo(0, PLACES.lot.x, PLACES.lot.z);
  H.step(0.5);
  talk();
  drain(0.3);
  passed('Repossession');
  rings('simeon');

  // 3. Complications: somebody's in the back seat
  startNext();
  H.enter(0, car('kestrel'));
  H.step(0.3);
  untilStep('goto', 3);
  const michael = m.peds.get(A().groups.michael[0]);
  check(michael && michael.look === LOOK_OF.michael && michael.inCar === car('kestrel').id, 'Michael was hiding in the back seat');
  H.driveTo(0, PLACES.lot.x, PLACES.lot.z);
  H.step(0.5);
  untilStep('say', 3);
  check(michael.inCar == null, 'he gets out at the lot');
  talk();
  drain(0.3);
  passed('Complications');
  rings('lamar');

  // 4. Old Friends: Stretch's meeting is an ambush
  startNext();
  untilStep('board', 6);
  check(p.ammo[1] >= 48, 'Lamar gives you a pistol');
  H.enter(0, myCar());
  check(ride('lamar'), 'Lamar rides with you');
  untilStep('goto', 2);
  const pool = A().def.steps[A().idx].at;
  H.driveTo(0, pool.x, pool.z);
  H.step(0.5);
  untilStep('kill', 5);
  check(stepIs('kill'), 'the Ballas are waiting');
  H.exit(0);
  check(mBlip().filter((b) => b.k === 'enemy').length === 5, 'on the radar');
  const gang = shootDown('ballas', 1);
  check(gang.length === 5 && gang.every((q) => q.dead), 'they all go down');
  untilStep('pickup', 3);
  const bag = m.pickups.get(A().pickups.bag);
  check(!!bag, 'they drop the money');
  H.go(1, bag.x, bag.z);
  H.step(0.5);
  check(stepIs('board'), 'a friend can pick it up');
  H.enter(0, myCar());
  check(ride('lamar'), 'Lamar gets back in');
  untilStep('goto', 2);
  cool();
  H.driveTo(0, HOME.x, HOME.z + 4);
  H.step(0.5);
  talk();
  drain(0.3);
  passed('Old Friends');
  rings('michael');

  // 5. The Driver: Michael in the passenger seat, then the getaway
  startNext();
  H.enter(0, car('getaway'));
  H.step(0.3);
  untilStep('board', 3);
  check(stepIs('board'), 'job 5: wait for Michael');
  check(ride('michael'), 'Michael gets in');
  untilStep('goto', 3);
  const store = A().def.steps[A().idx].at;
  H.driveTo(0, store.x, store.z);
  H.step(0.5);
  untilStep('board', 6);
  check(stepIs('board'), 'the crew comes out');
  untilStep('deliver', 25);
  const crew = A().groups.crew.map((id) => m.peds.get(id));
  check(crew.every((q) => q && q.inCar === car('getaway').id), 'they get in');
  check(p.wanted >= 3, 'three stars');
  H.driveTo(0, PLACES.pier.x, PLACES.pier.z);
  H.step(0.5);
  talk();
  drain(0.5);
  passed('The Driver');
  check(crew.every((q) => !q || q.inCar == null), 'the crew gets out');
  rings('lamar');

  // 6. Street Kings: the race, against Stretch
  startNext();
  H.enter(0, car('racer'));
  H.step(0.3);
  check(stepIs('race'), 'job 6: race');
  check(H.msgs('countdown').length === 1, 'a countdown');
  const racers = () => A().s.racers.map((id) => m.cars.get(id));
  check(racers()[0].driverLook === LOOK_OF.stretch, 'Stretch is racing');
  H.step(16);
  const progress = Math.max(...racers().map((r) => r.ai.raceIdx));
  const raceDist = Math.max(...racers().map((r) => dist(r, car('racer'))));
  console.log(`  the other racers made ${progress} checkpoints in 12 s (${raceDist.toFixed(0)} m away)`);
  check(progress >= 1, 'the other racers race');
  race();
  untilStep('say', 2);
  talk();
  drain(0.3);
  passed('Street Kings');
  rings('michael');

  // 7. Trevor: a truck from the airport, and Trevor with it
  startNext();
  const cargo = car('cargo');
  check(cargo && areaOf(cargo) === 'San Cielo International', 'job 7: the truck is out at the airport');
  H.enter(0, cargo);
  H.step(0.3);
  untilStep('board', 3);
  const trevor = m.peds.get(A().groups.trevor[0]);
  check(trevor && trevor.look === LOOK_OF.trevor, "Trevor's waiting by it");
  check(ride('trevor'), 'Trevor gets in');
  untilStep('lose', 6);
  check(p.wanted >= 3, 'airport security calls the police');
  cool();
  untilStep('deliver', 3);
  H.driveTo(0, PLACES.lester.x, PLACES.lester.z);
  H.step(0.5);
  talk();
  drain(0.3);
  passed('Trevor');
  rings('lester');

  // 8. The Score: the armoured truck
  startNext();
  untilStep('destroy', 8);
  check(p.ammo[2] >= 120, 'an SMG');
  const truck = car('truck');
  check(truck && truck.hp >= 300, 'an armoured truck');
  const t0 = { x: truck.x, z: truck.z };
  H.step(3);
  check(dist(truck, t0) > 3, 'it drives');
  for (let k = 0; k < 900 && stepIs('destroy'); k++) {
    H.go(0, truck.x + 6, truck.z + 6);
    H.shoot(0, truck.x, 0.8, truck.z, 2);
    p.ammo[2] = Math.max(p.ammo[2], 60);
    H.step(0.12);
  }
  check(truck.dead, 'and is stopped');
  untilStep('loot', 2);
  const loot = A().s.ids.map((id) => m.pickups.get(id));
  check(loot.length === 4 && loot.every((b) => b && m.openAt(b.x, b.z, 0.3)), 'four bags of cash spill out');
  check(mBlip().filter((b) => b.k === 'pickup').length === 4, 'on the radar');
  loot.forEach((b, k) => { H.go(k % 2, b.x, b.z); H.step(0.3); });
  untilStep('lose', 6);
  check(p.wanted >= 4, 'four stars');
  cool();
  untilStep('goto', 3);
  H.go(0, PLACES.lester.x, PLACES.lester.z);
  H.step(0.5);
  talk();
  drain(0.3);
  passed('The Score');
  rings('michael');

  // 9. The Long Stretch: Stretch, the docks, and Lamar
  startNext();
  untilStep('goto', 6);
  check(p.ammo[3] >= 40, 'a shotgun');
  H.go(0, PLACES.terminal.x, PLACES.terminal.z);
  H.go(1, PLACES.terminal.x + 2, PLACES.terminal.z);
  untilStep('kill', 5);
  const ballas = A().groups.ballas.map((id) => m.peds.get(id));
  check(ballas.length === 8 && ballas.filter((q) => q.boss && q.look === LOOK_OF.stretch).length === 1, 'Stretch and the Ballas');
  shootDown('ballas', 3);
  check(ballas.every((q) => q.dead), 'they all go down');
  untilStep('board', 4);
  check(stepIs('board'), 'Lamar is there');
  H.enter(0, myCar());
  check(ride('lamar'), 'Lamar gets in');
  untilStep('goto', 2);
  cool();
  H.driveTo(0, HOME.x, HOME.z + 4);
  H.step(0.5);
  talk();
  drain(0.5);
  passed('The Long Stretch');
  check(m.missions.done === MISSIONS.length, 'every job done');
  check(credits === 1, 'the credits roll');
  check(!m.missions.marker(), 'no more jobs');
  H.step(10);
  check(!H.msgs('say').some((q) => q.phone), 'and nobody calls after the last one');
}

// ------------------------------------------------------ a job can fail
{
  console.log('failing a job');
  const H = setup(1, 'fail', { immortal: false });
  const { m, P } = H;
  const mk = m.missions.marker();
  H.go(0, mk.x, mk.z);
  H.step(0.5);
  for (let k = 0; k < 40 && m.missions.active?.def.steps[m.missions.active.idx]?.do === 'say'; k++) { m.handle('p1', { t: 'skip' }); H.step(0.2); }
  for (let k = 0; k < 40 && !m.missions.active.groups.lamar; k++) H.step(0.1);
  m.killPed(m.peds.get(m.missions.active.groups.lamar[0]), null);
  H.step(6);
  check(!m.missions.active && H.banners().includes('MISSION FAILED'), 'lose Lamar, fail the job');
  check(H.msgs('banner').some((b) => b.text === 'MISSION FAILED' && /Lamar/.test(b.sub)), 'and you are told why');
  check(m.missions.done === 0, 'and do it again');
  H.go(0, mk.x + 20, mk.z);
  H.step(8);
  check(!!m.missions.marker(), 'the marker comes back');
  H.go(0, mk.x, mk.z);
  H.step(0.5);
  check(m.missions.active?.def.id === 'm1', 'and starts it again');
}

if (failures) { console.log(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nall good');
