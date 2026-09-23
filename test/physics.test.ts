import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type ParticleParams, type PhysicsParams, type StepEnvironment, SmearAnimation } from '../src/physics';
import { cursorCorners } from '../src/shape';

const params: PhysicsParams = {
  stiffness: 0.6,
  trailingStiffness: 0.45,
  trailingExponent: 3,
  damping: 0.85,
  anticipation: 0.2,
  maxLength: 25,
  distanceStopAnimating: 0.1,
  distanceStopAnimatingVerticalBar: 0.1,
  volumeReductionExponent: 0.3,
  minimumVolumeFactor: 0.7,
};

const noParticles: ParticleParams = {
  enabled: false,
  maxNum: 100,
  spread: 0.5,
  perSecond: 200,
  perLength: 1,
  maxLifetime: 300,
  lifetimeDistributionExponent: 5,
  maxInitialVelocity: 10,
  velocityFromCursor: 0.2,
  randomVelocity: 100,
  damping: 0.2,
  gravity: 20,
  minDistanceEmit: 1.5,
};

const env: StepEnvironment = { aspectRatio: 2, cursorSize: [1, 1] };
const block = { kind: 'block' } as const;

function run(animation: SmearAnimation, particles = noParticles, maxFrames = 1000) {
  const frames = [];
  for (let i = 0; i < maxFrames; i++) {
    const result = animation.step(17, params, particles, env);
    if (result.done) return frames;
    frames.push(result);
  }
  throw new Error('animation did not settle');
}

test('settles exactly on the target', () => {
  const animation = new SmearAnimation(cursorCorners(0, 0, block));
  animation.setTarget(cursorCorners(10, 30, block), params, false);
  const frames = run(animation);
  assert.ok(frames.length > 5 && frames.length < 120, `took ${frames.length} frames`);
  assert.deepEqual(animation.currentCorners, cursorCorners(10, 30, block));
});

test('smears: the leading corner moves ahead of the trailing one', () => {
  const animation = new SmearAnimation(cursorCorners(0, 0, block));
  animation.setTarget(cursorCorners(0, 40, block), params, false);
  const third = run(animation)[2];
  assert.ok(!third.done);
  const [topLeft, topRight] = third.corners;
  assert.ok(topRight[1] - topLeft[1] > 2, 'the quad should be stretched along the motion');
});

test('anticipation starts by moving away from the target', () => {
  const animation = new SmearAnimation(cursorCorners(0, 0, block));
  animation.setTarget(cursorCorners(0, 1, block), { ...params, stiffness: 0, trailingStiffness: 0 }, false);
  animation.step(17, params, noParticles, env);
  assert.ok(animation.currentCorners[0][1] < 0);
});

test('keeps the smear no longer than maxLength', () => {
  const animation = new SmearAnimation(cursorCorners(0, 0, block));
  const short = { ...params, maxLength: 3 };
  animation.setTarget(cursorCorners(0, 200, block), short, false);
  for (let i = 0; i < 20; i++) {
    const result = animation.step(17, short, noParticles, env);
    if (result.done) break;
    const cols = result.corners.map((c) => c[1]);
    assert.ok(Math.max(...cols) - Math.min(...cols) <= 3 + 1 + 1e-9);
  }
});

test('frame rate does not change the animation duration much', () => {
  const duration = (dt: number) => {
    const animation = new SmearAnimation(cursorCorners(0, 0, block));
    animation.setTarget(cursorCorners(20, 20, block), params, false);
    let t = 0;
    while (!animation.step(dt, params, noParticles, env).done) t += dt;
    return t;
  };
  const ratio = duration(7) / duration(17);
  assert.ok(ratio > 0.8 && ratio < 1.25, `ratio ${ratio}`);
});

test('particles keep the animation alive until they die', () => {
  const animation = new SmearAnimation(cursorCorners(0, 0, block));
  animation.setTarget(cursorCorners(0, 60, block), params, false);
  const frames = run(animation, { ...noParticles, enabled: true });
  assert.ok(frames.some((f) => !f.done && f.particles.length > 0));
});

test('jump cancels the smear', () => {
  const animation = new SmearAnimation(cursorCorners(0, 0, block));
  animation.setTarget(cursorCorners(5, 5, block), params, false);
  animation.step(17, params, noParticles, env);
  animation.jump(cursorCorners(7, 7, block));
  assert.equal(animation.step(17, params, noParticles, env).done, true);
});
