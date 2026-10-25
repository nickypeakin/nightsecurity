// The rooms you can walk into, as the client draws them: the walls, floor
// and ceiling of each (from shared/interiors.js), its lights, its door, and
// the furniture, every piece built from a few boxes and cylinders and
// merged by material, so a whole room is a dozen draws. Only the room
// you're in is drawn. Out in the city, each of these buildings gets a door
// on its front.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { INTERIORS, ROOM_H, FLOOR_Y } from '../shared/interiors.js';
import * as TX from './textures.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 14);
const SPH = new THREE.SphereGeometry(1, 14, 10);
const CONE = new THREE.ConeGeometry(1, 1, 14, 1, true);

const mats = new Map();
function m(color, o = {}) {
  const key = JSON.stringify([color, o]);
  if (!mats.has(key)) {
    mats.set(key, new THREE.MeshStandardMaterial({
      color, roughness: o.r ?? 0.75, metalness: o.m ?? 0, emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 1,
      map: o.map ? (o.map === 'gunWall' ? TX.gunWall() : TX.meters(TX.floorTex(o.map), 2)) : null,
      transparent: o.opacity != null, opacity: o.opacity ?? 1, depthWrite: o.opacity == null, side: o.side ?? THREE.FrontSide,
    }));
  }
  return mats.get(key);
}
const WOOD = 0x6a4a30, DARK = 0x1a1a1c, CHROME = 0xc8ccd0;

// a part: geometry, material, position, scale (in the item's own frame,
// facing +z, its floor at y = 0)
const P = (geo, mat, x, y, z, sx, sy, sz, ry = 0) => ({ geo, mat, x, y, z, sx, sy, sz, ry });
const B = (mat, x, y, z, sx, sy, sz, ry = 0) => P(BOX, mat, x, y, z, sx, sy, sz, ry);
const C = (mat, x, y, z, r, h) => P(CYL, mat, x, y, z, r, h, r);

