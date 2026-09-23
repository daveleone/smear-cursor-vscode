/**
 * Smear dynamics, ported from smear-cursor.nvim (lua/smear_cursor/animation.lua).
 *
 * Coordinates are in cells: `[row, col]`, one cell being one line high and one character wide.
 * The cursor is a quad whose four corners (top-left, top-right, bottom-right, bottom-left) are each
 * pulled towards their target by a damped spring. Corners leading the motion are stiffer than
 * trailing ones, which stretches the quad into a smear.
 */

export type Vec = [row: number, col: number];
export type Corners = [Vec, Vec, Vec, Vec];

/** Frame interval the nvim parameters were tuned for. Physics is corrected for other intervals. */
export const BASE_TIME_INTERVAL = 17;

export interface PhysicsParams {
  stiffness: number;
  trailingStiffness: number;
  trailingExponent: number;
  damping: number;
  anticipation: number;
  maxLength: number;
  distanceStopAnimating: number;
  distanceStopAnimatingVerticalBar: number;
  volumeReductionExponent: number;
  minimumVolumeFactor: number;
}

export interface ParticleParams {
  enabled: boolean;
  maxNum: number;
  spread: number;
  perSecond: number;
  perLength: number;
  maxLifetime: number;
  lifetimeDistributionExponent: number;
  maxInitialVelocity: number;
  velocityFromCursor: number;
  randomVelocity: number;
  damping: number;
  gravity: number;
  minDistanceEmit: number;
}

export interface Particle {
  position: Vec;
  /** In character widths per second, on both axes. */
  velocity: Vec;
  /** Remaining lifetime in milliseconds. */
  lifetime: number;
}

export interface StepEnvironment {
  /** Cell height divided by cell width, to make particle motion isotropic on screen. */
  aspectRatio: number;
  /** Width of the target cursor when it is a vertical bar, enabling the vertical bar stop rule. */
  verticalBarWidth?: number;
  /** Size of the target cursor, `[rows, cols]`, scaling the particle emission spread. */
  cursorSize: Vec;
  random?: () => number;
}

export type StepResult =
  | { done: true }
  | { done: false; corners: Corners; headIndex: number; tailIndex: number; particles: readonly Particle[] };

export class SmearAnimation {
  private current: Corners;
  private target: Corners;
  private velocity: Corners = zeroCorners();
  private stiffnesses = [0, 0, 0, 0];
  private previousCenter: Vec;
  private particles: Particle[] = [];

  constructor(corners: Corners = zeroCorners()) {
    this.current = cloneCorners(corners);
    this.target = cloneCorners(corners);
    this.previousCenter = center(corners);
  }

  get currentCorners(): Readonly<Corners> {
    return this.current;
  }

  /** Teleports the cursor, cancelling the smear and any particle. */
  jump(corners: Corners): void {
    this.current = cloneCorners(corners);
    this.target = cloneCorners(corners);
    this.velocity = zeroCorners();
    this.particles = [];
    this.previousCenter = center(corners);
  }

  /** Moves the current smear without touching its velocity, e.g. to collapse it before a scroll. */
  place(corners: Corners): void {
    this.current = cloneCorners(corners);
    this.previousCenter = center(corners);
  }

  /** Translates everything, used to convert between buffer and screen space. */
  shift(rows: number, cols: number): void {
    const move = (v: Vec) => {
      v[0] += rows;
      v[1] += cols;
    };
    this.current.forEach(move);
    this.target.forEach(move);
    this.particles.forEach((p) => move(p.position));
    move(this.previousCenter);
  }

