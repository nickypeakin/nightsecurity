// The opening, before you get control: Kingsgate from the air on a sunny
// morning, your street and your car out front, then you, asleep, until the
// phone rings. It's Ray Okafor, from the mall, with work. Timed by the
// host's clock for the intro (so everyone in the game sees it together);
// Space skips it.

import * as THREE from 'three';
import { INTERIOR, FLOOR_Y } from '../shared/interiors.js';
import { TITLE, DATE } from '../shared/story.js';

export const OPENING_LEN = 32;

const H = INTERIOR.home;
const L = (x, z) => [H.box.x0 + x, H.box.z0 + z];
const BED = L(19.5, 2.2), SIT = L(18.35, 2.6), WIN = L(17.8, 0.95);
const DOOR = INTERIOR.home.door;

// [start, end, camera from, camera to, look from, look to, fov]
const SHOTS = [
  [0, 6.5, [-60, 92, 70], [-10, 74, 20], [40, 8, -60], [60, 6, -90], 55],
  // your place, and your car in the drive
  [6.5, 11, [DOOR.x - 9, 1.5, DOOR.z + 14], [DOOR.x - 5, 1.5, DOOR.z + 10.5], [DOOR.x + 4, 1.6, DOOR.z - 0.5], [DOOR.x + 4.5, 1.5, DOOR.z - 0.8], 52],
  [11, 15.5, [L(13.6, 7.6)[0], 2.6, L(13.6, 7.6)[1]], [L(14.4, 7)[0], 2.4, L(14.4, 7)[1]], [BED[0], 0.7, BED[1]], [BED[0], 0.75, BED[1]], 50],
  [15.5, 20, [L(15.2, 4.6)[0], 1.25, L(15.2, 4.6)[1]], [L(15.4, 4.4)[0], 1.3, L(15.4, 4.4)[1]], [SIT[0], 0.95, SIT[1]], [SIT[0], 1.2, SIT[1]], 48],
  [20, 25, [L(15.8, 2.4)[0], 1.62, L(15.8, 2.4)[1]], [L(15.9, 2.2)[0], 1.62, L(15.9, 2.2)[1]], [WIN[0], 1.6, WIN[1]], [WIN[0], 1.62, WIN[1]], 40],
  [25, OPENING_LEN, [L(18.4, 3.0)[0], 1.75, L(18.4, 3.0)[1]], [L(18.3, 2.7)[0], 1.75, L(18.3, 2.7)[1]], [L(17.4, -1)[0], 1.5, L(17.4, -1)[1]], [L(17.2, -1)[0], 1.5, L(17.2, -1)[1]], 46],
];

// what's said, and when
const LINES = [
  [17.2, 'Ray Okafor (phone)', 'okafor', "Morning. It's Ray. Ray Okafor, from the mall.", 3.3],
  [20.7, 'Ray Okafor (phone)', 'okafor', "I hear you've been sitting at home since they knocked the place down.", 3.6],
  [24.6, 'You', 'friend', 'Something like that.', 1.8],
  [26.6, 'Ray Okafor (phone)', 'okafor', "I've got work, if you want it. Come by the lot on the Strip. Bring that car of yours.", 4.8],
];

export class Opening {
  constructor(game) {
    this.g = game;
    this.t = -1;
    this.said = new Set();
    this.rang = new Set();
  }

  // the host's intro clock (-1 once it's over)
  sync(t) {
    if (t < 0) { this.t = -1; return; }
    if (this.t < 0 || Math.abs(t - this.t) > 0.4) this.t = t;
  }

  get on() { return this.t >= 0; }

  update(dt, cam, sound, voice) {
    if (this.t < 0) return;
    this.t = Math.min(OPENING_LEN, this.t + dt);
    const t = this.t, g = this.g;
    if (!this.titled) { this.titled = true; g.hud.banner(TITLE, `Kingsgate · ${DATE}`, 'title'); }
    if (t > 6.2 && !this.untitled) { this.untitled = true; g.hud.banner(null); }
    // the camera
    const S = SHOTS.find((s) => t >= s[0] && t < s[1]) || SHOTS[SHOTS.length - 1];
    const k = Math.min(1, (t - S[0]) / (S[1] - S[0]));
    const e = k * k * (3 - 2 * k);
    const lerp = (a, b) => a.map((v, i) => v + (b[i] - v) * e);
    cam.position.set(...lerp(S[2], S[3]));
    cam.lookAt(new THREE.Vector3(...lerp(S[4], S[5])));
    if (Math.abs(cam.fov - S[6]) > 0.1) { cam.fov = S[6]; cam.updateProjectionMatrix(); }
    // black between the shots
    this.fade = Math.max(0, 1 - (t - S[0]) / 0.35, S === SHOTS[SHOTS.length - 1] ? (t - (OPENING_LEN - 0.6)) / 0.6 : 0);
    // where you are: outside for the first shots, then the bedroom
    const outside = t < 11;
    g.world.setRoom(outside ? null : 'home');
    const v = g.myView;
    v.root.visible = !outside;
    v.fresh = false;
    if (t < 15.5) this.place(v, BED[0], BED[1] + 0.25, 0, FLOOR_Y + 0.58, 'sleep', dt);
    else if (t < 18.4) this.place(v, SIT[0], SIT[1], -Math.PI / 2, FLOOR_Y, 'sit', dt);
    else this.place(v, WIN[0], WIN[1] + 0.35, Math.PI, FLOOR_Y, 'phone', dt);
    // the phone
    for (const at of [12, 13.4, 14.8]) if (t >= at && !this.rang.has(at)) { this.rang.add(at); sound.ring(); }
    for (const [at, name, who, text, dur] of LINES) {
      if (t >= at && !this.said.has(at)) {
        this.said.add(at);
        g.hud.say(name, text, 'talk', dur);
        voice.say(text, who, { salt: 3 });
      }
    }
    g.hud.cinematic(true);
  }

  // stand (or lie, or sit) the view somewhere, in a pose
  place(v, x, z, h, y, pose, dt) {
    v.x = v.tx = x; v.z = v.tz = z; v.h = v.th = h;
    v.update(dt, { pose, y, smooth: 1000 });
  }

  // done (or skipped)
  end() {
    if (this.ended) return;
    this.ended = true;
    this.g.hud.banner(null);
    this.g.hud.cinematic(false);
  }
}
