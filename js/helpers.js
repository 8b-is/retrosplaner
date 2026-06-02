// helpers.js — shared building blocks: colors, math, textures, point clouds, text.
import * as THREE from "three";

export { THREE };

/* ---------------- palette ---------------- */
export const PAL = {
  ink:    0xeaf2ff,
  spark:  0xffd66b,
  spark2: 0xff8ec7,
  cyan:   0x61f4ff,
  violet: 0x9b8cff,
  deep:   0x0a0e1e,
  green:  0x7dffb0,
};

/* ---------------- math ---------------- */
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// Deterministic pseudo-random (so a scene looks the same each visit).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- textures ---------------- */
let _glowTex = null;
export function glowTexture() {
  if (_glowTex) return _glowTex;
  const s = 128;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0.0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.85)");
  g.addColorStop(0.55, "rgba(255,255,255,0.25)");
  g.addColorStop(1.0, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  _glowTex = new THREE.CanvasTexture(c);
  _glowTex.colorSpace = THREE.SRGBColorSpace;
  return _glowTex;
}

/* ---------------- point clouds ---------------- */
// A soft additive point cloud. Pass positions (Float32Array) and optional colors.
export function makePoints(positions, { size = 0.16, colors = null, opacity = 0.9, color = 0xffffff } = {}) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  if (colors) geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size,
    map: glowTexture(),
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: !!colors,
    color: colors ? 0xffffff : color,
    sizeAttenuation: true,
  });
  return new THREE.Points(geo, mat);
}

// A starfield shell around the viewer — persistent background.
export function makeStarfield(count = 1800, radius = 220, seed = 7) {
  const rnd = mulberry32(seed);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const tint = [new THREE.Color(PAL.ink), new THREE.Color(PAL.cyan), new THREE.Color(PAL.violet), new THREE.Color(PAL.spark)];
  for (let i = 0; i < count; i++) {
    // spherical shell with some depth
    const r = radius * (0.55 + 0.45 * rnd());
    const th = Math.acos(2 * rnd() - 1);
    const ph = 2 * Math.PI * rnd();
    pos[i * 3] = r * Math.sin(th) * Math.cos(ph);
    pos[i * 3 + 1] = r * Math.sin(th) * Math.sin(ph);
    pos[i * 3 + 2] = r * Math.cos(th);
    const c = tint[(rnd() * tint.length) | 0].clone().multiplyScalar(0.5 + 0.7 * rnd());
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const pts = makePoints(pos, { size: 1.4, colors: col, opacity: 0.9 });
  pts.userData.spin = 0.004;
  return pts;
}

/* ---------------- text sprites (in-world labels) ---------------- */
export function makeTextSprite(text, {
  color = "#eaf2ff", size = 64, bg = null, pad = 18, font = "700",
  glow = "rgba(97,244,255,0.0)",
} = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  const fontStr = `${font} ${size}px "Baloo 2", "Trebuchet MS", sans-serif`;
  ctx.font = fontStr;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = size + pad * 2;
  c.width = w * dpr; c.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.font = fontStr;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  if (bg) {
    ctx.fillStyle = bg;
    roundRect(ctx, 1, 1, w - 2, h - 2, 14);
    ctx.fill();
  }
  ctx.shadowColor = glow; ctx.shadowBlur = 18;
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
  const spr = new THREE.Sprite(mat);
  spr.scale.set((w / h) * (h / 64), h / 64, 1); // ~1 unit tall per 64px
  spr.userData.aspect = w / h;
  return spr;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---------------- tiny tween manager ---------------- */
export class Tweens {
  constructor() { this.list = []; }
  to(obj, props, dur, { ease = easeInOut, onDone = null, delay = 0 } = {}) {
    const from = {};
    for (const k in props) from[k] = obj[k];
    this.list.push({ obj, from, to: props, dur, ease, t: -delay, onDone });
  }
  // tween an arbitrary scalar via setter
  num(from, to, dur, setter, { ease = easeInOut, onDone = null, delay = 0 } = {}) {
    this.list.push({ setter, a: from, b: to, dur, ease, t: -delay, onDone, scalar: true });
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const tw = this.list[i];
      tw.t += dt;
      if (tw.t < 0) continue;
      const k = tw.dur <= 0 ? 1 : clamp(tw.t / tw.dur, 0, 1);
      const e = tw.ease(k);
      if (tw.scalar) {
        tw.setter(lerp(tw.a, tw.b, e));
      } else {
        for (const key in tw.to) tw.obj[key] = lerp(tw.from[key], tw.to[key], e);
      }
      if (k >= 1) { this.list.splice(i, 1); if (tw.onDone) tw.onDone(); }
    }
  }
  clear() { this.list.length = 0; }
}

/* ---------------- misc ---------------- */
// A glowing sprite "spark" — our little guide character.
export function makeSpark(color = PAL.spark, scale = 2.0) {
  const mat = new THREE.SpriteMaterial({
    map: glowTexture(), color, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(scale);
  return s;
}
