import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CoffeeScene, type BrushSize } from '../scene/CoffeeScene';
import Receipt, { type ReceiptState } from './Receipt';
import Beans from './Beans';
import PourHint, { HINT_SEEN_KEY } from './PourHint';
import Slider from './Slider';
import Preloader from './Preloader';
import SampleStack from './SampleStack';
import NoteCard from './NoteCard';
import { FILL, button, card, chip, controlField, controlGroup, groupLabel, iconButton, pill, type } from './ui';
import FillButton from './FillButton';
import type { ReceiptData } from '../receipt/draw';
import { audio } from '../audio/engine';

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
const PORTFOLIO_URL = 'https://www.abhrajitray.com';

/** A doodled red heart, inked. */
const Heart = () => (
  <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" aria-hidden>
    <path
      d="M12 20.3c-1.3-1-6.4-4.9-8-8.4C2.6 8.6 4.4 5.4 7.3 5.1c1.9-.2 3.5.9 4.7 2.5 1.1-1.6 2.7-2.8 4.7-2.6 3 .3 4.8 3.4 3.5 6.6-1.5 3.6-6.8 7.6-8.2 8.7Z"
      fill="#d94a3a"
      stroke="#2b1d12"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path d="M7.6 8.6c.6-1 1.5-1.5 2.4-1.4" fill="none" stroke="#f6d7cf" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

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
  const [spread, setSpread] = useState(0.5);
  const [strength, setStrength] = useState(0.5);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [sound, setSound] = useState(!audio.muted);
  const [pourHint, setPourHint] = useState(false);
  const [loading, setLoading] = useState(true);
  const artTrayRef = useRef<HTMLDivElement>(null);
  const stirTrayRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const topHintRef = useRef<HTMLDivElement>(null);

  // phones: tell the scene what the header and the controls cover, so the cup is centred between them
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const tray = phase === 'art' ? artTrayRef.current : phase === 'stir' ? stirTrayRef.current : null;
    const apply = () => {
      const phone = window.innerWidth < 1024;
      const top = phone && tray ? Math.max(headerRef.current?.getBoundingClientRect().bottom ?? 0, topHintRef.current?.getBoundingClientRect().bottom ?? 0) : 0;
      scene.setInsets(top, phone && tray ? tray.getBoundingClientRect().height : 0);
    };
    apply();
    const ro = new ResizeObserver(apply);
    if (tray) ro.observe(tray);
    if (headerRef.current) ro.observe(headerRef.current);
    if (topHintRef.current) ro.observe(topHintRef.current);
    window.addEventListener('resize', apply);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', apply);
    };
  }, [phase]);
  const [cardSpot, setCardSpot] = useState<CardSpot>('hero');
  const [receiptState, setReceiptState] = useState<ReceiptState>('printing');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new CoffeeScene(canvas);
    scene.setPointerListener(setActive);
    scene.setHistoryListener((undo, redo) => setHistory({ undo, redo }));
    scene.setActivityListener((kind, active, k) => (kind === 'pour' ? audio.pour(active, k) : audio.stir(active, k)));
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
  const changeSpread = (value: number) => {
    setSpread(value);
    sceneRef.current?.setSpread(value);
  };
  const changeStrength = (value: number) => {
    setStrength(value);
    sceneRef.current?.setStrength(value);
  };

  const pickBrush = (size: BrushSize) => {
    setBrush(size);
    sceneRef.current?.setBrushSize(size);
  };

  // browsers only start audio from a gesture: the first press anywhere wakes the engine and the loop
  const wakeAudio = () => {
    audio.ensure();
    audio.startMusic();
  };

  const toggleSound = () => {
    audio.ensure();
    const muted = !audio.muted;
    audio.setMuted(muted);
    setSound(!muted);
    if (!muted) audio.startMusic();
  };

  const starting = useRef(false);
  const start = async () => {
    const scene = sceneRef.current;
    if (!scene || phase !== 'hero' || starting.current) return;
    starting.current = true;
    audio.whoosh();
    setPhase('gliding');
    setCardSpot('art'); // the card travels while the camera glides
    scene.resetCoffee();
    await scene.setMode('top');
    setPhase('art');
    starting.current = false;
    // first visit only; add ?hint to the URL to see it again
    try {
      if (!localStorage.getItem(HINT_SEEN_KEY) || new URLSearchParams(location.search).has('hint')) setPourHint(true);
    } catch {
      setPourHint(true);
    }
    scene.setFlow(flow);
    scene.setSpread(spread);
    scene.setStrength(strength);
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
    audio.whoosh();
    setPhase('gliding');
    setCardSpot('hero');
    await scene.setMode('hero');
    setPhase('hero');
  };

  const inStep = phase === 'art' || phase === 'stir' || phase === 'receipt';

  return (
    <main
      className={`relative h-dvh w-full select-none overflow-hidden bg-paper-strokes font-display text-ink ${phase === 'hero' ? 'cursor-pointer' : ''}`}
      onClick={phase === 'hero' ? start : undefined}
      onPointerDownCapture={wakeAudio}
    >
      {/* Big type sits behind the canvas, so the cup floats in front of it */}
      <div
        aria-hidden={phase !== 'hero'}
        className={`pointer-events-none absolute top-14 left-5 origin-top-left text-left transition-all duration-700 ease-out lg:top-16 lg:left-8 ${
          phase === 'hero' ? 'opacity-100 blur-0' : 'scale-110 opacity-0 blur-sm'
        }`}
      >
        <h1 className="text-[17vw] leading-[0.82] font-medium tracking-[-0.05em] lg:text-[11vw]">
          Crema
          <br />
          Corner
        </h1>
        <h2 className="font-script mt-[1.5vw] text-[7vw] leading-none text-ink/85 lg:text-[4vw]">Latte Art Bar</h2>
      </div>

      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* First visit: a hand shows the press-and-drag over the coffee */}
      {phase === 'art' && pourHint && (
        <PourHint
          active={active}
          onDone={() => {
            setPourHint(false);
            try {
              localStorage.setItem(HINT_SEEN_KEY, '1');
            } catch {
              /* ignore */
            }
          }}
        />
      )}

      {/* Beans on the table, hero only (they would sit over the cup in the top view) */}
      <Beans className={`hidden transition-opacity duration-700 lg:block ${phase === 'hero' || phase === 'gliding' ? 'opacity-100' : 'opacity-0'}`} />

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
      <header ref={headerRef} className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3 lg:p-7">
        {/* the small lockup once the big title has gone (desktop only; phones keep the space) */}
        <div className={`hidden leading-none transition-opacity duration-500 lg:block ${phase === 'hero' || phase === 'gliding' ? 'opacity-0' : 'opacity-100'}`}>
          <p className="text-[16px] font-medium tracking-[-0.01em]">Crema Corner</p>
          <p className="font-script mt-0.5 text-[21px] leading-none text-ink/80">Latte Art Bar</p>
        </div>
        <div className="ml-auto flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            {/* step chip (compact on phones); "made with" only on desktop */}
            <div className={`${chip} ${inStep ? '' : 'max-lg:hidden'}`}>
              {inStep ? (
                <>
                  <span className="h-2.5 w-2.5 rounded-full border-2 border-ink bg-sage" />
                  <span className="hidden lg:inline">
                    Step {STEP_INDEX[phase]} of 03 <span className="text-ink/50">·</span> {STEP_NAMES[phase]}
                  </span>
                  <span className="lg:hidden">{STEP_INDEX[phase]} / 03</span>
                </>
              ) : (
                <span>Made with milk + WebGL</span>
              )}
            </div>
            <FillButton
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleSound();
              }}
              fill={FILL.faint}
              aria-pressed={sound}
              aria-label={sound ? 'Sound on' : 'Sound off'}
              className={`${chip} pointer-events-auto relative z-50`}
            >
              <Icon>
                <path d="M4 10v4h3l4 3.5v-11L7 10H4Z" />
                {sound ? (
                  <>
                    <path d="M15 9.5a3.5 3.5 0 0 1 0 5" />
                    <path d="M17.5 7a7 7 0 0 1 0 10" />
                  </>
                ) : (
                  <path d="m15.5 9.5 5 5m0-5-5 5" />
                )}
              </Icon>
              <span className="hidden lg:inline">{sound ? 'Sound on' : 'Sound off'}</span>
            </FillButton>
          </div>
          {/* credit: clickable, above everything else (desktop; phones get a line under the Start button) */}
          <a
            href={PORTFOLIO_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={`pointer-events-auto relative z-50 flex flex-col items-end ${type.label} leading-snug text-ink/80 max-lg:hidden`}
          >
            <span className="flex items-center gap-1.5 font-medium">
              Built with Astro <Heart /> by @abhrajitray
            </span>
            <span className="text-ink/70">for Dodo Payments</span>
          </a>
        </div>
      </header>

      {(phase === 'art' || phase === 'stir') && (
        <FillButton type="button" onClick={back} fill={FILL.faint} className={`${chip} absolute top-3 left-3 lg:top-20 lg:left-7`}>
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
        <p className={`${type.lead} text-center leading-snug text-ink/80`}>
          <span className="font-medium text-ink">The barista is you today.</span>
          <br />
          Draw a heart in the foam, or a mess. Both are fine.
        </p>
        <FillButton type="button" onClick={start} fill={FILL.sage} textOnFill={FILL.ink} className={`${button('primary', 'lg')} focus-visible:ring-2 focus-visible:ring-sage focus-visible:outline-none`}>
          Start pouring
        </FillButton>
        <a
          href={PORTFOLIO_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`flex flex-col items-center ${type.label} leading-snug text-ink/70 lg:hidden`}
        >
          <span className="flex items-center gap-1">
            Built with Astro <Heart /> by @abhrajitray
          </span>
          <span>for Dodo Payments</span>
        </a>
      </div>

      {/* The travelling note card: one spot per step, content crossfades as it moves */}
      <div
        className={`pointer-events-none absolute top-0 left-0 hidden transition-[transform,opacity] duration-700 ease-[cubic-bezier(.2,.8,.2,1)] lg:block ${
          phase === 'receipt' && receiptState === 'torn' ? 'opacity-0' : 'opacity-100'
        }`}
        style={{ width: CARD_WIDTH, transform: CARD_SPOT[cardSpot] }}
      >
        <div className={`transition-opacity duration-500 ${cardSpot === 'hero' ? 'opacity-100' : 'absolute inset-x-0 top-0 opacity-0'}`}>
          <NoteCard title="How it works" tilt={0} pin="#9fbb9a">
            <ol className="space-y-2">
              <li>
                <span className={`${type.mono} text-[#c96a3d]`}>01 </span>Pour milk onto the coffee and shape your latte art.
              </li>
              <li>
                <span className={`${type.mono} text-[#c96a3d]`}>02 </span>Stir it in with your finger.
              </li>
              <li>
                <span className={`${type.mono} text-[#c96a3d]`}>03 </span>Print the receipt and tear it off. It holds a time-lapse of your cup.
              </li>
            </ol>
          </NoteCard>
        </div>
        <div className={`transition-opacity duration-500 ${cardSpot === 'art' ? 'opacity-100' : 'absolute inset-x-0 top-0 opacity-0'}`}>
          <NoteCard step="STEP 01" title="Pour the milk" tint="jade" tilt={0}>
            <p>Press and drag on the coffee to pour.</p>
            <p>Pause in one place for a round blob. Wiggle side to side for leaves. A quick, thin pull through the middle makes the point.</p>
            <p className={`${type.label} text-ink/60`}>Ctrl + Z undoes a stroke.</p>
          </NoteCard>
        </div>
        <div className={`transition-opacity duration-500 ${cardSpot === 'stir' ? 'opacity-100' : 'absolute inset-x-0 top-0 opacity-0'}`}>
          <NoteCard step="STEP 02" title="Stir it in" tint="peach" tilt={0} pin="#9fbb9a">
            <p>Drag in circles to swirl the milk through the coffee.</p>
            <p>Stop when you're satisfied, then print your receipt.</p>
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

      {/* Step 01, desktop: two sample photos stacked at the right rim of the cup */}
      <SampleStack
        className={`hidden transition-[transform,opacity] duration-700 ease-[cubic-bezier(.2,.8,.2,1)] lg:block ${
          phase === 'art' ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        style={{ transform: `translate(min(calc(50vw + 48vh + 16px), calc(100vw - 230px - 1.25rem)), ${phase === 'art' ? '24vh' : '28vh'})` }}
      />

      {/* Phones: the step hint sits under the header, above the cup */}
      <div
        ref={topHintRef}
        className={`pointer-events-none absolute inset-x-0 top-[58px] flex justify-center px-3 transition-opacity duration-500 lg:hidden ${
          phase === 'art' || (phase === 'stir' && !active) ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <p className={`${chip} text-center`}>
          {phase === 'stir' ? 'Drag in circles to stir' : 'Press and drag to pour. Wiggle for leaves. Pull through for the point.'}
        </p>
      </div>

      {/* Latte art controls: two tight rows on phones, one row on desktop */}
      <div
        ref={artTrayRef}
        className={`pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-all duration-500 lg:gap-3 lg:p-7 ${
          phase === 'art' ? 'translate-y-0 opacity-100 [&>*]:pointer-events-auto' : 'translate-y-6 opacity-0'
        }`}
      >
        <div className={`${card} flex w-full max-w-[420px] flex-col gap-2.5 px-3 py-2.5 lg:w-auto lg:max-w-none lg:flex-row lg:flex-wrap lg:items-end lg:justify-center lg:gap-x-6 lg:gap-y-4 lg:px-5 lg:py-4`}>
          <div className="flex items-end justify-between gap-3 lg:contents">
            <div>
              <span className={groupLabel}>History</span>
              <div className={controlGroup}>
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
              <div className={controlGroup} role="radiogroup" aria-label="Pour size">
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
                    className={`h-8 w-8 rounded-full transition-colors duration-200 lg:h-10 lg:w-10 ${brush === b.id ? 'bg-ink text-paper' : ''}`}
                  >
                    <span className="rounded-full bg-current" style={{ width: b.dot * 0.8, height: b.dot * 0.8 }} />
                  </FillButton>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 lg:contents">
            {(
              [
                ['Flow', flow, changeFlow, 'How heavy the pour is'],
                ['Spread', spread, changeSpread, 'How far the milk spreads out'],
                ['Strength', strength, changeStrength, 'How much the milk stays instead of dissolving'],
              ] as Array<[string, number, (v: number) => void, string]>
            ).map(([name, value, change, title]) => (
              <div key={name} title={title} className="min-w-0">
                <span className={groupLabel}>
                  {name} <span className="font-mono text-ink/50">{Math.round(value * 100)}%</span>
                </span>
                <div className={controlField}>
                  <Slider value={value} onChange={change} label={name} className="w-full lg:w-32" />
                </div>
              </div>
            ))}
          </div>

          <FillButton type="button" onClick={stir} fill={FILL.ink} textOnFill={FILL.paper} className={`${button('accent')} w-full lg:order-last lg:w-auto`}>
            Stir it
            <span aria-hidden>→</span>
          </FillButton>
        </div>
      </div>

      {/* Stir controls */}
      <div
        ref={stirTrayRef}
        className={`pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] transition-all duration-500 lg:p-7 ${
          phase === 'stir' ? 'translate-y-0 opacity-100 [&>*]:pointer-events-auto' : 'translate-y-6 opacity-0'
        }`}
      >
        <div className={`${card} flex flex-wrap items-end justify-center gap-x-6 gap-y-4 px-5 py-4`}>
          <div>
            <span className={groupLabel}>History</span>
            <div className={controlGroup}>
              <FillButton type="button" fill={FILL.faint} className={iconButton} onClick={() => sceneRef.current?.undo()} disabled={!history.undo} aria-label="Undo" title="Undo (Ctrl+Z)">
                <UndoIcon />
              </FillButton>
              <FillButton type="button" fill={FILL.faint} className={iconButton} onClick={() => sceneRef.current?.redo()} disabled={!history.redo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
                <RedoIcon />
              </FillButton>
            </div>
          </div>
          <FillButton type="button" onClick={printReceipt} fill={FILL.ink} textOnFill={FILL.paper} className={button('accent')}>
            Print receipt
            <span aria-hidden>→</span>
          </FillButton>
        </div>
      </div>

      {loading && <Preloader onDone={() => setLoading(false)} />}

      {/* Receipt: the scene dims and a sheet of paper prints from the printer (drawn by the scene) */}
      {phase === 'receipt' && receipt && sceneRef.current && <Receipt data={receipt} scene={sceneRef.current} onAgain={back} onState={setReceiptState} />}
    </main>
  );
}
