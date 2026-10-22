// The final picture. Scenes render in HDR into a multisampled target; a
// cheap two-level bloom makes signs and fixtures glow; then one pass
// tone-maps (ACES), sharpens (contrast-adaptive, harder when the picture
// is being drawn below full resolution), adds a vignette (and, if you like,
// the grain, wobble, smear and scanlines of an old camcorder tape),
// letterboxes cutscenes, fades, and, on the security monitors, turns the
// picture into a grey-green, rolling, noisy 1996 camera feed.

import * as THREE from 'three';

const quadVert = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const brightFrag = /* glsl */`
  uniform sampler2D tex;
  uniform float threshold;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tex, vUv).rgb;
    float l = max(c.r, max(c.g, c.b));
    float k = smoothstep(threshold, threshold * 2.5, l);
    gl_FragColor = vec4(c * k, 1.0);
  }
`;

const blurFrag = /* glsl */`
  uniform sampler2D tex;
  uniform vec2 dir;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tex, vUv).rgb * 0.227;
    c += (texture2D(tex, vUv + dir * 1.385).rgb + texture2D(tex, vUv - dir * 1.385).rgb) * 0.316;
    c += (texture2D(tex, vUv + dir * 3.231).rgb + texture2D(tex, vUv - dir * 3.231).rgb) * 0.07;
    gl_FragColor = vec4(c, 1.0);
  }
`;