// the pieces of a piece of furniture: W across, D deep, H tall
function build(it, W, D, H) {
  const col = it.col ?? 0x8a8a88;
  const c = m(col, { r: 0.7 });
  const out = [];
  const legs = (h, inset = 0.06, t = 0.05, mat = m(DARK, { r: 0.5, m: 0.4 })) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(B(mat, sx * (W / 2 - inset), h / 2, sz * (D / 2 - inset), t, h, t));
  };
  switch (it.t) {
    case 'rug': out.push(B(m(col, { r: 0.95 }), 0, 0.006, 0, W, 0.012, D), B(m(0xd8c8a0, { r: 0.95 }), 0, 0.008, 0, W * 0.8, 0.012, D * 0.75)); break;
    case 'sofa':
      out.push(B(c, 0, 0.22, 0.05, W, 0.44, D - 0.1), B(c, 0, 0.62, -D / 2 + 0.12, W, 0.5, 0.24));
      for (const sx of [-1, 1]) out.push(B(c, sx * (W / 2 - 0.1), 0.52, 0.02, 0.2, 0.3, D - 0.05));
      out.push(B(m(new THREE.Color(col).multiplyScalar(1.25).getHex(), { r: 0.8 }), 0, 0.47, 0.1, W - 0.45, 0.08, D - 0.35));
      break;
    case 'chair':
      out.push(B(c, 0, 0.46, 0, W, 0.06, D), B(c, 0, 0.72, -D / 2 + 0.03, W, 0.46, 0.05));
      legs(0.44, 0.04, 0.04, c);
      break;
    case 'table':
      out.push(B(c, 0, H - 0.025, 0, W, 0.05, D));
      legs(H - 0.05, 0.08, 0.06, c);
      break;
    case 'desk':
      out.push(B(c, 0, H - 0.025, 0, W, 0.05, D), B(c, 0, (H - 0.05) / 2, -D / 2 + 0.03, W, H - 0.05, 0.04));
      for (const sx of [-1, 1]) out.push(B(c, sx * (W / 2 - 0.03), (H - 0.05) / 2, 0, 0.05, H - 0.05, D));
      // a monitor, papers, a lamp
      out.push(B(m(0xd8d4c8, { r: 0.6 }), -W * 0.25, H + 0.2, -D * 0.15, 0.42, 0.36, 0.38), B(m(0x1a2a3a, { e: 0x3a7aaa, ei: 0.6 }), -W * 0.25, H + 0.21, -D * 0.15 + 0.195, 0.34, 0.27, 0.01));
      out.push(B(m(0xf0ece0, { r: 0.9 }), W * 0.2, H + 0.005, 0.05, 0.3, 0.01, 0.22), C(m(DARK, { m: 0.5 }), W * 0.38, H + 0.18, -D * 0.25, 0.02, 0.36));
      out.push(P(CONE, m(0x2a4a2a, { r: 0.6, side: THREE.DoubleSide }), W * 0.38, H + 0.36, -D * 0.25, 0.13, 0.14, 0.13));
      break;
    case 'counter':
      if (it.glass) {
        out.push(B(c, 0, 0.25, 0, W, 0.5, D), B(m(0x9ac0d0, { r: 0.05, m: 0.2, opacity: 0.3 }), 0, (H + 0.45) / 2, 0, W - 0.04, H - 0.55, D - 0.04));
        for (let k = 0; k < Math.floor(W / 0.7); k++) out.push(B(m(DARK, { r: 0.4, m: 0.6 }), -W / 2 + 0.4 + k * 0.7, 0.56, 0, 0.3, 0.05, 0.12, 0.3));
      } else out.push(B(c, 0, (H - 0.05) / 2, 0, W, H - 0.05, D));
      out.push(B(m(new THREE.Color(col).multiplyScalar(0.6).getHex(), { r: 0.4 }), 0, H - 0.025, 0, W + 0.06, 0.05, D + 0.06));
      break;
    case 'kitchen':
      out.push(B(m(0xb8bcc0, { r: 0.35, m: 0.6 }), 0, H / 2, 0, W, H, D), B(m(DARK, { r: 0.3, m: 0.5 }), -W * 0.2, H + 0.02, 0, W * 0.3, 0.04, D * 0.8));
      out.push(B(m(0xb8bcc0, { r: 0.35, m: 0.6 }), -W * 0.2, 2.45, 0, W * 0.32, 0.5, D), B(m(0xe8e8e8, { r: 0.4 }), W * 0.25, H + 0.4, 0, 0.5, 0.8, 0.5));
      break;
    case 'fridge': out.push(B(m(0xe4e4e0, { r: 0.4 }), 0, H / 2, 0, W, H, D), B(m(CHROME, { r: 0.2, m: 0.8 }), W * 0.35, H * 0.62, D / 2 + 0.02, 0.03, 0.5, 0.03), B(m(0xb8b8b4, { r: 0.4 }), 0, H * 0.66, D / 2 + 0.005, W - 0.04, 0.012, 0.01)); break;
    case 'tv':
      out.push(B(m(WOOD, { r: 0.7 }), 0, 0.25, 0, W, 0.5, D), B(m(DARK, { r: 0.4 }), 0, 0.78, 0, W * 0.55, 0.56, 0.48));
      out.push(B(m(0x1a2a40, { e: 0x5a8ac0, ei: 0.9 }), 0, 0.79, 0.245, W * 0.45, 0.42, 0.01));
      break;
    case 'plant': out.push(C(m(0xa85a3a, { r: 0.8 }), 0, 0.2, 0, W * 0.35, 0.4), P(SPH, m(0x2a5a28, { r: 0.9 }), 0, 0.85, 0, W * 0.6, H * 0.45, D * 0.6), P(SPH, m(0x3a6a30, { r: 0.9 }), 0.1, 1.15, 0.05, W * 0.4, H * 0.3, D * 0.4)); break;
    case 'shelf':
      out.push(B(c, 0, H / 2, -D / 2 + 0.02, W, H, 0.04));
      for (const sx of [-1, 1]) out.push(B(c, sx * (W / 2 - 0.02), H / 2, 0, 0.04, H, D));
      for (let k = 0; k < 4; k++) {
        const y = 0.1 + k * (H - 0.2) / 3;
        out.push(B(c, 0, y, 0, W, 0.03, D));
        if (k < 3) {
          // things on the shelves
          const n = Math.floor(W / 0.35);
          for (let q = 0; q < n; q++) {
            const h = 0.12 + ((q * 7 + k * 3) % 5) * 0.05, w = 0.18 + ((q + k) % 3) * 0.06;
            const tone = [0x8a2a2a, 0x2a4a8a, 0xd8c8a0, 0x3a6a3a, 0x6a6a6a, 0xc8a040][(q + k * 2) % 6];
            out.push(B(m(tone, { r: 0.6 }), -W / 2 + 0.2 + q * (W - 0.3) / n, y + 0.015 + h / 2, 0, w, h, D * 0.6));
          }
        }
      }
      break;
    case 'window':
      out.push(B(m(0xe8e4dc, { r: 0.6 }), 0, 0, 0, W + 0.12, H + 0.12, 0.04), B(m(0x9ac8f0, { e: 0x9ac8f0, ei: 1.4 }), 0, 0, 0.022, W, H, 0.01));
      out.push(B(m(0xe8e4dc, { r: 0.6 }), 0, 0, 0.03, 0.05, H, 0.02), B(m(0xe8e4dc, { r: 0.6 }), 0, 0, 0.03, W, 0.05, 0.02));
      for (const p of out) p.y += H / 2;
      break;
    case 'bed':
      out.push(B(m(WOOD, { r: 0.7 }), 0, 0.17, 0, W, 0.34, D), B(m(0xf0eee8, { r: 0.9 }), 0, 0.43, 0.02, W - 0.1, 0.2, D - 0.1));
      out.push(B(c, 0, 0.56, D * 0.15, W - 0.04, 0.08, D * 0.68), B(m(0xf4f2ec, { r: 0.9 }), 0, 0.6, -D / 2 + 0.32, W * 0.7, 0.13, 0.38));
      out.push(B(m(WOOD, { r: 0.7 }), 0, 0.55, -D / 2 + 0.04, W + 0.04, 1.1, 0.08));
      break;
    case 'nightstand': out.push(B(m(WOOD, { r: 0.7 }), 0, H / 2, 0, W, H, D), C(m(0xc8b890, { r: 0.6 }), 0, H + 0.15, 0, 0.05, 0.3), P(CONE, m(0xf0e0b0, { e: 0xffd890, ei: 0.8, side: THREE.DoubleSide }), 0, H + 0.38, 0, 0.16, 0.2, 0.16)); break;
    case 'wardrobe': out.push(B(c, 0, H / 2, 0, W, H, D), B(m(DARK), 0, H / 2, D / 2 + 0.005, 0.015, H - 0.1, 0.01), B(m(CHROME, { m: 0.8, r: 0.3 }), -0.08, H * 0.5, D / 2 + 0.02, 0.03, 0.2, 0.03), B(m(CHROME, { m: 0.8, r: 0.3 }), 0.08, H * 0.5, D / 2 + 0.02, 0.03, 0.2, 0.03)); break;
    case 'cabinet': out.push(B(m(0x6a6e72, { r: 0.5, m: 0.5 }), 0, H / 2, 0, W, H, D)); for (let k = 0; k < 3; k++) out.push(B(m(0x3a3e42, { r: 0.5, m: 0.5 }), 0, 0.25 + k * (H - 0.2) / 3, D / 2 + 0.006, W - 0.1, 0.02, 0.01)); break;
    case 'poster': out.push(B(c, 0, H / 2, 0, W, H, 0.01), B(m(0xf0e8d0, { r: 0.8 }), 0, H * 0.58, 0.006, W * 0.8, H * 0.5, 0.005), B(m(DARK), 0, H * 0.18, 0.006, W * 0.7, H * 0.08, 0.005)); break;
    case 'map': out.push(B(m(0xd8c8a0, { r: 0.9 }), 0, H / 2, 0, W, H, 0.01), B(m(0x4a7aa0, { r: 0.9 }), W * 0.15, H * 0.3, 0.006, W * 0.5, H * 0.3, 0.005), B(m(0x7a9a5a, { r: 0.9 }), -W * 0.15, H * 0.65, 0.006, W * 0.5, H * 0.45, 0.005)); break;
    case 'flag': for (let k = 0; k < 5; k++) out.push(B(m(k % 2 ? 0xe8e8e8 : 0xb82a2a, { r: 0.9 }), 0, H * (0.1 + k * 0.2), 0, W, H * 0.2, 0.01)); out.push(B(m(0x1a3a7a, { r: 0.9 }), -W * 0.3, H * 0.75, 0.006, W * 0.4, H * 0.5, 0.005)); break;
    case 'gunrack': out.push(B(m(0xffffff, { map: 'gunWall', r: 0.8 }), 0, H / 2, 0, W, H, D)); break;
    case 'case':
      out.push(B(m(0x3a2a1c, { r: 0.6 }), 0, 0.3, 0, W, 0.6, D), B(m(0x9ac0d0, { r: 0.05, m: 0.2, opacity: 0.3 }), 0, 0.8, 0, W - 0.04, 0.4, D - 0.04));
      for (let k = 0; k < 3; k++) out.push(B(m(DARK, { r: 0.4, m: 0.6 }), 0, 0.64, -D / 2 + 0.5 + k * (D - 1) / 2, 0.14, 0.05, 0.4, 0.4));
      break;
    case 'armor':
      out.push(C(m(DARK, { m: 0.5 }), 0, 0.02, 0, 0.22, 0.04), C(m(CHROME, { m: 0.7, r: 0.3 }), 0, 0.5, 0, 0.025, 0.95));
      out.push(B(m(0x2a3a4a, { r: 0.8 }), 0, 1.25, 0, 0.44, 0.56, 0.26), B(m(0xe8e4dc, { r: 0.6 }), 0, 1.25, 0.135, 0.18, 0.08, 0.01));
      break;
    case 'stool': out.push(C(m(CHROME, { m: 0.8, r: 0.25 }), 0, H / 2, 0, 0.04, H), C(c, 0, H, 0, W / 2, 0.08), C(m(CHROME, { m: 0.8, r: 0.25 }), 0, 0.02, 0, W / 2.2, 0.04)); break;
    case 'booth': out.push(B(c, 0, 0.23, 0.04, W, 0.46, D - 0.08), B(c, 0, 0.8, -D / 2 + 0.08, W, 0.7, 0.16), B(m(0xe8e4dc, { r: 0.7 }), 0, 1.17, -D / 2 + 0.08, W, 0.04, 0.18)); break;
    case 'jukebox': out.push(B(m(0x8a2a1a, { r: 0.4, m: 0.3 }), 0, (H - 0.3) / 2, 0, W, H - 0.3, D), P(CYL, m(0x8a2a1a, { r: 0.4, m: 0.3 }), 0, H - 0.3, 0, W / 2, D, W / 2), B(m(0xffa040, { e: 0xffa040, ei: 1.6 }), 0, H * 0.55, D / 2 + 0.01, W * 0.7, H * 0.3, 0.01)); out[1].rx = Math.PI / 2; break;
    case 'crate': out.push(B(m(0x8a6a3a, { r: 0.9 }), 0, H / 2, 0, W, H, D)); for (const sx of [-1, 1]) out.push(B(m(0x5a4224, { r: 0.9 }), sx * (W / 2 - 0.06), H / 2, D / 2 + 0.01, 0.1, H, 0.02)); break;
    case 'tvstack': for (let k = 0; k < 3; k++) out.push(B(m(DARK, { r: 0.5 }), 0, 0.28 + k * 0.52, 0, W * (0.9 - k * 0.12), 0.5, D * (0.9 - k * 0.12)), B(m(0x1a2a30, { e: k === 1 ? 0x6a9ac0 : 0x000000, ei: 0.8 }), 0, 0.28 + k * 0.52, D * (0.9 - k * 0.12) / 2 + 0.005, W * 0.6, 0.36, 0.01)); break;
    case 'guitar': out.push(P(SPH, m(0xa8602a, { r: 0.4 }), 0, 0.25, 0, 0.18, 0.24, 0.05), B(m(0x3a2414, { r: 0.6 }), 0, 0.75, 0, 0.05, 0.6, 0.03)); break;
    default: out.push(B(c, 0, H / 2, 0, W, H, D));
  }
  return out;
}

