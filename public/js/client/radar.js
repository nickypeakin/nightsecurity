// The radar in the corner (the island from above, turning with the camera,
// with blips for the job, your friends, the police when they're after you,
// and the places that matter) and the full map (M), which you can zoom
// (the wheel, or + and -) and drag about.
//
// Both draw from one picture of the whole island, a pixel to a metre, with
// a sharper picture of the city laid over it.

import { BLOCKS, BUILDINGS, GROUNDS, NODES, EDGES, CITY_EDGES, ROAD, HARBOR, PLACES } from '../shared/city.js';
import { TOWN, GROUND as TOWN_GROUND } from '../shared/plan.js';
import { GRID, HEIGHT, ROUTES, COUNTRY, SIGN, SUMMIT, PEAKS, LAKE, SEA_Y, desertness, waterY, shoreDist } from '../shared/world.js';
import { cityMap } from './textures.js';
import { COLORS } from './ui.js';

// the island picture: a pixel to a metre
const ISL = { x0: GRID.x0, z0: GRID.z0, w: (GRID.nx - 1) * GRID.cell, h: (GRID.nz - 1) * GRID.cell };
const SEA = '#16324a';

const POIS = [
  ['hospital', 'H', '#ff6a6a'], ['police', 'P', '#7aa8ff'], ['guns', '⌖', '#ffd06a'], ['spray', 'S', '#ff7ad8'], ['safehouse', '⌂', '#7aff9a'],
];
const BLIP = { dest: '#ffd040', check: '#ff4040', check2: '#a04040', car: '#5ab0ff', enemy: '#ff4040', pickup: '#50e070', friend: '#5ab0ff' };

// names on the big map: [text, x, z, size]
const NAMES = [
  ['SAN CIELO', (TOWN.x0 + TOWN.x1) / 2, (TOWN.z0 + TOWN.z1) / 2 - 40, 1.6], ['PELICAN BEACH', TOWN.x0 - 70, -120, 1], ['STARLIGHT HILLS', -140, -560, 1.05], ['REDWATER DESERT', 60, -1150, 1.15],
  ['LAKE CORRIGAN', LAKE.x, LAKE.z, 1], ['DUST CREEK', 330, -1290, 0.95], ['MOUNT CALDER', PEAKS[8][0] + 50, PEAKS[8][1] + 40, 1],
  ['MOUNT HARLOW', SUMMIT.x, SUMMIT.z + 60, 1.15], ['CEDAR FOREST', 120, -1960, 1], ['PORT KERRY', 0, -2500, 1.05], ['REDWATER AIRSTRIP', 70, -890, 0.75],
  ['SAN CIELO INTERNATIONAL', -690, 372, 0.85], ['EASTGATE SHORE', 640, -200, 0.9],
];

// each district's name goes in the middle of its blocks
const DISTRICTS = new Map();
for (const b of BLOCKS) {
  const d = DISTRICTS.get(b.name) || { x: 0, z: 0, n: 0 };
  const a = (b.x1 - b.x0) * (b.z1 - b.z0);
  d.x += (b.x0 + b.x1) / 2 * a; d.z += (b.z0 + b.z1) / 2 * a; d.n += a;
  DISTRICTS.set(b.name, d);
}
for (const d of DISTRICTS.values()) { d.x /= d.n; d.z /= d.n; }

