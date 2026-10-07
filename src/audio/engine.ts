/**
 * All sound for Stir, synthesised with the Web Audio API: a lo-fi loop, pouring and stirring
 * textures, the receipt printer, paper rips, bells and button clicks. No audio files.
 *
 * Browsers only let audio start from a user gesture, so call `ensure()` from a pointer event
 * before anything else. Every method is safe to call before that: it just does nothing.
 */

const STORAGE_KEY = 'stir-sound';
const MUSIC_LEVEL = 0.3;
const SFX_LEVEL = 0.7;

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

/* The loop: a relaxed ii-V-I-vi in C, two bars per chord, Rhodes voicings. */
const BPM = 72;
const BEAT = 60 / BPM;
const SWING = 0.09; // offbeat eighths pushed late, as a fraction of a beat
const CHORDS = [
  { root: 48, notes: [48, 52, 55, 59, 62] }, // Cmaj9
  { root: 45, notes: [45, 48, 52, 55, 59] }, // Am9
  { root: 50, notes: [50, 53, 57, 60, 64] }, // Dm9
  { root: 43, notes: [43, 47, 53, 57, 64] }, // G13
];
const MELODY_SCALE = [60, 62, 64, 67, 69, 72, 74, 76, 79]; // C major pentatonic, two octaves

