/* Cable textures. A cable is a list of cubic Bézier segments [p0, c1, c2, p3]; textures
   other than solid/stitched resample it at equal arc-length steps and draw a pattern along
   the tangent/normal frame, so the pattern stays even however the cable bends. All sizes
   scale with the cable weight `w`; `density` > 1 packs the pattern tighter. */

export const TEXTURES = [
  ['solid', 'Solid'], ['tube', 'Tube'], ['braided', 'Braided'], ['twisted', 'Twisted'],
  ['coiled', 'Coiled'], ['stitched', 'Stitched'], ['beaded', 'Beaded'], ['sketch', 'Sketch'],
];
export const TEXTURE_IDS = TEXTURES.map(([id]) => id);

const hyp = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

function cubicPt(a, b, c, d, t) {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
  };
}

/* Equal-spacing samples along the segments, each with arc position s, unit tangent (tx, ty)
   and unit normal (nx, ny). Returns { pts, len }. */
function samplePath(segs, ds) {
  const dense = [];
  segs.forEach(([a, b, c, d], si) => {
    const n = Math.max(8, Math.ceil((hyp(a, b) + hyp(b, c) + hyp(c, d)) / 1.5));
    for (let i = si ? 1 : 0; i <= n; i++) dense.push(cubicPt(a, b, c, d, i / n));
  });
  const pts = [{ ...dense[0], s: 0 }];
  let acc = 0, next = ds;
  for (let i = 1; i < dense.length; i++) {
    const p = dense[i - 1], q = dense[i], L = hyp(p, q);
    while (L > 0 && next <= acc + L) {
      const k = (next - acc) / L;
      pts.push({ x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k, s: next });
      next += ds;
    }
    acc += L;
  }
  const last = dense[dense.length - 1];
  if (acc - pts[pts.length - 1].s > ds * 0.25) pts.push({ ...last, s: acc });
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const l = hyp(a, b) || 1;
    pts[i].tx = (b.x - a.x) / l; pts[i].ty = (b.y - a.y) / l;
    pts[i].nx = -pts[i].ty; pts[i].ny = pts[i].tx;
  }
  return { pts, len: acc };
}

function tracePath(ctx, segs) {
  ctx.beginPath();
  ctx.moveTo(segs[0][0].x, segs[0][0].y);
  segs.forEach(([, b, c, d]) => ctx.bezierCurveTo(b.x, b.y, c.x, c.y, d.x, d.y));
}

/* Strokes the sampled line displaced by off(p) along the normal and tan(p) along the tangent. */
function strokeOffset(ctx, pts, off, tan) {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const o = off(p), t = tan ? tan(p) : 0;
    const x = p.x + p.nx * o + p.tx * t, y = p.y + p.ny * o + p.ty * t;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  });
  ctx.stroke();
}

function seededRng(seed) {
  let a = (seed || 1) >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* Draws one cable. ctx.strokeStyle / fillStyle must already be set to the cable color;
   `light` is a lighter tint used for the tube highlight. */
export function drawTexture(ctx, segs, tex, { w, density = 1, seed = 1, light }) {
  const d = Math.max(0.2, density);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = w;

  if (tex === 'solid' || !TEXTURE_IDS.includes(tex)) { tracePath(ctx, segs); ctx.stroke(); return; }

  if (tex === 'stitched') {
    const dash = Math.max(3, w * 3) / d;
    ctx.lineCap = 'butt';
    ctx.setLineDash([dash, dash * 0.75]);
    tracePath(ctx, segs); ctx.stroke();
    ctx.setLineDash([]);
    return;
  }

  if (tex === 'tube') {
    const tw = Math.max(w, 1.5);
    ctx.lineWidth = tw;
    tracePath(ctx, segs); ctx.stroke();
    const { pts } = samplePath(segs, 2);
    const stroke = ctx.strokeStyle;
    ctx.strokeStyle = light;
    ctx.lineWidth = Math.max(0.4, tw * 0.28);
    strokeOffset(ctx, pts, () => -tw * 0.17);
    ctx.strokeStyle = stroke;
    return;
  }

  if (tex === 'braided') {
    const gap = Math.max(2.5, w * 1.4) / d;
    const { pts } = samplePath(segs, gap / 2);
    const hw = Math.max(1.4, w * 0.75), ht = gap * 0.5;
    ctx.lineWidth = Math.max(0.35, w * 0.25);
    tracePath(ctx, segs); ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.lineWidth = Math.max(0.5, w * 0.4);
    ctx.beginPath();
    pts.forEach((p, i) => {
      const k = i % 2 ? 1 : -1;
      ctx.moveTo(p.x - p.nx * hw - p.tx * ht * k, p.y - p.ny * hw - p.ty * ht * k);
      ctx.lineTo(p.x + p.nx * hw + p.tx * ht * k, p.y + p.ny * hw + p.ty * ht * k);
    });
    ctx.stroke();
    return;
  }

  if (tex === 'twisted') {
    const lambda = Math.max(8, w * 6) / d, amp = w * 0.55 + 0.8;
    const { pts, len } = samplePath(segs, Math.min(2, lambda / 12));
    const taper = p => Math.min(1, p.s / lambda, (len - p.s) / lambda);
    ctx.lineWidth = Math.max(0.5, w * 0.45);
    strokeOffset(ctx, pts, p => Math.sin((p.s / lambda) * Math.PI * 2) * amp * taper(p));
    strokeOffset(ctx, pts, p => -Math.sin((p.s / lambda) * Math.PI * 2) * amp * taper(p));
    return;
  }

  if (tex === 'coiled') {
    const R = w * 1.2 + 2.5, lambda = (R * 2.4) / d;
    const { pts, len } = samplePath(segs, Math.min(1.5, lambda / 14));
    const taper = p => Math.max(0, Math.min(1, p.s / (lambda * 1.5), (len - p.s) / (lambda * 1.5)));
    const th = p => (p.s / lambda) * Math.PI * 2;
    ctx.lineWidth = Math.max(0.5, w * 0.5);
    strokeOffset(ctx, pts, p => Math.sin(th(p)) * R * taper(p), p => Math.cos(th(p)) * R * 0.9 * taper(p) - R * 0.9 * taper(p));
    return;
  }

  if (tex === 'beaded') {
    const r = Math.max(1, w * 0.85);
    const { pts } = samplePath(segs, Math.max(r * 2.6, 3) / d);
    ctx.beginPath();
    pts.forEach(p => { ctx.moveTo(p.x + r, p.y); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); });
    ctx.fill();
    return;
  }

  if (tex === 'sketch') {
    const { pts, len } = samplePath(segs, 2);
    const A = w * 0.7 + 1.5;
    const taper = p => Math.min(1, p.s / 10, (len - p.s) / 10);
    ctx.lineWidth = Math.max(0.4, w * 0.45);
    for (let k = 0; k < 3; k++) {
      const R = seededRng((seed || 1) + k * 7919);
      const f1 = 38 / d * (0.8 + R() * 0.4), f2 = 11 / d * (0.8 + R() * 0.4), p1 = R() * 6.28, p2 = R() * 6.28;
      strokeOffset(ctx, pts, p => A * (0.6 * Math.sin(p.s / f1 + p1) + 0.4 * Math.sin(p.s / f2 + p2)) * taper(p));
    }
  }
}
