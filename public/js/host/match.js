// The city, run by whoever hosts (in their browser, and in Node for the
// tests). It owns everything that matters: who's where, every car and
// pedestrian, health, money, guns, the police and the jobs. Each player's
// browser moves its own character (and the car they're driving) and
// tells the host; the host decides what that hits and sends everyone a
// snapshot of the city ten times a second.

import { TICK, SNAP_EVERY, PLAYER_R, REACH, MAX_HP, MAX_ARMOR, WEAPONS, WEAPON_INDEX, PRICES, SPAWN_NEAR, SPAWN_FAR, DESPAWN, PEDS_PER_PLAYER, PEDS_MAX, TRAFFIC_PER_PLAYER, TRAFFIC_MAX, PED, hourAt, sunAt } from '../shared/config.js';
import { makeRng } from '../shared/rng.js';
import { PLACES, PARKING, EDGES, WALK_NODES, lane, openAt, areaName, edgesNear, groundY } from '../shared/city.js';
import { INTERIOR, interiorAt, worldSolids } from '../shared/interiors.js';
import { rayCar, rayPerson, rayBox, circleVsCar, carVsCar } from '../shared/collide.js';
import { makeCar, stepCar, CAR_TYPES, CAR_KEYS, PAINT, TAXI_PAINT, carVel } from '../shared/car.js';
import { PACKAGES, PACKAGE_PAY, PACKAGES_BONUS, PICKUPS, BARKS, SHOP } from '../shared/story.js';
import { Driver } from './drivers.js';
import { Crowd, makePed, PED_LOOKS, LOOK_COP, A, r2 } from './peds.js';
import { Police } from './police.js';
import { Missions } from './missions.js';

export const INTRO_LEN = 32;     // (client/opening.js: OPENING_LEN)
// your car's colours (one each, by player)
const OWN_PAINT = [9, 0, 2, 8];
// the parking spaces nearest your place, best first
function homeSpots() {
  const H = INTERIOR.home.door;
  return PARKING.map((sp, i) => ({ i, d: Math.hypot(sp.x - H.x, sp.z - H.z) + (sp.kind === 'drive' ? -6 : 0) })).sort((a, b) => a.d - b.d).slice(0, 4).map((q) => q.i);
}
const ANIM_RUN = 2;

export class Match {
  constructor({ seed = 'san-cielo', roster, send, start = 0, save = null }) {
    this.seed = seed;
    this.rng = makeRng(seed);
    this.send = send;
    this.t = 0;
    this.ticks = 0;
    this.over = false;
    this.solids = worldSolids();
    this.cars = new Map();
    this.peds = new Map();
    this.pickups = new Map();
    this.objects = new Map();
    this.nextCar = 1;
    this.nextPickup = 1;
    this.spots = PARKING.map(() => ({ car: null, cool: 0 }));
    this.packages = new Set(save?.packages || []);
    this.introT = start === 'skip' ? INTRO_LEN : 0;
    this.players = roster.map((r, i) => this.makePlayer(r, i));
    if (save && this.players[0]) {
      const p = this.players[0];
      p.money = save.money ?? p.money;
      if (Array.isArray(save.ammo)) p.ammo = WEAPONS.map((w, k) => (k === 0 ? Infinity : save.ammo[k] ?? -1));
    }
    this.crowd = new Crowd(this);
    this.police = new Police(this);
    this.missions = new Missions(this, save);
    // everybody's own car, parked at home
    this.homeSpots = homeSpots();
    for (const p of this.players) this.giveCar(p);
    this.streamT = 0;
    this.saveT = 0;
    this.lastView = -1;
    this.placePickups();
  }

  makePlayer(r, i) {
    // everybody wakes up at your place
    const W = INTERIOR.home.spots.wake;
    return {
      id: r.id, name: r.name, color: r.color, idx: i,
      x: W.x - (i % 2) * 1.1, z: W.z + Math.floor(i / 2) * 1.1, y: 0, h: W.h, ay: 0, ap: 0, anim: 0, speed: 0, aim: false,
      hp: MAX_HP, armor: 0, money: 100,
      ammo: WEAPONS.map((w, k) => (k === 0 ? Infinity : -1)),   // -1: don't have it
      clip: WEAPONS.map((w) => w.clip || 0),
      w: 0, lastShot: -1, reloadT: 0,
      car: null, seat: 0, carry: null,
      wanted: 0, heat: 0, seenT: null, lastSeen: null, arrestT: 0, searching: false,
      state: 'alive', stateT: 0, kills: 0, lastSt: 0,
    };
  }

  // ------------------------------------------------------------ your own car
  // (a Kestrel in your colour, in the driveway or at the kerb by your place)
  giveCar(p) {
    const i = this.homeSpots[p.idx % this.homeSpots.length];
    const sp = PARKING[i];
    const c = this.spawnCar('sports', sp.x, sp.z, sp.h, { paint: OWN_PAINT[p.idx % OWN_PAINT.length], keep: true });
    c.owner = p.id;
    this.spots[i].car = c.id;      // nobody else parks there
    p.ownCar = c.id;
    return c;
  }

  // a wrecked (or lost) car of yours comes back home, when nobody's looking
  checkOwnCars() {
    for (const p of this.players) {
      const c = this.cars.get(p.ownCar);
      const gone = !c || (c.dead && c.wreckT > 15);
      if (!gone || this.players.some((q) => q.car === p.ownCar)) continue;
      const sp = PARKING[this.homeSpots[p.idx % this.homeSpots.length]];
      if (this.anyoneSees(sp.x, 1, sp.z) || this.carAt(sp.x, sp.z, 0.6)) continue;
      if (c) { c.owner = null; c.keep = false; }
      this.giveCar(p);
    }
  }

