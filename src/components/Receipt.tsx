import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { CoffeeScene } from '../scene/CoffeeScene';
import type { PaperSim } from '../scene/PaperSim';
import Printer, { PRINTER_SLOT_Y, PRINTER_VIEW_W } from './Printer';
import { FILL, buttonQuiet, pill } from './ui';
import FillButton from './FillButton';
import { RECEIPT_HEIGHT, RECEIPT_WIDTH, drawReceiptBase, drawReceiptFrame, type ReceiptData } from '../receipt/draw';
import { encodeGif, downloadBlob } from '../receipt/gif';
import Polaroid from './Polaroid';
import { audio } from '../audio/engine';

export type ReceiptState = 'printing' | 'attached' | 'torn';
type State = ReceiptState;
const FPS = 10;
const HOLD_FRAMES = 10; // pause on the finished cup before the loop restarts
const PRINTER_TOP = typeof window !== 'undefined' && window.innerWidth < 768 ? 60 : 12;

/**
 * The receipt UI. The sheet itself is simulated and drawn by the scene (PaperSim); this component
 * draws the receipt image into an offscreen canvas, plays the time-lapse, and forwards the hand.
 */
export default function Receipt({
  data,
  scene,
  onAgain,
  onState,
}: {
  data: ReceiptData;
  scene: CoffeeScene;
  onAgain: () => void;
  onState?: (state: ReceiptState) => void;
}) {
  const paperRef = useRef<PaperSim | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setStateRaw] = useState<State>('printing');
  const setState = (s: State) => {
    setStateRaw(s);
    onState?.(s);
  };
  const dragging = useRef(false);
  const [cursor, setCursor] = useState<'default' | 'grab' | 'grabbing'>('default');
  const drawRef = useRef<((index: number) => void) | null>(null);
  const gifRef = useRef<Blob | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // as big as the screen allows, up to 1.4x the base design
  // the printer art is 100px wider than the paper and must fit the screen too
  const phone = window.innerWidth < 768;
  const scale = Math.min(phone ? 1 : 1.4, (window.innerWidth - 116) / RECEIPT_WIDTH, (window.innerHeight - (phone ? 330 : 150)) / RECEIPT_HEIGHT);
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
    document.fonts?.load('600 23px Caveat').then(() => drawReceiptBase(base.getContext('2d')!, data, RECEIPT_WIDTH, RECEIPT_HEIGHT, dpr)).catch(() => {});

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
    drawRef.current = draw;

    const paper = scene.showPaper(canvas, { width, height, slotY }, {
      onPrinted: () => setState('attached'),
      onTearStart: () => audio.rip(false),
      onTorn: () => {
        audio.rip(true);
        audio.bell(84, 0.25, 0.14, 1.2);
        setState('torn');
      },
    });
    audio.printer(2.5); // 0.3 s delay + 2.2 s feed in PaperSim
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
    if (!paperRef.current?.pointerDown(e.clientX, e.clientY)) return; // missed the sheet
    dragging.current = true;
    setCursor('grabbing');
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const paper = paperRef.current;
    if (!paper) return;
    if (dragging.current) paper.pointerMove(e.clientX, e.clientY);
    else setCursor(paper.hitTest(e.clientX, e.clientY) ? 'grab' : 'default');
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    dragging.current = false;
    paperRef.current?.pointerUp();
    setCursor(paperRef.current?.hitTest(e.clientX, e.clientY) ? 'grab' : 'default');
  };

  // the receipt as a looping GIF, at design size
  const makeGif = async () => {
    if (gifRef.current) return gifRef.current;
    const source = canvasRef.current;
    const draw = drawRef.current;
    if (!source || !draw) throw new Error('receipt not ready');
    const blob = await encodeGif({
      width: RECEIPT_WIDTH,
      height: RECEIPT_HEIGHT,
      frames: data.frames.length + HOLD_FRAMES,
      fps: FPS,
      draw: (ctx, i) => {
        draw(Math.min(i, data.frames.length - 1));
        ctx.fillStyle = '#e6cfa6';
        ctx.fillRect(0, 0, RECEIPT_WIDTH, RECEIPT_HEIGHT);
        ctx.drawImage(source, 0, 0, RECEIPT_WIDTH, RECEIPT_HEIGHT);
      },
      onProgress: (p) => setBusy(`Making GIF ${Math.round(p * 100)}%`),
    });
    gifRef.current = blob;
    return blob;
  };
  const gifName = `stir-receipt-${String(data.orderNo).padStart(4, '0')}.gif`;

  const downloadGif = async () => {
    if (busy) return;
    const blob = await makeGif();
    setBusy(null);
    downloadBlob(blob, gifName);
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
      className={`absolute inset-0 touch-none ${cursor === 'grabbing' ? 'cursor-grabbing' : cursor === 'grab' ? 'cursor-grab' : 'cursor-default'}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <Printer width={printerWidth} top={PRINTER_TOP} />

      <Polaroid data={data} visible={state === 'torn'} />

      {/* hints and actions */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <p className={`${pill} px-3 py-1.5 text-xs transition-opacity duration-500 md:hidden ${state === 'attached' ? 'opacity-100' : 'opacity-0'}`}>Grab the receipt and pull it off</p>
        <div className={`flex flex-wrap justify-center gap-3 transition-all duration-500 ${state === 'torn' ? 'pointer-events-auto translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
          <div className={`${pill} cursor-default gap-2 pl-4`} onPointerDown={(e) => e.stopPropagation()}>
            <span className="text-[14px] font-medium text-ink/70">Save receipt</span>
            <FillButton type="button" onClick={save} fill={FILL.ink} textOnFill={FILL.paper} className="rounded-full border-2 border-ink bg-paper-light px-4 py-2 text-[14px] font-medium">
              PNG
            </FillButton>
            <FillButton type="button" onClick={downloadGif} disabled={!!busy} fill={FILL.ink} textOnFill={FILL.paper} className="rounded-full border-2 border-ink bg-paper-light px-4 py-2 text-[14px] font-medium disabled:opacity-60">
              {busy ?? 'GIF'}
            </FillButton>
          </div>
          <FillButton type="button" onClick={onAgain} onPointerDown={(e) => e.stopPropagation()} fill={FILL.ink} textOnFill={FILL.paper} className={buttonQuiet}>
            Another cup
          </FillButton>
        </div>
      </div>
    </div>
  );
}
