// People as this client sees them: the other guards, the thing in Dale's
// uniform, Dale, the manager, and Halvorsen's mannequins. A model, a quiet
// name tag for friends, a flashlight beam hanging in the dark, and
// smoothing between the host's snapshots. The mannequins aren't smoothed:
// they're only ever moved while nobody's looking, so they just appear
// wherever they've got to.

import * as THREE from 'three';
import { makePerson, bakePose, FRIEND_LOOKS, MANNEQUIN_LOOKS } from './humans.js';
import * as TX from './textures.js';
import { flashlightModel } from './models.js';
import { lerp, angleLerp } from './util.js';
import { MANNEQUIN_HOMES, UNIFORM_HOME, HIDES } from '../shared/mall.js';

const _down = new THREE.Vector3(0, -1, 0);

// a faint cone of light hanging in the air along a flashlight's beam
export function beamCone(scene, len = 9, radius = 1.3, opacity = 0.05) {
  const geo = new THREE.ConeGeometry(radius, len, 20, 1, true);
  geo.translate(0, -len / 2, 0);    // the tip at the lens, opening along -y
  const beam = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(0xfff0d0) }, opacity: { value: opacity } },
    vertexShader: 'varying float vK; void main() { vK = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 color; uniform float opacity; varying float vK; void main() { gl_FragColor = vec4(color, opacity * vK * vK); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  beam.frustumCulled = false;
  beam.visible = false;
  scene.add(beam);
  return beam;
}

// a flashlight in someone's left hand, with a glow at the lens and a beam
function torch(rig, scene) {
  const g = flashlightModel();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.glow(), color: 0xfff2d6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.position.y = -0.23;
  glow.scale.setScalar(0.3);
  g.add(glow);
  rig.arms[0].wrist.add(g);
  g.position.set(0.02, -0.08, 0.06);
  g.rotation.set(Math.PI / 2 - 0.2, 0, 0);
  return { g, glow, beam: beamCone(scene) };
}

export class Avatar {
  constructor(r, game, isMe) {
    this.game = game;
    this.id = r.id;
    this.name = r.name;
    this.color = r.color;
    this.isMe = isMe;
    this.root = makePerson(FRIEND_LOOKS[r.color % 4]);
    this.rig = this.root.userData.rig;
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TX.sign(r.name, { w: 256, h: 64, bg: 'rgba(8,8,8,0.35)', fg: '#efe6d8', font: '600 40px Inter, sans-serif' }),
      transparent: true, depthWrite: false, opacity: 0.7, fog: false,
    }));
    this.label.scale.set(0.5, 0.125, 1);
    this.label.position.y = 2.1;
    this.root.add(this.label);
    this.torch = torch(this.rig, game.world.scene);
    this.x = this.z = this.tx = this.tz = 0;
    this.ry = this.tr = this.rx = 0;
    this.flags = 0;
    this.hide = '';
    this.cam = -1;
    this.speed = 0;
    this.scripted = false;
    this.snapNext = true;
    this.lightPos = new THREE.Vector3();
    this.lightDir = new THREE.Vector3();
    game.world.scene.add(this.root);
  }

  get taken() { return (this.flags & 1) !== 0; }
  get flash() { return (this.flags & 2) !== 0; }
  get crouch() { return (this.flags & 4) !== 0; }
  get cctv() { return (this.flags & 8) !== 0; }
  get hidden() { return (this.flags & 16) !== 0; }
  get alive() { return !this.taken; }

  // one row of a host snapshot: [id, x, z, ry, rx, flags, hide, cam]
  apply(row) {
    [, this.tx, this.tz, this.tr, this.rx, this.flags, this.hide, this.cam] = row;
  }

  place(x, z, ry) {
    this.x = this.tx = x;
    this.z = this.tz = z;
    this.ry = this.tr = ry;
    this.snapNext = false;
    this.root.position.set(x, 0, z);
    this.root.rotation.set(0, ry + Math.PI, 0);
  }

  update(dt) {
    if (this.scripted) {
      this.rig.update(dt, this.pose || { pose: 'stand' });
      this.torch.beam.visible = false;
      this.torch.g.visible = false;
      return;
    }
    if (this.snapNext) {
      this.x = this.tx; this.z = this.tz; this.ry = this.tr;
      this.snapNext = false;
    }
    const k = 1 - Math.exp(-dt * 12);
    const px = this.x, pz = this.z;
    this.x = lerp(this.x, this.tx, k);
    this.z = lerp(this.z, this.tz, k);
    this.ry = angleLerp(this.ry, this.tr, k);
    this.speed = lerp(this.speed, Math.hypot(this.x - px, this.z - pz) / Math.max(dt, 1e-3), 0.2);
    this.root.visible = this.alive && !this.isMe && !this.hidden && this.game.viewing !== this;
    let x = this.x, z = this.z, ry = this.ry;
    let pose = this.crouch ? 'crouch' : 'walk';
    if (this.cctv) {
      // in the chair at the monitors
      x = 0; z = -25.85; ry = 0; pose = 'sit';
    }
    this.root.position.set(x, 0, z);
    this.root.rotation.set(0, ry + Math.PI, 0);
    this.torch.g.visible = this.flash;
    const on = this.flash && this.root.visible && !this.cctv;
    this.torch.glow.visible = on;
    this.torch.beam.visible = on;
    if (!this.root.visible) return;
    this.rig.update(dt, { pose, speed: this.cctv ? 0 : this.speed, lookYaw: 0, lookPitch: this.rx });
    if (on) {
      // aim the beam where they're looking
      const dir = this.lightDir.set(-Math.sin(this.ry) * Math.cos(this.rx), Math.sin(this.rx), -Math.cos(this.ry) * Math.cos(this.rx));
      this.root.updateMatrixWorld(true);
      this.torch.glow.getWorldPosition(this.lightPos);
      this.torch.beam.position.copy(this.lightPos);
      this.torch.beam.quaternion.setFromUnitVectors(_down, dir);
    }
  }

  dispose() {
    this.root.removeFromParent();
    this.torch.beam.removeFromParent();
  }
}

