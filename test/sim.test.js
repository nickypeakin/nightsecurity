// Plays whole nights on the host simulation, in Node, with scripted guards
// who do what the objectives ask: lock up, check in, walk the rounds, reset
// the breakers, find the locker code in the logbook, get Dale out, hole up
// in the office, let the manager in and file the report. Checks every
// night reaches an ending without errors and that the pieces along the way
// work: the gates and locks, the panel, the clock stations, the power, the
// mannequins (they move, they freeze when watched, locked gates stop
// them), the thing in Dale's uniform, Dale, the report.
//
// usage: node test/sim.test.js

import { Match, WATCHED } from '../public/js/host/match.js';
import { SPOTS, DOORS, DOOR_INDEX, STATIONS, DALE_SPOTS, HIDES, roomAt } from '../public/js/shared/mall.js';
import { INTRO_LEN, TICK, HOUR_LEN } from '../public/js/shared/config.js';
import { REPORT } from '../public/js/shared/story.js';

let failures = 0;
const check = (ok, what) => { if (!ok) { failures++; console.log('  FAIL:', what); } };

function setup(n, seed, { start = 0, immortal = false } = {}) {
  const log = [];
  const roster = Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: ['Ana', 'Ben', 'Cal', 'Dee'][i], color: i }));
  const m = new Match({ seed, roster, send: (to, msg) => log.push({ to, msg }), start });
  if (immortal) m.capture = () => {};
  const P = (i) => m.players[i];
  const H = {
    m, log, P,
    st: (i, x, z, extra = {}) => m.handle(P(i).id, { t: 'st', x, z, ry: 0, rx: 0, mv: 0, fl: 1, ...extra }),
    // stand in front of a spot, looking at it
    at: (i, key, extra = {}) => {
      const s = SPOTS[key];
      const p = { x: s.x, z: s.z + 1.0 };
      if (Math.hypot(s.x, s.z - p.z) < 0.1) p.z = s.z - 1.0;
      H.st(i, s.x + 0.4, s.z + (s.z > -20.6 && s.z < -17 ? 0.8 : s.z < -21 ? 1.0 : -1.0), extra);
    },
    atDoor: (i, id) => {
      const d = DOORS[DOOR_INDEX[id]];
      // on the inside of the building / the near side
      const off = 0.9;
      if (d.axis === 'x') H.st(i, d.mid, d.at + (d.at > 0 ? -off : off));
      else H.st(i, d.at + (d.at > 0 ? -off : off), d.mid);
    },
    use: (i, k) => m.handle(P(i).id, { t: 'use', k }),
    lock: (i, id) => m.handle(P(i).id, { t: 'lock', k: id }),
    step: (sec) => { for (let k = 0; k < sec / TICK; k++) { m.step(TICK); if (m.over) break; } },
    door: (id) => m.doors[DOOR_INDEX[id]],
    msgs: (t) => log.filter((e) => e.msg.t === t).map((e) => e.msg),
  };
  // shut and lock a door or gate, whatever state it's in
  H.secure = (i, id) => {
    H.atDoor(i, id);
    const s = H.door(id);
    if (s.target > 0.5) H.use(i, `door:${id}`);
    H.step(s.open > 0.05 ? (DOORS[DOOR_INDEX[id]].kind === 'gate' ? 3 : 1) : 0.1);
    if (!s.locked) H.lock(i, id);
  };
  return H;
}