  /** Starts (or redirects) the smear towards new target corners. */
  setTarget(corners: Corners, params: PhysicsParams, animating: boolean): void {
    this.target = cloneCorners(corners);
    this.setStiffnesses(params);
    if (!animating) {
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 2; j++) {
          this.velocity[i][j] = (this.current[i][j] - this.target[i][j]) * params.anticipation;
        }
      }
    }
  }

  /** Advances the animation by `dt` milliseconds. */
  step(dt: number, params: PhysicsParams, particleParams: ParticleParams, env: StepEnvironment): StepResult {
    const { headIndex, tailIndex } = this.integrate(dt, params);
    this.updateParticles(dt, particleParams, env);

    let maxDistance = 0;
    let maxVelocity = 0;
    let left = Infinity;
    let right = -Infinity;
    for (let i = 0; i < 4; i++) {
      maxDistance = Math.max(maxDistance, distance(this.current[i], this.target[i]));
      maxVelocity = Math.max(maxVelocity, Math.hypot(this.velocity[i][0], this.velocity[i][1]));
      left = Math.min(left, this.current[i][1]);
      right = Math.max(right, this.current[i][1]);
    }

    const settled =
      (maxDistance <= params.distanceStopAnimating && maxVelocity <= params.distanceStopAnimating) ||
      (env.verticalBarWidth !== undefined &&
        right - left <= 1.5 * env.verticalBarWidth &&
        maxDistance <= params.distanceStopAnimatingVerticalBar &&
        maxVelocity <= params.distanceStopAnimatingVerticalBar);

    if (settled && this.particles.length === 0) {
      this.jump(this.target);
      return { done: true };
    }

    // Only shrink the volume if not moving on a straight line
    const currentCenter = center(this.current);
    const targetCenter = center(this.target);
    const straightLine =
      Math.abs(targetCenter[0] - currentCenter[0]) < 1 / 8 || Math.abs(targetCenter[1] - currentCenter[1]) < 1 / 8;
    const corners = straightLine ? cloneCorners(this.current) : this.shrinkVolume(params);

    return { done: false, corners, headIndex, tailIndex, particles: this.particles };
  }

  private setStiffnesses(params: PhysicsParams): void {
    const targetCenter = center(this.target);
    const distances = this.current.map((corner) => distance(corner, targetCenter));
    const min = Math.min(...distances);
    const max = Math.max(...distances);

    if (max === min) {
      this.stiffnesses = [0, 1, 2, 3].map(() => params.stiffness);
      return;
    }

    this.stiffnesses = distances.map((d) => {
      const x = (d - min) / (max - min);
      return Math.min(1, params.stiffness + (params.trailingStiffness - params.stiffness) * x ** params.trailingExponent);
    });
  }

  private integrate(dt: number, params: PhysicsParams): { headIndex: number; tailIndex: number } {
    let headDistance = Infinity;
    let tailDistance = 0;
    let headIndex = 0;
    let tailIndex = 0;

    const speedCorrection = dt / BASE_TIME_INTERVAL;
    const velocityConservation = Math.pow(1 - params.damping, speedCorrection);
    // Empirical correction factor to maintain animation duration regardless of damping
    const dampingCorrection = 1 / (1 + 2.5 * velocityConservation);

    for (let i = 0; i < 4; i++) {
      const d = distance(this.current[i], this.target[i]);
      const stiffness = 1 - Math.pow(1 - this.stiffnesses[i] * dampingCorrection, speedCorrection);

      if (d < headDistance) {
        headDistance = d;
        headIndex = i;
      }
      if (d > tailDistance) {
        tailDistance = d;
        tailIndex = i;
      }

      for (let j = 0; j < 2; j++) {
        this.velocity[i][j] += (this.target[i][j] - this.current[i][j]) * stiffness;
        this.current[i][j] += this.velocity[i][j];
        this.velocity[i][j] *= velocityConservation;
      }
    }

    // Shorten smear if too long
    const head = this.current[headIndex];
    let length = 0;
    for (let i = 0; i < 4; i++) {
      if (i !== headIndex) length = Math.max(length, distance(this.current[i], head));
    }
    if (length > params.maxLength) {
      const factor = params.maxLength / length;
      for (let i = 0; i < 4; i++) {
        if (i === headIndex) continue;
        for (let j = 0; j < 2; j++) {
          this.current[i][j] = head[j] + (this.current[i][j] - head[j]) * factor;
        }
      }
    }

    return { headIndex, tailIndex };
  }

  /** Thins a diagonal smear perpendicular to its motion so that it keeps a roughly constant area. */
  private shrinkVolume(params: PhysicsParams): Corners {
    const corners = this.current;
    const edges = [1, 2, 3].map((i): Vec => [corners[i][0] - corners[0][0], corners[i][1] - corners[0][1]]);
    const cross = (a: Vec, b: Vec) => a[1] * b[0] - a[0] * b[1];
    const volume = (cross(edges[0], edges[1]) + cross(edges[1], edges[2])) / 2;
    if (volume <= 0) return cloneCorners(corners);

    const c = center(corners);
    const factor = Math.max(params.minimumVolumeFactor, (1 / volume) ** (params.volumeReductionExponent / 2));

    return corners.map((corner, i): Vec => {
      const toTarget: Vec = [this.target[i][0] - corner[0], this.target[i][1] - corner[1]];
      const normal = normalize([-toTarget[1], toTarget[0]]);
      const projection = (corner[0] - c[0]) * normal[0] + (corner[1] - c[1]) * normal[1];
      const shift = projection * (1 - factor);
      return [corner[0] - normal[0] * shift, corner[1] - normal[1] * shift];
    }) as Corners;
  }

  private updateParticles(dt: number, params: ParticleParams, env: StepEnvironment): void {
    const random = env.random ?? Math.random;
    const seconds = dt / 1000;
    const velocityConservation = Math.pow(1 - params.damping, dt / BASE_TIME_INTERVAL);

    this.particles = this.particles.filter((particle) => {
      particle.lifetime -= dt;
      if (particle.lifetime <= 0) return false;
      const v = particle.velocity;
      v[0] = (v[0] + (params.gravity + params.randomVelocity * (random() - 0.5)) * seconds) * velocityConservation;
      v[1] = v[1] * velocityConservation + params.randomVelocity * (random() - 0.5) * seconds;
      particle.position[0] += (v[0] * seconds) / env.aspectRatio;
      particle.position[1] += v[1] * seconds;
      return true;
    });

    if (params.enabled) this.emitParticles(dt, params, env, random);
    else this.previousCenter = center(this.current);
  }

  private emitParticles(dt: number, params: ParticleParams, env: StepEnvironment, random: () => number): void {
    const seconds = dt / 1000;
    const c = center(this.current);
    const cursorVelocity = center(this.velocity);
    // Per-frame corner velocity to character widths per second
    const frameSeconds = BASE_TIME_INTERVAL / 1000;
    const velocity: Vec = [(cursorVelocity[0] / frameSeconds) * env.aspectRatio, cursorVelocity[1] / frameSeconds];
    const movement: Vec = [c[0] - this.previousCenter[0], c[1] - this.previousCenter[1]];
    const magnitude = Math.hypot(env.aspectRatio * movement[0], movement[1]);

    if (magnitude <= params.minDistanceEmit) {
      this.previousCenter = c;
      return;
    }

    let count = params.perSecond * seconds + magnitude * params.perLength;
    count = Math.floor(count) + (random() < count % 1 ? 1 : 0);
    count = Math.max(0, Math.min(count, params.maxNum - this.particles.length));
    const rowSpread = params.spread * env.cursorSize[0];
    const colSpread = params.spread * env.cursorSize[1];

    for (let n = 0; n < count; n++) {
      const s = random();
      const speed = params.maxInitialVelocity * Math.sqrt(random());
      const angle = random() * 2 * Math.PI;
      this.particles.push({
        position: [
          this.previousCenter[0] + s * movement[0] + (random() - 0.5) * rowSpread,
          this.previousCenter[1] + s * movement[1] + (random() - 0.5) * colSpread,
        ],
        velocity: [
          speed * Math.cos(angle) + params.velocityFromCursor * velocity[0],
          speed * Math.sin(angle) + params.velocityFromCursor * velocity[1],
        ],
        lifetime: params.maxLifetime * random() ** params.lifetimeDistributionExponent,
      });
    }

    this.previousCenter = c;
  }
}

export function center(corners: Readonly<Corners>): Vec {
  return [
    (corners[0][0] + corners[1][0] + corners[2][0] + corners[3][0]) / 4,
    (corners[0][1] + corners[1][1] + corners[2][1] + corners[3][1]) / 4,
  ];
}

function distance(a: Vec, b: Vec): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function normalize(v: Vec): Vec {
  const length = Math.hypot(v[0], v[1]);
  return length === 0 ? [0, 0] : [v[0] / length, v[1] / length];
}

function zeroCorners(): Corners {
  return [
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
  ];
}

function cloneCorners(corners: Readonly<Corners>): Corners {
  return corners.map((c) => [c[0], c[1]]) as Corners;
}