  // ------------------------------------------------------------ helpers
  player(id) { return this.players.find((p) => p.id === id) || null; }
  playerPos(p) {
    if (p.car != null) { const c = this.cars.get(p.car); if (c) return c; }
    return p;
  }
  // where someone is as far as the street's concerned (indoors: their door)
  outPos(p) {
    const R = p.car == null ? interiorAt(p.x, p.z) : null;
    return R ? R.door : this.playerPos(p);
  }
  emit(msg, to = null) { this.send(to, msg); }
  sound(k, x = null, z = null) { this.emit({ t: 'fx', k, x, z }); }
  radio(text) { this.emit({ t: 'say', who: 'Dispatch', text, voice: 'radio', radio: true }); }
  bark(p, kind) {
    const list = BARKS[kind];
    if (!list || this.t - (this.lastBark || 0) < 1.5) return;
    this.lastBark = this.t;
    this.emit({ t: 'bark', id: p.id, text: list[Math.floor(this.rng() * list.length)], x: r2(p.x), z: r2(p.z), cop: p.kind === 'cop' });
  }
  // lines of dialogue, one after another; returns how long they take
  // lines of dialogue, one after another; `phone` for a call (`after`
  // seconds from now, after the ring)
  dialog(lines, { phone = false, after = 0 } = {}) {
    let at = after;
    for (const [who, text] of lines) {
      const dur = 1.4 + text.length * 0.055;
      this.emit({ t: 'say', who, text, dur, delay: at, ...(phone ? { phone: true } : {}) });
      at += dur;
    }
    return at;
  }
  openAt(x, z, r = 0.4) { return openAt(this.solids, x, z, r); }

  // is there a car within r of (x, z)?
  carAt(x, z, r) {
    for (const c of this.cars.values()) if (Math.hypot(c.x - x, c.z - z) < r + c.hl) return c;
    return null;
  }

  // can player q see the point (in front of their camera, not too far, a
  // clear line)?
  sees(q, x, y, z, range = 60, cos = 0.55) {
    const pos = this.playerPos(q);
    const dx = x - pos.x, dz = z - pos.z, d = Math.hypot(dx, dz);
    if (d > range) return false;
    if (d < 1.5) return true;
    const fx = -Math.sin(q.ay), fz = -Math.cos(q.ay);
    if ((dx * fx + dz * fz) / d < cos) return false;
    return this.solids.clear(pos.x, 1.6, pos.z, x, y, z);
  }
  anyoneSees(x, y, z) { return this.players.some((q) => q.state === 'alive' && this.sees(q, x, y, z, 130, 0.3)); }

  // ------------------------------------------------------------ cars
  spawnCar(type, x, z, h, { paint = null, police = false, keep = false, mission = false } = {}) {
    const p = paint ?? (type === 'taxi' ? -1 : Math.floor(this.rng() * PAINT.length));
    const c = makeCar(this.nextCar++, type, x, z, h, p);
    c.police = police || type === 'police';
    c.keep = keep;
    c.mission = mission;
    c.ai = null;
    c.driverLook = null;
    c.riders = [];
    c.siren = false;
    c.burnT = 0;
    c.wreckT = 0;
    this.cars.set(c.id, c);
    return c;
  }

  removeCar(c) {
    c.gone = true;
    this.cars.delete(c.id);
    for (const s of this.spots) if (s.car === c.id) s.car = null;
    for (const id of c.riders || []) { const p = this.peds.get(id); if (p) this.removePed(p); }
  }

  carEnv(c) {
    const env = this.env || (this.env = {
      solids: this.solids, cars: [],
      canPush: (o) => !this.players.some((p) => p.car === o.id && p.seat === 0),
      onHit: (car, impact, other) => this.carHit(car, impact, other),
    });
    env.cars.length = 0;
    for (const o of this.cars.values()) if (o !== c && Math.abs(o.x - c.x) < 12 && Math.abs(o.z - c.z) < 12) env.cars.push(o);
    return env;
  }

  carHit(c, impact, other) {
    if (impact > 5) this.hurtCar(c, (impact - 5) * 3.2, null);
    if (impact > 4) this.emit({ t: 'fx', k: 'crash', x: r2(c.x), z: r2(c.z), n: Math.min(1, impact / 20) });
    // traffic that gets hit panics
    if (c.ai && c.ai.mode === 'cruise' && impact > 5 && other) {
      c.ai.panicT = 8;
      const by = this.players.find((p) => p.car === other.id);
      if (by) { c.ai.mode = 'flee'; c.ai.target = { x: other.x, z: other.z }; this.police.crime(by, 0.15); }
    }
  }

  hurtCar(c, dmg, by) {
    if (c.dead || dmg <= 0) return;
    c.hp = Math.max(0, c.hp - dmg);
    if (by) c.lastBy = by.id;
    if (c.hp <= 0 && !c.burnT) {
      c.hp = 0;
      c.burnT = 4.5;           // burning; then it goes up
      c.fire = true;
    }
  }

  explode(c) {
    c.dead = true;
    c.fire = false;
    c.wreckT = 0;
    c.v *= 0.3;
    this.emit({ t: 'fx', k: 'boom', x: r2(c.x), z: r2(c.z) });
    const by = c.lastBy ? this.player(c.lastBy) : null;
    if (by && !c.mission) this.police.crime(by, c.police ? 1 : 0.4);
    // whoever's inside, and whoever's near
    for (const p of this.players) {
      if (p.state !== 'alive') continue;
      const pos = this.playerPos(p);
      const d = Math.hypot(pos.x - c.x, pos.z - c.z);
      if (p.car === c.id) { this.leaveCar(p, true); this.hurtPlayer(p, 999, {}); continue; }
      if (d < 8) this.hurtPlayer(p, 90 * (1 - d / 8), { dir: [pos.x - c.x, pos.z - c.z] });
    }
    for (const p of this.peds.values()) {
      if (p.dead) continue;
      if (p.inCar === c.id) { p.inCar = null; this.killPed(p, by); continue; }
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      if (d < 7) { p.vx = (p.x - c.x) / (d + 0.5) * 8; p.vz = (p.z - c.z) / (d + 0.5) * 8; this.hurtPed(p, 100 * (1 - d / 7), by, { knock: true }); }
    }
    for (const o of this.cars.values()) {
      if (o === c || o.dead) continue;
      const d = Math.hypot(o.x - c.x, o.z - c.z);
      if (d < 9) this.hurtCar(o, 70 * (1 - d / 9), by);
    }
    for (const o of this.objects.values()) if (Math.hypot(o.x - c.x, o.z - c.z) < 7) this.hurtObject(o, 80, by);
    this.crowd.scare(c.x, c.z, 50);
    c.ai = null;
    c.riders = [];
  }

