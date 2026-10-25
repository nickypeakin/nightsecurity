// Everyone on foot, as the client draws them. A person is built once per
// look (shared/humans.js makes the body), then turned into one skinned mesh
// per material with a skeleton of the same joints, so a street full of
// people is a few draw calls each rather than thirty, and every copy of a
// look shares its geometry. The rig poses the bones exactly as it posed
// the joints.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makePerson, LOOKS, Rig } from './humans.js';
import { makeRng } from '../shared/rng.js';
import { LOOK_COP, LOOK_GANG, LOOK_CREW, LOOK_DRE, LOOK_BOSS, LOOK_VOSS, PED_LOOKS } from '../host/peds.js';

// ------------------------------------------------------------------ looks
const SKIN = [0xf0c8a6, 0xdcae8a, 0xb77a52, 0x8a5638, 0x5a3a28, 0xe8b894, 0xc89070, 0x6a4430];
const HAIR = [0x120c09, 0x2a1a10, 0x5a3a20, 0x9a6a3a, 0xc8a060, 0x6a6a68, 0x1a1a1a];
const TOPS = ['tee', 'hoodie', 'jacket', 'sweater', 'coat', 'workshirt', 'bomber', 'suit'];
const CLOTH = [0x2a3a5a, 0x7a2a2a, 0x3a5a3a, 0xc8b090, 0x1a1a1c, 0x8a8a90, 0x5a3a6a, 0xd8d0c0, 0x8a5a2a, 0x2a5a6a];
function pedLook(i) {
  const r = makeRng(`ped${i}`);
  const f = r() < 0.48;
  const top = r.pick(TOPS);
  const bottom = f && r() < 0.35 ? r.pick(['skirt', 'longskirt']) : r() < 0.55 ? 'jeans' : 'trousers';
  return {
    sex: f ? 'f' : 'm', skin: r.pick(SKIN), iris: 0x3a2a1a,
    hair: f ? r.pick(['long', 'pony', 'bun', 'curly', 'short']) : r.pick(['short', 'buzz', 'slick', 'curly', 'balding']),
    hairColor: r.pick(HAIR), top, topColor: r.pick(CLOTH), inner: 0xe8e8e2, tie: top === 'suit' ? r.pick([0x8a1a2a, 0x1a3a6a]) : null,
    bottom, bottomColor: bottom === 'jeans' ? 0x5a7fa8 : r.pick([0x1a1a1c, 0x2a2c30, 0x4a3a2a, 0x3a4a5a]), legs: f ? r.pick(SKIN) : null,
    shoes: r.pick(['sneaker', 'dress', 'boot', 'flat']), shoeColor: r.pick([0x1a1a1a, 0x4a3020, 0xe8e8e2]),
    hat: r() < 0.15 ? 'cap' : null, hatColor: r.pick(CLOTH), glasses: r() < 0.15, heavy: r() < 0.2 ? 1.08 : 1, height: f ? 1.6 + r() * 0.12 : 1.7 + r() * 0.14,
  };
}
const SPECIAL = {
  [LOOK_COP]: { sex: 'm', skin: 0xc89070, hair: 'buzz', hairColor: 0x1a1a1a, hat: 'police', hatColor: 0x141c30, top: 'uniform', topColor: 0x1e2a48, bottom: 'trousers', bottomColor: 0x161a24, shoes: 'boot', shoeColor: 0x0e0e0e, height: 1.82 },
  [LOOK_GANG]: { sex: 'm', skin: 0xb77a52, hair: 'buzz', hairColor: 0x120c09, hat: 'cap', hatColor: 0x8a1010, top: 'hoodie', topColor: 0x6a1010, bottom: 'jeans', bottomColor: 0x5a7fa8, shoes: 'sneaker', shoeColor: 0xe8e8e2, height: 1.8 },
  [LOOK_CREW]: { sex: 'm', skin: 0xdcae8a, hair: 'slick', hairColor: 0x1a1a1a, glasses: true, top: 'suit', topColor: 0x141416, inner: 0x141416, tie: 0x141416, bottom: 'trousers', bottomColor: 0x141416, shoes: 'dress', shoeColor: 0x0a0a0a, height: 1.84 },
  [LOOK_BOSS]: { sex: 'm', skin: 0xe0b898, hair: 'balding', hairColor: 0x5a3a20, mustache: true, top: 'coat', topColor: 0x3a2a1a, bottom: 'trousers', bottomColor: 0x2a2420, shoes: 'dress', shoeColor: 0x1a0e08, height: 1.78, heavy: 1.12 },
  [LOOK_DRE]: 'dre',
  [LOOK_VOSS]: null,
};
export const PLAYER_LOOKS = ['friend0', 'friend1', 'friend2', 'friend3'];
export const GIVER_LOOKS = {
  dre: 'dre',
  okafor: 'manager',
  vince: 'vince',
  voss: { sex: 'f', skin: 0xe8c8b0, iris: 0x4a6a8a, hair: 'slick', hairColor: 0xc8c0b0, top: 'coat', topColor: 0x1a1a1e, bottom: 'trousers', bottomColor: 0x141416, shoes: 'dress', shoeColor: 0x0a0a0a, height: 1.76 },
};
SPECIAL[LOOK_VOSS] = GIVER_LOOKS.voss;

