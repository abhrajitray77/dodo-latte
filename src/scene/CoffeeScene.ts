import * as THREE from 'three';
import gsap from 'gsap';
import { Fluid } from './Fluid';
import { Recorder } from './Recorder';
import { PaperSim, type PaperEvents, type PaperOptions } from './PaperSim';
import { catDataUrl } from '../art/cat';

export type Mode = 'hero' | 'top';
export type Interaction = 'none' | 'paint' | 'stir';
export type BrushSize = 's' | 'm' | 'l' | 'xl';

// milk drop size (uv^2) per brush
const BRUSH: Record<BrushSize, number> = { s: 0.00018, m: 0.0005, l: 0.0012, xl: 0.0028 };

/*
  Look: inked illustration with flat Pantone-style fills. Solid jade cup, ink outlines, pen hatching
  on the side away from the light, no shading gradients.
*/
const PALETTE = {
  jade: '#9fbb9a',
  jadeHatch: '#5f7a5c',
  inside: '#e0e4d2',
  ink: '#2b1d12',
};
/** Ink outline width in CSS px. */
const OUTLINE_PX = 2.4;

// Teacup proportions (world units)
const FOOT_R = 0.34;
const RIM_R = 0.8;
const RIM_Y = 0.9;
const COFFEE_Y = 0.74;
const COFFEE_R = 0.725;

// warm lamp from the top right (seen from above), slightly behind the cup in the hero view
const LIGHT_DIR = new THREE.Vector3(0.72, 0.68, -0.12).normalize();

const CAMERA = {
  hero: { pos: new THREE.Vector3(0, 1.85, 4.3), target: new THREE.Vector3(0, 0.42, 0), up: new THREE.Vector3(0, 1, 0), fov: 32 },
  top: { pos: new THREE.Vector3(0, COFFEE_Y + 3.35, 0.0001), target: new THREE.Vector3(0, COFFEE_Y, 0), up: new THREE.Vector3(0, 0, -1), fov: 32 },
};

const quad = (a: THREE.Vector2, c: THREE.Vector2, b: THREE.Vector2, steps: number) =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const u = 1 - t;
    return new THREE.Vector2(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.y + 2 * u * t * c.y + t * t * b.y);
  });

const v2 = (x: number, y: number) => new THREE.Vector2(x, y);

/** Outer body: foot + rounded bowl up to the outer edge of the rim. */
function bodyProfile() {
  return [v2(0, 0), v2(FOOT_R, 0), v2(FOOT_R, 0.06), ...quad(v2(FOOT_R - 0.02, 0.07), v2(RIM_R + 0.01, 0.1), v2(RIM_R, RIM_Y - 0.035), 24).slice(1)];
}

/** Rim band + inner bowl (cream). */
function rimProfile() {
  return [
    v2(RIM_R, RIM_Y - 0.035),
    v2(RIM_R + 0.005, RIM_Y - 0.01),
    v2(RIM_R - 0.015, RIM_Y + 0.005),
    v2(RIM_R - 0.05, RIM_Y),
    ...quad(v2(RIM_R - 0.055, RIM_Y - 0.03), v2(RIM_R - 0.06, 0.14), v2(0.28, 0.12), 24),
    v2(0, 0.12),
  ];
}

/**
 * Flat "Pantone" fill with ink hatching: one solid colour, no shading, plus thin pen strokes on the
 * side away from the light (densest just past where a shadow would start). `alongX` picks which uv
 * axis the strokes follow (tubes run the other way round to lathes); amount 0 turns them off.
 */
