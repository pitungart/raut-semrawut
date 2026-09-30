/* Cable collage engine: owns the mutable scene (photo pieces, text blocks, cables), layout,
   rendering and pointer interaction. React owns the settings and re-renders the UI
   whenever the engine calls onChange(). Every node has a top-left x/y, a w/h box and a
   rotation `rot` in degrees around its center. */

import { drawTexture, TEXTURE_IDS } from './textures.js';
import { outputInfo, withDpi } from './print.js';

export const PRESETS = { a4: [1240, 1754], a3: [1754, 2480], sq: [2048, 2048], story: [1080, 1920] };

export const DEFAULT_SETTINGS = {
  preset: 'a4', canvasW: 1240, canvasH: 1754, bg: '#ffffff',
  frameOn: true, frameW: 1.5, frameColor: '#1c1c1c', margin: 88,
  sizeContrast: 0.62, bwRatio: 0.4,
  cableMode: 'web', cablesPer: 2, cableWeight: 1, cableColor: '#141414', cableOpacity: 0.8,
  sag: 1.1, overshoot: 0.3, layering: 'mixed',
  cableTexture: 'solid', cableDensity: 1, mixTextures: TEXTURE_IDS.slice(),
  exportScale: 2,
  motionIdle: false, dragPhysics: false,
};

export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS).filter(k => k !== 'motionIdle' && k !== 'dragPhysics');

export const FONT_FAMILY = 'Arial Narrow Local';
const FONT_STACK = `"${FONT_FAMILY}", "Arial Narrow", Arial, sans-serif`;

