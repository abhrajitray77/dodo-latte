import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CoffeeScene, type BrushSize } from '../scene/CoffeeScene';
import Receipt from './Receipt';
import type { ReceiptData } from '../receipt/draw';

type Phase = 'hero' | 'gliding' | 'art' | 'stir' | 'receipt';
const label = 'font-mono text-[11px] tracking-wide uppercase';

const BRUSHES: Array<{ id: BrushSize; dot: number }> = [
  { id: 's', dot: 4 },
  { id: 'm', dot: 7 },
  { id: 'l', dot: 11 },
  { id: 'xl', dot: 16 },
];

const pill = 'flex items-center gap-1.5 rounded-full border border-cream/10 bg-espresso/85 p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur';
const iconButton = 'grid h-9 w-9 place-items-center rounded-full transition-colors duration-200 hover:bg-cream/5 disabled:opacity-30 disabled:hover:bg-transparent';

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

export default function Experience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<CoffeeScene | null>(null);
  const [phase, setPhase] = useState<Phase>('hero');
  const [active, setActive] = useState(false);
  const [history, setHistory] = useState({ undo: false, redo: false });
  const [brush, setBrush] = useState<BrushSize>('xl');
  const [flow, setFlow] = useState(0.5);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

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
  };

  const printReceipt = () => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setInteraction('none');
    setActive(false);
    setReceipt({ ...scene.getReceiptData(), orderNo: 1 + Math.floor(Math.random() * 9000), date: new Date() });
    setPhase('receipt');
  };

  const back = async () => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setInteraction('none');
    setReceipt(null);
    setPhase('gliding');
    await scene.setMode('hero');
    setPhase('hero');
  };

  const hint =
    phase === 'stir' ? 'Drag in circles to stir' : 'Hold still for a circle, wiggle for leaves, a quick thin pull for the point';

  return (
    <main className="relative h-dvh w-full select-none overflow-hidden bg-roast-glow font-display text-cream">
      {/* Lamp from the top right: a hot core and a wide warm spill. Brighter in the hero. */}
      <div aria-hidden className={`lamp-spill pointer-events-none absolute inset-0 transition-opacity duration-1000 ${phase === 'hero' ? 'opacity-100' : 'opacity-60'}`} />
      <div aria-hidden className={`lamp-core pointer-events-none absolute inset-0 transition-opacity duration-1000 ${phase === 'hero' ? 'opacity-100' : 'opacity-50'}`} />

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

      {/* Top bar */}
      <header className={`pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-5 md:p-8 ${label}`}>
        <span>Stir / a tiny latte toy</span>
        <span className="text-right opacity-60">
          {phase === 'art' ? 'step 01 / latte art' : phase === 'stir' ? 'step 02 / stir' : phase === 'receipt' ? 'step 03 / receipt' : 'made with milk + webgl'}
        </span>
      </header>

      {(phase === 'art' || phase === 'stir') && (
        <button type="button" onClick={back} className={`absolute top-14 left-5 underline-offset-4 hover:underline md:top-16 md:left-8 ${label}`}>
          Back
        </button>
      )}

      {/* Hero call to action */}
      <div
        className={`absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-8 pb-[max(2rem,env(safe-area-inset-bottom))] transition-all duration-500 ${
          phase === 'hero' ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
        }`}
      >
        <p className={`${label} opacity-60`}>Make your own latte</p>
        <button
          type="button"
          onClick={start}
          className="rounded-full bg-cream px-8 py-3 text-lg font-medium text-espresso transition-colors duration-200 hover:bg-caramel hover:text-cream focus-visible:ring-2 focus-visible:ring-caramel focus-visible:outline-none"
        >
          Start
        </button>
      </div>

      {/* Latte art tray */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] transition-all duration-500 md:p-8 ${
          phase === 'art' ? 'translate-y-0 opacity-100 [&>div]:pointer-events-auto' : 'translate-y-6 opacity-0'
        }`}
      >
        <p className={`${label} opacity-60`}>{hint}</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <div className={pill}>
            <button type="button" className={iconButton} onClick={() => sceneRef.current?.undo()} disabled={!history.undo} aria-label="Undo" title="Undo (Ctrl+Z)">
              <Icon><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></Icon>
            </button>
            <button type="button" className={iconButton} onClick={() => sceneRef.current?.redo()} disabled={!history.redo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
              <Icon><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></Icon>
            </button>
            <button type="button" className={iconButton} onClick={() => sceneRef.current?.clearArt()} aria-label="Clear latte art" title="Clear">
              <Icon><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" /><path d="M9 7V4h6v3" /></Icon>
            </button>
          </div>
          <div className={pill} role="radiogroup" aria-label="Pour size">
            {BRUSHES.map((b) => (
              <button
                key={b.id}
                type="button"
                role="radio"
                aria-checked={brush === b.id}
                aria-label={`Pour ${b.id.toUpperCase()}`}
                onClick={() => pickBrush(b.id)}
                className={`grid h-9 w-9 place-items-center rounded-full transition-colors duration-200 ${brush === b.id ? 'bg-cream text-espresso' : 'hover:bg-cream/5'}`}
              >
                <span className="rounded-full bg-current" style={{ width: b.dot, height: b.dot }} />
              </button>
            ))}
          </div>
          <label className={`${pill} gap-3 px-4`}>
            <span className={`${label} opacity-70`}>Flow</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={flow}
              onChange={(e) => changeFlow(Number(e.target.value))}
              className="h-9 w-28 cursor-pointer accent-caramel md:w-36"
              aria-label="Pour flow"
            />
          </label>
        </div>
        <div className={pill}>
          <button
            type="button"
            onClick={stir}
            className="rounded-full bg-caramel px-4 py-2 text-sm font-medium text-cream transition-transform duration-200 hover:scale-[1.03] disabled:opacity-50 md:px-5"
          >
            Stir it
          </button>
        </div>
      </div>

      {/* Stir hint + print */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-8 pb-[max(2rem,env(safe-area-inset-bottom))] transition-all duration-500 ${
          phase === 'stir' ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
        }`}
      >
        <p className={`${label} transition-opacity duration-500 ${active ? 'opacity-0' : 'opacity-60'}`}>{hint}</p>
        <div className={`${pill} ${phase === 'stir' ? 'pointer-events-auto' : ''}`}>
          <button
            type="button"
            onClick={printReceipt}
            className="rounded-full bg-caramel px-4 py-2 text-sm font-medium text-cream transition-transform duration-200 hover:scale-[1.03] md:px-5"
          >
            Print receipt
          </button>
        </div>
      </div>
      {phase === 'stir' && (
        <div className={`absolute right-5 bottom-5 md:right-8 md:bottom-8 ${pill}`}>
          <button type="button" className={iconButton} onClick={() => sceneRef.current?.undo()} disabled={!history.undo} aria-label="Undo" title="Undo (Ctrl+Z)">
            <Icon><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></Icon>
          </button>
          <button type="button" className={iconButton} onClick={() => sceneRef.current?.redo()} disabled={!history.redo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
            <Icon><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></Icon>
          </button>
        </div>
      )}

      {/* Receipt: the scene dims and a sheet of paper prints from a slot at the top (drawn by the scene) */}
      {phase === 'receipt' && receipt && sceneRef.current && <Receipt data={receipt} scene={sceneRef.current} onAgain={back} />}
    </main>
  );
}
