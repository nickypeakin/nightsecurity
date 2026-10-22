// Small maths helpers for animation.

export const lerp = (a, b, k) => a + (b - a) * k;
export const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const smooth = (v) => { const t = clamp01(v); return t * t * (3 - 2 * t); };
// 0 before a, 1 after b, eased in between
export const span = (t, a, b) => smooth((t - a) / (b - a));
// heading that looks along (dx, dz); forward is -z at 0
export const yawTo = (dx, dz) => Math.atan2(-dx, -dz);

export function angleLerp(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}
