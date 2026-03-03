import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    clean: true,
    splitting: false,
    banner: { js: "#!/usr/bin/env node" },
  },
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    dts: true,
    splitting: false,
  },
  {
    entry: { "mcp-server": "src/mcp/server.ts" },
    format: ["esm"],
    splitting: false,
    banner: { js: "#!/usr/bin/env node" },
  },
]);
