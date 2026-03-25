/**
 * Embody Command — Start a persistent embodiment runtime that watches for
 * personality file changes and pushes compiled embodied configs to
 * connected robot/avatar frameworks.
 *
 * Usage:
 *   holomime embody --personality agent.json --adapter ros2 --endpoint ws://localhost:9090
 *   holomime embody --personality agent.json --adapter unity --port 8765
 *   holomime embody --personality agent.json --adapter webhook --url https://my-robot.dev/config
 *
 * Stack mode:
 *   holomime embody --stack ./identity --adapter ros2 --endpoint ws://localhost:9090
 *
 * Body swap:
 *   holomime embody --stack ./identity --swap-body registry/bodies/spot.body.api --adapter unity
 */

import chalk from "chalk";
import figures from "figures";
import { readFileSync, writeFileSync, watchFile, unwatchFile, existsSync, copyFileSync } from "node:fs";
import { resolve, join, basename } from "node:path";
import { personalitySpecSchema, type Provider } from "../core/types.js";
import { compileEmbodied } from "../core/embodiment-compiler.js";
import { compileStack, isStackDirectory } from "../core/stack-compiler.js";
import { STACK_FILES } from "../core/stack-types.js";
import { EmbodimentRuntime, type RuntimeAdapter } from "../core/embodiment-runtime.js";
import { ROS2Adapter } from "../adapters/ros2-adapter.js";
import { UnityAdapter } from "../adapters/unity-adapter.js";
import { WebhookAdapter } from "../adapters/webhook-adapter.js";
import { IsaacSimAdapter } from "../adapters/isaac-adapter.js";
import { printHeader } from "../ui/branding.js";
import { printBox } from "../ui/boxes.js";
import { withSpinner } from "../ui/spinner.js";

// ─── Options ────────────────────────────────────────────────

export interface EmbodyOptions {
  personality?: string;
  adapter: string;
  provider?: string;
  endpoint?: string;
  port?: string;
  url?: string;
  headers?: string;
  bearerToken?: string;
  topicPrefix?: string;
  transition?: string;
  stack?: string;
  swapBody?: string;
}

// ─── Main Command ───────────────────────────────────────────

export async function embodyCommand(options: EmbodyOptions): Promise<void> {
  const provider = (options.provider ?? "anthropic") as Provider;
  const adapterType = options.adapter;

  // Determine mode: stack vs personality
  const stackMode = !!options.stack;
  const hasPersonality = !!options.personality;

  if (!stackMode && !hasPersonality) {
    console.error(chalk.red(`  ${figures.cross} Either --personality or --stack is required`));
    process.exit(1);
  }

  if (stackMode && hasPersonality) {
    console.error(chalk.red(`  ${figures.cross} Cannot use both --personality and --stack`));
    process.exit(1);
  }

  // Handle --swap-body (requires --stack)
  if (options.swapBody && !stackMode) {
    console.error(chalk.red(`  ${figures.cross} --swap-body requires --stack`));
    process.exit(1);
  }

  if (stackMode) {
    await embodyStackMode(options, provider, adapterType);
  } else {
    await embodyPersonalityMode(options, provider, adapterType);
  }
}

// ─── Personality Mode (original behavior) ───────────────────

async function embodyPersonalityMode(
  options: EmbodyOptions,
  provider: Provider,
  adapterType: string,
): Promise<void> {
  const personalityPath = resolve(process.cwd(), options.personality!);

  // 1. Load and validate the personality spec
  let spec;
  try {
    const raw = JSON.parse(readFileSync(personalityPath, "utf-8"));
    const parsed = personalitySpecSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(parsed.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("\n"));
    }
    spec = parsed.data;
  } catch (err) {
    console.error(chalk.red(`  ${figures.cross} Failed to load personality spec: ${err instanceof Error ? err.message : err}`));
    process.exit(1);
  }

  // 2. Create the adapter
  let adapter: RuntimeAdapter;
  try {
    adapter = createAdapter(adapterType, options);
  } catch (err) {
    console.error(chalk.red(`  ${figures.cross} ${err instanceof Error ? err.message : err}`));
    process.exit(1);
  }

  // 3. Compile initial embodied config
  const config = await withSpinner(
    `Compiling ${spec.name} for embodied runtime...`,
    async () => compileEmbodied(spec, provider),
  );

  // 4. Start the runtime
  const runtime = new EmbodimentRuntime();
  runtime.addAdapter(adapter);
  wireRuntimeEvents(runtime);

  // Connect
  printHeader(`Embodiment Runtime: ${spec.name}`);

  console.log(chalk.bold("  Configuration"));
  console.log(chalk.dim("  " + "\u2500".repeat(40)));
  console.log(`    adapter:     ${chalk.cyan(adapterType)}`);
  console.log(`    provider:    ${chalk.cyan(provider)}`);
  console.log(`    personality: ${chalk.dim(personalityPath)}`);
  console.log(`    modalities:  ${chalk.green(config.active_modalities.join(", "))}`);
  console.log();

  await withSpinner(`Connecting ${adapterType} adapter...`, async () => {
    await runtime.start();
  });

  // 5. Push initial config
  await withSpinner("Pushing initial embodied config...", async () => {
    await runtime.pushUpdate(config);
  });

  console.log();
  printBox(
    `${figures.tick} Runtime active \u2014 watching ${chalk.cyan(options.personality!)} for changes\n` +
    `Press ${chalk.bold("Ctrl+C")} to stop`,
    "success",
  );
  console.log();

  // 6. Watch for file changes
  const pollInterval = 1000; // 1 second
  watchFile(personalityPath, { interval: pollInterval }, async () => {
    try {
      const updatedRaw = JSON.parse(readFileSync(personalityPath, "utf-8"));
      const updatedParsed = personalitySpecSchema.safeParse(updatedRaw);
      if (!updatedParsed.success) {
        console.error(chalk.yellow(`  ${figures.warning} Invalid personality spec, skipping update`));
        return;
      }

      const updatedConfig = compileEmbodied(updatedParsed.data, provider);

      console.log(chalk.cyan(`  ${figures.info} Personality file changed \u2014 recompiling...`));
      await runtime.pushUpdate(updatedConfig);
    } catch (err) {
      console.error(chalk.red(`  ${figures.cross} Error on file change: ${err instanceof Error ? err.message : err}`));
    }
  });

  // 7. Graceful shutdown
  const shutdown = async () => {
    console.log();
    console.log(chalk.dim("  Shutting down..."));
    unwatchFile(personalityPath);
    await runtime.stop();
    console.log(chalk.dim(`  ${figures.tick} Runtime stopped`));
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  // Keep process alive
  await new Promise(() => {});
}

