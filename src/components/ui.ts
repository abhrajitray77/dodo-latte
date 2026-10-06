import { flatShadow } from './NoteCard';

/* Inked UI pieces: flat fills, 2px ink outlines, hard offset shadows. */
export const card = `rounded-2xl border-2 border-ink bg-paper-light ${flatShadow}`;
export const pill = `inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-paper-light p-1.5 ${flatShadow}`;
export const groupLabel = 'mb-1.5 block text-[13px] font-medium text-ink/70';
/* Hover states come from FillButton (directional fill), not from CSS :hover. */
export const iconButton = 'h-10 w-10 rounded-full disabled:opacity-30';
export const buttonPrimary = `rounded-full border-2 border-ink bg-ink px-6 py-3 text-base font-medium text-paper ${flatShadow}`;
export const buttonAccent = `rounded-full border-2 border-ink bg-sage px-6 py-3 text-base font-medium text-ink ${flatShadow}`;
export const buttonQuiet = `rounded-full border-2 border-ink bg-paper-light px-6 py-3 text-base font-medium text-ink ${flatShadow}`;
/* Fill colours for the directional hover. */
export const FILL = { ink: '#2b1d12', sage: '#9fbb9a', paper: '#f1e0bf', faint: 'rgba(43,29,18,0.09)' };