export function lookFor(id) {
  if (typeof id === 'string' || typeof id === 'object') return id;
  if (SPECIAL[id] != null) return SPECIAL[id];
  return pedLook(id % PED_LOOKS);
}

// --------------------------------------------------------------- templates
// one plain material per finish (colour in the vertices); textured and
// see-through materials stay as they are
const plainMats = new Map();
function plainFor(m) {
  if (m.map || m.alphaMap || m.transparent || (m.emissive && m.emissive.r + m.emissive.g + m.emissive.b > 0.001)) return null;
  const r = m.roughness < 0.45 ? 0.32 : 0.75, mt = m.metalness > 0.35 ? 0.6 : 0;
  const k = `${r}:${mt}:${m.polygonOffset ? 1 : 0}`;
  if (!plainMats.has(k)) {
    const p = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: r, metalness: mt });
    if (m.polygonOffset) { p.polygonOffset = true; p.polygonOffsetFactor = -2; p.polygonOffsetUnits = -2; }
    plainMats.set(k, p);
  }
  return plainMats.get(k);
}

const templates = new Map();
// a look made ready to skin: geometry per material, the bones at rest, and
// which bone is which part of the rig
export function template(id, { lite = true } = {}) {
  const key = `${typeof id === 'object' ? JSON.stringify(id) : id}:${lite}`;
  if (templates.has(key)) return templates.get(key);
  const root = makePerson(lookFor(id), { lite });
  const rig = root.userData.rig;
  // the skirt moves on its own: give it a joint
  if (rig.skirt) {
    const m = rig.skirt, j = new THREE.Group();
    j.position.copy(m.position); j.rotation.copy(m.rotation); j.scale.copy(m.scale);
    m.parent.add(j);
    j.add(m);
    m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1);
    rig.skirt = j;
  }
  const scale = root.scale.clone();
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);
  const joints = [];
  root.traverse((o) => { if (o !== root && !o.isMesh) joints.push(o); });
  const index = new Map(joints.map((j, i) => [j, i]));
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const bones = joints.map((j) => ({ parent: index.has(j.parent) ? index.get(j.parent) : -1, pos: j.position.clone(), quat: j.quaternion.clone(), scale: j.scale.clone() }));
  const inverses = joints.map((j) => new THREE.Matrix4().multiplyMatrices(inv, j.matrixWorld).invert());
  // the meshes, in the person's space, each bound to its joint
  const byMat = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const bone = index.get(o.parent) ?? 0;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(n)) g.deleteAttribute(n);
    const n = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    const shared = plainFor(o.material);
    if (shared) {
      const c = o.material.color, had = o.material.vertexColors && g.attributes.color;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = c.r * (had ? had.getX(i) : 1); col[i * 3 + 1] = c.g * (had ? had.getY(i) : 1); col[i * 3 + 2] = c.b * (had ? had.getZ(i) : 1); }
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    } else if (g.attributes.color && !o.material.vertexColors) g.deleteAttribute('color');
    else if (o.material.vertexColors && !g.attributes.color) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = bone; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    const m = shared || o.material;
    if (!byMat.has(m)) byMat.set(m, []);
    byMat.get(m).push(g);
  });
  const parts = [];
  for (const [m, list] of byMat) {
    const geo = mergeGeometries(list);
    for (const g of list) g.dispose();
    if (!geo) continue;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.3);
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(-0.8, -0.2, -0.8), new THREE.Vector3(0.8, 2.0, 0.8));
    parts.push({ geo, mat: m });
  }
  const at = (j) => index.get(j);
  const map = {
    body: at(rig.body), pelvis: at(rig.pelvis), spine: at(rig.spine), chest: at(rig.chest), neck: at(rig.neck), head: at(rig.head), skull: at(rig.skull),
    legs: rig.legs.map((l) => ({ hip: at(l.hip), knee: at(l.knee), ankle: at(l.ankle) })),
    arms: rig.arms.map((a) => ({ shoulder: at(a.shoulder), elbow: at(a.elbow), wrist: at(a.wrist) })),
    lids: rig.lids.map(at), pony: rig.pony ? at(rig.pony) : null, skirt: rig.skirt ? at(rig.skirt) : null,
  };
  const tpl = { parts, bones, inverses, map, scale, look: rig.look };
  templates.set(key, tpl);
  return tpl;
}

