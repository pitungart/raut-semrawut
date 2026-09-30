/* Print output helpers: paper sizes for the presets, output DPI, and writing the DPI into
   exported PNG (pHYs chunk) and JPEG (JFIF density) files so layout and print software
   open them at the right physical size. */

// Paper size in millimetres for presets that map to a real print format.
export const PAPER_MM = { a4: [210, 297], a3: [297, 420] };

export function outputInfo(s) {
  const k = s.exportScale || 1;
  const w = Math.round(s.canvasW * k), h = Math.round(s.canvasH * k);
  const paper = PAPER_MM[s.preset];
  const dpi = paper ? Math.round(w / (paper[0] / 25.4)) : null;
  return { w, h, dpi, paper: paper ? s.preset.toUpperCase() : null };
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngWithDpi(buf, dpi) {
  const src = new Uint8Array(buf);
  const text = new TextDecoder('latin1').decode(src.subarray(0, Math.min(src.length, 4096)));
  if (text.includes('pHYs')) return src;
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1; // unit: metre
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));
  const at = 33; // signature (8) + IHDR chunk (25)
  const out = new Uint8Array(src.length + chunk.length);
  out.set(src.subarray(0, at)); out.set(chunk, at); out.set(src.subarray(at), at + chunk.length);
  return out;
}

function jpegWithDpi(buf, dpi) {
  const b = new Uint8Array(buf);
  const isJfif = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff && b[3] === 0xe0 &&
    b[6] === 0x4a && b[7] === 0x46 && b[8] === 0x49 && b[9] === 0x46 && b[10] === 0;
  if (!isJfif) return b;
  b[13] = 1; // unit: dots per inch
  b[14] = dpi >> 8; b[15] = dpi & 255; b[16] = dpi >> 8; b[17] = dpi & 255;
  return b;
}

export async function withDpi(blob, dpi) {
  if (!dpi) return blob;
  const buf = await blob.arrayBuffer();
  const bytes = blob.type === 'image/png' ? pngWithDpi(buf, dpi) : blob.type === 'image/jpeg' ? jpegWithDpi(buf, dpi) : new Uint8Array(buf);
  return new Blob([bytes], { type: blob.type });
}
