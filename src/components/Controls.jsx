import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';

/* Raw sidebar controls: black on white, Arial Narrow capitals, label on the left and the
   control on the right. Native inputs sit underneath every custom look, so keyboard,
   touch and screen-reader behaviour stay native. */

export function Section({ title, defaultOpen = false, children }) {
  return (
    <details className="section" open={defaultOpen}>
      <summary>
        <span>{title}</span>
        <span className="sec-mark" aria-hidden="true" />
      </summary>
      <div className="section-body">{children}</div>
    </details>
  );
}

/* One sidebar row. `stack` puts the control under the label for wide content. */
export function Field({ label, stack = false, children }) {
  return (
    <div className={'field' + (stack ? ' stack' : '')}>
      {label && <span className="field-label">{label}</span>}
      <div className="field-ctl">{children}</div>
    </div>
  );
}

/* ---------- cable slider ----------
   Each slider is a loose cable with its own shape; the dot rides along the curve.
   Shapes map u in [0, 1] (left to right) to a height in [0, 1] (top to bottom). */
const SHAPES = {
  down: u => 0.18 + 0.55 * u,
  up: u => 0.82 - 0.6 * u,
  sag: u => 0.12 + 0.72 * Math.sin(Math.PI * Math.pow(u, 0.8)) - 0.1 * u,
  bump: u => 0.22 + 0.25 * u - 0.32 * Math.exp(-(((u - 0.7) / 0.09) ** 2)) + (u > 0.76 ? 1.5 * (u - 0.76) ** 1.4 : 0),
  wave: u => 0.62 - 0.22 * Math.sin(Math.PI * 2 * u + 0.3) - 0.2 * u,
  arch: u => 0.82 - 0.62 * Math.sin(Math.PI * u),
  drop: u => 0.14 + 0.68 * u * u,
  lift: u => 0.84 - 0.66 * Math.sqrt(u),
  kink: u => (u < 0.42 ? 0.3 : u < 0.58 ? 0.3 + ((u - 0.42) / 0.16) * 0.42 : 0.72) + 0.04 * Math.sin(u * 9),
  loose: u => 0.45 + 0.28 * Math.sin(u * 4.4 + 0.8) * (1 - u * 0.4),
};
const SHAPE_NAMES = Object.keys(SHAPES);
// The sliders from the reference sheet keep its shapes; the rest get a stable pick by label.
const SHAPE_FOR = { 'Size contrast': 'down', 'Cables per piece': 'sag', Weight: 'bump', Opacity: 'up', Sag: 'wave' };
const shapeFor = label => {
  if (SHAPE_FOR[label]) return SHAPE_FOR[label];
  let h = 7;
  for (const ch of String(label)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SHAPE_NAMES[h % SHAPE_NAMES.length];
};

const DOT_R = 5.5, TRACK_H = 34, PAD = 7;

export function CableRange({ value, min, max, step, label, shape, onChange, onDoubleClick }) {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const f = SHAPES[shape || shapeFor(label)];
  const yAt = x => PAD + f(Math.min(1, Math.max(0, x / Math.max(1, w)))) * (TRACK_H - 2 * PAD);
  const t = Math.min(1, Math.max(0, (value - min) / (max - min)));
  const tx = DOT_R + t * Math.max(0, w - 2 * DOT_R);
  let d = '';
  if (w > 0) for (let i = 0; i <= 64; i++) { const x = (i / 64) * w; d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + yAt(x).toFixed(1); }

  return (
    <div className="cable-range" ref={ref}>
      {w > 0 && (
        <svg width={w} height={TRACK_H} aria-hidden="true">
          <path d={d} />
          <circle cx={tx} cy={yAt(tx)} r={DOT_R} />
        </svg>
      )}
      <input
        type="range" min={min} max={max} step={step} value={value} aria-label={label}
        onChange={e => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) onChange(v); }}
        onDoubleClick={onDoubleClick}
      />
    </div>
  );
}

export function Slider({ label, value, display, min, max, step, shape, onChange }) {
  return (
    <div className="field slider-row">
      <span className="field-label">{label}</span>
      <CableRange label={label} shape={shape} value={value} min={min} max={max} step={step} onChange={onChange} />
      <span className="value">{display ?? value}</span>
    </div>
  );
}

/* ---------- choices: underlined text with ⌃⌄, a native <select> laid over it ---------- */
function RawSelect({ label, value, options, onChange }) {
  const idx = Math.max(0, options.findIndex(([v]) => v === value));
  const [, text, title] = options[idx] || [];
  return (
    <span className="raw-select">
      <span className="raw-select-text">{typeof text === 'string' ? text : title}</span>
      <ChevronsUpDown size={13} strokeWidth={2.25} aria-hidden="true" />
      <select value={idx} aria-label={label} onChange={e => onChange(options[+e.target.value][0])}>
        {options.map(([v, t, ttl], i) => <option key={String(v)} value={i}>{typeof t === 'string' ? t : ttl}</option>)}
      </select>
    </span>
  );
}

export function Segmented({ label, value, options, onChange }) {
  return <Field label={label}><RawSelect label={label} value={value} options={options} onChange={onChange} /></Field>;
}
export const Select = Segmented;

export function Toggle({ label, checked, onChange }) {
  return (
    <label className="field check-row">
      <span className="field-label">{label}</span>
      <span className="field-ctl">
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
        <span className="box" aria-hidden="true" />
      </span>
    </label>
  );
}

export function Color({ label, value, onChange }) {
  return (
    <span className="swatch" style={{ '--c': value }} title={value.toUpperCase()}>
      <input type="color" value={value} aria-label={label} onChange={e => onChange(e.target.value)} />
    </span>
  );
}

/* Keeps a local draft while typing and commits (clamped) on blur or Enter. */
export function NumberInput({ label, value, min, max, suffix = 'px', onChange }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const v = parseFloat(draft);
    if (Number.isNaN(v)) { setDraft(String(value)); return; }
    const c = Math.min(max, Math.max(min, Math.round(v)));
    setDraft(String(c));
    if (c !== value) onChange(c);
  };
  return (
    <Field label={label}>
      <span className="line-input">
        <input
          type="number" min={min} max={max} step="1" value={draft} aria-label={label}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); }}
        />
        {suffix && <span className="affix">{suffix}</span>}
      </span>
    </Field>
  );
}

/* "UPLOAD PHOTOS" link that also accepts files dropped onto it. */
export function DropZone({ onFiles }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);
  return (
    <div
      className={'upload-row' + (over ? ' over' : '')}
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); setOver(false); onFiles(Array.from(e.dataTransfer.files)); }}
    >
      <button type="button" className="raw-link" onClick={() => inputRef.current.click()}>Upload photos</button>
      <span className="upload-hint">{over ? 'Drop to add' : 'or drop files · JPG, PNG, WebP'}</span>
      <input
        ref={inputRef} type="file" accept="image/*" multiple hidden
        onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ''; onFiles(files); }}
      />
    </div>
  );
}