// a person from a template: { root, rig, bones }
export function instance(tpl) {
  const bones = tpl.bones.map((b) => {
    const bone = new THREE.Bone();
    bone.position.copy(b.pos); bone.quaternion.copy(b.quat); bone.scale.copy(b.scale);
    return bone;
  });
  const root = new THREE.Group();
  tpl.bones.forEach((b, i) => (b.parent >= 0 ? bones[b.parent] : root).add(bones[i]));
  root.scale.copy(tpl.scale);
  const skeleton = new THREE.Skeleton(bones, tpl.inverses);
  for (const { geo, mat } of tpl.parts) {
    const m = new THREE.SkinnedMesh(geo, mat);
    m.bind(skeleton, new THREE.Matrix4());
    m.boundingSphere = geo.boundingSphere.clone();
    m.boundingBox = geo.boundingBox.clone();
    root.add(m);
  }
  const M = tpl.map, B = (i) => (i == null ? null : bones[i]);
  const rig = new Rig({
    root, body: B(M.body), pelvis: B(M.pelvis), spine: B(M.spine), chest: B(M.chest), neck: B(M.neck), head: B(M.head), skull: B(M.skull),
    legs: M.legs.map((l) => ({ hip: B(l.hip), knee: B(l.knee), ankle: B(l.ankle) })),
    arms: M.arms.map((a) => ({ shoulder: B(a.shoulder), elbow: B(a.elbow), wrist: B(a.wrist) })),
    eyes: [], lids: M.lids.map(B), prop: null, look: tpl.look, eyeMat: null, eyeR: 0.0118, pony: B(M.pony), skirt: B(M.skirt),
  });
  return { root, rig, bones };
}

// ------------------------------------------------------------- the guns
const gunMats = { black: new THREE.MeshStandardMaterial({ color: 0x2c2c30, roughness: 0.38, metalness: 0.35 }), wood: new THREE.MeshStandardMaterial({ color: 0x4a2e1a, roughness: 0.7 }) };
const gunGeo = new Map();
// a gun model for weapon w (1 pistol, 2 SMG, 3 shotgun), muzzle at +z
export function gunModel(w) {
  if (!gunGeo.has(w)) {
    const g = new THREE.Group();
    const b = (m, x, y, z, sx, sy, sz) => { const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); o.position.set(x, y, z); g.add(o); };
    if (w === 1) { b(gunMats.black, 0, 0.02, 0.07, 0.03, 0.035, 0.16); b(gunMats.black, 0, -0.04, 0.0, 0.028, 0.09, 0.035); }
    if (w === 2) { b(gunMats.black, 0, 0.02, 0.12, 0.04, 0.06, 0.3); b(gunMats.black, 0, -0.06, 0.06, 0.03, 0.12, 0.04); b(gunMats.black, 0, -0.06, 0.16, 0.025, 0.14, 0.03); }
    if (w === 3) { b(gunMats.black, 0, 0.03, 0.25, 0.04, 0.04, 0.55); b(gunMats.wood, 0, 0.0, -0.05, 0.04, 0.08, 0.25); b(gunMats.wood, 0, 0.0, 0.25, 0.05, 0.05, 0.2); }
    gunGeo.set(w, g);
  }
  return gunGeo.get(w).clone();
}

