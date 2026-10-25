// Things that flash, fly and burn: muzzle flashes, tracers, sparks where
// bullets hit, explosions, smoke from a beaten-up car, fire. Particles live
// in two batches (one blended, for smoke and dust; one additive, for fire,
// flashes and sparks), so a big explosion is still only two draws. Also the
// glowing markers for jobs and checkpoints, and the pickups.

import * as THREE from 'three';
import { groundY } from '../shared/city.js';
import * as TX from './textures.js';

const MAX = 600;

const VERT = /* glsl */`
attribute float size;
attribute vec4 tint;
varying vec4 vTint;
void main() {
  vTint = tint;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (520.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */`
uniform sampler2D map;
varying vec4 vTint;
void main() {
  vec4 t = texture2D(map, gl_PointCoord);
  gl_FragColor = vec4(vTint.rgb * t.rgb, vTint.a * t.a);
}`;

class Batch {
  constructor(scene, additive) {
    this.pos = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.tint = new Float32Array(MAX * 4);
    this.items = [];
    const g = (this.geo = new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('tint', new THREE.BufferAttribute(this.tint, 4).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      uniforms: { map: { value: TX.glow() } }, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
    scene.add(this.points);
  }

  // { x, y, z, vx, vy, vz, life, size, grow, color [r, g, b], alpha, drag, rise }
  add(p) {
    if (this.items.length >= MAX) this.items.shift();
    p.t = 0;
    this.items.push(p);
  }

  update(dt) {
    let n = 0;
    const keep = [];
    for (const p of this.items) {
      p.t += dt;
      if (p.t >= p.life) continue;
      p.vy += (p.rise || 0) * dt;
      const d = Math.exp(-(p.drag || 0) * dt);
      p.vx *= d; p.vy *= d; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = p.t / p.life;
      this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = p.z;
      this.size[n] = p.size * (1 + (p.grow || 0) * k);
      const a = (p.alpha ?? 1) * (p.fadeIn ? Math.min(1, k * 6) : 1) * (1 - k) * (p.flicker ? 0.7 + Math.random() * 0.3 : 1);
      this.tint[n * 4] = p.color[0]; this.tint[n * 4 + 1] = p.color[1]; this.tint[n * 4 + 2] = p.color[2]; this.tint[n * 4 + 3] = a;
      keep.push(p);
      n++;
    }
    this.items = keep;
    this.geo.setDrawRange(0, n);
    for (const k of ['position', 'size', 'tint']) this.geo.attributes[k].needsUpdate = true;
  }
}

export class Fx {
  constructor(world) {
    this.world = world;
    const s = world.scene;
    this.smoke = new Batch(s, false);
    this.glow = new Batch(s, true);
    // tracers: short-lived lines
    this.lines = [];
    const lg = new THREE.BufferGeometry();
    this.linePos = new Float32Array(64 * 6);
    this.lineCol = new Float32Array(64 * 6);
    lg.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3).setUsage(THREE.DynamicDrawUsage));
    lg.setAttribute('color', new THREE.BufferAttribute(this.lineCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.tracers = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tracers.frustumCulled = false;
    s.add(this.tracers);
    this.flashT = 0;
    this.flashMax = 0;
  }

  muzzle(x, y, z, dx, dz) {
    this.glow.add({ x: x + dx * 0.15, y, z: z + dz * 0.15, vx: 0, vy: 0, vz: 0, life: 0.07, size: 0.9, color: [1, 0.75, 0.35], alpha: 1 });
    this.glow.add({ x: x + dx * 0.4, y, z: z + dz * 0.4, vx: dx, vy: 0, vz: dz, life: 0.05, size: 0.5, color: [1, 0.9, 0.6] });
    this.light(x, y, z, 4, 0.06);
  }

  tracer(a, b, color = [1, 0.85, 0.5]) {
    if (this.lines.length >= 64) this.lines.shift();
    this.lines.push({ a, b, t: 0, life: 0.07, color });
  }

  // where a bullet stops: sparks off metal, dust off walls
  impact(x, y, z, kind) {
    if (kind === 3) for (let k = 0; k < 6; k++) this.glow.add({ x, y, z, vx: (Math.random() - 0.5) * 6, vy: Math.random() * 4, vz: (Math.random() - 0.5) * 6, rise: -12, life: 0.25, size: 0.12, color: [1, 0.8, 0.4] });
    else if (kind === 2) for (let k = 0; k < 4; k++) this.smoke.add({ x, y, z, vx: (Math.random() - 0.5) * 2, vy: Math.random() * 1.5, vz: (Math.random() - 0.5) * 2, rise: -3, life: 0.35, size: 0.25, color: [0.35, 0.05, 0.05], alpha: 0.8 });
    else for (let k = 0; k < 3; k++) this.smoke.add({ x, y, z, vx: (Math.random() - 0.5) * 1.5, vy: Math.random() * 1.2, vz: (Math.random() - 0.5) * 1.5, life: 0.6, size: 0.35, grow: 1.5, color: [0.55, 0.52, 0.48], alpha: 0.6, drag: 2 });
  }

  explosion(x, z) {
    const y = groundY(x, z) + 1;
    for (let k = 0; k < 26; k++) {
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 7;
      this.glow.add({ x, y: y + Math.random(), z, vx: Math.cos(a) * s, vy: 2 + Math.random() * 6, vz: Math.sin(a) * s, drag: 2.5, life: 0.5 + Math.random() * 0.5, size: 2.2 + Math.random() * 2, grow: 0.8, color: [1, 0.55 + Math.random() * 0.2, 0.2], flicker: true });
    }
    for (let k = 0; k < 24; k++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 3;
      this.smoke.add({ x, y: y + Math.random() * 2, z, vx: Math.cos(a) * s, vy: 2 + Math.random() * 3, vz: Math.sin(a) * s, drag: 1.2, rise: 0.5, life: 2.5 + Math.random() * 2, size: 3, grow: 2.5, color: [0.12, 0.11, 0.1], alpha: 0.75, fadeIn: true });
    }
    for (let k = 0; k < 20; k++) this.glow.add({ x, y: y + 0.5, z, vx: (Math.random() - 0.5) * 22, vy: 4 + Math.random() * 10, vz: (Math.random() - 0.5) * 22, rise: -14, life: 0.8 + Math.random() * 0.6, size: 0.2, color: [1, 0.7, 0.3] });
    this.light(x, y + 1, z, 30, 0.6);
  }

  // a damaged car smokes; a burning one burns
  carSmoke(x, z, dark) {
    this.smoke.add({ x: x + (Math.random() - 0.5) * 0.6, y: groundY(x, z) + 1.0, z: z + (Math.random() - 0.5) * 0.6, vx: (Math.random() - 0.5) * 0.4, vy: 1.4, vz: (Math.random() - 0.5) * 0.4, rise: 0.3, life: 2.2, size: 0.9, grow: 2.5, color: dark ? [0.08, 0.08, 0.08] : [0.45, 0.45, 0.45], alpha: dark ? 0.7 : 0.35, fadeIn: true });
  }
  fire(x, z) {
    this.glow.add({ x: x + (Math.random() - 0.5) * 1.4, y: groundY(x, z) + 0.9 + Math.random() * 0.4, z: z + (Math.random() - 0.5) * 1.4, vx: 0, vy: 2 + Math.random() * 1.5, vz: 0, life: 0.45, size: 1.2 + Math.random(), color: [1, 0.5 + Math.random() * 0.2, 0.15], flicker: true });
    if (Math.random() < 0.3) this.carSmoke(x, z, true);
  }

  // a pickup sparkle, a puff when something's knocked flying
  puff(x, y, z, color = [0.6, 0.58, 0.55]) {
    for (let k = 0; k < 6; k++) this.smoke.add({ x, y, z, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 2, vz: (Math.random() - 0.5) * 3, drag: 3, life: 0.7, size: 0.6, grow: 1.5, color, alpha: 0.5 });
  }
  sparkle(x, y, z) {
    for (let k = 0; k < 10; k++) this.glow.add({ x, y, z, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 3, vz: (Math.random() - 0.5) * 3, drag: 2, life: 0.5, size: 0.25, color: [0.6, 1, 0.6] });
  }

  // the scene's spare point light, flashed for gunfire and explosions
  light(x, y, z, intensity, dur) {
    const L = this.world.flash;
    if (intensity < L.intensity && this.flashT > 0) return;
    L.position.set(x, y, z);
    L.intensity = intensity;
    this.flashMax = intensity;
    this.flashT = dur;
    this.flashDur = dur;
  }

  update(dt) {
    this.smoke.update(dt);
    this.glow.update(dt);
    let n = 0;
    this.lines = this.lines.filter((l) => (l.t += dt) < l.life);
    for (const l of this.lines) {
      const k = 1 - l.t / l.life;
      this.linePos.set([...l.a, ...l.b], n * 6);
      this.lineCol.set([l.color[0] * k * 0.3, l.color[1] * k * 0.3, l.color[2] * k * 0.3, l.color[0] * k, l.color[1] * k, l.color[2] * k], n * 6);
      n++;
    }
    this.tracers.geometry.setDrawRange(0, n * 2);
    this.tracers.geometry.attributes.position.needsUpdate = true;
    this.tracers.geometry.attributes.color.needsUpdate = true;
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.world.flash.intensity = Math.max(0, this.flashMax * (this.flashT / this.flashDur));
    } else this.world.flash.intensity = 0;
  }

  dispose() {
    for (const o of [this.smoke.points, this.glow.points, this.tracers]) o.removeFromParent();
    this.world.flash.intensity = 0;
  }
}

// ------------------------------------------------------------- markers
const MARKER_COL = { giver: 0xffd040, dest: 0xffd040, check: 0xff4040, check2: 0x803030, pickup: 0x40ff60, shop: 0x60c0ff, save: 0x60ff9a, eat: 0xffa040, door: 0xfff0a0 };
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true);
// a glowing ring of light on the ground (job markers, checkpoints)
export function makeMarker(kind, r = 1.4) {
  const g = new THREE.Group();
  const col = MARKER_COL[kind] ?? 0xffd040;
  const tall = kind === 'check' || kind === 'check2';
  const m = new THREE.Mesh(cylGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.scale.set(r, tall ? 7 : 1.4, r);
  m.position.y = tall ? 3.5 : 0.7;
  g.add(m);
  const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.92, r, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.16;
  g.add(ring);
  g.userData.spin = m;
  return g;
}

// pickups: a spinning thing over a soft glow
const PICK = {
  cash: [0x40c060, 'box', [0.35, 0.2, 0.2]], health: [0xe02020, 'cross'], armor: [0x3a7ae0, 'box', [0.35, 0.45, 0.12]],
  pistol: [0x9a9a9a, 'gun', 1], smg: [0x9a9a9a, 'gun', 2], shotgun: [0x9a9a9a, 'gun', 3], tape: [0x202020, 'box', [0.19, 0.03, 0.1]],
  bag: [0x6a4a2a, 'box', [0.45, 0.3, 0.25]], crate: [0x8a6a3a, 'box', [0.9, 0.9, 1.4]],
};
export function makePickup(kind, gunModel) {
  const g = new THREE.Group();
  const [col, shape, dims] = PICK[kind] || [0xffffff, 'box', [0.3, 0.3, 0.3]];
  const m = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, roughness: 0.4 });
  let obj;
  if (shape === 'cross') {
    obj = new THREE.Group();
    obj.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.12), m), new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.12), m));
  } else if (shape === 'gun') {
    obj = gunModel(dims);
    obj.scale.setScalar(2.2);
  } else obj = new THREE.Mesh(new THREE.BoxGeometry(...dims), m);
  if (kind === 'tape') {
    obj = new THREE.Group();
    obj.add(new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.105, 0.025), m));
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.05), new THREE.MeshBasicMaterial({ map: TX.sign('SECURITY\nTAPE', { w: 128, h: 48, bg: '#e8e0c8', fg: '#2a2a6a', font: 'bold 18px Arial' }) }));
    label.position.z = 0.014;
    obj.add(label);
    obj.scale.setScalar(2.2);
  }
  obj.position.y = kind === 'crate' ? 0.6 : 1.0;
  g.add(obj);
  g.userData.spin = kind === 'crate' ? null : obj;
  if (kind !== 'crate') {
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.glow(), color: col, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.position.y = 1.0;
    halo.scale.setScalar(1.3);
    g.add(halo);
  }
  return g;
}
