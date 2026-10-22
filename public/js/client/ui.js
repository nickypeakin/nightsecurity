// The heads-up display and the menu screens.

const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const COLORS = ['#c9493a', '#5a8fc8', '#5a9a52', '#d0a030'];

// hours as a clock: 22.5 is 10:30 PM, 26.25 is 2:15 AM
export function clockText(h, seconds = false) {
  h = ((h % 24) + 24) % 24;
  const hh = Math.floor(h), mm = Math.floor((h % 1) * 60), ss = Math.floor(((h * 60) % 1) * 60);
  return `${hh % 12 || 12}:${String(mm).padStart(2, '0')}${seconds ? `:${String(ss).padStart(2, '0')}` : ''} ${hh >= 12 ? 'PM' : 'AM'}`;
}

export class Hud {
  constructor() {
    this.root = $('hud');
    this.last = {};
    this.cardTimers = [];
  }

  show() { this.root.hidden = false; this.banner(null); }
  hide() { this.root.hidden = true; }

  // cutscenes show only subtitles, the title card and the skip hint
  cinematic(on) { this.root.classList.toggle('cinematic', on); }
  // on the cameras: only the camera's own overlay
  cctv(on) { this.root.classList.toggle('cctv', on); $('camOverlay').hidden = !on; }

  set(id, text) {
    if (this.last[id] === text) return;
    this.last[id] = text;
    $(id).textContent = text || '';
  }
  html(id, html) {
    if (this.last[id] === html) return;
    this.last[id] = html;
    $(id).innerHTML = html;
  }

  // one or two lines under the crosshair: [E] ..., [R] ...
  prompt(text, second = null) {
    this.html('prompt', text ? `${esc(text)}${second ? `<small>${esc(second)}</small>` : ''}` : '');
  }
  clock(h, label) { this.set('clock', h == null ? '' : clockText(h)); this.set('dayName', label || ''); }
  hint(text) { this.set('hint', text); }

  // [{ id, text, n, of, done, optional }]
  objectives(list, flashId = null) {
    const html = (list || []).map((o) => {
      const count = o.of > 1 ? ` <span class="n">${Math.min(o.n, o.of)}/${o.of}</span>` : '';
      return `<li class="${o.done ? 'done' : ''} ${o.optional ? 'opt' : ''} ${o.id === flashId ? 'flash' : ''}">${esc(o.text)}${count}</li>`;
    }).join('');
    this.html('objectives', html);
  }

