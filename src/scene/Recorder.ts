/**
 * Time-lapse of the coffee surface for the receipt: small RGBA frames captured while something
 * is happening (pouring, stirring, undo) and for a moment after, so settling motion is kept.
 * When the recording gets long it drops every other frame and halves its rate, so the whole
 * session always fits in a fixed number of frames and plays back as a quicker time-lapse.
 */
export class Recorder {
  static readonly MAX_FRAMES = 160;
  readonly size: number;
  frames: Uint8Array[] = [];
  /** Index of the first frame after stirring began, or -1. */
  stirFrom = -1;
  private interval = 1 / 8;
  private last = -Infinity;
  private busyUntil = -Infinity;

  constructor(size = 96) {
    this.size = size;
  }

  reset() {
    this.frames = [];
    this.stirFrom = -1;
    this.interval = 1 / 8;
    this.last = -Infinity;
    this.busyUntil = -Infinity;
  }

  /** Something changed on the surface: keep capturing for a while. */
  touch(time: number) {
    this.busyUntil = time + 1.5;
  }

  wantsFrame(time: number) {
    return time < this.busyUntil && time - this.last >= this.interval;
  }

  markStir() {
    if (this.stirFrom < 0) this.stirFrom = this.frames.length;
  }

  push(frame: Uint8Array, time: number) {
    this.frames.push(frame);
    this.last = time;
    if (this.frames.length <= Recorder.MAX_FRAMES) return;
    // too long: keep every other frame (always the last one), and record half as often from now on
    const kept = this.frames.filter((_, i) => i % 2 === 0 || i === this.frames.length - 1);
    if (this.stirFrom >= 0) this.stirFrom = Math.ceil(this.stirFrom / 2);
    this.frames = kept;
    this.interval *= 2;
  }
}
