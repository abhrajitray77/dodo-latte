/**
 * A few coffee beans lying on the table around the cup, drawn flat like inked artwork:
 * solid fills, ink outlines, a crease, a few pen strokes and a flat drop shadow.
 * Hand placed in viewport percentages so they keep their relation to the centred cup.
 */

type Bean = { x: number; y: number; r: number; rot: number; flip?: boolean };

const INK = '#2b1d12';
const BEAN = '#5a3a2b';
const BEAN_LIGHT = '#6f4a37';
const SHADOW = '#c9a97c';

const BEANS: Bean[] = [
  // a loose cluster at the cup's lower left
  { x: 31, y: 86, r: 26, rot: -28 },
  { x: 35.5, y: 90.5, r: 23, rot: 40, flip: true },
  { x: 27.5, y: 91, r: 20, rot: 12 },
  // a pair off to the right
  { x: 69, y: 83, r: 25, rot: 64 },
  { x: 73.5, y: 88, r: 22, rot: -15, flip: true },
  // two strays
  { x: 9, y: 80, r: 21, rot: -70 },
  { x: 90, y: 72, r: 23, rot: 25, flip: true },
];

function BeanShape({ b }: { b: Bean }) {
  const rx = b.r;
  const ry = b.r * 0.64;
  const sx = b.flip ? -1 : 1;
  const size = rx * 2 + 40; // room for the shadow and the stroke
  return (
    <svg
      aria-hidden
      viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
      className="absolute"
      style={{ left: `${b.x}%`, top: `${b.y}%`, width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2 }}
    >
      <ellipse cx={10} cy={12} rx={rx * 1.05} ry={ry} transform={`rotate(${b.rot} 10 12)`} fill={SHADOW} />
      <g transform={`rotate(${b.rot}) scale(${sx} 1)`}>
        <ellipse rx={rx} ry={ry} fill={BEAN} stroke={INK} strokeWidth={2.4} />
        {/* flat lighter patch toward the light */}
        <ellipse cx={-rx * 0.18} cy={-ry * 0.22} rx={rx * 0.55} ry={ry * 0.42} fill={BEAN_LIGHT} />
        {/* the crease */}
        <path d={`M ${-rx * 0.82} 0 Q ${-rx * 0.35} ${-ry * 0.5} 0 0 T ${rx * 0.82} 0`} fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
        {/* pen strokes on the dark side */}
        <path
          d={`M ${rx * 0.25} ${ry * 0.55} l ${rx * 0.22} ${-ry * 0.3} M ${rx * 0.45} ${ry * 0.6} l ${rx * 0.2} ${-ry * 0.3} M ${rx * 0.62} ${ry * 0.5} l ${rx * 0.14} ${-ry * 0.25}`}
          fill="none"
          stroke={INK}
          strokeWidth={1.6}
          strokeLinecap="round"
          opacity={0.8}
        />
      </g>
    </svg>
  );
}

export default function Beans({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 ${className}`}>
      {BEANS.map((b, i) => (
        <BeanShape key={i} b={b} />
      ))}
    </div>
  );
}
