// Start-up and menu flow: title screen, continue / new game / host / join,
// the lobby, the city itself, pause, saving.

import * as THREE from 'three';
import { CITY_UNIFORMS } from './client/lighting.js';
import { Post } from './client/post.js';
import { Input } from './client/input.js';
import { Hud, showScreen, screenShown, renderLobby, setMsg } from './client/ui.js';
import { HostLink, GuestLink, testConnection } from './client/net.js';
import { City } from './client/cityScene.js';
import { Game } from './client/game.js';
import { Attract } from './client/attract.js';
import { sound } from './client/audio.js';
import { voice } from './client/voice.js';
import { MISSIONS } from './shared/story.js';

const $ = (id) => document.getElementById(id);
const canvas = $('gl');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch {
  setMsg('titleMsg', 'Your browser could not start WebGL, which this game needs. Try Chrome, Edge or Firefox on a computer.');
  throw new Error('WebGL unavailable');
}
renderer.shadowMap.enabled = false;
renderer.toneMapping = THREE.NoToneMapping;
const post = new Post(renderer);
const input = new Input(canvas);
const hud = new Hud();
// building the city takes a moment: say so before the page goes quiet
showScreen('loading');
await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
const world = new City();
const attract = new Attract(world);

// ------------------------------------------------------------- settings --
const params = new URLSearchParams(location.search);
// ?skip skips the opening (used by tests)
const startAt = params.has('skip') ? 'skip' : 0;
const SETTINGS_KEY = 'kingsgate-city';
const SAVE_KEY = 'kingsgate-city-save';
const settings = { name: '', sens: 1, vol: 0.8, invert: false, voices: true, vhs: false, graphics: 'auto', bright: 1, radio: 0.6 };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); } catch { /* private mode */ }
const save = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* private mode */ } };
const loadGame = () => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; } };
const storeGame = (data) => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* private mode */ } };
sound.volume = settings.vol;
voice.volume = settings.vol;
voice.enabled = settings.voices && !params.has('autotest');
post.grainOn = settings.vhs;

const DEFAULT_NAMES = ['Alex', 'Sam', 'Jordan', 'Casey', 'Riley', 'Morgan', 'Jamie', 'Taylor', 'Pat', 'Robin'];
$('name').value = settings.name || DEFAULT_NAMES[Math.floor(Math.random() * DEFAULT_NAMES.length)];
$('sens').value = settings.sens;
$('vol').value = settings.vol;
$('bright').value = settings.bright;
$('invert').checked = settings.invert;
$('voices').checked = settings.voices;
$('vhs').checked = settings.vhs;
$('sens').addEventListener('input', (e) => { settings.sens = +e.target.value; save(); });
$('vol').addEventListener('input', (e) => { settings.vol = +e.target.value; sound.setVolume(settings.vol); voice.volume = settings.vol; save(); });
$('bright').addEventListener('input', (e) => { settings.bright = +e.target.value; CITY_UNIFORMS.cityScale.value = settings.bright; save(); });
$('invert').addEventListener('change', (e) => { settings.invert = e.target.checked; save(); });
$('voices').addEventListener('change', (e) => { settings.voices = e.target.checked; voice.enabled = settings.voices; if (!settings.voices) voice.stop(); save(); });
$('vhs').addEventListener('change', (e) => { settings.vhs = e.target.checked; post.grainOn = settings.vhs; save(); });
$('graphics').value = settings.graphics;
$('graphics').addEventListener('change', (e) => { settings.graphics = e.target.value; save(); applyGraphics(); });
CITY_UNIFORMS.cityScale.value = settings.bright;