type Texture = { source: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode; timer: number };

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private sfx!: GainNode;
  private reverb!: ConvolverNode;
  private wobble!: GainNode; // LFO output in cents, patched into note detune
  private noiseBuffer!: AudioBuffer;
  private pourTex: Texture | null = null;
  private stirTex: Texture | null = null;
  private pourLevel = 0;
  private stirLevel = 0;
  private musicOn = false;
  private scheduler = 0;
  private nextStep = 0;
  private step = 0;
  private lastMelody = -10;
  private melodyIndex = 4;
  private duck = 0;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(STORAGE_KEY) === 'off';
    } catch {
      /* private mode */
    }
  }

  get ready() {
    return this.ctx !== null;
  }

  /** Create the audio graph. Must be called from a user gesture. */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    // brick wall: whatever adds up, it never clips
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 2;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.12;
    this.master.connect(limiter).connect(ctx.destination);

    // music bus: warm low-pass, gentle compression
    const lofi = ctx.createBiquadFilter();
    lofi.type = 'lowpass';
    lofi.frequency.value = 2600;
    lofi.Q.value = 0.5;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 55;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    this.music = ctx.createGain();
    this.music.gain.value = 0;
    this.music.connect(lofi).connect(hp).connect(comp).connect(this.master);

    this.sfx = ctx.createGain();
    this.sfx.gain.value = SFX_LEVEL;
    this.sfx.connect(this.master);

    // a soft room, from decaying noise
    this.reverb = ctx.createConvolver();
    const seconds = 2.0;
    const ir = ctx.createBuffer(2, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        lp += ((Math.random() * 2 - 1) - lp) * 0.18; // one-pole low-pass: a soft, dark tail
        d[i] = lp * Math.pow(1 - i / d.length, 2.4);
      }
    }
    this.reverb.buffer = ir;
    this.reverb.connect(this.music);

    // tape wobble: a slow LFO in cents
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.35;
    this.wobble = ctx.createGain();
    this.wobble.gain.value = 5;
    lfo.connect(this.wobble);
    lfo.start();

    // two seconds of white noise, reused everywhere
    this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const n = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    try {
      localStorage.setItem(STORAGE_KEY, muted ? 'off' : 'on');
    } catch {
      /* ignore */
    }
    if (!this.ctx) return;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.08);
  }

  /* ---------- small helpers ---------- */

  private noise(duration: number) {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    src.loopStart = Math.random() * 1.5;
    src.loopEnd = src.loopStart + 0.5;
    src.start();
    src.stop(this.ctx!.currentTime + duration + 0.05);
    return src;
  }

  private env(gain: GainNode, t: number, peak: number, attack: number, decay: number, sustain = 0, release = 0, hold = 0) {
    const g = gain.gain;
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(peak, t + attack);
    g.exponentialRampToValueAtTime(Math.max(peak * sustain, 0.0001), t + attack + decay);
    if (hold > 0) g.setValueAtTime(Math.max(peak * sustain, 0.0001), t + attack + decay + hold);
    g.exponentialRampToValueAtTime(0.0001, t + attack + decay + hold + Math.max(release, 0.02));
  }

  /* ---------- one-shots ---------- */

  /** Soft button click: a tiny filtered tick. */
  click(soft = false) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(soft ? 1200 : 1600, t);
    osc.frequency.exponentialRampToValueAtTime(soft ? 500 : 650, t + 0.05);
    const g = ctx.createGain();
    this.env(g, t, soft ? 0.12 : 0.2, 0.002, 0.06);
    osc.connect(g).connect(this.sfx);
    osc.start(t);
    osc.stop(t + 0.12);
    const n = this.noise(0.03);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 3200;
    f.Q.value = 1.2;
    const ng = ctx.createGain();
    this.env(ng, t, soft ? 0.05 : 0.09, 0.001, 0.025);
    n.connect(f).connect(ng).connect(this.sfx);
  }

  /** A small bell. */
  bell(midi: number, when = 0, level = 0.25, decay = 1.3) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const f = midiHz(midi);
    for (const [ratio, amp, dec] of [
      [1, 1, decay],
      [2.76, 0.35, decay * 0.5],
      [5.4, 0.12, decay * 0.25],
    ]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f * ratio;
      const g = ctx.createGain();
      this.env(g, t, level * amp, 0.004, dec);
      osc.connect(g).connect(this.sfx);
      g.connect(this.reverb);
      osc.start(t);
      osc.stop(t + dec + 0.1);
    }
  }

  /** The camera glide. */
  whoosh() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const n = this.noise(1.2);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 0.8;
    f.frequency.setValueAtTime(250, t);
    f.frequency.exponentialRampToValueAtTime(1800, t + 0.6);
    f.frequency.exponentialRampToValueAtTime(300, t + 1.2);
    const g = ctx.createGain();
    this.env(g, t, 0.14, 0.45, 0.6);
    n.connect(f).connect(g).connect(this.sfx);
  }

  /** Paper giving at the perforation. `final` is the last, longer rip. */
  rip(final = false) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dur = final ? 0.32 : 0.16;
    const n = this.noise(dur);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.9;
    f.frequency.setValueAtTime(700, t);
    f.frequency.exponentialRampToValueAtTime(final ? 3200 : 2400, t + dur);
    const g = ctx.createGain();
    // jagged envelope: paper fibres letting go in bursts
    const steps = final ? 9 : 5;
    g.gain.setValueAtTime(0.0001, t);
    for (let i = 0; i < steps; i++) {
      const ts = t + (dur * i) / steps;
      g.gain.linearRampToValueAtTime(rand(0.18, 0.42), ts + 0.006);
      g.gain.linearRampToValueAtTime(rand(0.04, 0.1), ts + dur / steps);
    }
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.02);
    n.connect(f).connect(g).connect(this.sfx);
    if (final) {
      // a little thump as it comes free
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(60, t + 0.12);
      const og = ctx.createGain();
      this.env(og, t, 0.18, 0.004, 0.14);
      osc.connect(og).connect(this.sfx);
      osc.start(t);
      osc.stop(t + 0.2);
    }
  }

  /** The thermal printer feeding the receipt out, for `seconds`, with a chime at the end. */
  printer(seconds: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.setDuck(0.45);

    // motor hum
    const hum = ctx.createGain();
    this.env(hum, t, 0.06, 0.15, 0.1, 0.9, 0.25, seconds - 0.5);
    for (const [type, freq, amp] of [
      ['sawtooth', 58, 1],
      ['square', 116, 0.4],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = amp;
      osc.connect(g).connect(hum);
      osc.start(t);
      osc.stop(t + seconds + 0.5);
    }
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    hum.connect(lp).connect(this.sfx);

    // thermal head ticks, a steady stepper rhythm
    const tickEvery = 0.036;
    for (let ts = t + 0.1; ts < t + seconds - 0.1; ts += tickEvery) {
      const n = ctx.createBufferSource();
      n.buffer = this.noiseBuffer;
      n.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = rand(2600, 3400);
      f.Q.value = 2;
      const g = ctx.createGain();
      this.env(g, ts, rand(0.025, 0.045), 0.001, 0.012);
      n.connect(f).connect(g).connect(this.sfx);
      n.start(ts);
      n.stop(ts + 0.03);
    }

    // done: a soft two-note chime, and the music comes back up
    this.bell(76, seconds + 0.05, 0.2, 1.4);
    this.bell(79, seconds + 0.22, 0.16, 1.6);
    window.setTimeout(() => this.setDuck(0), seconds * 1000);
  }

  /* ---------- continuous textures ---------- */

  private texture(kind: 'pour' | 'stir'): Texture {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = kind === 'pour' ? 900 : 380;
    filter.Q.value = kind === 'pour' ? 0.7 : 1.1;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = kind === 'pour' ? 2600 : 1500;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(lp).connect(gain).connect(this.sfx);
    src.start();
    // liquid burble: the level and the filter wander a little
    const timer = window.setInterval(() => {
      const level = kind === 'pour' ? this.pourLevel : this.stirLevel;
      if (level <= 0) return;
      const t = ctx.currentTime;
      gain.gain.setTargetAtTime(level * rand(0.7, 1.05), t, 0.05);
      filter.frequency.setTargetAtTime((kind === 'pour' ? 900 : 380) * rand(0.85, 1.2), t, 0.08);
    }, 90);
    return { source: src, gain, filter, timer };
  }

  private setTexture(kind: 'pour' | 'stir', level: number) {
    if (!this.ctx) return;
    const current = kind === 'pour' ? this.pourTex : this.stirTex;
    if (level > 0.001) {
      const tex = current ?? this.texture(kind);
      if (kind === 'pour') this.pourTex = tex;
      else this.stirTex = tex;
      tex.gain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.08);
    } else if (current) {
      current.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.18);
      window.clearInterval(current.timer);
      const src = current.source;
      window.setTimeout(() => src.stop(), 600);
      if (kind === 'pour') this.pourTex = null;
      else this.stirTex = null;
    }
  }

  /** Milk pouring: on/off and how heavy (0..1). */
  pour(on: boolean, flow: number) {
    this.pourLevel = on ? 0.1 + 0.3 * flow : 0;
    this.setTexture('pour', this.pourLevel);
  }

  /** Stirring: on/off and how fast (0..1). */
  stir(on: boolean, speed: number) {
    this.stirLevel = on ? 0.05 + 0.22 * Math.min(1, speed) : 0;
    this.setTexture('stir', this.stirLevel);
  }

  /* ---------- the lo-fi loop ---------- */

  private setDuck(amount: number) {
    this.duck = amount;
    if (!this.ctx || !this.musicOn) return;
    this.music.gain.setTargetAtTime(MUSIC_LEVEL * (1 - amount), this.ctx.currentTime, 0.3);
  }

  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.music.gain.setTargetAtTime(MUSIC_LEVEL * (1 - this.duck), this.ctx.currentTime, 2.5);
    this.vinyl();
    this.nextStep = this.ctx.currentTime + 0.2;
    this.step = 0;
    // schedule a second ahead so a backgrounded tab's slow timers do not leave gaps
    this.scheduler = window.setInterval(() => this.schedule(), 100);
  }

  stopMusic() {
    if (!this.ctx || !this.musicOn) return;
    this.musicOn = false;
    this.music.gain.setTargetAtTime(0, this.ctx.currentTime, 1.2);
    window.clearInterval(this.scheduler);
  }

  private schedule() {
    const ctx = this.ctx!;
    while (this.nextStep < ctx.currentTime + 1.0) {
      this.playStep(this.step, this.nextStep);
      const offbeat = this.step % 2 === 1;
      this.nextStep += BEAT * (offbeat ? 0.5 - SWING : 0.5 + SWING);
      this.step++;
    }
  }

  private playStep(step: number, t: number) {
    const beat = Math.floor(step / 2);
    const sub = step % 2;
    const chord = CHORDS[Math.floor(beat / 8) % CHORDS.length];
    const inChord = beat % 8;

    // Rhodes comping: a strum on bar 1, a lighter push on the "and" of 4, a medium hit on bar 2
    if (sub === 0 && inChord === 0) this.rhodes(chord.notes, t, 0.11);
    if (sub === 1 && inChord === 3) this.rhodes(chord.notes.slice(2), t, 0.06);
    if (sub === 0 && inChord === 4) this.rhodes(chord.notes, t, 0.085);
    if (sub === 1 && inChord === 6 && Math.random() < 0.5) this.rhodes(chord.notes.slice(1, 4), t, 0.05);

    // bass
    if (sub === 0 && (inChord === 0 || inChord === 4)) this.bass(chord.root - 12, t, 0.22, 1.3);
    if (sub === 1 && (inChord === 2 || inChord === 6) && Math.random() < 0.55) this.bass(chord.root - 12 + pick([0, 7, 12]), t, 0.11, 0.45);

    // percussion: only a soft, round kick on 1 and 3. No hats, no snare: nothing hissy or sharp.
    if (sub === 0 && beat % 2 === 0) this.kick(t, beat % 4 === 0 ? 1 : 0.7);

    // melody: a few notes per chord, wandering the pentatonic
    if (step - this.lastMelody >= 3 && Math.random() < (sub === 1 ? 0.2 : 0.14)) {
      this.melodyIndex = Math.max(0, Math.min(MELODY_SCALE.length - 1, this.melodyIndex + pick([-2, -1, -1, 1, 1, 2])));
      this.lead(MELODY_SCALE[this.melodyIndex], t, rand(0.08, 0.12), rand(0.7, 1.5));
      this.lastMelody = step;
    }
  }

  private rhodes(notes: number[], t: number, level: number) {
    const ctx = this.ctx!;
    notes.forEach((m, i) => {
      const at = t + i * 0.018; // a gentle strum
      const f = midiHz(m);
      const out = ctx.createGain();
      this.env(out, at, level, 0.012, 0.7, 0.35, 0.6, 0.9);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1400;
      out.connect(lp).connect(this.music);
      const send = ctx.createGain();
      send.gain.value = 0.35;
      lp.connect(send).connect(this.reverb);
      for (const [ratio, amp, type] of [
        [1, 1, 'sine'],
        [2, 0.22, 'sine'],
        [3, 0.06, 'triangle'],
      ] as const) {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = f * ratio;
        osc.detune.value = rand(-4, 4);
        this.wobble.connect(osc.detune);
        const g = ctx.createGain();
        g.gain.value = amp;
        osc.connect(g).connect(out);
        osc.start(at);
        osc.stop(at + 2.6);
      }
      // the tine: a fast, bright transient
      const tine = ctx.createOscillator();
      tine.type = 'sine';
      tine.frequency.value = f * 7;
      const tg = ctx.createGain();
      this.env(tg, at, level * 0.08, 0.002, 0.05);
      tine.connect(tg).connect(this.music);
      tine.start(at);
      tine.stop(at + 0.15);
    });
  }

  private bass(m: number, t: number, level: number, dur: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = midiHz(m);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    const g = ctx.createGain();
    this.env(g, t, level, 0.015, dur * 0.5, 0.5, 0.3, dur * 0.3);
    osc.connect(lp).connect(g).connect(this.music);
    osc.start(t);
    osc.stop(t + dur + 0.5);
  }

  private lead(m: number, t: number, level: number, dur: number) {
    const ctx = this.ctx!;
    const f = midiHz(m);
    const out = ctx.createGain();
    this.env(out, t, level, 0.06, dur * 0.4, 0.55, 0.5, dur * 0.4);
    out.connect(this.music);
    const send = ctx.createGain();
    send.gain.value = 0.5;
    out.connect(send).connect(this.reverb);
    for (const [ratio, amp] of [
      [1, 1],
      [2, 0.25],
    ]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f * ratio;
      this.wobble.connect(osc.detune);
      // vibrato that arrives after the note settles
      const vib = ctx.createOscillator();
      vib.frequency.value = 5;
      const vg = ctx.createGain();
      vg.gain.setValueAtTime(0, t);
      vg.gain.linearRampToValueAtTime(7, t + 0.35);
      vib.connect(vg).connect(osc.detune);
      vib.start(t);
      vib.stop(t + dur + 0.6);
      const g = ctx.createGain();
      g.gain.value = amp;
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + dur + 0.6);
    }
  }

  private kick(t: number, level = 1) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(95, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.16);
    const g = ctx.createGain();
    this.env(g, t, 0.14 * level, 0.004, 0.26);
    osc.connect(g).connect(this.music);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  /** Vinyl: a faint hiss with the odd pop, for as long as the music plays. */
  private vinyl() {
    const ctx = this.ctx!;
    const hiss = ctx.createBufferSource();
    hiss.buffer = this.noiseBuffer;
    hiss.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2200;
    bp.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.value = 0.006;
    hiss.connect(bp).connect(g).connect(this.music);
    hiss.start();
    const pop = () => {
      if (!this.musicOn) {
        hiss.stop();
        return;
      }
      const t = ctx.currentTime;
      const n = this.noise(0.02);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1200;
      const pg = ctx.createGain();
      this.env(pg, t, rand(0.012, 0.03), 0.001, rand(0.004, 0.01));
      n.connect(hp).connect(pg).connect(this.music);
      window.setTimeout(pop, rand(400, 1800));
    };
    window.setTimeout(pop, 400);
  }
}

export const audio = new AudioEngine();
