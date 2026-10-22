// The map you carry (M): Kingsgate's floor plan, drawn from the same plan
// the 3D mall is built from, with every gate and door the alarm panel
// watches in green (locked), amber (shut, not locked) or red (open), the
// clock stations (filled once punched this round), the cameras, and where
// everyone is.

import { WALLS, STORES, STALLS, ROOMS, DOORS, STATIONS, CAMERAS } from '../shared/mall.js';
import { WATCHED } from '../host/match.js';
import { COLORS } from './ui.js';

const X0 = -66, X1 = 68, Z0 = -33, Z1 = 19, S = 10;
const sx = (x) => (x - X0) * S, sz = (z) => (z - Z0) * S;

export function doorState(v) {
  const open = (v % 1000) / 100, locked = Math.floor(v / 1000) % 2 === 1;
  return { open, locked, broken: Math.floor(v / 2000) % 2 === 1 };
}

export function drawMap(canvas, { doors = [], punched = [], round = 0, players = [], dale = null, place = null }) {
  canvas.width = (X1 - X0) * S;
  canvas.height = (Z1 - Z0) * S;
  const x = canvas.getContext('2d');
  x.fillStyle = '#10161c';
  x.fillRect(0, 0, canvas.width, canvas.height);
  // rooms
  for (const r of ROOMS) {
    x.fillStyle = r.store ? '#24303a' : r.group === 1 ? '#2e3c48' : '#1e262e';
    if (r.id === 'halv' || r.id === 'halvNorth') x.fillStyle = '#34262a';
    x.fillRect(sx(r.x0), sz(r.z0), (r.x1 - r.x0) * S, (r.z1 - r.z0) * S);
  }
  // walls
  x.fillStyle = '#8a9aa6';
  for (const w of WALLS) {
    if (w.y0 > 1.5 || w.glass) continue;
    x.fillRect(sx(w.x0), sz(w.z0), Math.max(1.5, (w.x1 - w.x0) * S), Math.max(1.5, (w.z1 - w.z0) * S));
  }
  // names
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = '#c8d4dc';
  x.font = '600 15px Inter, Arial, sans-serif';
  for (const s of STORES) {
    const name = s.type === 'vacant' ? '(empty)' : s.type === 'closing' ? '(closing)' : s.name;
    wrap(x, name, sx(s.cx), sz(s.cz), (s.x1 - s.x0) * S - 10);
  }
  x.font = '600 12px Inter, Arial, sans-serif';
  for (const s of STALLS) wrap(x, s.name, sx(s.cx), sz((s.z0 + s.z1) / 2), (s.x1 - s.x0) * S - 6);
  x.font = '600 22px Inter, Arial, sans-serif';
  x.fillStyle = '#e8c8b8';
  x.fillText("HALVORSEN'S", sx(-52), sz(2));
  x.font = '600 14px Inter, Arial, sans-serif';
  x.fillStyle = '#c8d4dc';
  for (const [t, X, Z] of [['CENTER COURT', 0, -3.5], ['FOOD COURT', 51, 6], ['SECURITY', 0, -26.5], ['MALL OFFICE', 11, -24], ['ELECTRICAL', -11.5, -24], ['BREAK RM', 19, -24], ['JANITOR', -19, -24], ['LOADING DOCK', 37, -28], ['FREEZER', 53, -23], ['STOCKROOM', -46, -15.5], ['SERVICE CORRIDOR', -24, -19], ['W', -6, -13.5], ['M', 6, -13.5], ['SOUTH ENTRANCE', 0, 13], ['EAST', 64, 0]]) x.fillText(t, sx(X), sz(Z));
  // gates and doors on the panel
  DOORS.forEach((d, k) => {
    const v = doors[k];
    if (v == null) return;
    const st = doorState(v);
    const watched = WATCHED.includes(k);
    if (!watched && d.kind !== 'door' && d.kind !== 'cage') return;
    x.fillStyle = st.open > 0.05 ? '#ff4a3a' : st.locked ? '#4ad86a' : '#f0b030';
    if (!watched) x.globalAlpha = 0.6;
    const t = d.kind === 'gate' ? 0.35 : 0.3;
    if (d.axis === 'x') x.fillRect(sx(d.a), sz(d.at - t), d.w * S, t * 2 * S);
    else x.fillRect(sx(d.at - t), sz(d.a), t * 2 * S, d.w * S);
    x.globalAlpha = 1;
  });
  // cameras
  x.fillStyle = '#9ad0ff';
  x.font = '600 11px Inter, Arial, sans-serif';
  CAMERAS.forEach((c) => {
    if (c.pos[2] > 17.5) return;
    x.beginPath();
    x.arc(sx(c.pos[0]), sz(c.pos[2]), 4, 0, 7);
    x.fill();
    x.fillText(`C${c.n}`, sx(c.pos[0]) + 12, sz(c.pos[2]) + 9);
  });
  // clock stations
  for (const s of STATIONS) {
    const done = round && punched[s.n - 1];
    x.beginPath();
    x.arc(sx(s.x), sz(s.z), 10, 0, 7);
    x.fillStyle = done ? '#e8d070' : '#10161c';
    x.fill();
    x.lineWidth = 2.5;
    x.strokeStyle = '#e8d070';
    x.stroke();
    x.fillStyle = done ? '#10161c' : '#e8d070';
    x.font = 'bold 13px Inter, Arial, sans-serif';
    x.fillText(String(s.n), sx(s.x), sz(s.z) + 1);
  }
  if (dale) {
    x.fillStyle = '#ffffff';
    x.beginPath(); x.arc(sx(dale.x), sz(dale.z), 7, 0, 7); x.fill();
    x.font = '600 12px Inter, Arial, sans-serif';
    x.fillText('DALE', sx(dale.x), sz(dale.z) - 14);
  }
  void place;
  // guards
  for (const p of players) {
    if (p.out) continue;
    x.save();
    x.translate(sx(p.x), sz(p.z));
    x.rotate(-p.ry);
    x.fillStyle = COLORS[p.color % 4];
    x.strokeStyle = '#fff';
    x.lineWidth = p.me ? 3 : 1.5;
    x.beginPath();
    x.moveTo(0, -14); x.lineTo(9, 9); x.lineTo(0, 4); x.lineTo(-9, 9); x.closePath();
    x.fill(); x.stroke();
    x.restore();
    if (p.me) {
      x.fillStyle = '#fff';
      x.font = 'bold 13px Inter, Arial, sans-serif';
      x.fillText('YOU', sx(p.x), sz(p.z) + 22);
    }
  }
}

function wrap(x, text, cx, cy, width) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (x.measureText(t).width > width && line) { lines.push(line); line = w; } else line = t;
  }
  lines.push(line);
  lines.forEach((l, i) => x.fillText(l, cx, cy + (i - (lines.length - 1) / 2) * 17));
}
