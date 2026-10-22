// How this tab talks to the match. If you host (or play solo) the lobby runs
// right here and your own messages are plain function calls. Friends who
// join by code connect to the host's browser over a WebRTC data channel; the
// free PeerJS service is only used to find each other by lobby code.

import { Lobby } from '../host/lobby.js';
import { PEER_PREFIX, PROTOCOL } from '../shared/config.js';

const SERVER_TIMEOUT = 12000;    // to reach the matchmaking server
const JOIN_TIMEOUT = 25000;      // from finding the lobby to being in it
const SILENCE = 20000;           // pings flow every 2 s, so this means they're gone
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

// Where two browsers find a route to each other. STUN works on most home
// networks; the TURN relays carry the game when a network (often school or
// work Wi-Fi, or two computers behind the same router) won't allow a direct
// connection. Port 443 relays get through the strictest firewalls.
const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
];

const BLOCKED = "Found the lobby, but couldn't open a connection to the host's computer. Some school and work networks block this. Try a different Wi-Fi network or a phone hotspot (it only needs to work on one side).";

let peerLib = null;
function loadPeer() {
  if (!peerLib) {
    peerLib = new Promise((resolve, reject) => {
      if (window.Peer) { resolve(window.Peer); return; }
      const s = document.createElement('script');
      s.src = new URL('../../vendor/peerjs.min.js', import.meta.url).href;
      s.onload = () => (window.Peer ? resolve(window.Peer) : reject(new Error('PeerJS missing')));
      s.onerror = () => { peerLib = null; reject(new Error('Could not load PeerJS')); };
      document.head.appendChild(s);
    });
  }
  return peerLib;
}

// ?peer=host:port points at a self-hosted PeerJS server (used by tests)
function peerOptions() {
  const v = new URLSearchParams(location.search).get('peer');
  const opts = { debug: 1, config: { iceServers: ICE_SERVERS } };
  if (v) {
    const [host, port] = v.split(':');
    Object.assign(opts, { host, port: Number(port) || 9000, path: '/', secure: false });
  }
  return opts;
}

