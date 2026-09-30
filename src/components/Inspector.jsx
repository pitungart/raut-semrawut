import { CableRange, Color, Field, NumberInput, Section, Segmented, Slider, Toggle } from './Controls.jsx';

const f = (n, p) => Number(n).toFixed(p);

/* Print check for a photo: flags it when export would enlarge it past its own pixels. */
function ImageQuality({ q }) {
  if (!q) return null;
  const low = q.dpi ? q.dpi < 300 : q.ratio < 1;
  const detail = q.dpi ? `${q.dpi} dpi` : q.ratio < 1 ? `enlarged ${Math.round(100 / q.ratio)}%` : 'sharp';
  return (
    <Field label="Print">
      <span className={'quality' + (low ? ' low' : '')} title={`${q.srcW} × ${q.srcH} px original`}>
        {low ? '⚠ Low res' : '✓ OK'} · {detail}
        <small>{q.srcW} × {q.srcH} px original</small>
      </span>
    </Field>
  );
}

/* Section for the selected canvas node (photo piece or text block). */
export function Inspector({ engine, node, textareaRef }) {
  const isText = node.kind === 'text';
  const set = key => v => engine.updateNode(node.id, { [key]: v });

  return (
    <Section title={isText ? 'Selected text' : 'Selected piece'} defaultOpen>
      {isText ? (
        <>
          <Field label="Content" stack>
            <textarea
              ref={textareaRef} className="line-area" rows={3} value={node.value}
              placeholder="Type here. Enter for a new line."
              onChange={e => engine.updateNode(node.id, { value: e.target.value })}
            />
          </Field>
          <Segmented label="Weight" value={node.bold} options={[[false, 'Regular'], [true, 'Bold']]} onChange={set('bold')} />
          <Segmented label="Style" value={node.italic} options={[[false, 'Normal'], [true, 'Italic']]} onChange={set('italic')} />
          <Slider label="Size" value={node.size} display={Math.round(node.size) + ' px'} min={8} max={400} step={1} onChange={set('size')} />
          <Segmented
            label="Align" value={node.align}
            options={[['left', 'Left'], ['center', 'Center'], ['right', 'Right']]}
            onChange={set('align')}
          />
          <Slider label="Letter spacing" value={node.ls} display={f(node.ls, 2)} min={-0.1} max={0.6} step={0.01} onChange={set('ls')} />
          <Slider label="Line height" value={node.lh} display={f(node.lh, 2)} min={0.7} max={2} step={0.01} onChange={set('lh')} />
          <Segmented
            label="Box width" value={node.boxW ? 'fixed' : 'auto'}
            options={[['auto', 'Auto'], ['fixed', 'Fixed']]}
            onChange={v => engine.updateNode(node.id, { boxW: v === 'fixed' ? Math.round(node.w) : null })}
          />
          {node.boxW ? <NumberInput label="Width" value={Math.round(node.boxW)} min={10} max={6000} onChange={set('boxW')} /> : null}
          <Field label="Color"><Color label="Text color" value={node.color} onChange={set('color')} /></Field>
          <Toggle label="Uppercase" checked={node.upper} onChange={set('upper')} />
          <Toggle label="Connect cables" checked={node.cable} onChange={set('cable')} />
        </>
      ) : (
        <>
          <Segmented
            label="Treatment" value={node.treatment || 'original'}
            options={[['original', 'Original'], ['bw', 'Black and white'], ['hc', 'High-contrast B&W']]}
            onChange={v => engine.setSelTreatment(v)}
          />
          <Segmented
            label="Crop aspect" value={node.aspect || 'free'}
            options={[['free', 'Free'], ['square', 'Square (1:1)'], ['tall', 'Tall strip (1:3)'], ['wide', 'Wide strip (3:1)']]}
            onChange={v => engine.setSelAspect(v)}
          />
          <ImageQuality q={engine.imageQuality(node)} />
        </>
      )}

      <div className="row">
        <NumberInput label="X" value={Math.round(node.x)} min={-10000} max={10000} onChange={set('x')} />
        <NumberInput label="Y" value={Math.round(node.y)} min={-10000} max={10000} onChange={set('y')} />
      </div>

      <div className="field slider-row">
        <span className="field-label">Rotation</span>
        <CableRange
          label="Rotation" shape="loose" value={node.rot || 0} min={-180} max={180} step={1}
          onChange={set('rot')} onDoubleClick={() => set('rot')(0)}
        />
        <span className="value">{f(node.rot || 0, 0)}°</span>
      </div>
      <div className="link-row">
        <button type="button" className="raw-link" onClick={() => engine.rotateSel(-90)}>−90°</button>
        <span className="sep">//</span>
        <button type="button" className="raw-link" onClick={() => engine.rotateSel(90)}>+90°</button>
        <span className="sep">//</span>
        <button type="button" className="raw-link" onClick={() => set('rot')(0)}>0°</button>
      </div>
      <div className="link-row">
        <button type="button" className="raw-link" onClick={() => engine.bump(1)}>Forward</button>
        <span className="sep">//</span>
        <button type="button" className="raw-link" onClick={() => engine.bump(-1)}>Backward</button>
        <span className="sep">//</span>
        <button type="button" className="raw-link" title="Delete (Del)" onClick={() => engine.removeSel()}>Remove</button>
      </div>
    </Section>
  );
}
