// Every texture in the game is painted onto a canvas at start-up: there are
// no image files to download. Floors and walls are painted to tile, and the
// mall maps them in world metres (see `meters`).

import * as THREE from 'three';
import { makeRng } from '../shared/rng.js';
import { STORES, STALLS } from '../shared/mall.js';

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

const hex = (c) => `#${new THREE.Color(c).getHexString()}`;
const shade = (c, k) => hex(new THREE.Color(c).multiplyScalar(k));

// --------------------------------------------------------------- floors --
// terrazzo: chips of marble in cream cement, in big squares with brass strips
export const terrazzo = (base = '#d9cfbd', key = 'terrazzo') => cached(key, () => {
  const S = 512, rng = makeRng(key);
  const [c, x] = canvas(S, S, 1);
  x.fillStyle = base;
  x.fillRect(0, 0, S, S);
  for (let k = 0; k < 7; k++) blotch(x, rng() * S, rng() * S, 60 + rng() * 120, 'rgba(120,100,80,A)', 0.06);
  const chips = ['#8a7a68', '#b7a690', '#f2ebe0', '#5e5550', '#a46a4c', '#c9b79c', '#6b7a78'];
  for (let k = 0; k < 9000; k++) {
    x.fillStyle = chips[Math.floor(rng() * chips.length)];
    x.globalAlpha = 0.5 + rng() * 0.5;
    const r = 0.6 + rng() * rng() * 4;
    x.beginPath();
    x.ellipse(rng() * S, rng() * S, r, r * (0.5 + rng() * 0.5), rng() * 3, 0, Math.PI * 2);
    x.fill();
  }
  x.globalAlpha = 1;
  x.strokeStyle = 'rgba(150,120,70,0.75)';
  x.lineWidth = 2.5;
  x.strokeRect(1, 1, S - 2, S - 2);
  grain(x, 8, rng);
  return toTexture(c);
});

// vinyl tiles (a shop, the corridor): two colours, a speckle
export const vct = (a = '#d8d4c8', b = '#c4bfb2', key = 'vct') => cached(`vct:${a}:${b}:${key}`, () => {
  const S = 256, rng = makeRng(key);
  const [c, x] = canvas(S, S, 1);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    x.fillStyle = (i + j) % 2 ? a : b;
    x.fillRect(i * 64, j * 64, 64, 64);
  }
  for (let k = 0; k < 5000; k++) {
    x.fillStyle = rng() < 0.5 ? 'rgba(60,55,50,0.25)' : 'rgba(255,255,255,0.2)';
    x.fillRect(rng() * S, rng() * S, 1 + rng() * 2, 1 + rng());
  }
  x.strokeStyle = 'rgba(40,36,30,0.35)';
  x.lineWidth = 1;
  for (let i = 0; i <= S; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, S); x.moveTo(0, i); x.lineTo(S, i); x.stroke(); }
  for (let k = 0; k < 6; k++) blotch(x, rng() * S, rng() * S, 30 + rng() * 40, 'rgba(70,60,40,A)', 0.08);
  grain(x, 10, rng);
  return toTexture(c);
});

// carpet with a small repeating figure
export const carpet = (color = '#6a2430', key = 'carpet') => cached(`carpet:${color}:${key}`, () => {
  const S = 256, rng = makeRng(key);
  const [c, x] = canvas(S, S, 1);
  x.fillStyle = color;
  x.fillRect(0, 0, S, S);
  for (let k = 0; k < 14000; k++) {
    x.fillStyle = rng() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.06)';
    x.fillRect(rng() * S, rng() * S, 1, 1 + rng() * 2);
  }
  const fig = shade(color, 1.45);
  x.strokeStyle = fig;
  x.globalAlpha = 0.35;
  x.lineWidth = 2;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const cx = i * 64 + 32, cy = j * 64 + 32;
    x.beginPath(); x.moveTo(cx, cy - 12); x.lineTo(cx + 12, cy); x.lineTo(cx, cy + 12); x.lineTo(cx - 12, cy); x.closePath(); x.stroke();
    x.beginPath(); x.arc(cx, cy, 3, 0, Math.PI * 2); x.stroke();
  }
  x.globalAlpha = 1;
  for (let k = 0; k < 6; k++) blotch(x, rng() * S, rng() * S, 30 + rng() * 50, 'rgba(0,0,0,A)', 0.1);
  grain(x, 14, rng);
  return toTexture(c);
});

