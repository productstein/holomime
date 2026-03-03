import logUpdate from "log-update";
import chalk from "chalk";

/**
 * Stream text character-by-character to the terminal.
 * Simulates real-time typing for therapy session output.
 */
export async function streamText(
  text: string,
  opts: { prefix?: string; charDelay?: number } = {},
): Promise<void> {
  const prefix = opts.prefix ?? "";
  const charDelay = opts.charDelay ?? 15;
  let output = "";

  for (const char of text) {
    output += char;
    logUpdate(`${prefix}${output}${chalk.dim("\u2588")}`);
    await sleep(charDelay);
  }

  // Final render without cursor
  logUpdate(`${prefix}${output}`);
  logUpdate.done();
}

/**
 * Show a typing indicator that animates.
 */
export function showTypingIndicator(label: string): { stop: () => void } {
  const frames = ["\u2024  ", "\u2024\u2024 ", "\u2024\u2024\u2024"];
  let i = 0;
  const interval = setInterval(() => {
    logUpdate(`  ${chalk.dim(label)} ${chalk.cyan(frames[i % frames.length])}`);
    i++;
  }, 300);

  return {
    stop: () => {
      clearInterval(interval);
      logUpdate.clear();
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
