// The title screen's background: Kingsgate late on a sunny afternoon. The
// camera drifts over the downtown towers, down a long street, past the
// harbour cranes and the fence round where the mall used to be.

import * as THREE from 'three';

const SHOTS = [
  { from: [-60, 60, 110], to: [-20, 52, 80], look: [20, 10, -20], dur: 16 },
  { from: [120 - 2.6, 1.6, 150], to: [120 - 2.6, 1.8, 90], look: [118, 3, 0], dur: 14 },
  { from: [-30, 9, 190], to: [10, 11, 196], look: [-10, 12, 236], dur: 14 },
  { from: [-40, 2.2, 60], to: [-46, 2.6, 52], look: [-80, 2, 80], dur: 14 },
  { from: [30, 3, -30], to: [10, 4, -34], look: [0, 10, -60], dur: 14 },
];

export class Attract {
  constructor(world) {
    this.world = world;
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1400);
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