const invited = (params.get('join') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
if (invited) $('code').value = invited;
document.fonts?.load('40px "Special Elite"').catch(() => {});
document.fonts?.load('20px VT323').catch(() => {});

// the continue button, if there's a game to continue
function showContinue() {
  const g = loadGame();
  const b = $('continueBtn');
  b.hidden = !g;
  if (g) b.querySelector('small').textContent = `${Math.min(g.done || 0, MISSIONS.length)} of ${MISSIONS.length} jobs done · $${g.money || 0}`;
}
showContinue();

// ---------------------------------------------------------------- state --
let link = null;
let game = null;
let solo = false;
let backTo = 'title';
let paused = false;

// Graphics: 'auto' starts at the screen's own resolution and steps down a
// ladder while frames take too long (a little resolution, no glow or
// anti-aliasing, less resolution again), climbing back when there's
// headroom. 'high' keeps everything, including the extra pixels of
// high-density screens; 'low' starts at the bottom.
// `?scale=0.5` fixes the resolution (used by tests).
const LADDER = [
  { scale: 1, samples: 2, bloom: true },
  { scale: 0.85, samples: 2, bloom: true },
  { scale: 0.75, samples: 0, bloom: true },
  { scale: 0.7, samples: 0, bloom: false },
  { scale: 0.6, samples: 0, bloom: false },
  { scale: 0.5, samples: 0, bloom: false },
];
const PRESETS = {
  auto: { maxDpr: 1, top: 0, bottom: LADDER.length - 1 },
  high: { maxDpr: 2, top: 0, bottom: 0, fixed: { samples: 4 } },
  low: { maxDpr: 1, top: LADDER.length - 2, bottom: LADDER.length - 1 },
};
const fixedScale = Number(params.get('scale')) || 0;
let preset = PRESETS[settings.graphics] || PRESETS.auto;
let level = preset.top;
let quality = 1;
let frameAvg = 1 / 60, judgeT = 0, calmT = 0, upWait = 6, sinceUp = 99;

function setLevel(i) {
  level = i;
  const L = { ...LADDER[i], ...(preset.fixed || {}) };
  post.configure({ maxDpr: preset.maxDpr, samples: L.samples, bloom: L.bloom });
  quality = fixedScale || L.scale;
  post.setSize(innerWidth, innerHeight, quality);
}

function applyGraphics() {
  preset = PRESETS[settings.graphics] || PRESETS.auto;
  frameAvg = 1 / 60;
  calmT = 0;
  upWait = 6;
  setLevel(preset.top);
  resize();
}

// If frames take too long, a step down the ladder; a step back up once
// they've been quick for a while (and a longer while each time a step up
// proves too much).
let longRun = 0;
function adaptQuality(dt) {
  if (fixedScale || preset.top === preset.bottom) return;
  // a lone long frame (a shader compiling, coming back to the tab) says
  // nothing about the computer; one after another does
  if (dt > 0.4) { if (++longRun < 3) return; dt = 0.4; } else longRun = 0;
  frameAvg += (dt - frameAvg) * 0.08;
  judgeT += dt;
  calmT += dt;
  sinceUp += dt;
  if (judgeT < 1) return;
  judgeT = 0;
  if (frameAvg > 1 / 45 && level < preset.bottom) {
    if (sinceUp < 5) upWait = Math.min(60, upWait * 2);
    setLevel(Math.min(preset.bottom, level + (frameAvg > 1 / 28 ? 2 : 1)));
    frameAvg = 1 / 50;
    calmT = 0;
  } else if (frameAvg < 1 / 57 && level > preset.top && calmT > upWait) {
    setLevel(level - 1);
    calmT = 0;
    sinceUp = 0;
  }
}

function resize() {
  const w = innerWidth, h = innerHeight;
  post.setSize(w, h, quality);
  attract.resize(w, h);
  if (game) game.resize(w, h);
}
addEventListener('resize', resize);
setLevel(preset.top);
resize();
renderer.compile(world.scene, attract.camera);
// handles for automated browser tests
if (params.has('autotest')) window.__three = { renderer, world, post, THREE };

function playerName() {
  const n = $('name').value.trim() || 'Player';
  settings.name = n;
  save();
  return n;
}

// the title screen hums once the browser lets us make sound
addEventListener('pointerdown', () => {
  if (!sound.ready) { sound.init(); sound.setVolume(settings.vol); }
  if (!game) sound.setScene('title', 2);
}, { once: true });

function begin() {
  sound.init();
  sound.setVolume(settings.vol);
  if (link) link.close();
  link = null;
  setMsg('titleMsg', '');
  setMsg('lobbyMsg', '');
}

function wire(l) {
  l.on('lobby', (m) => {
    if (l !== link || game || solo) return;
    showScreen('lobby');
    renderLobby(m, l.id);
    showInvite(m);
  });
  l.on('status', (m) => { if (l === link && !game) setMsg(l.isHost ? 'lobbyMsg' : guestMsgId(), m.text); });
  l.on('start', (m) => { if (l === link) startGame(m); });
  l.on('save', (m) => { if (l === link && l.isHost) storeGame(m.data); });
  l.on('closed', (m) => { if (l === link) { leave(); setMsg('titleMsg', m.text); } });
  l.on('neterror', (m) => { if (l === link) setMsg('lobbyMsg', m.text); });
}

const actions = {
  // carry on from the save on this computer
  continue() {
    begin();
    solo = true;
    link = new HostLink(playerName(), { startAt: 'skip', save: loadGame() });
    wire(link);
    link.send({ t: 'start' });
  },
  solo() {
    if (loadGame() && !confirm('Start a new game? Your saved progress on this computer will be replaced when you next save.')) return;
    begin();
    solo = true;
    link = new HostLink(playerName(), { startAt });
    wire(link);
    link.send({ t: 'start' });
  },
  host() {
    begin();
    solo = false;
    link = new HostLink(playerName(), { online: true, startAt: 'skip', save: loadGame() });
    wire(link);
    showScreen('lobby');
  },
  join() {
    const code = $('code').value.toUpperCase().replace(/[^A-Z]/g, '');
    if (code.length !== 5) { setMsg('titleMsg', 'Lobby codes are 5 letters.', 'bad'); return; }
    begin();
    solo = false;
    const btn = $('inviteBtn');
    const msgId = guestMsgId();
    const l = (link = new GuestLink(playerName(), code));
    wire(l);
    btn.disabled = true;
    btn.textContent = 'JOINING...';
    l.connect().then(() => setMsg(msgId, '')).catch((e) => {
      if (link === l) link = null;
      setMsg(msgId, e.message, 'bad');
    }).finally(() => {
      btn.disabled = false;
      btn.textContent = 'TRY AGAIN';
    });
  },
  // from an invite link: one button, straight into the friend's lobby
  inviteJoin() {
    $('name').value = $('inviteName').value;
    $('code').value = invited;
    actions.join();
  },
  async nettest() {
    const id = screenShown('invite') ? 'inviteMsg' : 'titleMsg';
    setMsg(id, 'Testing your connection (this takes about 10 seconds)...');
    const r = await testConnection();
    if (!r.webrtc) setMsg(id, "This browser can't do online play. Try Chrome, Edge or Firefox.", 'bad');
    else if (!r.server) setMsg(id, "Can't reach the matchmaking server (0.peerjs.com). This network, an ad blocker or a school/work filter is blocking it. Try another network or a phone hotspot.", 'bad');
    else if (r.relay) setMsg(id, 'Online play should work on this network.', 'good');
    else if (r.direct) setMsg(id, "Online play should work with most friends. If it doesn't, one of you is probably on a school or work network: try a phone hotspot.", 'good');
    else setMsg(id, 'This network blocks the connections online play needs (common on school and work Wi-Fi). Try a different network or a phone hotspot.', 'bad');
  },
  help() { backTo = currentScreen(); showScreen('help'); },
  settings() { backTo = currentScreen(); showScreen('settings'); },
  back() { showScreen(backTo); },
  copy() {
    const url = $('inviteLink').value;
    if (!url) return;
    $('inviteLink').select();
    const done = () => setMsg('lobbyMsg', 'Invite link copied. Paste it to your friends.', 'good');
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, () => document.execCommand('copy') && done());
    else if (document.execCommand('copy')) done();
  },
  share() {
    navigator.share?.({ title: 'Kingsgate Nights', text: 'Come and cause trouble in Kingsgate with me.', url: $('inviteLink').value }).catch(() => {});
  },
  start() { link?.send({ t: 'start' }); },
  leave: () => leave(),
  menu: () => leave(),
  quit: () => leave(),
  resume() {
    showScreen(null);
    input.lock();
    setPaused(false);
  },
  map() { if (game) game.toggleMap(); },
};