// Anyone the story moves: the thing in Dale's uniform ('mqGuard'), Dale,
// and Ray Okafor. Rows: [x, z, ry, anim, flags].
export class Actor {
  constructor(look, game) {
    this.game = game;
    this.look = look;
    this.root = makePerson(look);
    this.rig = this.root.userData.rig;
    this.x = this.z = this.tx = this.tz = 0;
    this.ry = this.tr = 0;
    this.anim = 'stand';
    this.flags = 0;
    this.speed = 0;
    this.fresh = true;
    this.stepAcc = 0;
    this.moved = 0;
    this.light = { on: false, pos: new THREE.Vector3(), dir: new THREE.Vector3() };
    if (look === 'mqGuard') this.torch = torch(this.rig, game.world.scene);
    game.world.scene.add(this.root);
  }

  apply(row) {
    [this.tx, this.tz, this.tr, this.anim, this.flags] = row;
    if (this.fresh) { this.x = this.tx; this.z = this.tz; this.ry = this.tr; this.fresh = false; }
  }

  update(dt, t, lookAt = null) {
    const k = 1 - Math.exp(-dt * 10);
    const px = this.x, pz = this.z;
    this.x = lerp(this.x, this.tx, k);
    this.z = lerp(this.z, this.tz, k);
    this.ry = angleLerp(this.ry, this.tr, k);
    this.moved = Math.hypot(this.x - px, this.z - pz);
    this.speed = lerp(this.speed, this.moved / Math.max(dt, 1e-3), 0.2);
    this.root.position.set(this.x, 0, this.z);
    this.root.rotation.y = this.ry + Math.PI;
    // it looks at you when you're near
    let lookYaw = null, lookPitch = 0;
    if (lookAt) {
      const dx = lookAt.x - this.x, dz = lookAt.z - this.z, d = Math.hypot(dx, dz);
      if (d < 10) {
        lookYaw = Math.atan2(-dx, -dz) - this.ry;
        while (lookYaw > Math.PI) lookYaw -= Math.PI * 2;
        while (lookYaw < -Math.PI) lookYaw += Math.PI * 2;
        lookYaw = Math.max(-1.1, Math.min(1.1, lookYaw));
        lookPitch = Math.atan2(lookAt.y - 1.7, Math.max(0.3, d));
      }
    }
    const it = this.look === 'mqGuard';
    let st;
    switch (this.anim) {
      case 'sit': st = { pose: 'sit', speed: 0, lookYaw, lookPitch }; break;
      case 'huddle': st = { pose: 'crouch', speed: 0, lookYaw: 0.3, lookPitch: 0.2 }; break;
      case 'work': st = { pose: 'reach', speed: 0, lookYaw: 0, lookPitch: -0.2 }; break;
      case 'stunned': st = { pose: 'collapse', speed: 0 }; break;
      case 'look': st = { pose: 'stand', speed: 0, lookYaw: Math.sin(t * 1.7) * 1.1, lookPitch: 0 }; break;
      case 'stand': st = { pose: it ? 'torch' : 'stand', speed: 0, lookYaw, lookPitch }; break;
      default: st = { pose: it && this.anim === 'run' ? 'reach' : 'walk', speed: this.speed, lookYaw, lookPitch, stride: this.anim === 'run' ? 1.15 : 1 };
    }
    if (this.anim === 'stunned') st = { pose: 'peep', speed: 0, tilt: 0.5, lookPitch: 0.6 };
    if (it) { st.stiff = true; st.noBlink = true; }
    this.rig.update(dt, st);
    if (this.torch) this.aimTorch();
  }