// the island from above, a pixel to a metre
let island = null;
function islandPicture() {
  if (island) return island;
  const NX = GRID.nx, NZ = GRID.nz, C = GRID.cell;
  // one pixel a sample, coloured and shaded, then scaled up smoothly
  const small = document.createElement('canvas');
  small.width = NX; small.height = NZ;
  const sx = small.getContext('2d');
  const img = sx.createImageData(NX, NZ);
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const K = { grass: hex('#3d5a33'), forest: hex('#2b4529'), dry: hex('#6d6a45'), desert: hex('#9c8a5c'), beach: hex('#b9ab7e'), rock: hex('#76726a'), lake: hex('#21566e') };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const k = j * NX + i, h = HEIGHT[k], x = GRID.x0 + i * C, z = GRID.z0 + j * C;
      let c;
      const wy = waterY(x, z);
      if (h < wy) {
        if (wy > SEA_Y) c = K.lake;
        else { const d = Math.min(1, (wy - h) / 12); c = mix(hex('#2a5a76'), hex(SEA), d); }
      } else {
        const hl = HEIGHT[k - (i > 0 ? 1 : 0)], hu = HEIGHT[k - (j > 0 ? NX : 0)];
        const shade = Math.max(0.55, Math.min(1.35, 1 + ((hl - h) + (hu - h)) * 0.09));
        c = K.grass;
        const des = desertness(x, z);
        c = mix(c, K.dry, Math.min(1, des * 1.2));
        c = mix(c, K.desert, Math.max(0, des - 0.45) * 1.8);
        if (z < -1450) c = mix(c, K.forest, Math.min(1, (-1450 - z) / 300) * (1 - des));
        if (h > 150) c = mix(c, K.rock, Math.min(1, (h - 150) / 90));
        if (h < 2.6 && h >= wy && shoreDist(x, z) < 140) c = mix(c, K.beach, Math.min(1, (2.6 - h) / 1.2));
        if (h === -0.3) c = hex('#30343a');
        c = c.map((v) => v * shade);
      }
      img.data.set([c[0], c[1], c[2], 255], k * 4);
    }
  }
  sx.putImageData(img, 0, 0);
  const big = document.createElement('canvas');
  big.width = ISL.w; big.height = ISL.h;
  const g = big.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.drawImage(small, 0, 0, NX, NZ, -C / 2, -C / 2, ISL.w + C, ISL.h + C);
  const P = (x, z) => [x - ISL.x0, z - ISL.z0];
  // the airstrip, the towns' lots and buildings, the pier
  g.fillStyle = '#3a3a3c';
  for (const S of COUNTRY.strips) g.fillRect(...P(S.x0, S.z0), S.x1 - S.x0, S.z1 - S.z0);
  g.fillStyle = 'rgba(120,120,116,0.55)';
  for (const p of COUNTRY.pads) if (p.kind !== 4) g.fillRect(...P(p.x0, p.z0), p.x1 - p.x0, p.z1 - p.z0);
  g.fillStyle = '#8a8a86';
  for (const b of COUNTRY.buildings) g.fillRect(...P(b.x0, b.z0), b.x1 - b.x0, b.z1 - b.z0);
  g.fillStyle = '#7a5a3a';
  const pier = COUNTRY.pier;
  g.fillRect(...P(pier.x0, pier.z0), pier.x1 - pier.x0, pier.z1 - pier.z0);
  // the highways, outlined
  const line = (w, col) => {
    g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round';
    for (const r of ROUTES) {
      g.beginPath();
      r.pts.forEach((p, i) => (i ? g.lineTo(...P(p.x, p.z)) : g.moveTo(...P(p.x, p.z))));
      g.stroke();
    }
  };
  line(16, 'rgba(10,12,14,0.8)');
  line(10, '#d6d2c4');
  // the sign on the hill
  g.fillStyle = '#f4f2ec';
  g.fillRect(...P(SIGN.x - 38, SIGN.z - 2), 76, 4);
  island = big;
  return big;
}

