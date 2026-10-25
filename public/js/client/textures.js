// Every texture in the game is painted onto a canvas at start-up: there are
// no image files to download. Surfaces are painted to tile and mapped in
// world metres (see `meters`). Building fronts come in pairs: the facade by
// day, and a glow map of which windows have their lights on tonight.

import * as THREE from 'three';
import { makeRng } from '../shared/rng.js';

const cache = new Map();

// Textures are painted in "design" pixels and stored at `scale` times that
// size so they stay sharp up close.
const SCALE = 2;
function canvas(w, h, scale = SCALE) {
  const c = document.createElement('canvas');
  c.width = w * scale;
  c.height = h * scale;
  const x = c.getContext('2d');
  x.scale(scale, scale);
  return [c, x];
}

function toTexture(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

// a copy of a cached texture with its own repeat
export function tiled(tex, rx, ry) {
  const t = tex.clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}
// a copy that repeats every `w` by `h` metres (for world-mapped surfaces)
export const meters = (tex, w, h = w) => tiled(tex, 1 / w, 1 / h);

// per-pixel brightness noise
function grain(ctx, amount, rng) {
  const img = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function blotch(ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color.replace('A', alpha));
  g.addColorStop(1, color.replace('A', 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

// --------------------------------------------------------------- ground --
export const asphalt = () => cached('asphalt', () => {
  const S = 256, rng = makeRng('asphalt');
  const [c, x] = canvas(S, S, 1);
  x.fillStyle = '#3a3a3c';
  x.fillRect(0, 0, S, S);
  for (let k = 0; k < 14; k++) blotch(x, rng() * S, rng() * S, 20 + rng() * 50, rng() < 0.5 ? 'rgba(20,20,22,A)' : 'rgba(80,80,80,A)', 0.25);
  for (let k = 0; k < 700; k++) { x.fillStyle = `rgba(${rng() < 0.5 ? '120,120,118' : '20,20,20'},${0.3 + rng() * 0.4})`; x.fillRect(rng() * S, rng() * S, 1 + rng() * 1.5, 1 + rng() * 1.5); }
  // a crack or two
  x.strokeStyle = 'rgba(15,15,15,0.6)';
  x.lineWidth = 1;
  for (let k = 0; k < 3; k++) {
    let px = rng() * S, py = rng() * S;
    x.beginPath(); x.moveTo(px, py);
    for (let s = 0; s < 8; s++) { px += (rng() - 0.5) * 30; py += rng() * 20; x.lineTo(px, py); }
    x.stroke();
  }
  grain(x, 18, rng);
  return toTexture(c);
});

export const sidewalk = () => cached('sidewalk', () => {
  const S = 256, rng = makeRng('sidewalk');
  const [c, x] = canvas(S, S, 1);
  x.fillStyle = '#8c8a84';
  x.fillRect(0, 0, S, S);
  for (let k = 0; k < 10; k++) blotch(x, rng() * S, rng() * S, 30 + rng() * 40, rng() < 0.6 ? 'rgba(60,58,54,A)' : 'rgba(170,168,160,A)', 0.2);
  // 1.5 m slabs (the texture covers 3 m)
  x.strokeStyle = 'rgba(40,40,38,0.75)';
  x.lineWidth = 2;
  for (let k = 0; k <= 2; k++) { x.beginPath(); x.moveTo(k * S / 2, 0); x.lineTo(k * S / 2, S); x.stroke(); x.beginPath(); x.moveTo(0, k * S / 2); x.lineTo(S, k * S / 2); x.stroke(); }
  for (let k = 0; k < 6; k++) { x.fillStyle = 'rgba(20,20,20,0.25)'; x.beginPath(); x.arc(rng() * S, rng() * S, 2 + rng() * 4, 0, 7); x.fill(); }   // gum
  grain(x, 22, rng);
  return toTexture(c);
});

export const grass = () => cached('grass', () => {
  const S = 256, rng = makeRng('grass');
  const [c, x] = canvas(S, S, 1);
  x.fillStyle = '#2c3a1e';
  x.fillRect(0, 0, S, S);
  for (let k = 0; k < 16; k++) blotch(x, rng() * S, rng() * S, 30 + rng() * 50, rng() < 0.5 ? 'rgba(20,30,12,A)' : 'rgba(70,82,40,A)', 0.35);
  for (let k = 0; k < 2600; k++) { x.strokeStyle = `rgba(${60 + rng() * 60},${80 + rng() * 60},${30 + rng() * 20},0.5)`; const px = rng() * S, py = rng() * S; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (rng() - 0.5) * 2, py - 2 - rng() * 3); x.stroke(); }
  grain(x, 16, rng);
  return toTexture(c);
});

// the land's fine detail, grey (the ground's colour is in the mesh)
export const terrainDetail = () => cached('terrain', () => {
  const S = 256, rng = makeRng('terrain');
  const [c, x] = canvas(S, S, 1);
  x.fillStyle = '#d8d8d8';
  x.fillRect(0, 0, S, S);
  for (let k = 0; k < 40; k++) blotch(x, rng() * S, rng() * S, 14 + rng() * 40, rng() < 0.5 ? 'rgba(150,150,150,A)' : 'rgba(255,255,255,A)', 0.35);
  for (let k = 0; k < 2400; k++) { const v = 150 + rng() * 105 | 0; x.fillStyle = `rgba(${v},${v},${v},0.5)`; x.fillRect(rng() * S, rng() * S, 1 + rng() * 2, 1 + rng() * 2); }
  grain(x, 30, rng);
  return toTexture(c);
});

// one big white letter (for the sign on the hill)
export const letter = (ch) => cached(`letter:${ch}`, () => {
  const [c, x] = canvas(128, 160, 1);
  x.clearRect(0, 0, 128, 160);
  x.fillStyle = '#f4f2ec';
  x.font = 'bold 168px Anton, Impact, "Arial Black", sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'alphabetic';
  x.fillText(ch, 64, 152);
  return toTexture(c, { repeat: false });
});

export const dirt = () => cached('dirt', () => {
  const S = 256, rng = makeRng('dirt');
  const [c, x] = canvas(S, S, 1);
  x.fillStyle = '#5a4a38';
  x.fillRect(0, 0, S, S);
  for (let k = 0; k < 20; k++) blotch(x, rng() * S, rng() * S, 20 + rng() * 40, rng() < 0.5 ? 'rgba(40,32,24,A)' : 'rgba(110,96,78,A)', 0.35);
  for (let k = 0; k < 500; k++) { x.fillStyle = `rgba(${130 + rng() * 60},${120 + rng() * 50},${100 + rng() * 40},0.5)`; x.fillRect(rng() * S, rng() * S, 1 + rng() * 2, 1 + rng() * 2); }
  grain(x, 26, rng);
  return toTexture(c);
});

export const concrete = (tint = '#7a7872', key = 'concrete') => cached(`concrete:${tint}:${key}`, () => {
  const S = 256, rng = makeRng(key);
  const [c, x] = canvas(S, S, 1);
  x.fillStyle = tint;
  x.fillRect(0, 0, S, S);
  for (let k = 0; k < 14; k++) blotch(x, rng() * S, rng() * S, 30 + rng() * 60, rng() < 0.5 ? 'rgba(40,40,38,A)' : 'rgba(150,148,140,A)', 0.2);
  x.strokeStyle = 'rgba(30,30,30,0.5)';
  x.lineWidth = 1.5;
  x.beginPath(); x.moveTo(0, S / 2); x.lineTo(S, S / 2); x.moveTo(S / 2, 0); x.lineTo(S / 2, S); x.stroke();
  grain(x, 20, rng);
  return toTexture(c);
});

export const pavers = () => cached('pavers', () => {
  const S = 256, rng = makeRng('pavers');
  const [c, x] = canvas(S, S, 1);
  x.fillStyle = '#6a625a';
  x.fillRect(0, 0, S, S);
  const n = 8, w = S / n;
  for (let j = 0; j < n * 2; j++) {
    for (let i = 0; i < n; i++) {
      const off = j % 2 ? w / 2 : 0;
      const v = 90 + rng() * 40;
      x.fillStyle = `rgb(${v + 10},${v},${v - 8})`;
      x.fillRect(i * w + off + 1, j * w / 2 + 1, w - 2, w / 2 - 2);
    }
  }
  grain(x, 18, rng);
  return toTexture(c);
});

// --------------------------------------------------------------- floors --
// indoors: planks, tiles, a diner's chequerboard, carpet, linoleum (each
// texture covers 2 m)
export const floorTex = (kind) => cached(`floor:${kind}`, () => {
  const S = 256, rng = makeRng(`floor:${kind}`);
  const [c, x] = canvas(S, S, 1);
  if (kind === 'wood') {
    x.fillStyle = '#7a5434';
    x.fillRect(0, 0, S, S);
    const n = 8, w = S / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < 3; j++) {
        const len = S / 2 + rng() * S / 2, y0 = ((i * 97 + j * 61) % 4) * S / 4 + j * len;
        const v = rng();
        x.fillStyle = `rgb(${110 + v * 40},${74 + v * 28},${44 + v * 18})`;
        x.fillRect(i * w + 1, y0 % S, w - 2, len);
        x.fillRect(i * w + 1, (y0 % S) - S, w - 2, len);
      }
      x.fillStyle = 'rgba(30,18,8,0.7)';
      x.fillRect(i * w, 0, 1.5, S);
    }
    for (let k = 0; k < 300; k++) { x.fillStyle = `rgba(40,24,10,${rng() * 0.25})`; x.fillRect(rng() * S, rng() * S, 1, 6 + rng() * 20); }
  } else if (kind === 'checker') {
    const n = 8, w = S / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { x.fillStyle = (i + j) % 2 ? '#1a1a1c' : '#e8e4da'; x.fillRect(i * w, j * w, w, w); }
  } else if (kind === 'tile') {
    x.fillStyle = '#5a5a58';
    x.fillRect(0, 0, S, S);
    const n = 4, w = S / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = 150 + rng() * 25; x.fillStyle = `rgb(${v},${v},${v - 6})`; x.fillRect(i * w + 2, j * w + 2, w - 4, w - 4); }
  } else if (kind === 'carpet') {
    x.fillStyle = '#3a4a5a';
    x.fillRect(0, 0, S, S);
    for (let k = 0; k < 4000; k++) { const v = rng(); x.fillStyle = `rgba(${v < 0.5 ? '20,30,40' : '90,110,130'},0.35)`; x.fillRect(rng() * S, rng() * S, 1.5, 1.5); }
  } else if (kind === 'lino') {
    x.fillStyle = '#b8a888';
    x.fillRect(0, 0, S, S);
    const n = 4, w = S / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { x.fillStyle = (i + j) % 2 ? 'rgba(120,96,60,0.35)' : 'rgba(255,250,230,0.15)'; x.fillRect(i * w, j * w, w, w); }
  } else {
    x.fillStyle = '#7a7872';
    x.fillRect(0, 0, S, S);
    for (let k = 0; k < 14; k++) blotch(x, rng() * S, rng() * S, 30 + rng() * 60, rng() < 0.5 ? 'rgba(40,40,38,A)' : 'rgba(150,148,140,A)', 0.2);
  }
  grain(x, 14, rng);
  return toTexture(c);
});

