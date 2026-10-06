import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CoffeeScene, type BrushSize } from '../scene/CoffeeScene';
import Receipt, { type ReceiptState } from './Receipt';
import Beans from './Beans';
import NoteCard from './NoteCard';
import { FILL, buttonAccent, buttonPrimary, card, groupLabel, iconButton, pill } from './ui';
import FillButton from './FillButton';
import type { ReceiptData } from '../receipt/draw';

type Phase = 'hero' | 'gliding' | 'art' | 'stir' | 'receipt';

const BRUSHES: Array<{ id: BrushSize; dot: number; name: string }> = [
  { id: 's', dot: 5, name: 'Thin' },
  { id: 'm', dot: 8, name: 'Medium' },
  { id: 'l', dot: 12, name: 'Wide' },
  { id: 'xl', dot: 17, name: 'Heavy' },
];

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[1.8]" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

const UndoIcon = () => (
  <Icon>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Icon>
);
const RedoIcon = () => (
  <Icon>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </Icon>
);

const STEP_NAMES: Partial<Record<Phase, string>> = { art: 'Pour', stir: 'Stir', receipt: 'Receipt' };

/*
  The note card wanders as you move through the steps, always hugging the cup. The cup's size on
  screen follows the viewport height, so the spots are measured from the centre in vh:
  hero: just past the handle; pour: against the left rim; stir: against the right rim;
  receipt: beside the paper. Each spot is clamped so the card never leaves the screen.
*/
type CardSpot = 'hero' | 'art' | 'stir' | 'receipt';
const CARD_WIDTH = 300;
const EDGE = `calc(100vw - ${CARD_WIDTH}px - 1.25rem)`;
const CARD_SPOT: Record<CardSpot, string> = {
  hero: `translate(min(calc(50vw + 46vh), ${EDGE}), 30vh) rotate(2deg)`,
  art: `translate(max(1.25rem, calc(50vw - 48vh - ${CARD_WIDTH + 12}px)), 26vh) rotate(-2deg)`,
  stir: `translate(min(calc(50vw + 48vh + 12px), ${EDGE}), 26vh) rotate(1.5deg)`,
  receipt: `translate(max(1.25rem, calc(50vw - 240px - ${CARD_WIDTH + 24}px)), 32vh) rotate(-2deg)`,
};
const STEP_INDEX: Partial<Record<Phase, string>> = { art: '01', stir: '02', receipt: '03' };

