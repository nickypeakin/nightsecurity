// The cars, as the client draws them: six models built from extruded side
// profiles (a body, a glasshouse, a roof, bumpers, lights) on four wheels,
// the front two steering. Headlights throw a pool of light on the road ahead,
// police cars flash red and blue, taxis have a lit sign, and a car that's
// taken a beating smokes, then burns, then sits there black.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAR_TYPES, CAR_KEYS, PAINT, TAXI_PAINT } from '../shared/car.js';
import * as TX from './textures.js';

const shape = (pts) => {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) s.lineTo(p[0], p[1]);
  return s;
};
// a side profile (in z, y) extruded across the car's width, centred
function extrude(pts, width, bevel = 0.06) {
  const g = new THREE.ExtrudeGeometry(shape(pts), { depth: width - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 1 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  // the shape's x is the car's length: turn it to run along z
  g.rotateY(-Math.PI / 2);
  return g;
}
const boxAt = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

// profiles: [lower body], [glasshouse], roof height, extras
function design(type) {
  const T = CAR_TYPES[type];
  const L = T.len, W = T.wid, H = T.ht, hl = L / 2;
  const belt = type === 'van' ? H * 0.45 : type === 'sports' ? 0.72 : 0.84;
  const D = { L, W, H, hl, belt, wheelR: type === 'van' || type === 'pickup' ? 0.4 : 0.34, wb: T.wb };
  if (type === 'van') {
    D.body = [[-hl, 0.32], [hl, 0.32], [hl, belt], [hl - 0.5, belt + 0.25], [hl - 0.9, H], [-hl, H], [-hl, 0.32]];
    D.glass = [[hl - 1.9, belt + 0.05], [hl - 0.48, belt + 0.05], [hl - 0.86, H - 0.12], [hl - 1.9, H - 0.12]];
    D.roof = null;
  } else if (type === 'pickup') {
    D.body = [[-hl, 0.36], [hl, 0.36], [hl, belt], [hl - 0.25, belt + 0.12], [0.6, belt + 0.12], [0.6, belt], [-hl, belt], [-hl, 0.36]];
    D.glass = [[-0.6, belt], [0.5, belt], [0.1, H], [-0.55, H]];
    D.roof = [-0.6, 0.15, H];
    D.bed = true;
  } else if (type === 'sports') {
    D.body = [[-hl, 0.26], [hl, 0.26], [hl, 0.5], [hl - 0.6, belt], [-hl + 0.2, belt + 0.06], [-hl, 0.62], [-hl, 0.26]];
    D.glass = [[-1.2, belt], [0.55, belt - 0.02], [-0.15, H], [-0.95, H]];
    D.roof = [-0.95, -0.15, H];
  } else {
    D.body = [[-hl, 0.3], [hl, 0.3], [hl, 0.62], [hl - 0.3, belt], [-hl + 0.15, belt + 0.03], [-hl, 0.72], [-hl, 0.3]];
    D.glass = [[-1.35, belt], [0.95, belt], [0.25, H], [-0.95, H]];
    D.roof = [-0.95, 0.25, H];
  }
  return D;
}

const MATS = {};
function mats() {
  if (MATS.ready) return MATS;
  // glass, trim, tyres, hubs: one material, coloured per vertex
  MATS.detail = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.4 });
  MATS.burnt = new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 0.95 });
  MATS.beam = new THREE.MeshBasicMaterial({ map: TX.beamPool(), color: 0x6a5a40, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true });
  MATS.ready = true;
  return MATS;
}

const paintMats = new Map();
function paintMat(p) {
  const c = p < 0 ? TAXI_PAINT : PAINT[((p % PAINT.length) + PAINT.length) % PAINT.length];
  if (!paintMats.has(c)) paintMats.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.32, metalness: 0.45 }));
  return paintMats.get(c);
}
const policePaint = () => paintMats.get('police') || paintMats.set('police', new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.3, metalness: 0.45 })).get('police');