function guestMsgId() {
  return screenShown('invite') ? 'inviteMsg' : 'titleMsg';
}

// the invite link (and code) everyone in the lobby can pass on
function showInvite(m) {
  $('inviteBox').hidden = !m.code;
  if (!m.code) return;
  const host = m.players.find((p) => p.id === m.hostId);
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('join', m.code);
  if (host) url.searchParams.set('from', host.name);
  $('inviteLink').value = url.href;
  $('shareBtn').hidden = !navigator.share;
}

function currentScreen() {
  for (const id of ['title', 'lobby', 'pause']) if (screenShown(id)) return id;
  return 'title';
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-act]');
  if (b && actions[b.dataset.act]) actions[b.dataset.act]();
});
$('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') actions.join(); });

// ---------------------------------------------------------------- game --
function startGame(m) {
  if (game) disposeGame();
  hud.reset();
  game = new Game({ renderer, post, world, link, start: m, hud, input, settings });
  game.resize(innerWidth, innerHeight);
  setPaused(false);
  showScreen(null);
  input.lock();
  setTimeout(() => { if (game && !input.locked && !screenShown('pause')) showScreen('clickToPlay'); }, 400);
  window.__game = game; // handle for automated browser tests
}

function disposeGame() {
  game.dispose();
  game = null;
  window.__game = null;
  hud.hide();
  hud.reset();
}