const FACE = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 };

// merge parts (each with its own transform) into one mesh per material
function merged(parts) {
  const by = new Map();
  const mat4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    mat4.compose(new THREE.Vector3(p.x, p.y, p.z), q.setFromEuler(e.set(p.rx || 0, p.ry || 0, 0)), new THREE.Vector3(p.sx, p.sy, p.sz));
    g.applyMatrix4(mat4);
    if (p.world) g.applyMatrix4(p.world);
    if (!by.has(p.mat)) by.set(p.mat, []);
    by.get(p.mat).push(g);
  }
  const out = [];
  for (const [mat, list] of by) {
    const mesh = new THREE.Mesh(mergeGeometries(list), mat);
    mesh.matrixAutoUpdate = false;
    out.push(mesh);
  }
  return out;
}

// world-space floor quads with uvs in metres (for the room's floor)
function floorQuad(mat, x0, x1, z0, z1, y) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, x0 + uv.getX(i) * (x1 - x0), -(z0 + (1 - uv.getY(i)) * (z1 - z0)));
  return { geo: g, mat, x: (x0 + x1) / 2, y, z: (z0 + z1) / 2, sx: 1, sy: 1, sz: 1 };
}

export class Interiors {
  constructor(scene) {
    this.rooms = new Map();
    this.windows = [];
    for (const R of INTERIORS) {
      const g = new THREE.Group();
      g.visible = false;
      for (const mesh of merged(this.roomParts(R))) g.add(mesh);
      scene.add(g);
      this.rooms.set(R.id, g);
    }
    // the doors on the buildings' fronts, out in the city
    const doors = [];
    for (const R of INTERIORS) {
      const d = R.door, s = Math.sin(d.h), c = Math.cos(d.h);
      const fx = d.x - s * 0.9, fz = d.z - c * 0.9;          // on the wall
      const world = new THREE.Matrix4().compose(new THREE.Vector3(fx, FLOOR_Y, fz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.h), new THREE.Vector3(1, 1, 1));
      const wood = R.kind === 'home' ? 0x7a2a22 : R.kind === 'shop' ? 0x1a1a1c : 0x3a2a1a;
      doors.push(
        { ...B(m(0xd8d4c8, { r: 0.6 }), 0, 1.15, 0.03, 1.4, 2.4, 0.06), world },
        { ...B(m(wood, { r: 0.6 }), 0, 1.07, 0.07, 1.1, 2.14, 0.04), world },
        { ...B(m(0x9ac0d8, { e: 0xffe0a0, ei: 0.5 }), 0, 1.6, 0.095, 0.6, 0.5, 0.01), world },
        { ...B(m(0xc8a040, { m: 0.8, r: 0.3 }), 0.4, 1.05, 0.1, 0.05, 0.05, 0.06), world },
        { ...B(m(0x8a8884, { r: 0.8 }), 0, 0.015, 0.5, 1.6, 0.03, 1.0), world },
      );
    }
    this.doors = new THREE.Group();
    for (const mesh of merged(doors)) this.doors.add(mesh);
    scene.add(this.doors);
  }

