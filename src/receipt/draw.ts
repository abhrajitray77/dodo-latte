/**
 * Draws the thermal receipt into a 2D canvas: paper, mono type, a dithered 1-bit still of the
 * recorded cup, the order lines and a barcode. Everything is in CSS px, scaled by dpr.
 */

export type ReceiptData = {
  frames: Uint8Array[];
  frameSize: number;
  stirFrom: number;
  strokes: number;
  pourSeconds: number;
  stirSeconds: number;
  size: string;
  flow: number;
  orderNo: number;
  date: Date;
};

export const RECEIPT_WIDTH = 300;
export const RECEIPT_HEIGHT = 640;
const PAD = 22;
const IMAGE = 200;
const IMAGE_Y = 128;
const TEAR = 12; // zigzag height at the top and bottom edges

export const PAPER = '#f4efe5';
const INK = '#17110d';
const FONT = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';

// 8x8 Bayer matrix, normalized to 0..1
const BAYER = (() => {
  const m = [
    [0, 32, 8, 40, 2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21],
  ];
  return m.map((row) => row.map((v) => (v + 0.5) / 64));
})();

const pad2 = (n: number) => String(n).padStart(2, '0');
const seconds = (s: number) => `${s.toFixed(1)} s`;

/** Share of the cup that is milk in a frame (bright pixels inside the disc). */
export function milkCoverage(frame: Uint8Array, size: number) {
  let inside = 0;
  let milk = 0;
  const r = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - r;
      const dy = y + 0.5 - r;
      if (dx * dx + dy * dy > r * r) continue;
      inside++;
      const i = (y * size + x) * 4;
      const lum = 0.2126 * frame[i] + 0.7152 * frame[i + 1] + 0.0722 * frame[i + 2];
      if (lum > 180) milk++;
    }
  }
  return inside ? milk / inside : 0;
}

function paperShape(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.beginPath();
  ctx.moveTo(0, TEAR);
  // top edge: teeth point up into the slot
  const teeth = 30;
  const w = width / teeth;
  for (let i = 0; i < teeth; i++) {
    ctx.lineTo((i + 0.5) * w, 0);
    ctx.lineTo((i + 1) * w, TEAR);
  }
  ctx.lineTo(width, height - TEAR);
  // bottom edge, right to left
  for (let i = teeth; i > 0; i--) {
    ctx.lineTo((i - 0.5) * w, height);
    ctx.lineTo((i - 1) * w, height - TEAR);
  }
  ctx.closePath();
}

function dashedRule(ctx: CanvasRenderingContext2D, y: number, width: number) {
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(PAD, y + 0.5);
  ctx.lineTo(width - PAD, y + 0.5);
  ctx.stroke();
  ctx.restore();
}

function line(ctx: CanvasRenderingContext2D, left: string, right: string, y: number, width: number) {
  ctx.textAlign = 'left';
  ctx.fillText(left, PAD, y);
  ctx.textAlign = 'right';
  ctx.fillText(right, width - PAD, y);
}

/** Simple bar pattern seeded by the order number: looks like a barcode, scans as nothing. */
function barcode(ctx: CanvasRenderingContext2D, y: number, width: number, seed: number) {
  let s = seed * 2654435761 + 1;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const inner = width - PAD * 2;
  let x = PAD;
  ctx.fillStyle = INK;
  while (x < PAD + inner - 3) {
    const bar = 1 + Math.floor(rnd() * 3);
    ctx.fillRect(x, y, bar, 38);
    x += bar + 1 + Math.floor(rnd() * 3);
  }
}