  // ------------------------------------------------------------ people
  addPed(p) { this.peds.set(p.id, p); return p; }
  removePed(p) { this.peds.delete(p.id); }

  hurtPed(p, dmg, by, { knock = false, dir = null } = {}) {
    if (p.dead) return;
    p.hp -= dmg;
    if (dir) { p.vx = dir[0] * 3; p.vz = dir[1] * 3; }
    if (p.hp <= 0) { this.killPed(p, by); return; }
    if (knock) p.downT = 2.2;
    if (p.kind === 'civ') {
      p.mode = 'flee'; p.fleeT = 12;
      p.fromX = by ? this.playerPos(by).x : p.x; p.fromZ = by ? this.playerPos(by).z : p.z;
      this.bark(p, 'hit');
      if (by) this.police.crime(by, 0.35);
    } else if (p.kind === 'cop' && by) {
      p.provoked = true;
      p.target = by.id;
      this.police.crime(by, 0.5, 2);
    }
  }

  killPed(p, by) {
    p.dead = true;
    p.hp = 0;
    p.deadT = 0;
    p.anim = A.dead;
    p.downT = 0;
    if (by) {
      by.kills++;
      if (p.kind === 'civ') this.police.crime(by, 0.75, 1);
      else if (p.kind === 'cop') this.police.crime(by, 1, 2);
    }
    if (p.cash > 0 && !p.friend) this.addPickup('cash', p.x + 0.4, p.z, { amount: p.cash, life: 40 });
    if (p.kind === 'cop' && this.rng() < 0.5) this.addPickup('pistol', p.x - 0.4, p.z, { amount: 12, life: 40 });
    this.crowd.scare(p.x, p.z, 30, { cower: true });
  }

  hurtPlayer(p, dmg, { by = null, dir = null } = {}) {
    if (p.state !== 'alive' || dmg <= 0) return;
    const a = Math.min(p.armor, dmg);
    p.armor -= a;
    p.hp -= dmg - a;
    this.emit({ t: 'hurt', id: p.id, n: Math.round(dmg), dir }, p.id);
    if (p.hp <= 0) this.wasted(p);
    void by;
  }

  wasted(p) {
    if (p.state !== 'alive') return;
    p.hp = 0;
    if (p.car != null) this.leaveCar(p, true);
    p.state = 'wasted';
    p.stateT = 0;
    p.carry = null;
    this.emit({ t: 'banner', text: 'WASTED', kind: 'wasted' }, p.id);
    this.emit({ t: 'fx', k: 'down', id: p.id });
  }

  busted(p) {
    if (p.state !== 'alive') return;
    if (p.car != null) this.leaveCar(p, true);
    p.state = 'busted';
    p.stateT = 0;
    p.carry = null;
    this.emit({ t: 'banner', text: 'BUSTED', kind: 'busted' }, p.id);
  }

  respawn(p) {
    const busted = p.state === 'busted';
    const at = busted ? PLACES.police : PLACES.hospital;
    p.state = 'alive';
    p.hp = MAX_HP;
    p.armor = 0;
    p.x = at.x + (p.idx - 1.5) * 1.5; p.z = at.z + 1; p.h = at.h ?? 0;
    p.money = Math.max(0, p.money - (busted ? PRICES.busted : PRICES.hospital));
    if (busted) p.ammo = p.ammo.map((a, k) => (k === 0 ? a : -1));
    if (busted) p.w = 0;
    this.police.clear(p, 'respawn');
    p.arrestT = 0;
    this.emit({ t: 'respawn', x: r2(p.x), z: r2(p.z), h: r2(p.h), why: busted ? 'busted' : 'wasted' }, p.id);
  }

  // ------------------------------------------------------------ pickups
  placePickups() {
    // weapons and health lying about the city, and the hidden packages
    for (const [kind, x, z] of PICKUPS) this.addPickup(kind, x, z, { respawn: 60, amount: kind === 'pistol' ? 24 : kind === 'smg' ? 60 : kind === 'shotgun' ? 12 : 0 });
    PACKAGES.forEach(([x, z], i) => { if (!this.packages.has(i)) this.addPickup('package', x, z, { pkg: i }); });
  }

  addPickup(kind, x, z, o = {}) {
    const p = { id: this.nextPickup++, kind, x, z, amount: o.amount || 0, respawn: o.respawn || 0, until: o.life ? this.t + o.life : null, mission: !!o.mission, pkg: o.pkg ?? null, gone: false, backAt: 0 };
    this.pickups.set(p.id, p);
    return p;
  }

  collect(p, pk) {
    switch (pk.kind) {
      case 'cash': this.addMoney(p, pk.amount); break;
      case 'health': if (p.hp >= MAX_HP) return false; p.hp = MAX_HP; break;
      case 'armor': if (p.armor >= MAX_ARMOR) return false; p.armor = MAX_ARMOR; break;
      case 'pistol': case 'smg': case 'shotgun': this.giveWeapon(p, pk.kind, pk.amount || WEAPONS[WEAPON_INDEX[pk.kind]].ammo / 2); break;
      case 'package': {
        this.packages.add(pk.pkg);
        this.addMoney(p, PACKAGE_PAY);
        const all = this.packages.size >= PACKAGES.length;
        this.emit({ t: 'banner', text: all ? `ALL ${PACKAGES.length} PACKAGES FOUND` : `HIDDEN PACKAGE ${this.packages.size} OF ${PACKAGES.length}`, sub: all ? `$${PACKAGES_BONUS}` : `$${PACKAGE_PAY}`, kind: 'package' });
        if (all) for (const q of this.players) this.addMoney(q, PACKAGES_BONUS);
        this.save();
        break;
      }
      case 'bag': break;
      case 'crate': p.carry = 'crate'; break;
      default:
    }
    this.emit({ t: 'fx', k: 'pickup', kind: pk.kind, id: p.id, x: r2(pk.x), z: r2(pk.z) });
    return true;
  }

