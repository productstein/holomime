import * as vscode from "vscode";
import { showBrainPanel, dispose as disposeBrain } from "./brain-panel";
import { spawn } from "child_process";

let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel("HoloMime");

  // ─── Show Brain ───────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand("holomime.showBrain", () => {
      showBrainPanel(context, outputChannel);
    })
  );

  // ─── Diagnose Active File ─────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand("holomime.diagnose", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("No active file to diagnose.");
        return;
      }

      const filePath = editor.document.uri.fsPath;
      outputChannel.appendLine(`Diagnosing: ${filePath}`);
      outputChannel.show(true);

      const proc = spawn("npx", ["holomime", "diagnose", "--log", filePath], {
        cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd(),
        shell: true,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        outputChannel.appendLine(text.trimEnd());
      });

      proc.stderr?.on("data", (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        outputChannel.appendLine(`[stderr] ${text.trimEnd()}`);
      });

      proc.on("exit", (code) => {
        if (code === 0) {
          vscode.window.showInformationMessage(
            "HoloMime diagnosis complete. See Output panel for results."
          );
        } else {
          vscode.window.showErrorMessage(
            `HoloMime diagnosis failed (exit ${code}). Check Output panel.`
          );
        }
      });

      proc.on("error", (err) => {
        vscode.window.showErrorMessage(`Failed to run holomime: ${err.message}`);
        outputChannel.appendLine(`Error: ${err.message}`);
      });
    })
  );

  // ─── Share Snapshot ───────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand("holomime.shareSnapshot", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("No active file to generate snapshot from.");
        return;
      }

      const filePath = editor.document.uri.fsPath;
      outputChannel.appendLine(`Generating snapshot for: ${filePath}`);

      const proc = spawn(
        "npx",
        ["holomime", "diagnose", "--log", filePath],
        {
          cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd(),
          shell: true,
          env: { ...process.env },
          stdio: ["ignore", "pipe", "pipe"],
        }
      );

      let stdout = "";

      proc.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      proc.on("exit", async (code) => {
        if (code !== 0) {
          vscode.window.showErrorMessage("Failed to generate snapshot.");
          return;
        }

        // Extract share URL from diagnose output
        const urlMatch = stdout.match(/(https:\/\/app\.holomime\.dev\/brain\?d=[^\s]+)/);
        if (urlMatch) {
          const url = urlMatch[1];
          await vscode.env.clipboard.writeText(url);
          const action = await vscode.window.showInformationMessage(
            "Brain snapshot URL copied to clipboard!",
            "Open in Browser"
          );
          if (action === "Open in Browser") {
            vscode.env.openExternal(vscode.Uri.parse(url));
          }
        } else {
          vscode.window.showWarningMessage(
            "Diagnosis ran but no share URL was generated. Check if the file is a valid conversation log."
          );
        }
      });

      proc.on("error", (err) => {
        vscode.window.showErrorMessage(`Failed to run holomime: ${err.message}`);
      });
    })
  );

  outputChannel.appendLine("HoloMime extension activated.");
}

export function deactivate(): void {
  disposeBrain();
  outputChannel?.dispose();
}
