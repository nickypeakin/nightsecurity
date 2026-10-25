// Kingsgate in 3D: built once at start-up from the plan in shared/city.js,
// and shared by the title screen and every game. Streets, sidewalks and
// buildings become a few big meshes per material per block of the city;
// lamp posts, trees, bins and the rest are instanced (one draw for all of a
// kind); building fronts glow where somebody's left a light on.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';
import { mat } from './props.js';
import { CITY_UNIFORMS } from './lighting.js';
import { Interiors } from './interiorScene.js';
import { Country } from './countryScene.js';
import { START_HOUR, sunAt } from '../shared/config.js';
import {
  LINES, ROAD, CURB, STOP, NODES, EDGES, BLOCKS, BUILDINGS, PROPS, GROUNDS, SOLID_EXTRA, HARBOR, SIDEWALK_Y, light, hasLights, PLACES, EXITS,
} from '../shared/city.js';

const CH = 80;
const chunkOf = (x, z) => `${Math.floor((x + 240) / CH)}:${Math.floor((z + 240) / CH)}`;

// ------------------------------------------------------------- geometry --
// Quads by material key, with texture coordinates in metres.
class Faces {
  constructor() { this.buf = new Map(); }
  key(k, x, z) { return `${k}|${chunkOf(x, z)}`; }
  // four corners (counter-clockwise seen from the front) and their uvs
  quad(k, pts, uvs, n) {
    const cx = (pts[0][0] + pts[2][0]) / 2, cz = (pts[0][2] + pts[2][2]) / 2;
    const key = this.key(k, cx, cz);
    if (!this.buf.has(key)) this.buf.set(key, { k, chunk: chunkOf(cx, cz), pos: [], nor: [], uv: [] });
    const B = this.buf.get(key);
    for (const i of [0, 1, 2, 0, 2, 3]) { B.pos.push(...pts[i]); B.nor.push(...n); B.uv.push(...uvs[i]); }
  }
  // a flat rectangle facing up at height y, uvs in metres
  floor(k, x0, x1, z0, z1, y = 0) {
    this.quad(k, [[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]], [[x0, -z1], [x1, -z1], [x1, -z0], [x0, -z0]], [0, 1, 0]);
  }
  // an upright wall from (ax, az) to (bx, bz), facing its right-hand side
  // seen from a to b; u starts at u0
  wall(k, ax, az, bx, bz, y0, y1, u0 = 0, v0 = 0) {
    const len = Math.hypot(bx - ax, bz - az);
    const nx = -(bz - az) / len, nz = (bx - ax) / len;
    this.quad(k, [[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]], [[u0, y0 + v0], [u0 + len, y0 + v0], [u0 + len, y1 + v0], [u0, y1 + v0]], [nx, 0, nz]);
  }
  // a box's sides and top (all one material)
  box(k, x0, x1, z0, z1, y0, y1, top = true) {
    this.wall(k, x0, z1, x1, z1, y0, y1);
    this.wall(k, x1, z1, x1, z0, y0, y1);
    this.wall(k, x1, z0, x0, z0, y0, y1);
    this.wall(k, x0, z0, x0, z1, y0, y1);
    if (top) this.floor(k, x0, x1, z0, z1, y1);
  }
  meshes(matFor) {
    const out = [];
    for (const B of this.buf.values()) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, matFor(B.k));
      m.matrixAutoUpdate = false;
      m.userData.chunk = B.chunk;
      out.push(m);
    }
    return out;
  }
}

// a mesh made of parts (each { geo, mat, ...transform }), merged per
// material; returns [{ geo, mat }]
function parts(list) {
  const by = new Map();
  for (const p of list) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    const m4 = new THREE.Matrix4().compose(new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rx || 0, p.ry || 0, p.rz || 0)), new THREE.Vector3(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1));
    g.applyMatrix4(m4);
    for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!by.has(p.mat)) by.set(p.mat, []);
    by.get(p.mat).push(g);
  }
  return [...by.entries()].map(([m, gs]) => ({ geo: mergeGeometries(gs), mat: m }));
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 10);
const CYL16 = new THREE.CylinderGeometry(1, 1, 1, 16);
const SPH = new THREE.SphereGeometry(1, 12, 8);
const ICO = new THREE.IcosahedronGeometry(1, 1);
const box = (m, x, y, z, w, h, d, o = {}) => ({ geo: BOX, mat: m, x, y, z, sx: w, sy: h, sz: d, ...o });
const cyl = (m, x, y, z, r, h, o = {}) => ({ geo: o.fine ? CYL16 : CYL, mat: m, x, y, z, sx: r, sy: h, sz: r, ...o });
const ball = (m, x, y, z, sx, sy = sx, sz = sx, o = {}) => ({ geo: o.ico ? ICO : SPH, mat: m, x, y, z, sx, sy, sz, ...o });

// --------------------------------------------------------------- materials
const M = {};
function mats() {
  if (M.ready) return M;
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, ...o });
  M.asphalt = std({ map: TX.meters(TX.asphalt(), 8), roughness: 0.92 });
  M.sidewalk = std({ map: TX.meters(TX.sidewalk(), 3), roughness: 0.85 });
  M.curb = std({ color: 0x8a8884, roughness: 0.8 });
  M.grass = std({ map: TX.meters(TX.grass(), 6), roughness: 0.98 });
  M.dirt = std({ map: TX.meters(TX.dirt(), 6), roughness: 0.98 });
  M.concrete = std({ map: TX.meters(TX.concrete(), 6), roughness: 0.9 });
  M.plaza = std({ map: TX.meters(TX.pavers(), 4), roughness: 0.8 });
  M.path = std({ map: TX.meters(TX.pavers(), 3), roughness: 0.85, color: 0xb0a490 });
  M.quay = std({ map: TX.meters(TX.concrete('#6a6862', 'quay'), 8), roughness: 0.9 });
  M.paintY = std({ color: 0xd8b84a, roughness: 0.6 });
  M.paintW = std({ color: 0xd8d8d0, roughness: 0.6 });
  M.roof = std({ map: TX.meters(TX.roof(), 4), roughness: 0.95 });
  M.shingles = std({ map: TX.meters(TX.shingles(), 3), roughness: 0.9 });
  M.water = std({ color: 0x0a1626, roughness: 0.08, metalness: 0.5 });
  M.metal = mat(0x6a6e72, { rough: 0.45, metal: 0.7 });
  M.darkMetal = mat(0x2a2c30, { rough: 0.5, metal: 0.6 });
  M.pole = mat(0x4a4e52, { rough: 0.5, metal: 0.6 });
  M.lampHead = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffb060, emissiveIntensity: 2.4 });
  M.lampWhite = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xe0ecff, emissiveIntensity: 2.4 });
  M.globe = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd8a0, emissiveIntensity: 2.0 });
  M.bark = mat(0x3a2a1c, { rough: 0.95 });
  M.leaves = mat(0x1e3418, { rough: 0.95 });
  M.leaves2 = mat(0x26401c, { rough: 0.95 });
  M.wood = mat(0x5a4030, { rough: 0.85 });
  M.green = mat(0x1e4a2a, { rough: 0.6 });
  M.blue = mat(0x1a3a7a, { rough: 0.5, metal: 0.2 });
  M.red = mat(0x8a1a1a, { rough: 0.5 });
  M.yellow = mat(0xd8a818, { rough: 0.5 });
  M.white = mat(0xd8d8d0, { rough: 0.6 });
  M.black = mat(0x141414, { rough: 0.6 });
  M.rubble = mat(0x6a645a, { rough: 0.95 });
  M.container = new THREE.MeshStandardMaterial({ map: TX.meters(TX.corrugated(), 2), roughness: 0.6, metalness: 0.3 });
  M.fence = new THREE.MeshStandardMaterial({ color: 0x9a9a98, alphaMap: TX.meters(TX.chainlink(), 1.2), transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 0.5, metalness: 0.6 });
  M.planks = mat(0x6a5038, { rough: 0.9 });
  M.booth = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xc8e0ff, emissiveIntensity: 0.9 });
  M.signalOff = mat(0x111111, { rough: 0.4 });
  M.canopyGlow = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xf0f6ff, emissiveIntensity: 2.2 });
  M.ready = true;
  return M;
}

