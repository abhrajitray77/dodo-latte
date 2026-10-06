/**
 * The receipt printer, drawn flat in the inked style: a lit sign box on top, a housing below with
 * an open slot the paper feeds out of. The slot is a real gap in the artwork, so the simulated sheet
 * (drawn underneath by the scene) shows through it. Design units: 520 x 170.
 */

export const PRINTER_VIEW_W = 520;
export const PRINTER_VIEW_H = 170;
/** Top of the slot opening, in design units. The paper starts here. */
export const PRINTER_SLOT_Y = 128;

const INK = '#2b1d12';
const SHELL = '#f3e7cc';
const TRIM = '#d9c7a3';
const JADE = '#9fbb9a';
const SHADOW = '#c9a97c';

export default function Printer({ width, top }: { width: number; top: number }) {
  const height = (width / PRINTER_VIEW_W) * PRINTER_VIEW_H;
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${PRINTER_VIEW_W} ${PRINTER_VIEW_H}`}
      className="pointer-events-none absolute left-1/2 -translate-x-1/2"
      style={{ width, height, top }}
    >
      {/* flat shadows */}
      <rect x={48} y={20} width={440} height={70} rx={10} fill={SHADOW} />
      <path d="M40,104 H496 Q508,104 508,116 V154 H472 V136 H64 V154 H28 V116 Q28,104 40,104 Z" fill={SHADOW} />

      {/* sign box */}
      <rect x={28} y={28} width={16} height={38} rx={3} fill={TRIM} stroke={INK} strokeWidth={2.2} />
      <rect x={476} y={28} width={16} height={38} rx={3} fill={TRIM} stroke={INK} strokeWidth={2.2} />
      <rect x={40} y={12} width={440} height={70} rx={10} fill={SHELL} stroke={INK} strokeWidth={3} />
      <rect x={52} y={22} width={416} height={50} rx={6} fill="none" stroke={INK} strokeWidth={1.6} />
      <text
        x={260}
        y={61}
        textAnchor="middle"
        fill={INK}
        style={{ font: '500 44px "Apfel Grotezk", Inter, ui-sans-serif, system-ui, sans-serif', letterSpacing: '-2px' }}
      >
        stir
      </text>
      <circle cx={446} cy={47} r={5} fill={JADE} stroke={INK} strokeWidth={1.6} />

      {/* stand between the sign and the housing */}
      <rect x={230} y={80} width={60} height={18} fill={TRIM} stroke={INK} strokeWidth={2.2} />

      {/* housing with the slot cut out of its bottom edge */}
      <path d="M32,96 H488 Q500,96 500,108 V146 H464 V128 H56 V146 H20 V108 Q20,96 32,96 Z" fill={SHELL} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
      <rect x={36} y={104} width={448} height={10} rx={5} fill={JADE} stroke={INK} strokeWidth={1.6} />
      <text x={56} y={124} fill={INK} opacity={0.7} style={{ font: '9px ui-monospace, Menlo, monospace', letterSpacing: '1px' }}>
        RECEIPT
      </text>
      <text x={464} y={124} textAnchor="end" fill={INK} opacity={0.7} style={{ font: '9px ui-monospace, Menlo, monospace', letterSpacing: '1px' }}>
        NO. 01
      </text>
    </svg>
  );
}
