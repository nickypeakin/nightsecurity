// The lobby and game server. It runs in the browser of whoever hosts (or
// plays solo). Players are reached through a `deliver(msg)` function, which
// is a direct call for the host's own player and a WebRTC data channel for
// friends, so this file doesn't care how anyone is connected.

import { Match } from './match.js';
import { MAX_PLAYERS, TICK } from '../shared/config.js';

function intervalTicker(fn, ms) {
  const id = setInterval(fn, ms);
  return () => clearInterval(id);
}

export class Lobby {
  // ticker(fn, ms) calls fn every ms milliseconds and returns a stop function
  // startAt: which part of the story to begin at (for testing)
  constructor({ code = null, ticker = intervalTicker, startAt = 0 } = {}) {
    this.code = code;
    this.ticker = ticker;
    this.startAt = startAt;
    this.members = [];       // people: { id, name, color, deliver }
    this.hostId = null;
    this.match = null;
    this.nextId = 1;
    this.stopTicker = null;
    this.paused = false;     // only used for solo games
  }

  // ------------------------------------------------------------ people --
  add(name, deliver) {
    if (this.match && !this.match.over) { deliver({ t: 'refused', text: 'That game has already started. Ask the host to let you in after this round.' }); return null; }
    if (this.members.length >= MAX_PLAYERS) { deliver({ t: 'refused', text: 'That lobby is full.' }); return null; }
    const used = new Set(this.members.map((m) => m.color));
    let color = 0;
    while (used.has(color)) color++;
    const m = { id: `p${this.nextId++}`, name: clean(name), color, deliver };
    this.members.push(m);
    if (!this.hostId) this.hostId = m.id;
    deliver({ t: 'welcome', id: m.id });
    this.sendLobby();
    return m.id;
  }

  remove(id) {
    const i = this.members.findIndex((m) => m.id === id);
    if (i < 0) return;
    this.members.splice(i, 1);
    if (this.match && !this.match.over) this.match.leave(id);
    else this.sendLobby();
  }

  // a message from one of the players
  fromPlayer(id, msg) {
    if (!msg || typeof msg.t !== 'string') return;
    const m = this.members.find((x) => x.id === id);
    if (!m) return;
    if (msg.t === 'start' && id === this.hostId && !(this.match && !this.match.over)) {
      this.start();
    } else if (msg.t === 'skip' && id === this.hostId) {
      if (this.match) this.match.skipIntro();
    } else if (msg.t === 'tolobby' && id === this.hostId) {
      this.stopMatch();
      this.sendLobby();
    } else if (this.match) {
      this.match.handle(id, msg);
    }
  }

  send(to, msg) {
    for (const m of this.members) if (to == null || m.id === to) m.deliver(msg);
  }

  sendLobby() {
    this.send(null, {
      t: 'lobby', code: this.code, hostId: this.hostId,
      players: this.members.map((m) => ({ id: m.id, name: m.name, color: m.color })),
    });
  }

  // ------------------------------------------------------------- match --
  start() {
    this.stopMatch();
    const roster = this.members.map((m) => ({ id: m.id, name: m.name, color: m.color }));
    const seed = Math.random().toString(36).slice(2, 10);
    this.match = new Match({ seed, roster, send: (to, msg) => this.send(to, msg), start: this.startAt });
    this.send(null, { t: 'start', seed, roster, host: this.hostId, startAt: this.startAt });
    let last = performance.now(), acc = 0;
    this.stopTicker = this.ticker(() => {
      const now = performance.now();
      if (this.paused) { last = now; return; }
      acc = Math.min(acc + (now - last) / 1000, 1);
      last = now;
      while (acc >= TICK && this.match && !this.match.over) {
        this.match.step(TICK);
        acc -= TICK;
      }
      if (!this.match || this.match.over) this.stopTimer();
    }, TICK * 1000);
  }

  stopTimer() {
    if (this.stopTicker) this.stopTicker();
    this.stopTicker = null;
  }

  stopMatch() {
    this.stopTimer();
    this.match = null;
  }

  close() {
    this.stopMatch();
    this.send(null, { t: 'closed', text: 'The host closed the lobby.' });
    this.members = [];
  }
}

function clean(name) {
  const s = String(name || '').replace(/[^\p{L}\p{N} _.'-]/gu, '').trim().slice(0, 16);
  return s || 'Friend';
}