export const concrete = (tint = '#8f8b84', key = 'concrete') => cached(`concrete:${tint}:${key}`, () => {
  const S = 256, rng = makeRng(key);
  const [c, x] = canvas(S, S, 1);
  x.fillStyle = tint;
  x.fillRect(0, 0, S, S);
  for (let k = 0; k < 12; k++) blotch(x, rng() * S, rng() * S, 30 + rng() * 50, 'rgba(50,48,44,A)', 0.14);
  for (let k = 0; k < 2; k++) {
    x.strokeStyle = 'rgba(40,38,34,0.4)';
    x.lineWidth = 1;
    x.beginPath();
    let px = rng() * S, py = 0;
    x.moveTo(px, py);
    while (py < S) { px += (rng() - 0.5) * 18; py += 10 + rng() * 14; x.lineTo(px, py); }
    x.stroke();
  }
  grain(x, 22, rng);
  return toTexture(c);
});

// ---------------------------------------------------------------- walls --
export const plainWall = (tint = '#ece8df', key = 'plainWall', amount = 7) => cached(`plain:${tint}:${key}`, () => {
  const S = 128, rng = makeRng(key);
  const [c, x] = canvas(S, S, 1);
  x.fillStyle = tint;
  x.fillRect(0, 0, S, S);
  for (let k = 0; k < 4; k++) blotch(x, rng() * S, rng() * S, 20 + rng() * 40, 'rgba(0,0,0,A)', 0.03);
  grain(x, amount, rng);
  return toTexture(c);
});

// sand-finish plaster for the concourse
export const stucco = () => cached('stucco', () => {
  const S = 256, rng = makeRng('stucco');
  const [c, x] = canvas(S, S, 1);
  x.fillStyle = '#e6dac4';
  x.fillRect(0, 0, S, S);
  for (let k = 0; k < 6000; k++) {
    x.fillStyle = rng() < 0.5 ? 'rgba(90,70,40,0.08)' : 'rgba(255,255,255,0.12)';
    x.beginPath(); x.arc(rng() * S, rng() * S, 0.6 + rng() * 1.6, 0, Math.PI * 2); x.fill();
  }
  grain(x, 10, rng);
  return toTexture(c);
});

// glazed tile in vertical courses, for the shopfront pilasters
export const pilaster = () => cached('pilaster', () => {
  const W = 128, H = 128, rng = makeRng('pilaster');
  const [c, x] = canvas(W, H, 2);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) {
    const v = 0.85 + rng() * 0.25;
    x.fillStyle = shade('#3b5a57', v);
    x.fillRect(i * 16, j * 32, 16, 32);
    x.fillStyle = 'rgba(255,255,255,0.08)';
    x.fillRect(i * 16 + 2, j * 32 + 2, 4, 26);
  }
  x.fillStyle = 'rgba(220,210,190,0.7)';
  for (let i = 0; i <= 8; i++) x.fillRect(i * 16 - 0.5, 0, 1, H);
  for (let j = 0; j <= 4; j++) x.fillRect(0, j * 32 - 0.5, W, 1);
  grain(x, 6, rng);
  return toTexture(c);
});

