/**
 * A cute sitting cat, facing you, in the inked style: flat fills, ink outlines, happy closed eyes,
 * a jade collar with a bell, a curled tail. ViewBox 200 x 200. Used as the engraving on the cup.
 */
export function catSvg(ink = '#2b1d12') {
  const cream = '#f6efe0';
  const pink = '#e9b6a9';
  const jade = '#6f8f6b';
  const bell = '#e3c56b';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <g stroke="${ink}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
    <!-- tail -->
    <path d="M140 150 C 170 154, 182 124, 164 106 C 164 118, 160 132, 142 138 Z" fill="${cream}"/>
    <path d="M160 116 c 4 6, 4 14, -2 22" fill="none" stroke="${jade}" stroke-width="3"/>
    <!-- body -->
    <ellipse cx="100" cy="142" rx="46" ry="40" fill="${cream}"/>
    <!-- belly stripes -->
    <path d="M92 128 c 8 -4, 16 -4, 24 0 M 90 140 c 10 -4, 20 -4, 30 0" fill="none" stroke="${jade}" stroke-width="3"/>
    <!-- paws -->
    <ellipse cx="82" cy="178" rx="13" ry="7" fill="${cream}"/>
    <ellipse cx="118" cy="178" rx="13" ry="7" fill="${cream}"/>
    <path d="M78 180 v 4 M 84 180 v 4 M 114 180 v 4 M 120 180 v 4" fill="none" stroke-width="2.5"/>
    <!-- ears -->
    <path d="M66 62 L 70 26 L 98 50 Z" fill="${cream}"/>
    <path d="M134 62 L 130 26 L 102 50 Z" fill="${cream}"/>
    <path d="M74 56 L 76 38 L 90 50 Z" fill="${pink}" stroke="none"/>
    <path d="M126 56 L 124 38 L 110 50 Z" fill="${pink}" stroke="none"/>
    <!-- head -->
    <circle cx="100" cy="84" r="40" fill="${cream}"/>
    <!-- forehead stripes -->
    <path d="M90 50 l 3 11 M 100 47 l 0 12 M 110 50 l -3 11" fill="none" stroke="${jade}" stroke-width="3"/>
    <!-- happy eyes -->
    <path d="M78 86 q 7 -9 14 0 M 108 86 q 7 -9 14 0" fill="none"/>
    <!-- blush -->
    <circle cx="74" cy="98" r="5" fill="${pink}" stroke="none" opacity="0.85"/>
    <circle cx="126" cy="98" r="5" fill="${pink}" stroke="none" opacity="0.85"/>
    <!-- nose and mouth -->
    <path d="M96 95 h 8 l -4 5 Z" fill="${pink}" stroke-width="3"/>
    <path d="M100 100 q -5 7 -11 3 M 100 100 q 5 7 11 3" fill="none" stroke-width="3"/>
    <!-- whiskers -->
    <path d="M56 92 L 76 95 M 56 104 L 76 100 M 144 92 L 124 95 M 144 104 L 124 100" fill="none" stroke-width="2.5"/>
    <!-- collar + bell -->
    <path d="M70 116 Q 100 130 130 116" fill="none" stroke="${jade}" stroke-width="7"/>
    <path d="M70 116 Q 100 130 130 116" fill="none" stroke-width="2"/>
    <circle cx="100" cy="128" r="6" fill="${bell}" stroke-width="3"/>
  </g>
</svg>`;
}

export function catDataUrl(ink?: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(catSvg(ink))}`;
}
