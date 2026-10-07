import { useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';

/**
 * An inked slider built from plain elements (no native range input, so no browser hover styling):
 * a thin ink track and a jade thumb. Pointer drag and arrow keys, value 0..1.
 */
export default function Slider({ value, onChange, label, className = '' }: { value: number; onChange: (v: number) => void; label: string; className?: string }) {
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const setFromPointer = (clientX: number) => {
    const el = track.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    onChange(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)));
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    setFromPointer(e.clientX);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragging.current) setFromPointer(e.clientX);
  };
  const onPointerUp = () => {
    dragging.current = false;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange(Math.min(1, value + step));
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange(Math.max(0, value - step));
    else if (e.key === 'Home') onChange(0);
    else if (e.key === 'End') onChange(1);
    else return;
    e.preventDefault();
  };

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      className={`flex h-10 cursor-pointer touch-none items-center outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 ${className}`}
    >
      <div ref={track} className="relative h-1 w-full rounded-full bg-ink">
        <div
          className="absolute top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-sage"
          style={{ left: `${value * 100}%` }}
        />
      </div>
    </div>
  );
}