/** Static parts of the receipt: paper, header, order lines, barcode. */
export function drawReceiptBase(ctx: CanvasRenderingContext2D, data: ReceiptData, width: number, height: number, dpr: number) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  // paper with a faint grain
  paperShape(ctx, width, height);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(60, 40, 20, 0.05)';
  let s = 7;
  for (let i = 0; i < 1400; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const x = (s >>> 8) % width;
    s = (s * 1664525 + 1013904223) >>> 0;
    const y = (s >>> 8) % height;
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.restore();

  ctx.fillStyle = INK;
  ctx.textBaseline = 'alphabetic';

  // header
  ctx.textAlign = 'center';
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText('CREMA CORNER', width / 2, 54);
  ctx.font = `600 23px Caveat, "Segoe Script", cursive`;
  ctx.fillText('Latte Art Bar', width / 2, 78);
  ctx.font = `11px ${FONT}`;
  const d = data.date;
  ctx.fillText(
    `COUNTER 01  ·  ${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}  ·  #${String(data.orderNo).padStart(4, '0')}`,
    width / 2,
    98,
  );
  dashedRule(ctx, 110, width);

  // image frame drawn later; a thin rim stays here for the cup
  const cx = width / 2;
  const cy = IMAGE_Y + IMAGE / 2;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, IMAGE / 2 - 0.5, 0, Math.PI * 2);
  ctx.stroke();

  let y = IMAGE_Y + IMAGE + 30;
  dashedRule(ctx, y - 14, width);
  ctx.font = `12px ${FONT}`;
  // measured on the finished art, just before the stir mixed it in
  const art = data.stirFrom > 0 ? data.frames[data.stirFrom - 1] : data.frames[data.frames.length - 1];
  const milk = art ? milkCoverage(art, data.frameSize) : 0;
  const rows: Array<[string, string]> = [
    ['POUR SIZE', data.size.toUpperCase()],
    ['FLOW', `${Math.round(data.flow * 100)}%`],
    ['STROKES', String(data.strokes)],
    ['POUR TIME', seconds(data.pourSeconds)],
    ['STIR TIME', seconds(data.stirSeconds)],
    ['MILK ON TOP', `${Math.round(milk * 100)}%`],
  ];
  for (const [l, r] of rows) {
    line(ctx, l, r, y + 6, width);
    y += 18;
  }
  dashedRule(ctx, y + 2, width);
  y += 24;
  ctx.font = `700 13px ${FONT}`;
  line(ctx, 'TOTAL', '1 LATTE', y, width);
  dashedRule(ctx, y + 12, width);

  y += 34;
  barcode(ctx, y, width, data.orderNo);
  ctx.font = `10px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(`${data.orderNo}${data.strokes}${Math.round(data.stirSeconds * 10)}`.padEnd(12, '0'), width / 2, y + 52);
  ctx.font = `11px ${FONT}`;
  ctx.fillText('THANK YOU. DRINK IT WHILE IT IS WARM.', width / 2, y + 78);
}

/**
 * One frame of the time-lapse as a 1-bit ordered dither inside the cup circle.
 * `scratch` is reused between calls to avoid allocations.
 */
export function drawReceiptFrame(
  ctx: CanvasRenderingContext2D,
  data: ReceiptData,
  index: number,
  width: number,
  dpr: number,
  scratch: { src: HTMLCanvasElement; big: HTMLCanvasElement },
) {
  const frame = data.frames[index];
  if (!frame) return;
  const n = data.frameSize;

  // frame rows come bottom-up from WebGL: flip while copying into ImageData
  const srcCtx = scratch.src.getContext('2d')!;
  const img = srcCtx.createImageData(n, n);
  for (let y = 0; y < n; y++) {
    const from = (n - 1 - y) * n * 4;
    img.data.set(frame.subarray(from, from + n * 4), y * n * 4);
  }
  srcCtx.putImageData(img, 0, 0);

  // scale up to device pixels, then dither
  const px = Math.round(IMAGE * dpr);
  const bigCtx = scratch.big.getContext('2d')!;
  bigCtx.imageSmoothingEnabled = true;
  bigCtx.clearRect(0, 0, px, px);
  bigCtx.drawImage(scratch.src, 0, 0, px, px);
  const out = bigCtx.getImageData(0, 0, px, px);
  const p = out.data;
  const r = px / 2;
  const paper = [244, 239, 229];
  const ink = [23, 17, 13];
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const i = (y * px + x) * 4;
      const dx = x + 0.5 - r;
      const dy = y + 0.5 - r;
      let c: number[];
      if (dx * dx + dy * dy > (r - 1.5) * (r - 1.5)) {
        c = paper;
      } else {
        // the scene shows the dye through an sRGB conversion, so match that before thresholding
        const lin = (0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2]) / 255;
        let v = Math.pow(lin, 1 / 2.2);
        v = (v - 0.25) / 0.7; // crema sits mid-gray, milk goes white
        c = v > BAYER[y & 7][x & 7] ? paper : ink;
      }
      p[i] = c[0];
      p[i + 1] = c[1];
      p[i + 2] = c[2];
      p[i + 3] = 255;
    }
  }
  bigCtx.putImageData(out, 0, 0);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.drawImage(scratch.big, (width - IMAGE) / 2, IMAGE_Y, IMAGE, IMAGE);

  // tiny recording readout under the image
  ctx.fillStyle = INK;
  ctx.font = `10px ${FONT}`;
  ctx.textAlign = 'center';
  const stage = data.stirFrom >= 0 && index >= data.stirFrom ? 'STIR' : 'POUR';
  ctx.fillText(`● REC  ${stage}  ${String(index + 1).padStart(3, '0')}/${String(data.frames.length).padStart(3, '0')}`, width / 2, IMAGE_Y + IMAGE + 12);
}