  giveWeapon(p, key, ammo) {
    const k = WEAPON_INDEX[key];
    if (k == null) return;
    p.ammo[k] = Math.max(0, p.ammo[k]) + Math.round(ammo);
    if (!p.clip[k]) p.clip[k] = WEAPONS[k].clip;
    if (p.w === 0) p.w = k;
    this.emit({ t: 'weapon', w: k }, p.id);
  }

  addMoney(p, n) { p.money = Math.max(0, p.money + n); }

  // ------------------------------------------------------------ mission props
  addObject(kind, x, z, hp) {
    const o = { id: this.nextPickup++, kind, x, z, hp, w: 0.7, h: 0.9 };
    this.objects.set(o.id, o);
    return o;
  }
  hurtObject(o, dmg, by) {
    o.hp -= dmg;
    if (o.hp <= 0) { this.objects.delete(o.id); this.emit({ t: 'fx', k: 'smash', x: r2(o.x), z: r2(o.z) }); }
    void by;
  }

  // ------------------------------------------------------------ getting in
  enterCar(p, carId) {
    if (p.state !== 'alive' || p.car != null) return;
    let c = carId != null ? this.cars.get(carId) : null;
    if (!c || Math.hypot(c.x - p.x, c.z - p.z) > REACH + c.hl) {
      // the nearest car
      c = null;
      let bd = REACH + 2.5;
      for (const o of this.cars.values()) { const d = Math.hypot(o.x - p.x, o.z - p.z); if (d < bd && !o.dead) { bd = d; c = o; } }
    }
    if (!c || c.dead) return;
    const T = CAR_TYPES[c.type];
    const driver = this.players.find((q) => q.car === c.id && q.seat === 0);
    if (driver) {
      // a friend's car: hop in the passenger side
      const used = new Set(this.players.filter((q) => q.car === c.id).map((q) => q.seat));
      let seat = 1;
      while (used.has(seat)) seat++;
      if (seat >= T.seats) return;
      p.car = c.id; p.seat = seat;
      this.emit({ t: 'entered', car: c.id, seat }, p.id);
      return;
    }
    // somebody at the wheel? out they come
    if (c.ai && c.driverLook != null && !c.dead) {
      const s = Math.sin(c.h), co = Math.cos(c.h);
      const ped = makePed(c.police ? 'cop' : 'civ', c.x + co * 1.5, c.z - s * 1.5, c.police ? LOOK_COP : c.driverLook);
      ped.mode = 'flee'; ped.fleeT = 10; ped.fromX = p.x; ped.fromZ = p.z;
      if (c.police) { ped.target = p.id; ped.provoked = true; }
      this.addPed(ped);
      this.bark(ped, c.police ? 'cop' : 'car');
      this.police.crime(p, c.police ? 1 : 0.4, c.police ? 2 : 0);
      this.emit({ t: 'fx', k: 'jack', id: p.id, car: c.id });
    } else if (c.police) this.police.crime(p, 0.6, 1);
    // a parked car with an alarm sometimes
    if (!c.ai && !c.mission && c.parkedSpot != null && this.rng() < 0.12) { this.police.crime(p, 0.6); this.emit({ t: 'fx', k: 'alarm', car: c.id }); }
    c.ai = null;
    c.driverLook = null;
    c.siren = false;
    c.keep = true;
    c.chasing = null;
    if (c.parkedSpot != null) { this.spots[c.parkedSpot].car = null; c.parkedSpot = null; }
    p.car = c.id;
    p.seat = 0;
    this.emit({ t: 'entered', car: c.id, seat: 0, cs: carState(c) }, p.id);
  }

  leaveCar(p, forced = false) {
    const c = this.cars.get(p.car);
    p.car = null;
    if (!c) return;
    const s = Math.sin(c.h), co = Math.cos(c.h);
    const side = p.seat % 2 === 0 ? 1 : -1;
    p.x = c.x + co * 1.6 * side; p.z = c.z - s * 1.6 * side;
    if (p.seat === 0 && !this.players.some((q) => q.car === c.id && q.seat === 0)) {
      c.ai = new Driver(this, c, 'park');
      c.keep = true;
      c.leftT = this.t;
    }
    p.seat = 0;
    if (!forced) this.emit({ t: 'exited', x: r2(p.x), z: r2(p.z) }, p.id);
  }

