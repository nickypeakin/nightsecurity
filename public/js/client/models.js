// Models built from primitives: the furniture of a 1996 mall (benches,
// planters, the fountain, the carousel, shelving for every kind of shop,
// arcade cabinets, a wall of TVs), the back office (the CCTV desk, the
// alarm panel, the breakers, lockers), the gates and doors, and Dale's car.
// Everything faces +z with its origin on the floor; `rot` turns it.

import * as THREE from 'three';
import * as TX from './textures.js';
import { mat, cachedGeo, place, block, box, cyl, ball, beam, lathe, wood, cloth, METAL, STEEL, BLACK, glowMat } from './props.js';

const glass = () => mat(0x9fb4c0, { rough: 0.05, metal: 0.1, opacity: 0.22 });
const basic = (color, map = null, o = {}) => mat(color, { basic: true, map, ...o });
// an emissive-looking surface that glows (and blooms) whatever the light
const shine = (map, k = 1.6) => {
  const m = new THREE.MeshBasicMaterial({ map, color: new THREE.Color(k, k, k), toneMapped: true });
  return m;
};
function plane(g, material, w, h, x, y, z, ry = 0) {
  const p = new THREE.Mesh(cachedGeo(`pl${w}:${h}`, () => new THREE.PlaneGeometry(w, h)), material);
  p.position.set(x, y, z);
  p.rotation.y = ry;
  p.receiveShadow = true;
  g.add(p);
  return p;
}
const keep = (o) => { o.userData.keep = true; return o; };