export const blockWall = (tint = '#c9c4b6', key = 'block') => cached(`block:${tint}:${key}`, () => {
  const S = 256, rng = makeRng(key);
  const [c, x] = canvas(S, S, 1);
  x.fillStyle = tint;
  x.fillRect(0, 0, S, S);
  x.strokeStyle = 'rgba(60,56,48,0.4)';
  x.lineWidth = 3;
  for (let row = 0; row < 4; row++) {
    const y = row * 64;
    x.beginPath(); x.moveTo(0, y); x.lineTo(S, y); x.stroke();
    for (let col = 0; col < 2; col++) {
      const bx = col * 128 + (row % 2) * 64;
      x.beginPath(); x.moveTo(bx, y); x.lineTo(bx, y + 64); x.stroke();
    }
  }
  for (let k = 0; k < 900; k++) { x.fillStyle = `rgba(0,0,0,${rng() * 0.12})`; x.beginPath(); x.arc(rng() * S, rng() * S, rng() * 1.6, 0, 7); x.fill(); }
  for (let k = 0; k < 4; k++) blotch(x, rng() * S, S - rng() * 40, 30 + rng() * 40, 'rgba(70,60,40,A)', 0.1);
  grain(x, 14, rng);
  return toTexture(c);
});

export const brick = () => cached('brick', () => {
  const W = 256, H = 256, rng = makeRng('brick');
  const [c, x] = canvas(W, H, 1);
  x.fillStyle = '#7d756c';
  x.fillRect(0, 0, W, H);
  const bh = 16, bw = 48;
  for (let r = 0; r < H / bh; r++) {
    for (let k = -1; k < W / bw + 1; k++) {
      const v = 0.75 + rng() * 0.4;
      x.fillStyle = shade('#9a5b45', v);
      x.fillRect(k * bw + (r % 2) * bw / 2 + 1.5, r * bh + 1.5, bw - 3, bh - 3);
    }
  }
  grain(x, 18, rng);
  return toTexture(c);
});

// restroom tile: white squares with a blue band
export const tile = (band = '#2f5f8a') => cached(`tile:${band}`, () => {
  const S = 128, rng = makeRng('tile');
  const [c, x] = canvas(S, S, 2);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    x.fillStyle = j === 5 ? band : shade('#e8e6e0', 0.95 + rng() * 0.07);
    x.fillRect(i * 16, j * 16, 16, 16);
  }
  x.fillStyle = 'rgba(140,140,130,0.8)';
  for (let i = 0; i <= 8; i++) { x.fillRect(i * 16 - 0.5, 0, 1, S); x.fillRect(0, i * 16 - 0.5, S, 1); }
  grain(x, 5, rng);
  return toTexture(c);
});

// the back offices: paint over drywall, a darker band below a chair rail
export const officeWall = () => cached('officeWall', () => {
  const S = 128, rng = makeRng('office');
  const [c, x] = canvas(S, S, 1);
  x.fillStyle = '#cfd0c4';
  x.fillRect(0, 0, S, S);
  grain(x, 6, rng);
  return toTexture(c);
});

// Halvorsen's: faded damask wallpaper
export const damask = () => cached('damask', () => {
  const S = 256, rng = makeRng('damask');
  const [c, x] = canvas(S, S, 1);
  x.fillStyle = '#7a5a4a';
  x.fillRect(0, 0, S, S);
  x.fillStyle = 'rgba(220,190,140,0.18)';
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const cx = i * 64 + (j % 2) * 32, cy = j * 64 + 32;
    x.beginPath();
    x.moveTo(cx, cy - 24);
    x.bezierCurveTo(cx + 18, cy - 14, cx + 18, cy + 8, cx, cy + 24);
    x.bezierCurveTo(cx - 18, cy + 8, cx - 18, cy - 14, cx, cy - 24);
    x.fill();
    x.beginPath(); x.arc(cx, cy, 5, 0, 7); x.fill();
  }
  for (let k = 0; k < 10; k++) blotch(x, rng() * S, rng() * S, 30 + rng() * 60, 'rgba(40,25,15,A)', 0.15);
  grain(x, 12, rng);
  return toTexture(c);
});

