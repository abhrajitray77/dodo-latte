import * as THREE from 'three';

/**
 * A small 2D stable-fluids sim (after Pavel Dobryakov's WebGL Fluid, heavily trimmed).
 * velocity: RG = flow in sim texels per second.
 * dye: RGB = the whole coffee surface color (crema and milk), so everything moves together.
 * Everything lives in [0,1] UV space so it maps straight onto the coffee disc.
 */

const baseVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/*
  Advection, plus the pour. Foam landing on the surface piles up where the stream hits and shoves
  everything already there outward: a 2D source. Its outflow is Q / (2 pi r) (Q = area added per
  second), softened inside the stream's own radius, and it dies off toward the cup wall because the
  surface as a whole just rises. There is no inertia in this part: the spreading stops when the
  pour stops, like real foam.
*/
const advectFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uVelocity;
  uniform sampler2D uSource;
  uniform vec2 uTexel;       // velocity texel size
  uniform float uDt;
  uniform float uDissipation;
  uniform vec2 uPour;        // where the stream lands (uv)
  uniform float uPourQ;      // area of foam added per second (uv^2 / s), 0 = not pouring
  uniform float uPourCore;   // stream radius (uv)
  void main() {
    vec2 v = texture2D(uVelocity, vUv).xy * uTexel;
    if (uPourQ > 0.0) {
      vec2 d = vUv - uPour;
      vec2 spread = (uPourQ / 6.2832) * d / (dot(d, d) + uPourCore * uPourCore);
      vec2 c = (vUv - 0.5) * 2.0;
      spread *= max(0.0, 1.0 - dot(c, c)); // nothing moves at the wall
      v += spread;
    }
    gl_FragColor = uDissipation * texture2D(uSource, vUv - uDt * v);
  }
`;

const splatFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTarget;
  uniform vec3 uColor;
  uniform vec2 uPoint;
  uniform float uRadius;
  uniform float uMix;      // 0 = add (forces), > 0 = blend toward uColor with this strength (milk)
  uniform float uFeather;  // milk edge width in uv (about 1.5 dye texels)
  void main() {
    vec2 p = vUv - uPoint;
    float a;
    if (uMix > 0.0) {
      // milk: a solid center with a soft rim (no long gaussian tail that piles up into haze)
      float r = sqrt(uRadius);
      float soft = clamp(r * 0.4, uFeather, 0.022);
      a = 1.0 - smoothstep(r - soft, r + soft * 0.3, length(p));
    } else {
      a = exp(-dot(p, p) / uRadius);
    }
    vec3 base = texture2D(uTarget, vUv).xyz;
    vec3 outColor = uMix > 0.0 ? mix(base, uColor, clamp(a * uMix, 0.0, 1.0)) : base + a * uColor;
    gl_FragColor = vec4(outColor, 1.0);
  }
`;