  meter(id, v) {
    const el = $(id);
    el.hidden = v == null;
    if (v == null) return;
    const w = `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
    if (this.last[id] !== w) { this.last[id] = w; el.querySelector('i').style.width = w; }
    el.classList.toggle('low', v < 0.3);
  }

  stamina(v) { this.meter('staminaMeter', v); }
  flashlight(on) { $('flashicon').classList.toggle('on', !!on); }
  crosshair(on) { $('cross').hidden = !on; }

  team(list) {
    const html = list.map((p) => `<li class="${p.me ? 'me' : ''} ${p.out ? 'out' : ''}" style="--c:${COLORS[p.color % 4]}">${esc(p.name)}${p.where ? ` <span>${esc(p.where)}</span>` : ''}</li>`).join('');
    this.html('team', html);
  }

  // a line of dialogue. kind: '' (someone near), 'radio', 'ch2', 'pa', 'creepy'
  say(name, text, kind = '') {
    const d = document.createElement('div');
    if (kind) d.className = kind;
    d.innerHTML = name ? `<b>${esc(name)}</b> ${esc(text)}` : esc(text);
    const box = $('subs');
    box.appendChild(d);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => d.remove(), 4200 + text.length * 50);
  }

  toast(text) {
    const d = document.createElement('div');
    d.textContent = text;
    const box = $('toasts');
    box.appendChild(d);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => d.remove(), 5600);
  }

  flash(text) {
    const f = $('flash');
    f.textContent = text;
    f.classList.remove('on');
    void f.offsetWidth;
    f.classList.add('on');
  }

  banner(title, sub) {
    const b = $('banner');
    b.hidden = !title;
    if (title) {
      b.querySelector('h1').textContent = title;
      b.querySelector('p').textContent = sub || '';
    }
  }

  // a full-screen panel over the game (walkie, logbook, map, notes...)
  panel(html, cls = '') {
    const p = $('panel');
    p.hidden = !html;
    p.className = cls;
    if (html) p.innerHTML = html;
  }
  get panelOpen() { return !$('panel').hidden; }

  // the camera feed's overlay
  camOverlay(cam, n, clock, rec) {
    this.html('camOverlay', `<div class="tl">CAM ${n} · ${esc(cam)}</div><div class="tr">${esc(clockText(clock, true))}<br>10/${clock >= 24 ? 25 : 24}/96</div><div class="bl">${rec ? '<span class="rec">●</span> REC' : 'NO SIGNAL'}</div><div class="br">[A]/[D] or [1]-[8] switch camera · [E] step back</div>`);
  }

  // the hour, big, then gone
  card(title, sub, dur = 4) {
    const c = $('card');
    for (const t of this.cardTimers) clearTimeout(t);
    this.cardTimers = [];
    if (!title) { c.hidden = true; return; }
    c.hidden = false;
    c.querySelector('h1').textContent = title;
    c.querySelector('h2').textContent = sub || '';
    c.classList.remove('on');
    void c.offsetWidth;
    c.classList.add('on');
    this.cardTimers.push(setTimeout(() => { c.hidden = true; }, dur * 1000));
  }

  reset() {
    this.last = {};
    this.cinematic(false);
    this.cctv(false);
    for (const id of ['prompt', 'clock', 'dayName', 'hint']) $(id).textContent = '';
    for (const id of ['subs', 'toasts', 'team', 'objectives']) $(id).innerHTML = '';
    $('staminaMeter').hidden = true;
    this.panel(null);
    this.card(null);
    this.banner(null);
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
    if (p) slots.push(`<li style="--c:${COLORS[p.color % 4]}"><span>${esc(p.name)}${p.id === myId ? ' (you)' : ''}</span><span>${p.id === msg.hostId ? 'HOST' : 'ON SHIFT'}</span></li>`);
    else slots.push('<li class="empty"><span>Empty</span><span>-</span></li>');
  }
  $('slots').innerHTML = slots.join('');
  $('startBtn').hidden = !amHost;
  $('lobbyWait').textContent = amHost ? '' : 'Waiting for the host to clock in...';
}

const FATE = { survived: 'MADE IT TO SIX', taken: 'TAKEN', gone: 'LEFT' };
export function renderResults(over, myId, amHost) {
  $('resultHead').textContent = over.title;
  $('resultLines').innerHTML = over.lines.map((l) => `<p>${esc(l)}</p>`).join('');
  $('resultList').innerHTML = over.results.map((r) =>
    `<li class="${r.st}" style="--c:${COLORS[r.color % 4]}"><span>${esc(r.name)}${r.id === myId ? ' (you)' : ''}</span><span>${FATE[r.st] || ''}${r.st === 'taken' && r.time != null ? ` · ${clockText(r.time)}` : ''}</span></li>`).join('');
  const S = over.stats;
  if (S) {
    const dale = S.dale === 'safe' ? 'found, and safe in the office' : S.dale === 'found' ? 'found' : `not found (he was in ${S.place})`;
    const rep = S.report == null ? 'not filed' : `${S.report} of 3 right`;
    $('resultStats').innerHTML = `
      <div class="grade">${esc(S.grade)}</div>
      <table>
        <tr><td>Locked at six</td><td>${S.locked} of ${S.lockTotal}</td></tr>
        <tr><td>Clock stations punched</td><td>${S.punches} of ${S.punchTotal}</td></tr>
        <tr><td>What you found out</td><td>${S.clues} of ${S.clueTotal}</td></tr>
        <tr><td>Dale Mercer</td><td>${esc(dale)}</td></tr>
        <tr><td>Incident report</td><td>${esc(rep)}</td></tr>
      </table>`;
  } else $('resultStats').innerHTML = '';
  $('againBtn').hidden = !amHost;
  $('toLobbyBtn').hidden = !amHost;
  $('resultWait').textContent = amHost ? '' : 'Waiting for the host...';
}

// cls: 'good' or 'bad' to colour the message
export function setMsg(id, text, cls = '') {
  const el = $(id);
  el.textContent = text || '';
  el.className = `msg ${cls}`.trim();
}
