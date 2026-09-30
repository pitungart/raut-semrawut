import { useEffect, useRef } from 'react';
import {
  ArrowRight, Cable, ImagePlus, LayoutGrid, Printer, Save, ShieldCheck, Spline, Type,
} from 'lucide-react';
import { drawTexture, TEXTURES } from './textures.js';
import { linkProps } from './router.js';
import './landing.css';

const INK = '#18181b';
const FONT = '"Arial Narrow Local", "Arial Narrow", Arial, sans-serif';

/* ---------- hero art: a small live collage, drawn with the studio's own cable textures ---------- */
const SCENE_W = 600, SCENE_H = 540;
const BLOCKS = {
  a: { x: 36, y: 40, w: 200, h: 250, fill: INK, dots: '#3f3f46', depth: 14 },
  b: { x: 286, y: 22, w: 140, h: 140, fill: '#d6d6d2', depth: 8 },
  c: { x: 474, y: 96, w: 90, h: 262, fill: '#a1a1aa', lines: true, depth: 18 },
  d: { x: 84, y: 346, w: 176, h: 122, fill: '#e7e7e4', dots: '#c4c4bf', depth: 10 },
  e: { x: 300, y: 246, w: 130, h: 168, fill: '#52525b', depth: 22 },
  t: { x: 300, y: 450, w: 250, h: 58, text: 'SEMRAWUT', depth: 6 },
};
const CABLES = [
  ['a', [1, 0.3], 'b', [0, 0.62], 'solid'],
  ['b', [0.5, 1], 'e', [0.4, 0], 'coiled'],
  ['a', [0.72, 1], 'd', [0.3, 0], 'braided'],
  ['c', [0, 0.72], 'e', [1, 0.45], 'twisted'],
  ['d', [1, 0.5], 'e', [0, 0.82], 'beaded'],
  ['b', [1, 0.3], 'c', [0.5, 0], 'tube'],
  ['e', [0.6, 1], 't', [0.25, 0], 'sketch'],
  ['c', [0.5, 1], 't', [1, 0.5], 'stitched'],
];

function HeroArt() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, scale = 1, mx = 0, my = 0, tx = 0, ty = 0;

    const size = () => {
      const w = canvas.clientWidth, dpr = Math.min(window.devicePixelRatio || 1, 2);
      scale = w / SCENE_W;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(SCENE_H * scale * dpr);
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    };
    const pos = b => ({ x: b.x + mx * b.depth, y: b.y + my * b.depth });

    const drawBlock = b => {
      const { x, y } = pos(b);
      if (b.text) {
        ctx.font = `700 54px ${FONT}`;
        ctx.letterSpacing = '2px';
        ctx.fillStyle = INK; ctx.textBaseline = 'top';
        ctx.fillText(b.text, x, y);
        return;
      }
      ctx.fillStyle = b.fill; ctx.fillRect(x, y, b.w, b.h);
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, b.w, b.h); ctx.clip();
      if (b.dots) {
        ctx.fillStyle = b.dots;
        for (let i = 0; i < b.w; i += 9) for (let j = 0; j < b.h; j += 9) {
          const r = 1.2 + 1.6 * ((i + j) / (b.w + b.h));
          ctx.beginPath(); ctx.arc(x + i + 4, y + j + 4, r, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (b.lines) {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
        for (let k = -b.h; k < b.w; k += 7) { ctx.beginPath(); ctx.moveTo(x + k, y); ctx.lineTo(x + k + b.h, y + b.h); ctx.stroke(); }
      }
      ctx.restore();
    };

    const frame = time => {
      const t = time / 1000;
      mx += (tx - mx) * 0.06; my += (ty - my) * 0.06;
      ctx.clearRect(0, 0, SCENE_W, SCENE_H);
      ['b', 'a', 'c', 'd', 'e'].forEach(k => drawBlock(BLOCKS[k]));
      ctx.strokeStyle = ctx.fillStyle = INK;
      CABLES.forEach(([ka, [ua, va], kb, [ub, vb], tex], i) => {
        const A = BLOCKS[ka], B = BLOCKS[kb], pa = pos(A), pb = pos(B);
        const p0 = { x: pa.x + ua * A.w, y: pa.y + va * A.h }, p1 = { x: pb.x + ub * B.w, y: pb.y + vb * B.h };
        const dx = p1.x - p0.x, dy = p1.y - p0.y, D = Math.hypot(dx, dy);
        const sag = D * 0.2 + (reduce ? 0 : Math.sin(t * 0.9 + i * 1.7) * D * 0.035);
        const segs = [[p0, { x: p0.x + dx / 3, y: p0.y + dy / 3 + sag }, { x: p0.x + dx * 2 / 3, y: p0.y + dy * 2 / 3 + sag }, p1]];
        drawTexture(ctx, segs, tex, { w: 2.4, density: 1, seed: 7 + i, light: '#f4f4f2' });
      });
      drawBlock(BLOCKS.t);
      if (!reduce) raf = requestAnimationFrame(frame);
    };

    const onMove = e => {
      const r = canvas.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 0.9;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 0.9;
    };
    const onLeave = () => { tx = 0; ty = 0; };
    size();
    const ro = new ResizeObserver(() => { size(); if (reduce) frame(0); });
    ro.observe(canvas);
    window.addEventListener('pointermove', onMove);
    document.addEventListener('pointerleave', onLeave);
    document.fonts?.load(`700 54px ${FONT}`).finally(() => { if (reduce) frame(0); });
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('pointermove', onMove); document.removeEventListener('pointerleave', onLeave); };
  }, []);
  return <canvas ref={ref} className="lp-hero-art" role="img" aria-label="A collage of photo blocks connected by cables in eight textures" />;
}

