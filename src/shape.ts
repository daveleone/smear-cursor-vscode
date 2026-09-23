import type { Corners, Vec } from './physics';

export type CursorShape =
  | { kind: 'block' }
  /** `width` is a fraction of a cell. */
  | { kind: 'verticalBar'; width: number }
  /** `height` is a fraction of a cell, the bar sits at the bottom. */
  | { kind: 'horizontalBar'; height: number };

export function cursorCorners(row: number, col: number, shape: CursorShape): Corners {
  switch (shape.kind) {
    case 'verticalBar':
      return [
        [row, col],
        [row, col + shape.width],
        [row + 1, col + shape.width],
        [row + 1, col],
      ];
    case 'horizontalBar': {
      const top = row + 1 - shape.height;
      return [
        [top, col],
        [top, col + 1],
        [row + 1, col + 1],
        [row + 1, col],
      ];
    }
    case 'block':
      return [
        [row, col],
        [row, col + 1],
        [row + 1, col + 1],
        [row + 1, col],
      ];
  }
}

/** `[rows, cols]` covered by the cursor. */
export function cursorSize(shape: CursorShape): Vec {
  switch (shape.kind) {
    case 'verticalBar':
      return [1, shape.width];
    case 'horizontalBar':
      return [shape.height, 1];
    case 'block':
      return [1, 1];
  }
}

export function sameShape(a: CursorShape, b: CursorShape): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
