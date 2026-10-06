import * as THREE from 'three';

/**
 * The receipt as a sheet of paper: a small Verlet cloth (points + distance constraints) with
 * bending stiffness, pinned along the perforation at the printer slot. Everything is in CSS px
 * with y down, drawn by an orthographic pass over the main scene.
 *
 * Life of a receipt:
 *  printing  - rigid, fed out of the slot
 *  hanging   - pinned along the top row, swings and droops; pulling tears pins one by one
 *  free      - fully torn, follows the hand
 *  settling  - drifts to the middle of the screen and comes to rest
 */

export type PaperOptions = { width: number; height: number; slotY: number };
export type PaperEvents = { onPrinted?: () => void; onTorn?: () => void };
type Mode = 'printing' | 'hanging' | 'free' | 'settling';

const COLS = 9;
const ROWS = 20;
const PRINT_SECONDS = 2.2;
/** How far (px) the sheet has to be pulled from where it hangs before the perforation starts to give. */
const TEAR_START = 150;
/** Extra pull (px) per column of perforation torn after that. */
const TEAR_STEP = 20;
const GRAVITY = 1800; // px / s^2
const DAMPING = 0.985;
const ITERATIONS = 10;

const paperVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// the receipt image, shaded a little by how much the sheet turns away from the viewer
const paperFragment = /* glsl */ `
  precision highp float;
  uniform sampler2D uMap;
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vec4 c = texture2D(uMap, vUv);
    float facing = abs(normalize(vNormal).z);
    c.rgb *= 0.72 + 0.28 * facing;
    gl_FragColor = c;
    #include <colorspace_fragment>
  }
`;

const smooth = (t: number) => t * t * (3 - 2 * t);

export class PaperSim {
  private scene = new THREE.Scene();
  private dimScene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(0, 1, 0, 1, 0.1, 100);
  private geometry = new THREE.BufferGeometry();
  private positions: Float32Array;
  private texture: THREE.CanvasTexture;
  private paper: THREE.Mesh;
  private shadow: THREE.Mesh;
  private dim: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  // simulation state (CSS px)
  private pos: Float32Array;
  private prev: Float32Array;
  private pinned: Uint8Array;
  private rest: Float32Array; // where each point sits when the sheet hangs flat from the slot
  private constraints: Array<[number, number, number, number]> = []; // a, b, rest length, stiffness
  private mode: Mode = 'printing';
  private time = 0;
  private grabbed = -1;
  private grabOffset = new THREE.Vector2();
  private pointer = new THREE.Vector2();
  private pullStart = new THREE.Vector2();
  private tornCols = 0;
  private tearFromLeft = true;
  private tearBothSides = false;
  private releaseAt = 0;
  private vw = 1;
  private vh = 1;

