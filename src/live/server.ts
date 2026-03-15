/**
 * Live Server — HTTP + WebSocket server for NeuralSpace brain visualization.
 * HTTP serves static assets, WebSocket broadcasts BrainEvents to all clients.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, type WebSocket } from "ws";
import type { BrainEvent, BrainInit, BrainMessage } from "./types.js";

// In bundled output, import.meta.url points to dist/cli.js
// Static assets are copied to dist/neuralspace/
const __bundleDir = fileURLToPath(new URL(".", import.meta.url));

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

export interface LiveServer {
  port: number;
  broadcast: (event: BrainMessage) => void;
  close: () => void;
}

/**
 * Start the HTTP + WebSocket server.
 * Returns a handle to broadcast events and close the server.
 */
export function startServer(port: number): Promise<LiveServer> {
  const staticDir = join(__bundleDir, "neuralspace");
  const clients = new Set<WebSocket>();
  let lastEvent: BrainEvent | null = null;
  let initMessage: BrainInit | null = null;

  return new Promise((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = req.url === "/" ? "/index.html" : req.url || "/index.html";

      // Serve static files from neuralspace directory
      const filePath = join(staticDir, url);
      if (!existsSync(filePath)) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
        return;
      }

      const ext = extname(filePath);
      const contentType = MIME_TYPES[ext] || "application/octet-stream";

      try {
        const content = readFileSync(filePath);
        res.writeHead(200, {
          "Content-Type": contentType,
          "Cache-Control": "no-cache",
        });
        res.end(content);
      } catch {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal server error");
      }
    });

    const wss = new WebSocketServer({ server });

    wss.on("connection", (ws) => {
      clients.add(ws);

      // Send init message if available
      if (initMessage) {
        ws.send(JSON.stringify(initMessage));
      }

      // Send last known state so new clients catch up
      if (lastEvent) {
        ws.send(JSON.stringify(lastEvent));
      }

      ws.on("close", () => {
        clients.delete(ws);
      });

      ws.on("error", () => {
        clients.delete(ws);
      });
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(new Error(`Port ${port} is already in use. Try --port <number>`));
      } else {
        reject(err);
      }
    });

    server.listen(port, () => {
      resolve({
        port,
        broadcast(event: BrainMessage) {
          if (event.type === "init") {
            initMessage = event as BrainInit;
          } else {
            lastEvent = event as BrainEvent;
          }

          const data = JSON.stringify(event);
          for (const client of clients) {
            if (client.readyState === 1 /* OPEN */) {
              client.send(data);
            }
          }
        },
        close() {
          for (const client of clients) {
            client.close();
          }
          clients.clear();
          wss.close();
          server.close();
        },
      });
    });
  });
}