  // ------------------------------------------------------------ shooting
  fire(p, msg) {
    const k = msg.w | 0;
    const W = WEAPONS[k];
    if (!W || W.melee || p.state !== 'alive') return;
    if (p.ammo[k] <= 0) return;
    if (this.t - p.lastShot < 0.85 / W.rate) return;
    if (p.reloadT > this.t) return;
    p.lastShot = this.t;
    p.ammo[k]--;
    p.clip[k]--;
    if (p.clip[k] <= 0) { p.clip[k] = W.clip; p.reloadT = this.t + W.reload; this.emit({ t: 'reload', w: k, s: W.reload }, p.id); }
    const [ox, oy, oz] = msg.o, [dx0, dy0, dz0] = msg.d;
    const pellets = W.pellets || 1;
    for (let n = 0; n < pellets; n++) {
      const sp = W.spread * (p.aim ? 0.6 : 1);
      let dx = dx0 + (this.rng() - 0.5) * 2 * sp, dy = dy0 + (this.rng() - 0.5) * 2 * sp, dz = dz0 + (this.rng() - 0.5) * 2 * sp;
      const l = Math.hypot(dx, dy, dz) || 1;
      dx /= l; dy /= l; dz /= l;
      const hit = this.ray(ox, oy, oz, dx, dy, dz, W.range, p);
      let hitKind = 0;
      if (hit.ped) {
        const head = oy + dy * hit.t - (hit.ped.y || 0) > 1.55;
        this.hurtPed(hit.ped, W.dmg * (head ? 2 : 1), p, { dir: [dx, dz], knock: W.key === 'shotgun' && this.rng() < 0.4 });
        hitKind = 2;
      } else if (hit.player) {
        this.hurtPlayer(hit.player, W.dmg * 0.5, { by: p, dir: [dx, dz] });
        hitKind = 2;
      } else if (hit.car) {
        this.hurtCar(hit.car, W.dmg * 0.55, p);
        if (hit.car.ai && hit.car.ai.mode === 'cruise') { hit.car.ai.panicT = 10; hit.car.ai.mode = 'flee'; hit.car.ai.target = { x: ox, z: oz }; }
        hitKind = 3;
      } else if (hit.object) { this.hurtObject(hit.object, W.dmg, p); hitKind = 3; } else if (hit.t < W.range) hitKind = 1;
      if (n < 3) this.emit({ t: 'fx', k: 'shot', w: k, o: [r2(ox), r2(oy), r2(oz)], e: [r2(ox + dx * hit.t), r2(oy + dy * hit.t), r2(oz + dz * hit.t)], hit: hitKind, by: p.id, n: hit.n || null });
    }
    // everyone near runs; any cop near sees it
    this.crowd.scare(ox, oz, 40, { cower: true });
    for (const c of this.peds.values()) {
      if (c.kind !== 'cop' || c.dead) continue;
      if (Math.hypot(c.x - ox, c.z - oz) < 45 && this.solids.clear(c.x, 1.6, c.z, ox, oy - groundY(ox, oz), oz)) { this.police.crime(p, 0.6, 1); break; }
    }
    for (const c of this.cars.values()) {
      if (!c.police || c.dead || !c.ai) continue;
      if (Math.hypot(c.x - ox, c.z - oz) < 40) { this.police.crime(p, 0.6, 1); break; }
    }
  }

  // what a ray hits first (not the shooter, nor their own car)
  ray(ox, oy, oz, dx, dy, dz, range, shooter) {
    let best = { t: range };
    const wall = this.solids.ray(ox, oy, oz, dx, dy, dz, range);
    if (wall) best = { t: wall.t, n: [wall.nx, wall.ny, wall.nz] };
    const myCar = shooter && shooter.car != null ? shooter.car : null;
    for (const p of this.peds.values()) {
      if (p.inCar != null || (p.dead && p.deadT > 0.3)) continue;
      if (Math.abs(p.x - ox) > range || Math.abs(p.z - oz) > range) continue;
      const t = rayPerson(ox, oy, oz, dx, dy, dz, p, best.t, 0.36, p.downT > 0 || p.dead ? 0.5 : 1.85);
      if (t >= 0 && t < best.t) best = { t, ped: p };
    }
    for (const c of this.cars.values()) {
      if (c.id === myCar) continue;
      if (Math.abs(c.x - ox) > range + 3 || Math.abs(c.z - oz) > range + 3) continue;
      const t = rayCar(ox, oy, oz, dx, dy, dz, c, best.t);
      if (t >= 0 && t < best.t) best = { t, car: c };
    }
    for (const o of this.objects.values()) {
      const y0 = groundY(o.x, o.z);
      const h = rayBox(ox, oy, oz, dx, dy, dz, { x0: o.x - o.w, x1: o.x + o.w, y0, y1: y0 + o.h * 2, z0: o.z - o.w, z1: o.z + o.w }, best.t);
      if (h && h.t < best.t) best = { t: h.t, object: o };
    }
    return best;
  }

  punch(p) {
    if (p.state !== 'alive' || p.car != null) return;
    if (this.t - p.lastShot < 0.4) return;
    p.lastShot = this.t;
    const fx = Math.sin(p.h), fz = Math.cos(p.h);
    let best = null, bd = 1.9;
    for (const q of this.peds.values()) {
      if (q.dead || q.inCar != null) continue;
      const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
      if (d < bd && (dx * fx + dz * fz) / (d || 1) > 0.3) { bd = d; best = q; }
    }
    this.emit({ t: 'fx', k: 'punch', id: p.id, hit: !!best });
    if (best) {
      this.hurtPed(best, WEAPONS[0].dmg, p, { knock: best.hp < 25 || this.rng() < 0.25, dir: [fx * 0.8, fz * 0.8] });
      if (best.kind === 'cop' && !best.dead) this.police.crime(p, 0.6, 1);
      return;
    }
    for (const o of this.objects.values()) if (Math.hypot(o.x - p.x, o.z - p.z) < 1.8) this.hurtObject(o, 12, p);
  }

  // ------------------------------------------------------------ messages
  handle(id, msg) {
    const p = this.player(id);
    if (!p) return;
    switch (msg.t) {
      case 'st': this.onState(p, msg); break;
      case 'enter': if (p.car == null) this.enterCar(p, msg.car); break;
      case 'exit': if (p.car != null) this.leaveCar(p); break;
      case 'fire': this.fire(p, msg); break;
      case 'punch': this.punch(p); break;
      case 'crash': { const c = this.cars.get(p.car); if (c && p.seat === 0) this.carHit(c, Math.min(40, +msg.n || 0), null); break; }
      case 'buy': this.buy(p, msg.item); break;
      case 'skip': if (this.introT < INTRO_LEN) this.introT = INTRO_LEN; this.missions.skip(); break;
      case 'horn': if (p.car != null) this.emit({ t: 'fx', k: 'horn', car: p.car }); break;
      case 'siren': { const c = this.cars.get(p.car); if (c && c.police && p.seat === 0) c.siren = !c.siren; break; }
      case 'respawn': if (p.state !== 'alive' && p.stateT > 2) this.respawn(p); break;
      default:
    }
  }

