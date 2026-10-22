// The title screen's background: the empty mall after hours, the camera
// drifting down the concourse, past Halvorsen's window, round the
// fountain, through the food court and along the service corridor.

import * as THREE from 'three';

const SHOTS = [
  { from: [-14, 1.7, 3.5], to: [-27, 1.7, 2.5], look: [-41, 1.4, -2], dur: 18 },
  { from: [8.5, 2.2, 8.5], to: [6.5, 3.5, 6.0], look: [0, 1.0, 0], dur: 16 },
  { from: [44, 2.0, 9], to: [46, 2.4, 5], look: [52, 1.6, 0], dur: 16 },
  { from: [-30, 1.6, -19], to: [-14, 1.6, -19.2], look: [6, 1.4, -19.6], dur: 16 },
  { from: [-58, 1.6, 4], to: [-55, 1.6, 0], look: [-42, 1.4, -4.6], dur: 16 },
];

export class Attract {
  constructor(world) {
    this.world = world;
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.05, 260);
    this.t = 0;
    this.i = 0;
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
    const W = this.world;
    W.setFlags(this.i === 2 ? 2 : 0);
    // a faint beam from somewhere, as if someone were walking ahead
    const t = performance.now() / 1000;
    W.update(dt, t, { flashes: [{ on: true, pos: c.position.clone().add(new THREE.Vector3(0.2, -0.3, 0)), dir: new THREE.Vector3(...s.look).sub(c.position).normalize() }] });
  }

  // fades in and out at the cuts
  get fade() {
    const s = SHOTS[this.i];
    return Math.max(0, 1 - this.t / 1.2, 1 - (s.dur - this.t) / 1.2);
  }
}