// Browsers slow timers in background tabs (down to once a minute after a
// while), which would stall the match or drop friends when someone switches
// tabs to send the invite link. Timers in a worker keep their pace, so the
// match clock and the keep-alive pings tick from one.
function workerTicker(fn, ms) {
  try {
    const url = URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${ms});`], { type: 'text/javascript' }));
    const w = new Worker(url);
    w.onmessage = fn;
    return () => { w.terminate(); URL.revokeObjectURL(url); };
  } catch {
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  }
}

export function makeCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

class Emitter {
  constructor() { this.handlers = new Map(); }
  on(t, fn) {
    if (!this.handlers.has(t)) this.handlers.set(t, new Set());
    this.handlers.get(t).add(fn);
    return () => this.handlers.get(t).delete(fn);
  }
  emit(msg) {
    for (const fn of this.handlers.get(msg.t) || []) fn(msg);
    for (const fn of this.handlers.get('*') || []) fn(msg);
  }
}

// ------------------------------------------------------------------ host --
export class HostLink extends Emitter {
  // startAt: which part of the story to begin at (for testing)
  constructor(name, { online = false, startAt = 0 } = {}) {
    super();
    this.isHost = true;
    this.lobby = new Lobby({ ticker: workerTicker, startAt });
    this.guests = new Set();
    this.id = this.lobby.add(name, (msg) => queueMicrotask(() => this.emit(msg)));
    if (online) this.goOnline();
  }

  send(msg) { this.lobby.fromPlayer(this.id, msg); }

  status(text) { this.emit({ t: 'status', text }); }

  async goOnline() {
    this.status('Contacting the matchmaking server...');
    let Peer;
    try { Peer = await loadPeer(); } catch {
      this.emit({ t: 'neterror', text: 'Could not load the multiplayer library. Check your internet connection, then try again.' });
      return;
    }
    for (let attempt = 0; attempt < 5 && !this.closed; attempt++) {
      const code = makeCode();
      try {
        await this.listen(Peer, code);
        this.lobby.code = code;
        this.lobby.sendLobby();
        this.status('Lobby is open. Send your friends the invite link.');
        this.stopPinger = workerTicker(() => this.heartbeat(), 2000);
        return;
      } catch (e) {
        if (e && e.type === 'unavailable-id') continue;
        const why = e && e.type === 'timeout'
          ? "The matchmaking server (0.peerjs.com) didn't answer. Your network may be blocking it, or it may be busy."
          : `Couldn't reach the matchmaking server (${(e && e.type) || 'error'}).`;
        this.emit({ t: 'neterror', text: `${why} Leave and try hosting again, or play solo.` });
        return;
      }
    }
  }

  listen(Peer, code) {
    return new Promise((resolve, reject) => {
      const peer = new Peer(PEER_PREFIX + code, peerOptions());
      let open = false;
      const timer = setTimeout(() => { if (!open) { peer.destroy(); reject({ type: 'timeout' }); } }, SERVER_TIMEOUT);
      peer.on('open', () => { open = true; clearTimeout(timer); this.peer = peer; resolve(); });
      peer.on('error', (e) => {
        if (!open) { clearTimeout(timer); peer.destroy(); reject(e); return; }
        console.warn('peer error', e.type);
      });
      // keep the code registered so more friends can still find us
      peer.on('disconnected', () => { if (!this.closed && !peer.destroyed) peer.reconnect(); });
      peer.on('connection', (conn) => this.accept(conn));
    });
  }

  accept(conn) {
    const g = { conn, id: null, last: performance.now() };
    this.guests.add(g);
    this.status('Someone is connecting...');
    const drop = () => {
      if (!this.guests.has(g)) return;
      this.guests.delete(g);
      if (g.id) this.lobby.remove(g.id);
      else this.status("A friend found your lobby but couldn't connect. One of your networks is blocking the connection; a phone hotspot on either side usually fixes it.");
      try { conn.close(); } catch { /* already closed */ }
    };
    g.drop = drop;
    conn.on('data', (msg) => {
      g.last = performance.now();
      if (!msg || typeof msg !== 'object') return;
      if (g.id == null) {
        if (msg.t !== 'hello') return;
        if (msg.v !== PROTOCOL) {
          conn.send({ t: 'refused', text: "Your copy of the game is a different version from the host's. Both of you: refresh the page (Ctrl+Shift+R, or Cmd+Shift+R on a Mac) and try again." });
          setTimeout(drop, 1000);
          return;
        }
        g.id = this.lobby.add(msg.name, (m) => { if (conn.open) conn.send(m); });
        if (!g.id) setTimeout(drop, 1000);
        else this.status('A friend joined. Clock in when everyone is here.');
        return;
      }
      this.lobby.fromPlayer(g.id, msg);
    });
    conn.on('close', drop);
    conn.on('error', drop);
  }

  heartbeat() {
    const now = performance.now();
    for (const g of [...this.guests]) {
      if (now - g.last > (g.id ? SILENCE : JOIN_TIMEOUT)) g.drop();
      else if (g.conn.open) g.conn.send({ t: 'ping' });
    }
  }

  close() {
    this.closed = true;
    if (this.stopPinger) this.stopPinger();
    this.lobby.close();
    for (const g of this.guests) try { g.conn.close(); } catch { /* gone */ }
    if (this.peer) this.peer.destroy();
  }
}

// ----------------------------------------------------------------- guest --
export class GuestLink extends Emitter {
  constructor(name, code) {
    super();
    this.isHost = false;
    this.name = name;
    this.code = code.toUpperCase().replace(/[^A-Z]/g, '');
  }

  status(text) { this.emit({ t: 'status', text }); }