  onState(p, m) {
    p.lastSt = this.t;
    if (p.state !== 'alive') return;
    p.ay = +m.ay || 0;
    p.ap = +m.ap || 0;
    p.aim = !!m.aim;
    if (m.w != null && p.ammo[m.w] !== -1 && WEAPONS[m.w]) p.w = m.w | 0;
    if (p.car != null) {
      const c = this.cars.get(p.car);
      if (c && p.seat === 0 && Array.isArray(m.cs)) {
        [c.x, c.z, c.h, c.v, c.s, c.w, c.steer] = m.cs.map(Number);
        c.lights = !!m.lights;
      }
      if (c) { p.x = c.x; p.z = c.z; }
      p.speed = c ? Math.abs(c.v) : 0;
      return;
    }
    const nx = +m.x, nz = +m.z;
    if (Number.isFinite(nx) && Number.isFinite(nz)) { p.x = nx; p.z = nz; }
    p.y = +m.y || 0;
    p.h = +m.h || 0;
    p.speed = +m.v || 0;
    p.anim = m.a | 0;
  }

  buy(p, item) {
    // a meal at Sal's: health back to full
    if (item === 'meal') {
      const E = INTERIOR.diner.spots.eat;
      if (Math.hypot(p.x - E.x, p.z - E.z) > 2.2) return;
      if (p.hp >= MAX_HP) { this.emit({ t: 'shop', ok: false, text: "You're not hungry." }, p.id); return; }
      if (p.money < PRICES.meal) { this.emit({ t: 'shop', ok: false, text: "You can't afford that." }, p.id); return; }
      p.money -= PRICES.meal;
      p.hp = MAX_HP;
      this.emit({ t: 'shop', ok: true, text: 'That hit the spot.' }, p.id);
      return;
    }
    const G = INTERIOR.guns.spots.shop;
    if (Math.hypot(p.x - G.x, p.z - G.z) > 2.4) return;
    const S = SHOP.find((s) => s.key === item);
    if (!S) return;
    if (S.armor) {
      if (p.money < PRICES.armor || p.armor >= MAX_ARMOR) return;
      p.money -= PRICES.armor; p.armor = MAX_ARMOR;
    } else {
      const k = WEAPON_INDEX[S.weapon], W = WEAPONS[k];
      const owned = p.ammo[k] >= 0;
      const cost = owned ? W.ammoPrice : W.price;
      if (p.money < cost) { this.emit({ t: 'shop', ok: false, text: "You can't afford that." }, p.id); return; }
      p.money -= cost;
      this.giveWeapon(p, S.weapon, W.ammo);
    }
    this.emit({ t: 'shop', ok: true }, p.id);
    this.save();
  }

  skipIntro() { this.introT = INTRO_LEN; }

  leave(id) {
    const p = this.player(id);
    if (!p) return;
    if (p.car != null) this.leaveCar(p, true);
    this.players = this.players.filter((q) => q !== p);
    if (!this.players.length) this.over = true;
  }

  save() {
    const host = this.players[0];
    if (!host) return;
    this.emit({ t: 'save', data: { done: this.missions.done, money: host.money, ammo: host.ammo.map((a) => (a === Infinity ? 0 : a)), packages: [...this.packages] } }, host.id);
  }

  // ------------------------------------------------------------ the tick
  step(dt) {
    if (this.over) return;
    this.t += dt;
    this.ticks++;
    if (this.introT < INTRO_LEN) this.introT += dt;
    this.stepPlayers(dt);
    this.stepCars(dt);
    this.crowd.step(dt);
    this.stepImpacts();
    this.police.step(dt);
    this.missions.step(dt);
    this.stepPickups();
    this.streamT -= dt;
    if (this.streamT <= 0) { this.streamT = 0.5; this.stream(); this.checkOwnCars(); }
    this.saveT += dt;
    if (this.saveT > 60) { this.saveT = 0; this.save(); }
    if (this.ticks % SNAP_EVERY === 0) this.emit(this.snapshot());
    if (this.missions.version !== this.lastView) {
      this.lastView = this.missions.version;
      this.emit({ t: 'mission', ...this.missions.view() });
    }
  }

  stepPlayers(dt) {
    for (const p of this.players) {
      if (p.state !== 'alive') {
        p.stateT += dt;
        if (p.stateT > 6) this.respawn(p);
        continue;
      }
      // Spray-N-Go: a new colour, a mended car, and the police forget you
      const S = PLACES.spray;
      if (p.car != null && p.seat === 0) {
        const c = this.cars.get(p.car);
        if (c && c.x > S.x0 && c.x < S.x1 && c.z > S.z0 && c.z < S.z1 && Math.abs(c.v) < 2) {
          if ((p.wanted || c.hp < CAR_TYPES[c.type].hp) && this.t - (p.sprayT || -99) > 8) {
            p.sprayT = this.t;
            if (p.money >= PRICES.respray) {
              p.money -= PRICES.respray;
              c.paint = (c.paint + 3 + Math.floor(this.rng() * 5)) % PAINT.length;
              c.hp = CAR_TYPES[c.type].hp;
              c.fire = false; c.burnT = 0;
              for (const q of this.players) if (q.car === c.id) this.police.clear(q, 'spray');
              this.emit({ t: 'banner', text: 'RESPRAYED', sub: `-$${PRICES.respray}`, kind: 'spray' }, p.id);
            } else this.emit({ t: 'banner', text: 'NO MONEY', sub: `A respray costs $${PRICES.respray}`, kind: 'spray' }, p.id);
          }
        }
      }
      // your bed: walk up to it to save
      const H = INTERIOR.home.spots.save;
      if (p.car == null && Math.hypot(p.x - H.x, p.z - H.z) < 1.0 && this.t - (p.savedT || -99) > 15) {
        p.savedT = this.t;
        this.save();
        this.emit({ t: 'banner', text: 'GAME SAVED', kind: 'save' }, p.id);
      }
    }
  }

