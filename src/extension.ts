import * as vscode from 'vscode';
import { CONFIG_SECTION } from './config';
import { SmearController } from './controller';

export function activate(context: vscode.ExtensionContext): void {
  const setEnabled = (enabled: boolean) =>
    vscode.workspace.getConfiguration(CONFIG_SECTION).update('enabled', enabled, vscode.ConfigurationTarget.Global);

  context.subscriptions.push(
    new SmearController(),
    vscode.commands.registerCommand('smearCursor.enable', () => setEnabled(true)),
    vscode.commands.registerCommand('smearCursor.disable', () => setEnabled(false)),
    vscode.commands.registerCommand('smearCursor.toggle', () =>
      setEnabled(!vscode.workspace.getConfiguration(CONFIG_SECTION).get<boolean>('enabled', true)),
    ),
  );
}

export function deactivate(): void {}