// ------------------------------------------------------------- the props
const build = {
  fountain(g) {
    const stone = mat(0xcfc6b4, { map: TX.terrazzo('#cfc6b4', 'fountainStone'), rough: 0.5 });
    const ringGeo = cachedGeo('fountainRing', () => {
      const s = new THREE.Shape(); s.absarc(0, 0, 3.2, 0, Math.PI * 2);
      const h = new THREE.Path(); h.absarc(0, 0, 2.85, 0, Math.PI * 2, true); s.holes.push(h);
      const geo = new THREE.ExtrudeGeometry(s, { depth: 0.6, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, curveSegments: 48 });
      geo.rotateX(-Math.PI / 2);
      return geo;
    });
    place(g, ringGeo, stone, 0, 0, 0);
    const water = new THREE.Mesh(cachedGeo('fountainWater', () => new THREE.CircleGeometry(2.86, 48)), mat(0x2a4a58, { rough: 0.02, metal: 0.3, opacity: 0.85 }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.45;
    g.add(keep(water));
    g.userData.water = water;
    place(g, lathe('fountainTier', [[0.001, 0], [0.45, 0], [0.35, 0.9], [0.25, 1.0], [1.3, 1.25], [1.4, 1.4], [0.22, 1.42], [0.18, 2.1], [0.6, 2.25], [0.65, 2.35], [0.1, 2.36], [0.08, 2.7], [0.001, 2.75]], 32), stone, 0, 0.3, 0);
    // pennies on the bottom
    for (let i = 0; i < 40; i++) {
      const a = i * 2.4, r = 0.8 + (i * 0.37 % 1.9);
      const c = cyl(g, mat(0xb07040, { metal: 0.8, rough: 0.4 }), Math.cos(a) * r, 0.42, Math.sin(a) * r, 0.012, 0.003);
      c.castShadow = false;
    }
  },
  bench(g, p) {
    const w = wood('#7a5432', 'benchWood');
    for (let i = 0; i < 4; i++) block(g, w, 0, 0.44, -0.24 + i * 0.16, p.w, 0.04, 0.12, 0.01);
    for (const x of [-p.w / 2 + 0.15, p.w / 2 - 0.15]) {
      block(g, BLACK(), x, 0.21, 0, 0.06, 0.42, 0.5, 0.01);
      block(g, BLACK(), x, 0.44, 0, 0.08, 0.04, 0.6, 0.01);
    }
  },
  planter(g, p) {
    const brickM = mat(0xffffff, { map: TX.tiled(TX.brick(), p.w / 2, 0.4), rough: 0.9 });
    block(g, brickM, 0, p.h / 2, 0, p.w, p.h, p.d, 0.03);
    block(g, mat(0x3a2a1c, { rough: 1 }), 0, p.h - 0.02, 0, p.w - 0.12, 0.04, p.d - 0.12, 0.01);
    const leaf = [mat(0x2f5a2a, { rough: 0.7 }), mat(0x4a7a34, { rough: 0.7 })];
    if (p.palm) {
      cyl(g, mat(0x6a5038, { rough: 0.9 }), 0, p.h + 1.2, 0, 0.09, 2.4);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const f = new THREE.Group();
        f.position.set(0, p.h + 2.35, 0);
        f.rotation.set(0, a, 0);
        g.add(f);
        const b = new THREE.Group();
        b.rotation.x = 0.9 + (i % 3) * 0.15;
        f.add(b);
        ball(b, leaf[i % 2], 0, 0.75, 0, 0.18, 0.8, 0.02);
      }
    } else {
      for (let i = 0; i < 18; i++) ball(g, leaf[i % 2], ((i * 37) % 10 - 5) / 10 * p.w * 0.7, p.h + 0.25 + (i % 4) * 0.08, ((i * 53) % 10 - 5) / 10 * p.d * 0.7, 0.22, 0.3, 0.22);
    }
  },
  escalator(g, p) {
    // rising along -z from a landing at +z to a landing at the top
    const len = p.d, rise = p.h, w = p.w, flat = 1.2;
    const run = len - 2 * flat, slope = Math.hypot(run, rise), ang = Math.atan2(rise, run);
    const side = mat(0xb8bcc0, { rough: 0.3, metal: 0.6 });
    const steps = mat(0x4a4c50, { rough: 0.6, metal: 0.5 });
    const glassM = mat(0x9fb4c0, { rough: 0.05, metal: 0.1, opacity: 0.25 });
    const tilt = (o) => { o.rotation.x = ang; return o; };
    tilt(block(g, side, 0, rise / 2 - 0.15, 0, w, 0.5, slope, 0.02));
    tilt(block(g, steps, 0, rise / 2 + 0.12, 0, w - 0.2, 0.06, slope, 0.005));
    block(g, steps, 0, 0.05, len / 2 - flat / 2, w - 0.2, 0.1, flat, 0.005);
    block(g, side, 0, rise - 0.1, -len / 2 + flat / 2, w, 0.4, flat, 0.01);
    block(g, steps, 0, rise + 0.12, -len / 2 + flat / 2, w - 0.2, 0.06, flat, 0.005);
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2 - 0.05);
      tilt(block(g, glassM, x, rise / 2 + 0.6, 0, 0.04, 0.85, slope, 0.005));
      block(g, glassM, x, 0.55, len / 2 - flat / 2, 0.04, 0.85, flat, 0.005);
      block(g, glassM, x, rise + 0.6, -len / 2 + flat / 2, 0.04, 0.85, flat, 0.005);
      block(g, side, x, 0.08, len / 2 - flat / 2, 0.1, 0.16, flat, 0.005);
      const rail = [[x, 1.02, len / 2], [x, 1.02, len / 2 - flat], [x, rise + 1.02, -len / 2 + flat], [x, rise + 1.02, -len / 2]];
      for (let i = 0; i < 3; i++) beam(g, BLACK(), rail[i], rail[i + 1], 0.06, 0.1);
    }
    // chained off at the bottom, with a sign
    for (const y of [0.85, 0.95]) beam(g, mat(0xd8c020, { rough: 0.4, metal: 0.5 }), [-w / 2, y, len / 2 - 0.1], [w / 2, y - 0.05, len / 2 - 0.1], 0.02, 0.02, true);
    plane(g, basic(0xffffff, TX.sign(p.dead ? 'OUT OF ORDER' : 'UPPER LEVEL\nCLOSED', { w: 256, h: 128, bg: '#f2f0e8', fg: '#b01818', font: 'bold 40px Arial, sans-serif' })), 0.5, 0.25, 0, 0.9, len / 2 - 0.08);
  },
  directory(g) {
    block(g, mat(0x2a2c2e, { rough: 0.4, metal: 0.4 }), 0, 1.1, 0, 1.2, 2.2, 0.35, 0.03);
    plane(g, shine(TX.directory(), 1.1), 1.0, 1.5, 0, 1.35, 0.18);
    plane(g, shine(TX.directory(), 1.1), 1.0, 1.5, 0, 1.35, -0.18, Math.PI);
  },
  kiosk(g, p) {
    block(g, mat(0x1c3a4a, { rough: 0.4 }), 0, 0.5, 0, p.w, 1.0, p.d, 0.03);
    block(g, glass(), 0, 1.15, 0, p.w - 0.1, 0.3, p.d - 0.1, 0.01);
    for (let i = 0; i < 10; i++) {
      const s = block(g, mat([0x111, 0x7a3a1a, 0x1a1a5a][i % 3], { rough: 0.2, metal: 0.4 }), -p.w / 2 + 0.25 + i * 0.19, 1.02, -0.2 + (i % 2) * 0.35, 0.14, 0.03, 0.05, 0.01);
      s.castShadow = false;
    }
    for (const x of [-p.w / 2 + 0.05, p.w / 2 - 0.05]) cyl(g, METAL(), x, 1.6, 0, 0.02, 1.2);
    block(g, mat(0x1c3a4a), 0, 2.2, 0, p.w + 0.2, 0.08, p.d + 0.2, 0.02);
    const s = plane(g, basic(0xffffff, TX.sign(p.sign, { w: 512, h: 96, bg: '#1c3a4a', fg: '#ffd84a', font: 'bold 54px Arial Black, sans-serif' })), p.w, 0.36, 0, 2.0, p.d / 2 + 0.11);
    keep(s);
  },
  cart(g, p) {
    block(g, wood('#6a4a2a', 'cartWood'), 0, 0.55, 0, p.w, 0.9, p.d, 0.04);
    block(g, mat(0x8a1a1a, { rough: 0.6 }), 0, 1.02, 0, p.w + 0.1, 0.06, p.d + 0.1, 0.02);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, METAL(), sx * (p.w / 2 - 0.05), 1.6, sz * (p.d / 2 - 0.05), 0.02, 1.2);
    // a striped awning
    for (let i = 0; i < 6; i++) block(g, i % 2 ? mat(0xf2ead8, { rough: 0.8 }) : mat(0xb81818, { rough: 0.8 }), -p.w / 2 + (i + 0.5) * p.w / 6, 2.22, 0, p.w / 6, 0.05, p.d + 0.3, 0.005);
    // wheels
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const w = cyl(g, BLACK(), sx * (p.w / 2 - 0.25), 0.12, sz * (p.d / 2 - 0.05), 0.12, 0.06);
      w.rotation.z = Math.PI / 2;
    }
    plane(g, basic(0xffffff, TX.sign(p.sign, { w: 512, h: 96, bg: '#6a4a2a', fg: '#ffe0a0', font: 'bold 52px Georgia, serif' })), p.w - 0.1, 0.32, 0, 0.75, p.d / 2 + 0.005);
  },
  trash(g) {
    cyl(g, mat(0x5a4a3a, { map: TX.wood('#6a5038', 'trashWood'), rough: 0.7 }), 0, 0.42, 0, 0.27, 0.84);
    cyl(g, BLACK(), 0, 0.86, 0, 0.29, 0.06);
  },
  payphones(g, p) {
    for (let i = 0; i < 3; i++) {
      const x = -p.w / 2 + 0.3 + i * 0.6;
      block(g, mat(0x9aa0a6, { rough: 0.3, metal: 0.7 }), x, 1.35, 0, 0.42, 0.62, 0.2, 0.02);
      block(g, BLACK(), x - 0.08, 1.4, 0.12, 0.08, 0.26, 0.06, 0.02);
      block(g, mat(0x2a2a2a), x + 0.06, 1.42, 0.105, 0.14, 0.18, 0.01, 0.002);
    }
    block(g, mat(0x2a2c2e, { metal: 0.4, rough: 0.4 }), 0, 1.0, -0.05, p.w, 2.0, 0.08, 0.02);
    plane(g, basic(0xffffff, TX.sign('TELEPHONES', { w: 256, h: 48, bg: '#1a3a6a', fg: '#fff', font: 'bold 30px Arial, sans-serif' })), 1.2, 0.22, 0, 1.85, 0.0);
  },
  carousel(g) {
    const spin = keep(new THREE.Group());
    g.add(spin);
    g.userData.spin = spin;
    const gold = mat(0xd8b050, { rough: 0.3, metal: 0.8 });
    const red = mat(0xa81c2c, { rough: 0.5 });
    const cream = mat(0xf0e6d0, { rough: 0.6 });
    place(g, cachedGeo('carBase', () => new THREE.CylinderGeometry(3.8, 3.85, 0.3, 40)), mat(0x6a4a3a, { map: TX.wood('#7a5432', 'carouselFloor'), rough: 0.6 }), 0, 0.15, 0);
    place(spin, cachedGeo('carPlat', () => new THREE.CylinderGeometry(3.5, 3.5, 0.08, 40)), mat(0xffffff, { map: TX.wood('#a07848', 'carouselDeck'), rough: 0.5 }), 0, 0.34, 0);
    cyl(spin, gold, 0, 2.2, 0, 0.35, 4.0);
    place(spin, cachedGeo('carCenter', () => new THREE.CylinderGeometry(0.9, 0.9, 2.4, 16)), mat(0x7a1a2a, { rough: 0.5 }), 0, 1.6, 0);
    // the canopy
    place(spin, cachedGeo('carCanopy', () => new THREE.ConeGeometry(4.1, 1.2, 24, 1, true)), red, 0, 4.4, 0);
    place(spin, cachedGeo('carRim', () => new THREE.CylinderGeometry(4.1, 4.1, 0.35, 24, 1, true)), cream, 0, 3.65, 0);
    // bulbs round the rim
    const bulb = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.9, 1.1) });
    g.userData.bulbMat = bulb;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const b = new THREE.Mesh(cachedGeo('bulb', () => new THREE.SphereGeometry(0.05, 8, 6)), bulb);
      b.position.set(Math.cos(a) * 4.12, 3.62, Math.sin(a) * 4.12);
      spin.add(b);
    }
    // horses on poles
    const horseM = [mat(0xf2ead8, { rough: 0.4 }), mat(0x3a2a1a, { rough: 0.4 }), mat(0xe8c890, { rough: 0.4 })];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, r = 2.6;
      const hx = Math.cos(a) * r, hz = Math.sin(a) * r;
      cyl(spin, gold, hx, 2.0, hz, 0.03, 3.3);
      const horse = new THREE.Group();
      horse.position.set(hx, 1.0 + (i % 2) * 0.25, hz);
      horse.rotation.y = -a;
      spin.add(horse);
      const hm = horseM[i % 3];
      ball(horse, hm, 0, 0.1, 0, 0.18, 0.2, 0.5);
      const neck = ball(horse, hm, 0, 0.38, 0.38, 0.1, 0.25, 0.1);
      neck.rotation.x = 0.5;
      ball(horse, hm, 0, 0.55, 0.5, 0.08, 0.1, 0.18);
      for (const [lx, lz, rx] of [[-0.1, 0.3, -0.8], [0.1, 0.3, -0.4], [-0.1, -0.35, 0.6], [0.1, -0.35, 0.3]]) {
        const l = ball(horse, hm, lx, -0.15, lz, 0.04, 0.25, 0.04);
        l.rotation.x = rx;
      }
      block(horse, red, 0, 0.29, 0, 0.3, 0.05, 0.3, 0.01);
    }
  },
  table(g, p) {
    if (p.books) {
      block(g, wood('#6a4a2a', 'bookTable'), 0, p.h / 2, 0, p.w, p.h, p.d, 0.02);
      const bk = mat(0xffffff, { map: TX.stock('books'), rough: 0.8 });
      for (let i = 0; i < 6; i++) block(g, bk, -p.w / 2 + 0.25 + (i % 3) * (p.w / 3), p.h + 0.04 + Math.floor(i / 3) * 0.05, -0.2 + (i % 2) * 0.4, 0.3, 0.06, 0.22, 0.005);
      return;
    }
    // a round food court table with four bolted chairs
    const top = mat([0xe8e0d0, 0xd84a2a, 0x2a6a8a][p.seed % 3], { rough: 0.35 });
    place(g, cachedGeo('tableTop', () => new THREE.CylinderGeometry(0.45, 0.45, 0.04, 24)), top, 0, 0.74, 0);
    cyl(g, METAL(), 0, 0.37, 0, 0.04, 0.72);
    cyl(g, METAL(), 0, 0.02, 0, 0.25, 0.04);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + 0.3;
      const cx = Math.cos(a) * 0.72, cz = Math.sin(a) * 0.72;
      const c = new THREE.Group();
      c.position.set(cx, 0, cz);
      c.rotation.y = -a - Math.PI / 2;
      g.add(c);
      block(c, mat(0xc84a2a, { rough: 0.4 }), 0, 0.45, 0, 0.42, 0.04, 0.4, 0.02);
      block(c, mat(0xc84a2a, { rough: 0.4 }), 0, 0.72, -0.18, 0.42, 0.5, 0.04, 0.02);
      cyl(c, METAL(), 0, 0.22, 0, 0.025, 0.44);
    }
  },
  shelf(g, p) {
    const fr = mat(0xd8d4cc, { rough: 0.5, metal: 0.2 });
    const back = mat(0x9a948a, { rough: 0.8 });
    block(g, back, 0, p.h / 2, -p.d / 2 + 0.03, p.w, p.h, 0.04, 0.005);
    for (const x of [-p.w / 2 + 0.02, p.w / 2 - 0.02]) block(g, fr, x, p.h / 2, 0, 0.04, p.h, p.d, 0.005);
    const n = Math.max(2, Math.floor(p.h / 0.45));
    const st = mat(0xffffff, { map: TX.stock(p.stock || 'boxes'), rough: 0.8 });
    for (let i = 0; i < n; i++) {
      const y = 0.08 + i * (p.h - 0.15) / n;
      block(g, fr, 0, y, 0, p.w - 0.04, 0.03, p.d, 0.005);
      if (i < n) {
        const s = plane(g, st, p.w - 0.1, (p.h - 0.15) / n - 0.04, 0, y + ((p.h - 0.15) / n) / 2, 0.02);
        s.material = st;
      }
    }
  },
  gondola(g, p) {
    const fr = mat(0xe0dcd4, { rough: 0.5, metal: 0.2 });
    block(g, fr, 0, p.h / 2, 0, p.w, p.h, 0.06, 0.01);
    block(g, fr, 0, 0.06, 0, p.w, 0.12, p.d, 0.01);
    const st = mat(0xffffff, { map: TX.stock(p.stock || 'boxes'), rough: 0.8 });
    const rows = Math.max(2, Math.floor(p.h / 0.45));
    for (let i = 0; i < rows; i++) {
      const y = 0.25 + i * (p.h - 0.2) / rows;
      for (const s of [-1, 1]) {
        block(g, fr, 0, y, s * p.d / 4, p.w, 0.025, p.d / 2 - 0.05, 0.005);
        plane(g, st, p.w - 0.08, (p.h - 0.2) / rows - 0.05, 0, y + ((p.h - 0.2) / rows) / 2, s * (p.d / 2 - 0.05), s > 0 ? 0 : Math.PI);
      }
    }
    block(g, mat(0x2a6a8a, { rough: 0.6 }), 0, p.h + 0.02, 0, p.w, 0.04, 0.1, 0.01);
  },
  recordBin(g, p) {
    block(g, wood('#5a3a22', 'binWood'), 0, 0.4, 0, p.w, 0.8, p.d, 0.02);
    const rec = mat(0xffffff, { map: TX.stock('records'), rough: 0.7 });
    for (let i = 0; i < 2; i++) {
      const r = block(g, rec, 0, 0.92, -0.2 + i * 0.4, p.w - 0.1, 0.32, 0.3, 0.005);
      r.rotation.x = -0.3;
    }
  },
  counter(g, p) {
    const front = p.oven ? mat(0x6b3410, { map: TX.laminate('#7a4418', 'pretzel'), rough: 0.5 }) : mat(0xffffff, { map: TX.laminate('#d8d0c0', 'counter'), rough: 0.5 });
    block(g, front, 0, p.h / 2, 0, p.w, p.h, p.d, 0.02);
    block(g, mat(0x3a3430, { rough: 0.25 }), 0, p.h + 0.02, 0, p.w + 0.06, 0.04, p.d + 0.06, 0.01);
    if (p.register) {
      block(g, mat(0x2a2a2a, { rough: 0.4 }), p.w / 2 - 0.4, p.h + 0.12, -0.05, 0.4, 0.18, 0.35, 0.02);
      const d = block(g, mat(0x1a3a2a, { rough: 0.2 }), p.w / 2 - 0.4, p.h + 0.3, -0.12, 0.22, 0.12, 0.03, 0.005);
      d.rotation.x = -0.3;
    }
    if (p.oven) {
      block(g, mat(0x9aa0a6, { metal: 0.7, rough: 0.3 }), -p.w / 2 + 0.6, p.h + 0.4, -0.1, 0.9, 0.7, 0.6, 0.02);
      block(g, glass(), -p.w / 2 + 0.6, p.h + 0.4, 0.21, 0.8, 0.55, 0.01, 0.005);
    }
  },
  glassCase(g, p) {
    const fr = p.perfume ? mat(0xd8c890, { rough: 0.3, metal: 0.7 }) : mat(0x2a2a2e, { rough: 0.4 });
    block(g, fr, 0, 0.3, 0, p.w, 0.6, p.d, 0.01);
    block(g, glass(), 0, 0.8, 0, p.w - 0.04, 0.4, p.d - 0.04, 0.005);
    block(g, fr, 0, 1.0, 0, p.w, 0.02, p.d, 0.005);
    const inside = p.perfume ? mat(0xe8d8f0, { rough: 0.1, metal: 0.1, opacity: 0.8 }) : mat(0xe8d080, { rough: 0.2, metal: 0.9 });
    for (let i = 0; i < 7; i++) {
      const b = p.perfume ? place(g, lathe('perfume', [[0.001, 0], [0.04, 0], [0.045, 0.08], [0.02, 0.1], [0.012, 0.13], [0.001, 0.14]], 10), inside, -p.w / 2 + 0.25 + i * (p.w - 0.5) / 6, 0.62, -0.1 + (i % 2) * 0.2)
        : ball(g, inside, -p.w / 2 + 0.25 + i * (p.w - 0.5) / 6, 0.64, -0.1 + (i % 2) * 0.2, 0.025);
      b.castShadow = false;
    }
  },
  photoMachine(g, p) {
    block(g, mat(0xe8e8e2, { rough: 0.4 }), 0, p.h / 2, 0, p.w, p.h, p.d, 0.04);
    block(g, mat(0x2a2a2a), 0, p.h - 0.2, p.d / 2, p.w * 0.6, 0.18, 0.02, 0.01);
    block(g, mat(0xf2c200, { rough: 0.4 }), 0, 0.3, p.d / 2 + 0.005, p.w, 0.12, 0.01, 0.002);
  },
  arcade(g, p) {
    const col = [0x1a1a6a, 0x6a1a1a, 0x1a5a2a, 0x2a2a2a, 0x5a1a5a][p.seed % 5];
    const body = mat(col, { rough: 0.5 });
    block(g, body, 0, 0.6, 0, p.w, 1.2, p.d, 0.02);
    block(g, body, 0, 1.55, -0.12, p.w, 0.7, p.d - 0.24, 0.02);
    const panel = block(g, BLACK(), 0, 1.2, 0.18, p.w - 0.06, 0.06, 0.32, 0.01);
    panel.rotation.x = 0.35;
    for (let i = 0; i < 3; i++) ball(g, mat([0xff2a2a, 0xffe02a, 0x2a8aff][i], { rough: 0.3 }), -0.1 + i * 0.1, 1.26, 0.22, 0.025);
    cyl(g, BLACK(), -0.24, 1.3, 0.15, 0.012, 0.1);
    const scr = plane(g, shine(TX.arcadeScreen(p.seed), 1.5), p.w - 0.14, 0.5, 0, 1.58, 0.13);
    scr.rotation.x = -0.2;
    keep(scr);
    const marquee = plane(g, shine(TX.sign(['GALAXIA', 'ROBO RALLY', 'NINJA FIST', 'STAR CHASE', 'DIG DUG IT', 'PAC PANIC', 'TURBO 9', 'ZOMBIE ZOO', 'SKY ACE', 'BLOCKOUT'][p.seed % 10], { w: 256, h: 64, bg: '#111', fg: '#ffe04a', font: 'bold 40px Impact, sans-serif' }), 1.3), p.w - 0.06, 0.16, 0, 1.82, 0.1);
    keep(marquee);
  },
  prize(g, p) {
    block(g, mat(0xd81e5a, { rough: 0.4 }), 0, 0.45, 0, p.w, 0.9, p.d, 0.02);
    block(g, glass(), 0, 1.35, 0, p.w - 0.06, 0.9, p.d - 0.06, 0.005);
    block(g, mat(0xd81e5a, { rough: 0.4 }), 0, 1.85, 0, p.w, 0.1, p.d, 0.02);
    for (let i = 0; i < 12; i++) ball(g, mat([0xffe04a, 0x4ab0ff, 0xff7ab0, 0x7aff7a][i % 4], { rough: 0.9 }), -0.5 + (i % 4) * 0.33, 0.98 + Math.floor(i / 4) * 0.08, -0.3 + Math.floor(i / 4) * 0.25, 0.12, 0.1, 0.12);
  },
  tvWall(g, p) {
    block(g, mat(0x2a2a2a, { rough: 0.6 }), 0, p.h / 2, -0.1, p.w, p.h, 0.2, 0.01);
    g.userData.screens = [];
    const cols = 6, rows = 3;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = -p.w / 2 + (c + 0.5) * p.w / cols, y = 0.5 + r * 0.72;
      block(g, mat(0x1a1a1c, { rough: 0.4 }), x, y + 0.3, 0.15, p.w / cols - 0.1, 0.62, 0.45, 0.04);
      const s = plane(g, new THREE.MeshBasicMaterial({ color: 0x0a0c0e }), p.w / cols - 0.24, 0.46, x, y + 0.32, 0.38);
      g.userData.screens.push(keep(s));
    }
  },
  rack(g, p) {
    const m = METAL();
    for (const x of [-p.w / 2 + 0.05, p.w / 2 - 0.05]) { cyl(g, m, x, 0.65, 0, 0.015, 1.3); block(g, m, x, 0.02, 0, 0.05, 0.03, 0.5, 0.01); }
    beam(g, m, [-p.w / 2 + 0.05, 1.3, 0], [p.w / 2 - 0.05, 1.3, 0], 0.015, 0.015, true);
    const cols = [0x2a3a5a, 0x7a2a3a, 0xd8d0c0, 0x3a5a3a, 0x8a6a4a, 0x5a3a6a, 0x1a1a1a, 0xc87a5a, 0x4a6a8a];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const c = cloth(cols[(p.seed + i * 3) % cols.length]);
      const garment = block(g, c, -p.w / 2 + 0.15 + i * (p.w - 0.3) / (n - 1), 0.88, 0, 0.04, 0.8, 0.42, 0.02);
      garment.rotation.y = (i % 3 - 1) * 0.08;
      if (p.dusty) garment.material = mat(new THREE.Color(cols[(p.seed + i * 3) % cols.length]).multiplyScalar(0.6).getHex(), { map: TX.fabric(), rough: 1 });
    }
  },
  boxes(g, p) {
    const card = mat(0xa8875a, { rough: 0.9 });
    block(g, card, 0, p.h * 0.3, 0, p.w, p.h * 0.6, p.d, 0.01);
    block(g, card, 0.05, p.h * 0.8, 0.02, p.w * 0.7, p.h * 0.4, p.d * 0.7, 0.01).rotation.y = 0.2;
    block(g, mat(0xd8c9a0, { rough: 0.3 }), 0, p.h * 0.6 + 0.002, 0, 0.08, 0.004, p.d, 0.001);
  },
  ladder(g) {
    const m = mat(0xc8a020, { rough: 0.5 });
    for (const x of [-0.25, 0.25]) {
      beam(g, m, [x, 0, 0.5], [x * 0.6, 2.1, 0], 0.05, 0.04);
      beam(g, m, [x, 0, -0.5], [x * 0.6, 2.1, 0], 0.04, 0.03);
    }
    for (let i = 1; i < 6; i++) beam(g, m, [-0.25 + i * 0.015, i * 0.35, 0.5 - i * 0.08], [0.25 - i * 0.015, i * 0.35, 0.5 - i * 0.08], 0.03, 0.03);
  },
  foodCounter(g, p) {
    block(g, mat(0xffffff, { map: TX.laminate('#d8b890', 'foodCounter'), rough: 0.5 }), 0, p.h / 2, 0, p.w, p.h, p.d, 0.02);
    block(g, mat(0xb8bcc0, { metal: 0.8, rough: 0.25 }), 0, p.h + 0.02, 0, p.w + 0.05, 0.04, p.d + 0.05, 0.01);
    block(g, mat(0x9aa0a6, { metal: 0.7, rough: 0.3 }), -p.w / 4, p.h + 0.3, -0.1, 1.0, 0.5, 0.5, 0.02);
    block(g, mat(0x2a2a2a), p.w / 4, p.h + 0.12, 0, 0.4, 0.2, 0.3, 0.02);
  },
  mannequinParts(g, p) {
    const pl = mat(0xe8e2d8, { rough: 0.35 });
    for (let i = 0; i < 4; i++) {
      const a = ball(g, pl, -p.w / 2 + 0.3 + i * 0.35, 0.08, (i % 2) * 0.3 - 0.15, 0.04, 0.32, 0.04);
      a.rotation.z = Math.PI / 2 + i * 0.3;
    }
    ball(g, pl, 0.4, 0.12, 0.2, 0.1, 0.12, 0.11);
    ball(g, pl, -0.2, 0.15, -0.2, 0.17, 0.22, 0.12).rotation.z = 1.3;
  },
  cot(g, p) {
    block(g, cloth(0x4a5a3a), 0, 0.4, 0, p.w, 0.06, p.d, 0.02);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam(g, METAL(), [sx * (p.w / 2 - 0.1), 0, sz * (p.d / 2 - 0.05)], [sx * (p.w / 2 - 0.1), 0.4, sz * (p.d / 2 - 0.05)], 0.02, 0.02, true);
    block(g, cloth(0x7a3a2a), 0.3, 0.46, 0, 0.9, 0.06, p.d - 0.1, 0.03);
    // wrappers and an empty thermos
    for (let i = 0; i < 5; i++) block(g, mat([0xd81e1e, 0xf2c200, 0x2a6ad8][i % 3], { rough: 0.5 }), -0.6 + i * 0.25, 0.02, p.d / 2 + 0.3 + (i % 2) * 0.15, 0.12, 0.01, 0.08, 0.002);
    cyl(g, mat(0x2a5a2a, { metal: 0.5, rough: 0.4 }), 0.8, 0.14, p.d / 2 + 0.25, 0.05, 0.28);
  },
  cctvDesk(g, p) {
    block(g, mat(0xffffff, { map: TX.laminate('#8a8478', 'cctvDesk'), rough: 0.5 }), 0, p.h - 0.02, 0, p.w, 0.05, p.d, 0.01);
    for (const x of [-p.w / 2 + 0.05, p.w / 2 - 0.05]) block(g, mat(0x5a5650), x, p.h / 2, 0, 0.05, p.h, p.d, 0.01);
    // the console: a VCR, the radio base, a microphone
    block(g, mat(0x1e1e1e, { rough: 0.4 }), 2.4, p.h + 0.05, 0.1, 0.43, 0.09, 0.3, 0.01);
    block(g, mat(0x3a3a3a), 2.4, p.h + 0.06, 0.255, 0.3, 0.02, 0.01, 0.002);
    block(g, mat(0x2a2a2a, { rough: 0.4 }), -1.6, p.h + 0.08, 0.25, 0.3, 0.14, 0.22, 0.02);
    cyl(g, BLACK(), -1.52, p.h + 0.28, 0.2, 0.006, 0.3);
    // a coffee mug, a clipboard
    cyl(g, mat(0x2a4a7a, { rough: 0.3 }), 1.2, p.h + 0.05, 0.25, 0.045, 0.1);
    block(g, mat(0xd8c090), -0.6, p.h + 0.005, 0.2, 0.25, 0.01, 0.33, 0.002);
  },
  monitorBank(g, p) {
    const cols = 4, rows = 2;
    g.userData.screens = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = -p.w / 2 + (c + 0.5) * p.w / cols, y = 1.38 + r * 0.6;
      block(g, mat(0xb8b4a8, { rough: 0.5 }), x, y, 0, p.w / cols - 0.06, 0.56, 0.5, 0.05);
      const s = plane(g, new THREE.MeshBasicMaterial({ color: 0x050805 }), p.w / cols - 0.24, 0.42, x, y + 0.01, 0.26);
      g.userData.screens.push(keep(s));
      plane(g, basic(0xffffff, TX.sign(`CAM ${r * cols + c + 1}`, { w: 128, h: 32, bg: '#b8b4a8', fg: '#2a2a2a', font: 'bold 22px Arial, sans-serif' })), 0.22, 0.055, x, y - 0.25, 0.255);
    }
    block(g, mat(0x5a5650), 0, 1.0, -0.1, p.w, 0.12, 0.35, 0.01);
  },
  alarmPanel(g, p) {
    block(g, mat(0x9a9c98, { rough: 0.4, metal: 0.3 }), 0, p.h / 2, -0.04, p.w + 0.1, p.h + 0.1, 0.08, 0.02);
    const c = document.createElement('canvas');
    c.width = 512; c.height = 300;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const scr = plane(g, new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.3, 1.3, 1.3) }), p.w, p.h, 0, p.h / 2, 0.01);
    keep(scr);
    g.userData.panel = { canvas: c, tex };
  },
  desk(g, p) {
    const w = wood('#6a5a4a', 'officeDesk');
    block(g, w, 0, p.h - 0.02, 0, p.w, 0.04, p.d, 0.01);
    block(g, w, p.w / 2 - 0.25, p.h / 2, 0, 0.45, p.h, p.d - 0.05, 0.01);
    block(g, w, -p.w / 2 + 0.03, p.h / 2, 0, 0.04, p.h, p.d - 0.05, 0.01);
    if (p.logbook) {
      const book = block(g, mat(0x2a3a5a, { rough: 0.6 }), 0.15, p.h + 0.02, 0.08, 0.32, 0.03, 0.24, 0.005);
      book.rotation.y = 0.2;
      block(g, mat(0xf0e8d4), 0.15, p.h + 0.037, 0.08, 0.3, 0.004, 0.22, 0.001).rotation.y = 0.2;
      cyl(g, mat(0x8a2a2a, { rough: 0.3 }), -0.5, p.h + 0.05, 0.1, 0.04, 0.1);
      // a desk lamp
      cyl(g, BLACK(), -0.75, p.h + 0.01, -0.25, 0.08, 0.02);
      beam(g, BLACK(), [-0.75, p.h, -0.25], [-0.7, p.h + 0.35, -0.15], 0.015, 0.015, true);
      place(g, cachedGeo('lampShade', () => new THREE.ConeGeometry(0.1, 0.14, 16, 1, true)), glowMat(0xffd9a0, 1.2), -0.68, p.h + 0.34, -0.1).rotation.x = 0.6;
    }
    if (p.pa) {
      block(g, mat(0x3a3a3a, { rough: 0.4 }), 0.3, p.h + 0.08, 0.05, 0.6, 0.14, 0.4, 0.02);
      for (let i = 0; i < 6; i++) block(g, mat(0x8a8a8a), 0.1 + i * 0.07, p.h + 0.16, 0.12, 0.03, 0.02, 0.08, 0.005);
      cyl(g, BLACK(), 0.42, p.h + 0.12, 0.25, 0.04, 0.03);
      beam(g, BLACK(), [0.42, p.h + 0.13, 0.25], [0.45, p.h + 0.35, 0.3], 0.01, 0.01, true);
      ball(g, mat(0x9a9a9a, { metal: 0.6, rough: 0.4 }), 0.45, p.h + 0.38, 0.31, 0.035, 0.05, 0.035);
    }
  },
  officeChair(g) {
    const blk = mat(0x1e1e1e, { rough: 0.7 });
    block(g, blk, 0, 0.48, 0, 0.5, 0.08, 0.5, 0.04);
    block(g, blk, 0, 0.86, -0.23, 0.46, 0.6, 0.06, 0.04).rotation.x = -0.08;
    cyl(g, METAL(), 0, 0.26, 0, 0.025, 0.42);
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      const l = block(g, blk, Math.sin(a) * 0.15, 0.05, Math.cos(a) * 0.15, 0.04, 0.03, 0.3, 0.012);
      l.rotation.y = a;
    }
  },
  watchclock(g, p) {
    block(g, mat(0x6a6a62, { rough: 0.4, metal: 0.4 }), 0, p.h / 2, 0, p.w, p.h, p.d, 0.03);
    plane(g, mat(0xf2ead8, { rough: 0.6 }), p.w - 0.15, 0.18, 0, p.h / 2 + 0.05, p.d / 2 + 0.002);
    // the paper tape curling out of it
    const t = block(g, mat(0xf4f0e6, { rough: 0.8 }), 0.05, -0.1, p.d / 2 - 0.05, 0.08, 0.25, 0.005, 0.001);
    t.rotation.x = 0.2;
  },
  keyCabinet(g, p) {
    block(g, mat(0x4a4a44, { rough: 0.5, metal: 0.4 }), 0, p.h / 2, 0, p.w, p.h, p.d, 0.02);
    block(g, mat(0xf0ead8), 0, p.h / 2, p.d / 2 + 0.002, p.w - 0.1, p.h - 0.1, 0.004, 0.001);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
      if ((r * 6 + c) % 7 === 3) continue;
      const k = block(g, mat(0xc8a858, { metal: 0.8, rough: 0.3 }), -p.w / 2 + 0.12 + c * 0.13, p.h - 0.2 - r * 0.24, p.d / 2 + 0.02, 0.025, 0.08, 0.008, 0.003);
      k.castShadow = false;
    }
  },
  lockers(g, p) {
    const n = p.n || 2;
    const body = mat(0x6a7a8a, { rough: 0.45, metal: 0.5 });
    g.userData.doors = [];
    for (let i = 0; i < n; i++) {
      const x = -p.w / 2 + (i + 0.5) * p.w / n;
      block(g, body, x, p.h / 2, 0, p.w / n - 0.02, p.h, p.d, 0.01);
      const hinge = keep(new THREE.Group());
      hinge.position.set(x - p.w / n / 2 + 0.02, 0, p.d / 2);
      g.add(hinge);
      const door = block(hinge, mat(0x7a8a9a, { rough: 0.4, metal: 0.5 }), p.w / n / 2 - 0.02, p.h / 2, 0.012, p.w / n - 0.05, p.h - 0.05, 0.02, 0.005);
      for (let k = 0; k < 4; k++) block(hinge, mat(0x3a4a5a), p.w / n / 2 - 0.02, p.h - 0.2 - k * 0.04, 0.025, p.w / n - 0.2, 0.012, 0.004, 0.001);
      if (p.daleAt === i) {
        // a combination dial
        cyl(hinge, mat(0x1a1a1a, { metal: 0.6 }), p.w / n - 0.12, 1.3, 0.03, 0.035, 0.02).rotation.x = Math.PI / 2;
        plane(hinge, basic(0xffffff, TX.sign('D. MERCER', { w: 128, h: 32, bg: '#f2ead8', fg: '#1a1a1a', font: 'bold 20px Arial, sans-serif' })), 0.2, 0.05, p.w / n / 2 - 0.02, 1.62, 0.024);
      }
      g.userData.doors.push(hinge);
      hinge.userData.door = door;
    }
  },
  coffee(g, p) {
    block(g, wood('#5a4a3a', 'coffeeTable'), 0, p.h / 2, 0, p.w, p.h, p.d, 0.02);
    block(g, mat(0x1a1a1a), -0.3, p.h + 0.18, 0, 0.3, 0.36, 0.3, 0.02);
    cyl(g, mat(0x3a2010, { opacity: 0.85, rough: 0.1 }), -0.3, p.h + 0.08, 0.06, 0.07, 0.14);
    for (let i = 0; i < 3; i++) cyl(g, mat(0xf0f0e8), 0.2 + i * 0.12, p.h + 0.05, 0.1, 0.04, 0.1);
  },
  safe(g, p) {
    block(g, mat(0x3a3e3a, { rough: 0.4, metal: 0.6 }), 0, p.h / 2, 0, p.w, p.h, p.d, 0.03);
    cyl(g, mat(0xc8c0a8, { metal: 0.8, rough: 0.3 }), 0.1, p.h * 0.6, p.d / 2 + 0.01, 0.08, 0.03).rotation.x = Math.PI / 2;
  },
  filing(g, p) {
    block(g, mat(0x7a7c74, { rough: 0.5, metal: 0.4 }), 0, p.h / 2, 0, p.w, p.h, p.d, 0.01);
    for (let i = 0; i < 4; i++) block(g, mat(0x9a9c94), 0, 0.2 + i * 0.33, p.d / 2 + 0.01, 0.2, 0.03, 0.02, 0.005);
  },
  lostFound(g, p) {
    block(g, mat(0x8a6a4a, { rough: 0.9 }), 0, p.h / 2, 0, p.w, p.h, p.d, 0.01);
    plane(g, basic(0xffffff, TX.sign('LOST + FOUND', { w: 256, h: 64, bg: '#f2ead8', fg: '#1a1a1a', font: 'bold 34px Arial, sans-serif' })), 0.6, 0.15, 0, p.h / 2, p.d / 2 + 0.005);
    ball(g, mat(0x2a2a6a), -0.3, p.h + 0.06, 0, 0.12, 0.06, 0.08);
    block(g, mat(0x1a1a1a), 0.2, p.h + 0.05, 0.05, 0.12, 0.08, 0.04, 0.01);
  },
  breakerPanel(g, p) {
    block(g, mat(0x8a8c88, { rough: 0.45, metal: 0.5 }), 0, p.h / 2, 0, p.w, p.h, p.d, 0.02);
    g.userData.switches = [];
    for (let i = 0; i < 6; i++) {
      const x = -p.w / 2 + 0.35 + i * (p.w - 0.7) / 5;
      block(g, mat(0x2a2a2a), x, p.h / 2, p.d / 2, 0.22, 0.4, 0.04, 0.01);
      const sw = keep(new THREE.Group());
      sw.position.set(x, p.h / 2, p.d / 2 + 0.03);
      g.add(sw);
      block(sw, mat(0xd82020, { rough: 0.4 }), 0, 0.08, 0, 0.08, 0.16, 0.06, 0.01);
      g.userData.switches.push(sw);
      plane(g, basic(0xffffff, TX.sign(['CONCOURSE', 'CENTER CT', 'FOOD CT', 'TENANTS', 'SERVICE', 'CCTV'][i], { w: 128, h: 32, bg: '#f2ead8', fg: '#1a1a1a', font: 'bold 20px Arial, sans-serif' })), 0.36, 0.09, x, p.h / 2 + 0.32, p.d / 2 + 0.002);
    }
    plane(g, basic(0xffffff, TX.sign('DANGER  480V', { w: 256, h: 48, bg: '#e8c020', fg: '#1a1a1a', font: 'bold 30px Arial, sans-serif' })), 0.8, 0.15, 0, p.h - 0.15, p.d / 2 + 0.002);
  },
  mopSink(g, p) {
    block(g, mat(0xd8d8d0, { rough: 0.3 }), 0, p.h / 2, 0, p.w, p.h, p.d, 0.04);
    cyl(g, mat(0x3a7ad8), 0.6, 0.35, 0.3, 0.2, 0.6);
    beam(g, wood('#c8a878', 'mop'), [0.6, 0.3, 0.3], [0.3, 1.6, -0.2], 0.02, 0.02, true);
  },
  vending(g, p) {
    block(g, mat(0xb81818, { rough: 0.4 }), 0, p.h / 2, 0, p.w, p.h, p.d, 0.03);
    const s = plane(g, shine(TX.stock('cleaning'), 1.4), p.w - 0.3, p.h - 0.6, -0.1, p.h / 2 + 0.1, p.d / 2 + 0.01);
    keep(s);
    block(g, mat(0x1a1a1a), p.w / 2 - 0.12, p.h / 2, p.d / 2, 0.14, 0.5, 0.02, 0.01);
  },
  fridge(g, p) {
    block(g, mat(0xe8e6de, { rough: 0.3 }), 0, p.h / 2, 0, p.w, p.h, p.d, 0.04);
    block(g, mat(0x9a9a92), p.w / 2 - 0.08, p.h * 0.6, p.d / 2 + 0.02, 0.03, 0.4, 0.03, 0.01);
  },
  pallet(g, p) {
    const w = wood('#a88a5a', 'pallet');
    for (let i = 0; i < 5; i++) block(g, w, -p.w / 2 + 0.12 + i * (p.w - 0.24) / 4, 0.14, 0, 0.1, 0.03, p.d, 0.005);
    for (const z of [-p.d / 2 + 0.05, 0, p.d / 2 - 0.05]) block(g, w, 0, 0.06, z, p.w, 0.1, 0.08, 0.005);
    const load = new THREE.Group();
    load.position.y = 0.16;
    g.add(load);
    build.boxes(load, { w: p.w - 0.1, d: p.d - 0.1, h: p.h - 0.16 });
  },
  dumpster(g, p) {
    block(g, mat(0x2a5a3a, { rough: 0.5, metal: 0.4 }), 0, p.h / 2, 0, p.w, p.h, p.d, 0.04);
    block(g, BLACK(), 0, p.h + 0.03, 0, p.w + 0.04, 0.06, p.d + 0.04, 0.01);
  },
  sinks(g, p) {
    block(g, mat(0xe8e4d8, { rough: 0.3 }), 0, p.h - 0.08, 0, p.w, 0.16, p.d, 0.02);
    for (let i = 0; i < 2; i++) {
      const x = -p.w / 4 + i * p.w / 2;
      cyl(g, mat(0xffffff, { rough: 0.2 }), x, p.h - 0.06, 0.02, 0.18, 0.14);
      beam(g, METAL(), [x, p.h, -0.2], [x, p.h + 0.18, -0.12], 0.02, 0.02, true);
    }
    // a long mirror on the wall behind
    plane(g, mat(0x8a9aa8, { rough: 0.05, metal: 0.95 }), p.w, 1.0, 0, p.h + 0.75, -p.d / 2 + 0.01);
  },
  stalls(g, p) {
    const m = mat(0x7a8a9a, { rough: 0.45, metal: 0.3 });
    const n = 3;
    for (let i = 0; i <= n; i++) block(g, m, -p.w / 2 + i * p.w / n, 1.05, 0, 0.04, 1.8, p.d, 0.005);
    for (let i = 0; i < n; i++) {
      const x = -p.w / 2 + (i + 0.5) * p.w / n;
      const door = block(g, m, x - (i === 2 ? 0.2 : 0), 1.05, p.d / 2, p.w / n - 0.12, 1.75, 0.03, 0.005);
      door.rotation.y = i === 1 ? 0.5 : 0;
      cyl(g, mat(0xf0f0ea, { rough: 0.2 }), x, 0.22, -p.d / 2 + 0.35, 0.2, 0.44);
    }
  },
  cart2(g, p) {
    block(g, mat(0x3a3a8a, { rough: 0.5 }), 0, 0.5, 0, p.w, 0.6, p.d, 0.03);
    cyl(g, mat(0xd8c020), 0, 0.85, p.d / 2 - 0.1, 0.12, 0.3);
    beam(g, wood('#c8a878', 'mop2'), [0, 0.5, p.d / 2 - 0.1], [0.1, 1.5, p.d / 2 - 0.2], 0.02, 0.02, true);
  },
};