export default function Experience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<CoffeeScene | null>(null);
  const [phase, setPhase] = useState<Phase>('hero');
  const [active, setActive] = useState(false);
  const [history, setHistory] = useState({ undo: false, redo: false });
  const [brush, setBrush] = useState<BrushSize>('xl');
  const [flow, setFlow] = useState(0.5);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [cardSpot, setCardSpot] = useState<CardSpot>('hero');
  const [receiptState, setReceiptState] = useState<ReceiptState>('printing');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new CoffeeScene(canvas);
    scene.setPointerListener(setActive);
    scene.setHistoryListener((undo, redo) => setHistory({ undo, redo }));
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // keyboard: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        sceneRef.current?.undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        sceneRef.current?.redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const changeFlow = (value: number) => {
    setFlow(value);
    sceneRef.current?.setFlow(value);
  };

  const pickBrush = (size: BrushSize) => {
    setBrush(size);
    sceneRef.current?.setBrushSize(size);
  };

  const start = async () => {
    const scene = sceneRef.current;
    if (!scene || phase !== 'hero') return;
    setPhase('gliding');
    setCardSpot('art'); // the card travels while the camera glides
    scene.resetCoffee();
    await scene.setMode('top');
    setPhase('art');
    scene.setFlow(flow);
    scene.setBrushSize(brush);
    scene.setInteraction('paint');
  };

  const stir = () => {
    sceneRef.current?.setInteraction('stir');
    setActive(false);
    setPhase('stir');
    setCardSpot('stir');
  };

  const printReceipt = () => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setInteraction('none');
    setActive(false);
    setReceipt({ ...scene.getReceiptData(), orderNo: 1 + Math.floor(Math.random() * 9000), date: new Date() });
    setReceiptState('printing');
    setPhase('receipt');
    setCardSpot('receipt');
  };

  const back = async () => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setInteraction('none');
    setReceipt(null);
    setPhase('gliding');
    setCardSpot('hero');
    await scene.setMode('hero');
    setPhase('hero');
  };

  const inStep = phase === 'art' || phase === 'stir' || phase === 'receipt';

  return (
    <main className="relative h-dvh w-full select-none overflow-hidden bg-paper-strokes font-display text-ink">
      {/* Big type sits behind the canvas, so the cup floats in front of it */}
      <h1
        aria-hidden={phase !== 'hero'}
        className={`pointer-events-none absolute top-11 left-4 origin-top-left text-left text-[32vw] leading-[0.8] font-medium tracking-[-0.06em] transition-all duration-700 ease-out md:top-14 md:left-7 md:text-[22vw] ${
          phase === 'hero' ? 'opacity-100 blur-0' : 'scale-110 opacity-0 blur-sm'
        }`}
      >
        stir
      </h1>

      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* Beans on the table, hero only (they would sit over the cup in the top view) */}
      <Beans className={`transition-opacity duration-700 ${phase === 'hero' || phase === 'gliding' ? 'opacity-100' : 'opacity-0'}`} />

      {/* Steam: three inked curls rising from the cup, hero only */}
      <svg
        aria-hidden
        viewBox="0 0 120 160"
        className={`steam pointer-events-none absolute left-1/2 top-[22%] h-40 w-[120px] -translate-x-1/2 transition-opacity duration-700 ${phase === 'hero' ? 'opacity-100' : 'opacity-0'}`}
      >
        <path d="M40 150c-14-22 16-34 2-58-12-20 8-30 6-46" />
        <path d="M62 156c-16-26 18-40 0-66-12-18 10-30 4-50" />
        <path d="M84 150c-12-20 14-32 2-56-10-18 6-28 2-42" />
      </svg>

      {/* Top bar */}
      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-5 md:p-7">
        <div className="text-[15px] leading-tight">
          <span className="font-medium">Stir</span>
          <span className="text-ink/60"> · a tiny latte toy</span>
        </div>
        <div className={`${pill} px-3.5 py-1.5 text-[13px] font-medium`}>
          {inStep ? (
            <>
              <span className="h-2.5 w-2.5 rounded-full border-2 border-ink bg-sage" />
              <span>
                Step {STEP_INDEX[phase]} of 03 <span className="text-ink/50">·</span> {STEP_NAMES[phase]}
              </span>
            </>
          ) : (
            <span>Made with milk + WebGL</span>
          )}
        </div>
      </header>

      {(phase === 'art' || phase === 'stir') && (
        <FillButton type="button" onClick={back} fill={FILL.faint} className={`${pill} absolute top-[4.25rem] left-5 px-4 py-2 text-[14px] font-medium md:top-20 md:left-7`}>
          <Icon>
            <path d="M15 5l-7 7 7 7" />
          </Icon>
          Back
        </FillButton>
      )}

      {/* Hero call to action */}
      <div
        className={`absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 p-8 pb-[max(2rem,env(safe-area-inset-bottom))] transition-all duration-500 ${
          phase === 'hero' ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
        }`}
      >
        <p className="text-[17px] text-ink/80">Make your own latte, then keep the receipt.</p>
        <FillButton type="button" onClick={start} fill={FILL.sage} textOnFill={FILL.ink} className={`${buttonPrimary} px-10 py-4 text-lg focus-visible:ring-2 focus-visible:ring-sage focus-visible:outline-none`}>
          Start pouring
        </FillButton>
      </div>

      {/* The travelling note card: one spot per step, content crossfades as it moves */}
      <div
        className={`pointer-events-none absolute top-0 left-0 hidden transition-[transform,opacity] duration-700 ease-[cubic-bezier(.2,.8,.2,1)] md:block ${
          phase === 'receipt' && receiptState === 'torn' ? 'opacity-0' : 'opacity-100'
        }`}
        style={{ width: CARD_WIDTH, transform: CARD_SPOT[cardSpot] }}
      >
        <div className={`transition-opacity duration-500 ${cardSpot === 'hero' ? 'opacity-100' : 'absolute inset-x-0 top-0 opacity-0'}`}>
          <NoteCard title="How it works" tilt={0} pin="#9fbb9a">
            <ol className="space-y-2">
              <li>
                <span className="font-mono text-[13px] text-[#c96a3d]">01 </span>Pour milk onto the coffee and shape your latte art.
              </li>
              <li>
                <span className="font-mono text-[13px] text-[#c96a3d]">02 </span>Stir it in with your finger.
              </li>
              <li>
                <span className="font-mono text-[13px] text-[#c96a3d]">03 </span>Print the receipt and tear it off. It holds a time-lapse of your cup.
              </li>
            </ol>
          </NoteCard>
        </div>
        <div className={`transition-opacity duration-500 ${cardSpot === 'art' ? 'opacity-100' : 'absolute inset-x-0 top-0 opacity-0'}`}>
          <NoteCard step="STEP 01" title="Pour the milk" tint="jade" tilt={0}>
            <p>Press and drag on the coffee to pour.</p>
            <p>Pause in one place for a round blob. Wiggle side to side for leaves. A quick, thin pull through the middle makes the point.</p>
            <p className="text-[13px] text-ink/60">Ctrl + Z undoes a stroke.</p>
          </NoteCard>
        </div>
        <div className={`transition-opacity duration-500 ${cardSpot === 'stir' ? 'opacity-100' : 'absolute inset-x-0 top-0 opacity-0'}`}>
          <NoteCard step="STEP 02" title="Stir it in" tint="peach" tilt={0} pin="#9fbb9a">
            <p>Drag in circles to swirl the milk through the coffee.</p>
            <p>Stop whenever you like the pattern, then print your receipt.</p>
          </NoteCard>
        </div>
        <div className={`transition-opacity duration-500 ${cardSpot === 'receipt' ? 'opacity-100' : 'absolute inset-x-0 top-0 opacity-0'}`}>
          <NoteCard step="STEP 03" title="Tear it off" tilt={0} pin="#c96a3d">
            <p>
              {receiptState === 'printing'
                ? 'Your receipt is printing. It holds a time-lapse of your cup.'
                : 'Grab the paper and pull it down or sideways. Pull a little harder and it rips clean off.'}
            </p>
          </NoteCard>
        </div>
      </div>

      {/* Latte art controls */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] transition-all duration-500 md:p-7 ${
          phase === 'art' ? 'translate-y-0 opacity-100 [&>*]:pointer-events-auto' : 'translate-y-6 opacity-0'
        }`}
      >
        <p className={`${pill} px-4 py-2 text-[14px] md:hidden`}>Press and drag to pour. Wiggle for leaves. Pull through for the point.</p>
        <div className={`${card} flex flex-wrap items-end justify-center gap-x-6 gap-y-4 px-5 py-4`}>
          <div>
            <span className={groupLabel}>History</span>
            <div className="flex items-center gap-1 rounded-full border-2 border-ink p-1">
              <FillButton type="button" fill={FILL.faint} className={iconButton} onClick={() => sceneRef.current?.undo()} disabled={!history.undo} aria-label="Undo" title="Undo (Ctrl+Z)">
                <UndoIcon />
              </FillButton>
              <FillButton type="button" fill={FILL.faint} className={iconButton} onClick={() => sceneRef.current?.redo()} disabled={!history.redo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
                <RedoIcon />
              </FillButton>
              <FillButton type="button" fill={FILL.faint} className={iconButton} onClick={() => sceneRef.current?.clearArt()} aria-label="Clear the cup" title="Clear the cup">
                <Icon>
                  <path d="M4 7h16" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
                  <path d="M9 7V4h6v3" />
                </Icon>
              </FillButton>
            </div>
          </div>

          <div>
            <span className={groupLabel}>Pour size</span>
            <div className="flex items-center gap-1 rounded-full border-2 border-ink p-1" role="radiogroup" aria-label="Pour size">
              {BRUSHES.map((b) => (
                <FillButton
                  key={b.id}
                  type="button"
                  role="radio"
                  aria-checked={brush === b.id}
                  aria-label={b.name}
                  title={b.name}
                  onClick={() => pickBrush(b.id)}
                  fill={FILL.faint}
                  className={`grid h-10 w-10 place-items-center rounded-full transition-colors duration-200 ${brush === b.id ? 'bg-ink text-paper' : ''}`}
                >
                  <span className="rounded-full bg-current" style={{ width: b.dot, height: b.dot }} />
                </FillButton>
              ))}
            </div>
          </div>

          <div>
            <span className={groupLabel}>
              Flow <span className="font-mono text-ink/50">{Math.round(flow * 100)}%</span>
            </span>
            <label className="flex h-12 items-center rounded-full border-2 border-ink px-4">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={flow}
                onChange={(e) => changeFlow(Number(e.target.value))}
                className="w-32 cursor-pointer accent-sage md:w-40"
                aria-label="Pour flow"
              />
            </label>
          </div>

          <FillButton type="button" onClick={stir} fill={FILL.ink} textOnFill={FILL.paper} className={`${buttonAccent} h-12 py-0`}>
            Stir it
            <span aria-hidden>→</span>
          </FillButton>
        </div>
      </div>

      {/* Stir controls */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] transition-all duration-500 md:p-7 ${
          phase === 'stir' ? 'translate-y-0 opacity-100 [&>*]:pointer-events-auto' : 'translate-y-6 opacity-0'
        }`}
      >
        <p className={`${pill} px-4 py-2 text-[14px] transition-opacity duration-500 md:hidden ${active ? 'opacity-0' : 'opacity-100'}`}>Drag in circles to stir</p>
        <div className={`${card} flex flex-wrap items-end justify-center gap-x-6 gap-y-4 px-5 py-4`}>
          <div>
            <span className={groupLabel}>History</span>
            <div className="flex items-center gap-1 rounded-full border-2 border-ink p-1">
              <FillButton type="button" fill={FILL.faint} className={iconButton} onClick={() => sceneRef.current?.undo()} disabled={!history.undo} aria-label="Undo" title="Undo (Ctrl+Z)">
                <UndoIcon />
              </FillButton>
              <FillButton type="button" fill={FILL.faint} className={iconButton} onClick={() => sceneRef.current?.redo()} disabled={!history.redo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
                <RedoIcon />
              </FillButton>
            </div>
          </div>
          <FillButton type="button" onClick={printReceipt} fill={FILL.ink} textOnFill={FILL.paper} className={`${buttonAccent} h-12 py-0`}>
            Print receipt
            <span aria-hidden>→</span>
          </FillButton>
        </div>
      </div>

      {/* Receipt: the scene dims and a sheet of paper prints from the printer (drawn by the scene) */}
      {phase === 'receipt' && receipt && sceneRef.current && <Receipt data={receipt} scene={sceneRef.current} onAgain={back} onState={setReceiptState} />}
    </main>
  );
}
