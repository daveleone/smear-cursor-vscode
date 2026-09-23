import * as vscode from 'vscode';
import { type Placement, type Scene, sceneCss } from './scene';

/**
 * Draws the smear as the `::before` pseudo-element of a decoration on the target cell. VS Code
 * gives every distinct per-range `renderOptions` its own CSS rule and removes it once unused, so a
 * single decoration type can be updated every frame without leaking styles.
 */
export class SmearRenderer implements vscode.Disposable {
  private readonly decorationType = vscode.window.createTextEditorDecorationType({
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });
  private editor: vscode.TextEditor | undefined;

  draw(editor: vscode.TextEditor, position: vscode.Position, scene: Scene, placement: Placement): void {
    if (this.editor !== editor) this.clear();
    this.editor = editor;

    // Covering the character (when there is one) makes `currentColor` resolve to its text color.
    const lineLength = editor.document.lineAt(position.line).text.length;
    const end = position.character < lineLength ? position.translate(0, 1) : position;

    editor.setDecorations(this.decorationType, [
      {
        range: new vscode.Range(position, end),
        renderOptions: {
          before: {
            contentText: '',
            // `textDecoration` is copied verbatim into the CSS rule, the usual way to style decorations
            // beyond the properties the API exposes.
            textDecoration: `none;${sceneCss(scene, placement)}`,
          },
        },
      },
    ]);
  }

  clear(): void {
    this.editor?.setDecorations(this.decorationType, []);
    this.editor = undefined;
  }

  dispose(): void {
    this.decorationType.dispose();
  }
}