function TextureSample({ tex }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current, W = 180, H = 64, dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = W * dpr; c.height = H * dpr;
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = ctx.fillStyle = INK;
    drawTexture(ctx, [[{ x: 12, y: 18 }, { x: 60, y: 58 }, { x: 120, y: 58 }, { x: 168, y: 24 }]], tex, { w: 3, density: 1, seed: 3, light: '#ffffff' });
  }, [tex]);
  return <canvas ref={ref} style={{ width: 180, height: 64 }} aria-hidden="true" />;
}

const FEATURES = [
  [LayoutGrid, 'Auto compose', 'Foto langsung tersusun di grid modular yang asimetris. Satu klik untuk susunan baru.'],
  [Spline, '8 tekstur kabel', 'Solid, tube, kepang, twisted, spiral, jahitan, manik, sampai coretan pensil. Atau campur semuanya.'],
  [Type, 'Teks bebas', 'Tambah banyak blok teks Arial Narrow, multi-baris, bisa diputar, ditebalkan, dan diatur lebarnya.'],
  [Printer, 'Siap cetak', 'Export PNG atau JPEG sampai 600 dpi, lengkap dengan info DPI di file dan cek resolusi tiap foto.'],
  [ImagePlus, 'Foto tanpa kompresi', 'Drag & drop foto. File asli dipakai apa adanya, tidak diperkecil dan tidak dikompres.'],
  [Save, 'Simpan & lanjutkan', 'Simpan project sebagai JSON, buka lagi kapan saja untuk lanjut mengedit.'],
];

const STEPS = [
  ['01', 'Masukkan foto', 'Drop foto ke studio. Kolase langsung tersusun otomatis.'],
  ['02', 'Semrawutkan', 'Atur kabel, tekstur, teks, dan rotasi sampai terasa pas.'],
  ['03', 'Export', 'Unduh PNG atau JPEG resolusi cetak, siap masuk halaman zine.'],
];

export default function Landing() {
  const studio = linkProps('/studio');
  return (
    <div className="lp">
      <header className="lp-nav">
        <a className="lp-brand" href="/">
          <span className="logo"><Cable size={16} strokeWidth={2.25} /></span>
          <span>RAUT SEMRAWUT</span>
        </a>
        <nav className="lp-links">
          <a href="#fitur">Fitur</a>
          <a href="#tekstur">Tekstur</a>
          <a href="#cara-kerja">Cara kerja</a>
        </nav>
        <a className="lp-btn lp-btn-dark lp-btn-sm" {...studio}>Buka Studio <ArrowRight size={15} /></a>
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-hero-copy">
            <span className="lp-eyebrow">Gratis · Tanpa login · Langsung di browser</span>
            <h1>Kolase zine,<br />disambung kabel.</h1>
            <p className="lp-lead">
              RAUT SEMRAWUT adalah studio kolase untuk zine dan poster. Susun foto, tulis teks,
              sambungkan dengan kabel bertekstur, lalu export resolusi cetak.
            </p>
            <div className="lp-cta-row">
              <a className="lp-btn lp-btn-dark" {...studio}>Mulai bikin kolase <ArrowRight size={17} /></a>
              <a className="lp-btn lp-btn-ghost" href="#fitur">Lihat fitur</a>
            </div>
            <p className="lp-trust"><ShieldCheck size={15} />Foto diproses di perangkatmu, tidak diunggah ke server mana pun.</p>
          </div>
          <div className="lp-hero-visual">
            <HeroArt />
          </div>
        </section>

        <section className="lp-stats" aria-label="Highlights">
          <div><strong>8</strong><span>tekstur kabel</span></div>
          <div><strong>600</strong><span>dpi maksimum</span></div>
          <div><strong>0</strong><span>login, 0 upload</span></div>
        </section>

        <section className="lp-section" id="fitur">
          <div className="lp-section-head">
            <span className="lp-kicker">Fitur</span>
            <h2>Semua yang dibutuhkan satu halaman zine.</h2>
          </div>
          <div className="lp-features">
            {FEATURES.map(([Icon, title, body]) => (
              <article className="lp-card" key={title}>
                <span className="lp-card-icon"><Icon size={18} /></span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="lp-section" id="tekstur">
          <div className="lp-section-head">
            <span className="lp-kicker">Tekstur</span>
            <h2>Setiap kabel punya karakter.</h2>
            <p>Pilih satu tekstur untuk semua kabel, atau mode Mix supaya tiap kabel dapat teksturnya sendiri.</p>
          </div>
          <div className="lp-textures">
            {TEXTURES.map(([id, name]) => (
              <figure key={id}>
                <TextureSample tex={id} />
                <figcaption>{name}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="lp-section" id="cara-kerja">
          <div className="lp-section-head">
            <span className="lp-kicker">Cara kerja</span>
            <h2>Tiga langkah, tanpa daftar akun.</h2>
          </div>
          <ol className="lp-steps">
            {STEPS.map(([n, title, body]) => (
              <li key={n}>
                <span className="lp-step-n">{n}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="lp-final">
          <h2>Kabelnya semrawut.<br />Hasilnya siap cetak.</h2>
          <a className="lp-btn lp-btn-light" {...studio}>Buka Studio <ArrowRight size={17} /></a>
        </section>
      </main>

      <footer className="lp-footer">
        <span>© {new Date().getFullYear()} RAUT SEMRAWUT</span>
        <span>Studio kolase untuk zine, poster, dan majalah.</span>
      </footer>
    </div>
  );
}