// ------------------------------------------------------------ a whole night
function night(n, seed, { immortal = true, wrong = false } = {}) {
  const H = setup(n, seed, { immortal });
  const { m, step, use, lock, at } = H;
  step(INTRO_LEN + 0.5);
  check(m.hourId === 'lockup', `${seed}: lockup starts after the intro (got ${m.hourId})`);
  check(m.openCount() === 7, `${seed}: seven things open at closing (got ${m.openCount()})`);

  // ---- 10 PM: lock up and check in
  for (const id of ['south', 'east', 'dockDoor', ...m.leftOpen]) H.secure(0, id);
  check(m.isDone('south') && m.isDone('east') && m.isDone('dock'), `${seed}: outside doors locked`);
  check(m.isDone('gates'), `${seed}: open gates locked (${m.objective('gates')?.n})`);
  check(m.openCount() === 0, `${seed}: the panel's green (got ${m.openCount()})`);
  at(0, 'logbook');
  use(0, 'logbook');
  check(m.clues.has('logbook'), `${seed}: read the logbook`);
  m.handle(m.players[0].id, { t: 'radio', k: 'checkin' });
  check(m.isDone('checkin'), `${seed}: checked in`);
  step(20);
  check(H.msgs('say').some((s) => s.radio && s.who === 'Gatehouse'), `${seed}: dispatch answers`);
  // the clock moves on now the lockup's done
  for (let k = 0; k < 400 && m.hourId === 'lockup'; k++) step(1);
  check(m.hourId === 'round1', `${seed}: eleven o'clock (got ${m.hourId}, clock ${m.clock.toFixed(2)})`);

  // a round: everyone walks a share of the stations
  const round = () => {
    for (const s of STATIONS) {
      const i = s.n % n;
      at(i, `station${s.n}`);
      use(i, `station${s.n}`);
    }
  };
  round();
  check(m.round.punched.every((x) => x), `${seed}: round one punched (${m.round.punched})`);
  // some clues on the way
  at(0, 'watchclock'); use(0, 'watchclock');
  at(0, 'car'); use(0, 'car');
  check(m.clues.has('tape') && m.clues.has('car'), `${seed}: tape and car`);

  const waitHour = (id, max = 400) => { for (let k = 0; k < max && m.hourId !== id && !m.over; k++) step(1); };
  const relock = () => { for (const k of WATCHED) { const s = m.doors[k]; if (!(s.locked && s.open < 0.05)) H.secure(0, DOORS[k].id); } };

  // ---- midnight: the PA
  waitHour('midnight');
  check(m.flags.pa, `${seed}: the PA comes on at midnight`);
  step(5);
  check(m.mq.awake === 2, `${seed}: two mannequins awake (${m.mq.awake})`);
  at(0, 'pa'); use(0, 'pa');
  check(!m.flags.pa && m.isDone('pa'), `${seed}: PA off`);
  at(0, 'photos'); use(0, 'photos');
  check(m.clues.has('photos'), `${seed}: Dale's photos`);
  relock();

  // ---- 1 AM: the power, the second round, it walks
  waitHour('round2');
  step(12);
  check(!m.breakers.concourse, `${seed}: the power goes`);
  check(m.stalker.on, `${seed}: the thing in the uniform is out`);
  for (const b of ['concourse', 'court', 'food', 'stores']) { at(0, 'breaker'); use(0, `breaker:${b}`); }
  check(m.breakers.concourse && m.isDone('power'), `${seed}: breakers reset`);
  round();
  check(m.round.n === 2 && m.round.punched.every((x) => x), `${seed}: round two punched`);
  step(60);
  check(m.stalker.pi > 0 || m.stalker.mode !== 'round', `${seed}: it walks its round (pi ${m.stalker.pi}, mode ${m.stalker.mode})`);
  relock();

  // ---- 2 AM: channel two, the locker, Dale
  waitHour('channel2');
  for (let k = 0; k < 80 && !m.clues.has('channel2'); k++) step(1);
  check(m.clues.has('channel2'), `${seed}: Dale on channel two`);
  at(0, 'locker');
  m.handle(m.players[0].id, { t: 'code', v: '000' });
  check(!m.flags.keys, `${seed}: the wrong code doesn't open it`);
  m.handle(m.players[0].id, { t: 'code', v: m.code.split('').join('-') });
  check(m.flags.keys, `${seed}: the locker opens with the code from the book`);
  const ds = DALE_SPOTS[m.place];
  H.atDoor(0, ds.door);
  lock(0, ds.door);
  check(!H.door(ds.door).locked, `${seed}: Dale's door unlocks with the spare keys`);
  use(0, `door:${ds.door}`);
  step(2);
  check(m.dale.mode === 'follow', `${seed}: Dale's out (${m.dale.mode})`);
  // walk him back to the office, a few metres ahead of him at a time
  for (let k = 0; k < 400 && m.dale.mode === 'follow'; k++) {
    const D = m.nav.field(0, -24.4, (j) => DOORS[j].kind !== 'glass' && DOORS[j].kind !== 'rollup' && (m.doors[j].open > 0.5 || !m.doors[j].locked));
    let i = m.nav.idx(m.dale.x, m.dale.z);
    for (let s = 0; s < 6; s++) {
      let best = i;
      for (const dd of [-1, 1, -268, 268, -269, -267, 267, 269]) if (D[i + dd] < D[best]) best = i + dd;
      i = best;
    }
    H.st(0, m.nav.cx(i), m.nav.cz(i));
    step(0.5);
  }
  check(m.dale.mode === 'safe', `${seed}: Dale's safe in the office (${m.dale.mode} at ${m.dale.x.toFixed(1)}, ${m.dale.z.toFixed(1)})`);
  relock();

  // ---- 3 AM: the carousel, round three
  waitHour('round3');
  step(8);
  check(m.flags.carousel, `${seed}: the carousel starts by itself`);
  at(0, 'carousel'); use(0, 'carousel');
  check(!m.flags.carousel, `${seed}: carousel off`);
  round();
  for (const b of Object.keys(m.breakers)) if (!m.breakers[b] && b !== 'stores') { at(0, 'breaker'); use(0, `breaker:${b}`); }
  relock();

  // ---- 5 AM: everyone in the office, door locked
  waitHour('last');
  check(m.siege && m.mq.awake === m.mq.list.length, `${seed}: all of them awake for the last hour`);
  for (let i = 0; i < n; i++) H.st(i, -1 + i * 0.6, -24.6, { cam: i % 8 });
  const sd = H.door('security');
  H.st(0, 0, -21.7);
  if (sd.target > 0.5) use(0, 'door:security');
  step(1.5);
  lock(0, 'security');
  check(sd.locked, `${seed}: deadbolt on`);
  for (let i = 0; i < n; i++) H.st(i, -1 + i * 0.6, -24.6, { cam: 5 });
  check(m.isDone('deadbolt'), `${seed}: deadbolt objective`);
  step(3);
  check(m.isDone('gather') || m.objective('gather')?.n === n, `${seed}: everyone in the office (${m.objective('gather')?.n})`);

  // ---- 6 AM: the manager, the report
  waitHour('dawn', 600);
  check(m.hourId === 'dawn', `${seed}: dawn (got ${m.hourId})`);
  check(m.mq.list.every((q) => !q.active), `${seed}: mannequins asleep at dawn`);
  step(2);
  if (m.doors[DOOR_INDEX.south].locked) { H.atDoor(0, 'south'); lock(0, 'south'); }
  step(8);
  check(m.report.open, `${seed}: the report opens`);
  const right = [REPORT[0].right, REPORT[1].right, { cage: 1, freezer: 2, elevator: 3 }[m.place]];
  right.forEach((a, q) => m.handle(m.players[q % n].id, { t: 'report', q, a: wrong && q === 0 ? 0 : a }));
  m.handle(m.players[0].id, { t: 'file' });
  check(m.over, `${seed}: report filed, the night's over`);
  const over = H.msgs('over')[0];
  check(over && over.ending === (wrong ? 'good' : 'best'), `${seed}: ending ${over && over.ending}`);
  check(over && over.stats && over.stats.grade, `${seed}: graded ${over && over.stats.grade}`);
  check(m.mq.moved > 3, `${seed}: the mannequins moved (${m.mq.moved.toFixed(1)} m)`);
  return { m, over };
}

