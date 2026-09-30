import {
  AlignCenter, AlignLeft, AlignRight, ArrowDownToLine, ArrowUpToLine, CircleCheck, Image as ImageIcon, TriangleAlert,
  RotateCcw, RotateCw, Trash2, Type,
} from 'lucide-react';
import { Color, Field, NumberInput, Segmented, Slider, Toggle, WaveRange } from './Controls.jsx';

const f = (n, p) => Number(n).toFixed(p);

/* Print check for a photo: flags it when export would enlarge it past its own pixels. */
function ImageQuality({ q }) {
  if (!q) return null;
  const low = q.dpi ? q.dpi < 300 : q.ratio < 1;
  const detail = q.dpi ? `${q.dpi} dpi effective` : q.ratio < 1 ? `enlarged ${Math.round(100 / q.ratio)}%` : 'sharp at export size';
  return (
    <div className={'quality' + (low ? ' low' : '')}>
      {low ? <TriangleAlert size={14} /> : <CircleCheck size={14} />}
      <div>
        <strong>{low ? 'Low resolution for print' : 'Print quality OK'}</strong>
        <span>{q.srcW} × {q.srcH} px original · {detail}</span>
      </div>
    </div>
  );
}

/* Contextual panel for the selected canvas node (photo piece or text block). */
export function Inspector({ engine, node, textareaRef }) {
  const isText = node.kind === 'text';
  const set = key => v => engine.updateNode(node.id, { [key]: v });

  return (
    <div className="selection">
      <div className="selection-head">
        {isText ? <Type size={15} /> : <ImageIcon size={15} />}
        <span>{isText ? 'Text' : 'Image'}</span>
        <button className="icon-btn" data-tip="Delete (Del)" aria-label="Remove" onClick={() => engine.removeSel()}>
          <Trash2 size={15} />
        </button>
      </div>

      {isText ? (
        <>
          <Field label="Content">
            <textarea
              ref={textareaRef} className="input textarea" rows={3} value={node.value}
              placeholder="Type here. Enter for a new line."
              onChange={e => engine.updateNode(node.id, { value: e.target.value })}
            />
          </Field>
          <div className="row">
            <Segmented
              label="Weight" value={node.bold}
              options={[[false, 'Regular'], [true, 'Bold']]}
              onChange={set('bold')}
            />
            <Segmented
              label="Style" value={node.italic}
              options={[[false, 'Normal'], [true, <i key="i">Italic</i>]]}
              onChange={set('italic')}
            />
          </div>
          <Slider label="Size" value={node.size} display={Math.round(node.size) + ' px'} min={8} max={400} step={1} onChange={set('size')} />
          <Segmented
            label="Align" value={node.align}
            options={[
              ['left', <AlignLeft key="l" size={15} />, 'Align left'],
              ['center', <AlignCenter key="c" size={15} />, 'Align center'],
              ['right', <AlignRight key="r" size={15} />, 'Align right'],
            ]}
            onChange={set('align')}
          />
          <Slider label="Letter spacing" value={node.ls} display={f(node.ls, 2)} min={-0.1} max={0.6} step={0.01} onChange={set('ls')} />
          <Slider label="Line height" value={node.lh} display={f(node.lh, 2)} min={0.7} max={2} step={0.01} onChange={set('lh')} />
          <div className="row">
            <Segmented
              label="Box width" value={node.boxW ? 'fixed' : 'auto'}
              options={[['auto', 'Auto'], ['fixed', 'Fixed']]}
              onChange={v => engine.updateNode(node.id, { boxW: v === 'fixed' ? Math.round(node.w) : null })}
            />
            {node.boxW ? (
              <NumberInput label="Width" value={Math.round(node.boxW)} min={10} max={6000} onChange={set('boxW')} />
            ) : <div className="field" />}
          </div>
          <Field label="Color">
            <Color label="Text color" value={node.color} onChange={set('color')} />
          </Field>
          <Toggle label="Uppercase" checked={node.upper} onChange={set('upper')} />
          <Toggle label="Connect cables" checked={node.cable} onChange={set('cable')} />
        </>
      ) : (
        <>
          <Segmented
            label="Treatment" value={node.treatment || 'original'}
            options={[['original', 'Color'], ['bw', 'B&W'], ['hc', 'High-con']]}
            onChange={v => engine.setSelTreatment(v)}
          />
          <Segmented
            label="Crop" value={node.aspect || 'free'}
            options={[['free', 'Free'], ['square', '1:1'], ['tall', '1:3'], ['wide', '3:1']]}
            onChange={v => engine.setSelAspect(v)}
          />
          <ImageQuality q={engine.imageQuality(node)} />
        </>
      )}

      <div className="row">
        <NumberInput label="X" value={Math.round(node.x)} min={-10000} max={10000} onChange={set('x')} />
        <NumberInput label="Y" value={Math.round(node.y)} min={-10000} max={10000} onChange={set('y')} />
      </div>

      <Field label="Rotation" value={f(node.rot || 0, 0) + '°'}>
        <div className="rotate-row">
          <button className="btn btn-outline" data-tip="Rotate −90°" aria-label="Rotate left 90 degrees" onClick={() => engine.rotateSel(-90)}><RotateCcw size={14} /></button>
          <WaveRange
            label="Rotation" value={node.rot || 0} min={-180} max={180} step={1}
            onChange={set('rot')} onDoubleClick={() => set('rot')(0)}
          />
          <button className="btn btn-outline" data-tip="Rotate +90°" aria-label="Rotate right 90 degrees" onClick={() => engine.rotateSel(90)}><RotateCw size={14} /></button>
        </div>
      </Field>

      <div className="row">
        <button className="btn btn-outline grow" onClick={() => engine.bump(1)}><ArrowUpToLine size={14} />Forward</button>
        <button className="btn btn-outline grow" onClick={() => engine.bump(-1)}><ArrowDownToLine size={14} />Backward</button>
      </div>
    </div>
  );
}