  // its flashlight shines where it's facing, a little down
  aimTorch() {
    const T = this.torch, L = this.light;
    const on = this.root.visible && (this.flags & 1) !== 0 && this.anim !== 'stunned';
    T.g.visible = true;
    T.glow.visible = T.beam.visible = L.on = on;
    if (!on) return;
    this.root.updateMatrixWorld(true);
    T.glow.getWorldPosition(L.pos);
    L.dir.set(-Math.sin(this.ry), -0.25, -Math.cos(this.ry)).normalize();
    T.beam.position.copy(L.pos);
    T.beam.quaternion.setFromUnitVectors(_down, L.dir);
  }

  dispose() {
    this.root.removeFromParent();
    if (this.torch) this.torch.beam.removeFromParent();
  }
}

// Halvorsen's mannequins. Each has a handful of frozen poses; when it
// moves it takes a new one, so whenever you look back it's somewhere else,
// standing some other way.
const POSES = [
  { pose: 'stand' },
  { pose: 'pockets', lookYaw: 0.4 },
  { pose: 'hold', lookYaw: -0.3 },
  { pose: 'wave', tilt: 0.2 },
  { pose: 'torch', lookYaw: 0.2, lookPitch: -0.2 },
  { pose: 'reach' },
  { pose: 'peep', tilt: -0.3 },
  { pose: 'stand', tilt: 0.7, lookYaw: 0.9 },
  { pose: 'reach', tilt: -0.5, lookPitch: 0.5 },
];

export class MannequinsView {
  constructor(game) {
    this.game = game;
    // Each one is posed on a rig that's never drawn, then baked into a few
    // static meshes; it's rebaked only when it moves (which is to say,
    // only when nobody's looking).
    this.list = MANNEQUIN_HOMES.map(([x, z, ry], i) => {
      const rigRoot = makePerson(MANNEQUIN_LOOKS[i % MANNEQUIN_LOOKS.length]);
      const root = new THREE.Group();
      root.scale.copy(rigRoot.scale);
      rigRoot.scale.setScalar(1);
      root.position.set(x, x < -40.2 ? 0.24 : 0, z);
      root.rotation.y = ry + Math.PI;
      game.world.scene.add(root);
      const m = { root, rigRoot, rig: rigRoot.userData.rig, pose: -1, x, z, ry, moving: false };
      this.pose(m, i % 3);
      return m;
    });
    // the one in a guard's uniform, standing in the window until it isn't
    const u = makePerson('mqGuard');
    this.uniform = new THREE.Group();
    this.uniform.scale.copy(u.scale);
    u.scale.setScalar(1);
    this.uniform.position.set(UNIFORM_HOME[0], 0.24, UNIFORM_HOME[1]);
    this.uniform.rotation.y = UNIFORM_HOME[2] + Math.PI;
    for (let i = 0; i < 40; i++) u.userData.rig.update(0.05, { pose: 'stand', stiff: true, noBlink: true, lookYaw: 0.15 });
    bakePose(u, this.uniform);
    game.world.scene.add(this.uniform);
  }

  pose(m, i) {
    if (m.pose === i) return;
    m.pose = i;
    const st = { ...POSES[i % POSES.length], speed: 0, stiff: true, noBlink: true };
    for (let k = 0; k < 40; k++) m.rig.update(0.05, st);
    bakePose(m.rigRoot, m.root);
  }

  // rows: [x, z, ry, pose, flags]
  apply(rows, uniformGone) {
    rows.forEach(([x, z, ry, pose, flags], i) => {
      const m = this.list[i];
      if (!m) return;
      const moved = Math.hypot(x - m.x, z - m.z) > 0.02 || Math.abs(ry - m.ry) > 0.05;
      m.x = x; m.z = z; m.ry = ry;
      // standing on a display platform?
      const onPlat = x < -40.2 && x > -43 && Math.abs(z) > 3.6 && Math.abs(z) < 6;
      m.root.position.set(x, onPlat || (x < -46 && x > -48 && Math.abs(z) < 2) ? 0.24 : 0, z);
      m.root.rotation.y = ry + Math.PI;
      this.pose(m, pose);
      const moving = (flags & 1) !== 0;
      if (moving && moved) this.game.mannequinMoved(m);
      m.moving = moving;
      m.active = (flags & 2) !== 0;
    });
    this.uniform.visible = !uniformGone;
  }

  dispose() {
    for (const m of this.list) m.root.removeFromParent();
    this.uniform.removeFromParent();
  }
}

// where a hidden guard's view is from, and which way it faces
export function hideView(id) {
  const H = HIDES.find((h) => h.id === id);
  if (!H) return null;
  const ry = { n: 0, s: Math.PI, e: -Math.PI / 2, w: Math.PI / 2 }[H.face];
  return { x: H.x, z: H.z, ry, y: H.id.startsWith('locker') ? 1.55 : 1.4 };
}
