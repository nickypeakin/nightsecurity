// Building blocks for everything made by hand: shared materials and
// cached shapes (rounded boxes, cylinders, balls, lathed profiles, beams
// between two points). Everything is built from these at start-up.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const mats = new Map();
export function mat(color, o = {}) {
  const key = JSON.stringify([color, o.map && o.map.uuid, o.rough, o.metal, o.emissive, o.ei, o.opacity, o.side, o.alphaMap && o.alphaMap.uuid, o.env, o.basic]);
  if (!mats.has(key)) {
    const m = o.basic
      ? new THREE.MeshBasicMaterial({ color, map: o.map || null, transparent: o.opacity != null, opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide })
      : new THREE.MeshStandardMaterial({
        color, map: o.map || null, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0,
        emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 1,
        transparent: o.opacity != null, opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide,
      });
    if (o.alphaMap) { m.alphaMap = o.alphaMap; m.alphaTest = 0.5; }
    if (o.env != null) m.envMapIntensity = o.env;
    mats.set(key, m);
  }
  return mats.get(key);
}

const geos = new Map();
export function cachedGeo(key, make) {
  if (!geos.has(key)) geos.set(key, make());
  return geos.get(key);
}
// one segment of rounding: a soft chamfer, a third of the triangles of two
const rbox = (w, h, d, r = 0.02) => cachedGeo(`rb${w}:${h}:${d}:${r}`, () => new RoundedBoxGeometry(w, h, d, 1, Math.max(1e-4, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3))));
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 16);
const ballGeo = new THREE.SphereGeometry(1, 18, 12);
const boxGeo = new THREE.BoxGeometry(1, 1, 1);

export function place(parent, geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
// a rounded box centred at (x, y, z)
export const block = (g, m, x, y, z, w, h, d, r = 0.01) => place(g, rbox(w, h, d, r), m, x, y, z);
// a sharp box centred at (x, y, z)
export function box(g, m, x, y, z, w, h, d) {
  const b = place(g, boxGeo, m, x, y, z);
  b.scale.set(w, h, d);
  return b;
}
// an upright cylinder centred at (x, y, z)
export function cyl(g, m, x, y, z, r, h) {
  const c = place(g, cylGeo, m, x, y, z);
  c.scale.set(r, h, r);
  return c;
}
export function ball(g, m, x, y, z, sx, sy = sx, sz = sx) {
  const b = place(g, ballGeo, m, x, y, z);
  b.scale.set(sx, sy, sz);
  return b;
}
// a square bar (or a round rod) from a to b ([x, y, z] arrays)
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
export function beam(g, m, a, b, w = 0.08, d = w, round = false) {
  _a.set(...a); _b.set(...b);
  const len = _a.distanceTo(_b);
  const o = place(g, round ? cylGeo : boxGeo, m);
  o.position.copy(_a).add(_b).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(_up, _b.clone().sub(_a).normalize());
  o.scale.set(round ? w : w, len, round ? w : d);
  return o;
}
export function lathe(key, pts, segs = 20) {
  return cachedGeo(key, () => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs));
}

export const wood = (tone, key, rough = 0.6) => mat(tone, { rough });
export const cloth = (color) => mat(color, { rough: 0.95 });
export const METAL = () => mat(0x9a9a98, { rough: 0.35, metal: 0.85 });
export const STEEL = () => mat(0x80837f, { rough: 0.6, metal: 0.55 });
export const BLACK = () => mat(0x161616, { rough: 0.5, metal: 0.3 });
export const glowMat = (color = 0xffe2b0, ei = 1.4) => mat(0xfff1d8, { emissive: color, ei, rough: 0.6 });