  // Resolves once we're in the host's lobby. Each stage reports progress and
  // fails with a reason, so a blocked network doesn't look like a hang.
  connect() {
    return new Promise((resolve, reject) => {
      let stage = 'server';
      let timer = null;
      const fail = (text) => {
        if (this.closed) return;
        clearTimeout(timer);
        this.close();
        reject(new Error(text));
      };
      const wait = (ms, text) => { clearTimeout(timer); timer = setTimeout(() => fail(text), ms); };
      this.status('Contacting the matchmaking server...');
      wait(SERVER_TIMEOUT, "The matchmaking server (0.peerjs.com) didn't answer. Your network may be blocking it, or it may be busy. Try again in a moment.");
      loadPeer().then((Peer) => {
        if (this.closed) return;
        const peer = (this.peer = new Peer(peerOptions()));
        peer.on('error', (e) => {
          if (e.type === 'peer-unavailable') fail(`There's no lobby with code ${this.code}. Check the code; the host must be on the lobby screen with the game open.`);
          else if (stage !== 'in') fail(stage === 'server' ? `Couldn't reach the matchmaking server (${e.type}).` : `Couldn't connect to lobby ${this.code} (${e.type}).`);
        });
        peer.on('open', () => {
          stage = 'host';
          this.status(`Found the matchmaking server. Connecting to lobby ${this.code}...`);
          wait(JOIN_TIMEOUT, BLOCKED);
          const conn = (this.conn = peer.connect(PEER_PREFIX + this.code, { reliable: true, serialization: 'json' }));
          conn.on('iceStateChanged', (st) => {
            if (st === 'checking') this.status("Lobby found. Opening a connection to the host's computer...");
            if (st === 'failed' && stage !== 'in') fail(BLOCKED);
          });
          conn.on('error', (e) => { if (stage !== 'in') fail(e && e.type === 'negotiation-failed' ? BLOCKED : `Couldn't connect to lobby ${this.code} (${(e && e.type) || 'error'}).`); });
          conn.on('open', () => {
            stage = 'hello';
            this.status('Connected. Joining the lobby...');
            this.last = performance.now();
            conn.send({ t: 'hello', name: this.name, v: PROTOCOL });
            this.stopPinger = workerTicker(() => {
              if (performance.now() - this.last > SILENCE) this.lost();
              else if (conn.open) conn.send({ t: 'ping' });
            }, 2000);
          });
          conn.on('data', (msg) => {
            this.last = performance.now();
            if (!msg || typeof msg !== 'object' || msg.t === 'ping') return;
            if (msg.t === 'welcome') { this.id = msg.id; stage = 'in'; clearTimeout(timer); resolve(); }
            if (msg.t === 'refused') { fail(msg.text); return; }
            this.emit(msg);
          });
          conn.on('close', () => { if (stage === 'in') this.lost(); else fail(`The host closed the connection to lobby ${this.code}.`); });
        });
      }, () => fail('Could not load the multiplayer library. Check your internet connection.'));
    });
  }

  lost() {
    if (this.closed) return;
    this.close();
    this.emit({ t: 'closed', text: 'Lost connection to the host.' });
  }

  send(msg) {
    if (this.conn && this.conn.open) this.conn.send(msg);
  }

  close() {
    this.closed = true;
    if (this.stopPinger) this.stopPinger();
    try { if (this.conn) this.conn.close(); } catch { /* gone */ }
    if (this.peer) this.peer.destroy();
  }
}

// ------------------------------------------------------- connection test --
// Can this computer play online? Checks the matchmaking server, then asks
// the STUN and TURN servers how the network looks from outside:
//   host candidates only   -> the network blocks peer-to-peer traffic
//   srflx (public address) -> direct connections work with most friends
//   relay                  -> a relay is reachable, so it works almost anywhere
export async function testConnection() {
  const out = { webrtc: typeof RTCPeerConnection !== 'undefined', server: false, direct: false, relay: false };
  if (!out.webrtc) return out;
  try {
    const Peer = await loadPeer();
    out.server = await new Promise((resolve) => {
      const peer = new Peer(peerOptions());
      const done = (ok) => { clearTimeout(timer); peer.destroy(); resolve(ok); };
      const timer = setTimeout(() => done(false), SERVER_TIMEOUT);
      peer.on('open', () => done(true));
      peer.on('error', () => done(false));
    });
  } catch { out.server = false; }
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  pc.createDataChannel('test');
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 9000);
    pc.onicecandidate = (e) => {
      if (!e.candidate) { clearTimeout(timer); resolve(); return; }
      const type = (/ typ (\w+)/.exec(e.candidate.candidate) || [])[1];
      if (type === 'srflx' || type === 'prflx') out.direct = true;
      if (type === 'relay') out.relay = true;
    };
    pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(resolve);
  });
  pc.close();
  return out;
}