  stepCars(dt) {
    for (const c of [...this.cars.values()]) {
      if (c.burnT > 0) {
        c.burnT -= dt;
        // whoever's inside gets out (if they can)
        if (c.burnT <= 0) this.explode(c);
      }
      if (c.dead) { c.wreckT += dt; stepCarDead(this, c, dt); continue; }
      const driven = this.players.some((p) => p.car === c.id && p.seat === 0);
      if (driven) continue;
      if (c.ai) c.ai.step(dt);
      // a parked car somebody shunted rolls to a stop
      else if (Math.abs(c.v) + Math.abs(c.s) + Math.abs(c.w) > 0.05) stepCar(c, { throttle: 0, steer: 0, handbrake: true }, dt, this.carEnv(c));
      else { c.v = 0; c.s = 0; c.w = 0; }
    }
    // crew leaving after a job
    for (const p of [...this.peds.values()]) if (p.leaveT && this.t > p.leaveT && !this.anyoneSees(p.x, 1, p.z)) this.removePed(p);
  }

  // cars running people over
  stepImpacts() {
    for (const c of this.cars.values()) {
      const spd = Math.abs(c.v);
      if (spd < 2.5) continue;
      const driver = this.players.find((p) => p.car === c.id && p.seat === 0) || null;
      const [vx, vz] = carVel(c);
      for (const p of this.peds.values()) {
        if (p.dead || p.inCar != null) continue;
        if (Math.abs(p.x - c.x) > 4 || Math.abs(p.z - c.z) > 4) continue;
        if (!circleVsCar(p.x, p.z, PED.r + 0.1, c)) continue;
        if (p.hitBy === c.id && this.t - p.hitT < 1) continue;
        p.hitBy = c.id; p.hitT = this.t;
        p.vx = vx * 0.9; p.vz = vz * 0.9;
        this.emit({ t: 'fx', k: 'thud', x: r2(p.x), z: r2(p.z), n: Math.min(1, spd / 20) });
        this.hurtPed(p, spd * 5.5, driver, { knock: true });
        if (driver && p.kind === 'civ') this.police.crime(driver, 0.3);
      }
      for (const q of this.players) {
        if (q.state !== 'alive' || q.car != null) continue;
        if (driver && driver.id === q.id) continue;
        if (Math.abs(q.x - c.x) > 4 || Math.abs(q.z - c.z) > 4) continue;
        if (!circleVsCar(q.x, q.z, PLAYER_R + 0.1, c)) continue;
        if (q.hitBy === c.id && this.t - q.hitT < 1) continue;
        q.hitBy = c.id; q.hitT = this.t;
        this.hurtPlayer(q, driver ? spd * 1.5 : spd * 3, { dir: [vx, vz] });
        this.emit({ t: 'knock', vx: r2(vx * 0.7), vz: r2(vz * 0.7) }, q.id);
      }
    }
  }

  stepPickups() {
    for (const pk of [...this.pickups.values()]) {
      if (pk.until && this.t > pk.until) { this.pickups.delete(pk.id); continue; }
      if (pk.gone) { if (this.t > pk.backAt) pk.gone = false; continue; }
      for (const p of this.players) {
        if (p.state !== 'alive') continue;
        const pos = this.playerPos(p);
        const r = p.car != null ? 2.6 : 1.3;
        if (Math.abs(pos.x - pk.x) > r || Math.abs(pos.z - pk.z) > r) continue;
        if (p.car != null && pk.kind !== 'cash') continue;
        if (!this.collect(p, pk)) continue;
        if (pk.respawn) { pk.gone = true; pk.backAt = this.t + pk.respawn; } else this.pickups.delete(pk.id);
        break;
      }
    }
  }