// the guns on Kingsgate Arms' back wall: pegboard and silhouettes
export const gunWall = () => cached('gunWall', () => {
  const W = 1024, H = 256, rng = makeRng('gunWall');
  const [c, x] = canvas(W, H, 1);
  x.fillStyle = '#8a7458';
  x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(40,30,20,0.6)';
  for (let i = 8; i < W; i += 16) for (let j = 8; j < H; j += 16) { x.beginPath(); x.arc(i, j, 2, 0, 7); x.fill(); }
  const gun = (gx, gy, s, long) => {
    x.fillStyle = '#16161a';
    x.fillRect(gx, gy, (long ? 150 : 60) * s, 12 * s);
    x.fillRect(gx + (long ? 30 : 10) * s, gy + 10 * s, 14 * s, 28 * s);
    if (long) { x.fillStyle = '#4a2e1a'; x.fillRect(gx - 40 * s, gy + 2 * s, 44 * s, 18 * s); }
  };
  for (let row = 0; row < 3; row++) for (let k = 0; k < 6; k++) gun(30 + k * 165 + rng() * 10, 25 + row * 78, 0.9, row !== 1);
  grain(x, 10, rng);
  return toTexture(c, { repeat: false });
});

// ------------------------------------------------------------ buildings --
// A facade tile: `cols` bays by `rows` floors. Returns { map, glow } where
// glow is the windows with their lights on.
const FACADES = {
  office: { cols: 8, rows: 8, bay: 3.2, floor: 3.6, wall: '#8a8478', win: '#1c242c', frame: '#5a564e', lit: 0.32, band: true },
  glass: { cols: 8, rows: 8, bay: 2.4, floor: 3.6, wall: '#2a3a48', win: '#14202c', frame: '#3a4a58', lit: 0.28, glass: true },
  stone: { cols: 6, rows: 6, bay: 3.6, floor: 4.2, wall: '#a49a88', win: '#1a1c20', frame: '#7a7262', lit: 0.18, arch: true },
  brick: { cols: 6, rows: 6, bay: 3.0, floor: 3.2, wall: '#6a3a2a', win: '#14161a', frame: '#d8d0c0', lit: 0.3, bricks: true },
  shop: { cols: 4, rows: 4, bay: 3.0, floor: 3.2, wall: '#7a5a42', win: '#14161a', frame: '#c8c0b0', lit: 0.35, bricks: true },
  warehouse: { cols: 6, rows: 3, bay: 4.0, floor: 4.0, wall: '#5a5e5e', win: '#1a1e22', frame: '#3a3e3e', lit: 0.1, ribbed: true, high: true },
  house: { cols: 4, rows: 2, bay: 2.6, floor: 3.0, wall: '#b8ac94', win: '#1a1a1c', frame: '#e8e4dc', lit: 0.42, siding: true },
  hospital: { cols: 8, rows: 7, bay: 3.0, floor: 3.4, wall: '#d8d8d0', win: '#1a2a34', frame: '#9aa0a0', lit: 0.55, band: true },
  station: { cols: 6, rows: 3, bay: 3.2, floor: 3.6, wall: '#5a4a3a', win: '#14181c', frame: '#c8c0b0', lit: 0.6, bricks: true },
  civic: { cols: 6, rows: 4, bay: 3.6, floor: 4.6, wall: '#c8bea8', win: '#1a1c20', frame: '#988e7a', lit: 0.25, arch: true },
  villa: { cols: 6, rows: 2, bay: 3.6, floor: 3.75, wall: '#ece6d8', win: '#1a2a36', frame: '#d0c8b8', lit: 0.5, glass: true },
  trailer: { cols: 4, rows: 1, bay: 3.0, floor: 3.2, wall: '#c8c4b4', win: '#1a1c20', frame: '#8a8a84', lit: 0.4, ribbed: true },
};
export const facadeSize = (kind) => { const F = FACADES[kind] || FACADES.office; return [F.cols * F.bay, F.rows * F.floor]; };

