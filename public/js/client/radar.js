// The radar in the corner (the city from above, turning with the camera,
// with blips for the job, your friends, the police when they're after you,
// and the places that matter) and the full map (M).

import { BLOCKS, BUILDINGS, LINES, ROAD, HARBOR, PLACES } from '../shared/city.js';
import { cityMap } from './textures.js';
import { COLORS } from './ui.js';

const K = 1024 / 480;          // map pixels per metre
const toMap = (v) => (v + 240) * K;

const POIS = [
  ['hospital', 'H', '#ff6a6a'], ['police', 'P', '#7aa8ff'], ['guns', '⌖', '#ffd06a'], ['spray', 'S', '#ff7ad8'], ['safehouse', '⌂', '#7aff9a'],
];
const BLIP = { dest: '#ffd040', check: '#ff4040', check2: '#a04040', car: '#5ab0ff', enemy: '#ff4040', pickup: '#50e070', friend: '#5ab0ff' };

export class Radar {
  constructor(canvas, mapCanvas) {
    this.c = canvas;
    this.x = canvas.getContext('2d');
    this.m = mapCanvas;
    this.mx = mapCanvas.getContext('2d');
    this.img = cityMap({ BLOCKS, BUILDINGS, LINES, ROAD, HARBOR }).canvas;
    this.t = 0;
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
    ctx.fillStyle = '#0e1a2a';
    ctx.fillRect(0, 0, S, S);
    // the map, turned with the camera
    ctx.translate(R, R);
    ctx.rotate(yaw);
    ctx.globalAlpha = 0.9;
    const k = scale / K;
    ctx.drawImage(this.img, -toMap(x) * k, -toMap(z) * k, this.img.width * k, this.img.height * k);
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
      else put(b.x, b.z, (g, s) => { g.fillStyle = BLIP[b.k] || '#ffd040'; g.strokeStyle = '#000'; g.lineWidth = 1.5 * s; g.beginPath(); g.arc(0, 0, (b.k === 'check2' ? 3.5 : 5) * s, 0, 7); g.fill(); g.stroke(); }, b.k !== 'enemy' || true);
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

  // the whole city (M)
  drawMap({ x, z, h, blips, players }) {
    const c = this.m, ctx = this.mx;
    const W = c.clientWidth, H = c.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const S = Math.min(c.width, c.height) * 0.94;
    const k = S / 480, ox = (c.width - S) / 2, oy = (c.height - S) / 2;
    const P = (vx, vz) => [ox + (vx + 240) * k, oy + (vz + 240) * k];
    ctx.fillStyle = '#05080c';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(this.img, ox, oy, S, S);
    const fs = Math.max(9, Math.min(13, S / 70));
    ctx.font = `bold ${fs}px Inter, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // the districts, faintly (long names on two lines, to fit the block)
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    const named = new Set();
    for (const b of BLOCKS) {
      if (named.has(b.name)) continue;
      named.add(b.name);
      const [px, py] = P((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
      const text = b.name.toUpperCase(), room = (b.x1 - b.x0) * k * 0.92;
      const words = text.split(' ');
      if (ctx.measureText(text).width <= room || words.length < 2) ctx.fillText(text, px, py);
      else {
        const half = Math.ceil(words.length / 2);
        ctx.fillText(words.slice(0, half).join(' '), px, py - fs * 0.6);
        ctx.fillText(words.slice(half).join(' '), px, py + fs * 0.6);
      }
    }
    ctx.font = `bold ${12 * dpr}px Inter, Arial, sans-serif`;
    for (const [key, l, col] of POIS) {
      const p = PLACES[key];
      const [px, py] = P(p.x, p.z);
      ctx.save(); ctx.translate(px, py); icon(ctx, dpr * 1.3, l, col, 8); ctx.restore();
    }
    for (const b of blips || []) {
      const [px, py] = P(b.x, b.z);
      ctx.save(); ctx.translate(px, py);
      if (b.k === 'giver') icon(ctx, dpr * 1.4, b.l, b.c, 9);
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
    void x; void z; void h;
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
