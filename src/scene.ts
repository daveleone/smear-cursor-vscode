/**
 * Turns an animation frame into the CSS of a single absolutely positioned element.
 *
 * The element covers the bounding box of the smear. Its color is a plain `background-color` (so it
 * can use theme variables), and an SVG mask cuts out the exact smear shape, with the head-to-tail
 * gradient and the particles encoded as opacity. The SVG uses cell coordinates stretched to the box
 * with `preserveAspectRatio='none'`, so no pixel metrics are needed.
 */

import type { Corners, Particle, Vec } from './physics';

export interface Scene {
  corners: Corners;
  headIndex: number;
  tailIndex: number;
  gradientExponent: number;
  particles: readonly Particle[];
  particleMaxLifetime: number;
  /** `[rows, cols]` of a particle dot. */
  particleSize: Vec;
  /** Area never drawn over (the target cell), if any. */
  hole?: Corners;
}

export interface Box {
  top: number;
  left: number;
  height: number;
  width: number;
}

export interface Placement {
  /** Cell the element is anchored to: its origin is that cell's top-left corner. */
  anchor: Vec;
  color: string;
  letterSpacingPx: number;
}

const GRADIENT_STOPS = 8;
const MIN_PARTICLE_OPACITY = 1 / 16;

export function sceneBounds(scene: Scene): Box {
  let top = Infinity;
  let left = Infinity;
  let bottom = -Infinity;
  let right = -Infinity;
  const include = (row: number, col: number) => {
    top = Math.min(top, row);
    bottom = Math.max(bottom, row);
    left = Math.min(left, col);
    right = Math.max(right, col);
  };

  for (const [row, col] of scene.corners) include(row, col);
  const [h, w] = scene.particleSize;
  for (const { position } of visibleParticles(scene)) {
    include(position[0] - h / 2, position[1] - w / 2);
    include(position[0] + h / 2, position[1] + w / 2);
  }

  return { top, left, height: Math.max(bottom - top, 1e-3), width: Math.max(right - left, 1e-3) };
}

export function sceneSvg(scene: Scene, box: Box): string {
  const x = (col: number) => fmt(col - box.left);
  const y = (row: number) => fmt(row - box.top);
  const points = (corners: Corners) => corners.map(([r, c]) => `${x(c)},${y(r)}`).join(' ');

  const defs: string[] = [];
  let fill = 'black';

  const head = scene.corners[scene.headIndex];
  const tail = scene.corners[scene.tailIndex];
  const lengthSquared = (tail[0] - head[0]) ** 2 + (tail[1] - head[1]) ** 2;
  if (scene.gradientExponent > 0 && lengthSquared > 1) {
    const stops = scene.gradientExponent === 1 ? 1 : GRADIENT_STOPS;
    const stopTags = Array.from({ length: stops + 1 }, (_, i) => {
      const t = i / stops;
      return `<stop offset='${fmt(t)}' stop-opacity='${fmt((1 - t) ** scene.gradientExponent)}'/>`;
    }).join('');
    defs.push(
      `<linearGradient id='g' gradientUnits='userSpaceOnUse' x1='${x(head[1])}' y1='${y(head[0])}' x2='${x(tail[1])}' y2='${y(tail[0])}'>${stopTags}</linearGradient>`,
    );
    fill = 'url(#g)';
  }

  const shapes = [`<polygon points='${points(scene.corners)}' fill='${fill}'/>`];
  const [h, w] = scene.particleSize;
  for (const { position, lifetime } of visibleParticles(scene)) {
    const opacity = Math.min(1, lifetime / scene.particleMaxLifetime);
    shapes.push(
      `<rect x='${x(position[1] - w / 2)}' y='${y(position[0] - h / 2)}' width='${fmt(w)}' height='${fmt(h)}' fill-opacity='${fmt(opacity)}'/>`,
    );
  }

  let body = shapes.join('');
  if (scene.hole) {
    defs.push(
      `<mask id='m'><rect x='0' y='0' width='${fmt(box.width)}' height='${fmt(box.height)}' fill='white'/><polygon points='${points(scene.hole)}' fill='black'/></mask>`,
    );
    body = `<g mask='url(#m)'>${body}</g>`;
  }

  return (
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${fmt(box.width)} ${fmt(box.height)}' preserveAspectRatio='none'>` +
    (defs.length ? `<defs>${defs.join('')}</defs>` : '') +
    body +
    '</svg>'
  );
}

/**
 * CSS for the `::before` pseudo-element of a decoration placed on the anchor cell. Horizontal
 * offsets use `ch` (the editor font is monospace); vertical ones use percentages of the line's
 * height, which is the containing block of the absolutely positioned pseudo-element.
 */
export function sceneCss(scene: Scene, placement: Placement): string {
  const box = sceneBounds(scene);
  const svg = sceneSvg(scene, box);
  const cells = (n: number) => `calc(${fmt(n)}ch + ${fmt(n * placement.letterSpacingPx)}px)`;
  const mask = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

  return [
    'position:absolute',
    'z-index:1',
    'pointer-events:none',
    `top:${fmt((box.top - placement.anchor[0]) * 100)}%`,
    `height:${fmt(box.height * 100)}%`,
    `margin-left:${cells(box.left - placement.anchor[1])}`,
    `width:${cells(box.width)}`,
    `background-color:${placement.color}`,
    `-webkit-mask-image:${mask}`,
    `mask-image:${mask}`,
    '-webkit-mask-size:100% 100%',
    'mask-size:100% 100%',
    '-webkit-mask-repeat:no-repeat',
    'mask-repeat:no-repeat',
  ].join(';');
}

function visibleParticles(scene: Scene): readonly Particle[] {
  return scene.particles.filter((p) => p.lifetime / scene.particleMaxLifetime >= MIN_PARTICLE_OPACITY);
}

function fmt(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}