const finalFrag = /* glsl */`
  uniform sampler2D tex, bloomA, bloomB;
  uniform vec2 res;
  uniform float aspect, time, exposure, bloom, grain, vignette, bars, fade, fear, staticAmt, glitch, binoc, vhs, saturation, sharpen, cctv;
  uniform vec3 fadeColor;
  varying vec2 vUv;

  float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

  vec3 grab(vec2 uv, float ca) {
    if (ca < 0.0001) return texture2D(tex, uv).rgb;
    vec3 c;
    c.r = texture2D(tex, uv + vec2(ca, 0.0)).r;
    c.g = texture2D(tex, uv).g;
    c.b = texture2D(tex, uv - vec2(ca, 0.0)).b;
    return c;
  }

  void main() {
    vec2 uv = vUv;
    vec2 c = (uv - 0.5) * vec2(aspect, 1.0);   // screen-height units
    float mask = 1.0;
    float ca = fear * 0.003;

    // tape tearing when something is very wrong
    if (glitch > 0.0) {
      float line = floor(uv.y * 240.0);
      uv.x += (h(vec2(line, floor(time * 24.0))) - 0.5) * glitch * 0.03;
      float row = floor(uv.y * 12.0);
      uv.x += step(1.0 - glitch * 0.4, h(vec2(row, floor(time * 18.0)))) * (h(vec2(row, time)) - 0.5) * 0.16 * glitch;
    }

    // the tape: each line wobbles a little, and a tracking band rolls by
    if (vhs > 0.0) {
      float line = floor(vUv.y * res.y * 0.5);
      uv.x += (h(vec2(line, floor(time * 24.0))) - 0.5) * 0.0011 * vhs;
      uv.x += sin(vUv.y * 36.0 + time * 1.7) * 0.0005 * vhs;
      float band = 1.0 - smoothstep(0.0, 0.012, abs(fract(vUv.y + time * 0.045) - 0.5));
      uv.x += band * 0.004 * vhs * h(vec2(floor(vUv.y * 300.0), time));
      ca += 0.0007 * vhs;
    }
    uv = 0.5 + (uv - 0.5) * (1.0 + fear * 0.02 * dot(c, c) - cctv * 0.06 * dot(c, c));
    if (cctv > 0.5) uv.x += (h(vec2(floor(vUv.y * 180.0), floor(time * 30.0))) - 0.5) * 0.002;

    vec3 glow = (texture2D(bloomA, uv).rgb * 0.7 + texture2D(bloomB, uv).rgb * 0.9) * bloom;
    float k = exposure;
    if (binoc > 0.5) {
      // two round lenses, a little overlapped
      float r = 0.43;
      float dl = length(c - vec2(-0.21, 0.0)), dr = length(c - vec2(0.21, 0.0));
      float d = min(dl, dr);
      mask = 1.0 - smoothstep(r - 0.02, r, d);
      k *= 1.0 - 0.35 * smoothstep(r * 0.55, r, d);
    }
    vec3 col = aces((grab(uv, ca) + glow) * k);
    if (sharpen > 0.0) {
      // contrast-adaptive sharpening on the tone-mapped picture: crisp
      // edges and texture without halos round the bright sky
      vec2 px = 1.0 / res;
      vec3 n = aces((texture2D(tex, uv + vec2(0.0, px.y)).rgb + glow) * k);
      vec3 so = aces((texture2D(tex, uv - vec2(0.0, px.y)).rgb + glow) * k);
      vec3 e = aces((texture2D(tex, uv + vec2(px.x, 0.0)).rgb + glow) * k);
      vec3 w = aces((texture2D(tex, uv - vec2(px.x, 0.0)).rgb + glow) * k);
      vec3 mn = min(col, min(min(n, so), min(e, w)));
      vec3 mx = max(col, max(max(n, so), max(e, w)));
      vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, vec3(0.0001)), 0.0, 1.0));
      vec3 wt = amp * (-1.0 / mix(8.0, 4.5, sharpen));
      col = clamp((col + (n + so + e + w) * wt) / (1.0 + 4.0 * wt), 0.0, 1.0);
    }
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(l), col, saturation * (1.0 - 0.18 * vhs));
    if (cctv > 0.5) {
      // a 1996 security camera: grey-green, soft, noisy, a bar rolling up the screen
      float m = pow(clamp(l * 1.15, 0.0, 1.0), 0.85);
      col = vec3(m * 0.8, m * 0.98, m * 0.78);
      col *= 0.9 + 0.1 * sin(vUv.y * res.y * 0.9);
      col *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.06, abs(fract(vUv.y * 0.6 - time * 0.07) - 0.5)));
      col += (h(vUv * res * 0.5 + floor(time * 30.0)) - 0.5) * 0.08;
    }
    if (vhs > 0.0) {
      col = col * (1.0 - 0.05 * vhs) + vec3(0.016, 0.013, 0.02) * vhs;
      col *= 1.0 - 0.07 * vhs * step(0.5, fract(vUv.y * res.y * 0.5));
    }

    // grain and vignette
    col += (h(vUv * res + fract(time) * 100.0) - 0.5) * grain;
    float vig = smoothstep(1.05, 0.25, length(c * vec2(0.9, 1.1)));
    col *= mix(1.0, vig, vignette + fear * 0.35);

    col *= mask;

    // static
    float s = h(vUv * res * 0.5 + floor(time * 30.0));
    col = mix(col, vec3(s * 0.85), clamp(staticAmt, 0.0, 1.0));

    col = mix(col, fadeColor, clamp(fade, 0.0, 1.0));
    float bar = bars * 0.115;
    if (vUv.y < bar || vUv.y > 1.0 - bar) col = vec3(0.0);
    gl_FragColor = vec4(max(col, 0.0), 1.0);
    #include <colorspace_fragment>
  }
`;