const facadeMats = new Map();
function facadeMat(kind, tint, glassy) {
  const k = `${kind}:${tint}`;
  if (!facadeMats.has(k)) {
    const F = TX.facade(kind, tint);
    const [w, h] = F.size;
    facadeMats.set(k, new THREE.MeshStandardMaterial({
      map: TX.meters(F.map, w, h), emissiveMap: TX.meters(F.glow, w, h), emissive: 0xffffff, emissiveIntensity: 1.25,
      roughness: glassy ? 0.25 : 0.85, metalness: glassy ? 0.45 : 0.05,
    }));
  }
  return facadeMats.get(k);
}
const storeMats = new Map();
function storeMat(seed) {
  if (!storeMats.has(seed)) {
    const S = TX.storefront(seed);
    storeMats.set(seed, new THREE.MeshStandardMaterial({ map: TX.meters(S.map, 12, 3.6), emissiveMap: TX.meters(S.glow, 12, 3.6), emissive: 0xffffff, emissiveIntensity: 1.4, roughness: 0.4 }));
  }
  return storeMats.get(seed);
}

const SIGN_STYLE = [
  ['#1a1a2a', '#ff5a8a', 'bold 80px Arial Black, Impact, sans-serif', true],
  ['#0e1a14', '#7affc8', 'bold 78px Arial, sans-serif', true],
  ['#2a0e0e', '#ffd04a', 'italic bold 80px Georgia, serif', true],
  ['#e8e0d0', '#a01818', 'bold 76px Arial Black, sans-serif', false],
  ['#101820', '#7ac8ff', 'bold 80px Arial, sans-serif', true],
];
const SHOP_NAMES = ['LIQUOR', 'DONUTS', 'VIDEO', 'PAWN', 'LAUNDRY', 'PIZZA', 'SHOES', 'RECORDS', 'NAILS', 'CHECKS CASHED', 'DELI', 'TV REPAIR', 'BOOKS', 'BAR', 'FLORIST', 'TACOS'];

