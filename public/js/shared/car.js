// Cars: the models on San Cielo's streets and how they drive. The physics
// is arcade and two-dimensional, the car keeping to the ground (hills slow
// you going up and speed you coming down, and the sea's edge stops you like
// a wall): a bicycle model for steering, a
// little sideways slip that the tyres scrub away (much less of it with the
// handbrake on, so you can slide round a corner), collisions that bounce
// and spin you, and damage. The same code drives your own car on your
// screen and every other car on the host.
//
// Heading h: forward is (sin h, cos h); right is (-cos h, sin h).

import { carVsBox, carVsCar } from './collide.js';
import { groundY, inWater } from './city.js';

// top: m/s; accel/brake: m/s^2; grip: how fast sideways slip goes; steer:
// most wheel lock (radians); wb: wheelbase; hp: how much it takes
export const CAR_TYPES = {
  sedan: { name: 'Marlin', len: 4.6, wid: 1.86, ht: 1.42, wb: 2.75, top: 40, accel: 8.5, brake: 17, grip: 7.5, steer: 0.55, mass: 1.4, hp: 100, seats: 4 },
  taxi: { name: 'Cabbie', len: 4.7, wid: 1.88, ht: 1.45, wb: 2.8, top: 39, accel: 8.0, brake: 17, grip: 7.5, steer: 0.55, mass: 1.45, hp: 100, seats: 4 },
  police: { name: 'Police Cruiser', len: 4.9, wid: 1.92, ht: 1.5, wb: 2.85, top: 47, accel: 10.5, brake: 19, grip: 8.5, steer: 0.55, mass: 1.6, hp: 130, seats: 4 },
  van: { name: 'Boxer', len: 5.3, wid: 2.05, ht: 2.3, wb: 3.2, top: 33, accel: 6.0, brake: 14, grip: 6.5, steer: 0.5, mass: 2.3, hp: 150, seats: 2 },
  sports: { name: 'Kestrel', len: 4.4, wid: 1.9, ht: 1.2, wb: 2.6, top: 54, accel: 13, brake: 21, grip: 9.5, steer: 0.52, mass: 1.25, hp: 85, seats: 2 },
  pickup: { name: 'Ridgeback', len: 5.1, wid: 1.95, ht: 1.75, wb: 3.1, top: 38, accel: 8.0, brake: 16, grip: 7.0, steer: 0.52, mass: 1.9, hp: 125, seats: 2 },
};
export const CAR_KEYS = Object.keys(CAR_TYPES);

// paint jobs (taxis are always yellow, cruisers black and white)
export const PAINT = [0x8a1a1a, 0x1a3a6a, 0x2a5a3a, 0xc8c4b8, 0x1a1a1c, 0x6a6a6e, 0x8a6a2a, 0x4a2a5a, 0xb85a1a, 0x2a6a8a, 0xe8e4dc, 0x5a1a2a];
export const TAXI_PAINT = 0xe8b818;

// a fresh car of a type, parked at (x, z) facing h
export function makeCar(id, type, x, z, h, paint = 0) {
  const T = CAR_TYPES[type];
  return {
    id, type, x, z, h, paint,
    y: groundY(x, z),
    hl: T.len / 2, hw: T.wid / 2, ht: T.ht,
    v: 0,      // forward speed
    s: 0,      // sideways slip (to the right)
    w: 0,      // yaw rate
    steer: 0,
    hp: T.hp,
    dead: false,
  };
}

const RIGHT_IS_NEGATIVE = -1;   // turning right lowers the heading

