import { defineConfig } from "tsup";
import { cpSync, readFileSync, writeFileSync } from "fs";

export default defineConfig([
  {
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    clean: true,
    splitting: false,
    banner: { js: "#!/usr/bin/env node" },
    onSuccess: async () => {
      // Copy NeuralSpace static assets to dist
      cpSync("src/live/neuralspace", "dist/neuralspace", { recursive: true });

      // Inline brain-data.json into neuralspace.js so no fetch is needed
      const brainData = readFileSync("dist/neuralspace/brain-data.json", "utf-8");
      const data = JSON.parse(brainData);
      let js = readFileSync("dist/neuralspace/neuralspace.js", "utf-8");
      js = js.replace(
        /\/\/ BRAIN_DATA_PLACEHOLDER_START[\s\S]*?\/\/ BRAIN_DATA_PLACEHOLDER_END/,
        `const BRAIN_V_B64 = "${data.vertices}";\nconst BRAIN_I_B64 = "${data.indices}";\nconst BRAIN_L_B64 = "${data.lobeIndices}";`
      );
      writeFileSync("dist/neuralspace/neuralspace.js", js);
    },
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
