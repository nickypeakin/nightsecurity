// Kingsgate Mall in 3D: built once at start-up from the plan in
// shared/mall.js and reused by the title screen and every night.
// Walls are turned into faces with the right material on each side and
// world-metre texture coordinates; everything that never moves is merged
// by material in a few big chunks of the building (few draw calls, and
// the flashlight's shadow only redraws the chunks it can see). The gates, doors, the carousel,
// the TVs, the monitors and the alarm panel stay separate so they can move
// and change.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';
import * as M from './models.js';
import { mat } from './props.js';
import { setLights } from './lighting.js';
import { STORES, STALLS, ROOMS, WALLS, PROPS, DOORS, STATIONS, CAMERAS, PLATFORMS, SPOTS } from '../shared/mall.js';
import { FIXTURES } from '../shared/lights.js';

// The chunks: split where the building is (Halvorsen's, the west wing,
// the court, the east wing, the food court; behind the scenes, the
// shops and concourse, outside) so nothing in plain view straddles two.
const XCUT = [-40, -10, 10, 40], ZCUT = [-17.25, 17.6];
const chunkOf = (x, z) => `${XCUT.filter((c) => x >= c).length}:${ZCUT.filter((c) => z >= c).length}`;

// Opaque materials with no glow and no bump all become one of a few shared
// materials per texture (or none), with the colour in the vertices, so a
// hundred differently painted props merge into a handful of meshes.
const plainMats = new Map();
function plainKey(m) {
  if (!m.isMeshStandardMaterial || m.alphaMap || m.transparent || m.vertexColors || m.bumpMap || m.emissiveMap || m.polygonOffset) return null;
  if (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) * m.emissiveIntensity > 0.001) return null;
  const r = m.roughness < 0.45 ? 0.3 : m.roughness < 0.75 ? 0.6 : 0.9, mt = m.metalness > 0.35 ? 0.6 : 0;
  const k = `plain:${m.map ? m.map.uuid : ''}:${r}:${mt}:${m.side}`;
  if (!plainMats.has(k)) plainMats.set(k, new THREE.MeshStandardMaterial({ map: m.map || null, vertexColors: true, roughness: r, metalness: mt, side: m.side }));
  return k;
}

// merge static meshes by material, chunk by chunk
function mergeStatic(root, { shadows = true } = {}) {
  root.updateMatrixWorld(true);
  const byKey = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    for (let p = o; p; p = p.parent) if (p.userData.keep) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const pk = plainKey(o.material);
    if (pk) {
      const n = g.attributes.position.count, col = new Float32Array(n * 3), c = o.material.color;
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    }
    g.computeBoundingBox();
    const c = new THREE.Vector3();
    g.boundingBox.getCenter(c);
    const material = pk ? plainMats.get(pk) : o.material;
    const key = `${material.uuid}:${chunkOf(c.x, c.z)}`;
    if (!byKey.has(key)) byKey.set(key, { material, list: [], cast: false });
    const e = byKey.get(key);
    e.list.push(g);
    e.cast ||= o.castShadow;
  });
  const out = new THREE.Group();
  for (const e of byKey.values()) {
    const merged = new THREE.Mesh(mergeGeometries(e.list), e.material);
    merged.castShadow = shadows && e.cast;
    merged.receiveShadow = true;
    out.add(merged);
    for (const g of e.list) g.dispose();
  }
  return out;
}

// The faces of the walls (and floors and ceilings), by material, with
// texture coordinates in metres.
class FaceBuilder {
  constructor() { this.buf = new Map(); }
  quad(key, a, b, c, d, n) {
    if (!this.buf.has(key)) this.buf.set(key, { pos: [], nor: [], uv: [] });
    const B = this.buf.get(key);
    const uvOf = (p) => {
      if (Math.abs(n[1]) > 0.5) return [p[0], p[2]];
      if (Math.abs(n[0]) > 0.5) return [n[0] > 0 ? -p[2] : p[2], p[1]];
      return [n[2] > 0 ? p[0] : -p[0], p[1]];
    };
    for (const p of [a, b, c, a, c, d]) { B.pos.push(...p); B.nor.push(...n); B.uv.push(...uvOf(p)); }
  }
  // a box's faces; faces: { n, s, e, w, top, bottom } material keys (null skips)
  box(b, faces) {
    const { x0, x1, y0, y1, z0, z1 } = b;
    if (faces.s) this.quad(faces.s, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
    if (faces.n) this.quad(faces.n, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);
    if (faces.e) this.quad(faces.e, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]);
    if (faces.w) this.quad(faces.w, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
    if (faces.top) this.quad(faces.top, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]);
    if (faces.bottom) this.quad(faces.bottom, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
  }
  floor(key, x0, x1, z0, z1, y = 0) { this.quad(key, [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0]); }
  ceiling(key, x0, x1, z0, z1, y) { this.quad(key, [x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, -1, 0]); }
  meshes(matFor) {
    const out = [];
    for (const [key, B] of this.buf) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
      const m = new THREE.Mesh(g, matFor(key));
      m.receiveShadow = true;
      m.castShadow = !key.startsWith('ceil') && !key.startsWith('floor') && key !== 'glass';
      out.push(m);
    }
    return out;
  }
}