// One step of driving. inp: { throttle -1..1, steer -1..1 (right +),
// handbrake }. env: { solids, cars (other cars to bump), canPush(other),
// onHit(car, impact, other) }.
export function stepCar(c, inp, dt, env) {
  const T = CAR_TYPES[c.type];
  const thr = c.dead ? 0 : Math.max(-1, Math.min(1, inp.throttle || 0));
  const spd = Math.abs(c.v);
  // steering: less lock the faster you go
  const lock = T.steer / (1 + spd * 0.035);
  const want = (c.dead ? 0 : inp.steer || 0) * lock;
  c.steer += (want - c.steer) * Math.min(1, dt * 7);

  // engine, brakes, rolling resistance
  let a = 0;
  if (thr > 0.05) a = c.v < -0.4 ? T.brake * thr : T.accel * thr * Math.max(0, 1 - Math.max(0, c.v) / T.top);
  else if (thr < -0.05) a = c.v > 0.4 ? -T.brake * -thr : -T.accel * 0.55 * -thr * Math.max(0, 1 - Math.max(0, -c.v) / (T.top * 0.3));
  else a = -Math.sign(c.v) * Math.min(spd / dt, 1.6);
  // uphill or down (a parked car stays put)
  const sh = Math.sin(c.h), ch = Math.cos(c.h), r = c.hl * 0.8;
  const slope = (groundY(c.x + sh * r, c.z + ch * r) - groundY(c.x - sh * r, c.z - ch * r)) / (2 * r);
  const pull = -9.8 * Math.max(-0.6, Math.min(0.6, slope)) * 0.75;
  if (Math.abs(thr) > 0.05 || Math.abs(c.v) > 0.5 || Math.abs(pull) > 1.6) a += pull;
  if (inp.handbrake) a += -Math.sign(c.v) * Math.min(Math.abs(c.v + a * dt) / dt, 6.5);
  c.v += a * dt;
  c.v -= c.v * spd * 0.0007 * dt * 10;

  // yaw from the front wheels (a bicycle), slip from going round
  const turn = RIGHT_IS_NEGATIVE * c.v * Math.tan(c.steer) / T.wb;
  const hb = inp.handbrake && spd > 4;
  c.w += (turn * (hb ? 1.35 : 1) - c.w) * Math.min(1, dt * (hb ? 3.5 : 9));
  const grip = hb ? T.grip * 0.18 : T.grip;
  // the faster you take a corner, the more it slides to the outside
  c.s += c.w * c.v * (hb ? 0.09 : 0.03) * dt;
  c.s *= Math.exp(-grip * dt);
  // sliding sideways bleeds speed
  c.v *= Math.exp(-Math.abs(c.s) * 0.02 * dt);
  c.h += c.w * dt;

  const s = Math.sin(c.h), co = Math.cos(c.h);
  const px = c.x, pz = c.z;
  c.x += (s * c.v - co * c.s) * dt;
  c.z += (co * c.v + s * c.s) * dt;
  // the water's edge: as good as a wall
  if (inWater(c.x + s * c.hl * Math.sign(c.v || 1), c.z + co * c.hl * Math.sign(c.v || 1))) {
    const hit = Math.abs(c.v);
    c.x = px; c.z = pz;
    c.v *= -0.2; c.s *= 0.3; c.w *= 0.3;
    if (env && env.onHit && hit > 3) env.onHit(c, hit * 0.6, null);
  }
  if (env) collide(c, env);
  c.y = groundY(c.x, c.z);
}

// world velocity of a car
export function carVel(c) {
  const s = Math.sin(c.h), co = Math.cos(c.h);
  return [s * c.v - co * c.s, co * c.v + s * c.s];
}

function setVel(c, vx, vz) {
  const s = Math.sin(c.h), co = Math.cos(c.h);
  c.v = vx * s + vz * co;
  c.s = vx * -co + vz * s;
}

// push the car out of walls and other cars, bounce, spin and report hits
function collide(c, env) {
  const near = env.solids.near(c.x, c.z, c.hl + 2, env._set || (env._set = new Set()));
  for (let pass = 0; pass < 2; pass++) {
    for (const b of near) {
      if (b.small || b.y0 > (c.y || 0) + 1.2 || b.y1 < (c.y || 0) + 0.25) continue;
      const hit = carVsBox(c, b);
      if (hit) respond(c, hit, null, env);
    }
    for (const o of env.cars || []) {
      if (o === c || o.gone) continue;
      const hit = carVsCar(c, o);
      if (hit) respond(c, hit, o, env);
    }
  }
}

function respond(c, hit, other, env) {
  const { nx, nz, depth } = hit;
  // other cars take half the push (if they're ours to move)
  const push = other && env.canPush ? env.canPush(other) : false;
  const share = push ? 0.5 : 1;
  c.x += nx * depth * share;
  c.z += nz * depth * share;
  if (push) { other.x -= nx * depth * 0.5; other.z -= nz * depth * 0.5; }
  let [vx, vz] = carVel(c);
  let ox = 0, oz = 0;
  if (other) [ox, oz] = carVel(other);
  const rel = (vx - ox) * nx + (vz - oz) * nz;
  if (rel >= 0) return;
  const T = CAR_TYPES[c.type];
  const m1 = T.mass, m2 = other ? CAR_TYPES[other.type].mass : 1e6;
  const e = 0.25;
  const j = (-(1 + e) * rel) / (1 / m1 + 1 / m2);
  vx += (j / m1) * nx; vz += (j / m1) * nz;
  // scrape: lose some speed along the wall too
  const tx = -nz, tz = nx, along = vx * tx + vz * tz;
  vx -= tx * along * 0.12; vz -= tz * along * 0.12;
  setVel(c, vx, vz);
  // a glancing knock spins you: which side of the car took it?
  const s = Math.sin(c.h), co = Math.cos(c.h);
  const side = -nx * -co + -nz * s;          // contact to the right (+) or left
  const front = -nx * s + -nz * co;          // at the front (+) or back
  c.w += (side * front * Math.min(8, -rel) * 0.35);
  if (push) setVel(other, ox - (j / m2) * nx, oz - (j / m2) * nz);
  if (env.onHit) env.onHit(c, -rel, other);
}
