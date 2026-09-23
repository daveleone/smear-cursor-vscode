import * as vscode from 'vscode';
import type { Mode, SmearConfig } from './config';
import type { CursorShape } from './shape';

export interface EditorMetrics {
  lineHeightPx: number;
  /** Estimated: the extension API does not expose the measured character width. */
  charWidthPx: number;
  letterSpacingPx: number;
  cursorWidthPx: number;
}

/** Typical advance width of monospace fonts, relative to their size. */
const MONOSPACE_WIDTH_RATIO = 0.6;
const VIM_EXTENSIONS = ['vscodevim.vim', 'asvetliakov.vscode-neovim'];

export function readMetrics(document: vscode.TextDocument): EditorMetrics {
  const editor = vscode.workspace.getConfiguration('editor', document);
  const fontSize = editor.get<number>('fontSize', 14);
  const letterSpacingPx = editor.get<number>('letterSpacing', 0);
  return {
    lineHeightPx: computeLineHeight(fontSize, editor.get<number>('lineHeight', 0)),
    charWidthPx: fontSize * MONOSPACE_WIDTH_RATIO + letterSpacingPx,
    letterSpacingPx,
    cursorWidthPx: editor.get<number>('cursorWidth', 2) || 2,
  };
}

/** Mirrors how VS Code derives the line height from `editor.lineHeight`. */
function computeLineHeight(fontSize: number, lineHeight: number): number {
  if (lineHeight === 0) return Math.round((process.platform === 'darwin' ? 1.5 : 1.35) * fontSize);
  if (lineHeight < 8) return Math.round(lineHeight * fontSize);
  return Math.round(lineHeight);
}

export function resolveShape(config: SmearConfig, editor: vscode.TextEditor, metrics: EditorMetrics): CursorShape {
  const verticalBar = (px: number): CursorShape => ({ kind: 'verticalBar', width: px / metrics.charWidthPx });
  const horizontalBar = (px: number): CursorShape => ({ kind: 'horizontalBar', height: px / metrics.lineHeightPx });

  switch (config.cursorShape) {
    case 'block':
      return { kind: 'block' };
    case 'verticalBar':
      return verticalBar(metrics.cursorWidthPx);
    case 'horizontalBar':
      return horizontalBar(2);
  }

  switch (editor.options.cursorStyle) {
    case vscode.TextEditorCursorStyle.Line:
      return verticalBar(metrics.cursorWidthPx);
    case vscode.TextEditorCursorStyle.LineThin:
      return verticalBar(1);
    case vscode.TextEditorCursorStyle.Underline:
      return horizontalBar(2);
    case vscode.TextEditorCursorStyle.UnderlineThin:
      return horizontalBar(1);
    default:
      return { kind: 'block' };
  }
}

export function resolveMode(config: SmearConfig, editor: vscode.TextEditor): Mode {
  const detect =
    config.modeDetection === 'cursorStyle' ||
    (config.modeDetection === 'auto' && VIM_EXTENSIONS.some((id) => vscode.extensions.getExtension(id)));
  if (!detect) return 'normal';

  switch (editor.options.cursorStyle) {
    case vscode.TextEditorCursorStyle.Line:
    case vscode.TextEditorCursorStyle.LineThin:
      return 'insert';
    case vscode.TextEditorCursorStyle.Underline:
    case vscode.TextEditorCursorStyle.UnderlineThin:
      return 'replace';
    default:
      return 'normal';
  }
}

/** Column on screen, expanding tabs. */
export function visualColumn(text: string, character: number, tabSize: number): number {
  let column = 0;
  for (let i = 0; i < character && i < text.length; i++) {
    column += text[i] === '\t' ? tabSize - (column % tabSize) : 1;
  }
  return column + Math.max(0, character - text.length);
}

/** Row on screen relative to line 0, skipping lines hidden by folded regions inside the viewport. */
export function visualRow(editor: vscode.TextEditor, line: number): number {
  const ranges = editor.visibleRanges;
  let hidden = 0;
  for (let i = 1; i < ranges.length; i++) {
    const gapStart = ranges[i - 1].end.line + 1;
    const gapEnd = Math.min(ranges[i].start.line, line);
    hidden += Math.max(0, gapEnd - gapStart);
  }
  return line - hidden;
}