  constructor(
    canvas: HTMLCanvasElement,
    private opts: PaperOptions,
    viewport: { width: number; height: number },
    private events: PaperEvents = {},
  ) {
    const n = COLS * ROWS;
    this.pos = new Float32Array(n * 2);
    this.prev = new Float32Array(n * 2);
    this.rest = new Float32Array(n * 2);
    this.pinned = new Uint8Array(n);
    this.positions = new Float32Array(n * 3);

    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.anisotropy = 4;

    // grid geometry, uv top row = top of the receipt
    const uvs = new Float32Array(n * 2);
    const index: number[] = [];
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        const k = j * COLS + i;
        uvs[k * 2] = i / (COLS - 1);
        uvs[k * 2 + 1] = 1 - j / (ROWS - 1);
        if (i < COLS - 1 && j < ROWS - 1) index.push(k, k + 1, k + COLS, k + 1, k + COLS + 1, k + COLS);
      }
    }
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.geometry.setIndex(index);

    this.paper = new THREE.Mesh(
      this.geometry,
      new THREE.ShaderMaterial({ vertexShader: paperVertex, fragmentShader: paperFragment, uniforms: { uMap: { value: this.texture } }, side: THREE.DoubleSide }),
    );
    this.shadow = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }));
    this.shadow.position.set(10, 18, -1);
    this.scene.add(this.shadow, this.paper);

    this.dim = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x140d09, transparent: true, opacity: 0, depthWrite: false }));
    this.dimScene.add(this.dim);

    this.camera.position.z = 10;
    this.resize(viewport.width, viewport.height);
    this.layout();

    // constraints: neighbours, diagonals (shear) and skip-one (bending, keeps it paper-stiff)
    const add = (a: number, b: number, stiffness: number) => {
      const dx = this.rest[a * 2] - this.rest[b * 2];
      const dy = this.rest[a * 2 + 1] - this.rest[b * 2 + 1];
      this.constraints.push([a, b, Math.hypot(dx, dy), stiffness]);
    };
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        const k = j * COLS + i;
        if (i < COLS - 1) add(k, k + 1, 1);
        if (j < ROWS - 1) add(k, k + COLS, 1);
        if (i < COLS - 1 && j < ROWS - 1) {
          add(k, k + COLS + 1, 0.9);
          add(k + 1, k + COLS, 0.9);
        }
        if (i < COLS - 2) add(k, k + 2, 0.8);
        if (j < ROWS - 2) add(k, k + 2 * COLS, 0.8);
      }
    }

    // start inside the printer, fully above the slot
    for (let k = 0; k < n; k++) {
      this.pos[k * 2] = this.prev[k * 2] = this.rest[k * 2];
      this.pos[k * 2 + 1] = this.prev[k * 2 + 1] = this.rest[k * 2 + 1] - opts.height;
      this.pinned[k] = 1;
    }
    this.upload();
  }

  /** Where the sheet sits hanging straight from the slot, centred. */
  private layout() {
    const { width, height, slotY } = this.opts;
    const x0 = (this.vw - width) / 2;
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        const k = j * COLS + i;
        this.rest[k * 2] = x0 + (i / (COLS - 1)) * width;
        this.rest[k * 2 + 1] = slotY + (j / (ROWS - 1)) * height;
      }
    }
  }

  resize(width: number, height: number) {
    this.vw = width;
    this.vh = height;
    this.camera.right = width;
    this.camera.bottom = height;
    this.camera.updateProjectionMatrix();
    this.dim.scale.set(width, height, 1);
    this.dim.position.set(width / 2, height / 2, -5);
    this.layout();
  }

  /** The receipt canvas changed (next time-lapse frame). */
  markDirty() {
    this.texture.needsUpdate = true;
  }

  get isTorn() {
    return this.mode === 'free' || this.mode === 'settling';
  }

  pointerDown(x: number, y: number) {
    if (this.mode === 'printing') return;
    // grab the nearest point if the hand is on the sheet
    let best = -1;
    let bestD = 60 * 60;
    for (let k = 0; k < COLS * ROWS; k++) {
      const dx = this.pos[k * 2] - x;
      const dy = this.pos[k * 2 + 1] - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    if (best < 0) return;
    this.grabbed = best;
    this.grabOffset.set(this.pos[best * 2] - x, this.pos[best * 2 + 1] - y);
    this.pointer.set(x, y);
    this.pullStart.set(x, y);
    if (this.mode === 'settling') this.mode = 'free';
  }

  pointerMove(x: number, y: number) {
    this.pointer.set(x, y);
  }

  pointerUp() {
    this.grabbed = -1;
    if (this.mode === 'free') this.mode = 'settling';
  }

  /** Release the next pin along the perforation, from whichever side the tear is running. */
  private tearOne() {
    if (this.tornCols >= COLS) return;
    let col: number;
    if (this.tearBothSides) {
      // edges first, meeting in the middle
      const fromLeft = Math.floor(this.tornCols / 2);
      col = this.tornCols % 2 === 0 ? fromLeft : COLS - 1 - fromLeft;
    } else {
      col = this.tearFromLeft ? this.tornCols : COLS - 1 - this.tornCols;
    }
    this.pinned[col] = 0;
    this.tornCols++;
    if (this.tornCols >= COLS) {
      this.mode = this.grabbed >= 0 ? 'free' : 'settling';
      this.events.onTorn?.();
    }
  }

  update(dt: number) {
    this.time += dt;
    const n = COLS * ROWS;
    dt = Math.min(dt, 1 / 30);

    // the printer feeds the sheet out as one rigid piece
    if (this.mode === 'printing') {
      const t = Math.min(1, Math.max(0, (this.time - 0.3) / PRINT_SECONDS));
      const offset = -this.opts.height * (1 - smooth(t));
      for (let k = 0; k < n; k++) {
        this.pos[k * 2] = this.prev[k * 2] = this.rest[k * 2];
        this.pos[k * 2 + 1] = this.prev[k * 2 + 1] = this.rest[k * 2 + 1] + offset;
      }
      (this.dim.material as THREE.MeshBasicMaterial).opacity = 0.7 * Math.min(1, this.time / 0.8);
      if (t >= 1) {
        this.mode = 'hanging';
        for (let k = COLS; k < n; k++) this.pinned[k] = 0;
        // a little nudge so it swings as it comes free of the feed
        for (let k = COLS; k < n; k++) this.prev[k * 2] += 1.5 * (k / n);
        this.events.onPrinted?.();
      }
      this.upload();
      return;
    }

    // tearing: how far the hand has pulled the sheet from where it was grabbed
    if (this.grabbed >= 0 && this.mode === 'hanging') {
      const dx = this.pointer.x - this.pullStart.x;
      const dy = this.pointer.y - this.pullStart.y;
      const pull = Math.hypot(dx, Math.max(0, dy) * 1.0 + Math.min(0, dy) * 0.3);
      if (this.tornCols === 0 && pull > TEAR_START) {
        // pulling sideways frees the far side first; pulling straight down tears in from both edges
        this.tearBothSides = Math.abs(dx) < 40;
        this.tearFromLeft = dx > 0;
      }
      const target = pull <= TEAR_START ? 0 : Math.min(COLS, 1 + Math.floor((pull - TEAR_START) / TEAR_STEP));
      if (target > this.tornCols && this.time >= this.releaseAt) {
        this.tearOne();
        this.releaseAt = this.time + 0.045; // the tear runs along, it does not pop
      }
    }

    // forces + Verlet integration
    const settling = this.mode === 'settling';
    const gravity = this.mode === 'free' ? GRAVITY * 0.35 : settling ? 0 : GRAVITY;
    const sway = this.mode === 'hanging' && this.grabbed < 0 ? Math.sin(this.time * 1.7) * 60 : 0;
    const dt2 = dt * dt;
    for (let k = 0; k < n; k++) {
      if (this.pinned[k]) continue;
      const i = k * 2;
      let vx = (this.pos[i] - this.prev[i]) * (settling ? 0.9 : DAMPING);
      let vy = (this.pos[i + 1] - this.prev[i + 1]) * (settling ? 0.9 : DAMPING);
      this.prev[i] = this.pos[i];
      this.prev[i + 1] = this.pos[i + 1];
      let ax = sway * (k / n);
      let ay = gravity;
      if (settling) {
        // drift to the middle of the screen and flatten out
        const tx = this.rest[i];
        const ty = this.rest[i + 1] + (this.vh - this.opts.height) / 2 - this.opts.slotY;
        ax += (tx - this.pos[i]) * 40;
        ay += (ty - this.pos[i + 1]) * 40;
      }
      this.pos[i] += vx + ax * dt2;
      this.pos[i + 1] += vy + ay * dt2;
    }

    // constraints, with the pins and the hand as hard positions
    for (let it = 0; it < ITERATIONS; it++) {
      for (const [a, b, len, stiffness] of this.constraints) {
        const ia = a * 2;
        const ib = b * 2;
        const dx = this.pos[ib] - this.pos[ia];
        const dy = this.pos[ib + 1] - this.pos[ia + 1];
        const d = Math.hypot(dx, dy) || 1e-6;
        const diff = ((d - len) / d) * stiffness;
        const pa = this.pinned[a] || a === this.grabbed;
        const pb = this.pinned[b] || b === this.grabbed;
        if (pa && pb) continue;
        const wa = pa ? 0 : pb ? 1 : 0.5;
        const wb = pb ? 0 : pa ? 1 : 0.5;
        this.pos[ia] += dx * diff * wa;
        this.pos[ia + 1] += dy * diff * wa;
        this.pos[ib] -= dx * diff * wb;
        this.pos[ib + 1] -= dy * diff * wb;
      }
      for (let k = 0; k < COLS; k++) {
        if (!this.pinned[k]) continue;
        this.pos[k * 2] = this.rest[k * 2];
        this.pos[k * 2 + 1] = this.rest[k * 2 + 1];
      }
      if (this.grabbed >= 0) {
        this.pos[this.grabbed * 2] = this.pointer.x + this.grabOffset.x;
        this.pos[this.grabbed * 2 + 1] = this.pointer.y + this.grabOffset.y;
      }
    }
    this.upload();
  }

  private upload() {
    for (let k = 0; k < COLS * ROWS; k++) {
      this.positions[k * 3] = this.pos[k * 2];
      this.positions[k * 3 + 1] = this.pos[k * 2 + 1];
      this.positions[k * 3 + 2] = 0;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  /** Draw over the main scene: dim everything, then the sheet, clipped to below the slot. */
  render(renderer: THREE.WebGLRenderer) {
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.dimScene, this.camera);
    renderer.setScissorTest(true);
    renderer.setScissor(0, 0, this.vw, this.vh - this.opts.slotY);
    renderer.render(this.scene, this.camera);
    renderer.setScissorTest(false);
    renderer.autoClear = autoClear;
  }

  dispose() {
    this.geometry.dispose();
    this.texture.dispose();
    (this.paper.material as THREE.Material).dispose();
    (this.shadow.material as THREE.Material).dispose();
    this.dim.geometry.dispose();
    this.dim.material.dispose();
  }
}
