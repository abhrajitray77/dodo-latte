import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { pill } from './ui';

const INK = '#2b1d12';
const CREAM = '#f6efe0';
export const HINT_SEEN_KEY = 'crema-corner-pour-hint';

/**
 * First-time cue near the bottom of the coffee: an inked hand with the index finger up, click
 * ripples pulsing at the fingertip, and "Click and drag" with an up arrow beneath it.
 * Fades as soon as the person pours for themselves, or after a few seconds.
 */
export default function PourHint({ active, onDone }: { active: boolean; onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const done = useRef(false);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    gsap.to(root.current, { opacity: 0, y: 8, duration: 0.4, ease: 'power2.out', onComplete: onDone });
  };

  useEffect(() => {
    gsap.fromTo(root.current, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', delay: 0.4 });
    const timer = window.setTimeout(finish, 8500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (active) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div ref={root} className="pointer-events-none absolute left-1/2 top-[66%] flex -translate-x-1/2 flex-col items-center gap-2 opacity-0">
      <svg viewBox="0 0 120 120" className="h-[120px] w-[120px] overflow-visible" aria-hidden>
        {/* click ripples at the fingertip */}
        <circle className="pour-hint-ring" cx={60} cy={30} r={8} fill="none" stroke={CREAM} strokeWidth={3} />
        <circle className="pour-hint-ring pour-hint-ring-2" cx={60} cy={30} r={8} fill="none" stroke={CREAM} strokeWidth={3} />
        <circle cx={60} cy={30} r={5} fill={CREAM} stroke={INK} strokeWidth={1.5} opacity={0.9} />
        {/* the hand, index finger pointing up, fingertip at (60, 30) */}
        <g className="pour-hint-hand" opacity={0.78} transform="translate(44 26) scale(1.2)">
          <path
            d="M14 4c0-3.6 6-3.6 6 0v15c3-1.8 6-.8 6 2.2 3-1.8 6-.8 6 2.2 3-1 5 1 5 4v10c0 8-6 14-14 14h-4c-6 0-10-4-12-9L2 32c-1.4-3 2-5.8 4.4-3.4L10 32.5V4Z"
            fill={CREAM}
            stroke={INK}
            strokeWidth={2.4}
            strokeLinejoin="round"
          />
          <path d="M26 24v7M32 26v6M38 29v4" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
        </g>
      </svg>
      <p className={`${pill} px-4 py-2 text-[14px] font-medium`}>
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[2]" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 19V5" />
          <path d="m6 11 6-6 6 6" />
        </svg>
        Click and drag
      </p>
    </div>
  );
}