// The lamps (head, tail, the police bar's red and blue, the taxi sign) are
// one mesh per car; which part is which is in a vertex attribute, and how
// bright each glows is a uniform, so they all switch on and off together
// in one draw.
const LAMP = { head: 0, tail: 1, red: 2, blue: 3, sign: 4 };
const lampVert = /* glsl */`
  attribute float lamp;
  varying vec3 vColor;
  varying float vLamp;
  #include <fog_pars_vertex>
  void main() {
    vColor = color;
    vLamp = lamp;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const lampFrag = /* glsl */`
  uniform vec4 glow;       // head, tail, red, blue
  uniform float signGlow;
  varying vec3 vColor;
  varying float vLamp;
  #include <fog_pars_fragment>
  void main() {
    float k = vLamp < 0.5 ? glow.x : vLamp < 1.5 ? glow.y : vLamp < 2.5 ? glow.z : vLamp < 3.5 ? glow.w : signGlow;
    gl_FragColor = vec4(vColor * (0.06 + k), 1.0);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;
const lampMat = () => new THREE.ShaderMaterial({
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { glow: { value: new THREE.Vector4() }, signGlow: { value: 0 } }]),
  vertexShader: lampVert, fragmentShader: lampFrag, vertexColors: true, fog: true,
});

// geometry with only position and normal, coloured (and maybe tagged as a lamp)
function paint(g, hex, lamp = null) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
  const c = new THREE.Color(hex), count = n.attributes.position.count;
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  n.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (lamp != null) n.setAttribute('lamp', new THREE.BufferAttribute(new Float32Array(count).fill(lamp), 1));
  return n;
}
const plain = (g) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k); return n; };

// the shared geometry for each model: { body, detail, wheel, lamps }
const MODELS = new Map();
function model(type) {
  if (MODELS.has(type)) return MODELS.get(type);
  mats();
  const D = design(type);
  const { W, H, hl } = D;
  const body = [extrude(D.body, W)];
  if (D.roof) body.push(boxAt(W * 0.84, 0.07, D.roof[1] - D.roof[0], 0, D.roof[2], (D.roof[0] + D.roof[1]) / 2));
  if (D.bed) { body.push(boxAt(0.08, 0.35, hl - 0.65, W / 2 - 0.08, D.belt + 0.1, (-hl + 0.6) / 2 - 0.05), boxAt(0.08, 0.35, hl - 0.65, -W / 2 + 0.08, D.belt + 0.1, (-hl + 0.6) / 2 - 0.05)); }
  const tyre = (x, z) => paint(new THREE.CylinderGeometry(D.wheelR, D.wheelR, 0.24, 14).rotateZ(Math.PI / 2).translate(x, D.wheelR, z), 0x111111);
  const hub = (x, z) => paint(new THREE.CylinderGeometry(D.wheelR * 0.55, D.wheelR * 0.55, 0.25, 10).rotateZ(Math.PI / 2).translate(x, D.wheelR, z), 0x8a8e92);
  const wx = W / 2 - 0.13, wz = D.wb / 2;
  const detail = [
    paint(extrude(D.glass, W * 0.86, 0.03), 0x0a0e14),
    paint(boxAt(W + 0.04, 0.16, 0.14, 0, 0.36, hl + 0.05), 0x141414), paint(boxAt(W + 0.04, 0.16, 0.14, 0, 0.36, -hl - 0.05), 0x141414),
    paint(boxAt(W * 0.5, 0.12, 0.04, 0, 0.5, hl + 0.08), 0x202020),
    // the back wheels (a turning cylinder looks just like a still one)
    tyre(wx, -wz), hub(wx, -wz), tyre(-wx, -wz), hub(-wx, -wz),
  ];
  if (type === 'police') detail.push(paint(boxAt(W + 0.01, 0.38, 2.0, 0, 0.62, -0.2), 0xe8e8e8));
  // (on the skin of the body, which its bevel makes 6 cm longer each end)
  const lz = hl + 0.065;
  const lamps = [
    paint(boxAt(0.32, 0.12, 0.04, W / 2 - 0.3, 0.6, lz), 0xfff2d0, LAMP.head), paint(boxAt(0.32, 0.12, 0.04, -W / 2 + 0.3, 0.6, lz), 0xfff2d0, LAMP.head),
    paint(boxAt(0.3, 0.1, 0.04, W / 2 - 0.25, 0.62, -lz), 0xff2010, LAMP.tail), paint(boxAt(0.3, 0.1, 0.04, -W / 2 + 0.25, 0.62, -lz), 0xff2010, LAMP.tail),
  ];
  if (type === 'police') {
    const z = (D.roof[0] + D.roof[1]) / 2;
    lamps.push(paint(boxAt(0.5, 0.12, 0.26, -0.27, H + 0.1, z), 0xff1010, LAMP.red), paint(boxAt(0.5, 0.12, 0.26, 0.27, H + 0.1, z), 0x2040ff, LAMP.blue));
  }
  if (type === 'taxi') lamps.push(paint(boxAt(0.7, 0.2, 0.22, 0, H + 0.12, (D.roof[0] + D.roof[1]) / 2), 0xffe08a, LAMP.sign));
  const wheel = mergeGeometries([paint(new THREE.CylinderGeometry(D.wheelR, D.wheelR, 0.24, 14).rotateZ(Math.PI / 2), 0x111111), paint(new THREE.CylinderGeometry(D.wheelR * 0.55, D.wheelR * 0.55, 0.25, 10).rotateZ(Math.PI / 2), 0x8a8e92)]);
  const M = { D, body: mergeGeometries(body.map(plain)), detail: mergeGeometries(detail), lamps: mergeGeometries(lamps), wheel };
  MODELS.set(type, M);
  return M;
}

