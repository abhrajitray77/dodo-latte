import { useEffect, useRef, useState } from 'react';
import type { ReceiptData } from '../receipt/draw';
import { POLAROID_H, POLAROID_W, drawPolaroid } from '../receipt/polaroid';
import { encodeGif, downloadBlob } from '../receipt/gif';
import FillButton from './FillButton';
import { FILL, buttonPrimary, buttonQuiet } from './ui';

const FPS = 10;
const HOLD_FRAMES = 10;

/**
 * An instant photo of the whole creation in colour, playing on a loop, with a Download GIF button.
 * Appears beside the torn-off receipt.
 */
export default function Polaroid({ data, visible }: { data: ReceiptData; visible: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const gifRef = useRef<Blob | null>(null);

  const scale = Math.min(1, (window.innerWidth - 40) / POLAROID_W);
  const width = POLAROID_W * scale;
  const height = POLAROID_H * scale;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min((window.devicePixelRatio || 1) * scale, 3);
    canvas.width = Math.round(POLAROID_W * dpr);
    canvas.height = Math.round(POLAROID_H * dpr);
    const ctx = canvas.getContext('2d')!;
    const scratch = document.createElement('canvas');
    scratch.width = scratch.height = data.frameSize;

    let raf = 0;
    let index = 0;
    let last = 0;
    const total = data.frames.length + HOLD_FRAMES;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < 1000 / FPS) return;
      last = t;
      drawPolaroid(ctx, data, index, scratch, dpr);
      index = (index + 1) % total;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [data, scale]);

  const makeGif = async () => {
    if (gifRef.current) return gifRef.current;
    const scratch = document.createElement('canvas');
    scratch.width = scratch.height = data.frameSize;
    const blob = await encodeGif({
      width: POLAROID_W,
      height: POLAROID_H,
      frames: data.frames.length + HOLD_FRAMES,
      fps: FPS,
      draw: (ctx, i) => drawPolaroid(ctx, data, i, scratch, 1),
      onProgress: (p) => setBusy(`Making GIF ${Math.round(p * 100)}%`),
    });
    gifRef.current = blob;
    return blob;
  };

  const filename = `stir-latte-${String(data.orderNo).padStart(4, '0')}.gif`;

  const download = async () => {
    if (busy) return;
    const blob = await makeGif();
    setBusy(null);
    downloadBlob(blob, filename);
  };

  return (
    <div
      className={`absolute right-[5%] top-1/2 hidden w-[320px] -translate-y-1/2 cursor-default flex-col items-center gap-4 transition-all duration-700 ease-[cubic-bezier(.2,.8,.2,1)] md:flex ${
        visible ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-10 opacity-0'
      }`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="relative rotate-[3deg] shadow-[8px_10px_0_0_#c9a97c]">
        {/* a bit of tape */}
        <span aria-hidden className="absolute -top-3 left-1/2 h-6 w-24 -translate-x-1/2 -rotate-3 rounded-sm border border-ink/30 bg-[#f1e0bf]/80" />
        <canvas ref={canvasRef} style={{ width, height }} className="block" aria-label="A looping picture of your latte" />
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <FillButton type="button" onClick={download} disabled={!!busy} fill={FILL.sage} textOnFill={FILL.ink} className={`${buttonPrimary} disabled:opacity-60`}>
          {busy ?? 'Download GIF'}
        </FillButton>
      </div>
    </div>
  );
}
