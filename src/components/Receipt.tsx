import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { CoffeeScene } from '../scene/CoffeeScene';
import type { PaperSim } from '../scene/PaperSim';
import Printer, { PRINTER_SLOT_Y, PRINTER_VIEW_W } from './Printer';
import { RECEIPT_HEIGHT, RECEIPT_WIDTH, drawReceiptBase, drawReceiptFrame, type ReceiptData } from '../receipt/draw';

type State = 'printing' | 'attached' | 'torn';
const FPS = 10;
const HOLD_FRAMES = 10; // pause on the finished cup before the loop restarts
const PRINTER_TOP = 12;

const label = 'font-mono text-[11px] tracking-wide uppercase';

/**
 * The receipt UI. The sheet itself is simulated and drawn by the scene (PaperSim); this component
 * draws the receipt image into an offscreen canvas, plays the time-lapse, and forwards the hand.
 */
export default function Receipt({ data, scene, onAgain }: { data: ReceiptData; scene: CoffeeScene; onAgain: () => void }) {
  const paperRef = useRef<PaperSim | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<State>('printing');
  const dragging = useRef(false);

  // as big as the screen allows, up to 1.4x the base design
  const scale = Math.min(1.4, (window.innerWidth - 40) / RECEIPT_WIDTH, (window.innerHeight - 150) / RECEIPT_HEIGHT);
  const width = RECEIPT_WIDTH * scale;
  const height = RECEIPT_HEIGHT * scale;
  // the printer artwork is a little wider than the paper; the paper starts at its slot
  const printerWidth = width + 100;
  const slotY = PRINTER_TOP + (printerWidth / PRINTER_VIEW_W) * PRINTER_SLOT_Y;

  useEffect(() => {
    // render at the displayed size so the type stays crisp
    const dpr = Math.min((window.devicePixelRatio || 1) * scale, 3);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(RECEIPT_WIDTH * dpr);
    canvas.height = Math.round(RECEIPT_HEIGHT * dpr);
    canvasRef.current = canvas;
    const ctx = canvas.getContext('2d')!;

    const base = document.createElement('canvas');
    base.width = canvas.width;
    base.height = canvas.height;
    drawReceiptBase(base.getContext('2d')!, data, RECEIPT_WIDTH, RECEIPT_HEIGHT, dpr);

    const scratch = { src: document.createElement('canvas'), big: document.createElement('canvas') };
    scratch.src.width = scratch.src.height = data.frameSize;
    scratch.big.width = scratch.big.height = Math.round(200 * dpr);

    const draw = (index: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(base, 0, 0);
      drawReceiptFrame(ctx, data, Math.min(index, data.frames.length - 1), RECEIPT_WIDTH, dpr, scratch);
    };
    draw(0);

    const paper = scene.showPaper(canvas, { width, height, slotY }, {
      onPrinted: () => setState('attached'),
      onTorn: () => setState('torn'),
    });
    paperRef.current = paper;

    let raf = 0;
    let index = 0;
    let last = 0;
    const total = data.frames.length + HOLD_FRAMES;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < 1000 / FPS) return;
      last = t;
      draw(index);
      paper.markDirty();
      index = (index + 1) % total;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      scene.hidePaper();
      paperRef.current = null;
    };
  }, [data, scene, width, height, scale, slotY]);

  const onPointerDown = (e: ReactPointerEvent) => {
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    paperRef.current?.pointerDown(e.clientX, e.clientY);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (dragging.current) paperRef.current?.pointerMove(e.clientX, e.clientY);
  };
  const onPointerUp = () => {
    dragging.current = false;
    paperRef.current?.pointerUp();
  };

  const save = () => {
    canvasRef.current?.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stir-receipt-${String(data.orderNo).padStart(4, '0')}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  };

  return (
    <div
      className={`absolute inset-0 touch-none ${state === 'printing' ? 'cursor-wait' : 'cursor-grab active:cursor-grabbing'}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <Printer width={printerWidth} top={PRINTER_TOP} />

      {/* hints and actions */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <p className={`${label} transition-opacity duration-500 ${state === 'attached' ? 'opacity-70' : 'opacity-0'}`}>Grab the receipt and pull it off</p>
        <div className={`flex gap-2 transition-all duration-500 ${state === 'torn' ? 'pointer-events-auto translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
          <button type="button" onClick={save} onPointerDown={(e) => e.stopPropagation()} className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-sage hover:text-ink">
            Save receipt
          </button>
          <button type="button" onClick={onAgain} onPointerDown={(e) => e.stopPropagation()} className="rounded-full border border-ink/20 px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-ink/10">
            Another cup
          </button>
        </div>
      </div>
    </div>
  );
}
