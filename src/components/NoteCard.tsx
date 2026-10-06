import type { ReactNode } from 'react';

/**
 * A pinned paper note in the inked style: flat cream card, ink outline, a coloured pin,
 * a numbered step, a title and a sentence or two of real, readable text.
 */
export type NoteTint = 'cream' | 'jade' | 'peach';

// off-white so the boards stand off the tan paper; the tints are only a hint
const TINT: Record<NoteTint, string> = {
  cream: 'bg-[#faf6ee]',
  jade: 'bg-[#f3f7ef]',
  peach: 'bg-[#fbf1e6]',
};

export const flatShadow = 'shadow-[6px_8px_0_0_#c9a97c]';

export default function NoteCard({
  step,
  title,
  children,
  tint = 'cream',
  tilt = -2,
  pin = '#c96a3d',
  className = '',
}: {
  step?: string;
  title: string;
  children?: ReactNode;
  tint?: NoteTint;
  tilt?: number;
  pin?: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`} style={{ transform: `rotate(${tilt}deg)` }}>
      {/* the pin */}
      <span aria-hidden className="absolute left-1/2 -top-3 z-10 -ml-[11px] block h-[22px] w-[22px] rounded-full border-2 border-ink" style={{ background: pin }}>
        <span className="absolute left-[5px] top-[4px] block h-[6px] w-[6px] rounded-full bg-white/60" />
      </span>
      <div className={`rounded-2xl border-2 border-ink px-5 pt-6 pb-5 ${TINT[tint]} ${flatShadow}`}>
        {step && <p className="mb-1 font-mono text-[13px] tracking-[0.14em] text-[#c96a3d]">{step}</p>}
        <h2 className="text-[22px] leading-tight font-medium tracking-[-0.01em]">{title}</h2>
        {children && <div className="mt-2 space-y-2 text-[15px] leading-snug text-ink/80">{children}</div>}
      </div>
    </div>
  );
}