// ─── Stack Mode ─────────────────────────────────────────────

async function embodyStackMode(
  options: EmbodyOptions,
  provider: Provider,
  adapterType: string,
): Promise<void> {
  const stackDir = resolve(process.cwd(), options.stack!);

  // Validate stack directory
  if (!isStackDirectory(stackDir)) {
    console.error(chalk.red(`  ${figures.cross} Not a valid stack directory: ${stackDir}`));
    console.error(chalk.dim(`    Requires at least ${STACK_FILES.soul} and ${STACK_FILES.psyche}`));
    process.exit(1);
  }

  // Handle --swap-body: copy new body.api into the stack directory before compiling
  if (options.swapBody) {
    const swapBodyPath = resolve(process.cwd(), options.swapBody);
    if (!existsSync(swapBodyPath)) {
      console.error(chalk.red(`  ${figures.cross} Body file not found: ${swapBodyPath}`));
      process.exit(1);
    }

    const targetBodyPath = join(stackDir, STACK_FILES.body);
    try {
      copyFileSync(swapBodyPath, targetBodyPath);
      console.log(chalk.green(`  ${figures.tick} Swapped body: ${chalk.cyan(basename(swapBodyPath))} \u2192 ${STACK_FILES.body}`));
    } catch (err) {
      console.error(chalk.red(`  ${figures.cross} Failed to swap body: ${err instanceof Error ? err.message : err}`));
      process.exit(1);
    }
  }

  // 1. Compile the stack
  let result;
  try {
    result = await withSpinner(
      "Compiling identity stack...",
      async () => compileStack({ stackDir }),
    );
  } catch (err) {
    console.error(chalk.red(`  ${figures.cross} Stack compilation failed: ${err instanceof Error ? err.message : err}`));
    process.exit(1);
  }

  if (result.warnings.length > 0) {
    for (const w of result.warnings) {
      console.log(chalk.yellow(`  ${figures.warning} ${w}`));
    }
  }

  // 2. Create the adapter
  let adapter: RuntimeAdapter;
  try {
    adapter = createAdapter(adapterType, options);
  } catch (err) {
    console.error(chalk.red(`  ${figures.cross} ${err instanceof Error ? err.message : err}`));
    process.exit(1);
  }

  // 3. Compile embodied config from the personality spec
  const config = await withSpinner(
    `Compiling ${result.spec.name} for embodied runtime...`,
    async () => compileEmbodied(result.spec, provider),
  );

  // 4. Start the runtime
  const runtime = new EmbodimentRuntime();
  runtime.addAdapter(adapter);
  wireRuntimeEvents(runtime);

  // Print config
  printHeader(`Embodiment Runtime: ${result.spec.name} (stack mode)`);

  console.log(chalk.bold("  Configuration"));
  console.log(chalk.dim("  " + "\u2500".repeat(40)));
  console.log(`    adapter:     ${chalk.cyan(adapterType)}`);
  console.log(`    provider:    ${chalk.cyan(provider)}`);
  console.log(`    stack:       ${chalk.dim(stackDir)}`);
  console.log(`    modalities:  ${chalk.green(config.active_modalities.join(", "))}`);

  // Show sources
  console.log(chalk.bold("\n  Stack Sources"));
  console.log(chalk.dim("  " + "\u2500".repeat(40)));
  for (const [layer, source] of Object.entries(result.sources)) {
    console.log(`    ${layer.padEnd(12)} ${chalk.dim(source.hash)}`);
  }
  console.log();

  await withSpinner(`Connecting ${adapterType} adapter...`, async () => {
    await runtime.start();
  });

  // 5. Push initial config
  await withSpinner("Pushing initial embodied config...", async () => {
    await runtime.pushUpdate(config);
  });

  // 6. Determine which files to watch
  const watchPaths: string[] = [];
  const stackFileEntries = Object.values(STACK_FILES);
  for (const filename of stackFileEntries) {
    const filePath = join(stackDir, filename);
    if (existsSync(filePath)) {
      watchPaths.push(filePath);
    }
  }

  console.log();
  printBox(
    `${figures.tick} Runtime active \u2014 watching ${chalk.cyan(watchPaths.length + " stack files")} for changes\n` +
    `Press ${chalk.bold("Ctrl+C")} to stop`,
    "success",
  );
  console.log();

  // 7. Watch all stack files for changes
  const pollInterval = 1000;

  const onStackFileChange = async (changedFile: string) => {
    try {
      const layerName = basename(changedFile);
      console.log(chalk.cyan(`  ${figures.info} ${layerName} changed \u2014 recompiling stack...`));

      const updatedResult = compileStack({ stackDir });

      if (updatedResult.warnings.length > 0) {
        for (const w of updatedResult.warnings) {
          console.log(chalk.yellow(`  ${figures.warning} ${w}`));
        }
      }

      const updatedConfig = compileEmbodied(updatedResult.spec, provider);
      await runtime.pushUpdate(updatedConfig);
    } catch (err) {
      console.error(chalk.red(`  ${figures.cross} Error on file change: ${err instanceof Error ? err.message : err}`));
    }
  };

  for (const filePath of watchPaths) {
    watchFile(filePath, { interval: pollInterval }, () => {
      void onStackFileChange(filePath);
    });
  }

  // 8. Graceful shutdown
  const shutdown = async () => {
    console.log();
    console.log(chalk.dim("  Shutting down..."));
    for (const filePath of watchPaths) {
      unwatchFile(filePath);
    }
    await runtime.stop();
    console.log(chalk.dim(`  ${figures.tick} Runtime stopped`));
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  // Keep process alive
  await new Promise(() => {});
}

// ─── Shared: Runtime Event Wiring ───────────────────────────

function wireRuntimeEvents(runtime: EmbodimentRuntime): void {
  runtime.on("adapter-connected", (a) => {
    console.log(chalk.green(`  ${figures.tick} ${a.type} adapter connected`));
  });

  runtime.on("adapter-disconnected", (a) => {
    console.log(chalk.yellow(`  ${figures.warning} ${a.type} adapter disconnected`));
  });

  runtime.on("push-success", (a) => {
    const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
    console.log(chalk.dim(`  ${timestamp}  ${figures.arrowRight} pushed to ${a.type}`));
  });

  runtime.on("push-error", (a, error) => {
    console.error(chalk.red(`  ${figures.cross} push to ${a.type} failed: ${error.message}`));
  });

  runtime.on("error", (error) => {
    console.error(chalk.red(`  ${figures.cross} runtime error: ${error.message}`));
  });
}

// ─── Adapter Factory ────────────────────────────────────────

function createAdapter(type: string, options: EmbodyOptions): RuntimeAdapter {
  switch (type) {
    case "ros2": {
      const endpoint = options.endpoint ?? "ws://localhost:9090";
      return new ROS2Adapter({
        endpoint,
        topicPrefix: options.topicPrefix,
      });
    }

    case "unity": {
      const port = parseInt(options.port ?? "8765", 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        throw new Error("Invalid port number for Unity adapter");
      }
      const transitionMs = options.transition ? parseInt(options.transition, 10) : undefined;
      return new UnityAdapter({
        port,
        defaultTransition: transitionMs
          ? { duration_ms: transitionMs, easing: "ease_in_out" }
          : undefined,
      });
    }

    case "webhook": {
      if (!options.url) {
        throw new Error("--url is required for the webhook adapter");
      }
      const headers: Record<string, string> = {};
      if (options.headers) {
        // Parse "Key:Value,Key2:Value2" format
        for (const pair of options.headers.split(",")) {
          const [key, ...rest] = pair.split(":");
          if (key && rest.length > 0) {
            headers[key.trim()] = rest.join(":").trim();
          }
        }
      }
      return new WebhookAdapter({
        url: options.url,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        bearerToken: options.bearerToken,
      });
    }

    case "isaac": {
      const host = options.endpoint ? new URL(options.endpoint).hostname : "localhost";
      const port = options.port ? parseInt(options.port, 10) : 8211;
      return new IsaacSimAdapter({
        host,
        port,
        headless: false,
      });
    }

    default:
      throw new Error(`Unknown adapter type: ${type}. Use ros2, unity, webhook, or isaac.`);
  }
}
