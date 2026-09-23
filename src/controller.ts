import * as vscode from 'vscode';
import { CONFIG_SECTION, type Mode, type SmearConfig, parseConfig, particleParams, physicsParams, resolveColor } from './config';
import { type EditorMetrics, readMetrics, resolveMode, resolveShape, visualColumn, visualRow } from './editor';
import { BASE_TIME_INTERVAL, SmearAnimation } from './physics';
import { SmearRenderer } from './renderer';
import { type CursorShape, cursorCorners, cursorSize, sameShape } from './shape';

/** Longest frame interval fed to the physics, so a stalled extension host does not teleport the smear. */
const MAX_FRAME_INTERVAL = 100;
/** Size of a particle dot relative to a cell, like a braille dot in nvim. */
const PARTICLE_SIZE_COLS = 0.3;
/** How long to wait for the editor to scroll to a cursor that left the viewport, in milliseconds. */
const SCROLL_TIMEOUT = 50;

/** Where the cursor is, in the cell coordinates used by the animation. */
interface Target {
  editor: vscode.TextEditor;
  position: vscode.Position;
  row: number;
  col: number;
  topRow: number;
  bottomRow: number;
  mode: Mode;
  shape: CursorShape;
  metrics: EditorMetrics;
}

export class SmearController implements vscode.Disposable {
  private config: SmearConfig = readConfig();
  private readonly animation = new SmearAnimation();
  private readonly renderer = new SmearRenderer();
  private readonly disposables: vscode.Disposable[] = [this.renderer];
  private target: Target | undefined;
  private animating = false;
  private previousFrameTime = 0;
  private pendingUpdate: NodeJS.Timeout | undefined;
  private waitingForScroll = false;
  private frameTimer: NodeJS.Timeout | undefined;

