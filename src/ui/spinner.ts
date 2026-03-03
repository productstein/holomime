import ora, { type Ora } from "ora";
import chalk from "chalk";

const SPINNER_COLOR = "cyan" as const;

export function createSpinner(text: string): Ora {
  return ora({
    text: chalk.dim(text),
    color: SPINNER_COLOR,
    indent: 2,
  });
}

export async function withSpinner<T>(text: string, fn: () => Promise<T>): Promise<T> {
  const spinner = createSpinner(text);
  spinner.start();
  try {
    const result = await fn();
    spinner.succeed(chalk.dim(text));
    return result;
  } catch (err) {
    spinner.fail(chalk.red(text));
    throw err;
  }
}
