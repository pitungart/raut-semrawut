import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { CollageEngine, DEFAULT_SETTINGS, FONT_FAMILY, PRESETS } from './engine.js';
import {
  CableRange, Color, DropZone, Field, NumberInput, Section, Segmented, Select, Slider, Toggle,
} from './components/Controls.jsx';
import { Inspector } from './components/Inspector.jsx';
import { TexturePicker } from './components/TexturePicker.jsx';
import { outputInfo } from './print.js';
import { linkProps } from './router.js';
import { LANDING_ENABLED } from './config.js';

const PLACEHOLDER_COUNT = 8;
const f = (n, p) => Number(n).toFixed(p);

const LAYOUT_KEYS = ['margin', 'canvasW', 'canvasH', 'preset'];
const CABLE_KEYS = ['cableMode', 'cablesPer', 'layering'];

const hasFiles = e => Array.from(e.dataTransfer?.types || []).includes('Files');

/* Corner-to-corner cross, like an empty image box on a layout sheet. */
const Cross = () => (
  <svg viewBox="0 0 100 100" preserveAspectRatio="none">
    <line x1="0" y1="0" x2="100" y2="100" vectorEffect="non-scaling-stroke" />
    <line x1="100" y1="0" x2="0" y2="100" vectorEffect="non-scaling-stroke" />
  </svg>
);

/* The bent arrow from a toolbar label down to its options (drawn in CSS so it can shorten). */
const Elbow = () => <span className="elbow" aria-hidden="true" />;