// the food court: little mosaic tiles in warm colours
export const mosaic = () => cached('mosaic', () => {
  const S = 128, rng = makeRng('mosaic');
  const [c, x] = canvas(S, S, 2);
  const cols = ['#b8865a', '#c8a26c', '#a8744c', '#d8ccb0', '#5a8a84', '#c8b898'];
  for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) {
    x.fillStyle = cols[(i * 7 + j * 3 + Math.floor(rng() * 2)) % cols.length];
    x.fillRect(i * 8 + 0.5, j * 8 + 0.5, 7, 7);
  }
  grain(x, 6, rng);
  return toTexture(c);
});

export const laminate = (color = '#b8a07a', key = 'laminate') => cached(`lam:${color}:${key}`, () => {
  const S = 128, rng = makeRng(key);
  const [c, x] = canvas(S, S, 1);
  x.fillStyle = color;
  x.fillRect(0, 0, S, S);
  for (let k = 0; k < 40; k++) { x.strokeStyle = `rgba(0,0,0,${0.03 + rng() * 0.04})`; x.beginPath(); const y = rng() * S; x.moveTo(0, y); x.lineTo(S, y + (rng() - 0.5) * 6); x.stroke(); }
  grain(x, 6, rng);
  return toTexture(c);
});

export const brushed = () => cached('brushed', () => {
  const S = 128, rng = makeRng('brushed');
  const [c, x] = canvas(S, S, 1);
  x.fillStyle = '#a9adb0';
  x.fillRect(0, 0, S, S);
  for (let k = 0; k < 500; k++) { x.strokeStyle = `rgba(${rng() < 0.5 ? '255,255,255' : '0,0,0'},${rng() * 0.12})`; const y = rng() * S; x.beginPath(); x.moveTo(0, y); x.lineTo(S, y); x.stroke(); }
  return toTexture(c);
});

export const ceilingTile = (tint = '#e6e2d6', key = 'ceilingTile') => cached(`ceil:${tint}:${key}`, () => {
  const S = 256, rng = makeRng(key);
  const [c, x] = canvas(S, S, 1);
  x.fillStyle = tint;
  x.fillRect(0, 0, S, S);
  for (let k = 0; k < 2600; k++) {
    x.fillStyle = `rgba(90,80,60,${0.1 + rng() * 0.2})`;
    x.fillRect(rng() * S, rng() * S, 1.4, 1.4);
  }
  x.strokeStyle = 'rgba(120,115,100,0.8)';
  x.lineWidth = 4;
  x.strokeRect(0, 0, S, S);
  x.beginPath(); x.moveTo(S / 2, 0); x.lineTo(S / 2, S); x.stroke();
  if (rng() < 0.9) blotch(x, rng() * S, rng() * S, 30, 'rgba(140,110,40,A)', 0.15);
  grain(x, 8, rng);
  return toTexture(c);
});

export const wood = (tone = '#8a5a35', key = 'wood') => cached(`wood:${tone}:${key}`, () => {
  const S = 256, rng = makeRng(key);
  const [c, x] = canvas(S, S, 1);
  x.fillStyle = tone;
  x.fillRect(0, 0, S, S);
  for (let k = 0; k < 110; k++) {
    const y = rng() * S;
    x.strokeStyle = `rgba(40,20,5,${0.03 + rng() * 0.07})`;
    x.lineWidth = 0.5 + rng() * 1.2;
    x.beginPath();
    x.moveTo(0, y);
    for (let i = 0; i <= S; i += 32) x.lineTo(i, y + Math.sin(i * 0.03 + k) * 1.4);
    x.stroke();
  }
  grain(x, 10, rng);
  return toTexture(c);
});

export const fabric = () => cached('fabric', () => {
  const S = 128, rng = makeRng('fabric');
  const [c, x] = canvas(S, S, 1);
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 2) {
    x.fillStyle = 'rgba(0,0,0,0.045)';
    x.fillRect(i, 0, 1, S);
    x.fillRect(0, i, S, 1);
  }
  grain(x, 14, rng);
  return toTexture(c);
});