function leave() {
  if (link) link.close();
  link = null;
  solo = false;
  if (invited && screenShown('invite')) history.replaceState(null, '', location.pathname);
  if (game) disposeGame();
  setPaused(false);
  input.unlock();
  showScreen('title');
  showContinue();
  sound.quiet();
  if (sound.ready) sound.setScene('title', 2);
}

// solo games really pause; with friends the city goes on
function setPaused(on) {
  paused = on && solo;
  if (link && link.lobby) link.lobby.paused = paused;
}

document.addEventListener('pointerlockchange', () => {
  if (!game) return;
  if (input.locked) {
    showScreen(null);
    setPaused(false);
  } else if (!game.mapOpen && !game.shopOpen) {
    showScreen('pause');
    setMsg('pauseNote', solo ? 'Your progress saves when you pass a job, find a tape, or walk into your place.' : "Heads up: the city keeps going for everyone else while you're paused.");
    setPaused(true);
  }
});
canvas.addEventListener('click', () => { if (game && !input.locked && !game.mapOpen && !game.shopOpen) actions.resume(); });

// ----------------------------------------------------------------- loop --
let last = performance.now();
const titleFx = { fade: 0, bars: 0, exposure: 1.0 };
function frame(now) {
  const raw = (now - last) / 1000, dt = Math.min(0.1, raw);
  last = now;
  adaptQuality(raw);
  if (game) {
    if (!paused) game.update(dt);
    game.render();
  } else {
    attract.update(dt);
    sound.update(dt);
    titleFx.time = now / 1000;
    titleFx.fade = attract.fade;
    post.render((target) => world.render(renderer, attract.camera, target), titleFx);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (invited) {
  const from = (params.get('from') || '').slice(0, 16);
  $('inviteWho').textContent = `${from ? `${from}'s` : "A friend's"} game · lobby ${invited}`;
  $('inviteName').value = $('name').value;
  $('inviteName').addEventListener('keydown', (e) => { if (e.key === 'Enter') actions.inviteJoin(); });
  showScreen('invite');
} else showScreen('title');