const STORE_FLOORS = {
  records: ['vct', '#2a2a2e', '#e8e4d8'], jewelry: ['carpet', '#1a2a48'], photo: ['vct', '#d8dce0', '#c4c8cc'], shoes: ['vct', '#c8c4b8', '#3a3a3a'],
  video: ['carpet', '#22305a'], arcade: ['carpet', '#140f2a'], electronics: ['vct', '#e0dcd4', '#cac6be'], books: ['carpet', '#4a2a20'],
  boutique: ['carpet', '#c8b0b4'], toys: ['vct', '#f2d24a', '#3a7ad8'], vacant: ['concrete', '#8a867e'], pretzel: ['vct', '#f0e0c0', '#8a3a10'],
  cards: ['carpet', '#7a5a8a'], pharmacy: ['vct', '#f0f2f2', '#d8e0e0'], clothes: ['vct', '#2a2a2a', '#4a4a4a'], closing: ['vct', '#c8c4b8', '#b8b4a8'],
};

export class Mall {
  constructor(renderer) {
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x04060a);
    this.fog = new THREE.FogExp2(0x05070a, 0.006);
    s.fog = this.fog;
    void renderer;
    this.t = 0;
    this.state = { breakers: { concourse: true, court: true, food: true, stores: false, back: true, cams: true }, carousel: false };
    this.flags = 0;
    this.doorViews = [];
    this.statics = new THREE.Group();
    this.buildShell();
    this.buildProps();
    this.buildFronts();
    this.buildBack();
    this.buildOutside();
    this.buildFixtures();
    this.buildDoors();
    const merged = mergeStatic(this.statics);
    s.add(merged);
    // the parts that move or change (screens, the carousel, the fountain's
    // water, switches, Dale's locker door) stay whole, where they were
    const kept = [];
    const findKept = (o) => { for (const c of o.children) { if (c.userData.keep) kept.push(c); else findKept(c); } };
    findKept(this.statics);
    for (const o of kept) s.attach(o);
    // Far-off detail isn't drawn: past forty-odd metres, in the dark and
    // the haze, there's nothing of a gate or a screen to make out, and each
    // is a few draw calls. Bigger things stay longer. Judged from whichever
    // camera is drawing, so the security cameras see what's near them.
    this.far = [];
    for (const o of [...kept, ...this.stations, ...this.doorViews.map((v) => v.group)]) this.addFar(o);
    this.buildLights();
    this.applyLights();
  }

  addFar(o, { ref = null, far = 0, owner = null } = {}) {
    let box = null;
    if (!ref) {
      box = new THREE.Box3().setFromObject(o);
      const size = box.getSize(new THREE.Vector3());
      far = far || 40 + 4 * Math.max(size.x, size.y, size.z);
    }
    this.far.push({ o, box, ref, far, owner });
  }

  dropFar(owner) { this.far = this.far.filter((e) => e.owner !== owner); }

  cullFrom(p) {
    for (const e of this.far) e.o.visible = (e.box ? e.box.distanceToPoint(p) : e.ref.position.distanceTo(p)) < e.far;
  }

  // ------------------------------------------------------------ materials
  matFor(key) {
    this.mats = this.mats || new Map();
    if (this.mats.has(key)) return this.mats.get(key);
    const std = (map, o = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.8, ...o });
    let m;
    if (key.startsWith('store:')) {
      const st = STORES.find((q) => q.id === key.slice(6));
      m = std(TX.meters(TX.plainWall(st.wall, `w${st.id}`), 2), { roughness: 0.85 });
    } else if (key.startsWith('floor:')) {
      const [, kind, a, b] = key.split(':');
      const tex = kind === 'terrazzo' ? TX.meters(TX.terrazzo(a, `terr${a}`), 2.4)
        : kind === 'carpet' ? TX.meters(TX.carpet(a, `c${a}`), 2)
          : kind === 'concrete' ? TX.meters(TX.concrete(a, `con${a}`), 3)
            : kind === 'tile' ? TX.meters(TX.tile('#c8c8c0'), 1.2)
              : TX.meters(TX.vct(a, b, `v${a}${b}`), 1.2);
      m = std(tex, { roughness: kind === 'terrazzo' ? 0.22 : kind === 'carpet' ? 0.98 : kind === 'concrete' ? 0.9 : 0.4 });
    } else if (key.startsWith('ceil:')) {
      const kind = key.slice(5);
      m = kind === 'tile' ? std(TX.meters(TX.ceilingTile(), 1.2), { roughness: 0.95 }) : std(TX.meters(TX.plainWall(kind === 'mall' ? '#d8d0c0' : '#9a968c', `ceil${kind}`), 3), { roughness: 0.95 });
    } else {
      switch (key) {
        case 'mall': m = std(TX.meters(TX.stucco(), 2), { roughness: 0.9 }); break;
        case 'pilaster': m = std(TX.meters(TX.pilaster(), 0.8), { roughness: 0.25 }); break;
        case 'block': m = std(TX.meters(TX.blockWall(), 1.6), { roughness: 0.95 }); break;
        case 'brick': m = std(TX.meters(TX.brick(), 2.4), { roughness: 0.95 }); break;
        case 'tile': m = std(TX.meters(TX.tile(), 1.2), { roughness: 0.3 }); break;
        case 'office': m = std(TX.meters(TX.officeWall(), 2), { roughness: 0.9 }); break;
        case 'halv': m = std(TX.meters(TX.damask(), 1.4), { roughness: 0.9 }); break;
        case 'food': m = std(TX.meters(TX.mosaic(), 0.5), { roughness: 0.4 }); break;
        case 'counter': m = std(TX.meters(TX.laminate('#c8a878', 'stallWall'), 1.5), { roughness: 0.5 }); break;
        case 'steel': m = std(TX.meters(TX.brushed(), 1), { roughness: 0.35, metalness: 0.7 }); break;
        case 'glass': m = new THREE.MeshStandardMaterial({ color: 0x9fb4c0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.18, depthWrite: false }); break;
        case 'chain': m = new THREE.MeshStandardMaterial({ color: 0xa0a4a8, metalness: 0.6, roughness: 0.4, alphaMap: TX.meters(TX.chainlink(), 0.25), side: THREE.DoubleSide, transparent: true, depthWrite: false }); break;
        default: m = std(null, { color: 0x888888 });
      }
    }
    this.mats.set(key, m);
    return m;
  }

  // ------------------------------------------------------- walls, floors
  buildShell() {
    const F = new FaceBuilder();
    for (const w of WALLS) {
      const f = w.faces;
      F.box(w, { n: f.n, s: f.s, e: f.e, w: f.w, top: w.header ? null : f.top || null, bottom: w.header || w.y0 > 0.1 ? (f.n || f.w) : null });
    }
    // floors
    for (const r of ROOMS) {
      let key;
      const st = STORES.find((q) => q.id === r.id);
      if (st) { const [k, a, b] = STORE_FLOORS[st.type]; key = `floor:${k}:${a}:${b || ''}`; }
      else if (STALLS.some((q) => q.id === r.id)) key = 'floor:tile:';
      else if (['court', 'westHall', 'eastHall', 'southVest', 'eastVest'].includes(r.id)) key = 'floor:terrazzo:#d9cfbd';
      else if (r.id === 'food') key = 'floor:terrazzo:#cfc2a8';
      else if (r.id === 'halv' || r.id === 'halvNorth') key = 'floor:carpet:#5a1e28';
      else if (['stock', 'dock'].includes(r.id)) key = 'floor:concrete:#8a867e';
      else if (r.id === 'freezer') key = 'floor:vct:#b8c0c8:#a8b0b8';
      else if (['women', 'men'].includes(r.id)) key = 'floor:tile:';
      else key = 'floor:vct:#b8b4a8:#a8a498';
      F.floor(key, r.x0, r.x1, r.z0, r.z1);
      // ceilings
      const ck = r.store || ['corridor', 'fcHall', 'security', 'office', 'break', 'electrical', 'janitor', 'women', 'men', 'restHall', 'stock'].includes(r.id) ? 'ceil:tile' : ['dock', 'freezer'].includes(r.id) ? 'ceil:dark' : 'ceil:mall';
      if (r.id !== 'court') F.ceiling(ck, r.x0, r.x1, r.z0, r.z1, r.ceil);
    }
    // the court's ceiling, round a skylight
    F.ceiling('ceil:mall', -10, 10, -10, -4, 11);
    F.ceiling('ceil:mall', -10, 10, 4, 10, 11);
    F.ceiling('ceil:mall', -10, -4, -4, 4, 11);
    F.ceiling('ceil:mall', 4, 10, -4, 4, 11);
    // the closed upper level: a balcony round the court, and dark shopfronts above
    for (const [x0, x1, z0, z1] of [[-10, 10, -10, -7.6], [-10, 10, 7.6, 10], [-10, -7.6, -7.6, 7.6], [7.6, 10, -7.6, 7.6]]) {
      F.box({ x0, x1, y0: 5.1, y1: 5.5, z0, z1 }, { n: 'pilaster', s: 'pilaster', e: 'pilaster', w: 'pilaster', top: 'floor:terrazzo:#d9cfbd', bottom: 'ceil:mall' });
    }
    // the parking lot
    F.floor('floor:concrete:#2a2a2c', -72, 76, 17.5, 70, -0.02);
    F.floor('floor:concrete:#2a2a2c', 66, 110, -40, 17.5, -0.02);
    F.floor('floor:concrete:#2a2a2c', -110, -64.5, -40, 17.5, -0.02);
    for (const m of F.meshes((k) => this.matFor(k))) this.statics.add(m);

    // skylights: the night sky through glass, between mullions
    const sky = new THREE.MeshBasicMaterial({ map: TX.meters(TX.nightSky(), 6), color: 0x6a7a9a });
    this.skyMat = sky;
    const mull = mat(0x3a3c40, { metal: 0.5, rough: 0.5 });
    const skylight = (x0, x1, z0, z1, y) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), sky);
      p.rotation.x = Math.PI / 2;
      p.position.set((x0 + x1) / 2, y + 0.4, (z0 + z1) / 2);
      this.statics.add(p);
      for (let x = x0; x <= x1 + 1e-3; x += 1.5) M.box(this.statics, mull, x, y + 0.2, (z0 + z1) / 2, 0.08, 0.4, z1 - z0);
      for (const z of [z0, z1]) M.box(this.statics, mull, (x0 + x1) / 2, y + 0.2, z, x1 - x0, 0.4, 0.12);
      // the shaft up to the glass
      const F2 = new FaceBuilder();
      for (const [a, b, c, d, n] of [
        [[x0, y, z0], [x1, y, z0], [x1, y + 0.4, z0], [x0, y + 0.4, z0], [0, 0, 1]],
        [[x1, y, z1], [x0, y, z1], [x0, y + 0.4, z1], [x1, y + 0.4, z1], [0, 0, -1]],
      ]) F2.quad('mall', a, b, c, d, n);
      for (const m of F2.meshes((k) => this.matFor(k))) this.statics.add(m);
    };
    for (const x of [-32, -24, -16, 16, 24, 32]) skylight(x - 2.5, x + 2.5, -1.4, 1.4, 7);
    for (const [x, z] of [[48, -4], [56, 4]]) skylight(x - 2.5, x + 2.5, z - 2, z + 2, 8.5);
    // the court's dome: a ring of glass over the fountain
    const dome = new THREE.Mesh(new THREE.SphereGeometry(5.7, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ map: TX.tiled(TX.nightSky(), 3, 1), color: 0x6a7a9a, side: THREE.BackSide }));
    dome.scale.y = 0.45;
    dome.position.set(0, 11, 0);
    this.statics.add(dome);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const rib = new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.06, 6, 24, Math.PI / 2), mull);
      rib.scale.y = 0.45;
      rib.position.set(0, 11, 0);
      rib.rotation.set(0, a, Math.PI / 2);
      rib.rotateX(Math.PI / 2);
      this.statics.add(rib);
    }
    // the court floor's inlay round the fountain
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.2, 4.7, 64), mat(0xffffff, { map: TX.terrazzo('#7a5a48', 'inlay'), rough: 0.25 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.004;
    ring.receiveShadow = true;
    this.statics.add(ring);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const ray = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 2.6), mat(0xffffff, { map: TX.terrazzo('#7a5a48', 'inlay'), rough: 0.25 }));
      ray.rotation.set(-Math.PI / 2, 0, a);
      ray.position.set(Math.sin(a) * 6.2, 0.004, Math.cos(a) * 6.2);
      this.statics.add(ray);
    }
    // display platforms in Halvorsen's
    for (const p of PLATFORMS) M.block(this.statics, mat(0x2a2422, { rough: 0.5 }), (p.x0 + p.x1) / 2, 0.12, (p.z0 + p.z1) / 2, p.x1 - p.x0, 0.24, p.z1 - p.z0, 0.02);
  }

  // ---------------------------------------------------------- furniture
  buildProps() {
    this.live = {};
    for (const p of PROPS) {
      const g = M.prop(p);
      this.statics.add(g);
      if (p.type === 'carousel') this.live.carousel = g;
      if (p.type === 'fountain') this.live.fountain = g;
      if (p.type === 'tvWall') this.live.tvs = g;
      if (p.type === 'monitorBank') this.live.monitors = g;
      if (p.type === 'alarmPanel') this.live.alarm = g;
      if (p.type === 'breakerPanel') this.live.breakers = g;
      if (p.type === 'lockers' && p.daleAt != null) this.live.lockers = g;
    }
  }

  // ---------------------------------------- signs over the shops, Halvorsen's
  buildFronts() {
    const G = this.statics;
    for (const s of STORES) {
      const out = s.side === 'n' ? 1 : -1;
      const tex = TX.sign(s.sign.text, { w: 1024, h: 180, bg: s.sign.bg, fg: s.sign.fg, font: s.sign.font, glow: !!s.sign.neon });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 0.9), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color().setScalar(s.sign.neon ? 2.2 : 1.25) }));
      m.position.set(s.cx, 4.3, s.front + out * 0.22);
      m.rotation.y = s.side === 'n' ? 0 : Math.PI;
      m.userData.keep = true;
      this.scene.add(m);
      // a "sale" banner in a few of them, posters in the video shop
      if (s.type === 'video' || s.type === 'records') {
        for (let i = 0; i < 3; i++) {
          const p = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.9), mat(0xffffff, { map: TX.poster(i + (s.type === 'records' ? 3 : 0)), rough: 0.6 }));
          p.position.set(s.x0 + 1.4 + i * 2.3, 2.6, (s.side === 'n' ? s.z0 + 0.32 : s.z1 - 0.32));
          p.rotation.y = s.side === 'n' ? 0 : Math.PI;
          G.add(p);
        }
      }
      if (s.type === 'closing') {
        const b = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.6), new THREE.MeshBasicMaterial({ map: TX.sign('STORE CLOSING · 70% OFF', { w: 1024, h: 150, bg: '#fff23a', fg: '#d81e1e', font: 'bold 80px Arial Black, sans-serif' }) }));
        b.position.set(s.cx, 2.4, s.front + s.inward * 1.5);
        b.rotation.y = s.side === 'n' ? 0 : Math.PI;
        G.add(b);
      }
      if (s.type === 'vacant') {
        const b = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshBasicMaterial({ map: TX.sign('FOR LEASE\n555-0142', { w: 512, h: 256, bg: '#f2f0e8', fg: '#1a3a6a', font: 'bold 70px Arial, sans-serif' }) }));
        b.position.set(s.cx, 1.8, s.front + s.inward * 4);
        b.rotation.y = s.side === 'n' ? 0 : Math.PI;
        G.add(b);
      }
    }
    for (const s of STALLS) {
      const out = s.side === 'n' ? 1 : -1;
      const tex = TX.sign(s.sign.text, { w: 1024, h: 200, bg: s.sign.bg, fg: s.sign.fg, font: 'bold 96px Arial Black, Impact, sans-serif' });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.75), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color().setScalar(1.35) }));
      m.position.set(s.cx, 3.2, s.front + out * 0.17);
      m.rotation.y = s.side === 'n' ? 0 : Math.PI;
      this.scene.add(m);
    }
    // Halvorsen's name over its gate, unlit since April
    const hs = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.6), mat(0xffffff, { map: TX.sign("Halvorsen's", { w: 1024, h: 180, bg: '#1e1612', fg: '#a88a58', font: 'italic 120px Georgia, serif' }), rough: 0.6 }));
    hs.position.set(-39.78, 5.0, 0);
    hs.rotation.y = Math.PI / 2;
    G.add(hs);
    const closed = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshBasicMaterial({ map: TX.sign('CLOSED', { w: 256, h: 80, bg: '#f2f0e8', fg: '#a01010', font: 'bold 60px Arial, sans-serif' }) }));
    closed.position.set(-39.7, 2.2, -4.8);
    closed.rotation.y = Math.PI / 2;
    G.add(closed);
    // departments hanging in Halvorsen's
    for (const [x, z, text] of [[-48, -6, 'COSMETICS'], [-55, 6, "WOMEN'S"], [-58, -8, "MEN'S"], [-60, 12, 'FITTING ROOMS'], [-57, -18, 'HOME']]) {
      const sgn = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), mat(0xffffff, { map: TX.sign(text, { w: 512, h: 128, bg: '#2a1e1a', fg: '#c8b080', font: 'bold 60px Georgia, serif' }), rough: 0.7, side: THREE.DoubleSide }));
      sgn.position.set(x, 3.4, z);
      sgn.rotation.y = Math.PI / 2;
      G.add(sgn);
      for (const d of [-0.8, 0.8]) M.beam(G, mat(0x1a1a1a), [x, 3.62, z + d], [x, 5.5, z + d], 0.01, 0.01, true);
    }
    // the upper level, behind the balcony: dark shop windows, nobody home
    const up = mat(0x0c0e12, { rough: 0.1, metal: 0.3 });
    for (const [x, z, ry] of [[0, -9.8, 0], [0, 9.8, Math.PI], [-9.8, 0, Math.PI / 2], [9.8, 0, -Math.PI / 2]]) {
      for (const off of [-5, 5]) {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.6), up);
        const dx = Math.abs(ry) === Math.PI / 2 ? 0 : off, dz = Math.abs(ry) === Math.PI / 2 ? off : 0;
        w.position.set(x + dx, 7.0, z + dz);
        w.rotation.y = ry;
        G.add(w);
      }
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.5), new THREE.MeshBasicMaterial({ map: TX.sign('UPPER LEVEL CLOSED', { w: 512, h: 64, bg: '#1a1a1a', fg: '#c8c0b0', font: 'bold 38px Arial, sans-serif' }) }));
      sg.position.set(x, 8.7, z);
      sg.rotation.y = ry;
      G.add(sg);
    }
    // the balcony's glass railing
    const rail = M.glass();
    for (const [x0, x1, z0, z1] of [[-7.6, 7.6, -7.6, -7.6], [-7.6, 7.6, 7.6, 7.6], [-7.6, -7.6, -7.6, 7.6], [7.6, 7.6, -7.6, 7.6]]) {
      const len = Math.max(x1 - x0, z1 - z0);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.0), rail);
      p.position.set((x0 + x1) / 2, 6.0, (z0 + z1) / 2);
      p.rotation.y = x0 === x1 ? Math.PI / 2 : 0;
      this.scene.add(p);
      M.beam(G, mat(0xb8a878, { metal: 0.8, rough: 0.3 }), [x0, 6.5, z0], [x1, 6.5, z1], 0.06, 0.06, true);
    }
  }

  // ------------------------------------------- the back: stations, signs
  buildBack() {
    const G = this.statics;
    this.stations = [];
    for (const s of STATIONS) {
      const m = M.station(s.n);
      m.position.set(s.x, s.y, s.z);
      m.rotation.y = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[s.face];
      m.userData.keep = true;
      this.scene.add(m);
      this.stations.push(m);
    }
    for (const [x, y, z, ry] of [[0, 3.2, 10.15, 0], [61.8, 3.25, 0, -Math.PI / 2], [-63.95, 3.0, 0, Math.PI / 2], [37, 4.3, -30.95, 0], [-39.85, 2.6, -19, -Math.PI / 2], [55.85, 2.6, -19, -Math.PI / 2], [0, 2.8, -10.2, Math.PI], [41, 2.8, -13.15, 0]]) {
      const e = M.exitSign();
      e.position.set(x, y, z);
      e.rotation.y = ry;
      this.scene.add(e);
    }
    // the cameras themselves, up on the walls
    for (const c of CAMERAS.slice(0, 7)) {
      const g = new THREE.Group();
      M.block(g, mat(0xd8d8d0, { rough: 0.4 }), 0, 0, -0.1, 0.12, 0.12, 0.26, 0.02);
      M.cyl(g, mat(0x111111), 0, 0, 0.04, 0.04, 0.04).rotation.x = Math.PI / 2;
      g.position.set(...c.pos);
      g.lookAt(...c.look);
      G.add(g);
    }
    // a clipboard in the stockroom: the inventory
    const inv = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.34), mat(0xffffff, { map: TX.sign('INVENTORY\nDisplay\nmannequins:\n13', { w: 128, h: 176, bg: '#f2ead8', fg: '#2a2a6a', font: '18px Courier New, monospace' }), rough: 0.7 }));
    inv.position.set(SPOTS.inventory.x, SPOTS.inventory.y, SPOTS.inventory.z + 0.07);
    inv.rotation.y = Math.PI;
    G.add(inv);
    // the photo envelope on Photo Finish's counter
    const env = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.16), mat(0xf2c200, { rough: 0.7 }));
    env.position.set(SPOTS.photos.x, 1.09, SPOTS.photos.z);
    env.rotation.y = 0.3;
    this.envelope = env;
    this.scene.add(env);
    // the carousel's control box
    M.block(G, mat(0x6a1a2a, { rough: 0.5 }), SPOTS.carousel.x, 0.55, SPOTS.carousel.z + 0.15, 0.5, 1.1, 0.3, 0.03);
    M.block(G, mat(0xd8b050, { metal: 0.8, rough: 0.3 }), SPOTS.carousel.x, 1.0, SPOTS.carousel.z - 0.01, 0.2, 0.08, 0.05, 0.01);
  }

  // ----------------------------------------------------------- outside
  buildOutside() {
    const G = this.statics;
    this.car = M.car();
    this.car.position.set(5.6, 0, 25.5);
    this.car.rotation.y = 0.15;
    G.add(this.car);
    for (const f of FIXTURES.filter((q) => q.breaker === 'lot')) {
      const l = M.lotLamp();
      l.position.set(f.x, 0, f.z - 1.0);
      G.add(l);
    }
    // stripes in the lot
    const stripe = mat(0xc8c0a0, { rough: 0.8 });
    for (let x = -30; x <= 30; x += 3) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 4.8), stripe);
      p.rotation.x = -Math.PI / 2;
      p.position.set(x, 0.0, 26);
      G.add(p);
    }
    // the mall's name over the south doors
    const ms = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.6), new THREE.MeshBasicMaterial({ map: TX.mallSign(), color: new THREE.Color().setScalar(1.8) }));
    ms.position.set(0, 5.6, 17.62);
    this.scene.add(ms);
    M.box(G, mat(0x2a2420, { rough: 0.8 }), 0, 4.4, 16.0, 10, 1.4, 2.6);
    // far off: the dark, and a line of trees against a slightly less dark sky
    const backdrop = new THREE.Mesh(new THREE.CylinderGeometry(160, 160, 60, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0x080b12, side: THREE.BackSide, fog: false }));
    backdrop.position.y = 20;
    this.scene.add(backdrop);
  }

  // the light fittings: lit when their breaker is on. The housings join
  // the static mall; the glowing parts are merged into one mesh per breaker.
  buildFixtures() {
    this.fixtureMats = new Map();
    const glowing = new Map();
    const lit = (breaker) => {
      if (!this.fixtureMats.has(breaker)) { this.fixtureMats.set(breaker, new THREE.MeshBasicMaterial({ color: 0xffffff })); glowing.set(breaker, []); }
      return this.fixtureMats.get(breaker);
    };
    const housing = mat(0xd8d8d0, { rough: 0.5, metal: 0.3 });
    const holder = new THREE.Group();
    for (const f of FIXTURES) {
      if (['moon', 'lot', 'desk', 'carousel'].includes(f.breaker)) continue;
      const g = new THREE.Group();
      g.position.set(f.x, f.y, f.z);
      if (f.breaker === 'court') {
        // pendant globes on rods
        M.beam(g, mat(0x1a1a1a), [0, 0, 0], [0, 2.0, 0], 0.012, 0.012, true);
        g.add(new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), lit(f.breaker)));
      } else if (f.breaker === 'concourse' || f.breaker === 'food') {
        M.cyl(g, housing, 0, 0.05, 0, 0.42, 0.1);
        const disc = new THREE.Mesh(new THREE.CircleGeometry(0.36, 20), lit(f.breaker));
        disc.rotation.x = Math.PI / 2;
        disc.position.y = -0.005;
        g.add(disc);
      } else if (f.breaker === 'emergency') {
        M.block(g, mat(0xe8e8e0), 0, -0.1, 0, 0.36, 0.14, 0.16, 0.02);
        for (const sx of [-1, 1]) { const bb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), lit(f.breaker)); bb.position.set(sx * 0.15, -0.2, 0.06); g.add(bb); }
      } else {
        // a fluorescent troffer
        M.box(g, housing, 0, 0.03, 0, 1.25, 0.06, 0.62);
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.52), lit(f.breaker));
        panel.rotation.x = Math.PI / 2;
        panel.position.y = -0.005;
        g.add(panel);
      }
      holder.add(g);
    }
    holder.updateMatrixWorld(true);
    for (const o of [...holder.children.flatMap((g) => g.children)]) {
      if (o.material && o.material.isMeshBasicMaterial) {
        const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
        for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
        const list = [...glowing.entries()].find(([k]) => this.fixtureMats.get(k) === o.material)[1];
        list.push(geo.index ? geo.toNonIndexed() : geo);
      } else this.statics.attach(o);
    }
    for (const [b, list] of glowing) {
      const m = new THREE.Mesh(mergeGeometries(list), this.fixtureMats.get(b));
      this.scene.add(m);
    }
  }

  // --------------------------------------------------- doors and gates
  buildDoors() {
    for (const d of DOORS) {
      let v;
      if (d.kind === 'gate') v = M.gateModel(d);
      else if (d.kind === 'glass') v = M.glassDoors(d);
      else if (d.kind === 'rollup') v = M.rollupDoor(d);
      else v = M.steelDoor(d, { cage: d.kind === 'cage' });
      v.group.position.set(d.x, 0, d.z);
      v.group.rotation.y = d.axis === 'z' ? Math.PI / 2 : 0;
      v.group.updateMatrixWorld(true);
      // the frames and housings never move: they join the static mall
      for (const o of [...v.group.children]) if (o.userData.fixed) this.statics.attach(o);
      this.scene.add(v.group);
      this.doorViews.push(v);
    }
  }

  // ------------------------------------------------------------- lights
  buildLights() {
    const s = this.scene;
    // a little light from everywhere, so the dark isn't black (an even
    // wash costs nothing per pixel, where a reflected room did)
    this.hemi = new THREE.HemisphereLight(0x8a9ab8, 0x2a241c, 0.14);
    this.ambient = new THREE.AmbientLight(0xb4bccc, 0.3);
    s.add(this.hemi, this.ambient);
    // a flashlight for each guard on the night (every light in the scene
    // costs every pixel, so there are only as many as there are guards);
    // yours casts shadows
    this.flashlights = [];
    for (let i = 0; i < 4; i++) {
      const f = new THREE.SpotLight(0xfff2e0, 0, 28, 0.44, 0.45, 1.4);
      if (i === 0) {
        f.castShadow = true;
        f.shadow.mapSize.set(1024, 1024);
        f.shadow.bias = -0.0004;
        f.shadow.normalBias = 0.02;
        f.shadow.camera.near = 0.2;
        f.shadow.camera.far = 22;
      }
      this.flashlights.push(f);
    }
    this.useFlashlights(1);
    // its flashlight
    this.hisLight = new THREE.SpotLight(0xfff0d8, 0, 30, 0.36, 0.5, 1.3);
    s.add(this.hisLight, this.hisLight.target);
  }

  // n flashlights in the scene (changing it rebuilds every shader, so it's
  // done once, as a night starts); true if it changed
  useFlashlights(n) {
    n = Math.max(1, Math.min(4, n));
    if (n === this.flashCount) return false;
    this.flashCount = n;
    this.flashlights.forEach((f, i) => {
      if (i < n) this.scene.add(f, f.target);
      else { f.intensity = 0; this.scene.remove(f, f.target); }
    });
    return true;
  }

  // the flashlight's shadow map: 1024 square, or 512 when the computer's
  // struggling
  shadowSize(n) {
    const sh = this.flashlights[0].shadow;
    if (sh.mapSize.x === n) return;
    sh.mapSize.set(n, n);
    if (sh.map) { sh.map.dispose(); sh.map = null; }
  }

  applyLights(extra = {}) {
    setLights(this.state, extra);
    const B = this.state.breakers;
    for (const [b, m] of this.fixtureMats) {
      const on = b === 'emergency' || b === 'stockroom' ? true : !!B[b];
      let k = on ? 1 : 0;
      if (extra.dimmed && extra.dimmed.has(b)) k *= extra.dimmed.get(b);
      m.color.setScalar(on ? (b === 'emergency' ? 1.4 : 2.2) * Math.max(0.15, k) : 0.07);
    }
  }

  // ------------------------------------------------------------- state
  // doors: the snapshot's packed door states; breakers: [0/1] in BREAKERS
  // order; flags: the snapshot's flag bits
  setDoors(packed) {
    packed.forEach((v, k) => {
      const open = (v % 1000) / 100, locked = Math.floor(v / 1000) % 2 === 1;
      this.doorViews[k].set(open, locked);
    });
  }

  setBreakers(map, carousel = false, extra = {}) {
    const B = this.state.breakers;
    let changed = carousel !== this.state.carousel;
    for (const k of Object.keys(map)) if (B[k] !== map[k]) { B[k] = map[k]; changed = true; }
    this.state.carousel = carousel;
    if (changed || extra.force) this.applyLights(extra);
  }

  setFlags(f) { this.flags = f; }

  // flashes: [{ on, pos, dir }] for up to four flashlights (yours first);
  // his: its flashlight { on, pos, dir }
  update(dt, t, { flashes = [], his = null, camera = null } = {}) {
    this.t = t;
    for (let i = 0; i < this.flashCount; i++) {
      const f = this.flashlights[i], F = flashes[i];
      if (F && F.on) {
        f.intensity = 22;
        f.position.copy(F.pos);
        f.target.position.copy(F.pos).add(F.dir);
      } else f.intensity = 0;
    }
    const H = this.hisLight;
    if (his && his.on) {
      H.intensity = 18;
      H.position.copy(his.pos);
      H.target.position.copy(his.pos).add(his.dir);
    } else H.intensity = 0;
    // the carousel turns, its bulbs chase
    const car = this.live.carousel;
    if (car) {
      const on = (this.flags & 2) !== 0;
      car.userData.speed = (car.userData.speed || 0) + ((on ? 0.45 : 0) - (car.userData.speed || 0)) * Math.min(1, dt * 0.6);
      car.userData.spin.rotation.y += car.userData.speed * dt;
      car.userData.bulbs.forEach((b, k) => { b.visible = !on || Math.floor(t * 6 + k) % 3 !== 0; });
      for (const [i, c] of car.userData.spin.children.entries()) {
        if (c.isGroup) c.position.y = 1.0 + ((i % 2) * 0.25) + (on ? Math.sin(t * 2 + i) * 0.2 : 0);
      }
      car.userData.bulbMat.color.setScalar(on ? 2.4 : 0.15);
    }
    // the TVs at Radio Hut
    const tv = this.live.tvs;
    if (tv) {
      const on = (this.flags & 4) !== 0;
      if (!this.snowTex) this.snowTex = TX.snow(3);
      if (on) {
        this.snowT = (this.snowT || 0) + dt;
        if (this.snowT > 0.07) { this.snowT = 0; this.snowTex.userData.update(); }
      }
      for (const s of tv.userData.screens) {
        if (on && s.material.map !== this.snowTex) { s.material.map = this.snowTex; s.material.color.setScalar(1.6); s.material.needsUpdate = true; }
        if (!on && s.material.map) { s.material.map = null; s.material.color.set(0x0a0c0e); s.material.needsUpdate = true; }
      }
    }
    // the fountain's water shivers
    const fw = this.live.fountain?.userData.water;
    if (fw) fw.position.y = 0.45 + Math.sin(t * 1.3) * 0.004;
    if (this.envelope) this.envelope.rotation.y = 0.3;
    void camera;
  }

  render(renderer, camera, target) {
    this.cullFrom(camera.position);
    renderer.setRenderTarget(target);
    renderer.render(this.scene, camera);
  }
}
