/* Carry Lattice local-motion adaptation. Originally authored by DayDreamInAReverie, MIT,
 * source commit 7a424c93b9be13cf835b91ea67495fec2ec0584e.
 * The upstream physics Dots, Clock, mountCanvas, font bits, Progress, DotText and
 * enhanceButton are reused. A new, local-only light-green visual composition
 * mounts beside the original app; nothing here rewrites its business logic. */
(function(){
'use strict';
/* ==== upstream motion ==== */
// Motion primitives shared by every element: a driveable clock, springs, and small math.

const reducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Seeded PRNG (mulberry32) so formations and videos are reproducible. */
function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Critically-tunable spring. Presets mirror the physical materials of the world. */
const SPRINGS = {
  seal: { k: 520, c: 30 },   // carved stone: quick, firm, no wobble
  ring: { k: 110, c: 17 },   // bronze ring: heavy, one soft overshoot
  paper: { k: 80, c: 10 },   // talisman paper: light, flutters
  eye: { k: 900, c: 55 },    // cursor: tight follow
};

class Spring {
  constructor(value = 0, preset = SPRINGS.ring) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.k = preset.k;
    this.c = preset.c;
  }
  set(v) { this.value = this.target = v; this.velocity = 0; return this; }
  step(dt) {
    // semi-implicit Euler, substepped for stability at low frame rates
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = -this.k * (this.value - this.target) - this.c * this.velocity;
      this.velocity += a * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }
  get settled() { return Math.abs(this.value - this.target) < 1e-4 && Math.abs(this.velocity) < 1e-4; }
}

/**
 * One clock drives the whole page. In record mode (?record) time only advances
 * through clock.renderAt(t), so the Video Gen toolkit can capture frames deterministically.
 */
class Clock {
  constructor() {
    this.subs = new Set();
    this.time = 0;
    this.manual = typeof location !== "undefined" && new URLSearchParams(location.search).has("record");
    this._last = 0;
    this._raf = 0;
    this._tick = this._tick.bind(this);
    // Carry: start the clock only when a mounted component subscribes.
  }
  add(fn) { this.subs.add(fn); if(!this.manual && !this._raf && typeof requestAnimationFrame === "function") this._raf=requestAnimationFrame(this._tick); return () => {this.subs.delete(fn);if(!this.subs.size){cancelAnimationFrame(this._raf);this._raf=0;this._last=0;}}; }
  _emit(dt) { for (const fn of this.subs) fn(dt, this.time); }
  _tick(now) {
    const dt = this._last ? Math.min(0.05, (now - this._last) / 1000) : 1 / 60;
    this._last = now;
    this.time += dt;
    this._emit(dt);
    this._raf = this.subs.size ? requestAnimationFrame(this._tick) : 0;
  }
  /** Advance to absolute time t (seconds) in fixed 1/60 steps. */
  renderAt(t) {
    while (this.time < t - 1e-6) {
      const dt = Math.min(1 / 60, t - this.time);
      this.time += dt;
      this._emit(dt);
    }
  }
}
const clock = new Clock();

/** Tween helper on the shared clock; resolves when done. */
function tween(duration, onUpdate, ease = easeOutExpo) {
  return new Promise((resolve) => {
    if (duration <= 0 || reducedMotion()) { onUpdate(1); resolve(); return; }
    let t = 0;
    const off = clock.add((dt) => {
      t = Math.min(1, t + dt / duration);
      onUpdate(ease(t));
      if (t >= 1) { off(); resolve(); }
    });
  });
}

const wait = (s) => tween(s, () => {}, (t) => t);

/* ==== upstream lifetime ==== */
// Mount-time ownership for the original Lattice DOM implementation.
let active=null;
function track(cleanup){if(active)active.push(cleanup);return cleanup;}
class ManagedResizeObserver extends globalThis.ResizeObserver {
  constructor(...args){super(...args);track(()=>this.disconnect());}
}
class ManagedIntersectionObserver extends globalThis.IntersectionObserver {
  constructor(...args){super(...args);track(()=>this.disconnect());}
}
function listen(target,type,fn,options){target.addEventListener(type,fn,options);track(()=>target.removeEventListener(type,fn,options));}
function owned(fn){const list=[],previous=active;active=list;let api;try{api=fn();}catch(error){list.reverse().forEach(f=>f());throw error;}finally{active=previous;}let dead=false;return {api,destroy(){if(dead)return;dead=true;list.reverse().forEach(f=>f());}};}

/* ==== upstream dotkit ==== */
// 点 Dotkit — the 2D side of the field. Small canvases inside DOM components share one clock and
// one physics: each dot has a home (tx, ty) it springs toward, a little flow noise, and it can be
// released, attracted, or burst. Everything a control shows is a set of dots mapping to another.
const css = (name, el = document.documentElement) => getComputedStyle(el).getPropertyValue(name).trim();

/** A hi-DPI canvas that tracks its element's size. */
function mountCanvas(host, { inset = 0, className = "lx-canvas" } = {}) {
  const cv = document.createElement("canvas");
  cv.className = className;
  cv.setAttribute("aria-hidden", "true");
  cv.style.cssText = `position:absolute;inset:${-inset}px;width:calc(100% + ${inset * 2}px);height:calc(100% + ${inset * 2}px);pointer-events:none;`;
  host.appendChild(cv);
  const g = cv.getContext("2d");
  const size = { w: 0, h: 0, dpr: 1 };
  const fit = () => {
    const r = cv.getBoundingClientRect();
    size.dpr = Math.min(2, devicePixelRatio || 1);
    size.w = r.width; size.h = r.height;
    cv.width = Math.max(1, Math.round(r.width * size.dpr));
    cv.height = Math.max(1, Math.round(r.height * size.dpr));
    g.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
  };
  new ResizeObserver(fit).observe(host);
  fit();
  return { cv, g, size, fit };
}

/** Structure-of-arrays dot set with spring-to-home physics. */
class Dots {
  constructor(n) {
    this.n = n;
    for (const k of ["x", "y", "vx", "vy", "tx", "ty", "a", "ta", "s", "heat", "seed"]) this[k] = new Float32Array(n);
    for (let i = 0; i < n; i++) { this.seed[i] = Math.random(); this.s[i] = 1; }
    this.k = 180;       // spring
    this.damp = 14;     // damping
    this.flow = 0;      // noise strength
    this.delay = new Float32Array(n); // per-dot release delay (seconds)
    this.free = new Uint8Array(n);    // 1 = gas: ignores its home and wanders inside `box`
    this.box = { x0: 0, y0: 0, x1: 100, y1: 20 };
    this.wander = 60;                 // gas agitation (px/s²)
    this.clock = 0;
  }
  home(i, x, y, a = 1) { this.tx[i] = x; this.ty[i] = y; this.ta[i] = a; }
  place(i, x, y) { this.x[i] = x; this.y[i] = y; this.vx[i] = this.vy[i] = 0; }
  snap() { for (let i = 0; i < this.n; i++) { this.x[i] = this.tx[i]; this.y[i] = this.ty[i]; this.a[i] = this.ta[i]; this.vx[i] = this.vy[i] = 0; } }
  /** Stagger the next move: dots leave one by one, left to right (or by any key). */
  stagger(total = 0.25, key = (i) => this.tx[i]) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < this.n; i++) { const v = key(i); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    for (let i = 0; i < this.n; i++) this.delay[i] = ((key(i) - lo) / Math.max(1e-6, hi - lo)) * total * 0.7 + this.seed[i] * total * 0.3;
  }
  burst(cx, cy, power = 260) {
    for (let i = 0; i < this.n; i++) {
      const dx = this.x[i] - cx, dy = this.y[i] - cy, d = Math.hypot(dx, dy) + 1;
      this.vx[i] += (dx / d) * power * (0.6 + this.seed[i] * 0.8);
      this.vy[i] += (dy / d) * power * (0.6 + this.seed[i] * 0.8);
      this.heat[i] = 1;
    }
  }
  attract(px, py, r, strength) { this._att = { px, py, r, strength }; }
  step(dt) {
    if (reducedMotion()) { this.snap(); return false; }
    this.clock += dt;
    const { k, damp, flow } = this;
    const att = this._att;
    let moving = false;
    const t = this.clock;
    for (let i = 0; i < this.n; i++) {
      if (this.delay[i] > 0) { this.delay[i] -= dt; if (!this.free[i]) continue; }
      if (this.free[i]) { // gas: a random walk that bounces off the walls
        const b = this.box, w = this.wander;
        this.vx[i] += (Math.random() - 0.5) * w * 2 * dt * 10;
        this.vy[i] += (Math.random() - 0.5) * w * 2 * dt * 10;
        const sp = Math.hypot(this.vx[i], this.vy[i]), max = w * 0.35;
        if (sp > max) { this.vx[i] *= max / sp; this.vy[i] *= max / sp; }
        this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt;
        if (this.x[i] < b.x0) { this.x[i] = b.x0; this.vx[i] = Math.abs(this.vx[i]); }
        if (this.x[i] > b.x1) { this.x[i] = b.x1; this.vx[i] = -Math.abs(this.vx[i]); }
        if (this.y[i] < b.y0) { this.y[i] = b.y0; this.vy[i] = Math.abs(this.vy[i]); }
        if (this.y[i] > b.y1) { this.y[i] = b.y1; this.vy[i] = -Math.abs(this.vy[i]); }
        this.a[i] += (this.ta[i] - this.a[i]) * Math.min(1, dt * 8);
        moving = true;
        continue;
      }
      let ax = (this.tx[i] - this.x[i]) * k, ay = (this.ty[i] - this.y[i]) * k;
      if (flow) { const s = this.seed[i] * 40; ax += Math.sin(t * 1.3 + s + this.y[i] * 0.05) * flow; ay += Math.cos(t * 1.1 + s + this.x[i] * 0.05) * flow; }
      if (att) {
        const dx = att.px - this.x[i], dy = att.py - this.y[i], d2 = dx * dx + dy * dy;
        if (d2 < att.r * att.r) { const f = (1 - Math.sqrt(d2) / att.r) * att.strength; ax += dx * f; ay += dy * f; }
      }
      this.vx[i] = (this.vx[i] + ax * dt) * Math.exp(-damp * dt);
      this.vy[i] = (this.vy[i] + ay * dt) * Math.exp(-damp * dt);
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.a[i] += (this.ta[i] - this.a[i]) * Math.min(1, dt * 8);
      this.heat[i] = Math.max(0, this.heat[i] - dt * 1.6);
      if (Math.abs(this.vx[i]) + Math.abs(this.vy[i]) > 2 || Math.abs(this.tx[i] - this.x[i]) + Math.abs(this.ty[i] - this.y[i]) > 0.3) moving = true;
    }
    this._att = null;
    return moving || flow > 0;
  }
  draw(g, { ink, hot, r = 1.4, hotOf = () => 0 }) {
    for (let i = 0; i < this.n; i++) {
      const a = this.a[i];
      if (a < 0.02) continue;
      const h = Math.max(this.heat[i], hotOf(i));
      g.globalAlpha = Math.min(1, a);
      g.fillStyle = h > 0.5 ? hot : ink;
      const rr = r * this.s[i] * (1 + h * 0.4);
      g.beginPath();
      g.arc(this.x[i], this.y[i], rr, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }
}

/** Run fn every frame while the element is on screen (and while fn returns true, or always). */
function animateWhileVisible(el, fn) {
  let on = false;
  new IntersectionObserver(([e]) => { on = e.isIntersecting; }, { rootMargin: "60px" }).observe(el);
  return track(clock.add((dt, t) => { if (on && !document.hidden) fn(dt, t); }));
}

/* ==== upstream font ==== */
const F = {
  A: "01110 10001 10001 11111 10001 10001 10001", B: "11110 10001 10001 11110 10001 10001 11110",
  C: "01110 10001 10000 10000 10000 10001 01110", D: "11100 10010 10001 10001 10001 10010 11100",
  E: "11111 10000 10000 11110 10000 10000 11111", F: "11111 10000 10000 11110 10000 10000 10000",
  G: "01110 10001 10000 10111 10001 10001 01111", H: "10001 10001 10001 11111 10001 10001 10001",
  I: "01110 00100 00100 00100 00100 00100 01110", J: "00111 00010 00010 00010 00010 10010 01100",
  K: "10001 10010 10100 11000 10100 10010 10001", L: "10000 10000 10000 10000 10000 10000 11111",
  M: "10001 11011 10101 10101 10001 10001 10001", N: "10001 10001 11001 10101 10011 10001 10001",
  O: "01110 10001 10001 10001 10001 10001 01110", P: "11110 10001 10001 11110 10000 10000 10000",
  Q: "01110 10001 10001 10001 10101 10010 01101", R: "11110 10001 10001 11110 10100 10010 10001",
  S: "01111 10000 10000 01110 00001 00001 11110", T: "11111 00100 00100 00100 00100 00100 00100",
  U: "10001 10001 10001 10001 10001 10001 01110", V: "10001 10001 10001 10001 10001 01010 00100",
  W: "10001 10001 10001 10101 10101 10101 01010", X: "10001 10001 01010 00100 01010 10001 10001",
  Y: "10001 10001 10001 01010 00100 00100 00100", Z: "11111 00001 00010 00100 01000 10000 11111",
  0: "01110 10001 10011 10101 11001 10001 01110", 1: "00100 01100 00100 00100 00100 00100 01110",
  2: "01110 10001 00001 00010 00100 01000 11111", 3: "11111 00010 00100 00010 00001 10001 01110",
  4: "00010 00110 01010 10010 11111 00010 00010", 5: "11111 10000 11110 00001 00001 10001 01110",
  6: "00110 01000 10000 11110 10001 10001 01110", 7: "11111 00001 00010 00100 01000 01000 01000",
  8: "01110 10001 10001 01110 10001 10001 01110", 9: "01110 10001 10001 01111 00001 00010 01100",
  " ": "00000 00000 00000 00000 00000 00000 00000", ".": "00000 00000 00000 00000 00000 01100 01100",
  "-": "00000 00000 00000 11111 00000 00000 00000", "·": "00000 00000 00000 00100 00000 00000 00000",
};

/** Rasterize a line of text in the 5×7 matrix. Returns {w, h, on(x,y)}. */
function matrixText(str, scale = 1) {
  const chars = [...str.toUpperCase()];
  const cols = chars.length * 6 - 1;
  const bits = [];
  chars.forEach((ch, ci) => {
    const rows = (F[ch] || F[" "]).split(" ");
    rows.forEach((row, y) => [...row].forEach((b, x) => { if (b === "1") bits.push([ci * 6 + x, y]); }));
  });
  const set = new Set();
  for (const [x, y] of bits) for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) set.add(`${x * scale + dx},${y * scale + dy}`);
  return { w: cols * scale, h: 7 * scale, on: (x, y) => set.has(`${x},${y}`), count: set.size };
}


/* ==== upstream dottext ==== */
function mountDotText(el, { pitch = 4, color = "--hot" } = {}) {
  const text = el.textContent.trim();
  el.setAttribute("aria-label", text);
  el.textContent = "";
  el.classList.add("lx-dottext");
  const { g, size } = mountCanvas(el);
  const MAX = 900;
  const dots = new Dots(MAX);
  dots.k = 120; dots.damp = 11;
  let used = 0, current = "";
  const layout = (str) => {
    const m = matrixText(str, 1);
    el.style.width = `${m.w * pitch}px`;
    el.style.height = `${7 * pitch}px`;
    const pts = [];
    for (let y = 0; y < 7; y++) for (let x = 0; x < m.w; x++) if (m.on(x, y)) pts.push([(x + 0.5) * pitch, (y + 0.5) * pitch]);
    // reuse nearest old dots so shared strokes slide instead of re-spawning
    const n = Math.min(MAX, pts.length);
    for (let i = 0; i < n; i++) dots.home(i, pts[i][0], pts[i][1], 1);
    for (let i = n; i < Math.max(used, n); i++) { dots.home(i, dots.x[i] + (Math.random() - 0.5) * 40, dots.y[i] - 10 - Math.random() * 20, 0); }
    for (let i = used; i < n; i++) dots.place(i, pts[i][0] + (Math.random() - 0.5) * 30, pts[i][1] + (Math.random() - 0.5) * 30);
    used = n;
    dots.stagger(0.25);
  };
  const api = {
    set(str) {
      str = String(str);
      if (str === current) return;
      current = str;
      el.setAttribute("aria-label", str);
      layout(str);
      if (reducedMotion()) dots.snap();
    },
  };
  api.set(text);
  if (reducedMotion()) dots.snap();
  animateWhileVisible(el, (dt) => {
    dots.step(dt);
    g.clearRect(0, 0, size.w, size.h);
    dots.draw(g, { ink: css(color, el) || "#ff5a1f", hot: css(color, el), r: pitch * 0.36 });
  });
  el._dottext = api;
  return api;
}
/* ==== upstream controls ==== */
const colors = (el) => ({ ink: css("--ink", el) || "#ece7da", hot: css("--hot", el) || "#ff5a1f", dim: css("--text-dim", el) || "#9d988c" });
function mountProgress(el) {
  const { g, size } = mountCanvas(el);
  let dots, cols = 0, rows = 3, value = 0, target = parseFloat(el.dataset.value || "0"), indeterminate = el.hasAttribute("data-indeterminate");
  let locked, flash, anchor, solidPrev;
  const site = (i) => { const c = i % cols, r = Math.floor(i / cols); const pitch = size.w / cols, oy = (size.h - (rows - 1) * 5) / 2; return [(c + 0.5) * pitch, oy + r * 5, c / (cols - 1)]; };
  const build = () => {
    cols = Math.max(10, Math.floor(size.w / 7));
    dots = new Dots(cols * rows); dots.k = 14; dots.damp = 4.5;
    locked = new Uint8Array(dots.n); flash = new Float32Array(dots.n); solidPrev = new Uint8Array(dots.n);
    anchor = new Float32Array(dots.n * 2);
    for (let i = 0; i < dots.n; i++) {
      const [x, y] = site(i);
      // the gas cloud: each point hangs loosely near its own site, up to three columns away
      anchor[i * 2] = x + (dots.seed[i] - 0.5) * (size.w / cols) * 6;
      anchor[i * 2 + 1] = y + (Math.sin(i * 12.9898) * 0.5) * size.h * 0.6;
      dots.place(i, anchor[i * 2], anchor[i * 2 + 1]);
      dots.a[i] = dots.ta[i] = 0.34;
    }
  };
  new ResizeObserver(build).observe(el);
  build();
  el.setAttribute("role", "progressbar");
  el.setAttribute("aria-valuemin", "0"); el.setAttribute("aria-valuemax", "100");
  let done = false;
  const api = {
    set(v) { target = Math.max(0, Math.min(1, v)); indeterminate = false; el.setAttribute("aria-valuenow", String(Math.round(target * 100))); },
    indeterminate(on = true) { indeterminate = on; el.removeAttribute("aria-valuenow"); },
    get value() { return target; },
  };
  animateWhileVisible(el, (dt, t) => {
    value += (target - value) * Math.min(1, dt * 6);
    if (reducedMotion()) value = target;
    const sweep = indeterminate ? ((t * 0.45) % 1.4) - 0.2 : -1;
    let newly = 0;
    for (let i = 0; i < dots.n; i++) {
      const [x, y, fx] = site(i);
      const solid = indeterminate ? Math.abs(fx - sweep) < 0.12 : fx <= value + 1e-4;
      if (solid) {
        if (!solidPrev[i]) { solidPrev[i] = 1; dots.home(i, x, y, 1); dots.delay[i] = dots.seed[i] * 0.2; newly++; }
        if (!locked[i] && Math.hypot(dots.x[i] - x, dots.y[i] - y) < 0.8) { locked[i] = 1; flash[i] = 1; }
        if (locked[i]) dots.place(i, x, y); // fixed: a built site no longer moves
      } else {
        if (solidPrev[i]) { solidPrev[i] = 0; locked[i] = 0; dots.vx[i] = (dots.seed[i] - 0.5) * 50; dots.vy[i] = (Math.random() - 0.5) * 50; } // melts back into the gas
        const s = dots.seed[i] * 6.283;
        dots.home(i, anchor[i * 2] + Math.sin(t * (0.6 + dots.seed[i] * 0.7) + s) * 6, anchor[i * 2 + 1] + Math.cos(t * (0.8 + dots.seed[i] * 0.6) + s * 1.3) * 4, 0.34);
      }
    }
    // convergence uses a firmer spring than the floating gas
    dots.k = 14; dots.damp = 4.5;
    for (let i = 0; i < dots.n; i++) if (solidPrev[i] && !locked[i]) { dots.k = 60; dots.damp = 8; break; }
    if (newly && !indeterminate) sound.tick(1 + value, 0.1);
    const complete = !indeterminate && value > 0.995;
    if (complete && !done) { done = true; sound.chord(2); el.classList.add("is-complete"); for (let i = 0; i < dots.n; i++) flash[i] = Math.max(flash[i], 0.6); }
    if (!complete) { done = false; el.classList.remove("is-complete"); }
    dots.step(dt);
    const cl = colors(el);
    g.clearRect(0, 0, size.w, size.h);
    for (let i = 0; i < dots.n; i++) {
      flash[i] = Math.max(0, flash[i] - dt * 2.2);
      const solid = solidPrev[i];
      g.globalAlpha = Math.min(1, dots.a[i]);
      g.fillStyle = flash[i] > 0.35 ? cl.ink : solid ? cl.hot : cl.ink;
      const r = (solid ? 1.5 : 1.25) * (1 + flash[i] * 0.9);
      g.beginPath(); g.arc(dots.x[i], dots.y[i], r, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  });
  api.set(target);
  el._progress = api;
  return api;
}

/* ==== upstream helpers ==== */
function requireElement(el) {
  if(!el || el.nodeType!==1)throw new TypeError('Pass an existing HTMLElement.');
  return el;
}
function claim(el,style) {
  requireElement(el);
  for(const name of ['lens','lattice','overture'])if(name!==style&&el.hasAttribute(`data-carry-${name}`))throw new Error('Use separate nested elements for different design systems.');
}
function snapshot(el,names) {
  const values=names.map(k=>[k,el.getAttribute(k)]);
  return ()=>values.forEach(([k,v])=>v===null?el.removeAttribute(k):el.setAttribute(k,v));
}
function addClasses(el,...names) {
  const added=names.filter(n=>!el.classList.contains(n));el.classList.add(...names);
  return ()=>el.classList.remove(...added);
}
function once(fn) {let dead=false;return ()=>{if(dead)return;dead=true;fn();};}
/* ==== upstream buttons ==== */
const instances=new WeakMap();
function enhanceButton(el,{variant='primary'}={}) {
  claim(el,'lattice');if(instances.has(el))return instances.get(el);
  if(!el.matches('button,a,input[type=button],input[type=submit]'))throw new Error('Use a native button or link.');
  if(el.tagName==='INPUT')throw new Error('Canvas feedback requires a button or link with child content.');
  if(!['primary','accent','ghost'].includes(variant))throw new Error('Unknown Lattice button variant.');
  const restore=snapshot(el,['data-carry-lattice','style']);
  const clear=addClasses(el,'lx-btn',`lx-btn--${variant}`,'carry-lattice-halo');
  el.setAttribute('data-carry-lattice','');
  const abort=new AbortController();let active=false;
  const life=owned(()=>{
    const {g,size}=mountCanvas(el,{inset:5});const dots=new Dots(52);dots.k=110;dots.damp=17;
    for(let i=0;i<dots.n;i++){dots.place(i,0,0);dots.a[i]=dots.ta[i]=0;}
    const draw=()=>{const r=size.h/2-3,w=Math.max(0,size.w-size.h),perimeter=2*w+2*Math.PI*r;for(let i=0;i<dots.n;i++){let d=i/dots.n*perimeter,x,y;if(d<w){x=r+3+d;y=3;}else if((d-=w)<Math.PI*r){const a=-Math.PI/2+d/r;x=size.w-r-3+Math.cos(a)*r;y=size.h/2+Math.sin(a)*r;}else if((d-=Math.PI*r)<w){x=size.w-r-3-d;y=size.h-3;}else{d-=w;const a=Math.PI/2+d/r;x=r+3+Math.cos(a)*r;y=size.h/2+Math.sin(a)*r;}dots.home(i,x,y,active&&!el.matches(':disabled,[aria-disabled=true]')?1:0);}dots.step(1/60);g.clearRect(0,0,size.w,size.h);const hot=getComputedStyle(el).getPropertyValue('--hot').trim()||'#ff5a1f';dots.draw(g,{ink:hot,hot,r:1.2});};
    let off=null;
    const animate=()=>{draw();if(!active){off?.();off=null;}};
    const set=v=>{active=v;if(reducedMotion()){dots.snap();draw();}else if(!off)off=clock.add(animate);};
    el.addEventListener('pointerenter',()=>set(true),{signal:abort.signal});el.addEventListener('pointerleave',()=>set(el.matches(':focus-visible')),{signal:abort.signal});el.addEventListener('focus',()=>set(el.matches(':focus-visible')),{signal:abort.signal});el.addEventListener('blur',()=>set(false),{signal:abort.signal});
    draw();return {destroy(){off?.();off=null;}};
  });
  const handle={element:el,destroy:once(()=>{abort.abort();life.api.destroy();life.destroy();el.querySelectorAll('canvas.lx-canvas').forEach(c=>c.remove());clear();restore();instances.delete(el);})};instances.set(el,handle);return handle;
}
const ResizeObserver=ManagedResizeObserver,IntersectionObserver=ManagedIntersectionObserver;

const sound={tick(){},chord(){},whoosh(){},pluck(){}};
/* Light Evergreen Lattice composition — isolated presentation lifecycle. */
const REDUCED=matchMedia('(prefers-reduced-motion: reduce)');
const smallScreen=matchMedia('(max-width: 650px)');
const clampVisual=(n,min,max)=>Math.min(max,Math.max(min,n));
const root=document.documentElement;
const presentation={handles:new Map(),owned:[],hero:null,progress:null,dottext:null,nav:null,destroyed:false};
const dom=(s)=>document.querySelector(s);
const own=(off)=>{presentation.owned.push(off);return off;};
function listenVisual(el,evt,fn,opts){el.addEventListener(evt,fn,opts);own(()=>el.removeEventListener(evt,fn,opts));}
function fitCanvas(cv,ctx){const rect=cv.getBoundingClientRect();const dpr=Math.min(2,window.devicePixelRatio||1);const w=Math.max(1,rect.width),h=Math.max(1,rect.height);cv.width=Math.max(1,Math.round(w*dpr));cv.height=Math.max(1,Math.round(h*dpr));ctx.setTransform(dpr,0,0,dpr,0,0);return {w,h,dpr};}
function createHero(){
  const host=dom('.page-heading'),canvas=dom('#latticeField');if(!host||!canvas)return;
  const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)return;
  let W=0,H=0,step=0,rafOff=null,inView=true,fieldScale=1;
  const pointer={x:0,y:0,active:false},N=smallScreen.matches?390:850,gridCount=Math.round(N*.26);
  const dots=new Dots(N);dots.k=34;dots.damp=7;dots.flow=9;
  for(let i=0;i<N;i++){dots.s[i]=i<gridCount?.65:.6+dots.seed[i]*.9;dots.heat[i]=0;}
  function mapPoint(i,index){
    const t=(i-gridCount)/Math.max(1,N-gridCount-1),j=dots.seed[i];
    const cx=W*(smallScreen.matches?.78:.79),cy=H*.53;
    const rx=W*(smallScreen.matches?.23:.215),ry=H*.375;
    const turn=t*Math.PI*2,phase=index%6;
    if(phase===0){const ring=t*5.5*Math.PI;const rr=.66+.28*Math.sin(t*9*Math.PI)+.1*(j-.5);return [cx+rx*Math.cos(ring)*rr,cy+ry*Math.sin(ring)*(.79+.2*Math.sin(t*4*Math.PI))];}
    if(phase===1){const a=t*11*Math.PI;const x=cx+(t-.5)*rx*1.8;return [x,cy+Math.sin(a)*ry*.7+(j-.5)*12];}
    if(phase===2){const ring=Math.floor(t*4),local=t*4-ring,a=local*2*Math.PI+ring*.7;return [cx+Math.cos(a)*rx*(.31+ring*.21),cy+Math.sin(a)*ry*(.31+ring*.21)];}
    if(phase===3){const layer=Math.floor(t*6),local=t*6-layer,a=-1.15+layer*.48+local*.16;const rad=Math.pow(local,.8)*(rx*.95);return [cx+Math.cos(a)*rad+(j-.5)*10,cy+Math.sin(a)*rad*.97+(j-.5)*12];}
    if(phase===4){const cols=Math.max(16,Math.floor(rx*2/13));return [cx-rx+(i%cols)*(rx*2/cols),cy-ry+(Math.floor((i-gridCount)/cols)%Math.max(1,Math.floor(ry*2/13)))*(ry*2/Math.max(1,Math.floor(ry*2/13)))];}
    // final stage: a big check made from two gently noisy point strokes
    const v=t<.37?t/.37:(t-.37)/.63;
    return t<.37?[cx-rx*.8+v*rx*.62,cy+v*ry*.38]:[cx-rx*.18+v*rx*1.26,cy+ry*.38-v*ry*1.2];
  }
  function target(s,initial=false){step=s;
    const stepNoise=step*.27;
    for(let i=0;i<N;i++){
      if(i<gridCount){const cols=Math.max(10,Math.round(W*.45/20));const col=i%cols,row=Math.floor(i/cols);const px=W*.53+col*19+(row%2)*9,py=21+row*19;
        dots.home(i,px,py,.11+.12*dots.seed[i]);dots.s[i]=.52;
      }else{
        const [x,y]=mapPoint(i,s);dots.home(i,x,y,.29+.63*dots.seed[i]);dots.s[i]=.6+.83*dots.seed[i];
      }
      if(initial){dots.place(i,dots.tx[i]+(dots.seed[i]-.5)*65,dots.ty[i]+(dots.seed[(i*7)%N]-.5)*38);dots.a[i]=0;}
    }
    if(initial||REDUCED.matches)dots.snap();else dots.stagger(.65,i=>dots.tx[i]+dots.ty[i]*.14);
  }
  function resize(){const b=fitCanvas(canvas,ctx);W=b.w;H=b.h;if(W<2||H<2)return;target(step,true);draw(0,0);}
  function draw(dt,t){ctx.clearRect(0,0,W,H);if(W<2||H<2)return;
    // One field, two particle states: faint lattice sites + concentrated spring points.
    if(pointer.active&&!REDUCED.matches)dots.attract(pointer.x,pointer.y,140,-.75);
    if(!REDUCED.matches){dots.flow=16;dots.step(dt);}else dots.snap();
    const hot='#1e674a',deep='#285b44',faint='#7fae91';
    for(let i=0;i<N;i++){
      const a=dots.a[i];if(a<.018)continue;
      const x=dots.x[i],y=dots.y[i];if(!Number.isFinite(x)||!Number.isFinite(y))continue;
      const depth=dots.seed[i],glow=dots.heat[i];
      ctx.globalAlpha=Math.min(1,a*(i<gridCount?.65:1));
      ctx.fillStyle=glow>.55?'#0d553a':i<gridCount?faint:(depth>.77?hot:deep);
      const r=i<gridCount?.78:depth>.82?1.9:1.1;
      ctx.beginPath();ctx.arc(x,y,r*(1+glow*.44),0,Math.PI*2);ctx.fill();
      if(i>=gridCount&&i%17===0&&depth>.35){ctx.globalAlpha=a*.15;ctx.beginPath();ctx.arc(x,y,4.8,0,Math.PI*2);ctx.fill();}
    }
    ctx.globalAlpha=1;
  }
  const off=clock.add((dt,t)=>{if(!document.hidden&&inView)draw(dt,t);});own(off);
  const ro=new ResizeObserver(resize);ro.observe(host);own(()=>ro.disconnect());
  const io=new IntersectionObserver(([v])=>{inView=!!v?.isIntersecting;},{threshold:0});io.observe(host);own(()=>io.disconnect());
  function pointerMove(e){const r=canvas.getBoundingClientRect();pointer.x=e.clientX-r.left;pointer.y=e.clientY-r.top;pointer.active=true;}
  listenVisual(host,'pointermove',pointerMove,{passive:true});listenVisual(host,'pointerleave',()=>pointer.active=false,{passive:true});
  listenVisual(host,'pointerdown',e=>{if(REDUCED.matches)return;pointerMove(e);dots.burst(pointer.x,pointer.y,32);},{passive:true});
  resize();
  presentation.hero={stepTo(n){if(n===step)return;target(n);},get step(){return step;},get count(){return dots.n}};
}
function createNavDots(){
  const nav=dom('#steps');if(!nav)return;
  const cv=document.createElement('canvas');cv.className='lattice-steps-canvas';cv.setAttribute('aria-hidden','true');nav.appendChild(cv);
  const ctx=cv.getContext('2d');if(!ctx)return;own(()=>cv.remove());
  const dots=new Dots(28);dots.k=100;dots.damp=11;let w=1,h=1,shown=-1;
  function draw(dt){ctx.clearRect(0,0,w,h);dots.step(dt);dots.draw(ctx,{ink:'#a6e7ba',hot:'#e1ffda',r:1.17});}
  function resize(){const b=fitCanvas(cv,ctx);w=b.w;h=b.h;target(true);draw(0);}
  function target(force=false){const active=nav.querySelector('.step-button.active');if(!active)return;const list=nav.getBoundingClientRect(),rect=active.getBoundingClientRect(),mobile=matchMedia('(max-width: 870px)').matches;
    if(!force && Number(active.dataset.step)===shown)return;
    shown=Number(active.dataset.step);
    for(let i=0;i<dots.n;i++){
      const col=i%14,row=Math.floor(i/14);
      const x=mobile?rect.left-list.left+9+col*(Math.max(24,rect.width-18)/13):rect.right-list.left-33+col*.75;
      const y=mobile?rect.bottom-list.top-7+row*2.7:rect.top-list.top+rect.height*.44+row*5;
      dots.home(i,x,y,mobile?.5:.6);
      if(force)dots.place(i,x,y);
    }
    dots.stagger(.24,i=>dots.tx[i]);if(force||REDUCED.matches)dots.snap();
  }
  const ro=new ResizeObserver(resize);ro.observe(nav);own(()=>ro.disconnect());
  const off=clock.add(dt=>{if(!document.hidden&&!REDUCED.matches)draw(dt);});own(off);
  resize();presentation.nav={target};
}
function mountReadout(){
  const s=dom('#latticeStepGlyph');if(!s)return;
  const instance=owned(()=>mountDotText(s,{pitch:4.2,color:'--hot'}));presentation.dottext=instance.api;
  own(()=>{const value=s.getAttribute('aria-label')||'01';instance.destroy();s.querySelectorAll('canvas.lx-canvas').forEach(x=>x.remove());s.textContent=value;s.removeAttribute('style');});
}
function mountCompletion(){
  const holder=dom('#latticeProgress'),bar=dom('#fillBar'),percent=dom('#latticeProgressPercent');if(!holder||!bar)return;
  const instance=owned(()=>mountProgress(holder));presentation.progress=instance.api;
  let prev=-1;
  const sync=()=>{const p=clampVisual(parseFloat(bar.style.width)||0,0,100);if(p===prev)return;prev=p;instance.api.set(p/100);if(percent)percent.textContent=Math.round(p)+'%';};
  const mo=new MutationObserver(sync);mo.observe(bar,{attributes:true,attributeFilter:['style']});own(()=>mo.disconnect());
  own(()=>{instance.destroy();holder.querySelectorAll('canvas.lx-canvas').forEach(x=>x.remove());});
  sync();
}
function buttons(){
  const selectors=['#nextBtn','#prevBtn','#downloadDocx','#runValidation','#saveDraft','#railReview','.add-button'];
  const active=new Set(document.querySelectorAll(selectors.join(',')));
  for(const [node,h] of [...presentation.handles]){
    if(!node.isConnected || !active.has(node) || !node.querySelector('canvas.lx-canvas')){
      h.destroy();presentation.handles.delete(node);
    }
  }
  for(const b of active){if(presentation.handles.has(b))continue;
    try{const variant=b.matches('#nextBtn,#downloadDocx')?'accent':b.matches('#prevBtn,#runValidation')?'primary':'ghost';const handle=enhanceButton(b,{variant});presentation.handles.set(b,handle);}
    catch(e){console.warn('Lattice button enhancement skipped:',e.message);}
  }
}
function onStepChanged(){const active=dom('.step-button.active'),step=Number(active?.dataset.step||0);if(Number.isInteger(step)){
  presentation.hero?.stepTo(step);presentation.nav?.target();
  presentation.dottext?.set(String(step+1).padStart(2,'0'));
  const hint=dom('.lattice-step-caption');if(hint)hint.textContent=`CURRENT / 06`;
}}
function observeOriginal(){
  const nav=dom('#steps');
  if(nav){const obs=new MutationObserver(()=>{requestAnimationFrame(onStepChanged);});obs.observe(nav,{attributes:true,attributeFilter:['class'],subtree:true});own(()=>obs.disconnect());}
  // The original app rebuilds repeatable records and the export button's innerHTML.
  // Reattach only canvases to new DOM; never rebind the app's business events.
  const watch=dom('#form');if(watch){let scheduled=false;const obs=new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;buttons();});});obs.observe(watch,{childList:true,subtree:true});own(()=>obs.disconnect());}
  listenVisual(document,'pointerdown',e=>{
    const node=e.target.closest?.('.btn,.add-button,.step-button');if(!node||REDUCED.matches||e.pointerType==='touch')return;
    const r=node.getBoundingClientRect();const p=document.createElement('span');p.className='lattice-button-burst';p.style.left=(e.clientX-r.left)+'px';p.style.top=(e.clientY-r.top)+'px';
    if(getComputedStyle(node).position==='static')return;
    node.appendChild(p);setTimeout(()=>p.remove(),720);
  },{passive:true});
}
function injectDecor(){for(const sec of document.querySelectorAll('.section-head')){
  const d=document.createElement('div');d.className='lattice-section-dots';d.setAttribute('aria-hidden','true');d.innerHTML='<i></i><i></i><i></i>';sec.appendChild(d);
}}
function initPresentation(){try{
  injectDecor();createHero();createNavDots();mountReadout();mountCompletion();buttons();observeOriginal();onStepChanged();
  // No network dependency. The original business bundle and underlying DOCX remain untouched.
  window.QingmaLattice={diagnostics:()=>({buttons:presentation.handles.size,particles:presentation.hero?.count||0,clockSubscribers:clock.subs.size,step:presentation.hero?.step||0}),teardown:destroyPresentation};
}catch(e){console.error('Carry Lattice visual enhancement failed; original form remains usable:',e);}}
function destroyPresentation(){if(presentation.destroyed)return;presentation.destroyed=true;
  for(const [node,h]of presentation.handles)h.destroy();presentation.handles.clear();
  for(const off of presentation.owned.splice(0).reverse())try{off();}catch{};
}
window.addEventListener('pagehide',destroyPresentation,{once:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initPresentation,{once:true});else initPresentation();

})();
