// The title screen's background: San Cielo and its island late on a sunny
// afternoon. The camera drifts between the downtown towers, in from the sea
// with the hills behind, past the sign on the hill, along the pier at
// Pelican Beach, up a long avenue, round Mount Harlow and past the harbour
// cranes.

import * as THREE from 'three';
import { heightAt, SIGN, SUMMIT, COUNTRY } from '../shared/world.js';
import { XS, ZS, HARBOR } from '../shared/city.js';

const G = (x, z, up) => [x, heightAt(x, z) + up, z];
const P = COUNTRY.pier;
const SHOTS = [
  { from: [-200, 75, 0], to: [-140, 66, -20], look: [-40, 30, -150], dur: 16 },
  { from: [60, 120, 600], to: [30, 105, 520], look: [-40, 30, -420], dur: 16 },
  { from: G(SIGN.x - 70, SIGN.z + 90, 22), to: G(SIGN.x - 20, SIGN.z + 80, 20), look: G(SIGN.x, SIGN.z, 6), dur: 14 },
  { from: [P.x0 - 40, P.y + 14, P.z1 + 60], to: [P.x0 - 10, P.y + 10, P.z1 + 120], look: [P.x1 + 40, P.y, P.z0 - 20], dur: 14 },
  { from: [XS[8] - 2.6, 1.6, ZS[8] - 20], to: [XS[8] - 2.6, 1.8, ZS[8] - 90], look: [XS[8] - 2, 3, ZS[2]], dur: 14 },
  { from: [SUMMIT.x - 520, SUMMIT.y + 40, SUMMIT.z + 380], to: [SUMMIT.x - 460, SUMMIT.y + 30, SUMMIT.z + 300], look: [SUMMIT.x, SUMMIT.y - 40, SUMMIT.z], dur: 15 },
  { from: [-90, 9, HARBOR.z0 + 2], to: [-50, 11, HARBOR.z0 + 6], look: [-10, 14, HARBOR.z1], dur: 14 },
];

export class Attract {
  constructor(world) {
    this.world = world;
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.12, 2700);
    this.t = 0;
    this.i = 0;
    this.hour = 17.3;
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    this.t += dt;
    let s = SHOTS[this.i];
    if (this.t > s.dur) { this.t = 0; this.i = (this.i + 1) % SHOTS.length; s = SHOTS[this.i]; }
    const k = this.t / s.dur;
    const e = k * k * (3 - 2 * k);
    const c = this.camera;
    c.position.set(...s.from.map((v, j) => v + (s.to[j] - v) * e));
    c.lookAt(...s.look);
    if (this.world.hour !== this.hour || this.world.indoors) { this.world.indoors = false; this.world.setTime(this.hour); }
    this.world.update(performance.now() / 1000);
  }

  // fades in and out at the cuts
  get fade() {
    const s = SHOTS[this.i];
    return Math.max(0, 1 - this.t / 1.2, 1 - (s.dur - this.t) / 1.2);
  }
}