const TEXT_DEFAULTS = {
  value: 'RAUT SEMRAWUT', size: 96, bold: false, italic: false, ls: 0.04, lh: 1.05,
  align: 'left', upper: true, color: '#141414', boxW: null, cable: true,
};
const TEXT_FIELDS = ['value', 'size', 'bold', 'italic', 'ls', 'lh', 'align', 'upper', 'color', 'boxW', 'cable'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const uid = p => p + Math.random().toString(36).slice(2, 8);
const ASPECT = { square: 1, tall: 1 / 3, wide: 3 };
const RAD = Math.PI / 180;
const normDeg = d => { d = ((d + 180) % 360 + 360) % 360 - 180; return Math.round(d * 10) / 10; };
const HANDLE_DIRS = { nw: [-1, -1], ne: [1, -1], sw: [-1, 1], se: [1, 1], e: [1, 0], w: [-1, 0] };

function rngFrom(seed) {
  let a = (seed || 1) >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function rgba(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

function mixHex(a, b, t) {
  const n = h => { h = h.replace('#', ''); return parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16); };
  const x = n(a), y = n(b);
  const ch = sh => Math.round(((x >> sh) & 255) * (1 - t) + ((y >> sh) & 255) * t);
  return '#' + [16, 8, 0].map(sh => ch(sh).toString(16).padStart(2, '0')).join('');
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const loadImage = src => new Promise(res => {
  const img = new Image();
  img.onload = () => res(img);
  img.onerror = () => res(null);
  img.src = src;
});

const readAsDataURL = file => new Promise(res => {
  const fr = new FileReader();
  fr.onload = () => res(fr.result);
  fr.onerror = () => res(null);
  fr.readAsDataURL(file);
});

/* Centered cover-crop of an image into a w x h box, in source pixels. */
function cropOf(img, w, h) {
  const ir = img.naturalWidth / img.naturalHeight, rr = w / h;
  if (ir > rr) { const sh = img.naturalHeight, sw = sh * rr; return { sx: (img.naturalWidth - sw) / 2, sy: 0, sw, sh }; }
  const sw = img.naturalWidth, sh = sw / rr;
  return { sx: 0, sy: (img.naturalHeight - sh) / 2, sw, sh };
}

const center = n => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 });
const rotate = (x, y, deg) => { const c = Math.cos(deg * RAD), s = Math.sin(deg * RAD); return { x: x * c - y * s, y: x * s + y * c }; };
/* Point in a node's local frame: origin at its center, axes along its rotation. */
const toLocal = (n, px, py) => { const c = center(n); return rotate(px - c.x, py - c.y, -(n.rot || 0)); };
const toWorld = (n, lx, ly) => { const c = center(n), p = rotate(lx, ly, n.rot || 0); return { x: c.x + p.x, y: c.y + p.y }; };

export const fontOf = t => `${t.italic ? 'italic ' : ''}${t.bold ? 700 : 400} ${t.size}px ${FONT_STACK}`;

export class CollageEngine {
  constructor({ settings, placeholderCount = 8, onChange, onSettingsPatch }) {
    this.s = settings;
    this.placeholderCount = placeholderCount;
    this.onChange = onChange || (() => {});
    this.onSettingsPatch = onSettingsPatch || (() => {});
    this.canvas = null;
    this.mctx = document.createElement('canvas').getContext('2d');
    this.pieces = [];
    this.texts = [];
    this.cables = [];
    this.sel = null;
    this.fit = 0.3;
    this.t = 0;
    this.raf = null;
    this.drag = null;
    this.physActive = false;
    this.seed = 0;

    this.makePlaceholders();
    this.autoCompose();
    this.buildCables();
  }

  setCanvas(c) { this.canvas = c; }
  setSettings(s) { this.s = s; }
  destroy() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = null; }

  /* ---------- scene ---------- */
  inner() { const { canvasW: W, canvasH: H, margin: M } = this.s; return { x: M, y: M, w: Math.max(80, W - 2 * M), h: Math.max(80, H - 2 * M) }; }
  drawNodes() { return this.pieces.concat(this.texts); }
  cableNodes() { return this.pieces.concat(this.texts.filter(t => t.cable)); }
  node(id) { return this.drawNodes().find(n => n.id === id) || null; }
  selected() { return this.node(this.sel); }

  makePlaceholders() {
    this.pieces = [];
    for (let i = 0; i < this.placeholderCount; i++) this.pieces.push(this.newPiece(null, rnd(0.68, 1.45)));
  }
  newPiece(img, aspectGuess) {
    return {
      id: uid('p'), kind: 'piece', img, src: img ? img.src : null,
      natural: aspectGuess ?? 1, x: 0, y: 0, w: 200, h: 200, rot: 0, treatment: 'original', aspect: 'free',
      role: 'small', rand: Math.random(), phase: Math.random() * 6.28,
    };
  }
  aspectOf(p) { return p.aspect === 'free' ? (p.img ? p.img.naturalWidth / p.img.naturalHeight : p.natural) : ASPECT[p.aspect]; }

  /* Modular grid layout: pieces snap to cell blocks of a cols x rows grid inside the
     safe area, so edges align while block spans keep the composition asymmetric.
     Same seed = same arrangement, so sliders re-flow instead of re-scrambling.
     Text blocks are left where the user put them. */
  autoCompose(keepSeed) {
    if (!keepSeed || !this.seed) this.seed = Math.floor(Math.random() * 1e9) + 1;
    const R = rngFrom(this.seed);
    const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
    const I = this.inner();
    const ps = this.pieces;
    if (!ps.length) return;
    const C = clamp(this.s.sizeContrast, 0, 1);
    const cols = ps.length > 10 ? 7 : 6;
    const rows = Math.max(5, Math.round(cols * I.h / I.w));
    const cw = I.w / cols, ch = I.h / rows;
    const g = Math.min(cw, ch) * 0.18;
    const occ = new Set();
    const free = (c, r, sc, sr) => { if (c < 0 || r < 0 || c + sc > cols || r + sr > rows) return false; for (let i = c; i < c + sc; i++) for (let j = r; j < r + sr; j++) if (occ.has(i + ',' + j)) return false; return true; };
    const put = (p, c, r, sc, sr) => {
      for (let i = c; i < c + sc; i++) for (let j = r; j < r + sr; j++) occ.add(i + ',' + j);
      const bw = sc * cw - g, bh = sr * ch - g, a = this.aspectOf(p);
      let w = bw, h = bw / a;
      if (h > bh) { h = bh; w = bh * a; }
      p.w = w; p.h = h; p.rot = 0;
      p.x = I.x + c * cw + (c + sc / 2 > cols / 2 ? bw - w : 0);
      p.y = I.y + r * ch + (r + sr / 2 > rows / 2 ? bh - h : 0);
      p.cell = { c, r, sc, sr };
    };
    const spots = (sc, sr, pred) => { const out = []; for (let c = 0; c <= cols - sc; c++) for (let r = 0; r <= rows - sr; r++) if (free(c, r, sc, sr) && (!pred || pred(c, r))) out.push([c, r]); return out; };
    const pick = arr => arr[Math.floor(R() * arr.length)];

    const idx = ps.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const domI = idx[0];
    const stripIdx = idx.slice(1, 1 + (ps.length > 5 ? 2 : ps.length > 3 ? 1 : 0));
    ps.forEach((p, i) => { p.role = i === domI ? 'dom' : stripIdx.includes(i) ? 'strip' : 'small'; });
    ps.forEach(p => { p.aspect = p.role === 'strip' ? (R() < 0.62 ? 'tall' : 'wide') : (p.role === 'small' && R() < 0.22 ? 'square' : 'free'); });

    const dSc = Math.min(cols - 1, 3 + (C > 0.5 ? 1 : 0));
    const dSr = Math.max(2, Math.min(rows - 2, Math.round(3 + C * 2)));
    const domCol = R() < 0.5 ? 0 : cols - dSc;
    const domRow = ri(0, Math.max(0, Math.min(2, rows - dSr - 2)));
    put(ps[domI], domCol, domRow, dSc, dSr);

    stripIdx.forEach(i => {
      const p = ps[i];
      if (p.aspect === 'tall') {
        const edge = domCol === 0 ? cols - 1 : 0;
        let sr = Math.min(rows, ri(4, Math.max(4, Math.min(7, rows - 1))));
        let cand = [];
        while (sr >= 3 && !cand.length) {
          cand = spots(1, sr, c => c === edge);
          if (!cand.length) cand = spots(1, sr, c => c === 0 || c === cols - 1);
          if (!cand.length) cand = spots(1, sr);
          if (!cand.length) sr--;
        }
        if (cand.length) { const [c, r] = pick(cand); put(p, c, r, 1, sr); }
      } else {
        let sc = ri(3, 4), cand = [];
        while (sc >= 2 && !cand.length) {
          cand = spots(sc, 1, (c, r) => r === 0 || r === rows - 1);
          if (!cand.length) cand = spots(sc, 1);
          if (!cand.length) sc--;
        }
        if (cand.length) { const [c, r] = pick(cand); put(p, c, r, sc, 1); }
      }
    });

    const voidC = R() < 0.5 ? 0 : 1, voidR = ri(0, 1);
    const inVoid = (c, r, s) => ((c + s / 2) / cols < 0.5 ? 0 : 1) === voidC && ((r + s / 2) / rows < 0.5 ? 0 : 1) === voidR;
    ps.forEach(p => {
      if (p.role !== 'small') return;
      const want = C > 0.66 ? 1 : C > 0.33 ? (R() < 0.45 ? 2 : 1) : 2;
      for (const s of [want, want === 2 ? 1 : 2, 1]) {
        let cand = spots(s, s, (c, r) => !inVoid(c, r, s));
        if (!cand.length) cand = spots(s, s);
        if (cand.length) { const [c, r] = pick(cand); put(p, c, r, s, s); return; }
      }
      p.w = cw - g; p.h = p.w / this.aspectOf(p); p.rot = 0;
      p.x = I.x + (cols - 1) * cw; p.y = I.y + (rows - 1) * ch;
    });

    this.applyBW();
  }

  applyBW() {
    const ranked = this.pieces.slice().sort((a, b) => a.rand - b.rand);
    const k = Math.round(ranked.length * this.s.bwRatio);
    ranked.forEach((p, i) => { p.treatment = i < k ? (p.rand > 0.82 ? 'hc' : 'bw') : 'original'; });
  }

  /* ---------- text ---------- */
  /* Lays out a text block: explicit newlines always break; with a fixed box width,
     words also wrap. Sets t.lines, t.w, t.h. */
  layoutText(t) {
    const ctx = this.mctx;
    ctx.font = fontOf(t);
    const lsPx = t.ls * t.size;
    if ('letterSpacing' in ctx) ctx.letterSpacing = lsPx.toFixed(2) + 'px';
    const measure = s => Math.max(0, ctx.measureText(s).width - (s ? lsPx : 0));
    const src = t.upper ? (t.value || '').toUpperCase() : (t.value || '');
    const lines = [];
    src.split('\n').forEach(par => {
      if (!t.boxW) { lines.push(par); return; }
      const words = par.split(/ +/);
      let line = '';
      words.forEach(word => {
        const tryLine = line ? line + ' ' + word : word;
        if (line && measure(tryLine) > t.boxW) { lines.push(line); line = word; }
        else line = tryLine;
      });
      lines.push(line);
    });
    t.lines = lines;
    t.w = t.boxW ? t.boxW : Math.max(t.size * 0.4, ...lines.map(measure));
    t.h = Math.max(1, lines.length) * t.size * t.lh;
  }
  relayoutTexts() { this.texts.forEach(t => this.layoutText(t)); }

  addText() {
    const I = this.inner();
    const t = {
      ...TEXT_DEFAULTS, value: this.texts.length ? 'Text' : TEXT_DEFAULTS.value,
      id: uid('t'), kind: 'text', x: I.x, y: 0, w: 0, h: 0, rot: 0, phase: Math.random() * 6.28,
    };
    this.layoutText(t);
    t.y = clamp(I.y + I.h - t.h - this.texts.length * t.h * 1.3, I.y, I.y + I.h - t.h);
    this.texts.push(t);
    if (t.cable) this.connectNode(t);
    this.sel = t.id;
    this.onChange();
    return t.id;
  }

  /* ---------- cables ---------- */
  buildCables() {
    const nodes = this.cableNodes();
    const out = [];
    if (nodes.length < 2) { this.cables = out; return; }
    const seen = new Set();
    const add = (a, b) => { if (a === b) return; const k = [a.id, b.id].sort().join('|'); if (seen.has(k)) return; seen.add(k); out.push(this.makeCable(a, b)); };
    const mode = this.s.cableMode;
    if (mode === 'chain') { const o = shuffle(nodes.slice()); for (let i = 0; i < o.length - 1; i++) add(o[i], o[i + 1]); }
    else if (mode === 'hub') { const hub = nodes.reduce((m, p) => (p.w * p.h > m.w * m.h ? p : m), nodes[0]); nodes.forEach(p => add(hub, p)); }
    else {
      nodes.forEach(p => {
        const k = 1 + Math.floor(Math.random() * this.s.cablesPer);
        this.farPool(p, nodes).slice(0, k).forEach(o => add(p, o));
      });
    }
    this.cables = out;
  }
  farPool(p, nodes) {
    const others = nodes.filter(o => o !== p).map(o => ({ o, d: this.dist(p, o) })).sort((a, b) => b.d - a.d);
    return shuffle(others.slice(0, Math.max(1, Math.ceil(others.length * 0.65)))).map(x => x.o);
  }
  /* Adds cables for one node without re-rolling the rest of the web. */
  connectNode(n) {
    const nodes = this.cableNodes();
    if (!nodes.includes(n) || nodes.length < 2) return;
    const k = 1 + Math.floor(Math.random() * Math.min(2, this.s.cablesPer));
    this.farPool(n, nodes).slice(0, k).forEach(o => this.cables.push(this.makeCable(n, o)));
  }
  disconnectNode(id) { this.cables = this.cables.filter(c => c.a !== id && c.b !== id); }
  dist(a, b) { const ca = center(a), cb = center(b); return Math.hypot(ca.x - cb.x, ca.y - cb.y); }
  makeCable(a, b) {
    const ap = this.attach(a, b), bp = this.attach(b, a);
    return {
      a: a.id, b: b.id, au: ap.u, av: ap.v, bu: bp.u, bv: bp.v,
      sagK: rnd(0.55, 1.5), overK: Math.random() < 0.42 ? rnd(0.4, 1) : 0,
      front: Math.random() < 0.45, side: Math.random() < 0.5 ? -1 : 1,
      phase: Math.random() * 6.28, freq: rnd(0.5, 1.1), oy: 0, vy: 0,
      seed: Math.floor(Math.random() * 1e9) + 1, texR: Math.random(),
    };
  }
  attach(n, to) {
    const d = toLocal(n, center(to).x, center(to).y);
    const dx = d.x, dy = d.y;
    const inset = 0.05;
    if (Math.abs(dx) / Math.max(1, n.w) > Math.abs(dy) / Math.max(1, n.h))
      return { u: dx > 0 ? 1 - inset : inset, v: clamp(0.5 + (dy / (Math.abs(dx) || 1)) * 0.3 + rnd(-0.22, 0.22), 0.08, 0.92) };
    return { v: dy > 0 ? 1 - inset : inset, u: clamp(0.5 + (dx / (Math.abs(dy) || 1)) * 0.3 + rnd(-0.22, 0.22), 0.08, 0.92) };
  }

  /* ---------- render ---------- */
  fitTo(el) {
    if (!el) return;
    const availW = el.clientWidth - 48, availH = el.clientHeight - 48;
    const fit = Math.max(0.05, Math.min(availW / this.s.canvasW, availH / this.s.canvasH));
    if (Math.abs(fit - this.fit) > 0.001) { this.fit = fit; this.onChange(); }
    this.draw();
  }
  draw() {
    const c = this.canvas;
    if (!c) return;
    const { canvasW: W, canvasH: H } = this.s;
    const fit = this.fit;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.max(1, Math.round(W * fit)), ph = Math.max(1, Math.round(H * fit));
    if (c.style.width !== pw + 'px' || c.style.height !== ph + 'px') { c.style.width = pw + 'px'; c.style.height = ph + 'px'; }
    if (c.width !== Math.round(pw * dpr) || c.height !== Math.round(ph * dpr)) { c.width = Math.round(pw * dpr); c.height = Math.round(ph * dpr); }
    const ctx = c.getContext('2d');
    ctx.setTransform(pw * dpr / W, 0, 0, pw * dpr / W, 0, 0);
    this.render(ctx, { ui: true, motion: this.s.motionIdle });
  }
  render(ctx, opt) {
    const s = this.s;
    const W = s.canvasW, H = s.canvasH;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = s.bg; ctx.fillRect(0, 0, W, H);

    const drift = n => {
      if (!opt.motion) return { dx: 0, dy: 0 };
      const t = this.t;
      return { dx: Math.sin(t * 0.42 + n.phase) * 2.2, dy: Math.cos(t * 0.31 + n.phase * 1.7) * 2.6 };
    };
    const nodes = this.drawNodes();
    const map = {};
    nodes.forEach(n => { const d = drift(n); map[n.id] = { x: n.x + d.dx, y: n.y + d.dy, w: n.w, h: n.h, rot: n.rot || 0, node: n }; });

    this.drawCables(ctx, map, false, opt);
    nodes.forEach(n => {
      const m = map[n.id];
      ctx.save();
      ctx.translate(m.x + m.w / 2, m.y + m.h / 2);
      if (m.rot) ctx.rotate(m.rot * RAD);
      if (n.kind === 'text') this.drawText(ctx, n); else this.drawPiece(ctx, n, m.w, m.h);
      ctx.restore();
    });
    this.drawCables(ctx, map, true, opt);

    if (s.frameOn) {
      const i = Math.max(4, s.margin * 0.5);
      ctx.strokeStyle = s.frameColor; ctx.lineWidth = s.frameW;
      ctx.strokeRect(i, i, W - 2 * i, H - 2 * i);
    }
    if (opt.ui && this.sel && map[this.sel]) this.drawSelection(ctx, map[this.sel]);
  }
  /* Draws in the node's local frame (origin = center). */
  drawPiece(ctx, p, w, h) {
    const x = -w / 2, y = -h / 2;
    if (p.treatment === 'bw') ctx.filter = 'grayscale(1)';
    else if (p.treatment === 'hc') ctx.filter = 'grayscale(1) contrast(1.85) brightness(1.05)';
    if (p.img && p.img.complete && p.img.naturalWidth) {
      const { sx, sy, sw, sh } = cropOf(p.img, w, h);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(p.img, sx, sy, sw, sh, x, y, w, h);
    } else {
      ctx.filter = 'none';
      ctx.fillStyle = p.treatment === 'original' ? '#dadade' : '#d2d2d4';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#a6a6ac'; ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x + w, y + h);
      ctx.moveTo(x + w, y); ctx.lineTo(x, y + h);
      ctx.stroke();
    }
    ctx.filter = 'none';
  }
  drawText(ctx, t) {
    if (!t.lines) this.layoutText(t);
    ctx.font = fontOf(t);
    if ('letterSpacing' in ctx) ctx.letterSpacing = (t.ls * t.size).toFixed(2) + 'px';
    ctx.textBaseline = 'middle';
    ctx.textAlign = t.align;
    ctx.fillStyle = t.color;
    const lh = t.size * t.lh;
    const x = t.align === 'center' ? 0 : t.align === 'right' ? t.w / 2 : -t.w / 2;
    t.lines.forEach((line, i) => ctx.fillText(line, x, -t.h / 2 + (i + 0.5) * lh));
  }
  /* Texture for one cable: in mix mode each cable keeps a stable random slot (texR), so
     toggling textures in the mix list re-deals only the affected cables. */
  textureOf(c) {
    const s = this.s;
    if (s.cableTexture !== 'mix') return s.cableTexture;
    const list = (s.mixTextures || []).filter(t => TEXTURE_IDS.includes(t));
    if (!list.length) return 'solid';
    return list[Math.min(list.length - 1, Math.floor((c.texR ?? 0.5) * list.length))];
  }
  drawCables(ctx, map, front, opt) {
    const s = this.s;
    const L = s.layering;
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = rgba(s.cableColor, s.cableOpacity);
    const light = rgba(mixHex(s.cableColor, '#ffffff', 0.62), Math.min(1, s.cableOpacity + 0.1));
    this.cables.forEach(c => {
      const isFront = L === 'mixed' ? c.front : L === 'front';
      if (isFront !== front) return;
      const A = map[c.a], B = map[c.b];
      if (!A || !B) return;
      const p0 = toWorld(A, (c.au - 0.5) * A.w, (c.av - 0.5) * A.h);
      const p1 = toWorld(B, (c.bu - 0.5) * B.w, (c.bv - 0.5) * B.h);
      const dx = p1.x - p0.x, dy = p1.y - p0.y, D = Math.hypot(dx, dy) || 1;
      const sway = (opt.motion ? Math.sin(this.t * c.freq + c.phase) * D * 0.012 : 0) + c.oy;
      const sag = D * 0.17 * s.sag * c.sagK + sway;
      const c1 = { x: p0.x + dx / 3, y: p0.y + dy / 3 + sag }, c2 = { x: p0.x + dx * 2 / 3, y: p0.y + dy * 2 / 3 + sag };
      const over = s.overshoot * c.overK;
      let segs;
      if (over > 0.02) {
        const ux = dx / D, uy = dy / D, px = -uy, py = ux, Lo = D * 0.14 * over;
        const O = { x: p1.x + ux * Lo, y: p1.y + uy * Lo + sag * 0.35 };
        segs = [
          [p0, c1, c2, O],
          [O, { x: O.x + ux * Lo * 0.7 + px * c.side * Lo * 0.5, y: O.y + uy * Lo * 0.7 + py * c.side * Lo * 0.5 },
            { x: p1.x + px * c.side * Lo * 1.1 - ux * Lo * 0.2, y: p1.y + py * c.side * Lo * 1.1 - uy * Lo * 0.2 }, p1],
        ];
      } else {
        segs = [[p0, c1, c2, p1]];
      }
      drawTexture(ctx, segs, this.textureOf(c), { w: s.cableWeight, density: s.cableDensity, seed: c.seed, light });
    });
    ctx.restore();
  }
  /* Handle positions in local coordinates; screen-constant offsets are divided by fit. */
  handles(n) {
    const hw = n.w / 2, hh = n.h / 2;
    const out = { nw: [-hw, -hh], ne: [hw, -hh], sw: [-hw, hh], se: [hw, hh] };
    if (n.kind === 'text') { out.e = [hw, 0]; out.w = [-hw, 0]; }
    out.rot = [0, -hh - 26 / this.fit];
    return out;
  }
  drawSelection(ctx, m) {
    const k = 1 / Math.max(0.06, this.fit);
    const accent = 'rgba(24,24,27,0.95)';
    ctx.save();
    ctx.translate(m.x + m.w / 2, m.y + m.h / 2);
    if (m.rot) ctx.rotate(m.rot * RAD);
    ctx.strokeStyle = accent; ctx.lineWidth = 1.2 * k;
    ctx.strokeRect(-m.w / 2, -m.h / 2, m.w, m.h);
    const hs = this.handles({ ...m.node, w: m.w, h: m.h });
    ctx.beginPath(); ctx.moveTo(0, -m.h / 2); ctx.lineTo(hs.rot[0], hs.rot[1]); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    const r = 4.5 * k;
    Object.entries(hs).forEach(([key, [x, y]]) => {
      ctx.beginPath();
      if (key === 'rot') ctx.arc(x, y, 5.5 * k, 0, Math.PI * 2);
      else if (key === 'e' || key === 'w') ctx.roundRect(x - r * 0.6, y - r * 1.6, r * 1.2, r * 3.2, r * 0.6);
      else ctx.rect(x - r, y - r, r * 2, r * 2);
      ctx.fill(); ctx.stroke();
    });
    ctx.restore();
  }

  /* ---------- motion loop ---------- */
  ensureLoop() {
    const need = this.s.motionIdle || this.physActive || !!this.drag;
    if (need && !this.raf) this.raf = requestAnimationFrame(this.loop);
  }
  loop = () => {
    this.raf = null;
    this.t = performance.now() / 1000;
    if (this.s.dragPhysics) {
      let moving = false;
      const dt = 1 / 60, k = 55, damp = 5.5;
      this.cables.forEach(c => {
        if (c.oy === 0 && c.vy === 0) return;
        c.vy += (-k * c.oy - damp * c.vy) * dt;
        c.oy += c.vy * dt;
        if (Math.abs(c.vy) > 0.08 || Math.abs(c.oy) > 0.08) moving = true; else { c.vy = 0; c.oy = 0; }
      });
      this.physActive = moving;
    } else { this.physActive = false; }
    this.draw();
    if (this.s.motionIdle || this.physActive || this.drag) this.raf = requestAnimationFrame(this.loop);
  };

  /* ---------- interaction ---------- */
  pt(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / this.fit, y: (e.clientY - r.top) / this.fit };
  }
  hitHandle(n, x, y) {
    const l = toLocal(n, x, y);
    const r = 9 / this.fit;
    for (const [k, [hx, hy]] of Object.entries(this.handles(n))) if (Math.abs(l.x - hx) < r && Math.abs(l.y - hy) < r) return k;
    return null;
  }
  hitNode(x, y) {
    const list = this.drawNodes();
    for (let i = list.length - 1; i >= 0; i--) {
      const n = list[i], l = toLocal(n, x, y);
      if (Math.abs(l.x) <= n.w / 2 && Math.abs(l.y) <= n.h / 2) return n;
    }
    return null;
  }
  cursorFor(x, y) {
    const sel = this.selected();
    const h = sel && this.hitHandle(sel, x, y);
    if (h === 'rot') return 'grab';
    if (h) {
      // Pick the resize cursor closest to the handle's on-screen direction.
      const [dx, dy] = HANDLE_DIRS[h];
      const a = ((Math.atan2(dy, dx) / RAD + (sel.rot || 0)) % 180 + 180) % 180;
      return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][Math.round(a / 45) % 4];
    }
    return this.hitNode(x, y) ? 'move' : 'default';
  }
  select(id) {
    if (this.sel === id) { this.draw(); return; }
    this.sel = id;
    this.draw();
    this.onChange();
  }
  pointerDown = e => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = this.pt(e);
    const sel = this.selected();
    if (sel) {
      const h = this.hitHandle(sel, x, y);
      if (h === 'rot') {
        const c = center(sel);
        this.drag = { mode: 'rotate', id: sel.id, cx: c.x, cy: c.y };
        this.canvas.style.cursor = 'grabbing';
        this.ensureLoop(); return;
      }
      if (h) {
        this.drag = { mode: 'resize', id: sel.id, handle: h, o: { x: sel.x, y: sel.y, w: sel.w, h: sel.h, rot: sel.rot || 0, size: sel.size, boxW: sel.boxW } };
        this.ensureLoop(); return;
      }
    }
    const hit = this.hitNode(x, y);
    if (!hit) { if (this.sel) this.select(null); return; }
    this.drag = { mode: 'move', id: hit.id, dx: x - hit.x, dy: y - hit.y };
    this.select(hit.id);
    this.ensureLoop();
  };
  pointerMove = e => {
    const { x, y } = this.pt(e);
    if (!this.drag) { this.canvas.style.cursor = this.cursorFor(x, y); return; }
    const n = this.node(this.drag.id);
    if (!n) return;
    const I = this.inner();
    if (this.drag.mode === 'move') {
      const px = n.x, py = n.y;
      n.x = clamp(x - this.drag.dx, I.x - n.w * 0.12, I.x + I.w - n.w * 0.88);
      n.y = clamp(y - this.drag.dy, I.y - n.h * 0.12, I.y + I.h - n.h * 0.88);
      if (this.s.dragPhysics) {
        const imp = (n.y - py) * 0.55 + Math.abs(n.x - px) * 0.25;
        this.cables.forEach(c => { if (c.a === n.id || c.b === n.id) c.vy += imp * 2.2; });
        this.physActive = true;
      }
    } else if (this.drag.mode === 'rotate') {
      let deg = Math.atan2(y - this.drag.cy, x - this.drag.cx) / RAD + 90;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      else { const snap = Math.round(deg / 90) * 90; if (Math.abs(deg - snap) < 3) deg = snap; }
      n.rot = normDeg(deg);
    } else {
      this.resizeTo(n, x, y);
    }
    this.draw();
    this.ensureLoop();
    this.onChange();
  };
  /* Resize in the node's rotated frame: the opposite corner/edge stays put on screen. */
  resizeTo(n, px, py) {
    const o = this.drag.o, [sx, sy] = HANDLE_DIRS[this.drag.handle];
    const ax = -sx * o.w / 2, ay = -sy * o.h / 2;
    const P = rotate(px - (o.x + o.w / 2), py - (o.y + o.h / 2), -o.rot);
    const min = 20;
    let nw = sx ? Math.max(min, sx * (P.x - ax)) : o.w;
    let nh = sy ? Math.max(min, sy * (P.y - ay)) : o.h;
    let clx, cly;
    if (n.kind === 'text') {
      if (sy === 0) {
        n.boxW = Math.max(n.size * 0.5, nw);
      } else {
        const k = Math.max(0.05, (nw / o.w + nh / o.h) / 2);
        n.size = clamp(Math.round(o.size * k), 6, 1200);
        if (o.boxW) n.boxW = o.boxW * (n.size / o.size);
      }
      this.layoutText(n);
      nw = n.w; nh = n.h;
      clx = sx ? ax + sx * nw / 2 : 0;
      cly = sy ? ay + sy * nh / 2 : -o.h / 2 + nh / 2; // side handles keep the top edge fixed
    } else {
      if (n.aspect !== 'free' && sx && sy) nh = nw / this.aspectOf(n);
      clx = sx ? ax + sx * nw / 2 : 0;
      cly = sy ? ay + sy * nh / 2 : 0;
    }
    const c = rotate(clx, cly, o.rot);
    n.w = nw; n.h = nh;
    n.x = o.x + o.w / 2 + c.x - nw / 2;
    n.y = o.y + o.h / 2 + c.y - nh / 2;
  }
  pointerUp = () => {
    if (this.drag?.mode === 'rotate' && this.canvas) this.canvas.style.cursor = 'grab';
    this.drag = null;
  };

  /* ---------- edits from the inspector ---------- */
  updateNode(id, patch) {
    const n = this.node(id);
    if (!n) return;
    const wasCabled = n.kind === 'text' && n.cable;
    Object.assign(n, patch);
    if ('rot' in patch) n.rot = normDeg(n.rot);
    if (n.kind === 'text') {
      if (TEXT_FIELDS.some(k => k in patch)) this.layoutText(n);
      if ('cable' in patch && n.cable !== wasCabled) { if (n.cable) this.connectNode(n); else this.disconnectNode(n.id); }
    }
    this.onChange();
  }
  rotateSel(delta) { const n = this.selected(); if (n) this.updateNode(n.id, { rot: (n.rot || 0) + delta }); }

  removeSel() {
    const id = this.sel;
    if (!id) return;
    this.sel = null;
    this.pieces = this.pieces.filter(p => p.id !== id);
    this.texts = this.texts.filter(t => t.id !== id);
    this.disconnectNode(id);
    this.onChange();
  }
  bump(dir) {
    const list = this.texts.some(t => t.id === this.sel) ? this.texts : this.pieces;
    const i = list.findIndex(p => p.id === this.sel);
    if (i < 0) return;
    const j = clamp(i + dir, 0, list.length - 1);
    if (i === j) return;
    const [p] = list.splice(i, 1);
    list.splice(j, 0, p);
    this.onChange();
  }
  setSelTreatment(v) {
    const n = this.selected();
    if (!n || n.kind === 'text') return;
    n.treatment = v;
    this.onChange();
  }
  setSelAspect(v) {
    const n = this.selected();
    if (!n || n.kind === 'text') return;
    const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
    n.aspect = v;
    n.h = Math.sqrt((n.w * n.h) / this.aspectOf(n));
    n.w = n.h * this.aspectOf(n);
    n.x = cx - n.w / 2; n.y = cy - n.h / 2;
    this.onChange();
  }

  /* ---------- actions ---------- */
  compose() { this.autoCompose(); this.buildCables(); this.onChange(); }
  reshuffle() { this.buildCables(); this.onChange(); }
  reset() { this.makePlaceholders(); this.autoCompose(); this.buildCables(); this.sel = null; this.onChange(); }

  async addFiles(files) {
    const srcs = await Promise.all(files.map(readAsDataURL));
    const imgs = (await Promise.all(srcs.filter(Boolean).map(loadImage))).filter(Boolean);
    if (!imgs.length) return;
    if (this.pieces.every(p => !p.img)) this.pieces = [];
    imgs.forEach(img => this.pieces.push(this.newPiece(img, img.naturalWidth / img.naturalHeight)));
    this.autoCompose();
    this.buildCables();
    this.sel = null;
    this.onChange();
  }

  /* How well a photo holds up at the export size: source pixels per output pixel
     (ratio < 1 means it gets enlarged) and, for paper presets, its effective print dpi. */
  imageQuality(p) {
    if (!p?.img?.naturalWidth) return null;
    const { sw } = cropOf(p.img, p.w, p.h);
    const out = outputInfo(this.s);
    const ratio = sw / (p.w * (this.s.exportScale || 1));
    return {
      srcW: p.img.naturalWidth, srcH: p.img.naturalHeight, ratio,
      dpi: out.dpi ? Math.round(out.dpi * ratio) : null,
    };
  }

  /* Renders the clean frame at canvas size x exportScale. Photos are resampled once, from
     their original uploaded pixels; PNG is lossless and JPEG uses the highest quality. */
  exportImage(type) {
    const { canvasW: W, canvasH: H } = this.s;
    const out = outputInfo(this.s);
    const off = document.createElement('canvas');
    off.width = out.w; off.height = out.h;
    const ctx = off.getContext('2d');
    ctx.setTransform(out.w / W, 0, 0, out.h / H, 0, 0);
    this.render(ctx, { ui: false, motion: false });
    const jpg = type === 'image/jpeg';
    const name = 'raut-semrawut' + (out.paper ? '-' + out.paper : '') + (out.dpi ? '-' + out.dpi + 'dpi' : '-' + out.w + 'x' + out.h) + (jpg ? '.jpg' : '.png');
    off.toBlob(async b => {
      if (!b) { window.alert(`Export failed: ${out.w} x ${out.h} px is too large for this browser. Try a smaller export scale.`); return; }
      download(await withDpi(b, out.dpi), name);
    }, type, jpg ? 1 : undefined);
  }

  exportJson() {
    const s = this.s;
    const settings = {};
    SETTING_KEYS.forEach(k => { settings[k] = s[k]; });
    const data = {
      version: 2, settings,
      pieces: this.pieces.map(p => ({ id: p.id, x: p.x, y: p.y, w: p.w, h: p.h, rot: p.rot || 0, treatment: p.treatment, aspect: p.aspect, role: p.role, rand: p.rand, natural: p.natural, src: p.src })),
      texts: this.texts.map(t => { const o = { id: t.id, x: t.x, y: t.y, rot: t.rot || 0 }; TEXT_FIELDS.forEach(k => { o[k] = t[k]; }); return o; }),
      cables: this.cables.map(c => ({ ...c, oy: 0, vy: 0 })),
    };
    download(new Blob([JSON.stringify(data)], { type: 'application/json' }), 'raut-semrawut.json');
  }

  /* Returns the settings patch from the file, or null when the file isn't a collage.
     Version 1 files carry a single title in settings.text*; it becomes one text block. */
  async importJson(file) {
    let d;
    try { d = JSON.parse(await file.text()); } catch { return null; }
    if (!d || !Array.isArray(d.pieces)) return null;
    const pieces = await Promise.all(d.pieces.map(async p => {
      const base = { rot: 0, ...p, kind: 'piece', img: null, phase: Math.random() * 6.28 };
      if (!p.src) return base;
      const img = await loadImage(p.src);
      return img ? { ...base, img } : base;
    }));
    const settings = { ...(d.settings || {}) };
    let texts = Array.isArray(d.texts) ? d.texts : [];
    if (!d.texts && settings.textOn && d.text) {
      texts = [{
        id: 'title', x: d.text.x, y: d.text.y, rot: 0, value: settings.textVal, size: settings.textSize,
        ls: settings.textLs, upper: settings.textUpper, color: settings.textColor,
      }];
    }
    ['textOn', 'textVal', 'textSize', 'textLs', 'textUpper', 'textColor'].forEach(k => delete settings[k]);
    this.pieces = pieces;
    this.texts = texts.map(t => {
      const n = { ...TEXT_DEFAULTS, ...t, kind: 'text', phase: Math.random() * 6.28 };
      this.layoutText(n);
      return n;
    });
    this.cables = (d.cables || []).map(c => ({
      seed: Math.floor(Math.random() * 1e9) + 1, texR: Math.random(), ...c, oy: 0, vy: 0,
    }));
    this.sel = null;
    return settings;
  }
}