// --------------------------------------------------- see-through metal --
// a shop's roll-down grille: horizontal rods joined by links (alpha)
export const grille = () => cached('grille', () => {
  const W = 128, H = 128;
  const [c, x] = canvas(W, H, 2);
  // alpha maps read the green channel: black is a hole, white is metal
  x.fillStyle = '#000';
  x.fillRect(0, 0, W, H);
  x.fillStyle = '#fff';
  for (let j = 0; j < 8; j++) x.fillRect(0, j * 16 + 6, W, 3.2);
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
    const ox = i * 16 + (j % 2) * 8;
    x.fillRect(ox + 3, j * 16 + 7, 2.2, 16);
  }
  return toTexture(c, { srgb: false });
});

export const chainlink = () => cached('chainlink', () => {
  const S = 64;
  const [c, x] = canvas(S, S, 2);
  x.fillStyle = '#000';
  x.fillRect(0, 0, S, S);
  x.strokeStyle = '#fff';
  x.lineWidth = 1.6;
  for (let k = -2; k < 4; k++) {
    x.beginPath(); x.moveTo(k * 16, 0); x.lineTo(k * 16 + S, S); x.stroke();
    x.beginPath(); x.moveTo(k * 16 + S, 0); x.lineTo(k * 16, S); x.stroke();
  }
  return toTexture(c, { srgb: false });
});

// ----------------------------------------------------------------- signs --
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
    // shrink to fit
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

// the night sky through a skylight
export const nightSky = () => cached('nightSky', () => {
  const S = 256, rng = makeRng('sky');
  const [c, x] = canvas(S, S, 1);
  const g = x.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, '#0a1020');
  g.addColorStop(1, '#141c30');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  for (let k = 0; k < 90; k++) { x.fillStyle = `rgba(255,255,255,${0.2 + rng() * 0.6})`; x.fillRect(rng() * S, rng() * S, 1, 1); }
  for (let k = 0; k < 5; k++) blotch(x, rng() * S, rng() * S, 60, 'rgba(70,80,110,A)', 0.2);
  return toTexture(c);
});

