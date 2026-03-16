import * as vscode from "vscode";
import { ChildProcess, spawn } from "child_process";
import * as path from "path";
import * as net from "net";

let currentPanel: vscode.WebviewPanel | undefined;
let brainProcess: ChildProcess | undefined;
let brainPort: number | undefined;

/**
 * Find a free port by binding to 0 and reading the assigned port.
 */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("Could not find free port")));
      }
    });
    srv.on("error", reject);
  });
}

/**
 * Show or create the HoloMime Brain webview panel.
 * Spawns `npx holomime brain` as a child process and embeds
 * an iframe pointing to the local server.
 */
export async function showBrainPanel(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel
): Promise<void> {
  // Reuse existing panel if open
  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.Beside);
    return;
  }

  const port = await findFreePort();
  brainPort = port;

  // Start the brain server as a child process
  outputChannel.appendLine(`Starting HoloMime brain on port ${port}...`);

  brainProcess = spawn("npx", ["holomime", "brain", "--no-open", "--port", String(port)], {
    cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd(),
    shell: true,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  brainProcess.stdout?.on("data", (data: Buffer) => {
    outputChannel.appendLine(data.toString().trim());
  });

  brainProcess.stderr?.on("data", (data: Buffer) => {
    outputChannel.appendLine(`[stderr] ${data.toString().trim()}`);
  });

  brainProcess.on("error", (err) => {
    vscode.window.showErrorMessage(`HoloMime brain failed to start: ${err.message}`);
    outputChannel.appendLine(`Process error: ${err.message}`);
  });

  brainProcess.on("exit", (code) => {
    outputChannel.appendLine(`HoloMime brain exited (code ${code})`);
    brainProcess = undefined;
    brainPort = undefined;
  });

  // Wait for the server to be ready
  const ready = await waitForServer(port, 15_000);
  if (!ready) {
    vscode.window.showErrorMessage(
      "HoloMime brain server did not start in time. Is an AI agent running?"
    );
    killBrainProcess();
    return;
  }

  // Create webview panel
  currentPanel = vscode.window.createWebviewPanel(
    "holomimeBrain",
    "HoloMime Brain",
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(context.extensionPath, "media")),
      ],
    }
  );

  currentPanel.webview.html = getBrainHtml(port);

  currentPanel.onDidDispose(() => {
    currentPanel = undefined;
    killBrainProcess();
  }, null, context.subscriptions);

  outputChannel.appendLine(`Brain panel opened — http://localhost:${port}`);
}

/**
 * Wait for a TCP server to accept connections.
 */
function waitForServer(port: number, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      if (Date.now() - start > timeoutMs) {
        resolve(false);
        return;
      }
      const socket = net.createConnection({ port, host: "127.0.0.1" });
      socket.on("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.on("error", () => {
        socket.destroy();
        setTimeout(check, 500);
      });
    };
    check();
  });
}

/**
 * Generate the HTML for the brain webview.
 * Uses an iframe pointed at the local brain server.
 */
function getBrainHtml(port: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #110d1f;
    }
    iframe {
      width: 100%;
      height: 100%;
      border: none;
    }
    .loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #a1a1aa;
      font-family: system-ui, -apple-system, sans-serif;
      gap: 12px;
    }
    .loading .spinner {
      width: 24px;
      height: 24px;
      border: 2px solid #333;
      border-top-color: #06b6d4;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="loading" id="loading">
    <div class="spinner"></div>
    <div>Connecting to brain server...</div>
  </div>
  <iframe id="brain-frame" style="display:none"
    src="http://localhost:${port}"
    sandbox="allow-scripts allow-same-origin"
    onload="document.getElementById('loading').style.display='none'; this.style.display='block';">
  </iframe>
</body>
</html>`;
}

/**
 * Kill the brain child process if running.
 */
function killBrainProcess(): void {
  if (brainProcess) {
    brainProcess.kill("SIGTERM");
    brainProcess = undefined;
    brainPort = undefined;
  }
}

/**
 * Get the current brain server port (for share snapshot).
 */
export function getBrainPort(): number | undefined {
  return brainPort;
}

/**
 * Clean up — kill process and dispose panel.
 */
export function dispose(): void {
  if (currentPanel) {
    currentPanel.dispose();
    currentPanel = undefined;
  }
  killBrainProcess();
}