  roomParts(R) {
    const { x0, x1, z0, z1 } = R.box;
    const y0 = FLOOR_Y, top = ROOM_H;
    const parts = [];
    const wallM = m(R.wall, { r: 0.92 });
    const trim = m(0x4a3424, { r: 0.6 });
    parts.push(floorQuad(m(0xffffff, { map: R.floor, r: R.floor === 'checker' || R.floor === 'tile' ? 0.35 : 0.8 }), x0, x1, z0, z1, y0));
    // ceiling
    const ceil = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(Math.PI / 2);
    parts.push({ geo: ceil, mat: m(0xe8e6e0, { r: 0.95 }), x: (x0 + x1) / 2, y: top, z: (z0 + z1) / 2, sx: 1, sy: 1, sz: 1 });
    // walls, facing in, with a skirting board
    const wall = (ax, az, bx, bz) => {
      const len = Math.hypot(bx - ax, bz - az), h = top - y0;
      const ang = Math.atan2(bz - az, bx - ax);
      const g = new THREE.PlaneGeometry(len, h);
      g.rotateY(-ang);
      // facing the room's middle
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const n = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), -ang);
      if (n.x * ((x0 + x1) / 2 - mx) + n.z * ((z0 + z1) / 2 - mz) < 0) g.rotateY(Math.PI);
      parts.push({ geo: g, mat: wallM, x: mx, y: y0 + h / 2, z: mz, sx: 1, sy: 1, sz: 1 });
      const sk = new THREE.BoxGeometry(len, 0.12, 0.03);
      sk.rotateY(-ang);
      parts.push({ geo: sk, mat: trim, x: mx + n.x * 0, y: y0 + 0.06, z: mz, sx: 1, sy: 1, sz: 1 });
    };
    wall(x0, z0, x1, z0); wall(x1, z0, x1, z1); wall(x1, z1, x0, z1); wall(x0, z1, x0, z0);
    // the room's own walls (with a doorway left in them)
    for (const w of R.walls) {
      parts.push(B(wallM, (w.x0 + w.x1) / 2, (top + y0) / 2, (w.z0 + w.z1) / 2, w.x1 - w.x0, top - y0, w.z1 - w.z0));
    }
    // the door out, in the middle of the south wall
    const dx = R.doorX;
    parts.push(B(m(0xd8d4c8, { r: 0.6 }), dx, y0 + 1.15, z1 - 0.02, 1.4, 2.3, 0.04));
    parts.push(B(m(R.kind === 'home' ? 0x7a2a22 : 0x4a3424, { r: 0.6 }), dx, y0 + 1.07, z1 - 0.05, 1.1, 2.14, 0.04));
    parts.push(B(m(0xc8a040, { m: 0.8, r: 0.3 }), dx - 0.4, y0 + 1.05, z1 - 0.09, 0.05, 0.05, 0.06));
    parts.push(B(m(0x1a3a1a, { e: 0x40ff80, ei: 1.2 }), dx, y0 + 2.45, z1 - 0.03, 0.45, 0.16, 0.02));
    // a mat by the door
    parts.push(B(m(0x5a4a3a, { r: 1 }), dx, y0 + 0.006, z1 - 0.7, 1.1, 0.012, 0.7));
    // ceiling lights
    for (const l of R.lights) parts.push(B(m(0xffffff, { e: 0xfff0d8, ei: 2.2 }), l.x, top - 0.03, l.z, 1.2, 0.05, 0.5));
    // the furniture
    for (const it of R.items) {
      const rot = FACE[it.face || 's'];
      const turned = Math.abs(Math.sin(rot)) > 0.5;
      const W = turned ? it.d : it.w, D = turned ? it.w : it.d;
      const world = new THREE.Matrix4().compose(new THREE.Vector3(it.x, y0 + (it.y || 0), it.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(1, 1, 1));
      for (const p of build(it, W, D, it.h)) parts.push({ ...p, world });
    }
    return parts;
  }

  // draw only the room you're in (null: you're outside)
  show(id) {
    for (const [k, g] of this.rooms) g.visible = k === id;
  }
}
