// Playing: your character (on foot, in third person) or your car, everyone
// else smoothed from the host's snapshots, the camera, shooting, the jobs'
// markers, pickups, the HUD, the radar and the sound.
//
// You move yourself and drive your own car here, with the same collision
// and car physics the host uses, and tell the host where you are; the host
// decides what your bullets hit, who's wanted, what's been picked up.

import * as THREE from 'three';
import { PLAYER_R, WALK, JOG, SPRINT, JUMP_V, GRAVITY, REACH, WEAPONS, TICK, PRICES, hourAt, clockText } from '../shared/config.js';
import { PLACES, groundY, areaName, inWater } from '../shared/city.js';
import { INTERIOR, INTERIORS, GIVER_ROOMS, interiorAt, worldSolids } from '../shared/interiors.js';
import { makeCar, stepCar, CAR_TYPES, CAR_KEYS } from '../shared/car.js';
import { circleVsCar, rayCar, rayPerson } from '../shared/collide.js';
import { PEOPLE, NAMES, HELP, PACKAGES } from '../shared/story.js';
import { PersonView, PLAYER_LOOKS, GIVER_LOOKS, template, gunModel } from './people.js';
import { CarView, prewarmCars } from './vehicles.js';
import { Opening } from './opening.js';
import { Fx, makeMarker, makePickup } from './fx.js';
import { Radar } from './radar.js';
import { sound } from './audio.js';
import { voice } from './voice.js';
import { PED_LOOKS, LOOK_COP, LOOK_GANG, LOOK_CREW, LOOK_BOSS, LOOK_DRE, LOOK_VOSS } from '../host/peds.js';

const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;
const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const lerpA = (a, b, k) => a + wrap(b - a) * k;
const SEAT_TMP = new THREE.Vector3();
const DELAY = 0.15;              // how far behind the host's clock others are drawn

// my animation codes (the host passes them on to everyone else)
const AN = { idle: 0, walk: 1, run: 2, aim: 3, jump: 10 };

// a short history of where something was, to draw it a moment in the past
class Track {
  constructor() { this.s = []; }
  push(t, v) {
    const last = this.s[this.s.length - 1];
    if (last && t <= last[0]) return;
    this.s.push([t, v]);
    if (this.s.length > 10) this.s.shift();
  }
  // v: [x, z, h, ...rest]; angles at index 2
  at(t) {
    const s = this.s;
    if (!s.length) return null;
    if (t <= s[0][0]) return s[0][1];
    for (let i = s.length - 1; i >= 0; i--) {
      if (s[i][0] <= t) {
        const a = s[i], b = s[i + 1];
        if (!b) {
          // past the newest: carry on a little the way it was going
          const v = a[1].slice();
          const dt = Math.min(0.25, t - a[0]);
          if (v[3] != null && v.length > 5) { v[0] += Math.sin(v[2]) * v[3] * dt; v[1] += Math.cos(v[2]) * v[3] * dt; }
          return v;
        }
        const k = (t - a[0]) / (b[0] - a[0]);
        return a[1].map((x, j) => (j === 2 ? lerpA(x, b[1][j], k) : typeof x === 'number' ? x + (b[1][j] - x) * k : b[1][j]));
      }
    }
    return s[0][1];
  }
}

export class Game {
  constructor({ renderer, post, world, link, start, hud, input, settings }) {
    this.renderer = renderer;
    this.post = post;
    this.world = world;
    this.link = link;
    this.hud = hud;
    this.input = input;
    this.settings = settings;
    this.me = link.id;
    this.isHost = start.host === link.id;
    this.roster = start.roster;
    this.myIdx = Math.max(0, this.roster.findIndex((r) => r.id === this.me));
    this.myColor = this.roster[this.myIdx]?.color ?? 0;
    this.camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.12, 2700);
    this.solids = worldSolids();
    this.fx = new Fx(world);
    this.radar = new Radar($('radar'), $('mapCanvas'));
    // you wake up at your place (where the host puts you too)
    const S = INTERIOR.home.spots.wake;
    this.p = { x: S.x - (this.myIdx % 2) * 1.1, z: S.z + Math.floor(this.myIdx / 2) * 1.1, y: 0, vy: 0, h: S.h, speed: 0, anim: 0, kx: 0, kz: 0, downT: 0 };
    this.room = null;           // the room you're in (null: outdoors)
    this.opening = new Opening(this);
    this.tutorial = null;       // (after the opening: go and see Dre)
    this.doorArmed = true;      // (false just after a door, until you step off it)
    this.doorT = 0;
    this.camYaw = 0;
    this.camPitch = 0.18;
    this.camDist = 3.6;
    this.camLook = 0;           // seconds since you last moved the mouse
    this.shake = 0;
    this.aim = false;
    this.w = 0;
    this.me$ = { hp: 100, armor: 0, money: 0, wanted: 0, ammo: WEAPONS.map((w, k) => (k ? -1 : -2)), clip: WEAPONS.map(() => 0), state: 0, searching: false, carry: false };
    this.myCar = null;          // { id, c } while I'm driving
    this.ride = null;           // { id, seat } while I'm a passenger
    this.pending = null;
    this.T = 0;
    this.lastT = 0;
    this.lastLocal = performance.now() / 1000;
    this.sendT = 0;
    this.lastShot = -9;
    this.reloadUntil = 0;
    this.stepAcc = 0;
    this.areaT = 0;
    this.area = '';
    this.mission = { title: '', text: '', blips: [], cut: false, active: false };
    this.intro = -1;
    this.mapOpen = false;
    this.shopOpen = false;
    this.helpQueue = [...HELP];
    this.helpT = 4;
    this.crashT = 0;
    this.radioOn = true;
    this.countAt = null;

    // everyone and everything we've seen
    this.cars = new Map();       // id -> { view, track, flags, type, hp, driver }
    this.peds = new Map();       // id -> { view, track, look, dead }
    this.others = new Map();     // player id -> { view, track, row }
    this.pickups = new Map();    // id -> mesh
    this.objects = new Map();    // id -> mesh
    this.markers = new Map();    // key -> mesh
    this.givers = new Map();     // giver -> PersonView
    this.drivers = new Map();    // car id -> PersonView (people at the wheel of traffic)
    this.arrows = [];
    this.myView = new PersonView(world.scene, PLAYER_LOOKS[this.myColor % 4], { lite: false });
    this.prewarm();
    // the gun shop counter, the diner counter, your bed, and every door
    const I = INTERIOR;
    this.addMarker('shop', I.guns.spots.shop.x, I.guns.spots.shop.z, 'shop', 0.7);
    this.addMarker('eat', I.diner.spots.eat.x, I.diner.spots.eat.z, 'eat', 0.7);
    this.addMarker('save', I.home.spots.save.x, I.home.spots.save.z, 'save', 0.7);
    for (const R of INTERIORS) this.addMarker(`door:${R.id}`, R.door.x, R.door.z, 'door', 0.55);
    // the people behind the counters
    this.clerks = [];
    const CLERK = { clerk: 3, cook: 9 };
    for (const R of INTERIORS) for (const q of R.people) { const v = new PersonView(world.scene, CLERK[q.look] ?? 0); v.set(q.x, q.z, q.h, 0); v.room = R.id; this.clerks.push(v); }