// one prop, placed and turned
export function prop(p) {
  const g = new THREE.Group();
  const f = build[p.type];
  if (f) f(g, p);
  g.position.set(p.x, p.y || 0, p.z);
  g.rotation.y = (p.rot || 0) * Math.PI / 2;
  return g;
}

// --------------------------------------------------- doors and gates
// A shop's roll-down grille: a slatted curtain in a housing above the
// opening. `setOpen(k)` rolls it up (0 down .. 1 up); a padlock shows at
// the bottom bar when it's locked.
export function gateModel(d) {
  const g = new THREE.Group();
  const w = d.w, h = d.h;
  const tex = TX.tiled(TX.grille(), w / 0.6, h / 0.6);
  // blended, not cut out: up close you see every rod, from down the
  // concourse the grille is the grey haze a real one is
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 0.55, roughness: 0.4, alphaMap: tex, side: THREE.DoubleSide, transparent: true, depthWrite: false }));
  curtain.castShadow = false;
  const bar = block(g, mat(0x8a8e92, { metal: 0.7, rough: 0.3 }), 0, 0, 0, w, 0.08, 0.06, 0.01);
  const lock = block(g, mat(0xc8a030, { metal: 0.8, rough: 0.3 }), 0, -0.1, 0.06, 0.08, 0.1, 0.04, 0.01);
  g.add(curtain);
  block(g, mat(0x5a5e62, { metal: 0.5, rough: 0.5 }), 0, h + 0.12, 0, w + 0.2, 0.28, 0.28, 0.02).userData.fixed = true;
  for (const x of [-w / 2 - 0.04, w / 2 + 0.04]) block(g, mat(0x6a6e72, { metal: 0.6, rough: 0.4 }), x, h / 2, 0, 0.06, h, 0.1, 0.005).userData.fixed = true;
  const set = (open, locked) => {
    const down = Math.max(0.02, 1 - open);
    curtain.scale.y = down;
    curtain.position.y = h - (h * down) / 2;
    curtain.material.alphaMap.repeat.set(w / 0.6, (h * down) / 0.6);
    bar.position.y = h - h * down;
    lock.position.y = bar.position.y - 0.08;
    lock.visible = !!locked;
  };
  set(0, true);
  return { group: g, set };
}