// ------------------------------------------------------------- a person
// What the host's anim codes (host/peds.js A) mean as poses.
const ANIMS = ['stand', 'walk', 'walk', 'aim', 'collapse', 'collapse', 'hands', 'stand', 'stand', 'cower'];

export class PersonView {
  constructor(scene, look, { lite = true } = {}) {
    const tpl = template(look, { lite });
    const { root, rig } = instance(tpl);
    this.root = root;
    this.rig = rig;
    this.scene = scene;
    scene.add(root);
    this.x = this.z = this.tx = this.tz = 0;
    this.h = this.th = 0;
    this.y = 0;
    this.anim = 0;
    this.w = 0;
    this.speed = 0;
    this.fresh = true;
    this.gun = null;
    this.gunW = 0;
    this.stepAcc = 0;
    this.dead = false;
    this.downAngle = 0;
  }

  // a new position from the host
  set(x, z, h, anim, w = 0, speed = null) {
    this.tx = x; this.tz = z; this.th = h;
    this.anim = anim; this.w = w;
    if (speed != null) this.targetSpeed = speed;
    if (this.fresh) { this.x = x; this.z = z; this.h = h; this.fresh = false; }
  }

  // hold weapon w in the right hand (0: nothing)
  hold(w) {
    if (w === this.gunW) return;
    if (this.gun) this.gun.removeFromParent();
    this.gun = null;
    this.gunW = w;
    if (w > 0) {
      this.gun = gunModel(w);
      // in the fist, the barrel on along the forearm
      this.gun.position.set(0, -0.085, 0.0);
      this.gun.rotation.set(Math.PI / 2, 0, 0);
      this.rig.arms[1].wrist.add(this.gun);
    }
  }

  update(dt, { pose = null, aimPitch = 0, y = null, smooth = 10 } = {}) {
    const k = 1 - Math.exp(-dt * smooth);
    const px = this.x, pz = this.z;
    this.x += (this.tx - this.x) * k;
    this.z += (this.tz - this.z) * k;
    let d = this.th - this.h;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.h += d * k;
    const moved = Math.hypot(this.x - px, this.z - pz) / Math.max(dt, 1e-3);
    this.speed += (moved - this.speed) * Math.min(1, dt * 8);
    this.root.position.set(this.x, y ?? 0.12, this.z);
    this.root.rotation.y = this.h;
    const p = pose || ANIMS[this.anim] || 'stand';
    const aiming = p === 'aim' && this.w > 0;
    this.hold(this.anim === 3 || aiming ? this.w : 0);
    // a phone, for phone calls
    if (p === 'phone' && !this.phone) {
      this.phone = new THREE.Group();
      this.phone.add(new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.16, 0.03), gunMats.black), new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.07, 0.012), gunMats.black));
      this.phone.children[1].position.set(0.015, 0.1, 0);
      this.phone.position.set(0, -0.09, 0.02);
      this.rig.arms[1].wrist.add(this.phone);
    }
    if (this.phone) this.phone.visible = p === 'phone';
    const st = { pose: aiming ? (this.w >= 2 ? 'aim2' : 'aim') : p === 'aim' ? 'stand' : p, speed: this.speed, aimPitch, stiff: this.anim === 8 };
    if (p === 'collapse') st.lookYaw = 0;
    this.rig.update(dt, st);
  }

  dispose() { this.root.removeFromParent(); }
}