// ------------------------------------------------------- shelf contents --
// what's on a shelf, seen from the front: rows of things in a shop's style
export const stock = (kind) => cached(`stock:${kind}`, () => {
  const W = 256, H = 128, rng = makeRng(`stock${kind}`);
  const [c, x] = canvas(W, H, 2);
  const pal = {
    records: ['#1b1b1b', '#d23a2a', '#e8d24a', '#2a5ab0', '#f0f0f0', '#7a3aa0', '#2e9a5a'],
    videos: ['#111', '#0b3b8a', '#e0e0e0', '#a01818', '#ffd21f', '#222'],
    books: ['#7a2b22', '#2b4a6b', '#3d5a35', '#c9b27a', '#5b3b5e', '#a8642c', '#d8d0c0', '#333'],
    shoes: ['#f0f0f0', '#d03a20', '#1a1a1a', '#2050c0', '#e8e0d0'],
    toys: ['#e83a2a', '#2a8ae8', '#f2d22a', '#2ac25a', '#ff7ab0', '#8a4ae0'],
    cards: ['#f4c6d0', '#f8f0e0', '#c8e0f0', '#e0f0c8', '#f0e0a0', '#d0b0e0'],
    pharmacy: ['#ffffff', '#e8f0f8', '#0f6d5a', '#d8303a', '#2a5ab0', '#f0c030'],
    film: ['#f2c200', '#1a1a1a', '#d82020', '#2a8a2a'],
    folded: ['#2a2a3a', '#7a2a2a', '#d8d0c0', '#3a5a7a', '#5a6a3a', '#c8a080'],
    boxes: ['#a8875a', '#b89868', '#98774a', '#c8a878'],
    frozen: ['#e8f0f8', '#c8d8e8', '#f0f0f0', '#a8c0d8'],
    cleaning: ['#2a8ae8', '#f2d22a', '#e83a2a', '#ffffff', '#3ac25a'],
    kitchen: ['#c8c8c8', '#a8a8a8', '#d8b080', '#f0e0c0'],
    velvet: ['#1a2a48', '#1a2a48'],
    sparse: ['#a8875a', '#d8d0c0', '#8a8a8a'],
  }[kind] || ['#888', '#aaa'];
  x.fillStyle = kind === 'velvet' ? '#14203a' : '#2a221a';
  x.fillRect(0, 0, W, H);
  if (kind === 'velvet') {
    for (let k = 0; k < 14; k++) { x.fillStyle = `rgba(255,240,200,${0.5 + rng() * 0.5})`; x.beginPath(); x.arc(20 + rng() * (W - 40), 20 + rng() * (H - 40), 2 + rng() * 3, 0, 7); x.fill(); }
    return toTexture(c, { repeat: false });
  }
  const rows = 2;
  for (let r = 0; r < rows; r++) {
    const y0 = r * (H / rows), rh = H / rows;
    let px = 2;
    const sparse = kind === 'sparse';
    while (px < W - 4) {
      const wide = kind === 'records' ? 2.5 + rng() * 2 : kind === 'videos' || kind === 'books' ? 5 + rng() * 6 : 10 + rng() * 18;
      if (sparse && rng() < 0.6) { px += wide * 2; continue; }
      const tall = kind === 'records' ? rh * 0.9 : kind === 'videos' ? rh * 0.8 : rh * (0.45 + rng() * 0.45);
      x.fillStyle = pal[Math.floor(rng() * pal.length)];
      x.fillRect(px, y0 + rh - tall - 3, wide, tall);
      x.fillStyle = 'rgba(255,255,255,0.15)';
      x.fillRect(px + 1, y0 + rh - tall - 1, Math.max(1, wide - 2), 2);
      if (kind === 'shoes' || kind === 'toys') { x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(px + wide * 0.2, y0 + rh - tall * 0.6, wide * 0.6, 2); }
      px += wide + (kind === 'records' ? 0.5 : 1.5);
    }
    x.fillStyle = '#4a3a2a';
    x.fillRect(0, y0 + rh - 3, W, 3);
  }
  return toTexture(c, { repeat: false });
});

export const books = () => stock('books');

// an abstract print, for walls and the Halvorsen's ads
export const painting = (seed) => cached(`painting${seed}`, () => {
  const W = 256, H = 192, rng = makeRng(`painting${seed}`);
  const [c, x] = canvas(W, H, 1);
  const palettes = [
    ['#e9e1cf', '#c96a3d', '#2f4858', '#d9a441', '#8aa39b'],
    ['#f1ece2', '#3d5a80', '#98c1d9', '#ee6c4d', '#293241'],
    ['#efe6d8', '#6b705c', '#a5a58d', '#cb997e', '#3f4238'],
  ];
  const pal = palettes[seed % palettes.length];
  x.fillStyle = pal[0];
  x.fillRect(0, 0, W, H);
  for (let k = 0; k < 7; k++) {
    x.fillStyle = pal[1 + Math.floor(rng() * (pal.length - 1))];
    x.globalAlpha = 0.65 + rng() * 0.35;
    if (rng() < 0.5) { x.beginPath(); x.arc(rng() * W, rng() * H, 18 + rng() * 60, 0, Math.PI * 2); x.fill(); }
    else x.fillRect(rng() * W * 0.8, rng() * H * 0.8, 30 + rng() * 120, 14 + rng() * 80);
  }
  x.globalAlpha = 1;
  grain(x, 10, rng);
  return toTexture(c, { repeat: false });
});

