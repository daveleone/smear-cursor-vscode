import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { CONFIG_KEYS, CONFIG_SECTION, resolveColor } from '../src/config';
import { type Scene, sceneBounds, sceneCss, sceneSvg } from '../src/scene';
import { cursorCorners } from '../src/shape';

const scene: Scene = {
  corners: [
    [2, 3],
    [2, 10],
    [3, 10],
    [3, 3],
  ],
  headIndex: 1,
  tailIndex: 0,
  gradientExponent: 1,
  particles: [],
  particleMaxLifetime: 300,
  particleSize: [0.15, 0.3],
};

test('bounds cover the smear', () => {
  assert.deepEqual(sceneBounds(scene), { top: 2, left: 3, height: 1, width: 7 });
});

test('svg draws the quad relative to its bounds with a head-to-tail gradient', () => {
  const svg = sceneSvg(scene, sceneBounds(scene));
  assert.match(svg, /<polygon points='0,0 7,0 7,1 0,1' fill='url\(#g\)'\/>/);
  assert.match(svg, /x1='7' y1='0' x2='0' y2='0'/);
});

test('no gradient for short smears or a zero exponent', () => {
  const block = { ...scene, corners: cursorCorners(0, 0, { kind: 'block' }) };
  assert.doesNotMatch(sceneSvg(block, sceneBounds(block)), /linearGradient/);
  const flat = { ...scene, gradientExponent: 0 };
  assert.doesNotMatch(sceneSvg(flat, sceneBounds(flat)), /linearGradient/);
});

test('hole masks the target cell', () => {
  const holed = { ...scene, hole: cursorCorners(2, 9, { kind: 'block' }) };
  assert.match(sceneSvg(holed, sceneBounds(holed)), /<g mask='url\(#m\)'>/);
});

test('css positions the element relative to the anchor cell', () => {
  const css = sceneCss(scene, { anchor: [2, 9], color: 'red', letterSpacingPx: 0 });
  assert.match(css, /top:0%/);
  assert.match(css, /height:100%/);
  assert.match(css, /margin-left:calc\(-6ch \+ 0px\)/);
  assert.match(css, /width:calc\(7ch \+ 0px\)/);
  // The css is spliced into a rule: braces would break out of it.
  assert.doesNotMatch(css, /[{}]/);
});

test('colors', () => {
  assert.match(resolveColor(''), /editorCursor-foreground/);
  assert.equal(resolveColor('none'), 'currentColor');
  assert.equal(resolveColor('#ff4000'), '#ff4000');
  assert.match(resolveColor('terminal.ansiRed'), /^var\(--vscode-terminal-ansiRed,/);
  assert.match(resolveColor('red;} body{display:none'), /editorCursor-foreground/);
});

test('package.json declares exactly the settings the extension reads', () => {
  const manifest = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'));
  const declared = manifest.contributes.configuration.flatMap((c: { properties: object }) => Object.keys(c.properties));
  assert.deepEqual([...declared].sort(), CONFIG_KEYS.map((k) => `${CONFIG_SECTION}.${k}`).sort());
});
