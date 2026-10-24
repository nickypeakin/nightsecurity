// Keyboard and mouse.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.hits = new Set();     // pressed since the last frame
    this.mx = 0;
    this.my = 0;
    this.clicks = 0;
    this.rightClicks = 0;
    this.wheel = 0;            // notches turned since the last frame
    this.buttons = new Set();  // mouse buttons held
    this.fakeLock = new URLSearchParams(location.search).has('autotest');
    const on = (t, ev, fn, opts) => { t.addEventListener(ev, fn, opts); this.off.push(() => t.removeEventListener(ev, fn, opts)); };
    this.off = [];
    on(window, 'keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (!this.keys.has(e.code)) this.hits.add(e.code);
      this.keys.add(e.code);
      if (this.locked && ['Space', 'Tab', 'KeyF', 'KeyQ', 'KeyE', 'KeyR', 'KeyC', 'KeyV', 'KeyM', 'KeyH', 'KeyG', 'AltLeft', 'Backspace', 'ControlLeft'].includes(e.code)) e.preventDefault();
    });
    on(window, 'keyup', (e) => this.keys.delete(e.code));
    on(window, 'blur', () => { this.keys.clear(); this.buttons.clear(); });
    on(document, 'mousemove', (e) => {
      if (!this.locked) return;
      this.mx += e.movementX || 0;
      this.my += e.movementY || 0;
    });
    on(document, 'mousedown', (e) => {
      if (!this.locked) return;
      this.buttons.add(e.button);
      if (e.button === 0) this.clicks++;
      if (e.button === 2) this.rightClicks++;
    });
    on(document, 'mouseup', (e) => this.buttons.delete(e.button));
    on(document, 'contextmenu', (e) => { if (this.locked) e.preventDefault(); });
    on(window, 'wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
  }

  // `?autotest` in the URL lets automated tests play without pointer lock
  get locked() { return this.fakeLock || document.pointerLockElement === this.canvas; }

  lock() {
    if (this.locked) return;
    const p = this.canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  }

  unlock() {
    if (this.locked) document.exitPointerLock();
  }

  down(code) { return this.locked && this.keys.has(code); }
  hit(code) { return this.locked && this.hits.has(code); }

  // call once per frame after reading input
  endFrame() {
    this.hits.clear();
    this.mx = this.my = 0;
    this.clicks = 0;
    this.rightClicks = 0;
    this.wheel = 0;
  }

  dispose() {
    for (const f of this.off) f();
  }
}
