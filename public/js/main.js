// Start-up and menu flow: title screen, alone / host / join, lobby, the
// night itself, pause and results.

import * as THREE from 'three';
import './client/lighting.js';
import { Post } from './client/post.js';
import { Input } from './client/input.js';
import { Hud, showScreen, screenShown, renderLobby, renderResults, setMsg } from './client/ui.js';
import { HostLink, GuestLink, testConnection } from './client/net.js';
import { Mall } from './client/mallScene.js';
import { Game } from './client/game.js';
import { makePerson, bakePose, LOOKS, MANNEQUIN_LOOKS } from './client/humans.js';
import { Attract } from './client/attract.js';
import { MALL_UNIFORMS } from './client/lighting.js';
import { sound } from './client/audio.js';
import { voice } from './client/voice.js';
import * as MALL from './shared/mall.js';
import { MANNEQUIN_HOMES, UNIFORM_HOME } from './shared/mall.js';

const $ = (id) => document.getElementById(id);
const canvas = $('gl');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch {
  setMsg('titleMsg', 'Your browser could not start WebGL, which this game needs. Try Chrome, Edge or Firefox on a computer.');
  throw new Error('WebGL unavailable');
}
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
// the only shadow is your flashlight's: redrawn only while it's on (the game
// asks for it each frame)
renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = THREE.NoToneMapping;
const post = new Post(renderer);
const input = new Input(canvas);
const hud = new Hud();
// building the mall takes a moment: say so before the page goes quiet
showScreen('loading');
await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
const world = new Mall(renderer);
const attract = new Attract(world);

// the window displays, for the title screen (each night brings its own)
const display = new THREE.Group();
const dummy = (look, x, z, ry, pose) => {
  const m = makePerson(look);
  for (let k = 0; k < 30; k++) m.userData.rig.update(0.05, { pose, stiff: true, noBlink: true });
  const g = bakePose(m);
  g.scale.copy(m.scale);
  g.position.set(x, x < -40.2 ? 0.24 : 0, z);
  g.rotation.y = ry + Math.PI;
  display.add(g);
};
MANNEQUIN_HOMES.forEach(([x, z, ry], i) => dummy(MANNEQUIN_LOOKS[i % MANNEQUIN_LOOKS.length], x, z, ry, ['stand', 'pockets', 'hold'][i % 3]));
dummy('mqGuard', UNIFORM_HOME[0], UNIFORM_HOME[1], UNIFORM_HOME[2], 'stand');
world.scene.add(display);

// ------------------------------------------------------------- settings --
const params = new URLSearchParams(location.search);
// ?hour=3 starts the night at that hour (for testing): 0 is 10 PM, 8 is 6 AM
const startAt = Math.max(0, Math.min(8, Number(params.get('hour')) || 0));
const SETTINGS_KEY = 'kingsgate-night';
const settings = { name: '', sens: 1, vol: 0.8, invert: false, voices: true, vhs: false, graphics: 'auto', bright: 1 };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); } catch { /* private mode */ }
const save = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* private mode */ } };
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
$('bright').addEventListener('input', (e) => { settings.bright = +e.target.value; MALL_UNIFORMS.mallScale.value = settings.bright; save(); });
$('invert').addEventListener('change', (e) => { settings.invert = e.target.checked; save(); });
$('voices').addEventListener('change', (e) => { settings.voices = e.target.checked; voice.enabled = settings.voices; if (!settings.voices) voice.stop(); save(); });
$('vhs').addEventListener('change', (e) => { settings.vhs = e.target.checked; post.grainOn = settings.vhs; save(); });
$('graphics').value = settings.graphics;
$('graphics').addEventListener('change', (e) => { settings.graphics = e.target.value; save(); applyGraphics(); });
MALL_UNIFORMS.mallScale.value = settings.bright;