// a film poster for the video shop and the record shop
export const poster = (seed) => cached(`poster${seed}`, () => {
  const W = 128, H = 192, rng = makeRng(`poster${seed}`);
  const [c, x] = canvas(W, H, 2);
  const bgs = ['#101828', '#3a0a0a', '#0a2a1a', '#1a1a1a', '#2a1a3a'];
  x.fillStyle = bgs[seed % bgs.length];
  x.fillRect(0, 0, W, H);
  const g = x.createRadialGradient(W / 2, H * 0.4, 5, W / 2, H * 0.4, 80);
  g.addColorStop(0, ['#ff9a3a', '#c8f0ff', '#ff3a6a', '#f0e070', '#7af0b0'][seed % 5]);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(0,0,0,0.7)';
  x.beginPath(); x.ellipse(W / 2, H * 0.55, 18, 40, 0, 0, 7); x.fill();
  x.beginPath(); x.arc(W / 2, H * 0.32, 13, 0, 7); x.fill();
  const titles = ['NIGHT SHIFT', 'THE MALL', 'DEAD AIR', 'LAST CALL', 'STILL LIFE', 'MIDNIGHT', 'CLOSING TIME', 'AFTER HOURS'];
  x.fillStyle = '#f2ead8';
  x.font = 'bold 15px Impact, Arial Black, sans-serif';
  x.textAlign = 'center';
  x.fillText(titles[seed % titles.length], W / 2, H - 26);
  x.font = '7px Arial, sans-serif';
  x.fillText('IN THEATERS NOW', W / 2, H - 12);
  grain(x, 14, rng);
  return toTexture(c, { repeat: false });
});

// ------------------------------------------------------------- screens --
// an arcade game's attract screen
export const arcadeScreen = (seed) => cached(`arcade${seed}`, () => {
  const W = 96, H = 128, rng = makeRng(`arcade${seed}`);
  const [c, x] = canvas(W, H, 2);
  x.fillStyle = '#000';
  x.fillRect(0, 0, W, H);
  const cols = ['#ff3a3a', '#3aff6a', '#3a8aff', '#ffe03a', '#ff3aff', '#3affff'];
  for (let k = 0; k < 60; k++) { x.fillStyle = cols[Math.floor(rng() * cols.length)]; x.fillRect(Math.floor(rng() * 24) * 4, Math.floor(rng() * 24) * 4 + 20, 4, 4); }
  x.fillStyle = '#fff';
  x.font = 'bold 9px "Courier New", monospace';
  x.textAlign = 'center';
  x.fillText(['GALAXIA', 'ROBO RALLY', 'NINJA FIST', 'STAR CHASE', 'DIG DUG IT', 'PAC PANIC', 'TURBO 9', 'ZOMBIE ZOO', 'SKY ACE', 'BLOCKOUT'][seed % 10], W / 2, 12);
  x.fillText('INSERT COIN', W / 2, H - 8);
  return toTexture(c, { repeat: false });
});

// the mall directory by the fountain
export const directory = () => cached('directory', () => {
  const W = 512, H = 768;
  const [c, x] = canvas(W, H, 1);
  x.fillStyle = '#1c2a33';
  x.fillRect(0, 0, W, H);
  x.fillStyle = '#e8d8a8';
  x.font = 'bold 40px Georgia, serif';
  x.textAlign = 'center';
  x.fillText('KINGSGATE MALL', W / 2, 56);
  x.font = '18px Arial, sans-serif';
  x.fillText('STORE DIRECTORY', W / 2, 84);
  // a little plan
  const sx = (v) => 30 + ((v + 66) / 134) * (W - 60), sz = (v) => 130 + ((v + 32) / 50) * 280;
  x.strokeStyle = '#8aa0a8';
  x.lineWidth = 1.5;
  for (const s of [...STORES, ...STALLS]) { x.fillStyle = 'rgba(232,216,168,0.25)'; x.fillRect(sx(s.x0), sz(s.z0), sx(s.x1) - sx(s.x0), sz(s.z1) - sz(s.z0)); x.strokeRect(sx(s.x0), sz(s.z0), sx(s.x1) - sx(s.x0), sz(s.z1) - sz(s.z0)); }
  x.fillStyle = 'rgba(160,80,70,0.5)';
  x.fillRect(sx(-64), sz(-22), sx(-40) - sx(-64), sz(17) - sz(-22));
  x.fillStyle = '#ff3a2a';
  x.beginPath(); x.arc(sx(-3.8), sz(7.6), 6, 0, 7); x.fill();
  x.fillStyle = '#ff6a5a';
  x.font = 'bold 13px Arial, sans-serif';
  x.fillText('YOU ARE HERE', sx(-3.8), sz(7.6) + 20);
  x.textAlign = 'left';
  x.font = '15px Arial, sans-serif';
  const named = STORES.filter((s) => s.type !== 'vacant' && s.type !== 'closing');
  named.forEach((s, i) => {
    x.fillStyle = '#e8d8a8';
    x.fillText(`${s.id}  ${s.name}`, 40 + (i % 2) * 230, 460 + Math.floor(i / 2) * 28);
  });
  x.fillText("     Halvorsen's (CLOSED)", 40, 460 + Math.ceil(named.length / 2) * 28);
  return toTexture(c, { repeat: false });
});

