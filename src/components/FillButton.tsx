import { useRef, type ButtonHTMLAttributes, type PointerEvent as ReactPointerEvent } from 'react';
import gsap from 'gsap';
import { audio } from '../audio/engine';

type Edge = 'top' | 'right' | 'bottom' | 'left';

function edgeFromPointer(rect: DOMRect, x: number, y: number): Edge {
  const dTop = Math.abs(y - rect.top);
  const dRight = Math.abs(rect.right - x);
  const dBottom = Math.abs(rect.bottom - y);
  const dLeft = Math.abs(x - rect.left);
  const min = Math.min(dTop, dRight, dBottom, dLeft);
  if (min === dTop) return 'top';
  if (min === dRight) return 'right';
  if (min === dBottom) return 'bottom';
  return 'left';
}

const ORIGIN: Record<Edge, string> = { left: 'left center', right: 'right center', top: 'center top', bottom: 'center bottom' };

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Colour of the fill that sweeps in. */
  fill?: string;
  /** Label colour once covered by the fill. Leave out to keep the label as it is. */
  textOnFill?: string;
};

export default function FillButton({ fill = '#9fbb9a', textOnFill, className = '', children, disabled, ...rest }: Props) {
  const overlay = useRef<HTMLSpanElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const state = useRef({ s: 0, edge: 'left' as Edge, restColor: '' });

  const apply = () => {
    const o = overlay.current;
    if (!o) return;
    const { s, edge } = state.current;
    const horizontal = edge === 'left' || edge === 'right';
    o.style.transformOrigin = ORIGIN[edge];
    o.style.transform = horizontal ? `scaleX(${s})` : `scaleY(${s})`;
  };

  const animate = (entering: boolean, e: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    // hover is a mouse idea: on touch (and pen) a tap would leave the fill stuck on, so skip it
    if (e.pointerType !== 'mouse') return;
    const el = e.currentTarget;
    state.current.edge = edgeFromPointer(el.getBoundingClientRect(), e.clientX, e.clientY);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (label.current && !state.current.restColor) state.current.restColor = getComputedStyle(label.current).color;
    const target = entering ? 1 : 0;
    if (reduce) {
      state.current.s = target;
      apply();
      if (label.current && textOnFill) label.current.style.color = entering ? textOnFill : state.current.restColor;
      return;
    }
    gsap.to(state.current, { s: target, duration: 0.25, ease: 'power2.out', overwrite: true, onUpdate: apply });
    if (label.current && textOnFill) {
      gsap.to(label.current, { color: entering ? textOnFill : state.current.restColor, duration: 0.25, ease: 'power2.out', overwrite: true });
    }
  };

  return (
    <button
      {...rest}
      disabled={disabled}
      onClick={(e) => {
        audio.click();
        rest.onClick?.(e);
      }}
      onPointerEnter={(e) => {
        animate(true, e);
        rest.onPointerEnter?.(e);
      }}
      onPointerLeave={(e) => {
        animate(false, e);
        rest.onPointerLeave?.(e);
      }}
      className={`relative isolate inline-flex cursor-pointer items-center justify-center overflow-hidden leading-none disabled:cursor-default ${className}`}
    >
      <span ref={overlay} aria-hidden className="pointer-events-none absolute inset-0 -z-10" style={{ background: fill, transform: 'scaleX(0)', transformOrigin: 'left center' }} />
      <span ref={label} className="relative inline-flex items-center gap-1.5">
        {children}
      </span>
    </button>
  );
}
