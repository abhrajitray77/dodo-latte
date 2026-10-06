import { GIFEncoder, applyPalette, quantize } from '../vendor/gifenc/gifenc.js';

/**
 * Encode a looping GIF from a draw callback, a few frames per task so the page stays responsive.
 */
export async function encodeGif(opts: {
  width: number;
  height: number;
  frames: number;
  fps: number;
  draw: (ctx: CanvasRenderingContext2D, index: number) => void;
  onProgress?: (fraction: number) => void;
}): Promise<Blob> {
  const { width, height, frames, fps, draw, onProgress } = opts;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const gif = GIFEncoder();
  const delay = Math.round(1000 / fps);
  for (let i = 0; i < frames; i++) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    draw(ctx, i);
    const { data } = ctx.getImageData(0, 0, width, height);
    const palette = quantize(data, 256, { format: 'rgb565' });
    const index = applyPalette(data, palette, 'rgb565');
    gif.writeFrame(index, width, height, { palette, delay, repeat: 0 });
    onProgress?.((i + 1) / frames);
    if (i % 3 === 2) await new Promise((r) => setTimeout(r, 0));
  }
  gif.finish();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