// glass double doors to the parking lot (they stay shut; locked shows a bar)
export function glassDoors(d) {
  const g = new THREE.Group();
  const w = d.w, h = d.h;
  const frame = mat(0x2a2c2e, { metal: 0.6, rough: 0.35 });
  for (const s of [-1, 1]) {
    const leaf = new THREE.Group();
    leaf.position.x = s * w / 4;
    g.add(leaf);
    for (const x of [-w / 4 + 0.04, w / 4 - 0.04]) block(leaf, frame, x, h / 2, 0, 0.08, h, 0.07, 0.01);
    for (const y of [0.06, h - 0.05]) block(leaf, frame, 0, y, 0, w / 2, 0.12, 0.07, 0.01);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w / 2 - 0.12, h - 0.2), glass());
    pane.position.y = h / 2;
    leaf.add(pane);
    block(leaf, METAL(), 0, 1.0, 0.06, w / 2 - 0.3, 0.05, 0.05, 0.02);
    block(leaf, METAL(), 0, 1.0, -0.06, w / 2 - 0.3, 0.05, 0.05, 0.02);
  }
  for (const o of g.children) o.userData.fixed = true;
  const lockBar = block(g, mat(0xc82020, { rough: 0.4 }), 0, 1.0, 0.11, 0.12, 0.3, 0.04, 0.01);
  const set = (open, locked) => { lockBar.visible = !!locked; };
  return { group: g, set };
}

