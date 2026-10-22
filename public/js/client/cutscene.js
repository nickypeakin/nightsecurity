// The opening. Nobody has control.
//
// Closing time at Kingsgate: the PA thanks the last shoppers, the camera
// comes in from the parking lot (Dale's Buick under its lamp, frost on the
// glass), and Ray Okafor meets the night crew by the fountain. He hands
// over the keys and the rules, and somewhere in his speech the camera
// drifts to Halvorsen's window. Then he goes out through the south doors.
//
// Every client plays the same script from the same start message, so
// everyone sees the same thing at the same time.

import * as THREE from 'three';
import { INTRO_LEN } from '../shared/config.js';
import { START_SPOTS, MANAGER_SPOT } from '../shared/mall.js';
import { MANAGER, CLOSING } from '../shared/story.js';
import { makePerson } from './humans.js';
import { sound } from './audio.js';
import { voice } from './voice.js';
import { lerp, smooth } from './util.js';

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const OFFSET = 6;    // the manager's lines start after the drive-in shots

const SHOTS = [
  { t0: 0, t1: 7.5, from: [9, 1.5, 36], to: [4, 2.0, 27], look: [0, 3.5, 15] },
  { t0: 7.5, t1: 14.5, from: [6.5, 2.6, 9.0], to: [3.4, 2.0, 7.4], look: [0, 1.4, 3.6] },
  { t0: 14.5, t1: 22, from: [-29, 1.7, 2.4], to: [-34.5, 1.6, 1.6], look: [-41.5, 1.4, -4.6] },
  { t0: 22, t1: 30, from: [1.7, 1.75, 7.8], to: [0.9, 1.7, 7.1], look: [0, 1.65, 3.4] },
  { t0: 30, t1: 37, from: [0.4, 1.7, 1.7], to: [-0.4, 1.7, 1.9], look: [0, 1.5, 6.0] },
  { t0: 37, t1: 44.5, from: [0, 1.6, 9.2], to: [0, 1.6, 12.4], look: [5.6, 1.0, 25.5] },
  { t0: 44.5, t1: INTRO_LEN + 2, from: [0.5, 3.2, -4.5], to: [0.3, 3.0, -3.5], look: [0, 1.4, 12] },
];

export class Cutscene {
  constructor(game, kind = 'intro') {
    this.g = game;
    this.kind = kind;
    this.t = 0;
    this.done = false;
    this.fired = new Set();
    this.cast = game.roster.map((r) => game.avatars.get(r.id));
    this.lookAt = new THREE.Vector3();
    this.pos = new THREE.Vector3();
    this.cast.forEach((a, i) => {
      const s = START_SPOTS[i % 4];
      a.scripted = true;
      a.label.visible = false;
      a.place(s.x, s.z, Math.atan2(s.x - MANAGER_SPOT.x, s.z - MANAGER_SPOT.z));
      a.pose = { pose: 'stand', lookYaw: 0, lookPitch: -0.05 };
      a.root.visible = true;
    });
    this.manager = makePerson('manager');
    this.manager.position.set(MANAGER_SPOT.x, 0, MANAGER_SPOT.z);
    this.manager.rotation.y = 0;   // facing the crew (+z)
    game.world.scene.add(this.manager);
    this.mrig = this.manager.userData.rig;
    // closing time: every light on
    game.world.setBreakers({ concourse: true, court: true, food: true, stores: true, back: true, cams: true }, false, { force: true });
    sound.startMuzak(0.4, false);
  }

  fire(id, at, fn) {
    if (this.t >= at && !this.fired.has(id)) { this.fired.add(id); fn(); }
  }

  update(dt) {
    if (this.done) return;
    const t = (this.t += dt);
    const g = this.g;
    // the camera
    let s = SHOTS.find((q) => t >= q.t0 && t < q.t1) || SHOTS[SHOTS.length - 1];
    const k = smooth((t - s.t0) / (s.t1 - s.t0));
    this.pos.set(lerp(s.from[0], s.to[0], k), lerp(s.from[1], s.to[1], k), lerp(s.from[2], s.to[2], k));
    this.lookAt.set(...s.look);
    // cuts: a moment of black between shots
    const edge = Math.min(t - s.t0, s.t1 - t);
    g.fadeTo = edge < 0.35 && t > 0.5 ? 0.85 : 0;
    if (t < 0.5) g.fadeTo = 0;
    // the closing announcement
    this.fire('pa', 0.6, () => { sound.paChime(); g.hud.say('PA', CLOSING, 'pa'); setTimeout(() => voice.say(CLOSING, 'closing'), 1200); });
    // the manager's speech
    for (const [at, who, text] of MANAGER) {
      this.fire(`m${at}`, at + OFFSET, () => {
        g.hud.say(who, text);
        voice.say(text, 'manager');
        this.mrig.talk(Math.min(5, 1 + text.length * 0.05));
      });
    }
    this.fire('muzakOff', 20, () => sound.stopMuzak(4));
    // he leaves: out through the south doors
    let mpose = { pose: 'stand', speed: 0, lookYaw: 0, lookPitch: 0 };
    if (t > 45.5) {
      const kk = Math.min(1, (t - 45.5) / 5.5);
      this.manager.position.set(MANAGER_SPOT.x + 0.6 * Math.sin(kk * 3), 0, lerp(MANAGER_SPOT.z, 15.6, kk));
      this.manager.rotation.y = 0;
      mpose = { pose: 'walk', speed: 1.3, lookYaw: 0, lookPitch: 0 };
      if (kk >= 1) this.manager.visible = false;
    } else if (t > 43 && t < 45.5) {
      // a little wave, over his shoulder
      mpose = { pose: 'wave', speed: 0, lookYaw: 0.3, lookPitch: 0 };
    }
    this.mrig.update(dt, mpose);
    // the crew turn to watch him go
    for (const a of this.cast) {
      if (t > 45.5) a.pose = { pose: 'stand', lookYaw: Math.atan2(a.x, 14 - a.z) * 0.3, lookPitch: 0 };
    }
    if (t > INTRO_LEN + 4) this.finish();
  }

  finish() {
    if (this.done) return;
    this.done = true;
    for (const a of this.cast) { a.scripted = false; a.label.visible = true; }
    this.manager.removeFromParent();
  }
}
