import { flatShadow } from './NoteCard';

/* Inked UI pieces: flat fills, 2px ink outlines, hard offset shadows. */
export const card = `rounded-2xl border-2 border-ink bg-paper-light ${flatShadow}`;
export const pill = `inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-paper-light p-1 md:p-1.5 ${flatShadow}`;
export const groupLabel = 'mb-1 block text-xs font-medium text-ink/70 md:mb-1.5 md:text-[13px]';
/* Hover states come from FillButton (directional fill), not from CSS :hover. */
export const iconButton = 'h-8 w-8 rounded-full disabled:opacity-30 md:h-10 md:w-10';
export const buttonPrimary = `rounded-full border-2 border-ink bg-ink px-5 py-2.5 text-sm font-medium text-paper md:px-6 md:py-3 md:text-base ${flatShadow}`;
export const buttonAccent = `rounded-full border-2 border-ink bg-sage px-5 py-2.5 text-sm font-medium text-ink md:px-6 md:py-3 md:text-base ${flatShadow}`;
export const buttonQuiet = `rounded-full border-2 border-ink bg-paper-light px-5 py-2.5 text-sm font-medium text-ink md:px-6 md:py-3 md:text-base ${flatShadow}`;
/* Fill colours for the directional hover. */
export const FILL = { ink: '#2b1d12', sage: '#9fbb9a', paper: '#f1e0bf', faint: 'rgba(43,29,18,0.09)' };