export const facade = (kind, tint = 0) => cached(`facade:${kind}:${tint}`, () => {
  const F = FACADES[kind] || FACADES.office;
  const rng = makeRng(`facade:${kind}:${tint}`);
  const ppm = 18;                          // pixels per metre
  const W = Math.round(F.cols * F.bay * ppm), H = Math.round(F.rows * F.floor * ppm);
  const [c, x] = canvas(W, H, 1);
  const [g, y] = canvas(W, H, 1);
  let wall = F.wall;
  if (kind === 'house') wall = ['#b8ac94', '#9aa8b0', '#c8b890', '#a89080', '#d0ccc0', '#8a9a7a'][tint % 6];
  x.fillStyle = wall;
  x.fillRect(0, 0, W, H);
  y.fillStyle = '#000';
  y.fillRect(0, 0, W, H);
  if (F.bricks) {
    for (let r = 0; r < H; r += 4) for (let q = (r / 4) % 2 ? -5 : 0; q < W; q += 10) { x.fillStyle = `rgba(${rng() < 0.5 ? '0,0,0' : '255,220,200'},${0.05 + rng() * 0.08})`; x.fillRect(q, r, 9, 3); }
  }
  if (F.siding) for (let r = 0; r < H; r += 5) { x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(0, r + 4, W, 1); }
  if (F.ribbed) for (let q = 0; q < W; q += 6) { x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(q, 0, 2, H); x.fillStyle = 'rgba(255,255,255,0.06)'; x.fillRect(q + 2, 0, 1, H); }
  for (let k = 0; k < 10; k++) blotch(x, rng() * W, rng() * H, 40 + rng() * 80, 'rgba(0,0,0,A)', 0.12);
  const bw = F.bay * ppm, fh = F.floor * ppm;
  for (let r = 0; r < F.rows; r++) {
    // whole floors tend to be lit together (an office still working late)
    const floorLit = rng() < 0.15;
    for (let q = 0; q < F.cols; q++) {
      if (F.high && r !== F.rows - 1) continue;
      let wx = q * bw + bw * 0.16, wy = r * fh + fh * 0.22, ww = bw * 0.68, wh = fh * 0.55;
      if (F.glass) { wx = q * bw + 2; wy = r * fh + 3; ww = bw - 4; wh = fh - 6; }
      if (F.high) { wy = r * fh + fh * 0.1; wh = fh * 0.3; }
      x.fillStyle = F.frame;
      x.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
      x.fillStyle = F.win;
      x.fillRect(wx, wy, ww, wh);
      // a reflection
      const rg = x.createLinearGradient(wx, wy, wx + ww, wy + wh);
      rg.addColorStop(0, 'rgba(120,140,170,0.25)');
      rg.addColorStop(0.5, 'rgba(120,140,170,0.02)');
      rg.addColorStop(1, 'rgba(120,140,170,0.12)');
      x.fillStyle = rg;
      x.fillRect(wx, wy, ww, wh);
      if (F.arch) { x.fillStyle = F.frame; x.fillRect(wx - 4, wy - 6, ww + 8, 4); }
      const lit = floorLit ? rng() < 0.8 : rng() < F.lit;
      if (lit) {
        const warm = rng() < 0.7;
        const v = 0.55 + rng() * 0.45;
        const col = warm ? [255 * v, 200 * v, 120 * v] : [180 * v, 210 * v, 255 * v];
        y.fillStyle = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`;
        y.fillRect(wx, wy, ww, wh);
        // blinds or a figure in some
        if (rng() < 0.4) { y.fillStyle = 'rgba(0,0,0,0.45)'; for (let b = 0; b < wh; b += 4) y.fillRect(wx, wy + b, ww, 1.5); }
        if (rng() < 0.15) { y.fillStyle = 'rgba(0,0,0,0.7)'; y.fillRect(wx + ww * (0.2 + rng() * 0.5), wy + wh * 0.3, ww * 0.12, wh * 0.7); }
        x.fillStyle = `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},0.5)`;
        x.fillRect(wx, wy, ww, wh);
      }
    }
    if (F.band) { x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(0, r * fh, W, 3); }
  }
  grain(x, 12, rng);
  const map = toTexture(c), glowMap = toTexture(g);
  return { map, glow: glowMap, size: [F.cols * F.bay, F.rows * F.floor] };
});

// a shop's ground floor: big windows (lit) and a door
export const storefront = (seed) => cached(`storefront:${seed}`, () => {
  const rng = makeRng(`store${seed}`);
  const W = 216, H = 64;                   // 12 m by 3.6 m
  const [c, x] = canvas(W, H, 2);
  const [g, y] = canvas(W, H, 2);
  x.fillStyle = ['#3a2a20', '#20282e', '#2a2a2a', '#3a2028', '#1e2a22'][seed % 5];
  x.fillRect(0, 0, W, H);
  y.fillStyle = '#000';
  y.fillRect(0, 0, W, H);
  const open = rng() < 0.6;
  const col = open ? ['#fff0c8', '#d8f0ff', '#ffe0a0', '#e8ffe8'][seed % 4] : '#202830';
  for (const [wx, ww] of [[8, 70], [126, 82]]) {
    x.fillStyle = '#101418'; x.fillRect(wx, 10, ww, 44);
    y.fillStyle = open ? col : '#000'; y.fillRect(wx, 10, ww, 44);
    // shelves and things in the window
    for (let k = 0; k < 10; k++) { y.fillStyle = `rgba(0,0,0,${0.3 + rng() * 0.4})`; y.fillRect(wx + rng() * ww * 0.9, 20 + rng() * 30, 3 + rng() * 10, 4 + rng() * 14); }
    if (!open) { x.fillStyle = 'rgba(160,170,180,0.2)'; for (let k = 0; k < 44; k += 3) x.fillRect(wx, 10 + k, ww, 1); }
  }
  x.fillStyle = '#0c0e10'; x.fillRect(88, 12, 30, 52);
  y.fillStyle = open ? col : '#000'; y.globalAlpha = 0.6; y.fillRect(92, 16, 22, 40); y.globalAlpha = 1;
  return { map: toTexture(c), glow: toTexture(g), open };
});

export const roof = () => cached('roof', () => {
  const S = 128, rng = makeRng('roof');
  const [c, x] = canvas(S, S, 1);
  x.fillStyle = '#3a3836';
  x.fillRect(0, 0, S, S);
  for (let k = 0; k < 900; k++) { x.fillStyle = `rgba(${rng() < 0.5 ? '90,88,84' : '20,20,20'},0.6)`; x.fillRect(rng() * S, rng() * S, 1, 1); }
  grain(x, 16, rng);
  return toTexture(c);
});

export const shingles = () => cached('shingles', () => {
  const S = 128, rng = makeRng('shingles');
  const [c, x] = canvas(S, S, 1);
  x.fillStyle = '#2a2624';
  x.fillRect(0, 0, S, S);
  for (let r = 0; r < S; r += 8) for (let q = (r / 8) % 2 ? -6 : 0; q < S; q += 12) { const v = 30 + rng() * 25; x.fillStyle = `rgb(${v + 6},${v},${v - 4})`; x.fillRect(q + 1, r + 1, 10, 7); }
  grain(x, 14, rng);
  return toTexture(c);
});

// corrugated metal for containers (white: tinted per container)
export const corrugated = () => cached('corrugated', () => {
  const S = 128, rng = makeRng('corr');
  const [c, x] = canvas(S, S, 1);
  x.fillStyle = '#d8d8d8';
  x.fillRect(0, 0, S, S);
  for (let q = 0; q < S; q += 6) { x.fillStyle = 'rgba(0,0,0,0.22)'; x.fillRect(q, 0, 2, S); }
  for (let k = 0; k < 8; k++) blotch(x, rng() * S, rng() * S, 20 + rng() * 30, 'rgba(110,60,30,A)', 0.25);
  grain(x, 14, rng);
  return toTexture(c);
});

// chain-link (alpha: white is wire)
export const chainlink = () => cached('chainlink', () => {
  const S = 64;
  const [c, x] = canvas(S, S, 1);
  x.fillStyle = '#000';
  x.fillRect(0, 0, S, S);
  x.strokeStyle = '#fff';
  x.lineWidth = 2.2;
  x.beginPath();
  for (let k = -S; k < S * 2; k += 16) { x.moveTo(k, 0); x.lineTo(k + S, S); x.moveTo(k, S); x.lineTo(k + S, 0); }
  x.stroke();
  return toTexture(c, { srgb: false });
});

// ---------------------------------------------------------------- signs --
export function sign(text, { w = 512, h = 128, bg = '#1d3b2a', fg = '#f2f0e6', font = 'bold 64px Arial, sans-serif', border = null, glow = false } = {}) {
  return cached(`sign:${text}:${bg}:${fg}:${w}x${h}:${font}:${glow}`, () => {
    const [c, x] = canvas(w, h);
    x.fillStyle = bg;
    x.fillRect(0, 0, w, h);
    if (border) {
      x.strokeStyle = border;
      x.lineWidth = 8;
      x.strokeRect(6, 6, w - 12, h - 12);
    }
    x.fillStyle = fg;
    x.font = font;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    const lines = text.split('\n');
    let size = parseFloat(/(\d+)px/.exec(font)?.[1] || 64);
    const widest = () => Math.max(...lines.map((l) => x.measureText(l).width));
    while (widest() > w * 0.9 && size > 10) { size *= 0.92; x.font = font.replace(/\d+px/, `${size.toFixed(0)}px`); }
    if (glow) { x.shadowColor = fg; x.shadowBlur = 18; }
    lines.forEach((ln, i) => x.fillText(ln, w / 2, h / 2 + (i - (lines.length - 1) / 2) * (h / (lines.length + 0.6))));
    return toTexture(c, { repeat: false });
  });
}

// a radial glow for light sprites
export const glow = () => cached('glow', () => {
  const S = 64;
  const [c, x] = canvas(S, S, 1);
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  return toTexture(c, { repeat: false });
});

// a soft pool of light on the ground (headlights), bright at the near end
export const beamPool = () => cached('beamPool', () => {
  const W = 64, H = 128;
  const [c, x] = canvas(W, H, 1);
  const g = x.createLinearGradient(0, H, 0, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.beginPath(); x.moveTo(W * 0.3, H); x.lineTo(W * 0.7, H); x.lineTo(W, 0); x.lineTo(0, 0); x.fill();
  const img = x.getImageData(0, 0, W, H);
  // soften the sides
  for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) { const i = (yy * W + xx) * 4; const e = 1 - Math.pow(Math.abs(xx / W - 0.5) * 2, 3); img.data[i + 3] *= e; }
  x.putImageData(img, 0, 0);
  return toTexture(c, { repeat: false });
});

// the sky: dark blue, the city's glow on the low cloud, stars
export const sky = () => cached('sky', () => {
  const W = 1024, H = 512, rng = makeRng('sky');
  const [c, x] = canvas(W, H, 1);
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#04060c');
  g.addColorStop(0.5, '#0a0e1c');
  g.addColorStop(0.78, '#2a2230');
  g.addColorStop(1, '#3a2a28');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  for (let k = 0; k < 500; k++) { x.fillStyle = `rgba(255,255,255,${0.2 + rng() * 0.7})`; x.fillRect(rng() * W, rng() * H * 0.6, rng() < 0.1 ? 2 : 1, 1); }
  for (let k = 0; k < 18; k++) blotch(x, rng() * W, H * (0.3 + rng() * 0.3), 60 + rng() * 120, 'rgba(60,50,70,A)', 0.18);
  return toTexture(c, { repeat: false });
});

// -------------------------------------------------------- HUD and pickups --
// the city map, drawn from above (for the radar and the pause map)
export function cityMap({ BLOCKS, BUILDINGS, LINES, ROAD, HARBOR }, size = 1024) {
  return cached(`citymap:${size}`, () => {
    const [c, x] = canvas(size, size, 1);
    const k = size / 480, o = 240;
    const P = (v) => (v + o) * k;
    // (just the city: the island round it is the radar's own picture)
    x.clearRect(0, 0, size, size);
    x.fillStyle = '#34383c';
    x.fillRect(P(-209), P(-209), 418 * k, 418 * k);
    x.fillStyle = '#4a4c50';
    x.fillRect(P(HARBOR.x0), P(HARBOR.z0), (HARBOR.x1 - HARBOR.x0) * k, (HARBOR.z1 - HARBOR.z0) * k);
    for (const b of BLOCKS) {
      x.fillStyle = { res: '#2e3e26', safe: '#2e3e26', park: '#26462a' }[b.kind] || '#3e4044';
      x.fillRect(P(b.x0 - 3), P(b.z0 - 3), (b.x1 - b.x0 + 6) * k, (b.z1 - b.z0 + 6) * k);
    }
    x.fillStyle = '#1a1c20';
    for (const L of LINES) {
      x.fillRect(P(L - ROAD), P(-200 - ROAD), ROAD * 2 * k, 400 * k + ROAD * 2 * k);
      x.fillRect(P(-200 - ROAD), P(L - ROAD), 400 * k + ROAD * 2 * k, ROAD * 2 * k);
    }
    x.fillStyle = '#6a6c70';
    for (const b of BUILDINGS) x.fillRect(P(b.x0), P(b.z0), (b.x1 - b.x0) * k, (b.z1 - b.z0) * k);
    const t = toTexture(c, { repeat: false });
    t.canvas = c;
    return t;
  });
}
