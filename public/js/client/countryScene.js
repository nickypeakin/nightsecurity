// The island outside town, in 3D, from the plan in shared/world.js: the land
// (a mesh for every 320 m square, coloured by what grows there and how
// steep it is), the sea and the lake, the highways and their lines, the
// trees, bushes, cacti and rocks (merged per square, so a square of forest
// is one draw), the towns' paved lots, and the landmarks: the sign on the
// hill, the mast on top of Mount Harlow, the wind farm, the pier, the
// lifeguard huts and the airstrip. Far squares aren't drawn at all.

import * as THREE from 'three';
import * as TX from './textures.js';
import {
  GRID, HEIGHT, PAD, ROUTES, FLORA, COUNTRY, SIGN, SUMMIT, TURBINES, SEA_Y, LAKE, ROAD_W,
  desertness, shoreDist, roadDist, cityDist, fbm, heightAt,
} from '../shared/world.js';

const { x0: GX, z0: GZ, cell: GC, nx: NX, nz: NZ } = GRID;
const TILE = 64;                      // samples along a square's side (320 m)
const TILE_M = TILE * GC;

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const lin = (c) => { const k = new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace); return [k.r, k.g, k.b]; };

// the ground's colours (sRGB)
const G = {
  grass: [0.36, 0.45, 0.22], grass2: [0.27, 0.37, 0.16], dry: [0.6, 0.55, 0.33], desert: [0.8, 0.68, 0.48], sand: [0.9, 0.83, 0.64],
  wet: [0.62, 0.56, 0.42], rock: [0.5, 0.48, 0.45], forest: [0.2, 0.3, 0.13], shoulder: [0.5, 0.47, 0.4], concrete: [0.58, 0.57, 0.54],
  dirt: [0.52, 0.44, 0.32], tar: [0.22, 0.22, 0.23],
};

function groundColour(x, z, h, slope) {
  const n = fbm(x / 70, z / 70, 2);
  let c = mix(G.grass, G.grass2, 0.5 + n * 0.5);
  const des = desertness(x, z);
  // the southern hills are dry and golden in places; the desert's sand
  const dry = Math.max(0, Math.min(1, 0.2 + n * 0.45 + (z > -900 ? 0.15 : -0.15)));
  c = mix(c, G.dry, Math.max(dry * 0.7, des * 0.8));
  c = mix(c, G.desert, smooth(0.45, 0.85, des));
  c = mix(c, G.forest, smooth(-1450, -1750, z) * (1 - des) * 0.85);
  c = mix(c, G.rock, Math.max(smooth(0.55, 1.0, slope), smooth(160, 240, h) * 0.75));
  const sd = h < 6 ? shoreDist(x, z) : 999;
  c = mix(c, G.sand, (1 - smooth(2.2, 3.6, h)) * (1 - smooth(70, 150, sd)));
  if (h < SEA_Y + 0.6) c = mix(c, G.wet, smooth(SEA_Y + 0.6, SEA_Y - 0.2, h));
  if (Math.abs(h - LAKE.y) < 2 && Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz) < 1.5) c = mix(c, G.sand, smooth(LAKE.y + 2, LAKE.y + 0.6, h) * 0.8);
  const rd = roadDist(x, z);
  if (rd < ROAD_W + 4) c = mix(c, G.shoulder, 1 - smooth(ROAD_W + 1.5, ROAD_W + 4, rd));
  return lin(c);
}

// ------------------------------------------------------------ the merger --
// shapes (any geometry) moved into place and painted, all in one mesh
const FLAT = new WeakMap();
const flat = (g) => { if (!FLAT.has(g)) FLAT.set(g, g.index ? g.toNonIndexed() : g); return FLAT.get(g); };
class Merger {
  constructor() { this.pos = []; this.nor = []; this.col = []; }
  add(geo, colour, m4, tint = 1) {
    const g = flat(geo);
    const P = g.attributes.position, N = g.attributes.normal;
    const nm = new THREE.Matrix3().getNormalMatrix(m4);
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    const c = lin(colour.map((q) => Math.min(1, q * tint)));
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m4);
      n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      this.pos.push(v.x, v.y, v.z);
      this.nor.push(n.x, n.y, n.z);
      this.col.push(c[0], c[1], c[2]);
    }
  }
  // a template's pieces: [[geo, colour, x, y, z, sx, sy, sz, rx, ry, rz]]
  addAll(pieces, x, y, z, s, h, tint = 1) {
    const base = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), h), new THREE.Vector3(s, s, s));
    for (const [geo, colour, px = 0, py = 0, pz = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0] of pieces) {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
      this.add(geo, colour, base.clone().multiply(m), tint);
    }
  }
  mesh(material) {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material);
    m.matrixAutoUpdate = false;
    return m;
  }
}

