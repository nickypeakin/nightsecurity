// The heads-up display and the menu screens.

import { WEAPONS, PRICES } from '../shared/config.js';
import { SHOP } from '../shared/story.js';

const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const COLORS = ['#e05a4a', '#5a9ae0', '#5ac06a', '#e0b040'];

// "~y~yellow~w~ text" (the colour codes the jobs use) as HTML
export function colorize(text) {
  const C = { y: 'y', b: 'b', r: 'r', g: 'g', w: '' };
  let out = '', open = false;
  for (const part of String(text || '').split(/(~[a-z]~)/)) {
    const m = /^~([a-z])~$/.exec(part);
    if (m) { if (open) out += '</span>'; open = !!C[m[1]]; if (open) out += `<span class="${C[m[1]]}">`; } else out += esc(part);
  }
  return open ? `${out}</span>` : out;
}

export class Hud {
  constructor() {
    this.root = $('hud');
    this.last = {};
    this.timers = new Map();
  }

  show() { this.root.hidden = false; }
  hide() { this.root.hidden = true; }

  // cutscenes: black bars, and only the subtitles
  cinematic(on) { this.root.classList.toggle('cinematic', on); }

  set(id, text) {
    if (this.last[id] === text) return;
    this.last[id] = text;
    $(id).textContent = text ?? '';
  }
  html(id, html) {
    if (this.last[id] === html) return;
    this.last[id] = html;
    $(id).innerHTML = html;
  }

  money(n) { this.set('money', `$${String(Math.max(0, n | 0)).padStart(8, '0')}`); }
  clock(text) { this.set('clock', text); }
  health(hp, armor) {
    const w = (v) => `${Math.round(Math.max(0, Math.min(100, v)))}%`;
    if (this.last.hp !== hp) { this.last.hp = hp; $('hpBar').style.width = w(hp); $('hpBar').parentElement.classList.toggle('low', hp < 30); }
    if (this.last.armor !== armor) { this.last.armor = armor; $('armorBar').style.width = w(armor); $('armorBar').parentElement.hidden = armor <= 0; }
  }
  weapon(w, ammo, clip, reloading) {
    const W = WEAPONS[w];
    const txt = W.melee ? '' : reloading ? 'RELOADING' : `${clip} / ${Math.max(0, ammo - clip)}`;
    this.html('weapon', `<b>${esc(W.name.toUpperCase())}</b><span>${esc(txt)}</span>`);
  }
  // stars: how many, and whether they're flashing (the police have lost you)
  wanted(n, searching) {
    const key = `${n}:${searching}`;
    if (this.last.wanted === key) return;
    this.last.wanted = key;
    const el = $('wanted');
    el.innerHTML = [0, 1, 2, 3, 4].map((k) => `<i class="${k < n ? 'on' : ''}">★</i>`).join('');
    el.classList.toggle('flash', !!searching && n > 0);
    el.classList.toggle('none', n === 0);
  }
  mission(text) { this.html('mission', colorize(text)); }
  help(text) { this.html('help', text ? colorize(text) : ''); $('help').hidden = !text; }
  crosshair(on, hit = false) { $('cross').hidden = !on; $('cross').classList.toggle('hit', hit); }

  // a name (an area, a car) shown for a few seconds
  fleeting(id, text, sec = 3.5) {
    const el = $(id);
    el.textContent = text;
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
    clearTimeout(this.timers.get(id));
    this.timers.set(id, setTimeout(() => el.classList.remove('on'), sec * 1000));
  }
  area(name) { this.fleeting('area', name, 4); }
  carName(name) { this.fleeting('carName', name, 3); }

  // a line of dialogue
  say(name, text, kind = '', dur = 4) {
    const d = document.createElement('div');
    if (kind) d.className = kind;
    d.innerHTML = name ? `<b>${esc(name)}</b> ${esc(text)}` : esc(text);
    const box = $('subs');
    box.appendChild(d);
    while (box.children.length > 2) box.firstChild.remove();
    setTimeout(() => d.remove(), dur * 1000 + 600);
  }
  clearSubs() { $('subs').innerHTML = ''; }

