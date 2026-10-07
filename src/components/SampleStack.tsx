import { useRef, useState, type CSSProperties } from 'react';
import gsap from 'gsap';
import { audio } from '../audio/engine';

/**
 * Two sample latte-art photos as a little stack of polaroids beside the cup in step 1.
 * Click the top one: it lifts, slides behind, and the other comes forward. Desktop only.
 */
const SAMPLES = [
  { src: '/4643253f793b29fef9c3cca48b32b440.jpg', caption: 'sunset by the beach' },
  { src: '/51524192cd6047f0cbd55ad64b2d797e.webp', caption: 'a tulip, stacked' },
];

export default function SampleStack({ className = '', style }: { className?: string; style?: CSSProperties }) {
  const [top, setTop] = useState(0);
  const cards = useRef<Array<HTMLButtonElement | null>>([]);
  const busy = useRef(false);

  const swap = () => {
    if (busy.current) return;
    busy.current = true;
    audio.click(true);
    const el = cards.current[top];
    // lift the top card, then let the stack reorder beneath it
    gsap
      .timeline({ onComplete: () => (busy.current = false) })
      .to(el, { y: -36, rotation: 10, duration: 0.22, ease: 'power2.out' })
      .add(() => setTop((t) => (t + 1) % SAMPLES.length))
      .to(el, { y: 0, rotation: 0, duration: 0.45, ease: 'power3.out', clearProps: 'transform' });
  };

  return (
    <div className={`pointer-events-none absolute top-0 left-0 ${className}`} style={{ width: 230, height: 300, ...style }}>
      {SAMPLES.map((s, i) => {
        const isTop = i === top;
        return (
          <button
            key={s.src}
            ref={(el) => {
              cards.current[i] = el;
            }}
            type="button"
            onClick={swap}
            aria-label={isTop ? `Sample latte art: ${s.caption}. Click to see the next one` : s.caption}
            tabIndex={isTop ? 0 : -1}
            className={`pointer-events-auto absolute left-0 top-0 cursor-pointer rounded-sm border-2 border-ink bg-[#f8f3ea] p-3 pb-4 text-left shadow-[6px_8px_0_0_#c9a97c] transition-[transform,opacity] duration-500 ease-[cubic-bezier(.2,.8,.2,1)] ${
              isTop ? 'z-10 rotate-[3deg]' : 'z-0 -translate-x-2 translate-y-2 -rotate-[5deg] opacity-90'
            }`}
            style={{ width: 230 }}
          >
            <img src={s.src} alt="" width={206} height={206} loading="lazy" draggable={false} className="block h-[206px] w-[206px] rounded-sm border-2 border-ink object-cover" />
            <span className="mt-2 flex items-baseline justify-between">
              <span className="font-script text-[20px] leading-none text-ink/85">{s.caption}</span>
              <span className="font-mono text-[11px] text-ink/50">
                {String(i + 1).padStart(2, '0')}/{String(SAMPLES.length).padStart(2, '0')}
              </span>
            </span>
          </button>
        );
      })}
      <p className="pointer-events-none absolute -top-7 left-0 font-mono text-[11px] tracking-[0.12em] text-ink/60 uppercase">Ideas · click to flip</p>
    </div>
  );
}