// ---------------------------------------------------------- the plants --
const CYL5 = new THREE.CylinderGeometry(1, 1, 1, 5);
const CYL6 = new THREE.CylinderGeometry(1, 1, 1, 6);
const CONE = new THREE.ConeGeometry(1, 1, 7);
const ICO = new THREE.IcosahedronGeometry(1, 0);
const BOXG = new THREE.BoxGeometry(1, 1, 1);
const FROND = (() => {
  // a leaf, both sides
  const a = new THREE.PlaneGeometry(1, 1).toNonIndexed();
  const b = a.clone();
  b.rotateY(Math.PI);
  const pos = [...a.attributes.position.array, ...b.attributes.position.array];
  const nor = [...a.attributes.normal.array, ...b.attributes.normal.array];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
})();
const BARK = [0.32, 0.23, 0.16], NEEDLES = [0.12, 0.24, 0.12], LEAVES = [0.2, 0.34, 0.13], LEAVES2 = [0.25, 0.39, 0.15];
const PLANTS = {
  pine: [[CYL5, BARK, 0, 1.2, 0, 0.24, 2.4, 0.24], [CONE, NEEDLES, 0, 3.8, 0, 2.3, 4.4, 2.3], [CONE, [0.14, 0.27, 0.13], 0, 6, 0, 1.7, 3.6, 1.7], [CONE, [0.15, 0.29, 0.14], 0, 7.9, 0, 1.05, 2.6, 1.05]],
  oak: [[CYL5, BARK, 0, 1.3, 0, 0.26, 2.6, 0.26], [ICO, LEAVES, 0, 4.1, 0, 2.7, 2.2, 2.7], [ICO, LEAVES2, 1.2, 4.9, 0.6, 1.8, 1.5, 1.8, 0.4, 0.3, 0]],
  palm: [[CYL5, [0.46, 0.39, 0.28], 0.25, 3.75, 0, 0.2, 7.5, 0.2, 0, 0, -0.07],
    ...[0, 1, 2, 3, 4, 5].map((k) => [FROND, [0.24, 0.44, 0.17], 0.55 + Math.sin(k * 1.047) * 1.4, 7.2, Math.cos(k * 1.047) * 1.4, 3.2, 0.9, 1, -Math.PI / 2 + 0.55, k * 1.047, 0])],
  bush: [[ICO, [0.3, 0.4, 0.18], 0, 0.45, 0, 1.4, 0.95, 1.4]],
  cactus: [[CYL6, [0.26, 0.43, 0.23], 0, 1.6, 0, 0.3, 3.2, 0.3], [CYL5, [0.26, 0.43, 0.23], 0.5, 1.5, 0, 0.17, 0.9, 0.17, 0, 0, Math.PI / 2], [CYL5, [0.26, 0.43, 0.23], 0.9, 2.1, 0, 0.17, 1.2, 0.17],
    [CYL5, [0.26, 0.43, 0.23], -0.45, 1.9, 0, 0.16, 0.8, 0.16, 0, 0, Math.PI / 2], [CYL5, [0.26, 0.43, 0.23], -0.8, 2.4, 0, 0.16, 1.0, 0.16]],
  rock: [[ICO, [0.52, 0.5, 0.47], 0, 0.25, 0, 1.7, 1.05, 1.35, 0.3, 0, 0.2]],
};