// ---------------------------------------------------------------- a car
// six draws: the paint, the rest, two front wheels (they steer), the lamps,
// and (close up, lights on) the pool of light on the road
export class CarView {
  constructor(scene, type, paint) {
    this.type = type;
    this.scene = scene;
    const M = (this.M = model(type));
    const g = (this.root = new THREE.Group());
    this.paint = paint;
    this.bodyMat = type === 'police' ? policePaint() : paintMat(paint);
    this.body = new THREE.Mesh(M.body, this.bodyMat);
    this.detail = new THREE.Mesh(M.detail, MATS.detail);
    this.lampMat = lampMat();
    this.lamps = new THREE.Mesh(M.lamps, this.lampMat);
    g.add(this.body, this.detail, this.lamps);
    this.wheels = [];
    const D = M.D;
    for (const sx of [1, -1]) {
      const w = new THREE.Mesh(M.wheel, MATS.detail);
      w.position.set(sx * (D.W / 2 - 0.13), D.wheelR, D.wb / 2);
      g.add(w);
      this.wheels.push(w);
    }
    this.beam = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 13), MATS.beam);
    this.beam.rotation.x = -Math.PI / 2;
    this.beam.position.set(0, 0.03, D.hl + 6.5);
    this.beam.renderOrder = 2;
    g.add(this.beam);
    scene.add(g);
    this.x = this.z = this.h = 0;
    this.roll = 0;
    this.smokeT = 0;
    this.near = true;
  }

  setPaint(paint) {
    if (paint === this.paint || this.type === 'police') return;
    this.paint = paint;
    this.bodyMat = paintMat(paint);
    if (!this.wrecked) this.body.material = this.bodyMat;
  }

  // x, z, heading, speed, steer, flags (from the host or your own car)
  place(x, z, h, v, steer, flags, dt, t) {
    this.x = x; this.z = z; this.h = h;
    this.root.position.set(x, 0, z);
    this.root.rotation.y = h;
    // lean into corners a touch
    const lean = Math.max(-0.05, Math.min(0.05, -steer * v * 0.004));
    this.roll += (lean - this.roll) * Math.min(1, dt * 5);
    this.root.rotation.z = this.roll;
    for (const w of this.wheels) w.rotation.y = -steer;
    const lights = (flags & 2) !== 0, dead = (flags & 8) !== 0;
    const G = this.lampMat.uniforms.glow.value;
    G.x = lights && !dead ? 2.4 : 0;
    G.y = dead ? 0 : v < -0.2 || this.braking ? 2.2 : lights ? 0.9 : 0.25;
    const on = (flags & 1) !== 0 && !dead, ph = Math.floor(t * 6) % 2;
    G.z = on && ph === 0 ? 4 : 0;
    G.w = on && ph === 1 ? 4 : 0;
    this.lampMat.uniforms.signGlow.value = dead ? 0 : 1.6;
    this.beam.visible = lights && !dead && this.near;
    if (dead && !this.wrecked) {
      this.wrecked = true;
      this.body.material = MATS.burnt;
      this.detail.material = MATS.burnt;
      for (const w of this.wheels) w.material = MATS.burnt;
      this.lamps.visible = false;
    }
  }

  dispose() { this.root.removeFromParent(); this.lampMat.dispose(); }
}

export function prewarmCars(scene) {
  const g = new THREE.Group();
  CAR_KEYS.forEach((k, i) => { const c = new CarView(g, k, i); c.root.position.set(i * 6, -50, 0); c.place(i * 6, 0, 0, 0, 0, 3, 0, 0); });
  scene.add(g);
  return () => scene.remove(g);
}