  // ------------------------------------------------------------ streaming
  // people and traffic appear round the players and go when nobody's near
  stream() {
    const alive = this.players.filter((p) => p.state === 'alive');
    if (!alive.length) return;
    const pos = alive.map((p) => this.outPos(p));
    const nearest = (x, z) => Math.min(...pos.map((q) => Math.hypot(q.x - x, q.z - z)));

    // despawn
    for (const p of [...this.peds.values()]) {
      if (p.keep || p.inCar != null) continue;
      const d = nearest(p.x, p.z);
      if (d > DESPAWN || (p.dead && p.deadT > 25 && !this.anyoneSees(p.x, 0.5, p.z)) || (p.kind === 'cop' && d > 90 && !p.target)) this.removePed(p);
    }
    for (const c of [...this.cars.values()]) {
      if (this.players.some((p) => p.car === c.id)) continue;
      const d = nearest(c.x, c.z);
      if (c.mission || (c.owner && !c.dead)) continue;
      if (d > DESPAWN + 20 || (c.dead && c.wreckT > 45 && !this.anyoneSees(c.x, 1, c.z))) this.removeCar(c);
    }

    // pedestrians
    const civs = [...this.peds.values()].filter((p) => p.kind === 'civ' && !p.dead).length;
    const wantPeds = Math.min(PEDS_MAX, PEDS_PER_PLAYER * alive.length);
    for (let n = 0; n < Math.min(4, wantPeds - civs); n++) {
      const who = pos[Math.floor(this.rng() * pos.length)];
      for (let tries = 0; tries < 12; tries++) {
        const a = WALK_NODES[Math.floor(this.rng() * WALK_NODES.length)];
        const l = a.links[Math.floor(this.rng() * a.links.length)];
        if (l.cross) continue;
        const b = WALK_NODES[l.to];
        const t = this.rng();
        const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        const d = Math.hypot(x - who.x, z - who.z);
        if (d < SPAWN_NEAR - 15 || d > SPAWN_FAR) continue;
        if (nearest(x, z) < SPAWN_NEAR - 20) continue;
        if (this.anyoneSees(x, 1, z) && d < 70) continue;
        const p = makePed('civ', x, z, Math.floor(this.rng() * PED_LOOKS));
        this.crowd.placeOnWalk(p, a.id, b.id, t);
        p.pace = 0.85 + this.rng() * 0.35;
        this.addPed(p);
        break;
      }
    }

    // traffic
    const traffic = [...this.cars.values()].filter((c) => c.ai && c.ai.mode !== 'park' && !c.dead && !c.mission && !c.chasing).length;
    const wantCars = Math.min(TRAFFIC_MAX, TRAFFIC_PER_PLAYER * alive.length);
    for (let n = 0; n < Math.min(2, wantCars - traffic); n++) {
      const who = pos[Math.floor(this.rng() * pos.length)];
      const near = edgesNear(who.x, who.z, SPAWN_FAR + 15);
      if (!near.length) continue;
      for (let tries = 0; tries < 14; tries++) {
        const e = near[Math.floor(this.rng() * near.length)];
        const L = lane(e.id, this.rng() < 0.5 ? e.a : e.b);
        const t = 0.1 + this.rng() * 0.8;
        const x = L.x0 + (L.x1 - L.x0) * t, z = L.z0 + (L.z1 - L.z0) * t;
        const d = Math.hypot(x - who.x, z - who.z);
        if (d < SPAWN_NEAR || d > SPAWN_FAR + 15) continue;
        if (nearest(x, z) < SPAWN_NEAR - 10) continue;
        if (this.carAt(x, z, 7)) continue;
        if (this.anyoneSees(x, 1, z) && d < 80) continue;
        const r = this.rng();
        const type = r < 0.5 ? 'sedan' : r < 0.66 ? 'taxi' : r < 0.76 ? 'van' : r < 0.86 ? 'pickup' : r < 0.93 ? 'sports' : 'police';
        const c = this.spawnCar(type, x, z, L.h);
        c.ai = new Driver(this, c, 'cruise');
        c.driverLook = type === 'police' ? LOOK_COP : Math.floor(this.rng() * PED_LOOKS);
        c.v = c.ai.cruise * 0.8;
        if (type === 'police') c.crew = 2;
        break;
      }
    }

    // parked cars
    PARKING.forEach((sp, i) => {
      const S = this.spots[i];
      if (S.car != null || this.homeSpots.includes(i)) return;     // (yours are kept for your car)
      const d = nearest(sp.x, sp.z);
      if (d > 105 || d < 30) return;
      if (S.cool > this.t) return;
      if (this.carAt(sp.x, sp.z, 3)) return;
      if (this.anyoneSees(sp.x, 1, sp.z) && d < 60) return;
      const type = sp.type || (this.rng() < 0.6 ? 'sedan' : this.rng() < 0.5 ? 'pickup' : this.rng() < 0.5 ? 'van' : 'sports');
      const c = this.spawnCar(type, sp.x, sp.z, sp.h, { police: type === 'police' });
      c.parkedSpot = i;
      S.car = c.id;
      S.cool = this.t + 30;
    });
    for (const c of [...this.cars.values()]) {
      if (c.parkedSpot == null) continue;
      if (nearest(c.x, c.z) > 140) this.removeCar(c);
    }
  }

  // ------------------------------------------------------------ snapshot
  snapshot() {
    const view = (p) => {
      const pos = this.playerPos(p);
      return [p.id, r2(pos.x), r2(pos.z), r2(p.y), r2(p.h), r2(p.ay), r2(p.ap), p.anim, p.w, Math.max(0, Math.round(p.hp)), Math.round(p.armor), p.car ?? -1, p.seat, p.wanted,
        p.money, (p.state === 'alive' ? 0 : p.state === 'wasted' ? 1 : 2) | (p.aim ? 4 : 0) | (p.searching ? 8 : 0) | (p.carry ? 16 : 0), p.ammo.map((a) => (a === Infinity ? -2 : a)), p.clip.slice(), p.ownCar ?? -1];
    };
    const cars = [];
    const night = sunAt(hourAt(this.t)).night;
    for (const c of this.cars.values()) {
      const flags = (c.siren ? 1 : 0) | (c.lights || (c.ai && night > 0.15) ? 2 : 0) | (c.fire ? 4 : 0) | (c.dead ? 8 : 0) | (c.ai?.horn ? 16 : 0) | (c.ai && c.ai.mode !== 'park' && c.driverLook != null ? 32 : 0) | (c.police ? 64 : 0) | ((c.riders || []).length ? 128 : 0);
      cars.push([c.id, CAR_KEYS.indexOf(c.type), c.paint, r2(c.x), r2(c.z), r2(c.h), r2(c.v), r2(c.steer), Math.round(c.hp), flags, c.driverLook ?? -1, r2(c.s), r2(c.w)]);
    }
    const peds = [];
    for (const p of this.peds.values()) {
      if (p.inCar != null) continue;
      peds.push([p.id, p.look, r2(p.x), r2(p.z), r2(p.h), p.anim, p.w || 0, p.dead ? 1 : 0, r2(p.v || 0)]);
    }
    const pk = [];
    for (const k of this.pickups.values()) if (!k.gone) pk.push([k.id, k.kind, r2(k.x), r2(k.z)]);
    const ob = [];
    for (const o of this.objects.values()) ob.push([o.id, o.kind, r2(o.x), r2(o.z), Math.round(o.hp)]);
    return { t: 's', T: r2(this.t), intro: this.introT < INTRO_LEN ? r2(this.introT) : -1, p: this.players.map(view), c: cars, n: peds, k: pk, o: ob };
  }
}

// a wreck still rolls to a stop
function stepCarDead(m, c, dt) {
  c.v *= Math.exp(-2 * dt);
  c.s *= Math.exp(-3 * dt);
  c.w *= Math.exp(-3 * dt);
  c.x += Math.sin(c.h) * c.v * dt;
  c.z += Math.cos(c.h) * c.v * dt;
  c.y = groundY(c.x, c.z);
}

export function carState(c) { return [r2(c.x), r2(c.z), r2(c.h), r2(c.v), r2(c.s), r2(c.w), r2(c.steer), Math.round(c.hp)]; }
export { TICK, TAXI_PAINT, areaName, carVsCar, ANIM_RUN };