function flatInk(fill: string, hatch = PALETTE.jadeHatch, alongX = false, freq = 46, amount = 1) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uFill: { value: new THREE.Color(fill) },
      uHatch: { value: new THREE.Color(hatch) },
      uAmount: { value: amount },
      uLightDir: { value: LIGHT_DIR },
      // optional engraving: a full-colour decal (alpha = coverage), mapped onto the front of the body
      uDecal: { value: null },
      uDecalOn: { value: 0 },
    },
    defines: { HATCH_COORD: alongX ? 'vUv.x' : 'vUv.y', HATCH_FREQ: freq.toFixed(1) },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uFill;
      uniform vec3 uHatch;
      uniform float uAmount;
      uniform vec3 uLightDir;
      uniform sampler2D uDecal;
      uniform float uDecalOn;
      varying vec3 vNormal;
      varying vec2 vUv;
      void main() {
        float d = dot(normalize(vNormal), uLightDir);
        float stroke = 1.0 - smoothstep(0.07, 0.13, fract(HATCH_COORD * HATCH_FREQ));
        float zone = (1.0 - smoothstep(-0.12, 0.0, d)) * (1.0 - smoothstep(-0.3, -0.8, d) * 0.75);
        vec3 col = mix(uFill, uHatch, stroke * zone * uAmount);
        // engraving on the front of the cup (u = 0 faces the hero camera; v runs up the wall).
        // The patch is about 2.3x wider than tall in world units, matching the decal canvas.
        vec2 e = vec2((fract(vUv.x + 0.5) - 0.5 + 0.09) / 0.18, (vUv.y - 0.48) / 0.44);
        if (uDecalOn > 0.5 && e.x > 0.0 && e.x < 1.0 && e.y > 0.0 && e.y < 1.0) {
          vec4 decal = texture2D(uDecal, e);
          col = mix(col, decal.rgb, decal.a);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

/**
 * Ink outline: the same mesh drawn inside-out and pushed out along its normals by a constant
 * number of screen pixels, so the line stays the same width from both camera angles.
 */
const outlineMaterial = new THREE.ShaderMaterial({
  uniforms: { uInk: { value: new THREE.Color(PALETTE.ink) }, uPx: { value: OUTLINE_PX }, uK: { value: 0.001 } },
  side: THREE.BackSide,
  vertexShader: /* glsl */ `
    uniform float uPx;
    uniform float uK; // world units per pixel at distance 1
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vec3 n = normalize(normalMatrix * normal);
      mv.xyz += n * uPx * uK * -mv.z;
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uInk;
    void main() {
      gl_FragColor = vec4(uInk, 1.0);
      #include <colorspace_fragment>
    }
  `,
});

/** A mesh plus its ink outline. */
function inked(geometry: THREE.BufferGeometry, material: THREE.Material) {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, outlineMaterial));
  return group;
}

/** Outer radius of the bowl at height y (for attaching the handle). */
function bowlRadiusAt(y: number) {
  const p = bodyProfile();
  for (let i = 1; i < p.length; i++) {
    if (p[i].y >= y) {
      const t = (y - p[i - 1].y) / Math.max(p[i].y - p[i - 1].y, 1e-6);
      return THREE.MathUtils.lerp(p[i - 1].x, p[i].x, t);
    }
  }
  return RIM_R;
}

const coffeeVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// The dye texture already holds the whole surface (crema, bubbles, milk) and moves as one liquid.
// Here we only add the darker meniscus at the cup wall and a faint sheen.
const coffeeFragment = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uDye;
  void main() {
    vec3 col = texture2D(uDye, vUv).rgb;
    float r = length(vUv - 0.5) * 2.0;
    col = mix(col, vec3(0.17, 0.08, 0.05), smoothstep(0.9, 1.0, r) * 0.6);
    // inked edge where the coffee meets the cup
    col = mix(col, vec3(0.1, 0.06, 0.04), smoothstep(0.972, 0.988, r));
    // warm lamp from the top right: brighter there, a little darker toward the bottom left
    float lamp = smoothstep(1.1, 0.0, length(vUv - vec2(0.78, 0.8)));
    col *= mix(0.86, 1.06, lamp);
    float sheen = smoothstep(0.5, 0.0, length(vUv - vec2(0.68, 0.7)));
    col += sheen * vec3(0.045, 0.032, 0.02);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class CoffeeScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(CAMERA.hero.fov, 1, 0.1, 50);
  private cup = new THREE.Group();
  private coffee: THREE.Mesh<THREE.CircleGeometry, THREE.ShaderMaterial>;
  private fluid: Fluid;
  private clock = new THREE.Clock();
  private raf = 0;
  private reducedMotion: boolean;

  // camera blend 0 = hero, 1 = top
  private cam = { t: 0 };
  private mode: Mode = 'hero';

  // springy tilt (x = pitch, y = roll)
  private tiltTarget = new THREE.Vector2();
  private tilt = new THREE.Vector2();
  private tiltVel = new THREE.Vector2();

  private pointerNdc = new THREE.Vector2();
  private lastUv: THREE.Vector2 | null = null;
  private raycaster = new THREE.Raycaster();
  private dragging = false;
  private interaction: Interaction = 'none';
  private brush: BrushSize = 'xl';
  private flow = 0.5;
  // time-lapse and numbers for the receipt
  private recorder = new Recorder(144);
  private frameBuf = new Uint8Array(144 * 144 * 4);
  private stats = { strokes: 0, pourSeconds: 0, stirSeconds: 0 };
  private paper: PaperSim | null = null;
  private strokeChanged = false;
  private pendingCheckpoint = 0;
  private onPointer?: (active: boolean) => void;
  private onHistory?: (canUndo: boolean, canRedo: boolean) => void;

  constructor(private canvas: HTMLCanvasElement) {
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);

    // sharper surface on big screens, lighter on phones
    const px = Math.max(window.innerWidth, window.innerHeight) * this.renderer.getPixelRatio();
    this.fluid = new Fluid(this.renderer, 128, px > 1100 ? 1024 : 512);


    // cup body (flat jade with pen hatching), rim and inner bowl (flat pale), all with ink outlines
    const body = new THREE.LatheGeometry(bodyProfile(), 96);
    body.computeVertexNormals();
    const bodyMaterial = flatInk(PALETTE.jade);
    this.cup.add(inked(body, bodyMaterial));
    this.loadEngraving(bodyMaterial);
    const rim = new THREE.LatheGeometry(rimProfile(), 96);
    rim.computeVertexNormals();
    this.cup.add(inked(rim, flatInk(PALETTE.inside, PALETTE.jadeHatch, false, 0, 0)));

    // thick looped handle: both ends start inside the wall so it always stays attached
    const topY = 0.7;
    const bottomY = 0.36;
    const top = new THREE.Vector3(bowlRadiusAt(topY) - 0.05, topY, 0);
    const bottom = new THREE.Vector3(bowlRadiusAt(bottomY) - 0.05, bottomY, 0);
    const handleCurve = new THREE.CubicBezierCurve3(
      top,
      new THREE.Vector3(top.x + 0.5, topY + 0.1, 0),
      new THREE.Vector3(bottom.x + 0.5, bottomY - 0.12, 0),
      bottom
    );
    const handle = new THREE.TubeGeometry(handleCurve, 48, 0.062, 20, false);
    this.cup.add(inked(handle, flatInk(PALETTE.jade, PALETTE.jadeHatch, true, 30)));

    // coffee surface, shaded from the fluid
    this.coffee = new THREE.Mesh(
      new THREE.CircleGeometry(COFFEE_R, 128),
      new THREE.ShaderMaterial({
        vertexShader: coffeeVertex,
        fragmentShader: coffeeFragment,
        uniforms: { uDye: { value: this.fluid.texture } },
      })
    );
    this.coffee.rotation.x = -Math.PI / 2;
    this.coffee.position.y = COFFEE_Y;
    this.cup.add(this.coffee);

    this.scene.add(this.cup);

    this.applyCamera();

    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('resize', this.resize);
    this.resize();
    this.loop();
  }

  /** Called with true while the user is painting or stirring. */
  setPointerListener(fn: (active: boolean) => void) {
    this.onPointer = fn;
  }

  /** Called whenever undo / redo availability changes. */
  setHistoryListener(fn: (canUndo: boolean, canRedo: boolean) => void) {
    this.onHistory = fn;
    this.emitHistory();
  }

  private emitHistory() {
    this.onHistory?.(this.fluid.canUndo, this.fluid.canRedo);
  }

  private checkpoint() {
    this.pendingCheckpoint = 0;
    this.fluid.checkpoint();
    this.emitHistory();
  }

  /** Save a stroke that is still settling right away (before undo, a new stroke, etc). */
  private flushCheckpoint() {
    if (this.pendingCheckpoint > 0) this.checkpoint();
  }

  undo() {
    this.flushCheckpoint();
    this.recorder.touch(this.clock.elapsedTime);
    this.fluid.undo();
    this.emitHistory();
  }

  redo() {
    this.flushCheckpoint();
    this.recorder.touch(this.clock.elapsedTime);
    this.fluid.redo();
    this.emitHistory();
  }

  /** Wipe the latte art back to plain coffee (undoable). */
  clearArt() {
    this.flushCheckpoint();
    this.fluid.reset();
    this.checkpoint();
    // a clean cup starts the story over: the time-lapse and the numbers begin again from here
    this.recorder.reset();
    this.stats = { strokes: 0, pourSeconds: 0, stirSeconds: 0 };
    this.captureFrame(this.clock.elapsedTime);
  }

  /** How heavy the pour is, 0..1 (the Flow slider): how fast the foam spreads from the stream. */
  setFlow(flow: number) {
    this.flow = THREE.MathUtils.clamp(flow, 0, 1);
  }

  setBrushSize(size: BrushSize) {
    this.brush = size;
  }

  /** What a drag does in top view. */
  setInteraction(interaction: Interaction) {
    this.interaction = interaction;
    this.lastUv = null;
    if (interaction === 'stir') this.recorder.markStir();
    // the time-lapse opens on the clean cup
    if (interaction === 'paint' && this.recorder.frames.length === 0) this.captureFrame(this.clock.elapsedTime);
    // stirring is loose and swirly; milk art is a touch thicker so strokes hold their shape
    this.fluid.drag = interaction === 'stir' ? 0.985 : 0.972;
  }

  setMode(mode: Mode) {
    this.mode = mode;
    this.lastUv = null;
    return new Promise<void>((resolve) => {
      gsap.to(this.cam, {
        t: mode === 'top' ? 1 : 0,
        duration: this.reducedMotion ? 0 : 1.6,
        ease: 'power3.inOut',
        onUpdate: () => this.applyCamera(),
        onComplete: () => {
          // arrive in a still cup: no leftover slosh or drift to disturb the art
          if (mode === 'top') this.fluid.stopMotion();
          resolve();
        },
      });
    });
  }

  /** One milk stroke from a to b at the brush size, carrying the liquid along with the drag. */
  private paintSegment(ax: number, ay: number, bx: number, by: number, size: number) {
    const dx = bx - ax;
    const dy = by - ay;
    const dist = Math.hypot(dx, dy);
    const n = Math.max(1, Math.ceil(dist / (Math.sqrt(size) * 0.3)));
    const radius = size * THREE.MathUtils.clamp(1 - dist * 6, 0.6, 1);
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      this.fluid.addMilk(ax + dx * t, ay + dy * t, 0.85, radius);
    }
    const k = this.fluid.simSize * 14;
    this.fluid.addForce(bx, by, dx * k, dy * k, Math.max(0.0012, size * 1.1));
  }

  /** Print a receipt: the sheet is simulated and drawn over the scene until hidePaper(). */
  showPaper(canvas: HTMLCanvasElement, opts: PaperOptions, events: PaperEvents) {
    this.paper?.dispose();
    this.paper = new PaperSim(canvas, opts, { width: this.canvas.clientWidth, height: this.canvas.clientHeight }, events);
    return this.paper;
  }

  hidePaper() {
    this.paper?.dispose();
    this.paper = null;
  }

  /** Everything the receipt needs. Captures a frame first if nothing was recorded yet. */
  getReceiptData() {
    if (this.recorder.frames.length === 0) this.captureFrame(this.clock.elapsedTime);
    return {
      frames: this.recorder.frames,
      frameSize: this.recorder.size,
      stirFrom: this.recorder.stirFrom,
      ...this.stats,
      size: this.brush,
      flow: this.flow,
    };
  }

  private captureFrame(time: number) {
    this.fluid.readFrame(this.recorder.size, this.frameBuf);
    this.recorder.push(this.frameBuf.slice(), time);
  }

  /** A brand new cup: new crema, empty history. */
  resetCoffee() {
    this.recorder.reset();
    this.stats = { strokes: 0, pourSeconds: 0, stirSeconds: 0 };
    this.fluid.reset(true);
    this.fluid.clearHistory();
    this.checkpoint();
  }

  /** The engraving: the cat with "click anywhere to start" lettered under it, drawn into a texture. */
  private loadEngraving(material: THREE.ShaderMaterial) {
    const img = new Image();
    img.onload = async () => {
      // wait for the web font so the lettering is not drawn in a fallback face
      try {
        await document.fonts.ready;
      } catch {
        /* fonts API unavailable: draw anyway */
      }
      const w = 1024;
      const h = 448;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      const cat = 290;
      ctx.drawImage(img, (w - cat) / 2, 14, cat, cat);
      ctx.fillStyle = PALETTE.ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = '500 48px "Apfel Grotezk", Inter, ui-sans-serif, system-ui, sans-serif';
      ctx.fillText('click anywhere to start', w / 2, 392);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.anisotropy = 8;
      material.uniforms.uDecal.value = texture;
      material.uniforms.uDecalOn.value = 1;
    };
    img.src = catDataUrl(PALETTE.ink);
  }

  /** World units per screen pixel at distance 1, for the outline width. */
  private updateOutlineScale() {
    const fov = THREE.MathUtils.degToRad(this.camera.getEffectiveFOV());
    outlineMaterial.uniforms.uK.value = (2 * Math.tan(fov / 2)) / Math.max(1, this.canvas.clientHeight);
  }

  private applyCamera() {
    const t = this.cam.t;
    const a = CAMERA.hero;
    const b = CAMERA.top;
    this.camera.position.lerpVectors(a.pos, b.pos, t);
    this.camera.up.lerpVectors(a.up, b.up, t).normalize();
    this.camera.lookAt(new THREE.Vector3().lerpVectors(a.target, b.target, t));
    this.camera.fov = THREE.MathUtils.lerp(a.fov, b.fov, t);
    this.camera.updateProjectionMatrix();
    this.updateOutlineScale();
  }

  private resize = () => {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the cup comfortably framed on tall phones
    this.camera.zoom = w / h < 0.75 ? 0.68 : 1;
    this.camera.updateProjectionMatrix();
    this.updateOutlineScale();
    this.paper?.resize(w, h);
  };

  private toNdc(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointerNdc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  }

  private coffeeUv(): THREE.Vector2 | null {
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hit = this.raycaster.intersectObject(this.coffee)[0];
    return hit?.uv ? hit.uv.clone() : null;
  }

  private handlePointerDown = (e: PointerEvent) => {
    this.flushCheckpoint();
    this.dragging = true;
    this.canvas.setPointerCapture(e.pointerId);
    this.toNdc(e);
    this.lastUv = this.mode === 'top' ? this.coffeeUv() : null;
    if (this.interaction === 'paint' && this.lastUv) {
      this.stats.strokes++;
      this.strokeChanged = true;
      this.onPointer?.(true);
    }
  };

  private handlePointerUp = () => {
    // save the undo step once the milk has settled, so undo/redo restores the flowed result
    if (this.dragging && this.strokeChanged) this.pendingCheckpoint = this.clock.elapsedTime + 1.2;
    this.strokeChanged = false;
    this.dragging = false;
    this.lastUv = null;
    this.onPointer?.(false);
  };

  private handlePointerMove = (e: PointerEvent) => {
    this.toNdc(e);
    if (this.mode === 'hero') {
      this.tiltTarget.set(-this.pointerNdc.y * 0.1, -this.pointerNdc.x * 0.14);
      return;
    }
    if (!this.dragging || this.interaction === 'none') return;
    const uv = this.coffeeUv();
    if (uv && this.lastUv) {
      const dx = uv.x - this.lastUv.x;
      const dy = uv.y - this.lastUv.y;
      if (this.interaction === 'stir') {
        const k = this.fluid.simSize * 55;
        this.fluid.addForce(uv.x, uv.y, dx * k, dy * k, 0.0025);
      } else {
        // paint: the milk follows the pointer (and keeps pouring every frame in the loop)
        this.paintSegment(this.lastUv.x, this.lastUv.y, uv.x, uv.y, BRUSH[this.brush]);
      }
      this.strokeChanged = true;
      this.onPointer?.(true);
    }
    this.lastUv = uv;
  };

  private spring(pos: THREE.Vector2, vel: THREE.Vector2, goal: THREE.Vector2, stiffness: number, damping: number, dt: number) {
    const ax = (goal.x - pos.x) * stiffness - vel.x * damping;
    const ay = (goal.y - pos.y) * stiffness - vel.y * damping;
    vel.x += ax * dt;
    vel.y += ay * dt;
    pos.x += vel.x * dt;
    pos.y += vel.y * dt;
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 1 / 30);
    const time = this.clock.elapsedTime;
    const hero = 1 - this.cam.t;

    // springy tilt + idle sway (hero only)
    const sway = this.reducedMotion || this.mode !== 'hero' ? 0 : 1;
    const goal = this.mode === 'hero' ? this.tiltTarget.clone() : new THREE.Vector2();
    goal.x += Math.sin(time * 0.9) * 0.03 * sway;
    goal.y += Math.cos(time * 0.7) * 0.04 * sway;
    const prevTilt = this.tilt.clone();
    this.spring(this.tilt, this.tiltVel, goal, 60, 9, dt);
    this.cup.rotation.x = this.tilt.x * hero;
    this.cup.rotation.z = this.tilt.y * hero;
    this.cup.position.y = sway * Math.sin(time * 1.3) * 0.02;

    // slosh: tilting the cup pushes the coffee the other way (hero only, never while drawing)
    const tiltSpeed = this.tilt.clone().sub(prevTilt);
    if (!this.reducedMotion && this.cam.t === 0 && tiltSpeed.lengthSq() > 1e-7) {
      const k = this.fluid.simSize * 260;
      this.fluid.addForce(0.5, 0.5, -tiltSpeed.y * k, tiltSpeed.x * k, 0.08);
    }

    // idle: tiny random currents so the crema drifts, only in the hero view
    if (!this.reducedMotion && this.cam.t === 0 && Math.random() < dt * 1.5) {
      const a = Math.random() * Math.PI * 2;
      const s = this.fluid.simSize * 0.35;
      this.fluid.addForce(0.25 + Math.random() * 0.5, 0.25 + Math.random() * 0.5, Math.cos(a) * s, Math.sin(a) * s, 0.01);
    }

    if (this.pendingCheckpoint > 0 && time >= this.pendingCheckpoint) this.flushCheckpoint();

    // paint: while pressed, foam lands at the pointer and pushes the whole surface outward from there
    if (this.interaction === 'paint' && this.dragging && this.lastUv) {
      this.stats.pourSeconds += dt;
      this.recorder.touch(time);
      const size = BRUSH[this.brush];
      this.fluid.pour(this.lastUv.x, this.lastUv.y, this.flow * size * 90, Math.sqrt(size));
      this.fluid.addMilk(this.lastUv.x, this.lastUv.y, 0.85, size);
    }

    if (this.interaction === 'stir' && this.dragging) {
      this.stats.stirSeconds += dt;
      this.recorder.touch(time);
    }

    this.fluid.step(dt);
    if (this.interaction !== 'none' && this.recorder.wantsFrame(time)) this.captureFrame(time);
    this.coffee.material.uniforms.uDye.value = this.fluid.texture;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
    if (this.paper) {
      this.paper.update(dt);
      this.paper.render(this.renderer);
    }
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.hidePaper();
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('resize', this.resize);
    this.fluid.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
          if ('map' in m && m.map instanceof THREE.Texture) m.map.dispose();
          m.dispose();
        });
      }
    });
    this.renderer.dispose();
  }
}