export class Radar {
  constructor(canvas, mapCanvas) {
    this.c = canvas;
    this.x = canvas.getContext('2d');
    this.m = mapCanvas;
    this.mx = mapCanvas.getContext('2d');
    this.img = cityMap({ TOWN, TOWN_GROUND, BLOCKS, GROUNDS, BUILDINGS, NODES, EDGES, CITY_EDGES, ROAD, HARBOR }).canvas;
    this.isl = islandPicture();
    this.t = 0;
    // the big map's view: centre and pixels per metre
    this.view = { x: 0, z: -600, k: 0 };
    const M = mapCanvas;
    this.drag = null;
    M.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomAt(e.deltaY < 0 ? 1.25 : 0.8, e.offsetX, e.offsetY); }, { passive: false });
    M.addEventListener('pointerdown', (e) => { this.drag = { x: e.clientX, y: e.clientY }; M.setPointerCapture(e.pointerId); });
    M.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const dpr = this.dpr || 1;
      this.view.x -= ((e.clientX - this.drag.x) * dpr) / this.view.k;
      this.view.z -= ((e.clientY - this.drag.y) * dpr) / this.view.k;
      this.drag = { x: e.clientX, y: e.clientY };
      this.clampView();
    });
    const end = () => { this.drag = null; };
    M.addEventListener('pointerup', end);
    M.addEventListener('pointercancel', end);
  }

  // open the map on you, close enough to see where you are (once it's
  // on screen and knows its size)
  openMap(x, z) { this.view = { x, z, k: 0 }; }
  fitK(W, H) { return Math.min(W / (ISL.w + 120), H / (ISL.h + 120)); }
  // zoom by f, keeping the spot under (px, py) (CSS pixels) where it is
  zoomAt(f, px = null, py = null) {
    const c = this.m, dpr = this.dpr || 1, V = this.view;
    const W = c.width, H = c.height;
    const sx = px == null ? W / 2 : px * dpr, sy = py == null ? H / 2 : py * dpr;
    const wx = V.x + (sx - W / 2) / V.k, wz = V.z + (sy - H / 2) / V.k;
    V.k = Math.max(this.fitK(W, H), Math.min(6 * dpr, V.k * f));
    V.x = wx - (sx - W / 2) / V.k;
    V.z = wz - (sy - H / 2) / V.k;
    this.clampView();
  }
  pan(dx, dz) { this.view.x += dx / this.view.k; this.view.z += dz / this.view.k; this.clampView(); }
  // keep the island in view (in the middle, if it's smaller than the screen)
  clampView() {
    const V = this.view, c = this.m;
    const hw = c.width / 2 / (V.k || 1), hh = c.height / 2 / (V.k || 1);
    const fit = (v, lo, hi, half) => (hi - lo <= half * 2 ? (lo + hi) / 2 : Math.max(lo + half, Math.min(hi - half, v)));
    V.x = fit(V.x, ISL.x0 + 60, ISL.x0 + ISL.w - 60, hw);
    V.z = fit(V.z, ISL.z0 + 40, ISL.z0 + ISL.h, hh);
  }

  // the island and the city, drawn so that world (wx, wz) lands on (0, 0)
  // at s pixels per metre, `reach` metres round it
  ground(ctx, wx, wz, s, reach) {
    ctx.fillStyle = SEA;
    ctx.fillRect(-reach * s, -reach * s, reach * 2 * s, reach * 2 * s);
    // just the part of the island picture that's in view
    const sx = Math.max(0, wx - reach - ISL.x0), sy = Math.max(0, wz - reach - ISL.z0);
    const ex = Math.min(ISL.w, wx + reach - ISL.x0), ey = Math.min(ISL.h, wz + reach - ISL.z0);
    if (ex > sx && ey > sy) ctx.drawImage(this.isl, sx, sy, ex - sx, ey - sy, (ISL.x0 + sx - wx) * s, (ISL.z0 + sy - wz) * s, (ex - sx) * s, (ey - sy) * s);
    // the city, sharper
    // (just the part in view, like the island)
    const k = this.img.width / (TOWN.x1 - TOWN.x0);
    const x0 = Math.max(TOWN.x0, wx - reach), x1 = Math.min(TOWN.x1, wx + reach), z0 = Math.max(TOWN.z0, wz - reach), z1 = Math.min(TOWN.z1, wz + reach);
    if (x1 > x0 && z1 > z0) ctx.drawImage(this.img, (x0 - TOWN.x0) * k, (z0 - TOWN.z0) * k, (x1 - x0) * k, (z1 - z0) * k, (x0 - wx) * s, (z0 - wz) * s, (x1 - x0) * s, (z1 - z0) * s);
  }

  // blips: [{ x, z, k (kind), l (letter), c (colour) }]; players: [{ x, z,
  // h, color, me }]; police: [{ x, z }]
  draw({ x, z, yaw, h, blips, players, police, range = 90, t = 0 }) {
    const c = this.c, ctx = this.x;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const S = Math.round(c.clientWidth * dpr) || 200;
    if (c.width !== S) { c.width = S; c.height = S; }
    const R = S / 2, scale = R / range;
    ctx.save();
    ctx.clearRect(0, 0, S, S);
    ctx.beginPath();
    ctx.arc(R, R, R - 1, 0, Math.PI * 2);
    ctx.clip();
    // the map, turned with the camera
    ctx.translate(R, R);
    ctx.rotate(yaw);
    ctx.globalAlpha = 0.92;
    this.ground(ctx, x, z, scale, range * 1.5);
    ctx.globalAlpha = 1;
    // blips, kept to the edge if they're off it
    const put = (bx, bz, draw, edge = false) => {
      let dx = (bx - x) * scale, dz = (bz - z) * scale;
      const d = Math.hypot(dx, dz);
      if (d > R - 8) { if (!edge) return; dx *= (R - 8) / d; dz *= (R - 8) / d; }
      // undo the turn for the symbol itself
      const cs = Math.cos(yaw), sn = Math.sin(yaw);
      const sx = dx * cs - dz * sn, sy = dx * sn + dz * cs;
      ctx.save();
      ctx.rotate(-yaw);
      ctx.translate(sx, sy);
      draw(ctx, dpr);
      ctx.restore();
    };
    for (const [key, l, col] of POIS) {
      const p = PLACES[key];
      if (p) put(p.x, p.z, (g, s) => icon(g, s, l, col, 7), false);
    }
    const flash = Math.floor(t * 4) % 2;
    for (const p of police || []) put(p.x, p.z, (g, s) => { g.fillStyle = flash ? '#ff3030' : '#3060ff'; g.beginPath(); g.arc(0, 0, 3.4 * s, 0, 7); g.fill(); });
    for (const b of blips || []) {
      if (b.k === 'mycar') put(b.x, b.z, (g, s) => carIcon(g, s, 1), true);
      else if (b.k === 'giver') put(b.x, b.z, (g, s) => icon(g, s, b.l, b.c, 9), true);
      else put(b.x, b.z, (g, s) => { g.fillStyle = BLIP[b.k] || '#ffd040'; g.strokeStyle = '#000'; g.lineWidth = 1.5 * s; g.beginPath(); g.arc(0, 0, (b.k === 'check2' ? 3.5 : 5) * s, 0, 7); g.fill(); g.stroke(); }, true);
    }
    for (const p of players || []) {
      if (p.me) continue;
      put(p.x, p.z, (g, s) => { g.fillStyle = COLORS[p.color % 4]; g.strokeStyle = '#000'; g.lineWidth = 1.5 * s; g.beginPath(); g.arc(0, 0, 4.5 * s, 0, 7); g.fill(); g.stroke(); }, true);
    }
    ctx.restore();
    // you: an arrow in the middle, pointing the way you face
    ctx.save();
    ctx.translate(R, R);
    ctx.rotate(yaw - h + Math.PI);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.moveTo(0, -8 * dpr); ctx.lineTo(5.5 * dpr, 6 * dpr); ctx.lineTo(0, 3 * dpr); ctx.lineTo(-5.5 * dpr, 6 * dpr); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    // north
    ctx.save();
    ctx.translate(R, R);
    ctx.rotate(yaw);
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${10 * dpr}px Inter, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', 0, -(R - 9 * dpr));
    ctx.restore();
  }

  // the whole island (M), at the view's zoom
  drawMap({ blips, players }) {
    const c = this.m, ctx = this.mx;
    const W = c.clientWidth, H = c.clientHeight;
    const dpr = (this.dpr = Math.min(2, window.devicePixelRatio || 1));
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const V = this.view;
    if (!V.k) { V.k = Math.max(this.fitK(c.width, c.height), Math.min(c.width, c.height) / 1300); this.clampView(); }
    const k = V.k, cw = c.width, ch = c.height;
    const P = (vx, vz) => [cw / 2 + (vx - V.x) * k, ch / 2 + (vz - V.z) * k];
    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    ctx.imageSmoothingEnabled = true;
    this.ground(ctx, V.x, V.z, k, Math.hypot(cw, ch) / k / 2 + 10);
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // the places, and the city's districts once you're close enough
    const fs = Math.max(10 * dpr, Math.min(15 * dpr, k * 9));
    for (const [text, x, z, size] of NAMES) {
      const [px, py] = P(x, z);
      ctx.font = `800 ${fs * size}px Inter, Arial, sans-serif`;
      ctx.lineWidth = 3 * dpr;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.fillStyle = 'rgba(255,255,255,0.86)';
      ctx.strokeText(text, px, py);
      ctx.fillText(text, px, py);
    }
    if (k > 1.1 * dpr) {
      ctx.font = `bold ${Math.min(13 * dpr, k * 5)}px Inter, Arial, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      for (const [name, d] of DISTRICTS) {
        const [px, py] = P(d.x, d.z);
        ctx.fillText(name.toUpperCase(), px, py);
      }
    }
    for (const [key, l, col] of POIS) {
      const p = PLACES[key];
      const [px, py] = P(p.x, p.z);
      ctx.save(); ctx.translate(px, py); icon(ctx, dpr * 1.2, l, col, 8); ctx.restore();
    }
    for (const b of blips || []) {
      const [px, py] = P(b.x, b.z);
      ctx.save(); ctx.translate(px, py);
      if (b.k === 'giver') icon(ctx, dpr * 1.3, b.l, b.c, 9);
      else if (b.k === 'mycar') carIcon(ctx, dpr, 1.4);
      else { ctx.fillStyle = BLIP[b.k] || '#ffd040'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 6 * dpr, 0, 7); ctx.fill(); ctx.stroke(); }
      ctx.restore();
    }
    for (const p of players || []) {
      const [px, py] = P(p.x, p.z);
      ctx.save(); ctx.translate(px, py);
      ctx.rotate(Math.PI - p.h);
      ctx.fillStyle = p.me ? '#ffffff' : COLORS[p.color % 4];
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -10 * dpr); ctx.lineTo(7 * dpr, 7 * dpr); ctx.lineTo(0, 3 * dpr); ctx.lineTo(-7 * dpr, 7 * dpr); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    // a scale bar
    const m = [50, 100, 250, 500, 1000].find((q) => q * k > 70 * dpr) || 1000;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(16 * dpr, ch - 18 * dpr, m * k, 3 * dpr);
    ctx.font = `600 ${11 * dpr}px Inter, Arial, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(m >= 1000 ? `${m / 1000} km` : `${m} m`, 16 * dpr, ch - 30 * dpr);
  }
}

// your car: a blue arrowhead with a white edge
function carIcon(g, s, k) {
  g.fillStyle = '#4aa8ff';
  g.strokeStyle = '#fff';
  g.lineWidth = 1.6 * s;
  g.beginPath();
  g.moveTo(0, -7 * s * k); g.lineTo(6 * s * k, 6 * s * k); g.lineTo(-6 * s * k, 6 * s * k); g.closePath();
  g.fill(); g.stroke();
}

// a round icon with a letter
function icon(g, s, l, col, r) {
  g.fillStyle = '#101010';
  g.strokeStyle = col;
  g.lineWidth = 1.8 * s;
  g.beginPath(); g.arc(0, 0, r * s, 0, 7); g.fill(); g.stroke();
  g.fillStyle = col;
  g.font = `bold ${r * 1.25 * s}px Inter, Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(l, 0, 0.5 * s);
}