// ------------------------------------------------------------------ sky
const SKY_VERT = /* glsl */`
  varying vec3 vDir;
  varying vec2 vUv;
  void main() {
    vDir = position;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const SKY_FRAG = /* glsl */`
  uniform sampler2D stars;
  uniform vec3 sunDir, zenith, horizon;
  uniform float day, warm, time;
  varying vec3 vDir;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
  void main() {
    vec3 d = normalize(vDir);
    float up = max(d.y, 0.0);
    vec3 col = mix(horizon, zenith, pow(up, 0.5));
    float sd = max(dot(d, sunDir), 0.0);
    // the low sun warms its side of the sky
    vec3 dusk = mix(vec3(1.0, 0.52, 0.28), vec3(0.42, 0.36, 0.62), pow(up, 0.45));
    col = mix(col, dusk, warm * (0.35 + 0.65 * pow(sd, 2.5)));
    // clouds, thinning towards the horizon
    vec2 cp = d.xz / max(d.y, 0.08) * 0.55 + vec2(time * 0.003, time * 0.001);
    float c = smoothstep(0.5, 0.82, fbm(cp)) * smoothstep(0.02, 0.3, d.y);
    vec3 cloud = mix(vec3(1.0), vec3(1.0, 0.68, 0.5), warm) * (0.82 + 0.3 * pow(sd, 4.0));
    col = mix(col, cloud, c * 0.8);
    // the sun
    col += vec3(1.0, 0.9, 0.72) * (pow(sd, 1600.0) * 18.0 + pow(sd, 18.0) * 0.4 + pow(sd, 3.0) * 0.08) * (1.0 - c * 0.7);
    vec3 night = texture2D(stars, vUv).rgb;
    gl_FragColor = vec4(mix(night, col, day), 1.0);
    #include <colorspace_fragment>
  }`;
// -------------------------------------------------------------- the city
export class City {
  constructor() {
    mats();
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x05070c);
    this.fog = new THREE.FogExp2(0x0a0c14, 0.0072);
    s.fog = this.fog;
    this.dynamic = new THREE.Group();
    s.add(this.dynamic);
    this.buildSky();
    this.buildGround();
    this.buildMarkings();
    this.buildBuildings();
    this.buildExtras();
    this.buildProps();
    this.country = new Country(s, M);
    this.buildFar();
    // everything above is the outdoors (hidden while you're inside)
    this.outdoors = [...s.children];
    this.interiors = new Interiors(s);
    this.room = null;
    this.buildLights();
  }

  // inside one of the rooms (its id), or out in the city (null)
  setRoom(id) {
    if (id === this.room) return;
    this.room = id;
    this.indoors = !!id;
    for (const o of this.outdoors) o.visible = !id;
    for (const C of this.chunks.values()) C.shown = null;
    this.wasWhole = null;
    this.interiors.show(id);
    this.interiors.doors.visible = !id;
    this.setTime(this.hour);
  }

  // ----------------------------------------------------------- sky, water
  // The sky is a shader: blue by day with the sun and drifting clouds, red
  // and gold at either end of it, the stars (a painted texture) at night.
  buildSky() {
    const s = this.scene;
    this.skyU = {
      stars: { value: TX.sky() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, day: { value: 0 }, warm: { value: 0 }, time: { value: 0 },
      zenith: { value: new THREE.Color(0x2a62c0) }, horizon: { value: new THREE.Color(0xa8c4dc) },
    };
    const sky = (this.sky = new THREE.Mesh(new THREE.SphereGeometry(2400, 32, 16), new THREE.ShaderMaterial({
      uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, fog: false, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
    })));
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    s.add(sky);
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.glow(), color: 0xdde8ff, fog: false, depthWrite: false, transparent: true }));
    this.moonAt = new THREE.Vector3(-700, 900, -1200);
    this.moon.scale.setScalar(160);
    s.add(this.moon);
    // (the sea and the land round the city: countryScene.js)
  }

  // ----------------------------------------------------------- the ground
  buildGround() {
    const F = new Faces();
    const Y = SIDEWALK_Y;
    const E = 200 + CURB;
    // roads: the stretches between junctions, and the junctions (the
    // highways out of town are countryScene's)
    for (const e of EDGES) {
      if (e.hw) continue;
      const A = NODES[e.a], B = NODES[e.b];
      if (e.axis === 'x') F.floor('asphalt', A.x + ROAD, B.x - ROAD, A.z - ROAD, A.z + ROAD);
      else F.floor('asphalt', A.x - ROAD, A.x + ROAD, A.z + ROAD, B.z - ROAD);
    }
    for (const n of NODES) if (n.city) F.floor('asphalt', n.x - ROAD, n.x + ROAD, n.z - ROAD, n.z + ROAD);
    // each block is a raised slab: sidewalk round the edge, its own ground
    // in the middle, kerbs down the sides
    for (const b of BLOCKS) {
      const x0 = b.x0 - (CURB - ROAD), x1 = b.x1 + (CURB - ROAD), z0 = b.z0 - (CURB - ROAD), z1 = b.z1 + (CURB - ROAD);
      F.floor('sidewalk', x0, x1, z0, b.z0, Y);
      F.floor('sidewalk', x0, x1, b.z1, z1, Y);
      F.floor('sidewalk', x0, b.x0, b.z0, b.z1, Y);
      F.floor('sidewalk', b.x1, x1, b.z0, b.z1, Y);
      F.wall('curb', x0, z1, x1, z1, 0, Y);
      F.wall('curb', x1, z1, x1, z0, 0, Y);
      F.wall('curb', x1, z0, x0, z0, 0, Y);
      F.wall('curb', x0, z0, x0, z1, 0, Y);
    }
    for (const g of GROUNDS) {
      const k = g.kind === 'asphalt' ? 'asphalt' : g.kind;
      F.floor(k, g.x0, g.x1, g.z0, g.z1, g.kind === 'path' ? Y + 0.008 : Y + 0.004);
    }
    // the sidewalks round the outside of the ring road, with gaps where the
    // highways leave town
    const o = 200 + ROAD;
    const gaps = (along, side) => EXITS.filter((x) => (side === 'n' ? x.dz < 0 : side === 's' ? x.dz > 0 : side === 'w' ? x.dx < 0 : x.dx > 0))
      .map((x) => (along === 'x' ? NODES[x.node].x : NODES[x.node].z));
    const strip = (side, a0, a1, b0, b1) => {
      // a0..a1 along the side, b0..b1 across it; cut round each gap
      const along = side === 'n' || side === 's' ? 'x' : 'z';
      let a = a0;
      for (const g of [...gaps(along, side), Infinity].sort((p, q) => p - q)) {
        const end = Math.min(a1, g - ROAD);
        if (end > a) along === 'x' ? F.floor('sidewalk', a, end, b0, b1, Y) : F.floor('sidewalk', b0, b1, a, end, Y);
        a = Math.max(a, g + ROAD);
      }
    };
    const kerb = (side, ax, az, bx, bz) => {
      const along = az === bz ? 'x' : 'z';
      const lo = along === 'x' ? Math.min(ax, bx) : Math.min(az, bz), hi = along === 'x' ? Math.max(ax, bx) : Math.max(az, bz);
      const dir = along === 'x' ? Math.sign(bx - ax) : Math.sign(bz - az);
      let segs = [], a = lo;
      for (const g of [...gaps(along, side), Infinity].sort((p, q) => p - q)) { const end = Math.min(hi, g - ROAD); if (end > a) segs.push([a, end]); a = Math.max(a, g + ROAD); }
      if (dir < 0) segs = segs.map(([p, q]) => [q, p]).reverse();
      for (const [p, q] of segs) along === 'x' ? F.wall('curb', p, az, q, bz, 0, Y) : F.wall('curb', ax, p, bx, q, 0, Y);
    };
    strip('n', -E, E, -E, -o); strip('w', -o, o, -E, -o); strip('e', -o, o, o, E);
    F.floor('sidewalk', -E, E, o, HARBOR.z0, Y);
    kerb('n', -o, -o, o, -o); kerb('e', o, -o, o, o); F.wall('curb', o, o, -o, o, 0, Y); kerb('w', -o, o, -o, -o);
    // the quay's edge, down to the water
    F.wall('quay', HARBOR.x0, HARBOR.z1, HARBOR.x1, HARBOR.z1, -1.2, Y);
    for (const m of F.meshes((k) => M[k] || M.concrete)) { m.receiveShadow = true; this.scene.add(m); }
  }

  // lane lines, stop lines and zebra crossings
  buildMarkings() {
    const F = new Faces();
    const y = 0.012;
    for (const e of EDGES) {
      if (e.hw) continue;
      const A = NODES[e.a], B = NODES[e.b];
      const len = e.len - ROAD * 2;
      // dashed yellow down the middle
      for (let d = ROAD + STOP - ROAD + 1; d < len + ROAD - 2; d += 6) {
        if (e.axis === 'x') F.floor('paintY', A.x + d, A.x + d + 3, A.z - 0.1, A.z + 0.1, y);
        else F.floor('paintY', A.x - 0.1, A.x + 0.1, A.z + d, A.z + d + 3, y);
      }
    }
    for (const n of NODES) {
      if (!hasLights(n.id)) continue;
      for (const eid of n.edges) {
        const e = EDGES[eid];
        const o = e.a === n.id ? NODES[e.b] : NODES[e.a];
        const dx = Math.sign(o.x - n.x), dz = Math.sign(o.z - n.z);
        // stop line across the incoming lane (the one on the right coming in)
        const sx = n.x + dx * STOP, sz = n.z + dz * STOP;
        const rx = dz, rz = -dx;                 // right of travel towards the junction
        const l0 = 0.2, l1 = ROAD - 0.3;
        if (dx) F.floor('paintW', Math.min(sx, sx - dx * 0.4), Math.max(sx, sx - dx * 0.4), Math.min(sz + rz * l0, sz + rz * l1), Math.max(sz + rz * l0, sz + rz * l1), y);
        else F.floor('paintW', Math.min(sx + rx * l0, sx + rx * l1), Math.max(sx + rx * l0, sx + rx * l1), Math.min(sz, sz - dz * 0.4), Math.max(sz, sz - dz * 0.4), y);
        // the crossing: stripes across the whole road
        const c0 = ROAD + 0.8, c1 = ROAD + 3.6;
        for (let w = -ROAD + 0.4; w < ROAD - 0.4; w += 1.2) {
          if (dx) F.floor('paintW', Math.min(n.x + dx * c0, n.x + dx * c1), Math.max(n.x + dx * c0, n.x + dx * c1), n.z + w, n.z + w + 0.6, y);
          else F.floor('paintW', n.x + w, n.x + w + 0.6, Math.min(n.z + dz * c0, n.z + dz * c1), Math.max(n.z + dz * c0, n.z + dz * c1), y);
        }
      }
    }
    for (const m of F.meshes((k) => M[k])) this.scene.add(m);
  }

  // ----------------------------------------------------------- buildings
  buildBuildings() {
    const F = new Faces();
    const keyMats = new Map();
    const reg = (key, m) => { keyMats.set(key, m); return key; };
    let shopSeed = 0;
    this.signs = new THREE.Group();
    this.scene.add(this.signs);
    for (const b of BUILDINGS) {
      const kind = b.villa ? 'villa' : b.kind;
      const glassy = kind === 'glass';
      const fk = reg(`fac:${kind}:${b.tint || 0}`, facadeMat(kind, b.tint || 0, glassy));
      const pitched = b.roof === 'pitched';
      const y0 = b.y || 0;
      const top = y0 + (pitched ? b.h - 2.2 : b.h);
      const bottom = y0 - (b.country ? 1.5 : 0);
      const u0 = (b.x0 * 0.37 + b.z0 * 0.61) % 24;
      const sides = [
        ['s', b.x0, b.z1, b.x1, b.z1], ['e', b.x1, b.z1, b.x1, b.z0], ['n', b.x1, b.z0, b.x0, b.z0], ['w', b.x0, b.z0, b.x0, b.z1],
      ];
      for (const [side, ax, az, bx, bz] of sides) {
        const front = b.face === side;
        if (kind === 'shop' && front) {
          const sk = reg(`store:${shopSeed % 12}`, storeMat(shopSeed % 12));
          if (bottom < y0) F.wall(fk, ax, az, bx, bz, bottom, y0, u0, -y0);
          F.wall(sk, ax, az, bx, bz, y0, y0 + 3.6, u0, -y0);
          F.wall(fk, ax, az, bx, bz, y0 + 3.6, top, u0, -y0);
          this.shopSign(b, side, shopSeed++);
        } else F.wall(fk, ax, az, bx, bz, bottom, top, u0, -y0);
      }
      if (pitched) this.pitched(F, b, top);
      else {
        F.floor('roof', b.x0, b.x1, b.z0, b.z1, y0 + b.h);
        // a parapet round the edge of the taller ones
        if (b.h > 12) {
          for (const [ax, az, bx, bz] of [[b.x0, b.z1, b.x1, b.z1], [b.x1, b.z1, b.x1, b.z0], [b.x1, b.z0, b.x0, b.z0], [b.x0, b.z0, b.x0, b.z1]]) F.wall('parapet', ax, az, bx, bz, y0 + b.h, y0 + b.h + 0.9);
        }
      }
      if (b.name && kind !== 'shop') this.nameSign(b);
    }
    keyMats.set('roof', M.roof);
    keyMats.set('shingles', M.shingles);
    keyMats.set('parapet', new THREE.MeshStandardMaterial({ color: 0x4a4844, roughness: 0.9 }));
    for (const m of F.meshes((k) => keyMats.get(k))) this.scene.add(m);
  }

  // a house's roof: two slopes and two gables, ridge along the long side
  pitched(F, b, eave) {
    const along = b.x1 - b.x0 >= b.z1 - b.z0 ? 'x' : 'z';
    const top = (b.y || 0) + b.h, o = 0.4;
    const x0 = b.x0 - o, x1 = b.x1 + o, z0 = b.z0 - o, z1 = b.z1 + o;
    if (along === 'x') {
      const zm = (b.z0 + b.z1) / 2;
      F.quad('shingles', [[x0, eave, z1], [x1, eave, z1], [x1, top, zm], [x0, top, zm]], [[x0, 0], [x1, 0], [x1, 4], [x0, 4]], [0, 0.7, 0.7]);
      F.quad('shingles', [[x1, eave, z0], [x0, eave, z0], [x0, top, zm], [x1, top, zm]], [[x1, 0], [x0, 0], [x0, 4], [x1, 4]], [0, 0.7, -0.7]);
      F.quad(`fac:house:${b.tint || 0}`, [[b.x0, eave, b.z0], [b.x0, eave, b.z1], [b.x0, top, zm], [b.x0, top, zm]], [[0, eave], [b.z1 - b.z0, eave], [(b.z1 - b.z0) / 2, top], [(b.z1 - b.z0) / 2, top]], [-1, 0, 0]);
      F.quad(`fac:house:${b.tint || 0}`, [[b.x1, eave, b.z1], [b.x1, eave, b.z0], [b.x1, top, zm], [b.x1, top, zm]], [[0, eave], [b.z1 - b.z0, eave], [(b.z1 - b.z0) / 2, top], [(b.z1 - b.z0) / 2, top]], [1, 0, 0]);
    } else {
      const xm = (b.x0 + b.x1) / 2;
      F.quad('shingles', [[x1, eave, z1], [x1, eave, z0], [xm, top, z0], [xm, top, z1]], [[z1, 0], [z0, 0], [z0, 4], [z1, 4]], [0.7, 0.7, 0]);
      F.quad('shingles', [[x0, eave, z0], [x0, eave, z1], [xm, top, z1], [xm, top, z0]], [[z0, 0], [z1, 0], [z1, 4], [z0, 4]], [-0.7, 0.7, 0]);
      const k = `fac:house:${b.tint || 0}`, w = b.x1 - b.x0;
      F.quad(k, [[b.x0, eave, b.z1], [b.x1, eave, b.z1], [xm, top, b.z1], [xm, top, b.z1]], [[0, eave], [w, eave], [w / 2, top], [w / 2, top]], [0, 0, 1]);
      F.quad(k, [[b.x1, eave, b.z0], [b.x0, eave, b.z0], [xm, top, b.z0], [xm, top, b.z0]], [[0, eave], [w, eave], [w / 2, top], [w / 2, top]], [0, 0, -1]);
    }
  }

  shopSign(b, side, seed) {
    const st = SIGN_STYLE[seed % SIGN_STYLE.length];
    const name = (b.name || SHOP_NAMES[seed % SHOP_NAMES.length]).toUpperCase();
    const tex = TX.sign(name, { w: 768, h: 128, bg: st[0], fg: st[1], font: st[2], glow: st[3] });
    const w = (side === 'n' || side === 's' ? b.x1 - b.x0 : b.z1 - b.z0) - 1.2;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.9), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color().setScalar(st[3] ? 1.6 : 1.0) }));
    m.userData.glow = st[3] ? 1.6 : 1.0;
    const out = 0.12;
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, sy = (b.y || 0) + 4.2;
    if (side === 'n') m.position.set(cx, sy, b.z0 - out), m.rotation.y = Math.PI;
    if (side === 's') m.position.set(cx, sy, b.z1 + out);
    if (side === 'e') m.position.set(b.x1 + out, sy, cz), m.rotation.y = Math.PI / 2;
    if (side === 'w') m.position.set(b.x0 - out, sy, cz), m.rotation.y = -Math.PI / 2;
    this.signs.add(m);
    if (b.awning) {
      const a = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 1.4), mat(st[3] ? 0x6a1a2a : 0x1a3a2a, { rough: 0.8 }));
      a.position.copy(m.position).y = (b.y || 0) + 3.55;
      a.rotation.y = m.rotation.y;
      a.translateZ(0.7);
      a.rotation.x = 0.0;
      this.signs.add(a);
    }
  }

  // big signs on the places that matter
  nameSign(b) {
    const styles = {
      'City Hall': ['#c8bea8', '#2a2418', 'bold 70px Georgia, serif', false, 2.0],
      'Mercy General': ['#e8e8e8', '#c01818', 'bold 80px Arial, sans-serif', true, 2.0],
      EMERGENCY: ['#c01818', '#ffffff', 'bold 90px Arial Black, sans-serif', true, 1.0],
      'Kingsgate Police': ['#1a2a5a', '#ffffff', 'bold 70px Arial, sans-serif', true, 1.6],
      "Okafor's Motors": ['#101010', '#ffd04a', 'bold 80px Arial Black, Impact, sans-serif', true, 1.4],
      'VOSS FREIGHT': ['#2a2a2e', '#d8d8d8', 'bold 80px Arial, sans-serif', false, 2.0],
      'Gas-N-Go': ['#c01818', '#ffffff', 'bold 90px Arial Black, sans-serif', true, 1.4],
      'Tire World': ['#101010', '#7ac8ff', 'bold 80px Arial, sans-serif', true, 1.2],
      'Your Place': null,
      'Kingsgate International': ['#e8eef4', '#1a3a7a', 'bold 72px Arial, sans-serif', false, 2.0],
      'KERRY SAWMILL': ['#3a2a1a', '#e8d8b8', 'bold 80px Georgia, serif', false, 1.5],
      Hangar: ['#2a2a2e', '#e8e8e8', 'bold 90px Arial, sans-serif', false, 1.5],
    };
    const st = styles[b.name];
    if (!st) return;
    const tex = TX.sign(b.name.toUpperCase(), { w: 1024, h: 160, bg: st[0], fg: st[1], font: st[2], glow: st[3] });
    const w = Math.min(b.x1 - b.x0 - 2, 22);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.16), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color().setScalar(st[3] ? 1.5 : 1.0) }));
    m.userData.glow = st[3] ? 1.5 : 1.0;
    const face = b.face || 's';
    const y = (b.y || 0) + Math.min(b.h - 1.2, 6 + st[4] * 2);
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    if (face === 's') m.position.set(cx, y, b.z1 + 0.1);
    if (face === 'n') m.position.set(cx, y, b.z0 - 0.1), m.rotation.y = Math.PI;
    if (face === 'w') m.position.set(b.x0 - 0.1, y, cz), m.rotation.y = -Math.PI / 2;
    if (face === 'e') m.position.set(b.x1 + 0.1, y, cz), m.rotation.y = Math.PI / 2;
    this.signs.add(m);
  }

  // walls and fences (from SOLID_EXTRA), the spray shop, the mall sign
  buildExtras() {
    const F = new Faces();
    for (const w of SOLID_EXTRA) {
      if (w.fence === 'wood') F.box('planks', w.x0, w.x1, w.z0, w.z1, 0, w.y1);
      else if (w.fence === 'site') {
        const ax = w.x1 - w.x0 > w.z1 - w.z0;
        const zc = (w.z0 + w.z1) / 2, xc = (w.x0 + w.x1) / 2;
        if (ax) { F.wall('fence', w.x0, zc, w.x1, zc, 0, w.y1); F.wall('fence', w.x1, zc, w.x0, zc, 0, w.y1); } else { F.wall('fence', xc, w.z1, xc, w.z0, 0, w.y1); F.wall('fence', xc, w.z0, xc, w.z1, 0, w.y1); }
      } else F.box('sprayWall', w.x0, w.x1, w.z0, w.z1, 0, w.y1);
    }
    const sp = PLACES.spray;
    F.floor('sprayRoof', sp.x0 - 1.4, sp.x1 + 1.4, sp.z0 - 2.4, sp.z1 + 1, 6);
    const extra = { planks: M.planks, fence: M.fence, sprayWall: new THREE.MeshStandardMaterial({ color: 0x8a8a90, roughness: 0.7 }), sprayRoof: new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.8, side: THREE.DoubleSide }) };
    for (const m of F.meshes((k) => extra[k])) this.scene.add(m);
    // Spray-N-Go's sign and the light inside
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.6), new THREE.MeshBasicMaterial({ map: TX.sign('SPRAY-N-GO', { w: 1024, h: 160, bg: '#101010', fg: '#ff7ad8', font: 'bold 110px Arial Black, Impact, sans-serif', glow: true }), color: new THREE.Color().setScalar(1.6) }));
    sg.position.set(sp.x, 5, sp.z1 + 1.05);
    this.scene.add(sg);
  }

  // ------------------------------------------------------------ far away
  // Every 80 m square of town is a dozen or so meshes (a material each);
  // from far off (the hills, the mountain) a square is instead one mesh of
  // plain boxes, with windows that light up at night. Squares out in the
  // country just aren't drawn from far off.
  buildFar() {
    this.chunks = new Map();
    const chunk = (key) => {
      if (!this.chunks.has(key)) {
        const [i, j] = key.split(':').map(Number);
        this.chunks.set(key, { cx: -240 + (i + 0.5) * CH, cz: -240 + (j + 0.5) * CH, near: [], far: null, city: Math.abs(-240 + (i + 0.5) * CH) < 240 && Math.abs(-240 + (j + 0.5) * CH) < 260, shown: null });
      }
      return this.chunks.get(key);
    };
    for (const o of this.scene.children) if (o.isMesh && o.userData.chunk) chunk(o.userData.chunk).near.push(o);
    const glow = TX.facade('office', 0);
    const [fw, fh] = glow.size;
    this.farMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, emissiveMap: TX.meters(glow.glow, fw, fh), emissive: 0xffffff, emissiveIntensity: 0 });
    const tone = { glass: [0.25, 0.33, 0.4], office: [0.5, 0.48, 0.44], stone: [0.62, 0.58, 0.52], brick: [0.42, 0.26, 0.2], shop: [0.48, 0.38, 0.3], warehouse: [0.38, 0.4, 0.4], house: [0.66, 0.62, 0.55], hospital: [0.8, 0.8, 0.78], station: [0.38, 0.32, 0.26], civic: [0.74, 0.7, 0.62] };
    const by = new Map();
    const put = (key) => { if (!by.has(key)) by.set(key, { pos: [], nor: [], col: [], uv: [] }); return by.get(key); };
    const lin = (c) => { const k = new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace); return [k.r, k.g, k.b]; };
    const quad = (B, pts, n, col, uvs) => { for (const i of [0, 1, 2, 0, 2, 3]) { B.pos.push(...pts[i]); B.nor.push(...n); B.col.push(...col); B.uv.push(...uvs[i]); } };
    for (const b of BUILDINGS) {
      if (b.country) continue;
      const B = put(chunkOf((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2));
      const c = lin(tone[b.kind] || tone.office), roof = lin([0.24, 0.24, 0.25]);
      const y0 = 0, y1 = b.h;
      for (const [ax, az, bx, bz] of [[b.x0, b.z1, b.x1, b.z1], [b.x1, b.z1, b.x1, b.z0], [b.x1, b.z0, b.x0, b.z0], [b.x0, b.z0, b.x0, b.z1]]) {
        const len = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / len, nz = (bx - ax) / len;
        quad(B, [[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]], [nx, 0, nz], c, [[0, y0], [len, y0], [len, y1], [0, y1]]);
      }
      quad(B, [[b.x0, y1, b.z1], [b.x1, y1, b.z1], [b.x1, y1, b.z0], [b.x0, y1, b.z0]], [0, 1, 0], roof, [[0, 0], [0, 0], [0, 0], [0, 0]]);
    }
    // the ground of each square of town, one shade
    for (const [key, C] of this.chunks) {
      if (!C.city) continue;
      const x0 = Math.max(-209, C.cx - CH / 2), x1 = Math.min(209, C.cx + CH / 2), z0 = Math.max(-209, C.cz - CH / 2), z1 = Math.min(236, C.cz + CH / 2);
      if (x1 <= x0 || z1 <= z0) continue;
      quad(put(key), [[x0, 0.05, z1], [x1, 0.05, z1], [x1, 0.05, z0], [x0, 0.05, z0]], [0, 1, 0], lin([0.24, 0.25, 0.25]), [[0, 0], [0, 0], [0, 0], [0, 0]]);
    }
    for (const [key, B] of by) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, this.farMat);
      m.matrixAutoUpdate = false;
      m.visible = false;
      this.scene.add(m);
      chunk(key).far = m;
    }
    // and from right across the island, the whole town as one
    const all = [...this.chunks.values()].filter((C) => C.far).map((C) => C.far.geometry);
    this.farTown = new THREE.Mesh(mergeGeometries(all), this.farMat);
    this.farTown.matrixAutoUpdate = false;
    this.farTown.visible = false;
    this.scene.add(this.farTown);
  }

  // near squares in full, far ones plain (or not at all, out of town)
  lod(cam) {
    const x = cam.position.x, z = cam.position.z, high = Math.max(0, cam.position.y - 40);
    const whole = Math.hypot(x, z) > 900;
    if (whole !== this.wasWhole) { this.wasWhole = whole; this.farTown.visible = whole; for (const C of this.chunks.values()) C.shown = null; }
    for (const C of this.chunks.values()) {
      const d = Math.hypot(C.cx - x, C.cz - z) + high * 0.5;
      const near = d < (C.city ? 470 : 900);
      if (near === C.shown) continue;
      C.shown = near;
      for (const m of C.near) m.visible = near;
      if (C.far) C.far.visible = !near && !whole;
    }
    for (const m of this.signs.children) m.visible = Math.abs(m.position.x - x) < 320 && Math.abs(m.position.z - z) < 320;
    // the little things (bins, benches, hydrants) only near town
    for (const im of this.instances) {
      const S = im.boundingSphere;
      if (S && S.radius < 500) im.visible = Math.hypot(S.center.x - x, S.center.z - z) - S.radius < 380;
    }
  }

  // ----------------------------------------------------------- the props
  buildProps() {
    const P = {};
    for (const p of PROPS) (P[p.t] ||= []).push(p);
    this.instances = [];
    const inst = (list, partsList, { color = null, scale = null } = {}) => {
      if (!list || !list.length) return [];
      const out = [];
      for (const { geo, mat: m } of parts(partsList)) {
        const im = new THREE.InstancedMesh(geo, m, list.length);
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
        list.forEach((p, i) => {
          const s = scale ? scale(p) : 1;
          m4.compose(new THREE.Vector3(p.x, p.country ? p.y : SIDEWALK_Y, p.z), q.setFromAxisAngle(up, p.h || 0), new THREE.Vector3(s, s, s));
          im.setMatrixAt(i, m4);
          if (color) im.setColorAt(i, color(p));
        });
        im.computeBoundingSphere();
        this.scene.add(im);
        out.push(im);
        this.instances.push(im);
      }
      return out;
    };
    // street lamps: a pole, an arm over the road, a glowing head
    const lamp = (white) => [
      cyl(M.pole, 0, 3.6, 0, 0.09, 7.2), box(M.pole, 0, 7.15, 0.75, 0.1, 0.1, 1.5),
      box(M.darkMetal, 0, 7.05, 1.45, 0.34, 0.12, 0.7), box(white ? M.lampWhite : M.lampHead, 0, 6.97, 1.45, 0.26, 0.04, 0.55),
    ];
    const lamps = P.lamp || [];
    const downtown = (p) => Math.abs(p.x) < 90 && Math.abs(p.z) < 90;
    inst(lamps.filter((p) => !downtown(p)), lamp(false));
    inst(lamps.filter(downtown), lamp(true));
    inst(P.parkLamp, [cyl(M.black, 0, 2, 0, 0.07, 4), ball(M.globe, 0, 4.25, 0, 0.26)]);
    inst(P.lotLamp, [cyl(M.pole, 0, 3.5, 0, 0.12, 7), box(M.pole, 0, 7, 0, 2.6, 0.12, 0.12), box(M.lampWhite, -1.1, 6.92, 0, 0.6, 0.06, 0.4), box(M.lampWhite, 1.1, 6.92, 0, 0.6, 0.06, 0.4)]);
    // trees: a trunk and a few blobs of leaves
    const tree = [cyl(M.bark, 0, 1.6, 0, 0.16, 3.2), ball(M.leaves, 0, 3.8, 0, 1.9, 1.6, 1.9, { ico: true }), ball(M.leaves2, 0.7, 4.6, 0.3, 1.3, 1.1, 1.3, { ico: true }), ball(M.leaves, -0.6, 4.4, -0.5, 1.2, 1.0, 1.2, { ico: true })];
    inst(P.tree, tree, { scale: (p) => (p.big ? 1.4 : 0.9 + ((p.x * 7.3 + p.z) % 1 + 1) % 1 * 0.3) });
    inst(P.bench, [box(M.wood, 0, 0.45, 0, 1.8, 0.06, 0.45), box(M.wood, 0, 0.75, -0.2, 1.8, 0.4, 0.05), box(M.black, -0.8, 0.22, 0, 0.06, 0.44, 0.4), box(M.black, 0.8, 0.22, 0, 0.06, 0.44, 0.4)]);
    inst(P.bin, [cyl(M.green, 0, 0.5, 0, 0.28, 1.0), cyl(M.black, 0, 1.02, 0, 0.3, 0.06)]);
    inst(P.hydrant, [cyl(M.red, 0, 0.35, 0, 0.13, 0.7), ball(M.red, 0, 0.72, 0, 0.13), cyl(M.red, 0, 0.45, 0, 0.06, 0.4, { rz: Math.PI / 2 })]);
    inst(P.phone, [box(M.metal, 0, 1.1, 0, 0.9, 2.2, 0.9), box(M.booth, 0, 2.05, 0.46, 0.7, 0.18, 0.02)]);
    inst(P.newsbox, [box(M.blue, 0, 0.55, 0, 0.5, 1.1, 0.45)]);
    inst(P.mailbox, [cyl(M.black, 0, 0.5, 0, 0.05, 1.0), box(M.blue, 0, 1.1, 0, 0.5, 0.3, 0.3)]);
    inst(P.planter, [box(M.concrete, 0, 0.3, 0, 2, 0.6, 2), ball(M.leaves2, 0, 0.9, 0, 0.9, 0.5, 0.9, { ico: true })]);
    inst(P.bollard, [cyl(M.yellow, 0, 0.45, 0, 0.16, 0.9)]);
    inst(P.pump, [box(M.white, 0, 0.8, 0, 0.9, 1.6, 0.6), box(M.red, 0, 1.45, 0, 0.92, 0.3, 0.62), box(M.booth, 0, 1.05, 0.31, 0.5, 0.25, 0.01)]);
    // containers, tinted, stacked
    const conts = [];
    for (const p of P.container || []) for (let k = 0; k < (p.stack || 1); k++) conts.push({ ...p, y: k * 2.6 });
    const ccol = [0x8a2a1a, 0x1a4a7a, 0x2a6a3a, 0xb8781a, 0x6a6a6a, 0x4a2a6a].map((c) => new THREE.Color(c));
    const contMeshes = inst(conts, [box(M.container, 0, 1.3, 0, 2.44, 2.6, 6.06)], { color: (p) => ccol[p.color % ccol.length] });
    for (const im of contMeshes) {
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      conts.forEach((p, i) => { m4.compose(new THREE.Vector3(p.x, SIDEWALK_Y + p.y, p.z), q.setFromAxisAngle(up, p.h), new THREE.Vector3(1, 1, 1)); im.setMatrixAt(i, m4); });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
    }
    inst(P.rubble, [ball(M.rubble, 0, 0, 0, 1, 0.45, 1, { ico: true }), box(M.concrete, 0.3, 0.3, 0.2, 0.9, 0.25, 0.5, { ry: 0.5, rz: 0.3 })], { scale: (p) => p.s * 0.55 });
    // one of a kind
    for (const p of P.fountain || []) this.single(p, [cyl(M.concrete, 0, 0.35, 0, 3.4, 0.7, { fine: true }), cyl(M.water, 0, 0.62, 0, 3.1, 0.1, { fine: true }), cyl(M.concrete, 0, 1.2, 0, 0.4, 2.4), cyl(M.concrete, 0, 2.3, 0, 1.0, 0.2, { fine: true })]);
    for (const p of P.canopy || []) this.single(p, [box(M.white, 0, 5.2, 0, p.w, 0.6, p.d), box(M.red, 0, 5.2, 0, p.w + 0.05, 0.25, p.d + 0.05), box(M.canopyGlow, 0, 4.88, 0, p.w - 1, 0.02, p.d - 1), ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => box(M.white, sx * (p.w / 2 - 0.6), 2.5, sz * (p.d / 2 - 0.6), 0.5, 5, 0.5))]);
    for (const p of P.crane || []) this.single(p, [box(M.yellow, -5, 14, 0, 0.8, 28, 0.8), box(M.yellow, 5, 14, 0, 0.8, 28, 0.8), box(M.yellow, 0, 28.5, 0, 11, 1.2, 1.2), box(M.yellow, 0, 28.5, 10, 1.2, 1.0, 36), box(M.darkMetal, 0, 26.5, 22, 2, 1.5, 2)]);
    for (const p of P.excavator || []) this.single(p, [box(M.yellow, 0, 1.2, 0, 2.6, 1.4, 3.2), box(M.black, 0, 0.4, 0, 3, 0.8, 3.6), box(M.yellow, 0.4, 2.4, -0.4, 1.4, 1.2, 1.4), box(M.yellow, -0.6, 2.6, 2.2, 0.4, 0.4, 3, { rx: -0.5 })]);
    for (const p of P.flag || []) this.single(p, [cyl(M.metal, 0, 4.5, 0, 0.06, 9), box(new THREE.MeshStandardMaterial({ color: 0x1a3a7a, roughness: 0.8, side: THREE.DoubleSide }), 0.9, 8.3, 0, 1.8, 1.1, 0.02)]);
    for (const p of P.bunting || []) {
      const flags = [];
      const cols = [M.red, M.yellow, M.blue, M.white];
      for (let k = 0; k < p.w; k += 1.2) flags.push(box(cols[(k / 1.2 | 0) % 4], -p.w / 2 + k, 4.3, 0, 0.6, 0.6, 0.02, { rz: Math.PI / 4 }));
      flags.push(box(M.black, 0, 4.6, 0, p.w, 0.03, 0.03));
      this.single(p, flags);
    }
    for (const p of P.mallSign || []) {
      const face = new THREE.MeshStandardMaterial({ map: TX.sign('KINGSGATE\nMALL', { w: 512, h: 512, bg: '#1a120c', fg: '#c8903a', font: 'bold 120px Georgia, serif', glow: true }), emissive: 0xffffff, emissiveMap: TX.sign('KINGSGATE\nMALL', { w: 512, h: 512, bg: '#000000', fg: '#6a4818', font: 'bold 120px Georgia, serif', glow: true }), roughness: 0.6 });
      this.single(p, [box(M.darkMetal, 0, 3, 0, 0.5, 6, 0.5), box(face, 0, 7, 0, 3.6, 3.6, 0.4)]);
    }
    // traffic lights: a pole at each corner, a head facing the traffic it
    // runs, three lamps a head (lit by update())
    this.signalHeads = [];
    const sigs = P.signal || [];
    const poles = [];
    for (const p of sigs) {
      // which way the head faces and which axis it serves
      const facing = p.sx > 0 && p.sz > 0 ? 0 : p.sx < 0 && p.sz < 0 ? Math.PI : p.sx > 0 ? Math.PI / 2 : -Math.PI / 2;
      const axis = Math.abs(Math.sin(facing)) > 0.5 ? 'x' : 'z';
      poles.push({ ...p, h: facing });
      this.signalHeads.push({ node: p.node, axis, x: p.x, z: p.z, h: facing });
    }
    inst(poles, [cyl(M.pole, 0, 2.2, 0, 0.08, 4.4), box(M.black, 0, 4.0, 0.1, 0.36, 1.0, 0.3)]);
    const lampGeo = new THREE.CircleGeometry(0.11, 12);
    this.signalLamps = new THREE.InstancedMesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), this.signalHeads.length * 3);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), off = new THREE.Vector3();
    this.signalHeads.forEach((s, i) => {
      for (let k = 0; k < 3; k++) {
        off.set(0, 4.32 - k * 0.32, 0.26).applyAxisAngle(up, s.h);
        m4.compose(new THREE.Vector3(s.x + off.x, SIDEWALK_Y + off.y, s.z + off.z), q.setFromAxisAngle(up, s.h), new THREE.Vector3(1, 1, 1));
        this.signalLamps.setMatrixAt(i * 3 + k, m4);
        this.signalLamps.setColorAt(i * 3 + k, new THREE.Color(0x111111));
      }
    });
    this.signalLamps.computeBoundingSphere();
    this.scene.add(this.signalLamps);
  }

  // a one-off prop, merged per material
  single(p, list) {
    for (const { geo, mat: m } of parts(list)) {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(p.x, p.country ? p.y : SIDEWALK_Y, p.z);
      mesh.rotation.y = p.h || 0;
      mesh.userData.chunk = chunkOf(p.x, p.z);
      this.scene.add(mesh);
    }
  }

  // ----------------------------------------------------------- lights
  buildLights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0x5a6a90, 0x201a14, 0.22);
    this.ambient = new THREE.AmbientLight(0x8a90a8, 0.18);
    this.sun = new THREE.DirectionalLight(0xfff4e0, 0);
    s.add(this.hemi, this.ambient, this.sun, this.sun.target);
    // your headlights (when you drive) and a flash for gunfire and fire
    this.head = new THREE.SpotLight(0xfff4e0, 0, 46, 0.5, 0.55, 1.2);
    s.add(this.head, this.head.target);
    this.flash = new THREE.PointLight(0xffc070, 0, 16, 1.6);
    s.add(this.flash);
    this.bright = 1;
    this.indoors = false;
    this.setTime(START_HOUR);
  }

  // Light the city for an hour of the day (0-24). Lamps, lit windows and
  // glowing signs come on as the sun goes down.
  setTime(h) {
    this.hour = h;
    const S = (this.sunState = sunAt(h));
    const { day, night, warm } = S;
    const lerp = (a, b, k) => a + (b - a) * k;
    // where the sun is: rises in the east (+x), over the south, sets in the west
    const phi = Math.PI * S.k, e = Math.asin(Math.max(-1, Math.min(1, S.elev)));
    const dir = S.up ? new THREE.Vector3(Math.cos(phi) * Math.cos(e), Math.sin(e), Math.sin(phi) * 0.45 * Math.cos(e)).normalize() : new THREE.Vector3(0.3, Math.sin(e), -0.5).normalize();
    this.skyU.sunDir.value.copy(dir);
    this.skyU.day.value = day;
    this.skyU.warm.value = warm * day;
    this.sun.position.copy(dir).multiplyScalar(300);
    this.sun.target.position.set(0, 0, 0);
    const lowSun = Math.max(0, Math.min(1, S.elev / 0.5));
    this.sun.intensity = this.indoors ? 0 : day * lerp(1.8, 5.6, lowSun);
    this.sun.color.setRGB(1, lerp(0.62, 0.96, lowSun), lerp(0.4, 0.88, lowSun));
    const b = this.bright;
    this.hemi.color.setHex(0x5a6a90).lerp(new THREE.Color(0xb0ccff), day);
    this.hemi.groundColor.setHex(0x201a14).lerp(new THREE.Color(0x6a5e4c), day);
    this.hemi.intensity = this.indoors ? 0.35 : lerp(0.22 * b, 2.1 * Math.sqrt(b), day);
    this.ambient.intensity = this.indoors ? 0.3 : lerp(0.18 * b, 0.45, day);
    // the haze: blue-grey by day, gold at sunrise and sunset, black at night
    const hazeDay = new THREE.Color(0xa8c0d8).lerp(new THREE.Color(0xd8a888), warm);
    this.fog.color.setHex(0x0a0c14).lerp(hazeDay, day);
    this.fog.density = lerp(0.0042, 0.00082, day);
    this.skyU.horizon.value.copy(hazeDay);
    this.moon.material.opacity = night;
    this.night = night;
    M.water.color.setHex(0x0a1626).lerp(new THREE.Color(0x2a5a7a), day);
    // street lamps (the shader's light grid), lamp heads, windows and signs
    CITY_UNIFORMS.cityScale.value = b * night;
    for (const m of [M.lampHead, M.lampWhite]) m.emissiveIntensity = 0.04 + 2.36 * night;
    M.globe.emissiveIntensity = 0.04 + 1.96 * night;
    M.canopyGlow.emissiveIntensity = 0.3 + 1.9 * night;
    for (const m of facadeMats.values()) m.emissiveIntensity = 1.25 * night;
    if (this.farMat) this.farMat.emissiveIntensity = 1.1 * night;
    for (const m of storeMats.values()) m.emissiveIntensity = 0.3 + 1.1 * night;
    for (const m of this.signs.children) {
      const g = m.userData.glow;
      if (g && m.material.color) m.material.color.setScalar(1 + (g - 1) * night);
    }
  }

  // keep the sky round the camera; clouds drift; far squares of the
  // country aren't drawn
  follow(camera, t) {
    this.sky.position.copy(camera.position);
    this.moon.position.copy(camera.position).add(this.moonAt);
    this.skyU.time.value = t;
    const dt = Math.min(0.1, Math.max(0, t - (this.lastT ?? t)));
    this.lastT = t;
    if (!this.indoors) {
      this.country.update(camera, t, dt, this.night || 0);
      this.lod(camera);
    }
  }

  // the traffic lights, by the host's clock
  update(t) {
    const L = this.signalLamps;
    if (!L) return;
    const RED = new THREE.Color(3.2, 0.25, 0.15), AMB = new THREE.Color(3.2, 1.8, 0.2), GRN = new THREE.Color(0.3, 3.0, 1.0), OFF = new THREE.Color(0.06, 0.06, 0.06);
    this.signalHeads.forEach((s, i) => {
      const l = light(s.node, s.axis, t);
      L.setColorAt(i * 3, l === 'r' ? RED : OFF);
      L.setColorAt(i * 3 + 1, l === 'y' ? AMB : OFF);
      L.setColorAt(i * 3 + 2, l === 'g' ? GRN : OFF);
    });
    L.instanceColor.needsUpdate = true;
  }

  render(renderer, camera, target) {
    this.follow(camera, performance.now() / 1000);
    renderer.setRenderTarget(target);
    renderer.render(this.scene, camera);
  }
}