// a steel service door, hinged at one side
export function steelDoor(d, { cage = false } = {}) {
  const g = new THREE.Group();
  const w = d.w, h = d.h;
  const hinge = new THREE.Group();
  hinge.position.x = d.hinge === 'b' ? w / 2 : -w / 2;
  g.add(hinge);
  const dir = d.hinge === 'b' ? -1 : 1;
  let leaf;
  if (cage) {
    const tex = TX.tiled(TX.chainlink(), w / 0.25, h / 0.25);
    leaf = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.06, h - 0.06), new THREE.MeshStandardMaterial({ color: 0xa0a4a8, metalness: 0.6, roughness: 0.4, alphaMap: tex, side: THREE.DoubleSide, transparent: true, depthWrite: false }));
    leaf.castShadow = false;
    leaf.position.set(dir * w / 2, h / 2, 0);
    hinge.add(leaf);
    for (const y of [0.03, h - 0.03]) block(hinge, METAL(), dir * w / 2, y, 0, w, 0.04, 0.04, 0.01);
    for (const x of [0.02, w - 0.02]) block(hinge, METAL(), dir * x, h / 2, 0, 0.04, h, 0.04, 0.01);
  } else {
    leaf = block(hinge, mat(d.id === 'freezer' ? 0xc8ccd0 : 0x7a8088, { metal: 0.5, rough: 0.45 }), dir * w / 2, h / 2, 0, w - 0.02, h - 0.02, 0.05, 0.01);
    block(hinge, METAL(), dir * (w - 0.12), 1.0, 0.05, 0.04, 0.16, 0.06, 0.01);
    block(hinge, METAL(), dir * (w - 0.12), 1.0, -0.05, 0.04, 0.16, 0.06, 0.01);
    if (d.id === 'security') {
      plane(hinge, basic(0xffffff, TX.sign('SECURITY', { w: 256, h: 64, bg: '#f2ead8', fg: '#1a1a1a', font: 'bold 40px Arial, sans-serif' })), 0.5, 0.12, dir * w / 2, 1.6, 0.03);
      plane(hinge, basic(0xffffff, TX.sign('SECURITY', { w: 256, h: 64, bg: '#f2ead8', fg: '#1a1a1a', font: 'bold 40px Arial, sans-serif' })), 0.5, 0.12, dir * w / 2, 1.6, -0.03, Math.PI);
    }
  }
  const frame = mat(0x4a4e52, { metal: 0.5, rough: 0.5 });
  for (const x of [-w / 2 - 0.04, w / 2 + 0.04]) block(g, frame, x, h / 2, 0, 0.08, h, 0.14, 0.01).userData.fixed = true;
  block(g, frame, 0, h + 0.04, 0, w + 0.16, 0.08, 0.14, 0.01).userData.fixed = true;
  const set = (open) => { hinge.rotation.y = -dir * (d.swing || 1) * open * 1.6 * (d.axis === 'x' ? 1 : 1); };
  return { group: g, set };
}

