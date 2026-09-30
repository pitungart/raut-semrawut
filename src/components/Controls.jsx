import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, ImagePlus } from 'lucide-react';

export function Section({ title, icon: Icon, defaultOpen = false, children }) {
  return (
    <details className="section" open={defaultOpen}>
      <summary>
        {Icon && <Icon size={15} strokeWidth={2} className="section-icon" />}
        <span>{title}</span>
        <ChevronDown size={15} className="chevron" />
      </summary>
      <div className="section-body">{children}</div>
    </details>
  );
}

export function Field({ label, value, children }) {
  return (
    <div className="field">
      {(label || value !== undefined) && (
        <div className="field-head">
          <span className="field-label">{label}</span>
          {value !== undefined && <span className="pill">{value}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

/* Cable-style range: the filled part is a wavy cable, the rest a slack straight line
   ending in a plug dot. A transparent native <input type=range> sits on top, so pointer,
   keyboard and screen-reader behaviour stay native. */
const WAVE_LEN = 14, WAVE_AMP = 3.2, THUMB_R = 8, TRACK_H = 24;

export function WaveRange({ value, min, max, step, label, onChange, onDoubleClick }) {
  const ref = useRef(null);
  const clipId = 'wave' + useId().replace(/:/g, '');
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const t = Math.min(1, Math.max(0, (value - min) / (max - min)));
  const mid = TRACK_H / 2;
  const tx = THUMB_R + t * Math.max(0, w - 2 * THUMB_R);
  const gap = THUMB_R + 3;
  // One long wave starting a wavelength early, so the CSS drift animation can loop seamlessly.
  const halves = Math.ceil((w + WAVE_LEN * 2) / (WAVE_LEN / 2));
  const wave = `M ${-WAVE_LEN} ${mid} q ${WAVE_LEN / 4} ${-WAVE_AMP * 2} ${WAVE_LEN / 2} 0` + ` t ${WAVE_LEN / 2} 0`.repeat(halves);

  return (
    <div className="wave" ref={ref}>
      {w > 0 && (
        <svg className="wave-svg" width={w} height={TRACK_H} aria-hidden="true">
          <clipPath id={clipId}>
            <rect x="0" y="0" width={Math.max(0, tx - gap)} height={TRACK_H} />
          </clipPath>
          <g clipPath={`url(#${clipId})`}>
            <g className="wave-active"><path className="wave-path" d={wave} /></g>
          </g>
          {tx + gap < w - 3 && <line className="wave-rest" x1={tx + gap} y1={mid} x2={w - 3} y2={mid} />}
          <circle className="wave-plug" cx={w - 3} cy={mid} r="2.5" />
          <g className="wave-thumb" transform={`translate(${tx} ${mid})`}>
            <circle r={THUMB_R} />
            <circle className="wave-thumb-dot" r="2.6" />
          </g>
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

export function Slider({ label, value, display, min, max, step, onChange }) {
  return (
    <Field label={label} value={display ?? value}>
      <WaveRange label={label} value={value} min={min} max={max} step={step} onChange={onChange} />
    </Field>
  );
}

export function Segmented({ label, value, options, onChange }) {
  return (
    <Field label={label}>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map(([v, text, title]) => (
          <button
            key={String(v)} type="button" role="radio" aria-checked={value === v}
            aria-label={title} title={title}
            className={value === v ? 'active' : ''}
            onClick={() => onChange(v)}
          >{text}</button>
        ))}
      </div>
    </Field>
  );
}

export function Select({ label, value, options, onChange }) {
  return (
    <Field label={label}>
      <div className="select-wrap">
        <select className="input" value={value} aria-label={label} onChange={e => onChange(e.target.value)}>
          {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
        </select>
        <ChevronDown size={14} className="select-chevron" />
      </div>
    </Field>
  );
}

export function Toggle({ label, checked, onChange }) {
  return (
    <label className="toggle">
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="track" aria-hidden="true"><span className="thumb" /></span>
    </label>
  );
}

export function Color({ label, value, onChange }) {
  return (
    <label className="color">
      <span className="swatch" style={{ background: value }}>
        <input type="color" value={value} aria-label={label} onChange={e => onChange(e.target.value)} />
      </span>
      <span className="hex">{value.toUpperCase()}</span>
    </label>
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
      <div className="input-affix">
        <input
          className="input" type="number" min={min} max={max} step="1" value={draft} aria-label={label}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); }}
        />
        {suffix && <span className="affix">{suffix}</span>}
      </div>
    </Field>
  );
}

export function DropZone({ onFiles }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);
  return (
    <div
      className={'dropzone' + (over ? ' over' : '')}
      role="button" tabIndex={0}
      onClick={() => inputRef.current.click()}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current.click(); } }}
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); setOver(false); onFiles(Array.from(e.dataTransfer.files)); }}
    >
      <ImagePlus size={20} strokeWidth={1.75} />
      <div className="dz-title">Drop photos here</div>
      <div className="dz-sub">or click to browse · JPG, PNG, WebP</div>
      <input
        ref={inputRef} type="file" accept="image/*" multiple hidden
        onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ''; onFiles(files); }}
      />
    </div>
  );
}

/* Small popover menu; closes on outside click or Escape. */
export function Menu({ trigger, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (!ref.current.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      {trigger({ open, toggle: () => setOpen(o => !o) })}
      {open && <div className="menu-pop" role="menu" onClick={() => setOpen(false)}>{children}</div>}
    </div>
  );
}