// ---------------------------------- mannequins: watched, unwatched, locked in
function mannequinRules(seed) {
  const H = setup(1, seed, { start: 2 });
  const { m, step } = H;
  step(INTRO_LEN + 0.5);
  check(m.hourId === 'midnight', `${seed}: started at midnight (got ${m.hourId})`);
  // wake one in Halvorsen's, Halvorsen's locked, a guard on the concourse
  m.mq.wake(99);
  H.st(0, -30, 0, { ry: Math.PI / 2 });
  // stand still facing away from Halvorsen's: none can reach us through the locked gate
  m.capture = (p) => { p.caught = true; };
  step(20);
  check(!m.players[0].caught, `${seed}: the locked gate keeps Halvorsen's mannequins in`);
  const inside = m.mq.list.filter((q) => q.home.x < -40.5);
  check(inside.every((q) => q.x < -40), `${seed}: they're all still inside Halvorsen's`);
  // watch one: it doesn't move
  const q = inside[0];
  const keep = [q.x, q.z];
  // stand in Halvorsen's, looking straight at it, flashlight on, everyone else in view too
  const ry = Math.atan2(-(q.x - (q.x + 3)), -(q.z - q.z));
  m.handle(m.players[0].id, { t: 'st', x: q.x + 3, z: q.z, ry, rx: -0.3, mv: 0, fl: 1 });
  const seen = m.observed(q.x, 1.25, q.z);
  check(!!seen, `${seed}: a mannequin in your light is seen`);
  step(1);
  check(Math.hypot(q.x - keep[0], q.z - keep[1]) < 0.05, `${seed}: and doesn't move while you watch it (moved ${Math.hypot(q.x - keep[0], q.z - keep[1]).toFixed(2)})`);
  // look away: something moves
  m.handle(m.players[0].id, { t: 'st', x: q.x + 3, z: q.z, ry: ry + Math.PI, rx: 0, mv: 0, fl: 0 });
  const before = m.mq.moved;
  step(2);
  check(m.mq.moved > before, `${seed}: look away and they move`);
  // the camera counts as watching
  const cam = { ...m.players[0] };
  void cam;
}

