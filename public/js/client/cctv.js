// The security cameras. Eight of them, as numbered on the monitors in the
// office: the bank of screens on the desk shows each feed (one of them
// redrawn every so often, small, with the gain turned up, while you're
// looking at them), and at the desk you can bring any one up full
// screen. Also: rendering stills from the mall for the clues (the tape in
// the VCR, Dale's photos), as grainy as the real things.

import * as THREE from 'three';
import { CAMERAS } from '../shared/mall.js';
import { MALL_UNIFORMS } from './lighting.js';
import { photoFrame } from './textures.js';

export const CCTV_FOV = 58;

export class CCTV {
  constructor(world) {
    this.world = world;
    this.cams = CAMERAS.map((c) => {
      const cam = new THREE.PerspectiveCamera(CCTV_FOV, 16 / 9, 0.1, 60);
      cam.position.set(...c.pos);
      cam.lookAt(...c.look);
      cam.updateMatrixWorld();
      return cam;
    });
    this.rts = CAMERAS.map(() => {
      const rt = new THREE.WebGLRenderTarget(192, 108, { type: THREE.HalfFloatType });
      rt.texture.generateMipmaps = false;
      return rt;
    });
    this.next = 0;
    this.wait = 0;
    this.screens = world.live.monitors ? world.live.monitors.userData.screens : [];
    // the screens are numbered left to right, bottom row first
    this.screens.forEach((s, i) => {
      s.material = new THREE.MeshBasicMaterial({ map: this.rts[i].texture, color: new THREE.Color(0.95, 1.2, 0.97) });
    });
    this.on = true;
  }

  // render with the gain up: these cameras see better in the dark than you do
  gain(on) {
    const W = this.world;
    if (on) {
      this.keep = { scale: MALL_UNIFORMS.mallScale.value, hemi: W.hemi.intensity, amb: W.ambient.intensity, fog: W.fog.density };
      MALL_UNIFORMS.mallScale.value = this.keep.scale * 2.0;
      W.hemi.intensity = 0.9;
      W.ambient.intensity = this.keep.amb * 2.0;
      W.fog.density = 0.012;
    } else if (this.keep) {
      MALL_UNIFORMS.mallScale.value = this.keep.scale;
      W.hemi.intensity = this.keep.hemi;
      W.ambient.intensity = this.keep.amb;
      W.fog.density = this.keep.fog;
    }
  }

  // keep the monitors fed while somebody can see them (a feed every
  // twentieth of a second, so each screen jerks along like an old camera,
  // and it's a whole extra picture of the mall each time); power off: blank
  update(renderer, dt, near, powered) {
    if (powered !== this.on) {
      this.on = powered;
      for (const s of this.screens) { if (powered) s.material.color.setRGB(0.95, 1.2, 0.97); else s.material.color.setScalar(0.02); }
    }
    if (!near || !powered) return;
    this.wait -= dt;
    if (this.wait > 0) return;
    this.wait = 1 / 20;
    const i = this.next;
    this.next = (this.next + 1) % this.cams.length;
    this.gain(true);
    this.world.cullFrom(this.cams[i].position);
    renderer.setRenderTarget(this.rts[i]);
    renderer.render(this.world.scene, this.cams[i]);
    renderer.setRenderTarget(null);
    this.gain(false);
  }

  // A still from the mall, as a data URL: from `pos` looking at `look`,
  // after `setup()` arranges the scene (and before `undo()` puts it back).
  still(renderer, { pos, look, fov = 58, w = 400, h = 300, setup = null, undo = null, stamp = '', mono = true, flash = false }) {
    const cam = new THREE.PerspectiveCamera(fov, w / h, 0.05, 90);
    cam.position.set(...pos);
    cam.lookAt(...look);
    cam.updateMatrixWorld();
    const target = new THREE.WebGLRenderTarget(w, h);
    if (setup) setup(cam);
    this.gain(mono);
    this.world.cullFrom(cam.position);
    renderer.setRenderTarget(target);
    renderer.render(this.world.scene, cam);
    const buf = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(target, 0, 0, w, h, buf);
    renderer.setRenderTarget(null);
    this.gain(false);
    if (undo) undo();
    target.dispose();
    return photoFrame(buf, w, h, { stamp, mono, flash });
  }

  dispose() {
    for (const rt of this.rts) rt.dispose();
  }
}