  // the big words: MISSION PASSED, WASTED, BUSTED
  banner(text, sub = '', kind = '') {
    const b = $('banner');
    clearTimeout(this.timers.get('banner'));
    if (!text) { b.hidden = true; return; }
    b.hidden = false;
    b.className = kind;
    b.querySelector('h1').textContent = text;
    b.querySelector('p').textContent = sub || '';
    b.classList.remove('on');
    void b.offsetWidth;
    b.classList.add('on');
    this.timers.set('banner', setTimeout(() => { b.hidden = true; }, kind === 'wasted' || kind === 'busted' ? 5500 : 4000));
  }

  countdown(n) {
    const el = $('countdown');
    el.hidden = n == null;
    if (n != null) { el.textContent = n; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }
  }

  // hurt: the edges go red for a moment
  hurt(k) {
    const f = $('hurt');
    f.style.opacity = Math.min(0.85, 0.25 + k / 60);
    clearTimeout(this.timers.get('hurt'));
    this.timers.set('hurt', setTimeout(() => { f.style.opacity = 0; }, 160));
  }

  // the gun shop counter
  shop(open, money = 0, ammo = [], armor = 0, msg = '') {
    const el = $('shop');
    el.hidden = !open;
    if (!open) return;
    const rows = SHOP.map((s, i) => {
      if (s.armor) return `<button data-buy="${s.key}" ${money < PRICES.armor || armor >= 100 ? 'disabled' : ''}><span>${i + 1}. ${esc(s.label)}</span><span>$${PRICES.armor}</span></button>`;
      const k = WEAPONS.findIndex((w) => w.key === s.weapon);
      const W = WEAPONS[k];
      const owned = ammo[k] >= 0;
      const price = owned ? W.ammoPrice : W.price;
      return `<button data-buy="${s.key}" ${money < price ? 'disabled' : ''}><span>${i + 1}. ${esc(owned ? `${s.label} ammo` : s.label)}</span><span>$${price}</span></button>`;
    }).join('');
    el.innerHTML = `<h2>FREEDOM ARMS</h2><p class="sub">Cash: $${money}</p>${rows}<p class="msg">${esc(msg)}</p><p class="small">Click or press 1-4 to buy · E or Esc to leave</p>`;
  }

  reset() {
    this.last = {};
    this.cinematic(false);
    for (const id of ['subs', 'mission', 'weapon']) $(id).innerHTML = '';
    this.banner(null);
    this.help(null);
    this.countdown(null);
    this.shop(false);
    $('mapScreen').hidden = true;
  }
}

// --------------------------------------------------------------- screens --
export function showScreen(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  document.body.classList.toggle('menu', !!id && id !== 'clickToPlay');
}

export function screenShown(id) {
  return !$(id).hidden;
}

export function renderLobby(msg, myId) {
  $('lobbyCode').textContent = msg.code || '·····';
  const amHost = msg.hostId === myId;
  const slots = [];
  for (let i = 0; i < 4; i++) {
    const p = msg.players[i];
    if (p) slots.push(`<li style="--c:${COLORS[p.color % 4]}"><span>${esc(p.name)}${p.id === myId ? ' (you)' : ''}</span><span>${p.id === msg.hostId ? 'HOST' : 'READY'}</span></li>`);
    else slots.push('<li class="empty"><span>Empty</span><span>-</span></li>');
  }
  $('slots').innerHTML = slots.join('');
  $('startBtn').hidden = !amHost;
  $('lobbyWait').textContent = amHost ? '' : 'Waiting for the host to start...';
}

// cls: 'good' or 'bad' to colour the message
export function setMsg(id, text, cls = '') {
  const el = $(id);
  el.textContent = text || '';
  el.className = `msg ${cls}`.trim();
}
