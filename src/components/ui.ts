import { flatShadow } from './NoteCard';

/*
  Design system for the UI chrome (the inked, flat-colour look).

  Surfaces   2px ink border, paper-light fill, hard tan shadow.
  Type       label 12/13px, ui 14px, body 15px, lead 15/17px, h2 22px, mono 13px.
  Spacing    chip px-3 py-1.5 · pill px-4 py-2 · buttons sm h-9 px-4, md h-10/12 px-5/6, lg h-12/14 px-8/10.

  Rule: shared classes never carry responsive padding. A `md:p-*` in a base class lands after every
  plain utility in Tailwind's output and silently overrides the padding callers add.
*/

export const surface = `border-2 border-ink bg-paper-light ${flatShadow}`;

export const type = {
  label: 'text-xs md:text-[13px]',
  ui: 'text-sm',
  body: 'text-[15px] leading-snug',
  lead: 'text-sm md:text-[17px]',
  h2: 'text-[22px] leading-tight font-medium tracking-[-0.01em]',
  mono: 'font-mono text-[13px]',
};

/** Small capsule: status chips, hints, the sound toggle. */
export const chip = `inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 ${type.label} font-medium ${surface}`;
/** Mid capsule: Back, pointer hints. */
export const pill = `inline-flex items-center gap-1.5 rounded-full px-4 py-2 ${type.ui} font-medium ${surface}`;
/** A rounded panel. */
export const card = `rounded-2xl ${surface}`;
/** A thin outlined capsule holding icon buttons or chips, inside a card. */
export const controlGroup = 'flex items-center gap-0.5 rounded-full border-2 border-ink p-1 md:gap-1';
/** A thin outlined capsule holding a slider. */
export const controlField = 'flex h-9 items-center rounded-full border-2 border-ink px-2.5 md:h-12 md:px-4';
export const groupLabel = `mb-1 block ${type.label} font-medium text-ink/70 md:mb-1.5`;
export const iconButton = 'h-8 w-8 rounded-full disabled:opacity-30 md:h-10 md:w-10';

/* Buttons: one shape, three fills, three sizes. Hover comes from FillButton, never CSS :hover. */
const buttonBase = `rounded-full border-2 border-ink font-medium ${flatShadow}`;
const buttonFill = {
  primary: 'bg-ink text-paper',
  accent: 'bg-sage text-ink',
  quiet: 'bg-paper-light text-ink',
};
const buttonSize = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-10 px-5 text-sm md:h-12 md:px-6 md:text-base',
  lg: 'h-12 px-8 text-base md:h-14 md:px-10 md:text-lg',
};
export const button = (fill: keyof typeof buttonFill, size: keyof typeof buttonSize = 'md') => `${buttonBase} ${buttonFill[fill]} ${buttonSize[size]}`;
export const buttonPrimary = button('primary');
export const buttonAccent = button('accent');
export const buttonQuiet = button('quiet');

/* Fill colours for the directional hover. */
export const FILL = { ink: '#2b1d12', sage: '#9fbb9a', paper: '#f1e0bf', faint: 'rgba(43,29,18,0.09)' };
