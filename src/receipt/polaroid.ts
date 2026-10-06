import type { ReceiptData } from './draw';

/**
 * The polaroid: the recorded cup in full colour, drawn top-down in the inked style
 * (jade rim, ink outlines) inside a white instant-photo frame. Design units below, scaled by dpr.
 */
export const POLAROID_W = 320;
export const POLAROID_H = 390;
const PAD = 16;
const IMAGE = POLAROID_W - PAD * 2; // 288

const INK = '#2b1d12';
const JADE = '#9fbb9a';
const FRAME = '#f8f3ea';
const TABLE = '#e6cfa6';
const FONT = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';

// the dye frames are linear; the screen shows them through an sRGB conversion
const TO_SRGB = new Uint8ClampedArray(256);
for (let i = 0; i < 256; i++) TO_SRGB[i] = Math.round(255 * Math.pow(i / 255, 1 / 2.2));

/** Convert one recorded frame (bottom-up, linear) into an upright sRGB image on `scratch`. */
export function frameToCanvas(frame: Uint8Array, size: number, scratch: HTMLCanvasElement) {
  const ctx = scratch.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const out = img.data;
  for (let y = 0; y < size; y++) {
    const from = (size - 1 - y) * size * 4;
    const to = y * size * 4;
    for (let i = 0; i < size * 4; i += 4) {
      out[to + i] = TO_SRGB[frame[from + i]];
      out[to + i + 1] = TO_SRGB[frame[from + i + 1]];
      out[to + i + 2] = TO_SRGB[frame[from + i + 2]];
      out[to + i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Top-down cup: jade rim with ink outlines, the coffee disc filled from the recording. */
export function drawCupTop(ctx: CanvasRenderingContext2D, scratch: HTMLCanvasElement, cx: number, cy: number, radius: number) {
  ctx.save();
  ctx.lineJoin = 'round';
  // rim
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = JADE;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // handle, peeking out on the right
  ctx.beginPath();
  ctx.ellipse(cx + radius * 1.02, cy, radius * 0.22, radius * 0.3, 0, -Math.PI / 2, Math.PI / 2);
  ctx.lineWidth = radius * 0.11;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = radius * 0.11 - 5;
  ctx.strokeStyle = JADE;
  ctx.stroke();
  // coffee
  const r = radius * 0.86;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(scratch, cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();
}

export function drawPolaroid(ctx: CanvasRenderingContext2D, data: ReceiptData, index: number, scratch: HTMLCanvasElement, dpr: number) {
  const frame = data.frames[Math.min(index, data.frames.length - 1)];
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, POLAROID_W, POLAROID_H);

  // the photo frame
  ctx.fillStyle = FRAME;
  ctx.fillRect(0, 0, POLAROID_W, POLAROID_H);
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.strokeRect(1, 1, POLAROID_W - 2, POLAROID_H - 2);

  // the picture: the cup on the table
  ctx.fillStyle = TABLE;
  ctx.fillRect(PAD, PAD, IMAGE, IMAGE);
  if (frame) {
    frameToCanvas(frame, data.frameSize, scratch);
    drawCupTop(ctx, scratch, PAD + IMAGE / 2 - 10, PAD + IMAGE / 2, IMAGE * 0.4);
  }
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.strokeRect(PAD, PAD, IMAGE, IMAGE);

  // caption
  ctx.fillStyle = INK;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = `500 15px "Apfel Grotezk", Inter, ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText('my latte, stirred', PAD, POLAROID_H - 38);
  ctx.font = `11px ${FONT}`;
  ctx.fillStyle = 'rgba(43,29,18,0.65)';
  const d = data.date;
  const stage = data.stirFrom >= 0 && index >= data.stirFrom ? 'STIR' : 'POUR';
  ctx.fillText(`#${String(data.orderNo).padStart(4, '0')}  ${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`, PAD, POLAROID_H - 18);
  ctx.textAlign = 'right';
  ctx.fillText(`● ${stage} ${String(Math.min(index, data.frames.length - 1) + 1).padStart(3, '0')}`, POLAROID_W - PAD, POLAROID_H - 18);
  ctx.font = `500 15px "Apfel Grotezk", Inter, ui-sans-serif, system-ui, sans-serif`;
  ctx.fillStyle = INK;
  ctx.fillText('stir', POLAROID_W - PAD, POLAROID_H - 38);
}