export default function App() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [, rerender] = useReducer(x => x + 1, 0);
  const [dragOver, setDragOver] = useState(false);
  const settingsRef = useRef(settings);
  const updateRef = useRef(null);
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const importRef = useRef(null);
  const textareaRef = useRef(null);
  const dragDepth = useRef(0);

  const [engine] = useState(() => new CollageEngine({
    settings: DEFAULT_SETTINGS,
    placeholderCount: PLACEHOLDER_COUNT,
    onChange: rerender,
    onSettingsPatch: patch => updateRef.current(patch),
  }));

  /* Apply a settings patch synchronously to the engine, run the layout/cable side effects
     the changed keys need, then hand the new settings to React. `raw` skips side effects
     (used by JSON import, which restores geometry verbatim). */
  const update = useCallback((patch, { raw = false } = {}) => {
    const next = { ...settingsRef.current, ...patch };
    if (!raw) {
      if (patch.preset && PRESETS[patch.preset]) [next.canvasW, next.canvasH] = PRESETS[patch.preset];
      if (!('preset' in patch) && ('canvasW' in patch || 'canvasH' in patch)) next.preset = 'custom';
    }
    settingsRef.current = next;
    engine.setSettings(next);
    if (!raw) {
      const has = k => k in patch;
      if (has('sizeContrast')) engine.autoCompose(true);
      if (has('bwRatio')) engine.applyBW();
      if (LAYOUT_KEYS.some(has)) { engine.autoCompose(true); engine.buildCables(); }
      else if (CABLE_KEYS.some(has)) engine.buildCables();
    }
    setSettings(next);
    if (raw || LAYOUT_KEYS.some(k => k in patch)) engine.fitTo(wrapRef.current);
  }, [engine]);
  updateRef.current = update;
  const set = key => v => update({ [key]: v });

  // Redraw after every React render; the engine keeps its own RAF loop for motion.
  useEffect(() => { engine.draw(); engine.ensureLoop(); });

  useEffect(() => {
    engine.setCanvas(canvasRef.current);
    const ro = new ResizeObserver(() => engine.fitTo(wrapRef.current));
    ro.observe(wrapRef.current);
    engine.fitTo(wrapRef.current);
    // Text blocks are measured with Arial Narrow, so re-layout once every face has loaded.
    const faces = ['400', '700', 'italic 400', 'italic 700'].map(v => `${v} 40px "${FONT_FAMILY}"`);
    Promise.all(faces.map(face => document.fonts?.load(face))).catch(() => {}).then(() => {
      engine.relayoutTexts();
      rerender();
    });

    const onKey = e => {
      if (!engine.sel) return;
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); engine.removeSel(); }
      if (e.key === ']') engine.bump(1);
      if (e.key === '[') engine.bump(-1);
      if (e.key === 'Escape') engine.select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => { ro.disconnect(); window.removeEventListener('keydown', onKey); engine.destroy(); };
  }, [engine]);

  const addFiles = files => {
    const imgs = files.filter(file => file.type.startsWith('image/'));
    if (imgs.length) engine.addFiles(imgs);
  };
  const onImport = async e => {
    const file = (e.target.files || [])[0];
    e.target.value = '';
    if (!file) return;
    const patch = await engine.importJson(file);
    if (patch) update(patch, { raw: true });
  };

  // Drag photos anywhere onto the stage. The depth counter ignores enter/leave from children.
  const stageDrag = {
    onDragEnter: e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth.current++; setDragOver(true); },
    onDragOver: e => { if (hasFiles(e)) e.preventDefault(); },
    onDragLeave: () => { if (--dragDepth.current <= 0) { dragDepth.current = 0; setDragOver(false); } },
    onDrop: e => { e.preventDefault(); dragDepth.current = 0; setDragOver(false); addFiles(Array.from(e.dataTransfer.files)); },
  };

  const addText = () => {
    engine.addText();
    // Focus the new block's textarea once the inspector has rendered it.
    requestAnimationFrame(() => { textareaRef.current?.focus(); textareaRef.current?.select(); });
  };
  const onCanvasDoubleClick = () => {
    if (engine.selected()?.kind === 'text') textareaRef.current?.focus();
  };

  const s = settings;
  const sel = engine.selected();
  const out = outputInfo(s);
  const outLabel = `${out.w} × ${out.h} px` + (out.dpi ? ` · ${out.dpi} dpi` : '');
  const photoCount = engine.pieces.filter(p => p.img).length;

  return (
    <div className="app">
      {/* Layout-sheet frame: crossed gutter cells in the header row, empty gutters below. */}
      <div className="gutter x-cell g-left" style={{ gridArea: 'x1' }} aria-hidden="true"><Cross /></div>
      <div className="gutter x-cell g-mid" style={{ gridArea: 'x2' }} aria-hidden="true"><Cross /></div>
      <div className="gutter x-cell g-right" style={{ gridArea: 'x3' }} aria-hidden="true"><Cross /></div>
      <div className="gutter g-left" style={{ gridArea: 'g1' }} aria-hidden="true" />
      <div className="gutter g-mid" style={{ gridArea: 'g2' }} aria-hidden="true" />
      <div className="gutter g-right" style={{ gridArea: 'g3' }} aria-hidden="true" />

      <header className="toolbar">
        <button className="tb-link" title="Re-layout pieces on a new grid" onClick={() => engine.compose()}>Auto compose</button>
        <button className="tb-link" title="New cable routing, same layout" onClick={() => engine.reshuffle()}>Reshuffle cables</button>
        <button className="tb-link" title="Back to placeholders" onClick={() => engine.reset()}>Reset</button>
        <div className="tb-group">
          <span className="tb-label">Export</span>
          <div className="tb-sub">
            <Elbow />
            <button className="tb-link" title={`Lossless, no compression · ${outLabel}`} onClick={() => engine.exportImage('image/png')}>PNG</button>
            <span className="tb-sep">//</span>
            <button className="tb-link" title={`Maximum quality (100%) · ${outLabel}`} onClick={() => engine.exportImage('image/jpeg')}>JPEG</button>
          </div>
        </div>
        <div className="tb-group">
          <span className="tb-label">Project</span>
          <div className="tb-sub">
            <Elbow />
            <button className="tb-link" title="Save as JSON to reopen later" onClick={() => engine.exportJson()}>Save</button>
            <span className="tb-sep">//</span>
            <button className="tb-link" title="Open a saved JSON project" onClick={() => importRef.current.click()}>Open</button>
          </div>
        </div>
        <input ref={importRef} type="file" accept="application/json,.json" onChange={onImport} hidden />
      </header>

      <a className="brand" {...linkProps('/')} title={LANDING_ENABLED ? 'Back to home' : 'RAUT SEMRAWUT'}>RAUT SEMRAWUT</a>

      <main className="stage" {...stageDrag}>
        <div ref={wrapRef} className="canvas-wrap">
          <canvas
            ref={canvasRef}
            onPointerDown={engine.pointerDown}
            onPointerMove={engine.pointerMove}
            onPointerUp={engine.pointerUp}
            onPointerCancel={engine.pointerUp}
            onDoubleClick={onCanvasDoubleClick}
          />
        </div>
        {dragOver && (
          <div className="drop-overlay">
            <div className="drop-card"><ImagePlus size={28} strokeWidth={1.75} />Drop to add photos</div>
          </div>
        )}

        <footer className="statusbar">
          <span className="chip">{Math.round(engine.fit * 100)}%</span>
          <span>{s.canvasW} × {s.canvasH}</span>
          <span className="dot" />
          <span>{engine.pieces.length} pieces · {engine.cables.length} cables</span>
          <div className="spacer" />
          <span className="hint">
            Drag to move · top dot rotates · <kbd>Shift</kbd> snaps · <kbd>Del</kbd> remove · <kbd>[</kbd> <kbd>]</kbd> order
          </span>
        </footer>
      </main>

      <aside className="panel">
        <Section title="Photos" defaultOpen>
          <DropZone onFiles={addFiles} />
          {photoCount > 0 && <p className="note">{photoCount} photo{photoCount > 1 ? 's' : ''} in the collage</p>}
          <Slider label="Size contrast" value={s.sizeContrast} display={f(s.sizeContrast, 2)} min={0} max={1} step={0.01} onChange={set('sizeContrast')} />
          <Slider label="Black & white ratio" value={s.bwRatio} display={Math.round(s.bwRatio * 100) + '%'} min={0} max={1} step={0.01} onChange={set('bwRatio')} />
        </Section>

        {sel && <Inspector key={sel.id} engine={engine} node={sel} textareaRef={textareaRef} />}

        <Section title="Cables" defaultOpen>
          <Segmented
            label="Connection logic" value={s.cableMode}
            options={[['web', 'Sparse web'], ['chain', 'Chain'], ['hub', 'Hub']]}
            onChange={set('cableMode')}
          />
          <Slider label="Cables per piece" value={s.cablesPer} min={1} max={5} step={1} onChange={set('cablesPer')} />
          <Slider label="Weight" value={s.cableWeight} display={f(s.cableWeight, 1) + ' px'} min={0.5} max={12} step={0.1} onChange={set('cableWeight')} />
          <div className="field slider-row color-row">
            <span className="field-label">Color</span>
            <Color label="Cable color" value={s.cableColor} onChange={set('cableColor')} />
            <span className="field-label">Opacity</span>
            <CableRange label="Opacity" value={s.cableOpacity} min={0.1} max={1} step={0.01} onChange={set('cableOpacity')} />
            <span className="value">{Math.round(s.cableOpacity * 100)}%</span>
          </div>
          <TexturePicker
            value={s.cableTexture} mix={s.mixTextures} color={s.cableColor}
            onChange={set('cableTexture')} onMixChange={set('mixTextures')}
          />
          {s.cableTexture !== 'solid' && (
            <Slider label="Texture density" value={s.cableDensity} display={f(s.cableDensity, 2) + '×'} min={0.3} max={3} step={0.05} onChange={set('cableDensity')} />
          )}
          <Slider label="Sag amount" shape="wave" value={s.sag} display={f(s.sag, 2)} min={0} max={3} step={0.02} onChange={set('sag')} />
          <Slider label="Overshoot" value={s.overshoot} display={f(s.overshoot, 2)} min={0} max={1} step={0.01} onChange={set('overshoot')} />
          <Segmented
            label="Layering" value={s.layering}
            options={[['behind', 'Behind pieces'], ['front', 'In front'], ['mixed', 'Mixed']]}
            onChange={set('layering')}
          />
        </Section>

        <Section title="Text" defaultOpen>
          <div className="link-row">
            <button type="button" className="raw-link" onClick={addText}>+ Add text</button>
          </div>
          {engine.texts.length > 0 ? (
            <ol className="layer-list">
              {engine.texts.slice().reverse().map(t => (
                <li key={t.id}>
                  <button type="button" className={sel?.id === t.id ? 'active' : ''} onClick={() => engine.select(t.id)}>
                    <span className="layer-name">{(t.value || '').split('\n')[0] || 'Empty text'}</span>
                    {t.rot ? <span className="layer-meta">{Math.round(t.rot)}°</span> : null}
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="note">Add separate text blocks, each with its own position, size, weight and rotation.</p>
          )}
        </Section>

        <Section title="Motion">
          <Toggle label="Idle drift & sway" checked={s.motionIdle} onChange={set('motionIdle')} />
          <Toggle label="Drag physics" checked={s.dragPhysics} onChange={set('dragPhysics')} />
          <p className="note">Preview only. Exports always render the clean static frame.</p>
        </Section>

        <Section title="Canvas">
          <Select
            label="Preset" value={s.preset}
            options={[['a4', 'A4 portrait · 1240 × 1754'], ['a3', 'A3 portrait · 1754 × 2480'], ['sq', 'Square · 2048'], ['story', 'Instagram story · 1080 × 1920'], ['custom', 'Custom']]}
            onChange={set('preset')}
          />
          <Segmented
            label="Export resolution" value={s.exportScale}
            options={[1, 2, 3, 4].map(k => [k, out.dpi ? `${Math.round(out.dpi / s.exportScale * k)} dpi` : `${k}×`])}
            onChange={set('exportScale')}
          />
          <p className="note">
            Output {outLabel}{out.paper ? ` for ${out.paper} print` : ''}. Layout stays the same; only export pixels change.
            {out.dpi && out.dpi < 300 ? ' Print usually needs 300 dpi.' : ''}
          </p>
          <div className="row">
            <NumberInput label="Width" value={s.canvasW} min={200} max={6000} onChange={set('canvasW')} />
            <NumberInput label="Height" value={s.canvasH} min={200} max={6000} onChange={set('canvasH')} />
          </div>
          <Field label="Background">
            <Color label="Background color" value={s.bg} onChange={set('bg')} />
          </Field>
          <Slider label="Margin" value={s.margin} display={s.margin + ' px'} min={0} max={240} step={1} onChange={set('margin')} />
          <Toggle label="Frame border" checked={s.frameOn} onChange={set('frameOn')} />
          {s.frameOn && (
            <>
              <Slider label="Frame thickness" value={s.frameW} display={f(s.frameW, 1)} min={0.5} max={8} step={0.5} onChange={set('frameW')} />
              <Field label="Frame color">
                <Color label="Frame color" value={s.frameColor} onChange={set('frameColor')} />
              </Field>
            </>
          )}
        </Section>
      </aside>
    </div>
  );
}