// the loading dock's big door
export function rollupDoor(d) {
  const g = new THREE.Group();
  const w = d.w, h = d.h;
  const slats = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat(0xffffff, { map: TX.tiled(TX.vct('#8a8e92', '#7e8286', 'rollup'), 1, h / 0.3), metal: 0.4, rough: 0.5, side: THREE.DoubleSide }));
  slats.position.y = h / 2;
  slats.userData.fixed = true;
  g.add(slats);
  block(g, mat(0x3a3e42, { metal: 0.5, rough: 0.5 }), 0, h + 0.2, 0, w + 0.3, 0.4, 0.4, 0.02).userData.fixed = true;
  const lockBar = block(g, mat(0xc82020, { rough: 0.4 }), w / 2 - 0.3, 0.2, 0.05, 0.3, 0.1, 0.05, 0.01);
  const set = (open, locked) => { lockBar.visible = !!locked; };
  return { group: g, set };
}

// ------------------------------------------------------------- outside
// Dale's brown '84 Buick, frost on the glass
export function car() {
  const g = new THREE.Group();
  const paint = mat(0x5a3a22, { rough: 0.35, metal: 0.5 });
  const chrome = mat(0xc8c8c8, { rough: 0.15, metal: 0.95 });
  const frost = mat(0xc8d8e0, { rough: 0.6, opacity: 0.75 });
  block(g, paint, 0, 0.62, 0, 1.85, 0.55, 5.2, 0.08);
  block(g, paint, 0, 1.12, -0.25, 1.7, 0.5, 2.5, 0.12);
  for (const z of [0.98, -1.48]) {
    const w = block(g, frost, 0, 1.15, z, 1.6, 0.42, 0.04, 0.01);
    w.rotation.x = z > 0 ? -0.6 : 0.6;
  }
  for (const s of [-1, 1]) block(g, frost, s * 0.86, 1.15, -0.25, 0.02, 0.38, 2.3, 0.01);
  for (const z of [2.6, -2.6]) block(g, chrome, 0, 0.5, z, 1.9, 0.14, 0.08, 0.02);
  for (const [x, z] of [[-0.8, 1.7], [0.8, 1.7], [-0.8, -1.6], [0.8, -1.6]]) {
    const t = cyl(g, BLACK(), x, 0.34, z, 0.34, 0.24);
    t.rotation.z = Math.PI / 2;
  }
  for (const s of [-1, 1]) block(g, mat(0xf0e8c0, { emissive: 0x000000 }), s * 0.6, 0.66, 2.61, 0.4, 0.14, 0.02, 0.01);
  for (const s of [-1, 1]) block(g, mat(0x8a1010), s * 0.65, 0.7, -2.61, 0.4, 0.12, 0.02, 0.01);
  return g;
}

