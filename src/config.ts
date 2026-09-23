import type { ParticleParams, PhysicsParams } from './physics';

export type Mode = 'normal' | 'insert' | 'replace';

export interface SmearConfig {
  enabled: boolean;
  disabledLanguages: string[];
  modeDetection: 'auto' | 'cursorStyle' | 'off';
  cursorShape: 'auto' | 'block' | 'verticalBar' | 'horizontalBar';
  cursorColor: string;
  cursorColorInsertMode: string;
  smearBetweenEditors: boolean;
  smearBetweenNeighborLines: boolean;
  minHorizontalDistanceSmear: number;
  minVerticalDistanceSmear: number;
  smearHorizontally: boolean;
  smearVertically: boolean;
  smearDiagonally: boolean;
  scrollBufferSpace: boolean;
  smearInsertMode: boolean;
  smearReplaceMode: boolean;
  neverDrawOverTarget: boolean;
  timeInterval: number;
  delayEventToSmear: number;

  stiffness: number;
  trailingStiffness: number;
  anticipation: number;
  damping: number;
  trailingExponent: number;
  distanceStopAnimating: number;
  maxLength: number;
  stiffnessInsertMode: number;
  trailingStiffnessInsertMode: number;
  dampingInsertMode: number;
  trailingExponentInsertMode: number;
  maxLengthInsertMode: number;
  distanceStopAnimatingVerticalBar: number;

  gradientExponent: number;
  volumeReductionExponent: number;
  minimumVolumeFactor: number;

  particlesEnabled: boolean;
  particleMaxNum: number;
  particleSpread: number;
  particlesPerSecond: number;
  particlesPerLength: number;
  particleMaxLifetime: number;
  particleLifetimeDistributionExponent: number;
  particleMaxInitialVelocity: number;
  particleVelocityFromCursor: number;
  particleRandomVelocity: number;
  particleDamping: number;
  particleGravity: number;
  minDistanceEmitParticles: number;
}

export const CONFIG_SECTION = 'smearCursor';

/** Every setting key. Defaults live in package.json, which a test keeps in sync with this list. */
export const CONFIG_KEYS: readonly (keyof SmearConfig)[] = [
  'enabled',
  'disabledLanguages',
  'modeDetection',
  'cursorShape',
  'cursorColor',
  'cursorColorInsertMode',
  'smearBetweenEditors',
  'smearBetweenNeighborLines',
  'minHorizontalDistanceSmear',
  'minVerticalDistanceSmear',
  'smearHorizontally',
  'smearVertically',
  'smearDiagonally',
  'scrollBufferSpace',
  'smearInsertMode',
  'smearReplaceMode',
  'neverDrawOverTarget',
  'timeInterval',
  'delayEventToSmear',
  'stiffness',
  'trailingStiffness',
  'anticipation',
  'damping',
  'trailingExponent',
  'distanceStopAnimating',
  'maxLength',
  'stiffnessInsertMode',
  'trailingStiffnessInsertMode',
  'dampingInsertMode',
  'trailingExponentInsertMode',
  'maxLengthInsertMode',
  'distanceStopAnimatingVerticalBar',
  'gradientExponent',
  'volumeReductionExponent',
  'minimumVolumeFactor',
  'particlesEnabled',
  'particleMaxNum',
  'particleSpread',
  'particlesPerSecond',
  'particlesPerLength',
  'particleMaxLifetime',
  'particleLifetimeDistributionExponent',
  'particleMaxInitialVelocity',
  'particleVelocityFromCursor',
  'particleRandomVelocity',
  'particleDamping',
  'particleGravity',
  'minDistanceEmitParticles',
];

export function parseConfig(get: (key: string) => unknown): SmearConfig {
  return Object.fromEntries(CONFIG_KEYS.map((key) => [key, get(key)])) as unknown as SmearConfig;
}

export function physicsParams(config: SmearConfig, mode: Mode): PhysicsParams {
  const insert = mode === 'insert';
  return {
    stiffness: insert ? config.stiffnessInsertMode : config.stiffness,
    trailingStiffness: insert ? config.trailingStiffnessInsertMode : config.trailingStiffness,
    trailingExponent: insert ? config.trailingExponentInsertMode : config.trailingExponent,
    damping: insert ? config.dampingInsertMode : config.damping,
    maxLength: insert ? config.maxLengthInsertMode : config.maxLength,
    anticipation: config.anticipation,
    distanceStopAnimating: config.distanceStopAnimating,
    distanceStopAnimatingVerticalBar: config.distanceStopAnimatingVerticalBar,
    volumeReductionExponent: config.volumeReductionExponent,
    minimumVolumeFactor: config.minimumVolumeFactor,
  };
}

export function particleParams(config: SmearConfig): ParticleParams {
  return {
    enabled: config.particlesEnabled,
    maxNum: config.particleMaxNum,
    spread: config.particleSpread,
    perSecond: config.particlesPerSecond,
    perLength: config.particlesPerLength,
    maxLifetime: config.particleMaxLifetime,
    lifetimeDistributionExponent: config.particleLifetimeDistributionExponent,
    maxInitialVelocity: config.particleMaxInitialVelocity,
    velocityFromCursor: config.particleVelocityFromCursor,
    randomVelocity: config.particleRandomVelocity,
    damping: config.particleDamping,
    gravity: config.particleGravity,
    minDistanceEmit: config.minDistanceEmitParticles,
  };
}

/**
 * Turns a color setting into a CSS color expression. Empty follows the theme cursor color,
 * `none` follows the text color at the target, dotted ids are theme colors, anything else is CSS.
 */
export function resolveColor(setting: string): string {
  const fallback = 'var(--vscode-editorCursor-foreground, var(--vscode-editor-foreground))';
  const value = setting.trim();
  if (value === '') return fallback;
  if (value === 'none') return 'currentColor';
  if (/^[\w-]+(\.[\w-]+)+$/.test(value)) return `var(--vscode-${value.replace(/\./g, '-')}, ${fallback})`;
  // The value is spliced into a CSS rule; refuse anything that could escape the declaration.
  if (/[;{}"'\\<>]/.test(value)) return fallback;
  return value;
}