// ----------------------------------------------------------- the land --
export class Country {
  constructor(scene, M) {
    this.scene = scene;
    this.M = M;
    this.tiles = [];         // { mesh, cx, cz, far }
    this.flora = [];
    this.spin = [];
    this.blink = [];
    const mats = this.mats = {
      land: new THREE.MeshStandardMaterial({ vertexColors: true, map: TX.meters(TX.terrainDetail(), 9), roughness: 0.96 }),
      plants: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
      things: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
      road: new THREE.MeshStandardMaterial({ map: TX.meters(TX.asphalt(), 8), roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      lot: new THREE.MeshStandardMaterial({ map: TX.meters(TX.concrete(), 6), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
      paintY: new THREE.MeshStandardMaterial({ color: 0xd8b84a, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
      paintW: new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
      lake: new THREE.MeshStandardMaterial({ color: 0x1a3a44, roughness: 0.1, metalness: 0.45 }),
    };
    this.buildLand();
    this.buildWater();
    this.buildRoads();
    this.buildPlants();
    this.buildLots();
    this.buildLandmarks();
    void mats;
  }

  // the land: one mesh per square, skipping what's under the sea or the city
  buildLand() {
    const N = NX * NZ;
    const col = new Float32Array(N * 3), nor = new Float32Array(N * 3);
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) {
        const k = j * NX + i;
        const x = GX + i * GC, z = GZ + j * GC, h = HEIGHT[k];
        const hl = HEIGHT[k - (i > 0 ? 1 : 0)], hr = HEIGHT[k + (i < NX - 1 ? 1 : 0)];
        const hu = HEIGHT[k - (j > 0 ? NX : 0)], hd = HEIGHT[k + (j < NZ - 1 ? NX : 0)];
        const dx = (hr - hl) / (2 * GC), dz = (hd - hu) / (2 * GC);
        const l = Math.hypot(dx, 1, dz);
        nor[k * 3] = -dx / l; nor[k * 3 + 1] = 1 / l; nor[k * 3 + 2] = -dz / l;
        let c;
        if (h < SEA_Y - 3) c = lin(G.wet);
        else if (h === -0.3) c = lin(G.grass2);
        else if (PAD[k]) c = lin(PAD[k] === 4 ? mix(G.grass, G.grass2, 0.4) : PAD[k] === 3 ? G.tar : PAD[k] === 2 ? G.dirt : G.concrete);
        else c = groundColour(x, z, h, Math.hypot(dx, dz));
        col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
      }
    }
    const hidden = (k) => HEIGHT[k] === -0.3 || HEIGHT[k] < SEA_Y - 0.9;
    for (let tj = 0; tj < NZ - 1; tj += TILE) {
      for (let ti = 0; ti < NX - 1; ti += TILE) {
        const w = Math.min(TILE, NX - 1 - ti), d = Math.min(TILE, NZ - 1 - tj);
        const local = (i, j) => (j - tj) * (w + 1) + (i - ti);
        // every square (near), or every other sample (far)
        const fine = [], coarse = [];
        for (let j = tj; j < tj + d; j++) {
          for (let i = ti; i < ti + w; i++) {
            const a = j * NX + i, b = a + NX, c = b + 1, e = a + 1;
            if (hidden(a) && hidden(b) && hidden(c) && hidden(e)) continue;
            const la = local(i, j);
            fine.push(la, la + w + 1, la + 1, la + w + 1, la + w + 2, la + 1);
          }
        }
        if (!fine.length) continue;
        for (let j = tj; j < tj + d; j += 2) {
          for (let i = ti; i < ti + w; i += 2) {
            let all = true;
            for (let q = 0; q <= 2 && all; q++) for (let r = 0; r <= 2 && all; r++) if (!hidden((j + q) * NX + i + r)) all = false;
            if (all) continue;
            const la = local(i, j), lb = local(i, j + 2), lc = local(i + 2, j + 2), le = local(i + 2, j);
            coarse.push(la, lb, le, lb, lc, le);
          }
        }
        const n = (w + 1) * (d + 1);
        // and a skirt hanging down round the edge, so a far square never
        // shows a crack against a near one
        const ring = [];
        for (let i = ti; i < ti + w; i += 2) ring.push([i, tj, i + 2, tj]);
        for (let j = tj; j < tj + d; j += 2) ring.push([ti + w, j, ti + w, j + 2]);
        for (let i = ti + w; i > ti; i -= 2) ring.push([i, tj + d, i - 2, tj + d]);
        for (let j = tj + d; j > tj; j -= 2) ring.push([ti, j, ti, j - 2]);
        const P = new Float32Array((n + ring.length * 2) * 3), Nn = new Float32Array(P.length), C = new Float32Array(P.length), U = new Float32Array((n + ring.length * 2) * 2);
        let v = 0;
        const vert = (i, j, drop) => {
          const k = j * NX + i, x = GX + i * GC, z = GZ + j * GC;
          P[v * 3] = x; P[v * 3 + 1] = HEIGHT[k] - drop; P[v * 3 + 2] = z;
          Nn.set(nor.subarray(k * 3, k * 3 + 3), v * 3);
          C.set(col.subarray(k * 3, k * 3 + 3), v * 3);
          U[v * 2] = x; U[v * 2 + 1] = -z;
          return v++;
        };
        for (let j = tj; j <= tj + d; j++) for (let i = ti; i <= ti + w; i++) vert(i, j, 0);
        for (const [i0, j0, i1, j1] of ring) {
          const a = local(i0, j0), b = local(i1, j1), a2 = vert(i0, j0, 6), b2 = vert(i1, j1, 6);
          coarse.push(a, a2, b, b, a2, b2, a, b, a2, b, b2, a2);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(P, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(Nn, 3));
        g.setAttribute('color', new THREE.BufferAttribute(C, 3));
        g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
        const near = new THREE.BufferAttribute(new Uint32Array(fine), 1), far = new THREE.BufferAttribute(new Uint32Array(coarse), 1);
        g.setIndex(near);
        g.computeBoundingSphere();
        const m = new THREE.Mesh(g, this.mats.land);
        m.matrixAutoUpdate = false;
        this.scene.add(m);
        this.tiles.push({ mesh: m, cx: GX + (ti + w / 2) * GC, cz: GZ + (tj + d / 2) * GC, far: 2600, lod: { near, far, at: near } });
      }
    }
  }

  // the sea all round, and Lake Corrigan
  buildWater() {
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000), this.M.water);
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, SEA_Y, -1200);
    this.scene.add(sea);
    const lake = new THREE.Mesh(new THREE.CircleGeometry(1, 64), this.mats.lake);
    lake.rotation.x = -Math.PI / 2;
    lake.scale.set(LAKE.rx * 1.75, LAKE.rz * 1.75, 1);
    lake.position.set(LAKE.x, LAKE.y, LAKE.z);
    this.scene.add(lake);
  }

  // the highways: a ribbon of asphalt along each route, a dashed line down
  // the middle and a white line each side
  buildRoads() {
    const road = { pos: [], nor: [], uv: [] }, yel = [], wht = [];
    ROUTES.forEach((r, ri) => {
      const P = r.pts;
      const lift = (p) => (cityDist(p.x, p.z) < 1 ? 0.004 : 0.05 + ri * 0.006);
      const side = P.map((p, i) => {
        const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
        const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        return { rx: -(b.z - a.z) / l, rz: (b.x - a.x) / l };
      });
      const at = (i, off, up = 0) => [P[i].x + side[i].rx * off, P[i].y + lift(P[i]) + up, P[i].z + side[i].rz * off];
      // (start at the edge of the city's junction, not its middle)
      const first = P.findIndex((p) => p.s > (cityDist(P[0].x, P[0].z) < 1 ? ROAD_W : 0)) || 1;
      const last = cityDist(P[P.length - 1].x, P[P.length - 1].z) < 1 ? P.findIndex((p) => p.s > r.len - ROAD_W) : P.length - 1;
      for (let i = Math.max(1, first); i <= last; i++) {
        const a0 = at(i - 1, -ROAD_W), a1 = at(i - 1, ROAD_W), b0 = at(i, -ROAD_W), b1 = at(i, ROAD_W);
        const s0 = P[i - 1].s, s1 = P[i].s;
        for (const [v, u] of [[a0, [-ROAD_W, s0]], [b1, [ROAD_W, s1]], [b0, [-ROAD_W, s1]], [a0, [-ROAD_W, s0]], [a1, [ROAD_W, s0]], [b1, [ROAD_W, s1]]]) {
          road.pos.push(...v); road.nor.push(0, 1, 0); road.uv.push(u[0], u[1]);
        }
        // lines (not through the junctions at either end)
        const s = P[i].s;
        if (s < 16 || s > r.len - 16) continue;
        const strip = (out, off, w) => {
          const q0 = at(i - 1, off - w, 0.01), q1 = at(i - 1, off + w, 0.01), q2 = at(i, off - w, 0.01), q3 = at(i, off + w, 0.01);
          out.push(...q0, ...q3, ...q2, ...q0, ...q1, ...q3);
        };
        if (Math.floor(s / 4) % 2 === 0) strip(yel, 0, 0.1);
        strip(wht, -ROAD_W + 0.4, 0.09);
        strip(wht, ROAD_W - 0.4, 0.09);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(road.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(road.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(road.uv, 2));
    g.computeBoundingSphere();
    this.scene.add(new THREE.Mesh(g, this.mats.road));
    for (const [pts, m] of [[yel, this.mats.paintY], [wht, this.mats.paintW]]) {
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      lg.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pts.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
      lg.computeBoundingSphere();
      this.scene.add(new THREE.Mesh(lg, m));
    }
  }

  // trees, bushes, cacti and rocks, merged a square at a time
  buildPlants() {
    const by = new Map();
    for (const f of FLORA) {
      const k = `${Math.floor((f.x - GX) / TILE_M)}:${Math.floor((f.z - GZ) / TILE_M)}`;
      if (!by.has(k)) by.set(k, new Merger());
      const tint = f.t === 'bush' && desertness(f.x, f.z) > 0.4 ? 1.45 : f.t === 'rock' ? 0.85 + (f.s - 0.75) * 0.5 : 0.9 + (f.s - 0.75) * 0.3;
      let pieces = PLANTS[f.t];
      if (f.t === 'bush' && tint > 1.2) pieces = [[ICO, [0.42, 0.4, 0.24], 0, 0.45, 0, 1.4, 0.95, 1.4]];
      by.get(k).addAll(pieces, f.x, f.y - 0.15, f.z, f.s, f.h, f.t === 'bush' ? 1 : tint);
    }
    for (const [k, mg] of by) {
      const m = mg.mesh(this.mats.plants);
      if (!m) continue;
      const [i, j] = k.split(':').map(Number);
      this.scene.add(m);
      this.flora.push({ mesh: m, cx: GX + (i + 0.5) * TILE_M, cz: GZ + (j + 0.5) * TILE_M, far: 1100 });
    }
  }

  // the towns' lots, the airstrip and its markings
  buildLots() {
    const F = { pos: [], uv: [] }, W = [];
    const quad = (out, x0, x1, z0, z1, y, uv) => {
      for (const [x, z] of [[x0, z1], [x1, z1], [x1, z0], [x0, z1], [x1, z0], [x0, z0]]) { out.pos ? out.pos.push(x, y, z) : out.push(x, y, z); if (uv) uv.push(x, -z); }
    };
    for (const p of COUNTRY.pads) if (p.kind === 1) quad(F, p.x0 + 1, p.x1 - 1, p.z0 + 1, p.z1 - 1, p.y + 0.03, F.uv);
    const R = { pos: [], uv: [] }, Y = [];
    for (const S of COUNTRY.strips) {
      quad(R, S.x0, S.x1, S.z0, S.z1, S.y + 0.03, R.uv);
      const zm = (S.z0 + S.z1) / 2;
      if (!S.marks) { quad(Y, S.x0 + 4, S.x1 - 4, zm - 0.15, zm + 0.15, S.y + 0.06); continue; }
      // the runway: a dashed line down the middle, stripes at each end
      for (let x = S.x0 + 14; x < S.x1 - 16; x += 14) quad(W, x, x + 7, zm - 0.3, zm + 0.3, S.y + 0.06);
      for (const x of [S.x0 + 3, S.x1 - 9]) for (let z = S.z0 + 2.5; z < S.z1 - 2.5; z += 2.4) quad(W, x, x + 6, z, z + 1.2, S.y + 0.06);
      for (const z of [S.z0 + 0.8, S.z1 - 1.1]) quad(W, S.x0 + 1, S.x1 - 1, z, z + 0.3, S.y + 0.06);
    }
    const mk = (src, m) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(src.pos || src, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array((src.pos || src).length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
      if (src.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(src.uv, 2));
      g.computeBoundingSphere();
      this.scene.add(new THREE.Mesh(g, m));
    };
    mk(F, this.mats.lot);
    mk(R, this.mats.road);
    mk(W, this.mats.paintW);
    mk(Y, this.mats.paintY);
  }

  // the sign, the mast, the wind farm, the pier, lifeguard huts and pools
  buildLandmarks() {
    const T = new Merger();
    const box = (x, y, z, w, h, d, col, ry = 0) => T.add(BOXG, col, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(w, h, d)));
    const cyl = (x, y, z, r0, r1, h, col) => T.add(new THREE.CylinderGeometry(r1, r0, h, 8), col, new THREE.Matrix4().makeTranslation(x, y + h / 2, z));
    // KINGSGATE, on the hill above town, facing it
    const text = SIGN.text;
    const step = SIGN.letter * 0.78 + SIGN.gap;
    const x0 = SIGN.x - (text.length - 1) * step / 2;
    const signMat = (ch) => new THREE.MeshStandardMaterial({ map: TX.letter(ch), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 });
    this.signMats = [];
    [...text].forEach((ch, k) => {
      const x = x0 + k * step, z = SIGN.z + Math.sin(k * 0.7) * 0.8;
      const y = heightAt(x, z) + 0.4;
      const m = signMat(ch);
      this.signMats.push(m);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(SIGN.letter * 0.8, SIGN.letter), m);
      plane.position.set(x, y + SIGN.letter / 2, z);
      plane.rotation.y = 0.12;
      this.scene.add(plane);
      for (const dx of [-1.6, 1.6]) box(x + dx, y + SIGN.letter * 0.4, z - 0.6, 0.15, SIGN.letter * 0.8 + 1.2, 0.15, [0.3, 0.3, 0.3]);
    });
    // the mast on Mount Harlow, a red light on top
    cyl(SUMMIT.x, SUMMIT.y - 1, SUMMIT.z, 0.9, 0.25, 46, [0.78, 0.78, 0.76]);
    for (const [dy, s] of [[18, 1.6], [30, 1.3]]) box(SUMMIT.x, SUMMIT.y + dy, SUMMIT.z, s, s, s, [0.85, 0.85, 0.82]);
    box(SUMMIT.x + 6, SUMMIT.y + 1.4, SUMMIT.z + 4, 6, 3, 4, [0.6, 0.6, 0.58]);
    const red = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.glow(), color: 0xff2a1a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    red.position.set(SUMMIT.x, SUMMIT.y + 45.5, SUMMIT.z);
    red.scale.setScalar(5);
    this.scene.add(red);
    this.blink.push(red);
    // the wind farm
    const rotorGeo = (() => {
      const M2 = new Merger();
      for (let k = 0; k < 3; k++) M2.add(BOXG, [0.92, 0.92, 0.9], new THREE.Matrix4().makeRotationZ(k * 2.094).multiply(new THREE.Matrix4().compose(new THREE.Vector3(0, 11, 0), new THREE.Quaternion(), new THREE.Vector3(1.1, 22, 0.25))));
      M2.add(ICO, [0.9, 0.9, 0.88], new THREE.Matrix4().makeScale(1.1, 1.1, 1.4));
      return M2;
    })();
    const rotorMesh = rotorGeo.mesh(this.mats.things);
    for (const t of TURBINES) {
      cyl(t.x, t.y - 0.5, t.z, 1.7, 0.9, 50, [0.9, 0.9, 0.88]);
      box(t.x, t.y + 50.2, t.z + 1, 2.4, 2.4, 6, [0.88, 0.88, 0.86], 0);
      const r = rotorMesh.clone();
      r.matrixAutoUpdate = true;
      r.position.set(t.x, t.y + 50.2, t.z - 2.4);
      r.rotation.z = t.x * 0.1;
      this.scene.add(r);
      this.spin.push(r);
    }
    // the pier: a deck on piles, rails along each side
    const P = COUNTRY.pier;
    const wood = [0.45, 0.33, 0.22], dark = [0.3, 0.22, 0.15];
    box((P.x0 + P.x1) / 2, P.y - 0.2, (P.z0 + P.z1) / 2, P.x1 - P.x0, 0.4, P.z1 - P.z0, wood);
    for (let x = P.x0 + 2; x < P.x1 - 1; x += 7) {
      for (const z of [P.z0 + 0.6, P.z1 - 0.6]) {
        box(x, (P.y - 0.4 + SEA_Y - 6) / 2, z, 0.45, P.y - 0.4 - SEA_Y + 6, 0.45, dark);
        box(x, P.y + 0.55, z, 0.15, 1.1, 0.15, dark);
      }
    }
    for (const z of [P.z0 + 0.6, P.z1 - 0.6]) box((P.x0 + P.x1) / 2, P.y + 1.05, z, P.x1 - P.x0 - 2, 0.12, 0.12, dark);
    // lifeguard huts on the beach
    for (const p of COUNTRY.props.filter((q) => q.t === 'lifeguard')) {
      for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [0.9, 0.9], [-0.9, 0.9]]) box(p.x + dx, p.y + 1, p.z + dz, 0.15, 2.2, 0.15, [0.85, 0.85, 0.82]);
      box(p.x, p.y + 2.9, p.z, 2.6, 1.8, 2.4, [0.86, 0.3, 0.22]);
      box(p.x, p.y + 3.9, p.z, 3, 0.2, 2.8, [0.95, 0.93, 0.88]);
      box(p.x + 1.2, p.y + 2.3, p.z, 0.08, 1.2, 1.6, [0.2, 0.3, 0.45]);
    }
    // airliners on the apron
    for (const p of COUNTRY.props.filter((q) => q.t === 'plane')) {
      const base = new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.h), new THREE.Vector3(1, 1, 1));
      const put = (geo, col, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => T.add(geo, col, base.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz))));
      const white = [0.92, 0.92, 0.9], blue = [0.18, 0.3, 0.55], grey = [0.55, 0.56, 0.58];
      put(CYL6, white, 0, 3.2, 0, 1.9, 24, 1.9, Math.PI / 2, 0, 0);
      put(CONE, white, 0, 3.2, 13.6, 1.9, 3.2, 1.9, Math.PI / 2, 0, 0);
      put(CONE, white, 0, 3.4, -13.4, 1.9, 2.8, 1.9, -Math.PI / 2, 0, 0);
      put(BOXG, grey, 0, 2.6, 1, 30, 0.35, 4.2);
      put(BOXG, grey, 0, 3.4, -12, 10, 0.25, 2.2);
      put(BOXG, blue, 0, 6.6, -12.4, 0.3, 6, 3.2);
      for (const sx of [-6.5, 6.5]) put(CYL6, grey, sx, 1.7, 2.6, 0.8, 3.2, 0.8, Math.PI / 2, 0, 0);
      put(BOXG, blue, 0, 3.5, 0, 3.86, 0.5, 22);
      for (const [x, z] of [[0, 10], [-2.4, 0], [2.4, 0]]) put(CYL5, [0.2, 0.2, 0.2], x, 0.6, z, 0.12, 1.2, 0.12);
    }
    // the villas' pools
    for (const p of COUNTRY.props.filter((q) => q.t === 'pool')) {
      box(p.x, p.y + 0.05, p.z, p.w + 1.2, 0.12, p.d + 1.2, [0.92, 0.9, 0.86]);
      box(p.x, p.y + 0.1, p.z, p.w, 0.06, p.d, [0.2, 0.62, 0.78]);
    }
    const m = T.mesh(this.mats.things);
    if (m) this.scene.add(m);
  }

  // what's near enough to draw; the turbines turn; the mast's light winks
  update(cam, t, dt, night) {
    const x = cam.position.x, z = cam.position.z;
    for (const list of [this.tiles, this.flora]) {
      for (const q of list) {
        const d = Math.hypot(q.cx - x, q.cz - z) - TILE_M * 0.71;
        q.mesh.visible = d < q.far;
        if (q.lod) {
          const want = d < 420 ? q.lod.near : q.lod.far;
          if (want !== q.lod.at) { q.lod.at = want; q.mesh.geometry.setIndex(want); }
        }
      }
    }
    for (const r of this.spin) r.rotation.z += dt * 1.1;
    for (const b of this.blink) b.visible = night > 0.2 && Math.floor(t * 1.2) % 2 === 0;
  }
}
