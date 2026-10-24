// Runs the city on the host simulation, in Node, with scripted players.
// Checks the streets come alive (traffic that drives on the roads and
// keeps moving, people on the pavements), that crimes bring the police and
// the police can bust you, that you can be wasted and come back, that
// shooting, carjacking, running people over, burning cars, pickups, the
// gun shop, Spray-N-Go, saving and co-op all work, and plays every job
// from the first to the credits.
//
// usage: node test/sim.test.js

import { Match, INTRO_LEN } from '../public/js/host/match.js';
import { TICK, WEAPONS, PRICES, MAX_HP } from '../public/js/shared/config.js';
import { PLACES, onRoad, openAt } from '../public/js/shared/city.js';
import { MISSIONS, TAPES, TAPE_PAY } from '../public/js/shared/story.js';

let failures = 0;
const check = (ok, what) => { if (!ok) { failures++; console.log('  FAIL:', what); } };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

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
      const o = [pos.x, 1.45, pos.z], d = [x - o[0], y - o[1], z - o[2]], l = Math.hypot(...d);
      m.handle(p.id, { t: 'fire', w, o, d: d.map((v) => v / l) });
    },
    msgs: (t) => log.filter((e) => e.msg.t === t).map((e) => e.msg),
    banners: () => log.filter((e) => e.msg.t === 'banner').map((e) => e.msg.text),
    clear: () => { log.length = 0; },
  };
  return H;
}