// The untouched coffee: golden crema center, reddish-brown edge, soft mottling.
const cremaFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uSeed;
  float hash(vec2 p) { return fract(sin(dot(p + uSeed, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  void main() {
    vec3 center = vec3(0.79, 0.53, 0.31);
    vec3 edge = vec3(0.55, 0.27, 0.13);
    float r = length(vUv - 0.5) * 2.0;
    float n = noise(vUv * 7.0) * 0.6 + noise(vUv * 29.0) * 0.4;
    vec3 col = mix(center, edge, smoothstep(0.1, 1.0, r) + (n - 0.5) * 0.28);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const divergenceFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uVelocity;
  uniform vec2 uTexel;
  void main() {
    float L = texture2D(uVelocity, vUv - vec2(uTexel.x, 0.0)).x;
    float R = texture2D(uVelocity, vUv + vec2(uTexel.x, 0.0)).x;
    float B = texture2D(uVelocity, vUv - vec2(0.0, uTexel.y)).y;
    float T = texture2D(uVelocity, vUv + vec2(0.0, uTexel.y)).y;
    gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
  }
`;

const pressureFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uPressure;
  uniform sampler2D uDivergence;
  uniform vec2 uTexel;
  void main() {
    float L = texture2D(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
    float R = texture2D(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
    float B = texture2D(uPressure, vUv - vec2(0.0, uTexel.y)).x;
    float T = texture2D(uPressure, vUv + vec2(0.0, uTexel.y)).x;
    float div = texture2D(uDivergence, vUv).x;
    gl_FragColor = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);
  }
`;

const gradientFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uPressure;
  uniform sampler2D uVelocity;
  uniform vec2 uTexel;
  void main() {
    float L = texture2D(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
    float R = texture2D(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
    float B = texture2D(uPressure, vUv - vec2(0.0, uTexel.y)).x;
    float T = texture2D(uPressure, vUv + vec2(0.0, uTexel.y)).x;
    vec2 v = texture2D(uVelocity, vUv).xy - 0.5 * vec2(R - L, T - B);
    // keep the flow inside the cup: fade velocity near the rim
    float r = length(vUv - 0.5) * 2.0;
    v *= 1.0 - smoothstep(0.92, 1.0, r);
    gl_FragColor = vec4(v, 0.0, 1.0);
  }
`;

const clearFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTarget;
  uniform float uValue;
  void main() { gl_FragColor = uValue * texture2D(uTarget, vUv); }
`;

type Double = { read: THREE.WebGLRenderTarget; write: THREE.WebGLRenderTarget; swap: () => void };

function createTarget(size: number, type: THREE.TextureDataType = THREE.HalfFloatType) {
  return new THREE.WebGLRenderTarget(size, size, {
    type,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
  });
}

function createDouble(size: number): Double {
  const d = { read: createTarget(size), write: createTarget(size) } as Double;
  d.swap = () => {
    const t = d.read;
    d.read = d.write;
    d.write = t;
  };
  return d;
}

const material = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) =>
  new THREE.ShaderMaterial({ vertexShader: baseVertex, fragmentShader, uniforms, depthTest: false, depthWrite: false });

export class Fluid {
  readonly simSize: number;
  readonly dyeSize: number;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;
  private velocity: Double;
  private dye: Double;
  private pressure: Double;
  private divergence: THREE.WebGLRenderTarget;
  private seed = Math.random() * 100;
  /** How much motion survives each step. Lower = thicker liquid that comes to rest sooner. */
  drag = 0.985;
  private history: THREE.WebGLRenderTarget[] = [];
  private historyIndex = -1;
  private static readonly MAX_HISTORY = 30;
  private mats: Record<'advect' | 'splat' | 'divergence' | 'pressure' | 'gradient' | 'clear' | 'crema', THREE.ShaderMaterial>;

  constructor(renderer: THREE.WebGLRenderer, simSize = 128, dyeSize = 512) {
    this.renderer = renderer;
    this.simSize = simSize;
    this.dyeSize = dyeSize;
    this.velocity = createDouble(simSize);
    this.pressure = createDouble(simSize);
    this.divergence = createTarget(simSize);
    this.dye = createDouble(dyeSize);

    const texel = new THREE.Vector2(1 / simSize, 1 / simSize);
    this.mats = {
      advect: material(advectFrag, {
        uVelocity: { value: null },
        uSource: { value: null },
        uTexel: { value: texel },
        uDt: { value: 0 },
        uDissipation: { value: 1 },
        uPour: { value: new THREE.Vector2(0.5, 0.5) },
        uPourQ: { value: 0 },
        uPourCore: { value: 0.03 },
      }),
      splat: material(splatFrag, {
        uTarget: { value: null },
        uColor: { value: new THREE.Vector3() },
        uPoint: { value: new THREE.Vector2() },
        uRadius: { value: 0.001 },
        uMix: { value: 0 },
        uFeather: { value: 3 / dyeSize },
      }),
      crema: material(cremaFrag, { uSeed: { value: 0 } }),
      divergence: material(divergenceFrag, { uVelocity: { value: null }, uTexel: { value: texel } }),
      pressure: material(pressureFrag, { uPressure: { value: null }, uDivergence: { value: null }, uTexel: { value: texel } }),
      gradient: material(gradientFrag, { uPressure: { value: null }, uVelocity: { value: null }, uTexel: { value: texel } }),
      clear: material(clearFrag, { uTarget: { value: null }, uValue: { value: 0.8 } }),
    };

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mats.clear);
    this.scene.add(this.quad);
    this.reset();
  }

  /** The milk texture to show on the coffee surface. */
  get texture() {
    return this.dye.read.texture;
  }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  /** Push the liquid at uv with a force (in sim texels / s). */
  addForce(x: number, y: number, fx: number, fy: number, radius = 0.004) {
    const m = this.mats.splat;
    m.uniforms.uTarget.value = this.velocity.read.texture;
    m.uniforms.uPoint.value.set(x, y);
    m.uniforms.uColor.value.set(fx, fy, 0);
    m.uniforms.uRadius.value = radius;
    m.uniforms.uMix.value = 0;
    this.pass(m, this.velocity.write);
    this.velocity.swap();
  }

  /**
   * The stream is landing at uv this frame: everything on the surface spreads outward from there.
   * q = foam area added per second (uv^2 / s), core = the stream's radius (uv).
   */
  pour(x: number, y: number, q: number, core: number) {
    const u = this.mats.advect.uniforms;
    u.uPour.value.set(x, y);
    u.uPourQ.value = q;
    u.uPourCore.value = core;
  }

  /** Pour milk at uv: blends the surface toward milk white. */
  addMilk(x: number, y: number, amount = 1, radius = 0.0009) {
    const m = this.mats.splat;
    m.uniforms.uTarget.value = this.dye.read.texture;
    m.uniforms.uPoint.value.set(x, y);
    m.uniforms.uColor.value.set(0.98, 0.95, 0.9);
    m.uniforms.uRadius.value = radius;
    m.uniforms.uMix.value = amount;
    this.pass(m, this.dye.write);
    this.dye.swap();
  }

  /** Stop all motion (keeps the colors exactly where they are). */
  stopMotion() {
    const prevTarget = this.renderer.getRenderTarget();
    const m = this.mats.clear;
    m.uniforms.uValue.value = 0;
    for (const d of [this.velocity, this.pressure]) {
      m.uniforms.uTarget.value = d.read.texture;
      this.pass(m, d.write);
      d.swap();
    }
    this.renderer.setRenderTarget(prevTarget);
  }

  private copyInto(source: THREE.Texture, target: THREE.WebGLRenderTarget) {
    const m = this.mats.clear;
    m.uniforms.uTarget.value = source;
    m.uniforms.uValue.value = 1;
    this.pass(m, target);
  }

  /** Save the current surface as a new undo step (drops any redo steps). */
  checkpoint() {
    const prevTarget = this.renderer.getRenderTarget();
    this.history.splice(this.historyIndex + 1).forEach((t) => t.dispose());
    const snap = createTarget(this.dyeSize, THREE.UnsignedByteType);
    this.copyInto(this.dye.read.texture, snap);
    this.history.push(snap);
    if (this.history.length > Fluid.MAX_HISTORY) this.history.shift()?.dispose();
    this.historyIndex = this.history.length - 1;
    this.renderer.setRenderTarget(prevTarget);
  }

  private restore(index: number) {
    const prevTarget = this.renderer.getRenderTarget();
    this.historyIndex = index;
    this.copyInto(this.history[index].texture, this.dye.write);
    this.dye.swap();
    this.stopMotion(); // also strips freshness so the restored art holds still
    this.renderer.setRenderTarget(prevTarget);
  }

  get canUndo() {
    return this.historyIndex > 0;
  }

  get canRedo() {
    return this.historyIndex < this.history.length - 1;
  }

  undo() {
    if (this.canUndo) this.restore(this.historyIndex - 1);
  }

  redo() {
    if (this.canRedo) this.restore(this.historyIndex + 1);
  }

  /** Forget all undo steps. */
  clearHistory() {
    this.history.forEach((t) => t.dispose());
    this.history = [];
    this.historyIndex = -1;
  }

  /** Fresh coffee (same crema as before unless newCup), no motion. */
  reset(newCup = false) {
    const prevTarget = this.renderer.getRenderTarget();
    const m = this.mats.clear;
    m.uniforms.uValue.value = 0;
    for (const d of [this.velocity, this.pressure]) {
      m.uniforms.uTarget.value = d.read.texture;
      this.pass(m, d.write);
      d.swap();
    }
    if (newCup) this.seed = Math.random() * 100;
    this.mats.crema.uniforms.uSeed.value = this.seed;
    this.pass(this.mats.crema, this.dye.write);
    this.dye.swap();
    this.renderer.setRenderTarget(prevTarget);
  }

  step(dt: number) {
    const { advect, divergence, pressure, gradient, clear } = this.mats;
    const prevTarget = this.renderer.getRenderTarget();

    divergence.uniforms.uVelocity.value = this.velocity.read.texture;
    this.pass(divergence, this.divergence);

    clear.uniforms.uTarget.value = this.pressure.read.texture;
    clear.uniforms.uValue.value = 0.8;
    this.pass(clear, this.pressure.write);
    this.pressure.swap();

    pressure.uniforms.uDivergence.value = this.divergence.texture;
    for (let i = 0; i < 20; i++) {
      pressure.uniforms.uPressure.value = this.pressure.read.texture;
      this.pass(pressure, this.pressure.write);
      this.pressure.swap();
    }

    gradient.uniforms.uPressure.value = this.pressure.read.texture;
    gradient.uniforms.uVelocity.value = this.velocity.read.texture;
    this.pass(gradient, this.velocity.write);
    this.velocity.swap();

    advect.uniforms.uDt.value = dt;
    advect.uniforms.uVelocity.value = this.velocity.read.texture;
    advect.uniforms.uSource.value = this.velocity.read.texture;
    advect.uniforms.uDissipation.value = this.drag; // liquid slows down on its own
    this.pass(advect, this.velocity.write);
    this.velocity.swap();

    advect.uniforms.uVelocity.value = this.velocity.read.texture;
    advect.uniforms.uSource.value = this.dye.read.texture;
    advect.uniforms.uDissipation.value = 1.0; // color never fades, it only mixes
    this.pass(advect, this.dye.write);
    this.dye.swap();

    advect.uniforms.uPourQ.value = 0; // the pour is re-declared every frame it is on

    this.renderer.setRenderTarget(prevTarget);
  }

  dispose() {
    for (const d of [this.velocity, this.pressure, this.dye]) {
      d.read.dispose();
      d.write.dispose();
    }
    this.divergence.dispose();
    this.clearHistory();
    Object.values(this.mats).forEach((m) => m.dispose());
    this.quad.geometry.dispose();
  }
}