// ------------------------------------------- the thing finds a lone guard
function stalkerHunts(seed) {
  const H = setup(1, seed, { start: 3 });
  const { m, step } = H;
  step(INTRO_LEN + 0.5);
  step(12);
  check(m.stalker.on, `${seed}: it's out at one`);
  // put it on the concourse, and a guard in front of it with a flashlight
  m.stalker.x = -20; m.stalker.z = 0; m.stalker.ry = Math.PI / 2;  // facing west
  let caught = false;
  m.capture = () => { caught = true; };
  H.st(0, -27, 0, { ry: -Math.PI / 2, fl: 1 });
  for (let k = 0; k < 60 && m.stalker.mode !== 'chase'; k++) step(0.1);
  check(m.stalker.mode === 'chase', `${seed}: it sees a guard with a flashlight on the concourse (${m.stalker.mode})`);
  // the guard shines the light in its face: that stops it for a moment
  check(H.msgs('fx').some((f) => f.k === 'stun'), `${seed}: a flashlight in its face stops it`);
  // then turns their back on it and stands there
  H.st(0, -27, 0, { ry: Math.PI / 2, fl: 0 });
  step(8);
  check(caught, `${seed}: and catches someone who just stands there`);
  // hide where it can't see: it gives up
  const H2 = setup(1, seed + 'b', { start: 3 });
  H2.step(INTRO_LEN + 12.5);
  const m2 = H2.m;
  m2.capture = () => { caught = 'again'; };
  m2.stalker.x = -30; m2.stalker.z = 0; m2.stalker.ry = 0;
  const hide = HIDES.find((h) => h.id === 'locker1');
  H2.st(0, hide.x - 0.9, hide.z);
  H2.use(0, `hide:${hide.id}`);
  check(m2.players[0].hide === 'locker1', `${seed}: hid in a locker`);
  H2.step(30);
  check(caught !== 'again', `${seed}: nobody finds you in the locker if they didn't see you get in`);
  H2.use(0, `hide:${hide.id}`);
  check(m2.players[0].hide == null && roomAt(m2.players[0].x, m2.players[0].z)?.id === 'break', `${seed}: out of the locker, in the break room`);
}

// ------------------------------------------------------- everyone's taken
function allTaken(seed) {
  const H = setup(2, seed, { start: 7 });
  const { m, step } = H;
  step(INTRO_LEN + 0.5);
  check(m.hourId === 'last', `${seed}: started at five (got ${m.hourId})`);
  // two guards standing in the dark in Halvorsen's, looking at the wall
  H.st(0, -58, 4, { ry: Math.PI / 2, fl: 0 });
  H.st(1, -58, 6, { ry: Math.PI / 2, fl: 0 });
  for (let k = 0; k < 300 && !m.over; k++) { step(1); H.st(0, -58, 4, { ry: Math.PI / 2, fl: 0 }); H.st(1, -58, 6, { ry: Math.PI / 2, fl: 0 }); }
  check(m.over, `${seed}: the night ends when everyone's taken`);
  const over = H.msgs('over')[0];
  check(over && over.ending === 'taken', `${seed}: ending ${over && over.ending}`);
}

const t0 = Date.now();
for (const [n, seed] of [[1, 'solo-a'], [2, 'duo-b'], [4, 'four-c']]) {
  console.log(`night: ${n} guard(s), seed ${seed}`);
  night(n, seed);
}
console.log('night: wrong first answer');
night(2, 'wrong-d', { wrong: true });
console.log('mannequins');
mannequinRules('mq-e');
console.log('the thing in the uniform');
stalkerHunts('sk-f');
console.log('everyone taken');
allTaken('taken-g');
console.log(`${failures ? `${failures} FAILED` : 'all passed'} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
void HOUR_LEN;
process.exit(failures ? 1 : 0);
