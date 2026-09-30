import { useEffect, useRef } from 'react';
import { drawTexture, TEXTURES } from '../textures.js';
import { Field } from './Controls.jsx';

const TILE_W = 84, TILE_H = 34;

/* A short sagging cable drawn with the real texture code, so previews match the canvas. */
function Thumb({ textures, color }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = TILE_W * dpr; c.height = TILE_H * dpr;
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, TILE_W, TILE_H);
    ctx.strokeStyle = ctx.fillStyle = color;
    const rows = textures.length;
    textures.forEach((tex, i) => {
      const y = rows === 1 ? 11 : 7 + i * 9;
      const sag = rows === 1 ? 14 : 5;
      const segs = [[{ x: 8, y }, { x: 30, y: y + sag }, { x: 54, y: y + sag }, { x: TILE_W - 8, y: y + (rows === 1 ? 4 : 0) }]];
      drawTexture(ctx, segs, tex, { w: rows === 1 ? 2.2 : 1.4, density: 1, seed: 11 + i, light: '#ffffff' });
    });
  }, [textures, color]);
  return <canvas ref={ref} style={{ width: TILE_W, height: TILE_H }} aria-hidden="true" />;
}

const MIX_PREVIEW = ['braided', 'sketch', 'beaded'];

export function TexturePicker({ value, mix, color, onChange, onMixChange }) {
  const tiles = TEXTURES.concat([['mix', 'Mix']]);
  const toggleMix = id => {
    const next = mix.includes(id) ? mix.filter(t => t !== id) : mix.concat(id);
    if (next.length) onMixChange(TEXTURES.map(([t]) => t).filter(t => next.includes(t)));
  };
  return (
    <>
      <Field label="Texture" stack>
        <div className="texture-grid" role="radiogroup" aria-label="Cable texture">
          {tiles.map(([id, name]) => (
            <button
              key={id} type="button" role="radio" aria-checked={value === id}
              className={'texture-tile' + (value === id ? ' active' : '')}
              onClick={() => onChange(id)}
            >
              <Thumb textures={id === 'mix' ? MIX_PREVIEW : [id]} color={color} />
              <span>{name}</span>
            </button>
          ))}
        </div>
      </Field>
      {value === 'mix' && (
        <Field label="Mix includes" stack>
          <div className="chips">
            {TEXTURES.map(([id, name]) => {
              const on = mix.includes(id);
              return (
                <button
                  key={id} type="button" aria-pressed={on}
                  className={'chip-toggle' + (on ? ' on' : '')}
                  onClick={() => toggleMix(id)}
                  title={on && mix.length === 1 ? 'At least one texture stays in the mix' : undefined}
                >
                  <span className="box-mark" aria-hidden="true" />{name}
                </button>
              );
            })}
          </div>
        </Field>
      )}
    </>
  );
}