export class Post {
  constructor(renderer) {
    this.renderer = renderer;
    this.grainOn = false;   // the camcorder look (Settings)
    this.maxDpr = 1.5;     // high-density screens render at up to this many pixels per CSS pixel
    this.bloomOn = true;
    const hdr = { type: THREE.HalfFloatType };
    this.target = new THREE.WebGLRenderTarget(4, 4, { ...hdr, samples: 2 });
    this.a1 = new THREE.WebGLRenderTarget(4, 4, hdr);
    this.a2 = new THREE.WebGLRenderTarget(4, 4, hdr);
    this.b1 = new THREE.WebGLRenderTarget(4, 4, hdr);
    this.b2 = new THREE.WebGLRenderTarget(4, 4, hdr);
    const mk = (frag, uniforms) => new THREE.ShaderMaterial({ uniforms, vertexShader: quadVert, fragmentShader: frag, depthTest: false, depthWrite: false });
    this.bright = mk(brightFrag, { tex: { value: null }, threshold: { value: 1.1 } });
    this.blur = mk(blurFrag, { tex: { value: null }, dir: { value: new THREE.Vector2() } });
    this.u = {
      tex: { value: this.target.texture }, bloomA: { value: this.a1.texture }, bloomB: { value: this.b1.texture },
      res: { value: new THREE.Vector2(4, 4) }, aspect: { value: 1 }, time: { value: 0 },
      exposure: { value: 1 }, bloom: { value: 0.8 }, grain: { value: 0.025 }, vignette: { value: 0.5 },
      bars: { value: 0 }, fade: { value: 0 }, fadeColor: { value: new THREE.Color(0, 0, 0) }, cctv: { value: 0 },
      fear: { value: 0 }, staticAmt: { value: 0 }, glitch: { value: 0 }, binoc: { value: 0 }, vhs: { value: 0 }, saturation: { value: 1 }, sharpen: { value: 0.5 },
    };
    this.final = mk(finalFrag, this.u);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.final);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  // How hard the picture works: pixel density cap, anti-aliasing samples
  // (0, 2 or 4) and bloom. Settings > Graphics picks these.
  configure({ maxDpr, samples, bloom }) {
    this.maxDpr = maxDpr;
    this.bloomOn = bloom;
    if (samples !== this.target.samples) {
      const { width, height } = this.target;
      this.target.dispose();
      this.target = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples });
      this.u.tex.value = this.target.texture;
    }
  }

  // Full resolution (capped on high-density screens) times `quality`,
  // which drops on computers that can't keep up.
  setSize(w, h, quality = 1) {
    const dpr = window.devicePixelRatio || 1;
    const scale = Math.min(dpr, this.maxDpr) * quality;
    const rw = Math.max(2, Math.round(w * scale)), rh = Math.max(2, Math.round(h * scale));
    // the further below the screen's own resolution, the harder it sharpens
    this.u.sharpen.value = Math.min(1, 0.45 + Math.max(0, 1 - scale / dpr) * 1.4);
    this.target.setSize(rw, rh);
    const q = (t, d) => t.setSize(Math.max(1, Math.round(rw / d)), Math.max(1, Math.round(rh / d)));
    q(this.a1, 4); q(this.a2, 4); q(this.b1, 12); q(this.b2, 12);
    this.u.res.value.set(rw, rh);
    this.u.aspect.value = w / h;
    this.renderer.setPixelRatio(scale);
    this.renderer.setSize(w, h, false);
  }

  pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.cam);
  }

  // draw(target) renders the world into `target`; fx holds the effects
  render(draw, fx) {
    const r = this.renderer;
    draw(this.target);
    // bloom: bright pass, then blur at a quarter and a twelfth of the size
    if (this.bloomOn) {
      this.bright.uniforms.tex.value = this.target.texture;
      this.pass(this.bright, this.a1);
      const blur = (src, dst, dx, dy) => {
        this.blur.uniforms.tex.value = src.texture;
        this.blur.uniforms.dir.value.set(dx / src.width, dy / src.height);
        this.pass(this.blur, dst);
      };
      blur(this.a1, this.a2, 1, 0); blur(this.a2, this.a1, 0, 1);
      blur(this.a1, this.b2, 1, 0); blur(this.b2, this.b1, 0, 1);
    }
    const u = this.u;
    u.bloom.value = this.bloomOn ? 0.8 : 0;
    u.time.value = fx.time || 0;
    u.exposure.value = fx.exposure ?? 1;
    u.bars.value = fx.bars || 0;
    u.fade.value = fx.fade || 0;
    u.fear.value = fx.fear || 0;
    u.staticAmt.value = fx.staticAmt || 0;
    u.glitch.value = fx.glitch || 0;
    u.binoc.value = fx.binoc ? 1 : 0;
    u.cctv.value = fx.cctv ? 1 : 0;
    u.vhs.value = this.grainOn ? 1 : 0;
    u.saturation.value = fx.saturation ?? 1;
    u.grain.value = this.grainOn ? 0.022 + (fx.noise || 0) : (fx.noise || 0);
    u.vignette.value = fx.cctv ? 0.9 : this.grainOn ? 0.45 : 0.25;
    if (fx.fadeColor != null) u.fadeColor.value.set(fx.fadeColor);
    this.quad.material = this.final;
    r.setRenderTarget(null);
    r.render(this.scene, this.cam);
  }
}