// a sodium lamp on a pole, for the parking lot
export function lotLamp() {
  const g = new THREE.Group();
  cyl(g, mat(0x3a3a38, { metal: 0.5, rough: 0.5 }), 0, 4, 0, 0.12, 8);
  beam(g, mat(0x3a3a38, { metal: 0.5 }), [0, 7.9, 0], [0, 7.9, 0.9], 0.1, 0.1);
  const head = block(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.9, 0.8) }), 0, 7.85, 1.0, 0.7, 0.12, 0.4, 0.02);
  head.castShadow = false;
  return g;
}

// an EXIT sign, lit
export function exitSign() {
  const g = new THREE.Group();
  block(g, mat(0xe8e8e0, { rough: 0.4 }), 0, 0, 0, 0.62, 0.26, 0.08, 0.02);
  const s = new THREE.Mesh(cachedGeo('exitPlane', () => new THREE.PlaneGeometry(0.54, 0.2)), new THREE.MeshBasicMaterial({ map: TX.sign('EXIT', { w: 256, h: 96, bg: '#1a0404', fg: '#ff3020', font: 'bold 72px Arial, sans-serif' }), color: new THREE.Color(2.6, 2.6, 2.6) }));
  s.position.z = 0.041;
  g.add(s);
  const s2 = s.clone();
  s2.position.z = -0.041;
  s2.rotation.y = Math.PI;
  g.add(s2);
  return g;
}