const invited = (params.get('join') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
if (invited) $('code').value = invited;
document.fonts?.load('40px "Special Elite"').catch(() => {});
document.fonts?.load('20px VT323').catch(() => {});

// ---------------------------------------------------------------- state --
let link = null;
let game = null;
let solo = false;
let backTo = 'title';
let paused = false;

// Graphics: 'auto' starts at the screen's own resolution and steps down a
// ladder while frames take too long (a little resolution, a smaller shadow
// map, no glow or anti-aliasing, less resolution again), climbing back when
// there's headroom. 'high' keeps everything, including the extra pixels of
// high-density screens; 'low' starts at the bottom (and has no shadows).
// `?scale=0.5` fixes the resolution (used by tests).
const LADDER = [
  { scale: 1, samples: 2, bloom: true, shadow: 1024 },
  { scale: 0.85, samples: 2, bloom: true, shadow: 1024 },
  { scale: 0.75, samples: 2, bloom: true, shadow: 512 },
  { scale: 0.75, samples: 0, bloom: false, shadow: 512 },
  { scale: 0.62, samples: 0, bloom: false, shadow: 512 },
  { scale: 0.5, samples: 0, bloom: false, shadow: 512 },
];
const PRESETS = {
  auto: { maxDpr: 1, top: 0, bottom: LADDER.length - 1, shadows: true },
  high: { maxDpr: 2, top: 0, bottom: 0, shadows: true, fixed: { samples: 4 } },
  low: { maxDpr: 1, top: LADDER.length - 2, bottom: LADDER.length - 1, shadows: false },
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
  world.shadowSize(L.shadow);
  quality = fixedScale || L.scale;
  post.setSize(innerWidth, innerHeight, quality);
}

function applyGraphics() {
  preset = PRESETS[settings.graphics] || PRESETS.auto;
  if (renderer.shadowMap.enabled !== preset.shadows) {
    renderer.shadowMap.enabled = preset.shadows;
    // every material has to be rebuilt with (or without) shadows
    world.scene.traverse((o) => {
      if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true;
    });
  }
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
renderer.shadowMap.enabled = preset.shadows;
setLevel(preset.top);
resize();

// Compile every shader the game will need now, while the title is up, so
// nobody's first sight of a mannequin (or the manager) stalls the game.
function prewarm(scene, camera) {
  const people = new THREE.Group();
  Object.keys(LOOKS).forEach((k, i) => {
    const p = makePerson(k);
    p.position.set(i * 0.8, -60, 0);
    people.add(p);
  });
  scene.add(people);
  renderer.compile(scene, camera);
  scene.remove(people);
}
prewarm(world.scene, attract.camera);
// handles for automated browser tests
if (params.has('autotest')) window.__three = { renderer, world, post, THREE, MALL };

function playerName() {
  const n = $('name').value.trim() || 'Guard';
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
  l.on('over', (m) => { if (l === link) endGame(m); });
  l.on('closed', (m) => { if (l === link) { leave(); setMsg('titleMsg', m.text); } });
  l.on('neterror', (m) => { if (l === link) setMsg('lobbyMsg', m.text); });
}

const actions = {
  solo() {
    begin();
    solo = true;
    link = new HostLink(playerName(), { startAt });
    wire(link);
    link.send({ t: 'start' });
  },
  host() {
    begin();
    solo = false;
    link = new HostLink(playerName(), { online: true, startAt });
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
    navigator.share?.({ title: 'Night Security', text: 'Work the night shift at Kingsgate Mall with me.', url: $('inviteLink').value }).catch(() => {});
  },
  start() { link?.send({ t: 'start' }); },
  again() { link?.send({ t: 'start' }); },
  tolobby() { link?.send({ t: 'tolobby' }); },
  leave: () => leave(),
  menu: () => leave(),
  quit: () => leave(),
  resume() {
    showScreen(null);
    input.lock();
    setPaused(false);
  },
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
  for (const id of ['title', 'lobby', 'pause', 'results']) if (screenShown(id)) return id;
  return 'title';
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-act]');
  if (b && actions[b.dataset.act]) actions[b.dataset.act]();
});
$('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') actions.join(); });

// ---------------------------------------------------------------- night --
function startGame(m) {
  if (game) disposeGame();
  hud.reset();
  display.visible = false;
  game = new Game({ renderer, post, world, link, start: m, hud, input, settings });
  game.resize(innerWidth, innerHeight);
  setPaused(false);
  showScreen(null);
  input.lock();
  setTimeout(() => { if (game && !input.locked && !screenShown('pause')) showScreen('clickToPlay'); }, 400);
  window.__game = game; // handle for automated browser tests
}

function endGame(over) {
  const amHost = !!link?.isHost;
  const show = () => {
    if (!game) return;
    disposeGame();
    input.unlock();
    renderResults(over, link?.id, amHost);
    $('toLobbyBtn').hidden = !amHost || solo;
    showScreen('results');
    sound.setScene('title', 2);
  };
  if (game) game.over();
  setTimeout(show, over.ending === 'taken' ? 2500 : 1200);
}

function disposeGame() {
  game.dispose();
  game = null;
  window.__game = null;
  display.visible = true;
  hud.hide();
  hud.reset();
  MALL_UNIFORMS.mallScale.value = settings.bright;
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
  sound.quiet();
  if (sound.ready) sound.setScene('title', 2);
}

// solo games really pause; with friends the night goes on
function setPaused(on) {
  paused = on && solo;
  if (link && link.lobby) link.lobby.paused = paused;
}

document.addEventListener('pointerlockchange', () => {
  if (!game) return;
  if (input.locked) {
    showScreen(null);
    setPaused(false);
  } else {
    showScreen('pause');
    setMsg('pauseNote', solo ? '' : "Heads up: the night keeps going for everyone else while you're paused.");
    setPaused(true);
  }
});
canvas.addEventListener('click', () => { if (game && !input.locked) actions.resume(); });

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
  $('inviteWho').textContent = `${from ? `${from}'s` : "A friend's"} shift · lobby ${invited}`;
  $('inviteName').value = $('name').value;
  $('inviteName').addEventListener('keydown', (e) => { if (e.key === 'Enter') actions.inviteJoin(); });
  showScreen('invite');
} else showScreen('title');
