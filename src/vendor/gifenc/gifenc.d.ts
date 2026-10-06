/* Types for the vendored gifenc 1.0.3 ESM build (MIT, Matt DesLauriers). Only what we use. */

export type Palette = number[][];
export type PaletteFormat = 'rgb565' | 'rgb444' | 'rgba4444';

export interface FrameOptions {
  palette?: Palette;
  first?: boolean;
  transparent?: boolean;
  transparentIndex?: number;
  /** Frame delay in milliseconds. */
  delay?: number;
  /** -1 = play once, 0 = loop forever, n = extra loops. */
  repeat?: number;
  dispose?: number;
  colorDepth?: number;
}

export interface GIFEncoderInstance {
  reset(): void;
  finish(): void;
  bytes(): Uint8Array;
  bytesView(): Uint8Array;
  writeFrame(index: Uint8Array, width: number, height: number, opts?: FrameOptions): void;
}

export function GIFEncoder(opts?: { auto?: boolean; initialCapacity?: number }): GIFEncoderInstance;

export function quantize(
  rgba: Uint8Array | Uint8ClampedArray,
  maxColors: number,
  opts?: { format?: PaletteFormat; oneBitAlpha?: boolean | number; clearAlpha?: boolean; clearAlphaThreshold?: number; clearAlphaColor?: number },
): Palette;

export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette, format?: PaletteFormat): Uint8Array;

export default GIFEncoder;