// a clock station on the wall: the box and the key on its chain
export function station(n) {
  const g = new THREE.Group();
  block(g, mat(0x5a6066, { metal: 0.5, rough: 0.45 }), 0, 0, 0.06, 0.2, 0.3, 0.12, 0.02);
  plane(g, mat(0xffffff, { map: TX.stationFace(n), rough: 0.5 }), 0.18, 0.27, 0, 0, 0.121);
  const key = keep(new THREE.Group());
  key.position.set(0, -0.08, 0.14);
  g.add(key);
  block(key, mat(0xc8a858, { metal: 0.8, rough: 0.3 }), 0, -0.04, 0, 0.02, 0.07, 0.008, 0.003);
  block(key, mat(0xc8a858, { metal: 0.8, rough: 0.3 }), 0, 0, 0, 0.04, 0.025, 0.008, 0.003);
  g.userData.key = key;
  return g;
}

// the flashlight a guard (or it) carries
export function flashlightModel() {
  const g = new THREE.Group();
  cyl(g, mat(0x1a1a1a, { rough: 0.45, metal: 0.5 }), 0, -0.1, 0, 0.022, 0.2);
  cyl(g, mat(0x2a2a2a, { rough: 0.35, metal: 0.6 }), 0, -0.21, 0, 0.032, 0.04);
  return g;
}

export { box, block, cyl, ball, beam, plane, mat, glass, basic, shine, keep };