// a clock station: the little steel box with the key on its chain
export const stationFace = (n) => cached(`station${n}`, () => {
  const W = 64, H = 96;
  const [c, x] = canvas(W, H, 2);
  x.fillStyle = '#5a6066';
  x.fillRect(0, 0, W, H);
  x.fillStyle = '#d8d4c8';
  x.fillRect(8, 8, W - 16, 28);
  x.fillStyle = '#1a1a1a';
  x.font = 'bold 18px Arial, sans-serif';
  x.textAlign = 'center';
  x.fillText(`STA ${n}`, W / 2, 28);
  x.fillStyle = '#2a2a2a';
  x.beginPath(); x.arc(W / 2, 62, 10, 0, 7); x.fill();
  x.fillStyle = '#b8a060';
  x.fillRect(W / 2 - 2, 54, 4, 16);
  return toTexture(c, { repeat: false });
});

// the outside wall of the mall, seen from the lot: its sign
export const mallSign = () => sign('KINGSGATE MALL', { w: 1024, h: 160, bg: '#0e0b08', fg: '#ffcf7a', font: 'bold 110px Georgia, serif', glow: true });

// a TV with nothing on but snow
export function snow(seed = 0) {
  const W = 64, H = 48;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  const img = x.createImageData(W, H);
  let s = seed * 7919 + 1;
  tex.userData.update = () => {
    for (let i = 0; i < W * H; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const v = (s >> 16) & 255;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    tex.needsUpdate = true;
  };
  tex.userData.update();
  return tex;
}

// the photos and the tape, as they're shown in the panel: a picture
// rendered from the mall, made grainy, grey and dated
export function photoFrame(pixels, w, h, { stamp = '', mono = true, flash = false } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  const img = x.createImageData(w, h);
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const si = ((h - 1 - yy) * w + xx) * 4, di = (yy * w + xx) * 4;
      // the render target holds linear light: brighten it the way a screen would
      const r = 255 * Math.pow(pixels[si] / 255, 0.45), g = 255 * Math.pow(pixels[si + 1] / 255, 0.45), b = 255 * Math.pow(pixels[si + 2] / 255, 0.45);
      const n = (Math.random() - 0.5) * 30;
      if (mono) {
        const v = Math.max(0, Math.min(255, (r * 0.3 + g * 0.55 + b * 0.15) * 1.25 + n));
        img.data[di] = v * 0.92; img.data[di + 1] = v; img.data[di + 2] = v * 0.94;
      } else {
        const k = flash ? 1.15 : 1;
        img.data[di] = Math.min(255, r * k * 1.05 + n); img.data[di + 1] = Math.min(255, g * k + n); img.data[di + 2] = Math.min(255, b * k * 0.9 + n);
      }
      img.data[di + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  if (stamp) {
    x.font = mono ? '20px VT323, "Courier New", monospace' : 'bold 15px "Courier New", monospace';
    x.fillStyle = mono ? '#f0f0e8' : '#ff9a2a';
    x.textAlign = 'right';
    x.fillText(stamp, w - 10, h - 10);
  }
  return c.toDataURL();
}
