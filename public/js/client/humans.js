// People. Every character is built in code from smooth lofted shapes: a
// shaped torso, tapered limbs, hands with fingers, a sculpted head with
// eyes that blink, hair and clothes. Nothing is a box. The origin is
// between the feet and they face +z. (From Cinder Peak.)
//
// A person is a small rig of joints (pelvis, spine, neck, head, shoulders,
// elbows, hips, knees) that `Rig.update` poses each frame: walking,
// standing, sitting, driving, aiming, talking, looking around.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const gauss = (d) => Math.exp(-d * d);

// --------------------------------------------------------------- geometry --
// Averages the normals of vertices that sit on top of each other, so seams
// and poles of generated shapes shade smoothly.
function smoothSeams(geo) {
  geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal;
  const groups = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(i);
  }
  const v = new THREE.Vector3();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    v.set(0, 0, 0);
    for (const i of list) v.x += n.getX(i), v.y += n.getY(i), v.z += n.getZ(i);
    v.normalize();
    for (const i of list) n.setXYZ(i, v.x, v.y, v.z);
  }
  return geo;
}

// A surface swept through horizontal rings, bottom to top. Each ring is a
// superellipse { y, rx, rzf (front depth), rzb (back depth), n, cx, cz }.
// `arc` leaves a gap at the front (for open coats and hair); open shapes
// get no caps.
function loft(rings, N = 24, { arc = null, caps = true } = {}) {
  N = lite(N, 8);
  const pos = [], uv = [], idx = [];
  const R = rings.length;
  const a0 = arc ? arc[0] : 0, a1 = arc ? arc[1] : TAU;
  for (let i = 0; i < R; i++) {
    const r = rings[i];
    const e = 2 / (r.n || 2);
    for (let j = 0; j <= N; j++) {
      const a = a0 + ((a1 - a0) * j) / N;
      const s = Math.sin(a), c = Math.cos(a);
      const sx = Math.sign(s) * Math.pow(Math.abs(s), e);
      const sz = Math.sign(c) * Math.pow(Math.abs(c), e);
      const rz = c >= 0 ? (r.rzf ?? r.rz ?? r.rx) : (r.rzb ?? r.rz ?? r.rx);
      pos.push((r.cx || 0) + r.rx * sx, r.y, (r.cz || 0) + rz * sz);
      uv.push(j / N, i / (R - 1));
    }
  }
  for (let i = 0; i < R - 1; i++) {
    for (let j = 0; j < N; j++) {
      const a = i * (N + 1) + j, b = a + N + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  if (caps && !arc) {
    for (const [ri, up] of [[0, false], [R - 1, true]]) {
      const r = rings[ri];
      const c = pos.length / 3;
      pos.push(r.cx || 0, r.y, r.cz || 0);
      uv.push(0.5, up ? 1 : 0);
      const base = ri * (N + 1);
      for (let j = 0; j < N; j++) {
        if (up) idx.push(c, base + j, base + j + 1);
        else idx.push(c, base + j + 1, base + j);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return smoothSeams(g);
}

// A limb hanging down from its joint: length `len`, radius r(t) for t from
// 0 (joint) to 1 (end), rounded at both ends. `depth` squashes it
// front-to-back.
function limb(len, r, { depth = 1, N = 18, steps = 10, cz = 0 } = {}) {
  steps = lite(steps, 3);
  const rings = [];
  const r0 = r(0), r1 = r(1);
  for (let k = 4; k >= 1; k--) {            // bottom cap
    const phi = (k / 4) * (Math.PI / 2);
    rings.push({ y: -len - Math.sin(phi) * r1 * 0.8, rx: Math.cos(phi) * r1 + 1e-4, rz: (Math.cos(phi) * r1 + 1e-4) * depth, cz });
  }
  for (let i = steps; i >= 0; i--) {
    const t = i / steps, rr = r(t);
    rings.push({ y: -t * len, rx: rr, rz: rr * depth, cz });
  }
  for (let k = 1; k <= 4; k++) {            // top cap
    const phi = (k / 4) * (Math.PI / 2);
    rings.push({ y: Math.sin(phi) * r0 * 0.8, rx: Math.cos(phi) * r0 + 1e-4, rz: (Math.cos(phi) * r0 + 1e-4) * depth, cz });
  }
  return loft(rings, N);
}

const taper = (a, b, bulge = 0, at = 0.3) => (t) => a + (b - a) * t + bulge * Math.sin(Math.PI * Math.min(1, t / (2 * at)));

// Crowds use a lighter build of the same bodies: fewer segments, no
// fingers, no eyelids. LITE is on while one of those is being built.
let LITE = false;
const lite = (n, min = 6) => (LITE ? Math.max(min, Math.round(n * 0.42)) : n);

const geoCache = new Map();
const cached = (key, make) => {
  const k = LITE ? `L:${key}` : key;
  if (!geoCache.has(k)) geoCache.set(k, make());
  return geoCache.get(k);
};

// ------------------------------------------------------------------ head --
// A sphere pushed and pulled into a head: jaw, chin, brow, eye sockets,
// cheekbones, nose and lips. Vertex colours tint the lips and cheeks.
// Head-local metres, centre of the skull at the origin, crown at +ry.
const HEAD = { rx: 0.074, ry: 0.112, rz: 0.095 };
const LID_OPEN = -1.85, LID_SHUT = 0.35;

function sculpt(ux, uy, uz, v) {
  let x = ux * HEAD.rx * v.w, y = uy * HEAD.ry, z = uz * HEAD.rz;
  const front = smoothstep(0.15, 0.85, uz);
  const ax = Math.abs(x);
  // narrower jaw, skull tucks in at the back of the neck
  x *= 1 - v.jaw * smoothstep(0.015, -0.1, y);
  if (uz < 0) z *= 1 - 0.3 * smoothstep(-0.03, -0.11, y) * smoothstep(0, -0.7, uz);
  // rounder back of the skull, flatter cheeks at the sides
  z -= 0.009 * gauss((y - 0.03) / 0.05) * smoothstep(-0.3, -0.9, uz);
  x *= 1 - 0.05 * gauss((y + 0.03) / 0.04) * smoothstep(0.2, 0.8, uz);
  // chin
  z += v.chin * gauss((y + 0.096) / 0.018) * gauss(x / 0.024) * front;
  y -= 0.006 * gauss(x / 0.03) * smoothstep(-0.07, -0.11, y) * front;
  // brow ridge and eye sockets
  z += v.brow * gauss((y - 0.024) / 0.011) * smoothstep(0.066, 0.012, ax) * front;
  z -= 0.0075 * gauss((ax - 0.03) / 0.0135) * gauss((y - 0.003) / 0.0125) * front;
  // cheekbones
  const cheek = gauss((ax - 0.046) / 0.016) * gauss((y + 0.017) / 0.016) * front;
  z += 0.0035 * cheek;
  // nose: bridge between the eyes down to the tip, then tucked under
  const fz = smoothstep(0.7, 0.97, uz);
  let prof = 0;
  if (y < 0.016 && y > -0.054) {
    prof = y > -0.042 ? 0.003 + (0.016 - y) / 0.058 * 0.019 : 0.022 * (1 - (-0.042 - y) / 0.012);
  }
  const nw = 0.0075 + Math.max(0, 0.016 - y) * 0.11;
  z += v.nose * prof * gauss(x / nw) * fz;
  // nostril wings
  z += 0.0055 * gauss((ax - 0.0125) / 0.006) * gauss((y + 0.047) / 0.006) * fz;
  // lips and the line of the mouth
  const lipU = gauss((y + 0.066) / 0.0048) * gauss(x / (0.016 * v.mouth));
  const lipL = gauss((y + 0.078) / 0.0052) * gauss(x / (0.014 * v.mouth));
  z += (0.0048 * lipU + 0.0044 * lipL) * front;
  z -= 0.0022 * gauss((y + 0.0715) / 0.0018) * gauss(x / (0.021 * v.mouth)) * front;
  z += 0.003 * gauss((y + 0.062) / 0.01) * gauss(x / 0.012) * front; // philtrum
  return { x, y, z, lip: Math.min(1, (lipU + lipL) * 1.1) * front, cheek: gauss((ax - 0.042) / 0.018) * gauss((y + 0.03) / 0.018) * front };
}

function headGeo(v, lo = false) {
  lo = lo || LITE;
  return cached(`head:${lo}:${JSON.stringify(v)}`, () => {
    const g = LITE ? new THREE.SphereGeometry(1, 24, 16) : lo ? new THREE.SphereGeometry(1, 40, 28) : new THREE.SphereGeometry(1, 96, 64);
    const p = g.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const s = sculpt(p.getX(i), p.getY(i), p.getZ(i), v);
      p.setXYZ(i, s.x, s.y, s.z);
      // lips a deeper rose, cheeks a touch warmer
      const r = 1 - s.lip * 0.14 - s.cheek * 0.0, gg = 1 - s.lip * 0.42 - s.cheek * 0.08, b = 1 - s.lip * 0.38 - s.cheek * 0.08;
      col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return smoothSeams(g);
  });
}

// where the surface of the head is, straight in front of (x, y)
function faceZ(x, y, v) {
  const uy = Math.max(-0.99, Math.min(0.99, y / HEAD.ry));
  const ux = Math.max(-0.99, Math.min(0.99, x / (HEAD.rx * v.w)));
  const uz = Math.sqrt(Math.max(0, 1 - ux * ux - uy * uy));
  return sculpt(ux, uy, uz, v).z;
}

// Hair: a shell over the scalp (the same sculpted head pushed outwards)
// cut to a hairline, thicker on top.
function hairGeo(style, v) {
  return cached(`hair:${style}:${JSON.stringify(v)}`, () => {
    const S = HAIR_STYLES[style];
    const g = LITE ? new THREE.SphereGeometry(1, 28, 18) : new THREE.SphereGeometry(1, 80, 56);
    const p = g.attributes.position;
    const mask = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) {
      const ux = p.getX(i), uy = p.getY(i), uz = p.getZ(i);
      const az = Math.atan2(ux, uz);
      const line = S.line[0] + S.line[1] * Math.cos(az) + S.line[2] * Math.cos(2 * az);
      let m = smoothstep(line - 0.05, line + 0.12, uy);
      if (S.bald) m *= 1 - smoothstep(S.bald - 0.12, S.bald + 0.05, uy * 0.75 + uz * 0.45);
      mask[i] = m;
      const s = sculpt(ux, uy, uz, { ...v, nose: 0, chin: 0 });
      // where m is 0 the shell sinks 3 mm under the skin, so the hairline is
      // the smooth curve where the two surfaces cross
      const side = S.sides ?? 0.65;
      let t = -0.003 + m * (0.0035 + (S.base + S.top * smoothstep(0.1, 0.95, uy) + S.back * smoothstep(0.2, -0.8, uz)) * (1 - side * Math.abs(ux) * smoothstep(0.7, 0.0, uy)));
      if (S.curl) t += m * S.curl * (0.5 + 0.5 * Math.sin(ux * 41 + Math.sin(uy * 23) * 2) * Math.sin(uz * 37 + uy * 19));
      const len = Math.hypot(s.x, s.y, s.z);
      const k = (len + t) / len;
      p.setXYZ(i, s.x * k, s.y * k, s.z * k);
    }
    const src = g.index.array, idx = [];
    for (let i = 0; i < src.length; i += 3) {
      if (Math.max(mask[src[i]], mask[src[i + 1]], mask[src[i + 2]]) > 0.02) idx.push(src[i], src[i + 1], src[i + 2]);
    }
    g.setIndex(idx);
    return smoothSeams(g);
  });
}

// line: hairline height (sphere y) = l0 + l1 cos(azimuth) + l2 cos(2 azimuth)
const HAIR_STYLES = {
  short: { line: [0.1, 0.52, 0.02], base: 0.004, top: 0.011, back: 0.002 },
  buzz: { line: [0.05, 0.55, -0.03], base: 0.0025, top: 0.002, back: 0 },
  slick: { line: [0.04, 0.6, -0.02], base: 0.002, top: 0.004, back: 0.003, sides: 0.4 },
  curly: { line: [0.06, 0.52, 0.0], base: 0.009, top: 0.018, back: 0.003, curl: 0.007, sides: 0.5 },
  long: { line: [-0.06, 0.66, -0.1], base: 0.007, top: 0.009, back: 0.006, sides: 0.2 },
  pony: { line: [0.02, 0.62, -0.04], base: 0.004, top: 0.006, back: 0.002, sides: 0.3 },
  bun: { line: [0.02, 0.62, -0.04], base: 0.004, top: 0.006, back: 0.002, sides: 0.3 },
  balding: { line: [0.0, 0.42, -0.1], base: 0.004, top: 0.0, back: 0.003, bald: 0.55 },
};

// ------------------------------------------------------------- materials --
const matCache = new Map();
function mat(color, o = {}) {
  const key = JSON.stringify([color, o.rough, o.metal, o.sheen, o.vc, o.emissive, o.side, o.map && o.map.uuid, o.bump && o.bump.uuid]);
  if (!matCache.has(key)) {
    const params = {
      color, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0, vertexColors: !!o.vc,
      emissive: o.emissive ?? 0x000000, side: o.side ?? THREE.FrontSide,
    };
    if (o.map) params.map = o.map;
    if (o.bump) { params.bumpMap = o.bump; params.bumpScale = o.bumpScale ?? 1; }
    // plain standard materials throughout: cloth "sheen" looked nice but
    // cost a second lighting pass on every pixel of everyone's clothes
    const m = new THREE.MeshStandardMaterial(params);
    if (o.offset) { m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2; }
    matCache.set(key, m);
  }
  return matCache.get(key);
}

// fine noise used as a bump map so fabric doesn't look like plastic
let weaveTex = null, denimTex = null, hairTex = null, skinTex = null;
function noiseCanvas(size, paint) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  paint(x, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function weave() {
  if (!weaveTex) {
    weaveTex = noiseCanvas(128, (x, S) => {
      const img = x.createImageData(S, S);
      for (let i = 0; i < S * S; i++) {
        const px = i % S, py = (i / S) | 0;
        const v = 128 + 40 * Math.sin(px * 1.6) * Math.sin(py * 1.6) + (Math.random() - 0.5) * 50;
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = 255;
      }
      x.putImageData(img, 0, 0);
    });
    weaveTex.repeat.set(6, 6);
  }
  return weaveTex;
}
function denim() {
  if (!denimTex) {
    denimTex = noiseCanvas(128, (x, S) => {
      const img = x.createImageData(S, S);
      for (let i = 0; i < S * S; i++) {
        const px = i % S, py = (i / S) | 0;
        const v = 170 + 50 * Math.sin((px + py) * 1.9) + (Math.random() - 0.5) * 70;
        img.data[i * 4] = v * 0.95; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = Math.min(255, v * 1.08);
        img.data[i * 4 + 3] = 255;
      }
      x.putImageData(img, 0, 0);
    });
    denimTex.colorSpace = THREE.SRGBColorSpace;
    denimTex.repeat.set(5, 5);
  }
  return denimTex;
}
function hairStrands() {
  if (!hairTex) {
    hairTex = noiseCanvas(256, (x, S) => {
      x.fillStyle = '#c8c8c8';
      x.fillRect(0, 0, S, S);
      for (let k = 0; k < 1400; k++) {
        const px = Math.random() * S, l = 20 + Math.random() * 60;
        x.strokeStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '40,40,40'},${0.15 + Math.random() * 0.25})`;
        x.lineWidth = 0.6 + Math.random();
        x.beginPath();
        x.moveTo(px, Math.random() * S);
        x.lineTo(px + (Math.random() - 0.5) * 6, Math.random() * S + l);
        x.stroke();
      }
    });
    hairTex.colorSpace = THREE.SRGBColorSpace;
    hairTex.repeat.set(2, 1);
  }
  return hairTex;
}
function skinPores() {
  if (!skinTex) {
    skinTex = noiseCanvas(128, (x, S) => {
      const img = x.createImageData(S, S);
      for (let i = 0; i < S * S; i++) {
        const v = 128 + (Math.random() - 0.5) * 30;
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = 255;
      }
      x.putImageData(img, 0, 0);
    });
    skinTex.repeat.set(8, 8);
  }
  return skinTex;
}

const eyeMats = new Map();
function eyeMat(iris, glint = false) {
  const key = `${iris}:${glint}`;
  if (!eyeMats.has(key)) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#efe9e4';
    x.fillRect(0, 0, 256, 128);
    // sclera gets faintly pink towards the corners
    const sg = x.createRadialGradient(64, 64, 10, 64, 64, 90);
    sg.addColorStop(0, 'rgba(255,255,255,0)');
    sg.addColorStop(1, 'rgba(200,120,110,0.35)');
    x.fillStyle = sg;
    x.fillRect(0, 0, 256, 128);
    // iris at u = 0.25 (the sphere's +z), v = 0.5
    const col = new THREE.Color(iris);
    const ig = x.createRadialGradient(64, 64, 2, 64, 64, 24);
    ig.addColorStop(0, `#${col.clone().multiplyScalar(0.5).getHexString()}`);
    ig.addColorStop(0.7, `#${col.getHexString()}`);
    ig.addColorStop(1, `#${col.clone().multiplyScalar(0.35).getHexString()}`);
    x.fillStyle = ig;
    x.beginPath(); x.ellipse(64, 64, 22, 40, 0, 0, TAU); x.fill();
    x.fillStyle = '#060606';
    x.beginPath(); x.ellipse(64, 64, glint ? 6 : 9, glint ? 30 : 17, 0, 0, TAU); x.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.06 });
    if (glint) { m.emissive = new THREE.Color(0x401010); m.emissiveMap = t; m.emissiveIntensity = 1.2; }
    eyeMats.set(key, m);
  }
  return eyeMats.get(key);
}

// ----------------------------------------------------------------- looks --
// Skin tones, hair, clothes. `top` and `bottom` pick the garments below.
export const LOOKS = {
  // the four of you, in player-colour order (Franklin first: white tee,
  // dark jeans, clean sneakers)
  friend0: { sex: 'm', skin: 0x6a4430, iris: 0x1e140c, hair: 'buzz', hairColor: 0x0e0a08, top: 'tee', topColor: 0xeeeeea, bottom: 'jeans', bottomColor: 0x2a3448, shoes: 'sneaker', shoeColor: 0xf2f2ee, height: 1.8 },
  friend1: { sex: 'f', skin: 0x8a5638, iris: 0x2d1d12, hair: 'bun', hairColor: 0x120c09, top: 'bomber', topColor: 0x4a5a3a, inner: 0x1e1e1e, bottom: 'jeans', bottomColor: 0x1a1c22, shoes: 'sneaker', shoeColor: 0xe8e8e2, height: 1.67 },
  friend2: { sex: 'm', skin: 0xb77a52, iris: 0x3b2817, hair: 'buzz', hairColor: 0x15100c, top: 'hoodie', topColor: 0x5a5a62, bottom: 'jeans', bottomColor: 0x2a3448, shoes: 'sneaker', shoeColor: 0x1a1a1a, height: 1.84 },
  friend3: { sex: 'f', skin: 0xf0c8a6, iris: 0x45708a, hair: 'pony', hairColor: 0x9a4a2a, top: 'jacket', topColor: 0x5a7fa8, bottom: 'trousers', bottomColor: 0x141416, shoes: 'boot', shoeColor: 0x141414, height: 1.64 },
  // Lamar: tall, loud, an orange hoodie and a cap, never still
  lamar: { sex: 'm', skin: 0x5a3a28, iris: 0x1e140c, hair: 'buzz', hairColor: 0x120c09, hat: 'cap', hatColor: 0x1a1a1a, top: 'hoodie', topColor: 0xc8741a, bottom: 'jeans', bottomColor: 0x2a3448, shoes: 'sneaker', shoeColor: 0xf2f2ee, height: 1.9 },
  // Simeon, who sells cars: a shiny suit, a moustache, a big smile
  simeon: { sex: 'm', skin: 0xc8a07a, iris: 0x2a1a10, hair: 'balding', hairColor: 0x2a2420, mustache: true, top: 'suit', topColor: 0x3a3a42, inner: 0xe8e8e2, tie: 0x8a1a2a, bottom: 'trousers', bottomColor: 0x2a2c30, shoes: 'dress', shoeColor: 0x0e0e0e, height: 1.72, heavy: 1.1 },
  // Michael, retired: slicked-back hair, a good suit and no tie
  michael: { sex: 'm', skin: 0xe0b090, iris: 0x3a4a5a, hair: 'slick', hairColor: 0x3a2a1a, top: 'suit', topColor: 0x2a2c34, inner: 0xa8c0d8, bottom: 'trousers', bottomColor: 0x2a2c34, shoes: 'dress', shoeColor: 0x2a1a10, height: 1.83, heavy: 1.06 },
  // Trevor: thinning hair, a stained T-shirt, work boots
  trevor: { sex: 'm', skin: 0xe0b898, iris: 0x4a3a2a, hair: 'balding', hairColor: 0x5a4a3a, top: 'tee', topColor: 0xc8c0a4, bottom: 'jeans', bottomColor: 0x3a4a5a, shoes: 'boot', shoeColor: 0x3a2a1a, height: 1.82, heavy: 1.04 },
  // Lester: glasses, a cap, a cardigan
  lester: { sex: 'm', skin: 0xe8c8a8, iris: 0x4a5a3a, hair: 'short', hairColor: 0x6a5a4a, glasses: true, hat: 'cap', hatColor: 0x3a4a3a, top: 'sweater', topColor: 0x5a6a4a, bottom: 'trousers', bottomColor: 0x8a7a5a, shoes: 'dress', shoeColor: 0x3a2a1a, height: 1.7 },
  // Stretch: very tall, Ballas purple
  stretch: { sex: 'm', skin: 0x4a3020, iris: 0x1a100a, hair: 'buzz', hairColor: 0x0e0a08, top: 'hoodie', topColor: 0x4a1a6a, bottom: 'jeans', bottomColor: 0x1a1c22, shoes: 'sneaker', shoeColor: 0x1a1a1a, height: 1.96 },
};
export const FRIEND_LOOKS = ['friend0', 'friend1', 'friend2', 'friend3'];

// ------------------------------------------------------------------ build --
function joint(parent, x, y, z = 0) {
  const j = new THREE.Group();
  j.position.set(x, y, z);
  parent.add(j);
  return j;
}

function add(parent, geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  // fingers, eyes and lids are far smaller than a shadow-map texel
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  m.castShadow = geo.boundingSphere.radius > 0.035;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

const sphere = (r, w = 20, h = 14) => cached(`sph:${r}:${w}`, () => new THREE.SphereGeometry(r, lite(w, 6), lite(h, 4)));

// torso and pelvis shapes for a body type
function bodyShape(L) {
  const f = L.sex === 'f', k = L.thin || 1, hv = L.heavy || 1;
  return {
    hipW: (f ? 0.178 : 0.168) * hv,
    waistW: (f ? 0.126 : 0.144) * k * hv,
    chestW: (f ? 0.142 : 0.158) * k * (hv > 1 ? 1.05 : 1),
    shoulderX: f ? 0.18 : 0.2 * (k < 1 ? 0.98 : 1),
    belly: hv > 1 ? 0.03 : 0,
    bust: f ? 0.022 : 0.006,
  };
}

// Builds a person from a look (a key of LOOKS or a look object).
export function makePerson(lookKey, { lite: light = false } = {}) {
  const was = LITE;
  LITE = light;
  try { return buildPerson(lookKey); } finally { LITE = was; }
}

function buildPerson(lookKey) {
  const L = typeof lookKey === 'string' ? LOOKS[lookKey] : lookKey;
  const B = bodyShape(L);
  const root = new THREE.Group();
  const body = new THREE.Group();            // pivots at the feet
  root.add(body);
  const pelvis = joint(body, 0, 0.95);
  const spine = joint(pelvis, 0, 0.1);       // y 1.05
  const chest = joint(spine, 0, 0.2);        // y 1.25
  const neck = joint(chest, 0, 0.23);        // y 1.48
  const head = joint(neck, 0, 0.065);        // y 1.545, skull centre ~0.1 above

  const plastic = L.plastic ? mat(L.skin, { rough: 0.3, metal: 0.02 }) : null;
  const skin = plastic || mat(L.skin, { rough: 0.52, vc: false, bump: skinPores(), bumpScale: 0.3 });
  const headSkin = plastic || mat(L.skin, { rough: 0.5, vc: true, bump: skinPores(), bumpScale: 0.3 });
  const cloth = (c, o = {}) => mat(c, { rough: 0.9, sheen: 0.6, bump: weave(), bumpScale: 0.6, ...o });
  const top = L.top;
  const topM = L.bare ? plastic : top === 'jacket' && L.topColor === 0x5a7fa8 ? mat(0xffffff, { rough: 0.85, map: denim(), bump: weave(), bumpScale: 0.8, sheen: 0.4 })
    : top === 'jacket' || top === 'bomber' || top === 'coat' ? cloth(L.topColor, { rough: 0.7, sheen: 0.3 })
      : cloth(L.topColor);
  if (top === 'jacket' && L.topColor === 0x5a7fa8) topM.color.set(0x8aaad0);
  const botM = L.bare ? plastic : L.bottom === 'jeans' ? mat(L.bottomColor, { rough: 0.85, map: denim(), bump: weave(), bumpScale: 0.8, sheen: 0.3 }) : cloth(L.bottomColor);
  const innerM = cloth(L.inner ?? 0xeeeeee);
  const handM = L.gloves != null ? mat(L.gloves, { rough: 0.35, metal: 0.05 }) : skin;
  const legSkin = L.bare ? plastic : L.legs != null ? mat(L.legs, { rough: L.bottom === 'skirt' ? 0.55 : 0.5, sheen: L.bottom === 'skirt' ? 0.3 : 0 }) : skin;
  const shoeM = L.bare ? plastic : mat(L.shoeColor, { rough: L.shoes === 'dress' ? 0.25 : 0.6, metal: 0 });
  const soleM = L.bare ? plastic : mat(L.shoes === 'sneaker' ? 0xf2f2ee : 0x141210, { rough: 0.7 });
  const sexF = L.sex === 'f';

  // ------------------------------------------------------------- pelvis
  const pantsRings = [
    { y: -0.13, rx: 0.06, rzf: 0.05, rzb: 0.06, n: 2.2 },
    { y: -0.1, rx: B.hipW * 0.82, rzf: 0.085, rzb: 0.1, n: 2.4 },
    { y: -0.04, rx: B.hipW, rzf: 0.1, rzb: 0.118 + (sexF ? 0.01 : 0), n: 2.5 },
    { y: 0.03, rx: B.hipW * 0.98, rzf: 0.1 + B.belly * 0.5, rzb: 0.11, n: 2.5 },
    { y: 0.1, rx: (B.hipW + B.waistW) / 2, rzf: 0.096 + B.belly, rzb: 0.095, n: 2.4 },
    { y: 0.16, rx: B.waistW * 1.02, rzf: 0.092 + B.belly, rzb: 0.088, n: 2.3 },
  ];
  add(pelvis, cached(`pants:${JSON.stringify(B)}`, () => loft(pantsRings, 28)), L.bottom === 'skirt' || L.bottom === 'longskirt' ? botM : botM);
  if ((L.bottom === 'jeans' || L.bottom === 'trousers') && (L.top === 'suit' || L.top === 'workshirt')) {
    // belt over a tucked-in shirt
    add(pelvis, cached(`belt:${B.waistW}:${B.belly}`, () => loft([
      { y: 0.125, rx: B.waistW * 1.04 + 0.004, rzf: 0.094 + B.belly + 0.004, rzb: 0.094, n: 2.3 },
      { y: 0.16, rx: B.waistW * 1.04 + 0.004, rzf: 0.094 + B.belly + 0.004, rzb: 0.094, n: 2.3 },
    ], 28)), mat(0x2a1d14, { rough: 0.45 }));
    add(pelvis, sphere(0.012, 10, 8), mat(0xb8a878, { rough: 0.3, metal: 0.8 }), 0, 0.142, 0.098 + B.belly + 0.002).scale.set(1.4, 1, 0.4);
  }

  // ------------------------------------------------------------- torso
  // untucked tops hang over the hips; tucked ones start inside the waistband
  const tucked = top === 'uniform' || top === 'suit' || top === 'workshirt';
  const T = {
    shirt: [
      ...(tucked ? [
        { y: 0.0, rx: B.waistW * 0.98, rzf: 0.09 + B.belly, rzb: 0.086, n: 2.3 },
      ] : [
        { y: -0.095, rx: B.hipW * 1.035, rzf: 0.106 + B.belly, rzb: 0.125, n: 2.4 },
        { y: -0.03, rx: B.hipW * 1.0, rzf: 0.104 + B.belly, rzb: 0.112, n: 2.4 },
        { y: 0.03, rx: B.waistW * 1.09, rzf: 0.1 + B.belly, rzb: 0.098, n: 2.3 },
      ]),
      { y: 0.1, rx: (B.waistW + B.chestW) / 2 * 1.02, rzf: 0.1 + B.belly * 0.6, rzb: 0.092, n: 2.4 },
      { y: 0.2, rx: B.chestW, rzf: 0.108 + B.bust * 0.6, rzb: 0.095, n: 2.5 },
      { y: 0.27, rx: B.chestW * 1.02, rzf: 0.112 + B.bust, rzb: 0.098, n: 2.4 },
      { y: 0.33, rx: B.chestW * 1.04, rzf: 0.104 + B.bust * 0.4, rzb: 0.097, n: 2.5 },
      { y: 0.375, rx: B.shoulderX * 0.93, rzf: 0.085, rzb: 0.088, n: 2.5 },
      { y: 0.405, rx: B.shoulderX * 0.74, rzf: 0.075, rzb: 0.08, n: 2.3 },
      { y: 0.435, rx: B.shoulderX * 0.48, rzf: 0.064, rzb: 0.07, n: 2.1 },
      { y: 0.46, rx: 0.068, rzf: 0.056, rzb: 0.06, n: 2 },
      { y: 0.47, rx: 0.058, rzf: 0.05, rzb: 0.054, n: 2 },
    ],
  };
  const baggy = top === 'hoodie' || top === 'sweater' ? 1.05 : top === 'coat' || top === 'bomber' ? 1.08 : 1;
  const shirtRings = T.shirt.map((r) => ({ ...r, rx: r.rx * baggy, rzf: r.rzf * baggy, rzb: r.rzb * baggy }));
  add(spine, cached(`shirt:${JSON.stringify(shirtRings)}`, () => loft(shirtRings, 32)), topM, 0, 0, 0);
  // neck
  add(chest, cached('neck', () => limb(0.15, taper(0.056, 0.06), { depth: 0.92 })), skin, 0, 0.33, 0.0);

  // garment details
  const front = (y) => {
    // the front of the torso at height y (spine space), for things worn on it
    let r = shirtRings[0];
    for (const q of shirtRings) if (q.y <= y) r = q;
    return r.rzf;
  };
  if (top === 'hoodie') {
    // hood bunched behind the neck, kangaroo pocket, drawstrings
    add(chest, cached('hood', () => loft([
      { y: 0.2, rx: 0.07, rzf: 0.05, rzb: 0.07, n: 2 },
      { y: 0.235, rx: 0.115, rzf: 0.075, rzb: 0.125, n: 2.2 },
      { y: 0.28, rx: 0.11, rzf: 0.07, rzb: 0.135, n: 2.2 },
      { y: 0.32, rx: 0.075, rzf: 0.05, rzb: 0.1, n: 2 },
    ], 28, { arc: [0.9, TAU - 0.9] })), cloth(L.topColor, { side: THREE.DoubleSide }), 0, 0, -0.01);
    add(spine, cached(`pocket:${B.hipW}:${B.waistW}`, () => loft(shirtRings.filter((r) => r.y > -0.04 && r.y < 0.14).map((r) => ({ ...r, rzf: r.rzf + 0.005, rzb: 0 })), 14, { arc: [-0.62, 0.62] })), cloth(L.topColor, { side: THREE.DoubleSide }));
    for (const s of [-1, 1]) {
      const d = add(chest, cached('string', () => new THREE.CylinderGeometry(0.003, 0.003, 0.15, 6)), mat(0xeeeeee, { rough: 0.8 }), s * 0.03, 0.12, front(0.33) * baggy + 0.002);
      d.rotation.x = 0.1;
    }
  } else if (top === 'jacket' || top === 'bomber' || top === 'cardigan' || top === 'suit' || top === 'coat') {
    // open front: the shirt underneath shows in a strip down the middle
    const strip = add(spine, cached(`strip:${baggy}:${B.bust}`, () => loft(shirtRings.slice(0, 8).map((r) => ({ ...r, rx: r.rx * 0.3, rzf: r.rzf + 0.0035, rzb: 0.0 })), 12, { arc: [-0.5, 0.5] })), innerM);
    strip
    // collar
    const collar = add(chest, cached(`collar:${top}`, () => loft([
      { y: 0.225, rx: 0.075, rzf: 0.064, rzb: 0.068 },
      { y: 0.265, rx: top === 'coat' ? 0.088 : 0.078, rzf: 0.07, rzb: top === 'coat' ? 0.08 : 0.072 },
      { y: top === 'coat' ? 0.33 : 0.29, rx: top === 'coat' ? 0.088 : 0.074, rzf: 0.068, rzb: top === 'coat' ? 0.078 : 0.068 },
    ], 26, { arc: [0.55, TAU - 0.55] })), cloth(L.topColor, { side: THREE.DoubleSide, rough: 0.75 }), 0, 0, -0.005);
    collar
    if (top === 'suit' && L.tie) {
      const tie = add(spine, cached('tie', () => loft([
        { y: 0.05, rx: 0.001, rzf: 0.002, rzb: 0.0 },
        { y: 0.07, rx: 0.022, rzf: 0.004, rzb: 0.0 },
        { y: 0.38, rx: 0.012, rzf: 0.004, rzb: 0.0 },
        { y: 0.42, rx: 0.014, rzf: 0.006, rzb: 0.0 },
      ], 10, { arc: [-1.4, 1.4] })), mat(L.tie, { rough: 0.5, sheen: 0.5 }), 0, 0, front(0.25) + 0.004);
      tie
    }
    // buttons down one side
    const btn = mat(top === 'coat' ? 0x0a0a0a : 0x30302c, { rough: 0.3, metal: 0.4 });
    const side = top === 'coat' ? 0.05 : 0.038;
    for (let i = 0; i < (top === 'coat' ? 3 : 4); i++) {
      const y = 0.04 + i * 0.08;
      add(spine, sphere(0.0065, 8, 6), btn, side, y, front(y) * baggy + 0.002).scale.z = 0.4;
      if (top === 'coat') add(spine, sphere(0.0065, 8, 6), btn, -side, y, front(y) * baggy + 0.002).scale.z = 0.4;
    }
  } else if (top === 'sweater' || top === 'tee' || top === 'uniform' || top === 'workshirt') {
    const neckband = add(chest, cached('crew', () => new THREE.TorusGeometry(0.06, 0.01, 8, 24)), cloth(L.topColor), 0, 0.262, 0.004);
    neckband.rotation.x = Math.PI / 2 - 0.25;
    neckband.scale.set(1.05, 0.95, 1);
  }
  if (top === 'uniform' && L.bare) {
    // (nothing: bare plastic)
  } else if (top === 'uniform') {
    // badge, shoulder radio, name bar, duty belt
    add(chest, cached('badge', () => new THREE.CylinderGeometry(0.018, 0.018, 0.004, 6)), mat(0xd8b44a, { rough: 0.25, metal: 0.9 }), -0.07, 0.06, front(0.27) + 0.004).rotation.x = Math.PI / 2;
    add(chest, cached('nameBar', () => new THREE.BoxGeometry(0.05, 0.012, 0.004)), mat(0xd8d0b0, { rough: 0.3, metal: 0.7 }), 0.07, 0.06, front(0.27) + 0.003);
    const radio = add(chest, cached('radio', () => new THREE.CapsuleGeometry(0.014, 0.04, 4, 8)), mat(0x111111, { rough: 0.5 }), -0.11, 0.15, 0.06);
    radio.rotation.z = 0.3;
    add(pelvis, cached(`duty:${B.waistW}`, () => loft([
      { y: 0.1, rx: B.waistW * 1.12, rzf: 0.105 + B.belly, rzb: 0.1, n: 2.3 },
      { y: 0.15, rx: B.waistW * 1.12, rzf: 0.105 + B.belly, rzb: 0.1, n: 2.3 },
    ], 28)), mat(0x0c0c0c, { rough: 0.35 }))
    for (const [x, z] of [[0.14, 0.04], [-0.14, 0.04], [0.1, -0.08]]) add(pelvis, sphere(0.025, 10, 8), mat(0x0e0e0e, { rough: 0.4 }), x * (B.waistW / 0.148), 0.12, z).scale.set(0.8, 1.2, 0.7);
  }
  if (top === 'workshirt') {
    const patch = add(chest, sphere(1, 16, 8), mat(0xf2efe6, { rough: 0.8 }), 0.075, 0.07, front(0.27) - 0.003);
    patch.scale.set(0.03, 0.015, 0.006);
  }

  // coat skirt down to the knees, split at the front
  if (top === 'coat') {
    const coatSkirt = add(pelvis, cached('coatSkirt', () => loft([
      { y: -0.5, rx: 0.25, rzf: 0.17, rzb: 0.19, n: 2.2 },
      { y: -0.3, rx: 0.225, rzf: 0.15, rzb: 0.165, n: 2.3 },
      { y: -0.1, rx: 0.2, rzf: 0.13, rzb: 0.145, n: 2.4 },
      { y: 0.06, rx: B.hipW * 1.08, rzf: 0.12, rzb: 0.13, n: 2.4 },
      { y: 0.14, rx: B.waistW * 1.12, rzf: 0.11, rzb: 0.1, n: 2.3 },
    ], 32, { arc: [0.16, TAU - 0.16] })), cloth(L.topColor, { side: THREE.DoubleSide, rough: 0.7, sheen: 0.3 }));
    coatSkirt.userData.anim = true;
    root.userData.skirt = coatSkirt;
  }
  if (L.bottom === 'skirt' || L.bottom === 'longskirt') {
    const long = L.bottom === 'longskirt';
    const skirt = add(pelvis, cached(`skirt:${long}:${B.hipW}`, () => loft([
      { y: long ? -0.62 : -0.38, rx: long ? 0.25 : 0.24, rzf: long ? 0.21 : 0.19, rzb: long ? 0.22 : 0.2, n: 2.1 },
      { y: long ? -0.3 : -0.2, rx: B.hipW * 1.22, rzf: 0.15, rzb: 0.16, n: 2.2 },
      { y: -0.04, rx: B.hipW * 1.05, rzf: 0.105, rzb: 0.125, n: 2.4 },
      { y: 0.08, rx: (B.hipW + B.waistW) / 2 * 1.03, rzf: 0.1, rzb: 0.1, n: 2.3 },
      { y: 0.16, rx: B.waistW * 1.05, rzf: 0.095, rzb: 0.092, n: 2.3 },
    ], 32, { arc: [0, TAU], caps: false })), cloth(L.bottomColor, { side: THREE.DoubleSide }));
    skirt.userData.anim = true;   // folds up over the lap when sitting
    root.userData.skirt = skirt;
  }

  // ------------------------------------------------------------- legs
  const covered = L.bottom === 'jeans' || L.bottom === 'trousers';
  const thighM = covered ? botM : legSkin;
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = joint(pelvis, s * 0.088, -0.025);
    add(hip, cached(`thigh:${sexF}`, () => limb(0.43, taper(sexF ? 0.082 : 0.08, 0.052, 0.008, 0.25), { depth: 1.05 })), thighM);
    const knee = joint(hip, 0, -0.43);
    add(knee, cached(`shin:${covered}`, () => limb(0.42, taper(covered ? 0.054 : 0.05, covered ? 0.044 : 0.032, covered ? 0.002 : 0.009, 0.28), { depth: 1.04 })), covered ? botM : legSkin);
    if (covered) {
      // trouser cuff sits over the shoe
      add(knee, cached('cuff', () => limb(0.05, () => 0.046)), botM, 0, -0.36, 0)
    }
    const ankle = joint(knee, 0, -0.42 + 0.002);
    shoe(ankle, L, shoeM, soleM);
    legs.push({ hip, knee, ankle });
  }

  // ------------------------------------------------------------- arms
  const longSleeve = top !== 'tee' && top !== 'workshirt';
  const arms = [];
  for (const s of [-1, 1]) {
    const shoulderBall = add(chest, sphere(0.05, 18, 12), topM, s * (B.shoulderX - 0.016), 0.135, -0.005);
    shoulderBall.scale.set(1, 0.95, 1.05);
    const shoulder = joint(chest, s * B.shoulderX, 0.145, -0.005);
    const upperR = taper(sexF ? 0.043 : 0.048, sexF ? 0.034 : 0.038, 0.004, 0.3);
    add(shoulder, cached(`uarm:${sexF}:${baggy}`, () => limb(0.29, (t) => upperR(t) * (longSleeve ? (baggy + 1) / 2 * 1.03 : 1))), longSleeve ? topM : skin);
    if (!longSleeve) {
      // short sleeve over the top of the arm
      add(shoulder, cached(`ssleeve:${sexF}`, () => limb(0.13, (t) => upperR(t * 0.45) * 1.25)), topM)
    }
    const elbow = joint(shoulder, 0, -0.29);
    const foreR = taper(sexF ? 0.036 : 0.04, sexF ? 0.025 : 0.028, 0.004, 0.25);
    add(elbow, cached(`farm:${sexF}:${longSleeve}:${baggy}`, () => limb(0.25, (t) => foreR(t) * (longSleeve ? (baggy + 1) / 2 * 1.06 : 1))), longSleeve ? topM : skin);
    if (longSleeve) add(elbow, cached(`wrist:${sexF}`, () => limb(0.035, () => (sexF ? 0.023 : 0.026))), handM, 0, -0.23, 0);
    const wrist = joint(elbow, 0, -0.25);
    hand(wrist, s, handM, sexF);
    arms.push({ shoulder, elbow, wrist });
  }

  // ------------------------------------------------------------- head
  const fv = { w: sexF ? 0.97 : 1, jaw: sexF ? 0.15 : 0.1, chin: sexF ? 0.005 : 0.007, nose: sexF ? 0.85 : 1, brow: sexF ? 0.003 : 0.005, mouth: 1, ...(L.face || {}) };
  if (L.plastic) Object.assign(fv, { nose: 0.55, mouth: 0.5, brow: 0.001, chin: 0.004 });
  if (L.old) fv.jaw = 0.12;
  const skull = joint(head, 0, 0.098, 0.012);
  add(skull, headGeo(fv, !!L.plastic), headSkin);
  // ears
  for (const s of [-1, 1]) {
    const ear = add(skull, cached('ear', () => {
      const g = new THREE.SphereGeometry(1, 16, 12);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        p.setX(i, p.getX(i) * (0.55 + 0.45 * (y + 1) / 2));
      }
      return smoothSeams(g);
    }), skin, s * HEAD.rx * fv.w * 0.97, -0.006, -0.008);
    ear.scale.set(0.009, 0.029, 0.019);
    ear.rotation.y = s * 0.35;
  }
  // eyes, lids and brows
  const eyes = [], lids = [];
  const eyeR = 0.0118;
  const eM = eyeMat(L.iris || 0x3a2a1a);
  const browM = mat(L.hairColor, { rough: 0.8 });
  for (const s of L.plastic || LITE ? [] : [-1, 1]) {
    const ex = s * 0.0305 * fv.w, ey = 0.003;
    const ez = faceZ(ex, ey, fv) - eyeR * 0.55;
    const eye = add(skull, sphere(eyeR, 24, 16), eM, ex, ey, ez);
    eye.castShadow = false;
    eye.userData.anim = true;
    eyes.push(eye);
    // upper lid: a shell that rolls down over the eye to blink
    const lidPivot = joint(skull, ex, ey, ez);
    const lid = add(lidPivot, cached('lid', () => new THREE.SphereGeometry(eyeR * 1.1, 20, 10, 0, TAU, 0, Math.PI * 0.5)), skin);
    lid.rotation.x = Math.PI / 2;  // dome faces forward
    lid.castShadow = false;
    lidPivot.rotation.x = LID_OPEN;
    lids.push(lidPivot);
    const brow = add(skull, cached('brow', () => new THREE.CapsuleGeometry(0.0035, 0.024, 3, 8)), browM, ex + s * 0.002, 0.0255, faceZ(ex, 0.0255, fv) + 0.003);
    brow.rotation.z = Math.PI / 2 + s * 0.12;
    brow.scale.set(1, 1, 0.55);
  }
  if (L.mustache) {
    const m = add(skull, cached('mustache', () => new THREE.CapsuleGeometry(0.006, 0.03, 4, 8)), mat(L.hairColor, { rough: 0.85 }), 0, -0.058, faceZ(0, -0.058, fv) + 0.007);
    m.rotation.z = Math.PI / 2;
    m.scale.set(1, 1, 0.7);
  }
  if (L.glasses) {
    const fr = mat(0x3a2a20, { rough: 0.3, metal: 0.3 });
    for (const s of [-1, 1]) {
      const rim = add(skull, cached('rim', () => new THREE.TorusGeometry(0.0165, 0.0018, 6, 20)), fr, s * 0.031, 0.002, faceZ(s * 0.031, 0.002, fv) + 0.012);
      rim.scale.y = 0.8;
      const arm = add(skull, cached('temple', () => new THREE.CylinderGeometry(0.0013, 0.0013, 0.095, 5)), fr, s * 0.066, 0.006, 0.035);
      arm.rotation.x = Math.PI / 2;
    }
    add(skull, cached('bridge', () => new THREE.CylinderGeometry(0.0013, 0.0013, 0.016, 5)), fr, 0, 0.007, faceZ(0, 0.007, fv) + 0.012).rotation.z = Math.PI / 2;
  }
  // hair
  if (L.hair) {
    const hm = mat(L.hairColor, { rough: L.hair === 'slick' ? 0.45 : 0.55, map: hairStrands(), offset: true });
    add(skull, hairGeo(L.hair, fv), hm);
    if (L.hair === 'long') {
      add(skull, cached('longHair', () => loft([
        { y: -0.2, rx: 0.1, rzf: 0.03, rzb: 0.075, n: 2 },
        { y: -0.12, rx: 0.098, rzf: 0.04, rzb: 0.09, n: 2 },
        { y: -0.04, rx: 0.088, rzf: 0.06, rzb: 0.1, n: 2 },
        { y: 0.04, rx: 0.084, rzf: 0.07, rzb: 0.104, n: 2 },
      ], 28, { arc: [0.95, TAU - 0.95] })), mat(L.hairColor, { rough: 0.55, map: hairStrands(), side: THREE.DoubleSide }), 0, 0, -0.005);
    }
    if (L.hair === 'pony') {
      const tail = joint(skull, 0, 0.035, -0.098);
      tail.rotation.x = 0.35;
      add(tail, cached('pony', () => limb(0.2, taper(0.024, 0.012, 0.01, 0.35), { depth: 0.8 })), hm);
      add(skull, sphere(0.012, 10, 8), mat(0x222222, { rough: 0.6 }), 0, 0.037, -0.1);
      root.userData.pony = tail;
    }
    if (L.hair === 'bun') add(skull, sphere(0.036, 18, 12), hm, 0, 0.05, -0.098);
  }
  if (L.hat === 'cap') {
    const hc = cloth(L.hatColor, { rough: 0.8 });
    const dome = add(skull, cached('capDome', () => new THREE.SphereGeometry(0.104, 28, 14, 0, TAU, 0, Math.PI * 0.5)), hc, 0, 0.035, -0.004);
    dome.scale.set(0.84, 1.0, 1.02);
    const brim = add(skull, cached('capBrim', () => new THREE.CylinderGeometry(0.175, 0.175, 0.006, 24, 1, false, -Math.PI * 0.5, Math.PI)), hc, 0, 0.036, 0);
    brim.scale.set(0.5, 1, 1);
    brim.rotation.x = 0.1;
  } else if (L.hat === 'police') {
    const hc = cloth(L.hatColor, { rough: 0.6 });
    add(skull, cached('polBand', () => new THREE.CylinderGeometry(0.085, 0.08, 0.05, 28)), hc, 0, 0.07, -0.004).scale.set(0.95, 1, 1.12);
    const top = add(skull, cached('polTop', () => new THREE.CylinderGeometry(0.11, 0.09, 0.03, 28)), hc, 0, 0.11, -0.004);
    top.scale.set(0.95, 1, 1.12);
    const brim = add(skull, cached('polBrim', () => new THREE.CylinderGeometry(0.07, 0.07, 0.005, 24, 1, false, -Math.PI * 0.5, Math.PI)), mat(0x050505, { rough: 0.15 }), 0, 0.05, 0.07);
    brim.rotation.x = 0.25;
    add(skull, cached('polBadge', () => new THREE.CylinderGeometry(0.012, 0.012, 0.004, 6)), mat(0xd8b44a, { rough: 0.25, metal: 0.9 }), 0, 0.085, 0.1).rotation.x = Math.PI / 2;
  }

  // ------------------------------------------------------------- props
  let prop = null;
  if (L.prop === 'pizza') {
    prop = new THREE.Group();
    const box = add(prop, cached('pizzaBox', () => new THREE.BoxGeometry(0.36, 0.05, 0.36)), mat(0xd8c49a, { rough: 0.9 }));
    box.position.set(0, 0, 0);
    const lid = add(prop, cached('pizzaTop', () => new THREE.PlaneGeometry(0.2, 0.2)), mat(0xb3201c, { rough: 0.8 }), 0, 0.026, 0);
    lid.rotation.x = -Math.PI / 2;
  } else if (L.prop === 'toolbox') {
    prop = new THREE.Group();
    add(prop, cached('toolbox', () => new THREE.BoxGeometry(0.42, 0.18, 0.2)), mat(0xb02020, { rough: 0.4, metal: 0.4 }), 0, -0.12, 0);
    add(prop, cached('toolHandle', () => new THREE.TorusGeometry(0.06, 0.008, 6, 12, Math.PI)), mat(0x111111, { rough: 0.4 }), 0, -0.03, 0);
  }

  // bake static pieces under each joint into one mesh per material
  for (const j of [pelvis, spine, chest, neck, skull, ...legs.flatMap((l) => [l.hip, l.knee, l.ankle]), ...arms.flatMap((a) => [a.shoulder, a.elbow, a.wrist])]) bake(j);
  if (prop) bake(prop);

  const height = L.height || (sexF ? 1.66 : 1.77);
  root.scale.setScalar(height / (sexF ? 1.71 : 1.77));
  if (sexF) body.scale.set(0.97, 1, 0.97);

  const rig = new Rig({ root, body, pelvis, spine, chest, neck, head, skull, legs, arms, eyes, lids, prop, look: L, eyeMat: eM, eyeR, pony: root.userData.pony || null, skirt: root.userData.skirt || null });
  root.userData.rig = rig;
  return root;
}

function shoe(ankle, L, shoeM, soleM) {
  const kind = L.shoes;
  const g = cached(`shoe:${kind}`, () => {
    const boot = kind === 'boot', dress = kind === 'dress', flat = kind === 'flat';
    const len = dress ? 0.29 : 0.275, w = dress ? 0.046 : flat ? 0.042 : 0.052;
    const rings = [];
    // along the foot, heel to toe, swept on "y" and rotated afterwards
    const prof = [
      [0, 0.03, 0.035], [0.04, 0.045, boot ? 0.08 : 0.06], [0.1, 0.05, boot ? 0.075 : 0.065], [0.17, 0.052, 0.05],
      [0.22, 0.05, 0.04], [0.255, 0.042, 0.032], [len, 0.02, 0.018],
    ];
    for (const [z, rx, ry] of prof) rings.push({ y: z, rx: rx * (w / 0.052), rzf: 0.012, rzb: ry, n: 2.6 });
    const upper = loft(rings, 20);
    upper.rotateX(Math.PI / 2);   // sweep axis y -> z
    upper.translate(0, 0.022, -0.06);
    return upper;
  });
  add(ankle, g, shoeM, 0, -0.075, 0);
  add(ankle, cached(`sole:${kind}`, () => {
    const s = loft([
      { y: 0, rx: 0.036, rz: 0.04, n: 3 }, { y: 0.1, rx: 0.048, rz: 0.04, n: 3 }, { y: 0.2, rx: 0.052, rz: 0.04, n: 3 }, { y: 0.27, rx: 0.03, rz: 0.04, n: 3 },
    ].map((r) => ({ ...r, rx: r.rx * (kind === 'dress' || kind === 'flat' ? 0.9 : 1), rzf: kind === 'sneaker' ? 0.014 : 0.007, rzb: kind === 'sneaker' ? 0.014 : 0.007 })), 20);
    s.rotateX(Math.PI / 2);
    s.translate(0, 0.012, -0.065);
    return s;
  }), soleM, 0, -0.075, 0);
  if (kind === 'boot') add(ankle, cached('bootTop', () => limb(0.1, () => 0.05)), shoeM, 0, 0.04, -0.005);
}

function hand(wrist, s, m, f) {
  const k = f ? 0.9 : 1;
  // palm faces the thigh (towards the body); fingers fan front to back
  const palm = add(wrist, cached(`palm:${f}`, () => loft([
    { y: -0.088 * k, rx: 0.035 * k, rz: 0.011, n: 2.6 },
    { y: -0.06 * k, rx: 0.042 * k, rz: 0.016, n: 2.6 },
    { y: -0.02 * k, rx: 0.038 * k, rz: 0.017, n: 2.6 },
    { y: 0.0, rx: 0.027 * k, rz: 0.017, n: 2.4 },
  ], 16)), m, 0, -0.004, 0);
  palm.rotation.y = Math.PI / 2;
  for (let i = 0; i < (LITE ? 0 : 4); i++) {
    const len = [0.07, 0.078, 0.074, 0.06][i] * k;
    const fm = add(wrist, cached(`finger:${i}:${f}`, () => limb(len, taper(0.0095 * k, 0.0075 * k), { N: 10, steps: 4 })), m, 0, -0.088 * k, (1.5 - i) * 0.0185 * k);
    fm.rotation.set((i - 1.5) * 0.05, 0, -s * (0.28 + i * 0.05));
  }
  const th = add(wrist, cached(`thumb:${f}`, () => limb(0.058 * k, taper(0.0115 * k, 0.0085 * k), { N: 10, steps: 4 })), m, -s * 0.01, -0.026 * k, 0.03 * k);
  th.rotation.set(-0.55, 0, -s * 0.3);
}

// Merge the meshes directly under `group` into one mesh per material.
function bake(group) {
  const byMat = new Map();
  for (const o of [...group.children]) {
    if (!o.isMesh || o.children.length || o.userData.anim) continue;
    if (o.material === undefined) continue;
    const key = o.material;
    if (!byMat.has(key)) byMat.set(key, []);
    byMat.get(key).push(o);
  }
  for (const [material, list] of byMat) {
    if (list.length < 2) continue;
    const geos = list.map((o) => {
      o.updateMatrix();
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.applyMatrix4(o.matrix);
      return g;
    });
    const hasColor = geos.some((g) => g.attributes.color);
    if (hasColor) for (const g of geos) if (!g.attributes.color) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
    const merged = mergeGeometries(geos);
    if (!merged) continue;
    for (const o of list) group.remove(o);
    for (const g of geos) g.dispose();
    const m = new THREE.Mesh(merged, material);
    m.castShadow = list.some((o) => o.castShadow);
    m.receiveShadow = true;
    m.userData.baked = true;
    group.add(m);
  }
}

// ------------------------------------------------------------- animation --
const ease = (cur, target, k) => cur + (target - cur) * k;

// Poses: stand, walk (with speed), sit, collapse, aim and aim2 (one or two
// hands), phone, talk, sleep, drive, hands (up), cower, jump, hold.
export class Rig {
  constructor(p) {
    Object.assign(this, p);
    this.phase = Math.random() * 10;
    this.t = Math.random() * 10;
    this.blinkT = 1 + Math.random() * 3;
    this.blink = 0;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.glance = { t: 2, yaw: 0, pitch: 0 };
    this.talkT = 0;
    this.state = { speed: 0, pose: 'stand', lookYaw: null, lookPitch: 0, tilt: 0 };
    this.cur = {};
  }

  // ask for a punch or a line of speech; they play over whatever pose is on
  punch() { this.punchT = 0.32; }
  talk(sec = 1.5) { this.talkT = sec; }

  // st: { speed (m/s), pose, lookYaw/lookPitch (radians, relative to the
  // body; null = look around on their own), tilt }
  update(dt, st = this.state) {
    this.t += dt;
    const t = this.t;
    const pose = st.pose || 'stand';
    const legsWalk = pose === 'walk' || pose === 'stand' || pose === 'aim' || pose === 'aim2';
    const sp = legsWalk ? st.speed || 0 : 0;
    const moving = sp > 0.12;
    const still = st.stiff;
    if (moving) this.phase += dt * (1.6 + sp * 2.1) * (st.stride || 1);
    const ph = this.phase;
    const amp = moving ? Math.min(0.62, 0.2 + sp * 0.18) : 0;
    const s = Math.sin(ph), c = Math.cos(ph);
    const T = {};
    const set = (k, v) => { T[k] = v; };
    // defaults: standing
    set('pelvisY', 0.95); set('pelvisX', 0); set('pelvisRY', 0); set('pelvisRZ', 0); set('bodyRX', 0); set('bodyY', 0);
    set('spineX', 0.02); set('spineY', 0); set('spineZ', 0); set('chestX', 0); set('neckX', 0.05);
    for (const k of ['L', 'R']) {
      set(`hip${k}X`, 0); set(`hip${k}Z`, 0); set(`knee${k}`, 0); set(`ankle${k}`, 0);
      set(`sh${k}X`, 0.04); set(`sh${k}Z`, k === 'L' ? -0.08 : 0.08); set(`sh${k}Y`, 0); set(`el${k}`, -0.18); set(`wr${k}`, 0);
    }
    const breathe = Math.sin(t * (st.panic ? 4 : 1.6)) * (still ? 0.002 : 0.006);
    // weight shift while idle
    const shift = still ? 0 : Math.sin(t * 0.37) * 0.012;

    if (pose === 'stand' || pose === 'walk') {
      if (moving) {
        set('hipLX', -s * amp); set('hipRX', s * amp);
        set('kneeL', Math.max(0, c) * amp * 1.55 + 0.06); set('kneeR', Math.max(0, -c) * amp * 1.55 + 0.06);
        set('ankleL', -Math.min(0, s) * amp * 0.4 - Math.max(0, c) * amp * 0.25);
        set('ankleR', Math.min(0, s) * amp * 0.4 - Math.max(0, -c) * amp * 0.25);
        set('shLX', s * amp * 0.7); set('shRX', -s * amp * 0.7);
        set('elL', -0.25 - Math.max(0, s) * amp * 0.7); set('elR', -0.25 - Math.max(0, -s) * amp * 0.7);
        set('pelvisY', 0.95 - 0.012 + Math.abs(c) * amp * 0.035);
        set('pelvisRY', s * amp * 0.12); set('spineY', -s * amp * 0.18);
        set('pelvisRZ', c * amp * 0.04);
        set('spineX', 0.04 + sp * 0.025);
      } else {
        set('pelvisX', shift); set('pelvisRZ', -shift * 2);
        set('hipLZ', shift * 1.5); set('hipRZ', shift * 1.5);
        set('kneeL', shift > 0 ? 0.08 : 0.02); set('kneeR', shift > 0 ? 0.02 : 0.08);
      }
    } else if (pose === 'sit') {
      set('pelvisY', 0.5); set('hipLX', -1.5); set('hipRX', -1.45);
      set('kneeL', 1.45); set('kneeR', 1.5); set('ankleL', 0.0); set('ankleR', 0.05);
      set('hipLZ', -0.06); set('hipRZ', 0.06);
      set('spineX', -0.06); set('shLX', -0.32); set('shRX', -0.3); set('elL', -0.85); set('elR', -0.8);
      set('shLZ', 0.04); set('shRZ', -0.04);
    } else if (pose === 'collapse') {
      set('pelvisY', 0.2); set('bodyRX', -1.45); set('hipLX', -0.3); set('kneeL', 0.4); set('kneeR', 0.2);
      set('shLX', -2.6); set('shRX', -2.2); set('elL', -0.3); set('elR', -0.6); set('neckX', -0.3);
      set('bodyY', 0.12);
    } else if (pose === 'aim' || pose === 'aim2') {
      // a gun held out in front, pointed where they look (legs walk as usual)
      if (moving) {
        set('hipLX', -s * amp); set('hipRX', s * amp);
        set('kneeL', Math.max(0, c) * amp * 1.55 + 0.06); set('kneeR', Math.max(0, -c) * amp * 1.55 + 0.06);
        set('pelvisY', 0.95 - 0.012 + Math.abs(c) * amp * 0.035);
      }
      const ap = st.aimPitch || 0;
      set('spineX', -ap * 0.3); set('chestX', -ap * 0.3);
      set('shRX', -1.5 - ap * 0.4); set('shRZ', 0.12); set('elR', -0.06); set('wrR', 0.1);
      if (pose === 'aim2') { set('shLX', -1.3 - ap * 0.4); set('shLZ', -0.42); set('shLY', -0.3); set('elL', -0.75); }
      else { set('shLX', moving ? s * amp * 0.4 : 0.05); set('elL', -0.3); }
    } else if (pose === 'phone') {
      // a phone held to the ear, the other hand on the hip
      set('shRX', -1.2); set('shRZ', -0.38); set('shRY', 0.55); set('elR', -2.8); set('wrR', 0.25);
      set('shLZ', -0.42); set('shLX', 0.25); set('elL', -1.5); set('shLY', 0.5);
      set('neckX', 0.08 + Math.sin(t * 0.9) * 0.04); set('spineY', Math.sin(t * 0.5) * 0.05);
    } else if (pose === 'talk') {
      // talking with the hands
      set('shRX', -0.45 + Math.sin(t * 2.3) * 0.22); set('elR', -1.0 + Math.sin(t * 3.1) * 0.35); set('shRZ', 0.18);
      set('shLX', -0.3 + Math.sin(t * 1.7 + 1) * 0.16); set('elL', -0.8 + Math.sin(t * 2.6 + 2) * 0.25); set('shLZ', -0.14);
      set('neckX', 0.04 + Math.sin(t * 2.7) * 0.05); set('spineY', Math.sin(t * 1.1) * 0.06);
    } else if (pose === 'sleep') {
      // lying on your back
      set('pelvisY', 0.17); set('bodyRX', -1.5); set('neckX', 0.15);
      set('shLX', 0.1); set('shRX', 0.1); set('shLZ', -0.2); set('shRZ', 0.2); set('elL', -0.4); set('elR', -0.3);
      set('kneeL', 0.15); set('kneeR', 0.25); set('hipLX', -0.1);
    } else if (pose === 'drive') {
      set('pelvisY', 0.5); set('hipLX', -1.4); set('hipRX', -1.4); set('kneeL', 1.3); set('kneeR', 1.35);
      set('spineX', -0.12); set('shLX', -1.0); set('shRX', -1.0); set('shLZ', -0.12); set('shRZ', 0.12); set('elL', -0.6); set('elR', -0.6);
    } else if (pose === 'hands') {
      // hands up
      set('shLX', -2.9); set('shRX', -2.9); set('shLZ', -0.35); set('shRZ', 0.35); set('elL', -0.4); set('elR', -0.4);
    } else if (pose === 'cower') {
      set('pelvisY', 0.58); set('hipLX', -1.5); set('hipRX', -1.3); set('kneeL', 2.1); set('kneeR', 1.9);
      set('ankleL', -0.5); set('ankleR', -0.5); set('spineX', 0.6); set('neckX', 0.2);
      set('shLX', -2.5); set('shRX', -2.5); set('shLZ', -0.4); set('shRZ', 0.4); set('elL', -2.1); set('elR', -2.1);
    } else if (pose === 'jump') {
      set('hipLX', -0.7); set('hipRX', -0.25); set('kneeL', 1.1); set('kneeR', 0.6); set('ankleL', 0.3);
      set('shLX', -0.5); set('shRX', -0.3); set('shLZ', -0.5); set('shRZ', 0.5); set('elL', -0.5); set('elR', -0.5);
    } else if (pose === 'hold') {
      // holding something in front with both hands (a pizza, a toolbox)
      set('shLX', -0.55); set('shRX', -0.55); set('elL', -1.0); set('elR', -1.0); set('shLZ', -0.12); set('shRZ', 0.12);
      if (moving) {
        set('hipLX', -s * amp); set('hipRX', s * amp);
        set('kneeL', Math.max(0, c) * amp * 1.55 + 0.06); set('kneeR', Math.max(0, -c) * amp * 1.55 + 0.06);
        set('pelvisY', 0.95 - 0.012 + Math.abs(c) * amp * 0.035);
      }
    }
    // a punch: the right arm jabs out and back
    if (this.punchT > 0) {
      this.punchT -= dt;
      const k = Math.sin(Math.max(0, this.punchT / 0.32) * Math.PI);
      set('shRX', ease(T.shRX, -1.55, k)); set('shRZ', ease(T.shRZ, 0.1, k));
      set('elR', ease(T.elR, -0.05, k)); set('spineY', (T.spineY || 0) - 0.35 * k);
    }
    // carrying a prop: the left hand holds it
    if (this.prop && pose !== 'hold' && pose !== 'collapse') {
      if (this.look.prop === 'toolbox') { set('shLX', moving ? 0.1 + s * 0.15 : 0.05); set('elL', -0.05); set('shLZ', -0.12); }
      else { set('shLX', -0.5); set('elL', -1.1); set('shLZ', -0.25); }
    }
    // breathing and head
    set('chestX', (T.chestX || 0) + breathe);
    if (this.talkT > 0) {
      this.talkT -= dt;
      set('neckX', T.neckX + Math.sin(t * 9) * 0.03);
    }

    // where to look: told, or glancing around on their own
    let yaw = st.lookYaw, pitch = st.lookPitch || 0;
    if (yaw == null) {
      const gl = this.glance;
      gl.t -= dt;
      if (gl.t <= 0) {
        gl.t = 1.5 + Math.random() * 3.5;
        gl.yaw = (Math.random() - 0.5) * 1.3;
        gl.pitch = (Math.random() - 0.5) * 0.3;
      }
      yaw = still ? 0 : gl.yaw;
      pitch = still ? 0 : gl.pitch;
    }
    const lk = 1 - Math.exp(-dt * (still ? 1.2 : 5));
    this.lookYaw = ease(this.lookYaw, Math.max(-1.3, Math.min(1.3, yaw)), lk);
    this.lookPitch = ease(this.lookPitch, Math.max(-0.7, Math.min(0.7, pitch)), lk);

    // apply, easing between poses
    const k = 1 - Math.exp(-dt * (moving ? 18 : 9));
    const c0 = this.cur;
    for (const key in T) c0[key] = c0[key] == null ? T[key] : ease(c0[key], T[key], k);
    const C = c0;
    this.pelvis.position.set(C.pelvisX, C.pelvisY, 0);
    this.pelvis.rotation.set(0, C.pelvisRY, C.pelvisRZ);
    this.body.rotation.x = C.bodyRX;
    this.body.position.y = C.bodyY;
    this.spine.rotation.set(C.spineX, C.spineY, C.spineZ);
    this.chest.rotation.x = C.chestX;
    this.chest.scale.set(1 + breathe * 0.6, 1, 1 + breathe);
    const tilt = st.tilt || 0;
    this.neck.rotation.set(C.neckX + this.lookPitch * 0.35, this.lookYaw * 0.4, tilt * 0.4);
    this.head.rotation.set(this.lookPitch * 0.65, this.lookYaw * 0.6, tilt * 0.6);
    const [lg, rg] = this.legs;
    lg.hip.rotation.set(C.hipLX, 0, C.hipLZ); rg.hip.rotation.set(C.hipRX, 0, C.hipRZ);
    lg.knee.rotation.x = C.kneeL; rg.knee.rotation.x = C.kneeR;
    lg.ankle.rotation.x = C.ankleL; rg.ankle.rotation.x = C.ankleR;
    const [la, ra] = this.arms;
    la.shoulder.rotation.set(C.shLX, C.shLY, C.shLZ); ra.shoulder.rotation.set(C.shRX, C.shRY, C.shRZ);
    la.elbow.rotation.x = C.elL; ra.elbow.rotation.x = C.elR;
    la.wrist.rotation.x = C.wrL; ra.wrist.rotation.x = C.wrR;
    if (this.prop) {
      if (!this.prop.parent) this.arms[0].wrist.add(this.prop);
      if (this.look.prop === 'toolbox') { this.prop.position.set(0, -0.1, 0); this.prop.rotation.set(0, Math.PI / 2, 0); }
      else { this.prop.position.set(0.12, -0.08, 0.1); this.prop.rotation.set(Math.PI / 2 - 0.4, 0, 0.2); }
    }
    if (this.pony) this.pony.rotation.x = 0.35 + Math.sin(ph) * amp * 0.15;
    if (this.skirt) {
      // over the lap when sitting or crouched; swings a little when walking
      const fold = pose === 'sit' || pose === 'collapse';
      this.skirt.scale.y = ease(this.skirt.scale.y, fold ? 0.32 : 1, 1 - Math.exp(-dt * 10));
      this.skirt.scale.z = ease(this.skirt.scale.z, fold ? 1.6 : 1, 1 - Math.exp(-dt * 10));
      this.skirt.position.z = ease(this.skirt.position.z, fold ? 0.08 : 0, 1 - Math.exp(-dt * 10));
      this.skirt.rotation.x = fold ? 0 : Math.sin(ph) * amp * 0.06;
    }

    // blinking
    this.blinkT -= dt;
    if (this.blinkT <= 0 && !st.noBlink) {
      this.blinkT = 2 + Math.random() * 4;
      this.blink = 0.16;
    }
    let lid = LID_OPEN;
    if (this.blink > 0) {
      this.blink -= dt;
      lid = LID_OPEN + (LID_SHUT - LID_OPEN) * Math.sin(Math.max(0, this.blink / 0.16) * Math.PI);
    }
    if (pose === 'collapse' || pose === 'sleep' || st.eyesClosed) lid = LID_SHUT;
    if (st.noBlink) lid = LID_OPEN - 0.2;  // wide open
    for (const l of this.lids) l.rotation.x = lid - this.lookPitch * 0.3;
  }
}
