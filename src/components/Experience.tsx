import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CoffeeScene, type BrushSize, type Preset } from '../scene/CoffeeScene';

type Phase = 'hero' | 'gliding' | 'art' | 'stir';
type ArtChoice = Preset | 'paint';

const ART_OPTIONS: Array<{ id: ArtChoice; label: string; icon: ReactNode }> = [
  {
    id: 'heart',
    label: 'Heart',
    icon: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />,
  },
  {
    id: 'tulip',
    label: 'Tulip',
    icon: (
      <>
        <path d="M7 16a5 3.5 0 0 0 10 0" />
        <path d="M8 11a4 3 0 0 0 8 0" />
        <path d="M9.5 6.5a2.5 2 0 0 0 5 0" />
        <path d="M12 4v16" />
      </>
    ),
  },
  {
    id: 'rosetta',
    label: 'Rosetta',
    icon: (
      <>
        <path d="M6 17c2-3 10-3 12 0" />
        <path d="M7 13.5c2-2.6 8-2.6 10 0" />
        <path d="M8.5 10c1.6-2 5.4-2 7 0" />
        <path d="M10 6.8c1-1.3 3-1.3 4 0" />
        <path d="M12 4v16" />
      </>
    ),
  },
  {
    id: 'paint',
    label: 'Paint',
    icon: (
      <>
        <path d="M14 4l6 6-8.5 8.5a3 3 0 0 1-4.2 0l-1.8-1.8a3 3 0 0 1 0-4.2Z" />
        <path d="M4 20c1.5 0 3-.6 3.6-1.8" />
      </>
    ),
  },
];

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
  const [art, setArt] = useState<ArtChoice | null>(null);
  const [pouring, setPouring] = useState(false);
  const [active, setActive] = useState(false);
  const [history, setHistory] = useState({ undo: false, redo: false });
  const [brush, setBrush] = useState<BrushSize>('xl');
  const [flow, setFlow] = useState(0.35);

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

  const choose = async (id: ArtChoice) => {
    const scene = sceneRef.current;
    if (!scene || pouring) return;
    setArt(id);
    if (id === 'paint') {
      // a preset gets wiped for a blank cup; your own drawing stays
      if (art !== 'paint') scene.enterPaint();
      return;
    }
    scene.setInteraction('none');
    setPouring(true);
    await scene.pour(id);
    setPouring(false);
  };

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
    await choose('rosetta');
  };

  const stir = () => {
    sceneRef.current?.setInteraction('stir');
    setActive(false);
    setPhase('stir');
  };

  const back = async () => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setInteraction('none');
    setPhase('gliding');
    setArt(null);
    await scene.setMode('hero');
    setPhase('hero');
  };

  const hint =
    phase === 'stir' ? 'Drag in circles to stir' : art === 'paint' ? 'Hold to pour, move to shape, flick to pull through' : pouring ? 'Pouring' : 'Pick your latte art';

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
          {phase === 'art' ? 'step 01 / latte art' : phase === 'stir' ? 'step 02 / stir' : 'made with milk + webgl'}
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
            <button type="button" className={iconButton} onClick={() => sceneRef.current?.undo()} disabled={!history.undo || pouring} aria-label="Undo" title="Undo (Ctrl+Z)">
              <Icon><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></Icon>
            </button>
            <button type="button" className={iconButton} onClick={() => sceneRef.current?.redo()} disabled={!history.redo || pouring} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
              <Icon><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></Icon>
            </button>
            <button type="button" className={iconButton} onClick={() => sceneRef.current?.clearArt()} disabled={pouring} aria-label="Clear latte art" title="Clear">
              <Icon><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" /><path d="M9 7V4h6v3" /></Icon>
            </button>
          </div>
          {art === 'paint' && (
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
          )}
          {art === 'paint' && (
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
          )}
        </div>
        <div className={pill}>
          {ART_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => choose(o.id)}
              disabled={pouring}
              aria-pressed={art === o.id}
              aria-label={o.label}
              className={`flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors duration-200 disabled:opacity-50 md:px-4 ${
                art === o.id ? 'bg-cream text-espresso' : 'hover:bg-cream/5'
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {o.icon}
              </svg>
              <span className="hidden sm:inline">{o.label}</span>
            </button>
          ))}
          <span className="mx-1 h-6 w-px bg-cream/10" aria-hidden />
          <button
            type="button"
            onClick={stir}
            disabled={pouring || !art}
            className="rounded-full bg-caramel px-4 py-2 text-sm font-medium text-cream transition-transform duration-200 hover:scale-[1.03] disabled:opacity-50 md:px-5"
          >
            Stir it
          </button>
        </div>
      </div>

      {/* Stir hint */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-8 pb-[max(2rem,env(safe-area-inset-bottom))] transition-opacity duration-500 ${
          phase === 'stir' && !active ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <p className={`rounded-full border border-cream/15 bg-espresso/80 px-4 py-2 backdrop-blur ${label}`}>{hint}</p>
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
    </main>
  );
}
