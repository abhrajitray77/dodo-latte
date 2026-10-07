import { useEffect, useRef } from 'react';
import gsap from 'gsap';

const INK = '#2b1d12';
const MIN_SHOW = 2.8; // seconds the loader stays even if everything is ready sooner

/**
 * The loading sheet: a noisy matcha green, a still inked cup tilted toward you, "Crema Corner"
 * rising in and "Latte Art Bar" writing itself in cursive. When fonts are in and the minimum time has passed,
 * the whole sheet lifts away upward.
 */
export default function Preloader({ onDone }: { onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const art = useRef<SVGSVGElement>(null);
  const title = useRef<HTMLParagraphElement>(null);
  const script = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    document.getElementById('boot')?.remove(); // the static backdrop from the page, no longer needed
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const letters = Array.from(title.current?.querySelectorAll<HTMLElement>('span') ?? []);
    const tl = gsap.timeline();

    if (reduce) {
      gsap.set([letters, script.current], { opacity: 1, y: 0, clipPath: 'inset(0 0 0 0)' });
    } else {
      // the cup fades up, then the name rises in letter by letter
      gsap.fromTo(art.current, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out' });
      gsap.set(letters, { opacity: 0, y: 14 });
      tl.to(letters, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out', stagger: 0.035 }, 0.6);
      // the cursive writes itself: a wipe from left to right
      gsap.set(script.current, { clipPath: 'inset(-20% 100% -20% 0)' });
      tl.to(script.current, { clipPath: 'inset(-20% 0% -20% 0)', duration: 1.2, ease: 'power1.inOut' }, 1.1);
    }

    let cancelled = false;
    const started = performance.now();
    const ready = Promise.all([
      document.fonts?.ready ?? Promise.resolve(),
      document.fonts?.load('600 40px Caveat').catch(() => undefined) ?? Promise.resolve(),
    ]);
    ready.then(() => {
      const wait = reduce ? 0 : Math.max(0, MIN_SHOW * 1000 - (performance.now() - started));
      window.setTimeout(() => {
        if (cancelled) return;
        gsap.to(root.current, { yPercent: -100, duration: reduce ? 0.2 : 0.9, ease: 'power3.inOut', onComplete: onDone });
      }, wait);
    });
    return () => {
      cancelled = true;
      tl.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={root} className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 overflow-hidden px-6 text-ink will-change-transform" aria-label="Loading">
      {/* one colour: a noisy matcha green, like a flat-painted sheet */}
      <svg className="absolute h-0 w-0" aria-hidden>
        <filter id="matcha-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="5" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="table" tableValues="0 0.22" />
          </feComponentTransfer>
        </filter>
      </svg>
      <div aria-hidden className="matcha-base absolute inset-0" />
      <div aria-hidden className="matcha-grain absolute inset-0" />

      <svg ref={art} viewBox="0 0 340 300" className="relative h-[min(300px,40vh)] w-auto overflow-visible" aria-hidden>
        <g transform="rotate(-12 170 160)" fill="none" stroke={INK} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
          {/* the cup, still: rim, inside edge, body, foot, handle */}
          <ellipse cx={160} cy={110} rx={110} ry={46} />
          <ellipse cx={160} cy={112} rx={94} ry={36} />
          <path d="M50 110 C 52 180, 80 232, 160 236 C 240 232, 268 180, 270 110" />
          <path d="M118 236 Q 160 250 202 236" />
          <path d="M270 128 C 320 124, 326 186, 272 194" />
          <path d="M273 142 C 304 142, 306 178, 273 184" />
          <path strokeWidth={1.8} d="M232 170 l 10 -6 M 236 186 l 10 -7 M 228 200 l 10 -7 M 216 214 l 10 -7" opacity={0.75} />
        </g>
      </svg>
      <div className="relative text-center">
        <p ref={title} className="text-[22px] font-medium tracking-[-0.01em] md:text-[28px]" aria-hidden>
          {'Crema Corner'.split('').map((ch, i) => (
            <span key={i} className="inline-block">
              {ch === ' ' ? ' ' : ch}
            </span>
          ))}
        </p>
        <p ref={script} className="font-script text-[40px] leading-none text-ink/85 md:text-[52px]">
          Latte Art Bar
        </p>
      </div>
    </div>
  );
}