// ------------------------------------------------------ the streets alive
{
  console.log('the city comes alive');
  const H = setup(2, 'streets');
  const { m } = H;
  H.go(1, 0, -32.5);
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
  H.go(0, 0, -32.5);
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
  H.go(0, -40 + 7.5, -40 + 20);
  H.step(3);
  m.police.crime(p, 0, 1);
  check(p.wanted === 1, 'one star');
  // wait for them to find you
  for (let k = 0; k < 40 / TICK && !p.found && p.state === 'alive'; k++) { H.st(0); m.step(TICK); }
  check(p.found, 'the police find you');
  // then get clean away (as if you'd driven off fast), out of sight
  H.go(0, 200 - 7.5, 160);
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
  H.go(0, 120 - 7.5, 0);
  H.go(1, 120 - 7.5, 3);
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
  const parked = [...m.cars.values()].filter((c) => c.parkedSpot != null).sort((a, b) => dist(a, P(1)) - dist(b, P(1)))[0] || victim;
  const front = { x: parked.x + Math.sin(parked.h) * 6, z: parked.z + Math.cos(parked.h) * 6 };
  H.go(1, front.x, front.z);
  m.giveWeapon(P(1), 'smg', 240);
  let shots = 0;
  while (parked.hp > 0 && shots < 200) { H.go(1, front.x, front.z); H.shoot(1, parked.x, 0.8, parked.z, 2); H.step(0.12); shots++; }
  check(parked.fire, `a shot-up car catches fire (${shots} shots)`);
  H.go(1, parked.x + Math.sin(parked.h) * 3.5, parked.z + Math.cos(parked.h) * 3.5);
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
  // a tape
  const tape = [...m.pickups.values()].find((k) => k.kind === 'tape');
  const before = p.money;
  H.go(0, tape.x, tape.z);
  H.step(0.3);
  check(!m.pickups.has(tape.id), 'walk into a tape to take it');
  check(p.money === before + TAPE_PAY, 'tapes pay');
  check(H.msgs('save').length >= 1 && H.msgs('save').pop().data.tapes.includes(tape.tape), 'and save the game');
  // health
  p.hp = 30;
  const hk = [...m.pickups.values()].find((k) => k.kind === 'health');
  H.go(0, hk.x, hk.z);
  H.step(0.3);
  check(p.hp === MAX_HP, 'health pickups heal');
  check(hk.gone, 'and come back later');
  // the gun shop
  const G = PLACES.guns;
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
  H.go(0, 0, 0);
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
  const H = setup(1, 'saved', { save: { done: 3, money: 999, ammo: [0, 30, -1, -1], tapes: [0, 1, 2] } });
  const { m, P } = H;
  check(m.missions.done === 3, 'jobs done are remembered');
  check(m.missions.next.id === 'm4', 'the next job is offered');
  check(P(0).money === 999 && P(0).ammo[1] === 30 && P(0).ammo[2] === -1, 'money and guns are remembered');
  check([...m.pickups.values()].filter((k) => k.kind === 'tape').length === TAPES.length - 3, 'tapes found stay found');
  // walking into your place saves
  H.go(0, PLACES.safehouse.x, PLACES.safehouse.z);
  H.clear();
  H.step(0.5);
  check(H.banners().includes('GAME SAVED'), 'walk into your place to save');
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

  // 1. Night Work: fetch a car
  money = p.money;
  startNext();
  check(stepIs('enter'), 'job 1: get in the car');
  check(mBlip().some((b) => b.k === 'car'), 'the car is on the radar');
  H.enter(0, car('repo'));
  H.step(0.3);
  check(stepIs('deliver'), 'job 1: deliver it');
  H.driveTo(0, 152, 64);
  H.step(0.5);
  talk();
  drain(0.3);
  passed('Night Work');
  check(p.money === money + MISSIONS[0].pay && P(1).money >= MISSIONS[0].pay, 'everyone is paid');

  // 2. Repo Man: steal a car with an alarm, get it resprayed
  startNext();
  H.enter(0, car('kestrel'));
  H.step(0.3);
  untilStep('lose', 6);
  check(p.wanted >= 2, 'the alarm brings two stars');
  const S = PLACES.spray;
  money = p.money;
  H.driveTo(0, (S.x0 + S.x1) / 2, (S.z0 + S.z1) / 2);
  H.step(1);
  check(p.wanted === 0, 'Spray-N-Go loses the police');
  check(p.money === money - PRICES.respray, 'for a price');
  untilStep('deliver', 4);
  H.driveTo(0, 152, 64);
  H.step(0.5);
  talk();
  drain(0.3);
  passed('Repo Man');

  // 3. Collections: a gunfight, then the money
  startNext();
  untilStep('goto', 6);
  check(p.ammo[1] >= 48, 'Voss gives you a pistol');
  const pool = A().def.steps[A().idx].at;
  H.go(0, pool.x, pool.z + 4);
  H.go(1, pool.x + 2, pool.z + 4);
  untilStep('kill', 5);
  const gang = A().groups.brill.map((id) => m.peds.get(id));
  check(gang.length === 4, "Brill's crew");
  check(mBlip().filter((b) => b.k === 'enemy').length === 4, 'on the radar');
  for (let k = 0; k < 400 && stepIs('kill'); k++) {
    const g = gang.find((q) => q && !q.dead);
    if (!g) break;
    H.go(0, g.x + 3, g.z);
    H.shoot(0, g.x, 1.2, g.z, 1);
    H.step(0.3);
    p.ammo[1] = Math.max(p.ammo[1], 20);
  }
  check(gang.every((q) => q.dead), 'they all go down');
  untilStep('pickup', 3);
  const bag = m.pickups.get(A().pickups.bag);
  check(!!bag, 'the boss drops the money');
  H.go(1, bag.x, bag.z);
  H.step(0.5);
  check(stepIs('goto'), 'a friend can pick it up');
  cool();
  H.go(0, PLACES.voss.x, PLACES.voss.z);
  H.step(0.5);
  talk();
  drain(0.3);
  passed('Collections');

  // 4. Wheelman: the getaway
  startNext();
  H.enter(0, car('getaway'));
  H.step(0.3);
  check(stepIs('goto'), 'job 4: drive to the store');
  H.driveTo(0, 124.9, -80, Math.PI);
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
  passed('Wheelman');
  check(crew.every((q) => !q || q.inCar == null), 'the crew gets out');

  // 5. Checkpoint: the race
  startNext();
  H.enter(0, car('racer'));
  H.step(0.3);
  check(stepIs('race'), 'job 5: race');
  check(H.msgs('countdown').length === 1, 'a countdown');
  const racers = () => A().s.racers.map((id) => m.cars.get(id));
  H.step(16);
  const progress = Math.max(...racers().map((r) => r.ai.raceIdx));
  const raceDist = Math.max(...racers().map((r) => dist(r, car('racer'))));
  console.log(`  the other racers made ${progress} checkpoints in 12 s (${raceDist.toFixed(0)} m away)`);
  check(progress >= 1, 'the other racers race');
  for (const [x, z] of A().def.steps[A().idx].points) { H.driveTo(0, x, z); H.step(0.2); }
  untilStep('say', 2);
  talk();
  drain(0.3);
  passed('Checkpoint');

  // 6. Convoy: burn two vans
  startNext();
  untilStep('destroy', 6);
  check(p.ammo[2] >= 120, 'an SMG');
  const vans = ['van1', 'van2'].map(car);
  H.step(3);
  check(vans.every((v) => Math.hypot(v.x - A().def.steps[2].at[vans.indexOf(v)].x, v.z - A().def.steps[2].at[vans.indexOf(v)].z) > 3), 'the vans drive');
  for (let k = 0; k < 600 && stepIs('destroy'); k++) {
    const v = vans.find((q) => !q.dead && !q.fire) || vans.find((q) => !q.dead);
    if (!v) break;
    H.go(0, v.x + 6, v.z + 6);
    H.shoot(0, v.x, 0.8, v.z, 2);
    p.ammo[2] = Math.max(p.ammo[2], 60);
    H.step(0.12);
  }
  check(vans.every((v) => v.dead), 'both vans burn');
  cool();
  H.step(0.5);
  talk();
  drain(0.3);
  passed('Convoy');

  // 7. Thirteen
  startNext();
  check(stepIs('goto'), 'job 7: the pier');
  H.go(0, PLACES.pier.x, PLACES.pier.z);
  untilStep('pickup', 3);
  const mq = A().groups.mq.map((id) => m.peds.get(id));
  check(mq.length === 9 && mq.every((q) => q && m.openAt(q.x, q.z, 0.3)), 'nine of them among the containers');
  const crate = m.pickups.get(A().pickups.crate);
  H.go(0, crate.x, crate.z);
  H.step(0.5);
  check(p.carry === 'crate', 'you carry the crate');
  H.go(0, PLACES.ruins.x, PLACES.ruins.z);
  H.step(0.5);
  check(stepIs('target'), 'put it down at the old mall');
  const box = m.objects.get(A().objects.crate);
  check(!!box, 'the crate is there');
  H.go(0, box.x + 4, box.z);
  for (let k = 0; k < 60 && stepIs('target'); k++) { H.shoot(0, box.x, 0.6, box.z, 1); p.ammo[1] = Math.max(p.ammo[1], 20); H.step(0.35); }
  check(!m.objects.has(box.id), 'and smash it');
  H.step(0.3);
  check(mq.every((q) => q.dead), 'they all fall');
  talk();
  drain(0.5);
  passed('Thirteen');
  check(m.missions.done === MISSIONS.length, 'every job done');
  check(credits === 1, 'the credits roll');
  check(!m.missions.marker(), 'no more jobs');
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
  const c = m.cars.get(m.missions.active.cars.repo);
  m.hurtCar(c, 999, P(0));
  H.step(6);
  check(!m.missions.active && H.banners().includes('MISSION FAILED'), 'wreck the car, fail the job');
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
