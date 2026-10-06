import * as THREE from 'three';
import gsap from 'gsap';
import { Fluid } from './Fluid';

export type Mode = 'hero' | 'top';
export type Interaction = 'none' | 'paint' | 'stir';
export type Preset = 'heart' | 'tulip' | 'rosetta';

/*
  Look: flat retro-poster illustration. Two-tone shading with a hard terminator, no outlines,
  a thick cream rim, a flat dark ground shadow, and a lime tag hanging over the rim.
*/
const PALETTE = {
  cupLight: '#e6c4d8',
  cupShadow: '#7d6479',
  creamLight: '#f7e5d6',
  creamShadow: '#c9a99a',
  shadow: '#2b150d',
  string: '#2b150d',
  tag: '#c6fe1e',
  ink: '#00160d',
};

// Teacup proportions (world units)
const FOOT_R = 0.34;
const RIM_R = 0.8;
const RIM_Y = 0.9;
const COFFEE_Y = 0.74;
const COFFEE_R = 0.725;

// light comes from the upper left, like the illustration
const LIGHT_DIR = new THREE.Vector3(-0.75, 0.55, 0.35).normalize();

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

/** Flat two-tone material: light side and shadow side, hard edge. */
function twoTone(light: string, shadow: string) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uLight: { value: new THREE.Color(light) },
      uShadow: { value: new THREE.Color(shadow) },
      uLightDir: { value: LIGHT_DIR },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uLight;
      uniform vec3 uShadow;
      uniform vec3 uLightDir;
      varying vec3 vNormal;
      void main() {
        float d = dot(normalize(vNormal), uLightDir);
        float lit = smoothstep(-0.12, -0.08, d);
        gl_FragColor = vec4(mix(uShadow, uLight, lit), 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

/** Inside of the cup: flat cream, softly darker toward the coffee. No hard terminator. */
function innerCream(light: string, shadow: string) {
  return new THREE.ShaderMaterial({
    uniforms: { uLight: { value: new THREE.Color(light) }, uShadow: { value: new THREE.Color(shadow) } },
    vertexShader: /* glsl */ `
      varying float vY;
      varying vec3 vNormal;
      void main() {
        vY = position.y;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uLight;
      uniform vec3 uShadow;
      varying float vY;
      varying vec3 vNormal;
      void main() {
        float k = smoothstep(${COFFEE_Y.toFixed(3)}, ${(RIM_Y - 0.02).toFixed(3)}, vY);
        // the top of the lip stays fully lit
        k = max(k, smoothstep(0.6, 0.9, normalize(vNormal).y));
        gl_FragColor = vec4(mix(mix(uShadow, uLight, 0.45), uLight, k), 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
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

/** The tag texture: lime card, ink text, punched hole. */
function tagTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 320;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const draw = () => {
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 256, 320);
    ctx.fillStyle = PALETTE.tag;
    ctx.beginPath();
    ctx.roundRect(8, 8, 240, 304, 18);
    ctx.fill();
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.arc(128, 40, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.font = '500 40px "Apfel Grotezk", Inter, system-ui, sans-serif';
    ['Merchant', 'of Roast'].forEach((line, i) => ctx.fillText(line, 128, 150 + i * 46));
    ctx.font = '500 17px ui-monospace, Menlo, monospace';
    ctx.fillText('NO. 001 / STIR WELL', 128, 272);
    texture.needsUpdate = true;
  };
  draw();
  document.fonts?.ready.then(draw);
  return texture;
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
    col = mix(col, vec3(0.17, 0.08, 0.05), smoothstep(0.92, 1.0, r) * 0.6);
    // soft highlight from the upper-left light
    float sheen = smoothstep(0.55, 0.0, length(vUv - vec2(0.32, 0.7)));
    col += sheen * 0.035;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class CoffeeScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(CAMERA.hero.fov, 1, 0.1, 50);
  private cup = new THREE.Group();
  private tagPivot = new THREE.Group();
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
  // tag swing (pendulum)
  private swing = new THREE.Vector2();
  private swingVel = new THREE.Vector2();

  private pointerNdc = new THREE.Vector2();
  private lastUv: THREE.Vector2 | null = null;
  private raycaster = new THREE.Raycaster();
  private dragging = false;
  private interaction: Interaction = 'none';
  private pouring = false;
  private onPointer?: (active: boolean) => void;

  constructor(private canvas: HTMLCanvasElement) {
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);

    this.fluid = new Fluid(this.renderer);

    // flat dark shadow on the ground under the cup
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 64), new THREE.MeshBasicMaterial({ color: PALETTE.shadow }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(1.25, 0.95, 1);
    shadow.position.set(0.14, -0.002, -0.06);
    this.scene.add(shadow);

    // cup body (two-tone) + rim and inner bowl (cream)
    const body = new THREE.LatheGeometry(bodyProfile(), 96);
    body.computeVertexNormals();
    this.cup.add(new THREE.Mesh(body, twoTone(PALETTE.cupLight, PALETTE.cupShadow)));
    const rim = new THREE.LatheGeometry(rimProfile(), 96);
    rim.computeVertexNormals();
    this.cup.add(new THREE.Mesh(rim, innerCream(PALETTE.creamLight, PALETTE.creamShadow)));

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
    this.cup.add(new THREE.Mesh(handle, twoTone(PALETTE.cupLight, PALETTE.cupShadow)));

    this.buildTag();

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

  /** String over the rim + a lime tag that hangs on the front-right and swings. */
  private buildTag() {
    const angle = 0.5; // radians from the front (+z) toward the handle side (+x)
    const at = (r: number, y: number) => new THREE.Vector3(Math.sin(angle) * r, y, Math.cos(angle) * r);
    const pivot = at(RIM_R + 0.07, 0.6);

    const string = new THREE.CatmullRomCurve3([
      at(RIM_R - 0.16, COFFEE_Y + 0.01),
      at(RIM_R - 0.06, RIM_Y + 0.02),
      at(RIM_R + 0.02, RIM_Y + 0.03),
      at(RIM_R + 0.06, RIM_Y - 0.08),
      pivot,
    ]);
    const stringMat = new THREE.MeshBasicMaterial({ color: PALETTE.string });
    this.cup.add(new THREE.Mesh(new THREE.TubeGeometry(string, 48, 0.0055, 6), stringMat));

    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(0.26, 0.325),
      new THREE.MeshBasicMaterial({ map: tagTexture(), transparent: true, side: THREE.DoubleSide })
    );
    card.position.y = -0.19;
    this.tagPivot.add(card);
    this.tagPivot.position.copy(pivot);
    this.tagPivot.rotation.y = angle;
    this.cup.add(this.tagPivot);
  }

  /** Called with true while the user is painting or stirring. */
  setPointerListener(fn: (active: boolean) => void) {
    this.onPointer = fn;
  }

  /** What a drag does in top view. */
  setInteraction(interaction: Interaction) {
    this.interaction = interaction;
    this.lastUv = null;
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
        onComplete: () => resolve(),
      });
    });
  }

  /** Run a list of steps over a few frames so the art "pours" in. */
  private animate(steps: Array<() => void>, perFrame: number) {
    return new Promise<void>((resolve) => {
      let i = 0;
      const tick = () => {
        for (let k = 0; k < perFrame && i < steps.length; k++, i++) steps[i]();
        if (i < steps.length) requestAnimationFrame(tick);
        else resolve();
      };
      tick();
    });
  }

  /** Start from fresh coffee and pour a preset with the drawing-in animation. */
  async pour(preset: Preset) {
    if (this.pouring) return;
    this.pouring = true;
    this.fluid.reset();
    if (preset === 'heart') await this.pourHeart();
    if (preset === 'tulip') await this.pourTulip();
    if (preset === 'rosetta') await this.pourRosetta();
    this.pouring = false;
  }

  /** Milk stream from (x0,y0) to (x1,y1), pushing the liquid along the way (the barista "pull"). */
  private pullSteps(x0: number, y0: number, x1: number, y1: number, n: number, push: number) {
    const steps: Array<() => void> = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      steps.push(() => {
        this.fluid.addMilk(x, y, 0.55, 0.00012);
        this.fluid.addForce(x, y, (x1 - x0) * this.fluid.simSize * push, (y1 - y0) * this.fluid.simSize * push, 0.0006);
      });
    }
    return steps;
  }

  private heartCurve(cx: number, cy: number, scale: number, amount: number, radius: number, n = 90) {
    const steps: Array<() => void> = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      steps.push(() => this.fluid.addMilk(cx + x * scale, cy + y * scale, amount, radius));
    }
    return steps;
  }

  /** A big round blob of milk that grows from its center (like pouring into one spot). */
  private blobSteps(cx: number, cy: number, r: number, n: number) {
    const steps: Array<() => void> = [];
    for (let i = 1; i <= n; i++) {
      const rr = (r * i) / n;
      steps.push(() => this.fluid.addMilk(cx, cy, 0.6, rr * rr * 0.55));
    }
    return steps;
  }

  /** Heart: one round pour, then a pull through the middle pinches it into a heart. */
  private async pourHeart() {
    await this.animate([...this.blobSteps(0.5, 0.53, 0.2, 24), ...this.heartCurve(0.5, 0.5, 0.0128, 0.4, 0.0009)], 4);
    await this.animate(this.pullSteps(0.5, 0.74, 0.5, 0.24, 30, 1.4), 2);
  }

  /** Tulip: three stacked blobs, each pushed into the one below, then pulled through. */
  private async pourTulip() {
    const blobs: Array<[number, number]> = [[0.33, 0.17], [0.5, 0.13], [0.64, 0.095]];
    for (const [y, r] of blobs) {
      await this.animate(this.blobSteps(0.5, y, r, 16), 3);
      await this.animate(this.pullSteps(0.5, y + r * 0.6, 0.5, y - r * 0.4, 8, 1.2), 2);
    }
    await this.animate(this.pullSteps(0.5, 0.2, 0.5, 0.78, 30, 1.5), 2);
  }

  /**
   * Rosetta like a barista: stacked arches from the bottom up, a small heart on top,
   * then pull a line up through the middle so the fluid drags the arches into points.
   */
  private async pourRosetta() {
    const pour: Array<() => void> = [];
    const leaves = 7;
    for (let k = 0; k < leaves; k++) {
      const y = 0.27 + k * 0.062;
      const w = 0.25 - k * 0.026;
      const points = 26;
      for (let i = 0; i <= points; i++) {
        const x = -w + (2 * w * i) / points;
        const arch = y + 0.055 * (1 - (x / w) ** 2);
        pour.push(() => this.fluid.addMilk(0.5 + x, arch, 0.6, 0.00045));
      }
    }
    pour.push(...this.heartCurve(0.5, 0.76, 0.0042, 0.7, 0.0006, 30));
    await this.animate(pour, 6);
    await this.animate(this.pullSteps(0.5, 0.2, 0.5, 0.8, 40, 1.6), 2);
  }

  resetCoffee() {
    this.fluid.reset();
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
  }

  private resize = () => {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the cup comfortably framed on tall phones
    this.camera.zoom = w / h < 0.75 ? 0.68 : 1;
    this.camera.updateProjectionMatrix();
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
    this.dragging = true;
    this.canvas.setPointerCapture(e.pointerId);
    this.toNdc(e);
    this.lastUv = this.mode === 'top' ? this.coffeeUv() : null;
  };

  private handlePointerUp = () => {
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
    if (!this.dragging || this.interaction === 'none' || this.pouring) return;
    const uv = this.coffeeUv();
    if (uv && this.lastUv) {
      const dx = uv.x - this.lastUv.x;
      const dy = uv.y - this.lastUv.y;
      if (this.interaction === 'stir') {
        const k = this.fluid.simSize * 55;
        this.fluid.addForce(uv.x, uv.y, dx * k, dy * k, 0.0025);
      } else {
        // paint: a milk stream, thick when slow and thin when fast, nudging the liquid forward
        const dist = Math.hypot(dx, dy);
        const n = Math.max(1, Math.ceil(dist / 0.006));
        const radius = THREE.MathUtils.clamp(0.0016 - dist * 0.03, 0.00035, 0.0016);
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          this.fluid.addMilk(this.lastUv.x + dx * t, this.lastUv.y + dy * t, 0.55, radius);
        }
        const k = this.fluid.simSize * 18;
        this.fluid.addForce(uv.x, uv.y, dx * k, dy * k, 0.0015);
      }
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

    // the tag lags behind the cup's motion like a pendulum
    const tiltSpeed = this.tilt.clone().sub(prevTilt);
    this.swingVel.x -= tiltSpeed.x * 14;
    this.swingVel.y -= tiltSpeed.y * 14;
    this.spring(this.swing, this.swingVel, new THREE.Vector2(), 40, 3.2, dt);
    this.tagPivot.rotation.x = this.swing.x - this.cup.rotation.x * 0.6;
    this.tagPivot.rotation.z = this.swing.y - this.cup.rotation.z * 0.6;

    // slosh: tilting the cup pushes the coffee the other way
    if (!this.reducedMotion && tiltSpeed.lengthSq() > 1e-7) {
      const k = this.fluid.simSize * 260;
      this.fluid.addForce(0.5, 0.5, -tiltSpeed.y * k, tiltSpeed.x * k, 0.08);
    }

    // idle: tiny random currents so the crema always drifts
    if (!this.reducedMotion && Math.random() < dt * 1.5) {
      const a = Math.random() * Math.PI * 2;
      const s = this.fluid.simSize * 0.35;
      this.fluid.addForce(0.25 + Math.random() * 0.5, 0.25 + Math.random() * 0.5, Math.cos(a) * s, Math.sin(a) * s, 0.01);
    }

    this.fluid.step(dt);
    this.coffee.material.uniforms.uDye.value = this.fluid.texture;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
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