    const L = link;
    this.off = [
      L.on('s', (m) => this.onSnapshot(m)),
      L.on('mission', (m) => this.onMission(m)),
      L.on('say', (m) => this.onSay(m)),
      L.on('bark', (m) => this.onBark(m)),
      L.on('banner', (m) => this.onBanner(m)),
      L.on('fx', (m) => this.onFx(m)),
      L.on('hurt', (m) => { this.hud.hurt(m.n); this.shake = Math.min(1, this.shake + m.n / 40); }),
      L.on('knock', (m) => { this.p.kx = m.vx; this.p.kz = m.vz; this.p.downT = 1.2; }),
      L.on('entered', (m) => this.onEntered(m)),
      L.on('exited', (m) => this.onExited(m)),
      L.on('respawn', (m) => this.onRespawn(m)),
      L.on('weapon', (m) => { this.w = m.w; }),
      L.on('reload', (m) => { this.reloadUntil = this.T + m.s; sound.reload(); }),
      L.on('shop', (m) => { this.shopMsg = m.ok ? (m.text || 'Thanks.') : m.text; sound.jingle(m.ok ? 'cash' : 'failed'); if (!this.shopOpen && m.text) this.hud.say(null, m.text, '', 2.5); }),
      L.on('countdown', (m) => { this.countAt = m.at; }),
      L.on('credits', () => this.credits()),
      L.on('shush', () => { voice.stop(); this.hud.clearSubs(); for (const t of this.sayTimers || []) clearTimeout(t); this.sayTimers = []; }),
    ];
    this.shopKeys = (e) => this.onShopKey(e);
    addEventListener('keydown', this.shopKeys);
    this.shopClick = (e) => { const b = e.target.closest('button[data-buy]'); if (b) this.link.send({ t: 'buy', item: b.dataset.buy }); };
    $('shop').addEventListener('click', this.shopClick);
    hud.show();
    hud.money(0);
    sound.setScene('city', 1);
  }

  // build every body and car once now, so nobody's first appearance stalls
  prewarm() {
    const g = new THREE.Group();
    const looks = [...Array(PED_LOOKS).keys(), LOOK_COP, LOOK_GANG, LOOK_CREW, LOOK_BOSS, LOOK_DRE, LOOK_VOSS];
    for (const l of looks) template(l);
    for (const k of PLAYER_LOOKS) template(k, { lite: false });
    const v = new PersonView(g, 0);
    v.root.position.y = -50;
    const undo = prewarmCars(g);
    this.world.scene.add(g);
    this.renderer.compile(this.world.scene, this.camera);
    this.world.scene.remove(g);
    undo();
  }

  // ------------------------------------------------------------ messages
  onSnapshot(s) {
    const now = performance.now() / 1000;
    // the host's clock, smoothed
    const est = this.lastT + (now - this.lastLocal);
    this.lastT = Math.abs(s.T - est) > 1 ? s.T : est + (s.T - est) * 0.1;
    this.lastLocal = now;
    if (this.intro >= 0 && s.intro < 0) this.endOpening();
    this.intro = s.intro;
    this.opening.sync(s.intro);
    const seen = new Set();
    // players
    for (const r of s.p) {
      const [id, x, z, y, h, ay, ap, anim, w, hp, armor, car, seat, wanted, money, flags, ammo, clip, ownCar] = r;
      if (id === this.me) {
        const M = this.me$;
        if (M.money !== money && M.money != null && money > M.money) sound.jingle('cash');
        Object.assign(M, { hp, armor, money, wanted, ammo, clip, state: flags & 3, searching: !!(flags & 8), carry: !!(flags & 16), car, seat, ownCar: ownCar ?? -1 });
        if (WEAPONS[this.w] && ammo[this.w] === -1 && this.w !== 0) this.w = 0;
        // the host took me out of a car (it blew up, I was arrested)
        if (car < 0 && (this.myCar || this.ride) && !this.pending) { this.myCar = null; this.ride = null; }
        continue;
      }
      let O = this.others.get(id);
      if (!O) {
        const ros = this.roster.find((q) => q.id === id);
        O = { view: new PersonView(this.world.scene, PLAYER_LOOKS[(ros?.color ?? 0) % 4], { lite: false }), track: new Track(), name: ros?.name || 'Friend', color: ros?.color ?? 0 };
        this.others.set(id, O);
      }
      O.row = r;
      O.track.push(s.T, [x, z, h, y]);
      seen.add(id);
    }
    for (const [id, O] of this.others) if (!seen.has(id)) { O.view.dispose(); this.others.delete(id); }
    // cars
    seen.clear();
    for (const r of s.c) {
      const [id, ti, paint, x, z, h, v, steer, hp, flags, dl, sl, yw] = r;
      let C = this.cars.get(id);
      if (!C) {
        C = { view: new CarView(this.world.scene, CAR_KEYS[ti], paint), track: new Track(), type: CAR_KEYS[ti] };
        this.cars.set(id, C);
      }
      C.view.setPaint(paint);
      C.flags = flags; C.hp = hp; C.driverLook = dl; C.paint = paint;
      C.track.push(s.T, [x, z, h, v, steer, sl, yw]);
      seen.add(id);
    }
    for (const [id, C] of this.cars) if (!seen.has(id)) { C.view.dispose(); this.cars.delete(id); const d = this.drivers.get(id); if (d) { d.dispose(); this.drivers.delete(id); } }
    // people
    seen.clear();
    for (const r of s.n) {
      const [id, look, x, z, h, anim, w, dead, v] = r;
      let P = this.peds.get(id);
      if (!P) {
        P = { view: new PersonView(this.world.scene, look), track: new Track(), look };
        this.peds.set(id, P);
      }
      P.anim = anim; P.w = w; P.dead = dead;
      P.track.push(s.T, [x, z, h, v]);
      seen.add(id);
    }
    for (const [id, P] of this.peds) if (!seen.has(id)) { P.view.dispose(); this.peds.delete(id); }
    // pickups and job props
    seen.clear();
    for (const [id, kind, x, z] of s.k) {
      seen.add(id);
      if (this.pickups.has(id)) continue;
      const m = makePickup(kind, gunModel);
      m.position.set(x, groundY(x, z), z);
      m.userData.kind = kind;
      this.world.scene.add(m);
      this.pickups.set(id, m);
    }
    for (const [id, m] of this.pickups) if (!seen.has(id)) { m.removeFromParent(); this.pickups.delete(id); }
    seen.clear();
    for (const [id, kind, x, z] of s.o) {
      seen.add(id);
      if (this.objects.has(id)) continue;
      const m = makePickup(kind, gunModel);
      m.position.set(x, groundY(x, z), z);
      this.world.scene.add(m);
      this.objects.set(id, m);
    }
    for (const [id, m] of this.objects) if (!seen.has(id)) { m.removeFromParent(); this.objects.delete(id); }
  }

  onMission(m) {
    // (the scene's first line can arrive just before this: count lines from
    // the end of the last scene)
    if (m.cut && !this.mission.cut) this.cutFade = 1;
    if (!m.cut && this.mission.cut) { this.cutFade = 1; this.cutLine = 0; }
    this.mission = m;
    this.hud.mission(m.text || '');
    this.hud.cinematic(!!m.cut);
    // markers in the world for the places on the radar
    const want = new Map();
    for (const b of m.blips) {
      if (b.k === 'giver') want.set(`giver:${b.l}`, ['giver', b.ix ?? b.x, b.iz ?? b.z, 0.9]);
      if (b.k === 'dest') want.set(`dest:${b.x}:${b.z}`, ['dest', b.x, b.z, Math.min(b.r || 4, 6)]);
      if (b.k === 'check' || b.k === 'check2') want.set(`${b.k}:${b.x}:${b.z}`, [b.k, b.x, b.z, b.k === 'check' ? 6.5 : 4]);
    }
    for (const [k, m2] of this.markers) if (!want.has(k) && !k.startsWith('fixed:')) { m2.removeFromParent(); this.markers.delete(k); }
    for (const [k, [kind, x, z, r]] of want) if (!this.markers.has(k)) this.addMarker(k, x, z, kind, r, false);
    // the people with jobs, always in their offices (Dre's on your sofa,
    // unless he's out on a job)
    for (const key of Object.keys(PEOPLE)) {
      const show = !!INTERIOR[GIVER_ROOMS[key]];
      const v = this.givers.get(key);
      if (show && !v) {
        const g = new PersonView(this.world.scene, GIVER_LOOKS[key], { lite: false });
        const at = INTERIOR[GIVER_ROOMS[key]].spots.giver;
        g.set(at.x, at.z, at.h ?? 0, 0);
        this.givers.set(key, g);
      } else if (!show && v) { v.dispose(); this.givers.delete(key); }
    }
  }

  addMarker(key, x, z, kind, r, fixed = true) {
    const m = makeMarker(kind, r);
    m.position.set(x, groundY(x, z), z);
    this.world.scene.add(m);
    this.markers.set(fixed ? `fixed:${key}` : key, m);
  }

  onSay(m) {
    const go = () => {
      const radio = m.radio;
      const name = NAMES[m.who] || m.who;
      if (!radio) { this.talking = m.who; this.talkUntil = performance.now() / 1000 + (m.dur || 4); this.cutLine = (this.cutLine || 0) + 1; }
      this.hud.say(name, m.text, radio ? 'radio' : 'talk', m.dur || 4);
      if (radio) sound.radio();
      voice.say(m.text, radio ? 'radio' : m.who, { salt: m.who?.length || 0 });
    };
    this.sayTimers = (this.sayTimers || []).filter(Boolean);
    if (m.delay) this.sayTimers.push(setTimeout(go, m.delay * 1000)); else go();
  }

  onBark(m) {
    const me = this.pos();
    if (Math.hypot(m.x - me.x, m.z - me.z) > 22) return;
    this.hud.say('', m.text, 'bark', 2.2);
    if (Math.random() < 0.5) voice.say(m.text, m.cop ? 'cop' : 'ped', { salt: Math.floor(m.x) });
  }

  onBanner(m) {
    this.hud.banner(m.text, m.sub, m.kind);
    if (m.kind === 'passed' || m.kind === 'failed' || m.kind === 'wasted' || m.kind === 'busted') sound.jingle(m.kind);
    if (m.kind === 'mission') sound.jingle('missionStart');
    if (m.kind === 'package') sound.jingle('package');
  }

  onFx(m) {
    const F = this.fx, me = this.me;
    switch (m.k) {
      case 'shot': {
        const [ox, oy, oz] = m.o, [ex, ey, ez] = m.e;
        if (m.by !== me) {
          const dx = ex - ox, dz = ez - oz, d = Math.hypot(dx, dz) || 1;
          F.muzzle(ox, oy, oz, dx / d, dz / d);
          F.tracer([ox, oy, oz], [ex, ey, ez]);
          sound.gun(m.w, { x: ox, y: oy, z: oz });
          // other players' characters flinch their guns
        }
        if (m.hit) { F.impact(ex, ey, ez, m.hit); sound.ricochet({ x: ex, y: ey, z: ez }, m.hit); }
        break;
      }
      case 'boom': F.explosion(m.x, m.z); sound.explosion({ x: m.x, z: m.z }); { const me2 = this.pos(); const d = Math.hypot(m.x - me2.x, m.z - me2.z); this.shake = Math.min(1.5, this.shake + Math.max(0, 1.4 - d / 40)); } break;
      case 'crash': sound.crash({ x: m.x, z: m.z }, m.n); F.puff(m.x, groundY(m.x, m.z) + 0.8, m.z, [0.5, 0.48, 0.45]); break;
      case 'thud': sound.thud({ x: m.x, z: m.z }, m.n); break;
      case 'punch': { if (m.id !== me) { const O = this.others.get(m.id); if (O) O.view.rig.punch(); } const p = this.others.get(m.id)?.view || this.myView; sound.punch({ x: p.x, z: p.z }, m.hit); break; }
      case 'pickup': if (m.id === me) { sound.jingle(m.kind === 'cash' ? 'cash' : 'pickup'); } F.sparkle(m.x, groundY(m.x, m.z) + 1, m.z); break;
      case 'wanted': if (m.id === me && m.n > 0) sound.jingle('wanted'); break;
      case 'alarm': { const C = this.cars.get(m.car); if (C) sound.alarm({ x: C.view.x, z: C.view.z }); break; }
      case 'horn': { const C = this.cars.get(m.car); if (C && !(this.myCar && this.myCar.id === m.car)) sound.horn({ x: C.view.x, z: C.view.z }, 0.5); break; }
      case 'smash': F.puff(m.x, groundY(m.x, m.z) + 0.6, m.z, [0.45, 0.35, 0.2]); F.explosion(m.x, m.z); sound.crash({ x: m.x, z: m.z }, 0.8); break;
      case 'grab': if (m.id === me) { sound.crash(null, 0.3); this.shake = 1; } break;
      case 'missionStart': case 'passed': case 'failed': break;
      case 'checkpoint': sound.jingle('checkpoint'); break;
      default:
    }
  }

  onEntered(m) {
    this.pending = null;
    const C = this.cars.get(m.car);
    sound.door();
    if (m.seat === 0) {
      const v = C ? C.track.at(this.renderT()) : null;
      const cs = m.cs || (v ? [v[0], v[1], v[2], 0, 0, 0, 0] : [this.p.x, this.p.z, 0, 0, 0, 0, 0]);
      const c = makeCar(m.car, C ? C.type : 'sedan', cs[0], cs[1], cs[2]);
      c.v = cs[3] || 0; c.s = cs[4] || 0; c.w = cs[5] || 0; c.steer = cs[6] || 0;
      this.myCar = { id: m.car, c };
      this.camYaw = c.h + Math.PI;
      this.hud.carName(CAR_TYPES[c.type].name);
    } else {
      this.ride = { id: m.car, seat: m.seat };
      if (C) this.hud.carName(CAR_TYPES[C.type].name);
    }
  }

  onExited(m) {
    this.pending = null;
    this.myCar = null;
    this.ride = null;
    this.p.x = m.x; this.p.z = m.z;
    this.p.y = 0; this.p.vy = 0;
    sound.door();
    sound.screech(0);
  }

  onRespawn(m) {
    this.myCar = null;
    this.ride = null;
    this.pending = null;
    Object.assign(this.p, { x: m.x, z: m.z, h: m.h, y: 0, vy: 0, kx: 0, kz: 0, downT: 0 });
    this.camYaw = m.h + Math.PI;
    this.w = 0;
    this.doorArmed = false;
  }

  endOpening() {
    this.opening.end();
    voice.stop();
    this.hud.clearSubs();
    this.myView.root.visible = true;
    this.room = null;            // (worked out again next frame)
    this.camYaw = this.p.h + Math.PI;
    this.camPitch = 0.22;
    this.cutFade = 1;
    if (this.opening.t > 1 && !this.mission.active) this.tutorial = 'talk';
  }

  // the first minute: go and see Dre, in the living room
  tutorialText() {
    const T = this.tutorial;
    if (!T) return null;
    if (this.mission.active) { this.tutorial = null; return null; }
    return this.room === 'home' ? "~b~Dre~w~'s in the living room. Walk into the ring in front of him to start." : 'Go home: ~b~Dre~w~ is waiting (~g~D~w~ on the radar).';
  }

  credits() {
    const lines = [['GTA 7', 'The End'], ['Thanks for playing', `San Cielo is still yours. Find all ${PACKAGES.length} hidden packages.`]];
    lines.forEach(([a, b], i) => setTimeout(() => this.hud.banner(a, b, 'credits'), 5000 + i * 4500));
  }

  // ------------------------------------------------------------ helpers
  renderT() { return this.lastT + (performance.now() / 1000 - this.lastLocal) - DELAY; }
  hostNow() { return this.lastT + (performance.now() / 1000 - this.lastLocal); }

  // where I am (my car, the car I'm riding in, or me)
  pos() {
    if (this.myCar) return this.myCar.c;
    if (this.ride) { const C = this.cars.get(this.ride.id); if (C) return { x: C.view.x, z: C.view.z, h: C.view.h }; }
    return this.p;
  }

  alive() { return this.me$.state === 0; }
  locked() { return this.intro >= 0 || this.mission.cut || !this.alive() || this.mapOpen || this.shopOpen; }

  // weapons I have, in order
  owned() { return WEAPONS.map((w, k) => k).filter((k) => k === 0 || this.me$.ammo[k] > 0 || this.me$.ammo[k] === -2); }

  // the cars near a point, as plain boxes (for my own car's collisions)
  nearCars(x, z, r, skip = null) {
    const out = [];
    for (const [id, C] of this.cars) {
      if (id === skip) continue;
      const v = C.view;
      if (Math.abs(v.x - x) > r || Math.abs(v.z - z) > r) continue;
      const T = CAR_TYPES[C.type];
      out.push({ id, x: v.x, z: v.z, h: v.h, hl: T.len / 2, hw: T.wid / 2, ht: T.ht, type: C.type, v: C.v || 0, s: 0 });
    }
    return out;
  }

  // ------------------------------------------------------------ the frame
  update(dt) {
    const I = this.input;
    this.T = this.hostNow();
    // mouse: the camera
    if (I.locked && !this.mapOpen && !this.shopOpen) {
      const k = 0.0022 * this.settings.sens * (this.aim ? 0.6 : 1);
      this.camYaw -= I.mx * k;
      this.camPitch += I.my * k * (this.settings.invert ? -1 : 1);
      this.camPitch = Math.max(-0.75, Math.min(1.25, this.camPitch));
      if (I.mx || I.my) this.camLook = 0;
    }
    this.camLook += dt;
    this.handleKeys(dt);
    if (this.myCar) this.drive(dt);
    else if (!this.ride) this.walk(dt);
    this.doors(dt);
    // which room you're in (the city's hidden while you are)
    const room = !this.myCar && !this.ride ? interiorAt(this.p.x, this.p.z) : null;
    if ((room?.id ?? null) !== this.room && this.intro < 0) {
      this.room = room?.id ?? null;
      this.world.setRoom(this.room);
      if (room) this.hud.area(room.name);
      this.area = null;
      this.areaT = room ? 99 : 0;
    }
    this.combat(dt);
    // tell the host where we are
    this.sendT -= dt;
    if (this.sendT <= 0) { this.sendT = TICK; this.send(); }
    this.doorFade = (this.doorFade || 0) + ((this.fadeTo || 0) - (this.doorFade || 0)) * Math.min(1, dt * 16);
    this.updateViews(dt);
    this.placeCamera(dt);
    this.updateHud(dt);
    this.updateSound(dt);
    this.fx.update(dt);
    this.world.update(this.T);
    // the time of day (the sky, the sun, lamps and lit windows)
    const hour = hourAt(this.T);
    if (Math.abs(hour - (this.lastHour ?? -9)) > 0.01 || this.world.indoors !== this.wasIndoors) { this.world.setTime(hour); this.lastHour = hour; this.wasIndoors = this.world.indoors; }
    CarView.night = this.world.sunState.night;
    I.endFrame();
  }

  handleKeys(dt) {
    const I = this.input;
    if (I.hit('KeyM') && !this.shopOpen) this.toggleMap();
    if (this.mapOpen && I.hit('Escape')) this.toggleMap();
    if (I.hit('Space') && (this.intro >= 0 || this.mission.cut)) this.link.send({ t: 'skip' });
    if (this.locked()) return;
    // in and out of cars
    if (I.hit('KeyF') && !this.pending) {
      if (this.myCar || this.ride) { this.link.send({ t: 'exit' }); this.pending = 'exit'; setTimeout(() => { if (this.pending === 'exit') this.pending = null; }, 1500); } else {
        const near = this.nearestCar();
        if (near) { this.link.send({ t: 'enter', car: near.id }); this.pending = 'enter'; setTimeout(() => { if (this.pending === 'enter') this.pending = null; }, 1500); }
      }
    }
    // weapons: Q / E / the wheel
    const step = (I.hit('KeyE') && !this.atShop() ? 1 : 0) - (I.hit('KeyQ') ? 1 : 0) + (I.wheel > 0 ? 1 : I.wheel < 0 ? -1 : 0);
    if (step && !this.myCar) {
      const list = this.owned();
      const i = Math.max(0, list.indexOf(this.w));
      this.w = list[(i + step + list.length) % list.length];
      sound.click();
    }
    for (let k = 0; k < 4; k++) if (I.hit(`Digit${k + 1}`) && this.owned().includes(k) && !this.shopOpen) this.w = k;
    if (this.myCar) {
      if (I.hit('KeyH')) { this.link.send({ t: 'horn' }); sound.horn(null, 0.5, 1); }
      if (I.hit('KeyG') && this.myCar.c.type === 'police') this.link.send({ t: 'siren' });
      if (I.hit('KeyR')) { this.radioOn = !this.radioOn; if (this.radioOn) sound.nextSong(); }
    }
    // the gun shop, the diner
    if (I.hit('KeyE') && this.atShop() && !this.myCar) this.openShop(true);
    if (I.hit('KeyE') && this.atDiner()) this.link.send({ t: 'buy', item: 'meal' });
  }

  nearestCar() {
    let best = null, bd = Infinity;
    for (const [id, C] of this.cars) {
      if (C.flags & 8) continue;
      const v = C.view;
      const d = Math.hypot(v.x - this.p.x, v.z - this.p.z);
      if (d < REACH + CAR_TYPES[C.type].len / 2 && d < bd) { bd = d; best = { id, C }; }
    }
    return best;
  }
  atShop() { const G = INTERIOR.guns.spots.shop; return !this.myCar && !this.ride && Math.hypot(this.p.x - G.x, this.p.z - G.z) < 1.6; }
  atDiner() { const E = INTERIOR.diner.spots.eat; return !this.myCar && !this.ride && Math.hypot(this.p.x - E.x, this.p.z - E.z) < 1.4; }

  // ------------------------------------------------------------ doors
  // Walk into a door: a quick fade to black, and you're on the other side.
  doors(dt) {
    const p = this.p;
    this.doorT = Math.max(0, this.doorT - dt);
    if (this.myCar || this.ride || this.doorT > 0 || !this.alive()) return;
    const R = this.room ? INTERIOR[this.room] : null;
    const near = R ? [[R, R.exit, 'out']] : INTERIORS.map((q) => [q, q.door, 'in']);
    let any = false;
    for (const [room, at, way] of near) {
      const d = Math.hypot(p.x - at.x, p.z - at.z);
      if (d < 1.5) any = true;
      if (d > 0.75 || !this.doorArmed) continue;
      if (way === 'in' && this.me$.wanted > 0) { this.doorNote = 'The door won\'t open with the police after you.'; continue; }
      this.goThrough(room, way);
      return;
    }
    if (!any) { this.doorArmed = true; this.doorNote = null; }
  }

  goThrough(R, way) {
    this.doorT = 0.9;
    this.doorArmed = false;
    this.fadeTo = 1;
    sound.door();
    setTimeout(() => {
      const p = this.p;
      const at = way === 'in' ? R.entry : { x: R.door.x + Math.sin(R.door.h) * 0.35, z: R.door.z + Math.cos(R.door.h) * 0.35, h: R.door.h };
      Object.assign(p, { x: at.x, z: at.z, h: at.h, y: 0, vy: 0, speed: 0 });
      this.camYaw = at.h + Math.PI;
      this.camPitch = way === 'in' ? 0.28 : 0.18;
      this.camDist = 1.2;
      this.send();
      this.fadeTo = 0;
    }, 260);
  }

  // ------------------------------------------------------------ on foot
  walk(dt) {
    const I = this.input, p = this.p;
    const can = !this.locked() && p.downT <= 0;
    let fx = 0, fz = 0;
    if (can) {
      fz = (I.down('KeyW') || I.down('ArrowUp') ? 1 : 0) - (I.down('KeyS') || I.down('ArrowDown') ? 1 : 0);
      fx = (I.down('KeyD') || I.down('ArrowRight') ? 1 : 0) - (I.down('KeyA') || I.down('ArrowLeft') ? 1 : 0);
    }
    const y = this.camYaw;
    const fwdX = -Math.sin(y), fwdZ = -Math.cos(y), rX = Math.cos(y), rZ = -Math.sin(y);
    let mx = fwdX * fz + rX * fx, mz = fwdZ * fz + rZ * fx;
    const ml = Math.hypot(mx, mz);
    const carry = this.me$.carry;
    let speed = 0;
    if (ml > 0) {
      mx /= ml; mz /= ml;
      speed = this.aim ? WALK * 1.4 : carry ? WALK * 1.3 : I.down('ShiftLeft') || I.down('ShiftRight') ? SPRINT : I.down('AltLeft') ? WALK : JOG;
    }
    // knocked flying
    if (p.downT > 0) {
      p.downT -= dt;
      p.x += p.kx * dt; p.z += p.kz * dt;
      p.kx *= Math.exp(-3 * dt); p.kz *= Math.exp(-3 * dt);
    }
    const ox = p.x, oz = p.z;
    p.x += mx * speed * dt;
    p.z += mz * speed * dt;
    p.speed += (speed - p.speed) * Math.min(1, dt * 10);
    // facing: where you're going, or where you aim
    const aimH = Math.atan2(fwdX, fwdZ);
    if (this.aim || (this.firing && this.w !== 0)) p.h = lerpA(p.h, aimH, Math.min(1, dt * 18));
    else if (ml > 0) p.h = lerpA(p.h, Math.atan2(mx, mz), Math.min(1, dt * 12));
    // jumping
    const ground = groundY(p.x, p.z);
    if (can && I.hit('Space') && p.y <= 0.001) p.vy = JUMP_V;
    p.vy -= GRAVITY * dt;
    p.y = Math.max(0, p.y + p.vy * dt);
    if (p.y <= 0) p.vy = 0;
    // walls, cars, the water's edge
    this.solids.resolveCircle(p, PLAYER_R, ground + p.y, true);
    for (const c of this.nearCars(p.x, p.z, 5)) {
      const h = circleVsCar(p.x, p.z, PLAYER_R, c);
      if (h && p.y < 1.2) { p.x += h.nx * h.depth; p.z += h.nz * h.depth; }
    }
    if (inWater(p.x, p.z) && !inWater(ox, oz)) { p.x = ox; p.z = oz; }
    p.ground = groundY(p.x, p.z);
    p.anim = p.y > 0.05 ? AN.jump : this.aim && this.w ? AN.aim : speed > JOG + 0.5 ? AN.run : speed > WALK + 0.5 ? AN.run : speed > 0 ? AN.walk : AN.idle;
    // footsteps
    this.stepAcc += speed * dt;
    if (this.stepAcc > (speed > JOG ? 1.6 : 1.3) && p.y <= 0.01) { this.stepAcc = 0; sound.step(null, speed > JOG); }
  }

  // ------------------------------------------------------------ driving
  drive(dt) {
    const I = this.input, M = this.myCar, c = M.c;
    const can = !this.locked();
    const thr = can ? (I.down('KeyW') || I.down('ArrowUp') ? 1 : 0) - (I.down('KeyS') || I.down('ArrowDown') ? 1 : 0) : 0;
    const st = can ? (I.down('KeyD') || I.down('ArrowRight') ? 1 : 0) - (I.down('KeyA') || I.down('ArrowLeft') ? 1 : 0) : 0;
    const hb = can && I.down('Space');
    const C = this.cars.get(M.id);
    if (C && C.hp <= 0) c.dead = true;
    const env = this.carEnv || (this.carEnv = { solids: this.solids, cars: [], onHit: (car, impact) => {
      if (impact > 3) {
        this.shake = Math.min(1.2, this.shake + impact / 25);
        sound.crash(null, Math.min(1, impact / 20));
        if (this.crashT <= 0) { this.link.send({ t: 'crash', n: impact }); this.crashT = 0.3; }
      }
    } });
    env.cars = this.nearCars(c.x, c.z, 14, M.id);
    this.crashT -= dt;
    // small steps for a steady drive at any frame rate
    const n = Math.ceil(dt / (1 / 60));
    for (let k = 0; k < n; k++) stepCar(c, { throttle: thr, steer: st, handbrake: hb }, dt / n, env);
    this.throttle = thr;
    this.handbrake = hb;
    this.p.x = c.x; this.p.z = c.z; this.p.h = c.h;
  }

  // ------------------------------------------------------------ shooting
  combat(dt) {
    const I = this.input;
    const canShoot = !this.locked() && !this.myCar && this.p.downT <= 0 && !this.room;
    this.aim = canShoot && I.buttons.has(2) && this.w !== 0;
    this.firing = false;
    if (!canShoot) return;
    const W = WEAPONS[this.w];
    const held = I.buttons.has(0), click = I.clicks > 0;
    if (W.melee) {
      if (click && this.T - this.lastShot > 0.4 && !this.ride) { this.lastShot = this.T; this.link.send({ t: 'punch' }); this.myView.rig.punch(); }
      return;
    }
    if (!(W.auto ? held : click)) return;
    this.firing = true;
    if (this.T - this.lastShot < 1 / W.rate) return;
    if (this.T < this.reloadUntil) return;
    if (this.me$.ammo[this.w] <= 0) { if (click) sound.click(); return; }
    this.lastShot = this.T;
    // where the crosshair is pointing
    const cam = this.camera;
    const o = cam.position, d = cam.getWorldDirection(new THREE.Vector3());
    const t = this.aimRay(o, d, 140);
    const aimPt = o.clone().addScaledVector(d, t);
    // the muzzle: in front of you at chest height (or out of the car window)
    const src = this.pos();
    const h = Math.atan2(d.x, d.z);
    const mz = new THREE.Vector3(src.x + Math.sin(h) * 0.5 + Math.cos(h) * -0.22, (this.ride ? 1.3 + groundY(src.x, src.z) : 1.42 + this.p.y + (this.p.ground || 0)), src.z + Math.cos(h) * 0.5 - Math.sin(h) * -0.22);
    const dir = aimPt.clone().sub(mz).normalize();
    this.link.send({ t: 'fire', w: this.w, o: [r2(mz.x), r2(mz.y), r2(mz.z)], d: [r3(dir.x), r3(dir.y), r3(dir.z)] });
    this.fx.muzzle(mz.x, mz.y, mz.z, dir.x, dir.z);
    this.fx.tracer([mz.x, mz.y, mz.z], [aimPt.x, aimPt.y, aimPt.z]);
    sound.gun(this.w, null, true);
    this.camPitch -= (this.w === 3 ? 0.05 : 0.018);
    this.shake = Math.min(1, this.shake + (this.w === 3 ? 0.3 : 0.08));
  }

  // how far the crosshair's ray goes before it hits something
  aimRay(o, d, range) {
    let best = range;
    const wall = this.solids.ray(o.x, o.y, o.z, d.x, d.y, d.z, range);
    if (wall) best = wall.t;
    const skip = this.myCar?.id ?? this.ride?.id;
    for (const [id, C] of this.cars) {
      if (id === skip) continue;
      const v = C.view;
      const T = CAR_TYPES[C.type];
      const t = rayCar(o.x, o.y, o.z, d.x, d.y, d.z, { x: v.x, z: v.z, y: groundY(v.x, v.z), h: v.h, hl: T.len / 2, hw: T.wid / 2, ht: T.ht }, best);
      if (t >= 0 && t < best) best = t;
    }
    for (const P of this.peds.values()) {
      const t = rayPerson(o.x, o.y, o.z, d.x, d.y, d.z, { x: P.view.x, z: P.view.z, y: groundY(P.view.x, P.view.z) }, best);
      if (t > 1.5 && t < best) best = t;
    }
    for (const O of this.others.values()) {
      const t = rayPerson(o.x, o.y, o.z, d.x, d.y, d.z, { x: O.view.x, z: O.view.z, y: groundY(O.view.x, O.view.z) }, best);
      if (t > 1.5 && t < best) best = t;
    }
    return best;
  }

  send() {
    if (!this.alive()) return;
    const p = this.p;
    const msg = { t: 'st', x: r2(p.x), z: r2(p.z), y: r2(p.y), h: r2(p.h), v: r2(p.speed), a: p.anim, ay: r2(this.camYaw), ap: r2(this.camPitch), aim: this.aim, w: this.w };
    if (this.myCar) {
      const c = this.myCar.c;
      msg.cs = [r2(c.x), r2(c.z), r3(c.h), r2(c.v), r2(c.s), r3(c.w), r3(c.steer)];
      msg.lights = 1;
    }
    this.link.send(msg);
  }

  // ------------------------------------------------------------ drawing
  updateViews(dt) {
    const rt = this.renderT();
    // (indoors, the street's measured from the door, so what's out there
    // keeps moving on the radar)
    const me = this.room ? INTERIOR[this.room].door : this.pos();
    const t = this.T;
    // cars
    for (const [id, C] of this.cars) {
      const v = C.view;
      let x, z, h, spd, steer, slip = 0;
      if (this.myCar && this.myCar.id === id) {
        const c = this.myCar.c;
        x = c.x; z = c.z; h = c.h; spd = c.v; steer = c.steer; slip = c.s;
        v.braking = this.throttle < 0 && c.v > 0.5;
      } else {
        const s = C.track.at(rt);
        if (!s) continue;
        [x, z, h, spd, steer, slip] = s;
        C.v = spd;
      }
      const dist = Math.hypot(x - me.x, z - me.z), far = dist > 220;
      v.root.visible = !far;
      if (far) continue;
      v.near = dist < 70;
      v.place(x, z, h, spd, steer, C.flags | (this.myCar && this.myCar.id === id ? 2 : 0), dt, t);
      // smoke and flames
      const T = CAR_TYPES[C.type];
      const fire = (C.flags & 4) !== 0, dead = (C.flags & 8) !== 0;
      const fwd = [Math.sin(h) * T.len * 0.35, Math.cos(h) * T.len * 0.35];
      if (fire) this.fx.fire(x + fwd[0], z + fwd[1]);
      else if (dead) { if (Math.random() < 0.08) this.fx.carSmoke(x, z, true); } else if (C.hp < T.hp * 0.4 && Math.random() < 0.25) this.fx.carSmoke(x + fwd[0], z + fwd[1], C.hp < T.hp * 0.2);
      // somebody at the wheel (close enough to see)
      const showDriver = (C.flags & 32) !== 0 && C.driverLook >= 0 && Math.hypot(x - me.x, z - me.z) < 35;
      let d = this.drivers.get(id);
      if (showDriver && !d) { d = new PersonView(this.world.scene, C.driverLook); this.drivers.set(id, d); }
      if (!showDriver && d) { d.dispose(); this.drivers.delete(id); d = null; }
      if (d) this.seat(d, x, z, h, 0, C.type, dt);
    }
    // people
    for (const P of this.peds.values()) {
      const s = P.track.at(rt);
      if (!s) continue;
      const d = Math.hypot(s[0] - me.x, s[1] - me.z);
      const v = P.view;
      v.root.visible = d < 90;
      if (d >= 90) continue;
      v.set(s[0], s[1], s[2], P.anim, P.w, s[3]);
      // far ones move their limbs less often
      P.skip = (P.skip || 0) + 1;
      if (d > 40 && P.skip % 3) { v.root.position.set(s[0], groundY(s[0], s[1]), s[1]); v.root.rotation.y = s[2]; continue; }
      v.update(d > 40 ? dt * 3 : dt, { y: groundY(v.x, v.z), smooth: 30 });
    }
    // other players
    for (const O of this.others.values()) {
      const s = O.track.at(rt);
      if (!s || !O.row) continue;
      const [, , , , , ay, ap, anim, w, hp, , car, seat, , , flags] = O.row;
      const v = O.view;
      const down = (flags & 3) !== 0;
      if (car >= 0) {
        const C = this.cars.get(car);
        if (C) this.seat(v, C.view.x, C.view.z, C.view.h, seat, C.type, dt);
        continue;
      }
      v.root.visible = true;
      v.set(s[0], s[1], s[2], anim === 3 ? 3 : anim === 10 ? 0 : anim, w, null);
      v.update(dt, { pose: down ? ((flags & 3) === 2 ? 'hands' : 'collapse') : anim === 10 ? 'jump' : anim === 3 && w ? 'aim' : null, aimPitch: -ap * 0.8, y: groundY(v.x, v.z) + (s[3] || 0), smooth: 14 });
      void ay; void hp;
    }
    // me (the opening places me itself)
    const mv = this.myView;
    if (this.intro >= 0) { /* */ } else if (this.myCar || this.ride) {
      const id = this.myCar ? this.myCar.id : this.ride.id;
      const C = this.cars.get(id);
      const c = this.myCar ? this.myCar.c : C ? { x: C.view.x, z: C.view.z, h: C.view.h } : this.p;
      this.seat(mv, c.x, c.z, c.h, this.myCar ? 0 : this.ride.seat, C ? C.type : 'sedan', dt);
    } else {
      const p = this.p;
      mv.root.visible = true;
      mv.x = mv.tx = p.x; mv.z = mv.tz = p.z; mv.h = mv.th = p.h; mv.fresh = false;
      mv.anim = p.anim === AN.jump ? 0 : p.anim; mv.w = this.w;
      const pose = !this.alive() ? (this.me$.state === 2 ? 'hands' : 'collapse') : p.downT > 0 ? 'collapse' : p.anim === AN.jump ? 'jump' : (this.aim || this.firing) && this.w ? 'aim' : null;
      if (pose === 'aim') mv.anim = 3;
      mv.update(dt, { pose, aimPitch: -this.camPitch * 0.9, y: (p.ground || 0) + p.y, smooth: 1000 });
      mv.speed = p.speed;
    }
    // job givers, and the people behind the counters, in their rooms
    const talking = this.talking && performance.now() / 1000 < this.talkUntil ? this.talking : null;
    for (const [key, g] of this.givers) {
      g.root.visible = this.room === GIVER_ROOMS[key] && !(key === 'dre' && this.mission.active && !this.mission.cut);
      if (g.root.visible) g.update(dt, { y: groundY(g.x, g.z), pose: talking === key ? 'talk' : null });
    }
    for (const v of this.clerks) { v.root.visible = this.room === v.room; if (v.root.visible) v.update(dt, { y: groundY(v.x, v.z) }); }
    // indoors, the street outside isn't drawn
    if (this.room) {
      for (const C of this.cars.values()) C.view.root.visible = false;
      for (const P of this.peds.values()) P.view.root.visible = false;
      for (const d of this.drivers.values()) d.root.visible = false;
      for (const m of this.pickups.values()) m.visible = false;
    } else for (const m of this.pickups.values()) m.visible = Math.abs(m.position.x - me.x) < 160 && Math.abs(m.position.z - me.z) < 160;
    // pickups and markers turn and bob (the near ones)
    for (const m of this.pickups.values()) { const s = m.userData.spin; if (s && m.visible) { s.rotation.y += dt * 2; s.position.y = 1 + Math.sin(t * 3) * 0.08; } }
    const here = this.pos();
    for (const m of this.markers.values()) {
      m.visible = this.intro < 0 && Math.abs(m.position.x - here.x) < 220 && Math.abs(m.position.z - here.z) < 220;
      const s = m.userData.spin;
      if (s && m.visible) s.rotation.y += dt * 0.5;
    }
    this.updateArrows();
  }

  // a person sitting in a car (seat 0 drives, on the left)
  seat(v, x, z, h, seat, type, dt) {
    const T = CAR_TYPES[type];
    const side = seat % 2 === 0 ? 1 : -1;
    const back = seat >= 2 ? -0.9 : 0.15;
    const lx = side * T.wid * 0.21;
    v.root.visible = true;
    const px = x + Math.cos(h) * lx + Math.sin(h) * back, pz = z - Math.sin(h) * lx + Math.cos(h) * back;
    v.x = v.tx = px; v.z = v.tz = pz; v.h = v.th = h; v.fresh = false;
    v.anim = 0;
    const gy = groundY(x, z);
    v.update(dt, { pose: seat === 0 ? 'drive' : 'sit', y: gy + (type === 'van' ? 0.55 : type === 'sports' ? 0.12 : 0.28), smooth: 1000 });
    // keep their head under the roof, however tall they are (the low cars
    // sit you lower)
    const head = v.rig.skull || v.rig.head;
    if (head) {
      v.root.updateMatrixWorld(true);
      const hy = head.getWorldPosition(SEAT_TMP).y;
      const roof = gy + T.ht - 0.2;
      if (hy > roof) v.root.position.y -= Math.min(hy - roof, 0.5);
    }
  }

  // arrows over the job's cars and targets
  updateArrows() {
    const want = [];
    for (const b of this.mission.blips || []) {
      if (b.car != null) { const C = this.cars.get(b.car); if (C) want.push({ x: C.view.x, z: C.view.z, y: groundY(C.view.x, C.view.z) + CAR_TYPES[C.type].ht + 1.6, k: b.k }); }
      if (b.ped != null) { const P = this.peds.get(b.ped); if (P) want.push({ x: P.view.x, z: P.view.z, y: groundY(P.view.x, P.view.z) + 2.6, k: b.k }); }
    }
    while (this.arrows.length < want.length) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
      m.rotation.x = Math.PI;
      this.world.scene.add(m);
      this.arrows.push(m);
    }
    this.arrows.forEach((a, i) => {
      const w = want[i];
      a.visible = !!w;
      if (!w) return;
      a.position.set(w.x, w.y + Math.sin(this.T * 4) * 0.15, w.z);
      a.rotation.y += 0.05;
      a.material.color.set(w.k === 'enemy' ? 0xff3030 : w.k === 'friend' ? 0x40a0ff : 0x40a0ff);
    });
  }

  placeCamera(dt) {
    const cam = this.camera;
    // the opening
    if (this.intro >= 0) {
      this.opening.update(dt, cam, sound, voice);
      this.world.head.intensity = 0;
      return;
    }
    // a job's opening words, in the giver's office: a wide shot of the two
    // of you, then over the shoulder and close on whoever's talking, a cut
    // on every line
    const giver = this.mission.cut && !this.myCar && !this.ride && this.room === GIVER_ROOMS[this.mission.giver] ? this.givers.get(this.mission.giver) : null;
    if (giver) {
      const p = this.p;
      let dx = giver.x - p.x, dz = giver.z - p.z;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      p.h = Math.atan2(dx, dz);
      giver.th = Math.atan2(-dx, -dz);
      const speakerIsGiver = !this.talking || this.talking !== 'you';
      const sp = speakerIsGiver ? giver : p, ls = speakerIsGiver ? p : giver;
      const tx = (speakerIsGiver ? -dx : dx), tz = (speakerIsGiver ? -dz : dz);   // from the speaker towards the listener
      const shot = (this.cutLine || 1) % 3;
      // which side has room (for the wide shot)
      const mx = (p.x + giver.x) / 2, mz = (p.z + giver.z) / 2;
      let side = 1, room = 0;
      for (const sd of [1, -1]) {
        const hit = this.solids.ray(mx, 1.6, mz, -dz * sd, 0.1, dx * sd, 5);
        const r = hit ? hit.t : 5;
        if (r > room) { room = r; side = sd; }
      }
      const ox = -dz * side, oz = dx * side;
      let from, look, fov;
      if (shot === 1) {
        const r = Math.max(1.4, Math.min(4.2, room - 0.4));
        from = [mx + ox * r - dx * 0.6, 1.7, mz + oz * r - dz * 0.6]; look = [mx, 1.4, mz]; fov = 50;
      } else if (shot === 2) {
        from = [ls.x + tx * 0.75 + ox * 0.5, 1.68, ls.z + tz * 0.75 + oz * 0.5]; look = [sp.x, 1.5, sp.z]; fov = 44;
      } else {
        from = [sp.x + tx * 1.35 - ox * 0.35, 1.6, sp.z + tz * 1.35 - oz * 0.35]; look = [sp.x, 1.55, sp.z]; fov = 36;
      }
      // (never through a wall)
      const v = new THREE.Vector3(from[0] - look[0], from[1] - look[1], from[2] - look[2]), L = v.length();
      v.divideScalar(L);
      const hit = this.solids.ray(look[0], look[1], look[2], v.x, v.y, v.z, L);
      const use = hit ? Math.max(0.5, hit.t - 0.25) : L;
      cam.position.set(look[0] + v.x * use, look[1] + v.y * use, look[2] + v.z * use);
      cam.lookAt(look[0], look[1], look[2]);
      if (Math.abs(cam.fov - fov) > 0.1) { cam.fov = fov; cam.updateProjectionMatrix(); }
      this.world.head.intensity = 0;
      return;
    }
    const me = this.pos();
    let target, dist, fov = 68, shoulder = 0;
    if (this.myCar || this.ride) {
      const c = me;
      const id = this.myCar ? this.myCar.id : this.ride.id;
      const T = CAR_TYPES[this.cars.get(id)?.type || 'sedan'];
      // swing round behind the car unless you're looking about
      const behind = c.h + Math.PI;
      const spd = this.myCar ? Math.abs(this.myCar.c.v) : 8;
      if (this.camLook > 1.2 && (spd > 2 || this.ride)) this.camYaw = lerpA(this.camYaw, behind, Math.min(1, dt * (1.5 + spd * 0.08)));
      if (this.camLook > 1.2) this.camPitch += (0.22 - this.camPitch) * Math.min(1, dt * 2);
      target = new THREE.Vector3(c.x, groundY(c.x, c.z) + T.ht + 0.6, c.z);
      dist = 5.2 + T.len * 0.55 + Math.min(14, spd) * 0.12;
      fov = 70 + Math.min(10, spd * 0.25);
    } else {
      const p = this.p;
      target = new THREE.Vector3(p.x, (p.ground || 0) + p.y + 1.55, p.z);
      dist = this.aim ? 1.5 : 3.6;
      shoulder = this.aim ? 0.55 : 0.25;
      fov = this.aim ? 52 : 68;
      if (!this.alive()) { dist = 6; this.camPitch += (0.7 - this.camPitch) * Math.min(1, dt); }
    }
    const y = this.camYaw, pch = this.camPitch;
    const bx = Math.sin(y), bz = Math.cos(y);           // behind the camera's facing
    const rx = Math.cos(y), rz = -Math.sin(y);
    target.x += rx * shoulder; target.z += rz * shoulder;
    // don't put the camera inside a wall
    const want = new THREE.Vector3(target.x + bx * dist * Math.cos(pch), target.y + dist * Math.sin(pch), target.z + bz * dist * Math.cos(pch));
    const d = want.clone().sub(target);
    const L = d.length();
    d.divideScalar(L);
    const hit = this.solids.ray(target.x, target.y, target.z, d.x, d.y, d.z, L);
    const use = hit ? Math.max(0.6, hit.t - 0.3) : L;
    this.camDist += (use - this.camDist) * Math.min(1, dt * (use < this.camDist ? 30 : 6));
    cam.position.copy(target).addScaledVector(d, this.camDist);
    cam.position.y = Math.max(cam.position.y, groundY(cam.position.x, cam.position.z) + 0.4);
    // shake
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const s = this.shake * 0.12;
      cam.position.x += (Math.random() - 0.5) * s; cam.position.y += (Math.random() - 0.5) * s; cam.position.z += (Math.random() - 0.5) * s;
    }
    cam.lookAt(target.x - bx * 2, target.y + 0.15 - (this.aim ? 0 : 0), target.z - bz * 2);
    // the lookAt above points level-ish; tilt by the pitch so the crosshair is where you aim
    cam.rotation.order = 'YXZ';
    cam.rotation.set(-pch * 0.85 + 0.05, y, 0);
    if (Math.abs(cam.fov - fov) > 0.1) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 8); cam.updateProjectionMatrix(); }
    // headlights: your car's (and the car you're riding in)
    const H = this.world.head;
    if (this.myCar || this.ride) {
      const c = me;
      H.intensity = 15 * this.world.sunState.night;
      const hx = c.x + Math.sin(c.h) * 2, hz = c.z + Math.cos(c.h) * 2, tx = c.x + Math.sin(c.h) * 14, tz = c.z + Math.cos(c.h) * 14;
      H.position.set(hx, groundY(hx, hz) + 0.9, hz);
      H.target.position.set(tx, groundY(tx, tz), tz);
    } else H.intensity = 0;
  }

  updateHud(dt) {
    const H = this.hud, M = this.me$;
    H.money(M.money);
    H.health(M.hp, M.armor);
    const W = this.w;
    const ammo = M.ammo[W], clip = M.clip[W];
    H.weapon(W, ammo < 0 ? 0 : ammo, Math.min(clip, Math.max(0, ammo)), this.T < this.reloadUntil);
    H.wanted(M.wanted, M.searching);
    H.crosshair(!this.locked() && (this.aim || (this.ride && W !== 0)), false);
    H.clock(clockText(hourAt(this.T)));
    if (!this.mission.active && this.intro < 0) H.mission(this.tutorialText() || '');
    this.cutFade = Math.max(0, (this.cutFade || 0) - dt * 2.2);
    // which part of town
    this.areaT -= dt;
    if (this.areaT <= 0) {
      this.areaT = 0.6;
      const me = this.pos();
      const a = areaName(me.x, me.z);
      if (a !== this.area) { this.area = a; if (this.intro < 0) H.area(a); }
    }
    // a hint of what you can do here
    let help = null;
    if (!this.locked()) {
      if (this.doorNote) help = this.doorNote;
      else if (this.atShop()) help = 'Press ~y~E~w~ to buy guns and armour.';
      else if (this.atDiner()) help = `Press ~y~E~w~ for a meal ($${PRICES.meal}). It puts you back to full health.`;
      else if (this.room === 'home' && Math.hypot(this.p.x - INTERIOR.home.spots.save.x, this.p.z - INTERIOR.home.spots.save.z) < 1.6) help = 'Walk up to your bed to save the game.';
      else if (!this.myCar && !this.ride && this.nearestCar()) help = 'Press ~y~F~w~ to get in.';
      else if (this.myCar && this.myCar.c.type === 'police') help = '~y~G~w~ siren · ~y~H~w~ horn · ~y~R~w~ radio';
      else if (this.helpQueue.length && this.T > 2) {
        this.helpT -= dt;
        help = this.helpQueue[0];
        if (this.helpT <= 0) { this.helpQueue.shift(); this.helpT = 6; }
      }
    }
    H.help(help);
    // the race countdown
    if (this.countAt != null) {
      const left = this.countAt - this.T;
      const n = left > 0 ? Math.ceil(left) : left > -1 ? 'GO!' : null;
      if (n !== this.lastCount) { this.lastCount = n; H.countdown(n == null ? null : n > 3 ? null : n); if (n != null && n <= 3) sound.jingle(n === 'GO!' ? 'go' : 'count'); }
      if (n == null) this.countAt = null;
    }
    // the radar (and the map, if it's open): indoors, where the building is
    const me = this.room ? { x: INTERIOR[this.room].door.x, z: INTERIOR[this.room].door.z, h: this.p.h } : this.pos();
    const blips = [];
    for (const b of this.mission.blips || []) {
      if (b.car != null) { const C = this.cars.get(b.car); if (C) blips.push({ x: C.view.x, z: C.view.z, k: b.k }); } else if (b.ped != null) { const P = this.peds.get(b.ped); if (P) blips.push({ x: P.view.x, z: P.view.z, k: b.k }); } else blips.push(b);
    }
    // your own car (unless you're in it)
    if (M.ownCar >= 0 && !(this.myCar && this.myCar.id === M.ownCar)) { const C = this.cars.get(M.ownCar); if (C && !(C.flags & 8)) blips.push({ x: C.view.x, z: C.view.z, k: 'mycar', h: C.view.h }); }
    const players = [{ x: me.x, z: me.z, h: me.h ?? this.p.h, me: true, color: this.myColor }];
    for (const O of this.others.values()) players.push({ x: O.view.x, z: O.view.z, h: O.view.h, color: O.color });
    const police = [];
    if (M.wanted > 0) {
      for (const C of this.cars.values()) if (C.flags & 64 && C.flags & 1) police.push({ x: C.view.x, z: C.view.z });
      for (const P of this.peds.values()) if (P.look === LOOK_COP && !P.dead) police.push({ x: P.view.x, z: P.view.z });
    }
    const spd = this.myCar ? Math.abs(this.myCar.c.v) : 0;
    this.radar.draw({ x: me.x, z: me.z, yaw: this.camYaw, h: me.h ?? this.p.h, blips, players, police, range: 85 + spd * 2, t: this.T });
    if (this.mapOpen) this.radar.drawMap({ blips, players });
    if (this.shopOpen) {
      if (!this.atShop()) this.openShop(false);
      else this.hud.shop(true, M.money, M.ammo, M.armor, this.shopMsg || '');
    }
  }

  updateSound() {
    sound.setListener(this.camera);
    const me = this.pos();
    // engines: mine, and the nearest few
    const near = [];
    for (const [id, C] of this.cars) {
      if (C.flags & 8) continue;
      const d = Math.hypot(C.view.x - me.x, C.view.z - me.z);
      if (d < 45) near.push([d, id, C]);
      if (C.flags & 1 && d < 150) sound.siren(id, { x: C.view.x, z: C.view.z });
    }
    near.sort((a, b) => a[0] - b[0]);
    if (this.myCar) {
      const c = this.myCar.c, T = CAR_TYPES[c.type];
      const rpm = Math.min(1, Math.abs(c.v) / T.top * 1.4 + 0.08) % 1.0001;
      sound.engine('me', null, rpm, Math.abs(this.throttle || 0), true);
      sound.screech(Math.max(0, Math.abs(c.s) - 2) / 6 + (this.handbrake && Math.abs(c.v) > 6 ? 0.6 : 0));
    } else sound.screech(0);
    let n = 0;
    for (const [, id, C] of near) {
      if (this.myCar && id === this.myCar.id) continue;
      if (n++ >= 3) break;
      const T = CAR_TYPES[C.type];
      if (!(C.flags & 32) && !this.others.size && Math.abs(C.v || 0) < 0.3) continue;
      sound.engine(id, { x: C.view.x, z: C.view.z }, Math.min(1, Math.abs(C.v || 0) / T.top * 1.4 + 0.08), 0.3);
    }
    sound.sweepEngines();
    sound.setRadio(!!(this.myCar || this.ride) && this.radioOn && this.intro < 0);
    sound.update(1 / 60);
  }

  // ------------------------------------------------------------ panels
  // the map: the pointer's free while it's open, to drag it about
  toggleMap() {
    this.mapOpen = !this.mapOpen;
    $('mapScreen').hidden = !this.mapOpen;
    if (this.mapOpen) {
      const me = this.room ? INTERIOR[this.room].door : this.pos();
      this.radar.openMap(me.x, me.z);
      this.input.unlock();
    } else this.input.lock();
  }

  openShop(open) {
    this.shopOpen = open;
    this.shopMsg = '';
    this.hud.shop(open, this.me$.money, this.me$.ammo, this.me$.armor);
    if (open) this.input.unlock(); else this.input.lock();
  }

  onShopKey(e) {
    if (this.mapOpen) {
      const R = this.radar;
      if (e.code === 'Equal' || e.code === 'NumpadAdd') R.zoomAt(1.3);
      if (e.code === 'Minus' || e.code === 'NumpadSubtract') R.zoomAt(0.77);
      const pan = { ArrowLeft: [-80, 0], ArrowRight: [80, 0], ArrowUp: [0, -80], ArrowDown: [0, 80], KeyA: [-80, 0], KeyD: [80, 0], KeyW: [0, -80], KeyS: [0, 80] }[e.code];
      if (pan && !this.input.locked) R.pan(pan[0] * (R.dpr || 1), pan[1] * (R.dpr || 1));
      if ((e.code === 'KeyM' || e.code === 'Escape') && !this.input.locked) { e.preventDefault(); this.toggleMap(); }
      return;
    }
    if (!this.shopOpen) return;
    const k = { Digit1: 'pistol', Digit2: 'smg', Digit3: 'shotgun', Digit4: 'armor' }[e.code];
    if (k) this.link.send({ t: 'buy', item: k });
    if (e.code === 'KeyE' || e.code === 'Escape') { e.preventDefault(); this.openShop(false); }
  }

  render() {
    this.post.render((target) => this.world.render(this.renderer, this.camera, target), this.fxState());
  }

  fxState() {
    const f = this.fx$ || (this.fx$ = { fade: 0, bars: 0, exposure: 1, heat: 0, saturation: 1 });
    f.time = this.T;
    const down = !this.alive();
    f.saturation += ((down ? 0.15 : 1) - f.saturation) * 0.05;
    f.bars += ((this.mission.cut || this.intro >= 0 ? 1 : 0) - f.bars) * 0.08;
    f.fade = Math.max(this.intro >= 0 ? this.opening.fade || 0 : 0, this.doorFade || 0, this.cutFade || 0);
    f.heat = Math.min(0.6, (this.me$.wanted || 0) * 0.04);
    return f;
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    for (const off of this.off) off();
    removeEventListener('keydown', this.shopKeys);
    $('shop').removeEventListener('click', this.shopClick);
    for (const C of this.cars.values()) C.view.dispose();
    for (const P of this.peds.values()) P.view.dispose();
    for (const O of this.others.values()) O.view.dispose();
    for (const m of [...this.pickups.values(), ...this.objects.values(), ...this.markers.values(), ...this.arrows]) m.removeFromParent();
    for (const g of [...this.givers.values(), ...this.drivers.values(), ...this.clerks]) g.dispose();
    this.myView.dispose();
    this.fx.dispose();
    this.world.head.intensity = 0;
    for (const t of this.sayTimers || []) clearTimeout(t);
    voice.stop();
    sound.quiet();
  }
}

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
export { PRICES };