  constructor() {
    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection((e) => this.scheduleUpdate(e.textEditor)),
      vscode.window.onDidChangeTextEditorOptions((e) => this.scheduleUpdate(e.textEditor)),
      vscode.window.onDidChangeActiveTextEditor((editor) => this.scheduleUpdate(editor)),
      vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
        if (this.waitingForScroll && e.textEditor === vscode.window.activeTextEditor) this.scheduleUpdate(e.textEditor);
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(CONFIG_SECTION) || e.affectsConfiguration('editor')) this.reloadConfig();
      }),
    );
    this.update();
  }

  dispose(): void {
    clearTimeout(this.pendingUpdate);
    this.stop();
    this.disposables.forEach((d) => d.dispose());
  }

  private reloadConfig(): void {
    this.config = readConfig();
    this.stop();
    this.target = undefined;
    this.update();
  }

  private scheduleUpdate(editor: vscode.TextEditor | undefined): void {
    if (!this.config.enabled) return;
    if (editor && editor !== vscode.window.activeTextEditor) return;
    // Waiting lets bursts of events settle. When the cursor left the viewport, also wait for the
    // editor to scroll to it: the selection event arrives first, and the smear must start from the
    // new viewport.
    this.waitingForScroll = editor !== undefined && !isCursorVisible(editor);
    clearTimeout(this.pendingUpdate);
    this.pendingUpdate = setTimeout(
      () => {
        this.waitingForScroll = false;
        this.update();
      },
      this.waitingForScroll ? SCROLL_TIMEOUT : this.config.delayEventToSmear,
    );
  }

  private update(): void {
    const editor = vscode.window.activeTextEditor;
    const previous = this.target;
    const next = editor && this.config.enabled ? computeTarget(this.config, editor) : undefined;
    this.target = next;

    if (!next) return this.stop();
    if (!previous || this.config.disabledLanguages.includes(next.editor.document.languageId)) return this.jump(next);
    if (next.mode === 'insert' && !this.config.smearInsertMode) return this.jump(next);
    if (next.mode === 'replace' && !this.config.smearReplaceMode) return this.jump(next);

    if (previous.editor !== next.editor) {
      if (!this.config.smearBetweenEditors || previous.editor.viewColumn !== next.editor.viewColumn) {
        return this.jump(next);
      }
      // Same editor group: start from the same place on screen.
      this.animation.shift(next.topRow - previous.topRow, 0);
    } else if (
      previous.position.isEqual(next.position) &&
      previous.mode === next.mode &&
      sameShape(previous.shape, next.shape)
    ) {
      return;
    } else if (next.topRow !== previous.topRow && next.position.line !== previous.position.line) {
      this.collapseForScroll(previous, next);
    }

    if (this.shouldJump(next)) return this.jump(next);

    this.animation.setTarget(cursorCorners(next.row, next.col, next.shape), physicsParams(this.config, next.mode), this.animating);
    this.start();
  }

  /**
   * The editor scrolled to follow the cursor. Coordinates are in buffer space already; for screen
   * space, move the smear along with the viewport. Either way, keep its start within the viewport.
   */
  private collapseForScroll(previous: Target, next: Target): void {
    if (!this.config.scrollBufferSpace) this.animation.shift(next.topRow - previous.topRow, 0);
    const [row, col] = this.animation.currentCorners[0];
    const clamped = Math.max(next.topRow, Math.min(next.bottomRow, row));
    this.animation.place(cursorCorners(clamped, col, next.shape));
  }

  private shouldJump(next: Target): boolean {
    const c = this.config;
    const [row, col] = this.animation.currentCorners[0];
    const rows = Math.abs(next.row - row);
    const cols = Math.abs(next.col - col);
    return (
      (!c.smearBetweenNeighborLines && rows <= 1.5) ||
      (rows < c.minVerticalDistanceSmear && cols < c.minHorizontalDistanceSmear) ||
      (!c.smearHorizontally && rows <= 0.5) ||
      (!c.smearVertically && cols <= 0.5) ||
      (!c.smearDiagonally && rows > 0.5 && cols > 0.5)
    );
  }

  private jump(target: Target): void {
    this.stop();
    this.animation.jump(cursorCorners(target.row, target.col, target.shape));
  }

  private start(): void {
    if (this.animating) return;
    this.animating = true;
    this.previousFrameTime = 0;
    this.frame();
  }

  private stop(): void {
    clearTimeout(this.frameTimer);
    this.frameTimer = undefined;
    this.animating = false;
    this.renderer.clear();
  }

  private readonly frame = (): void => {
    const target = this.target;
    if (!target) return this.stop();

    const now = performance.now();
    const dt = this.previousFrameTime === 0 ? BASE_TIME_INTERVAL : Math.min(now - this.previousFrameTime, MAX_FRAME_INTERVAL);
    this.previousFrameTime = now;

    const { metrics, shape } = target;
    const aspectRatio = metrics.lineHeightPx / metrics.charWidthPx;
    const result = this.animation.step(dt, physicsParams(this.config, target.mode), particleParams(this.config), {
      aspectRatio,
      verticalBarWidth: shape.kind === 'verticalBar' ? shape.width : undefined,
      cursorSize: cursorSize(shape),
    });

    if (result.done) return this.stop();

    this.renderer.draw(
      target.editor,
      target.position,
      {
        corners: result.corners,
        headIndex: result.headIndex,
        tailIndex: result.tailIndex,
        gradientExponent: this.config.gradientExponent,
        particles: result.particles,
        particleMaxLifetime: this.config.particleMaxLifetime,
        particleSize: [PARTICLE_SIZE_COLS / aspectRatio, PARTICLE_SIZE_COLS],
        hole: this.config.neverDrawOverTarget ? cursorCorners(target.row, target.col, shape) : undefined,
      },
      {
        anchor: [target.row, target.col],
        color: resolveColor(
          (target.mode === 'insert' && this.config.cursorColorInsertMode) || this.config.cursorColor,
        ),
        letterSpacingPx: metrics.letterSpacingPx,
      },
    );

    const elapsed = performance.now() - now;
    this.frameTimer = setTimeout(this.frame, Math.max(0, this.config.timeInterval - elapsed));
  };
}

function readConfig(): SmearConfig {
  const section = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return parseConfig((key) => section.get(key));
}

function isCursorVisible(editor: vscode.TextEditor): boolean {
  const line = editor.selection.active.line;
  return editor.visibleRanges.some((range) => range.start.line <= line && line <= range.end.line);
}

function computeTarget(config: SmearConfig, editor: vscode.TextEditor): Target {
  const position = editor.selection.active;
  const metrics = readMetrics(editor.document);
  const tabSize = typeof editor.options.tabSize === 'number' ? editor.options.tabSize : 4;
  const visible = editor.visibleRanges;
  const firstLine = visible.length ? visible[0].start.line : position.line;
  const lastLine = visible.length ? visible[visible.length - 1].end.line : position.line;

  return {
    editor,
    position,
    row: visualRow(editor, position.line),
    col: visualColumn(editor.document.lineAt(position.line).text, position.character, tabSize),
    topRow: visualRow(editor, firstLine),
    bottomRow: visualRow(editor, lastLine),
    mode: resolveMode(config, editor),
    shape: resolveShape(config, editor, metrics),
    metrics,
  };
}
