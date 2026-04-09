/**
 * A tiny REPL that executes bash commands against a Mesa virtual filesystem.
 *
 * This is a minimal REPL and is not a full shell — it's intended as a demonstration
 * of how to interact with a Mesa repo programmatically via just-bash.
 */

import * as readline from 'node:readline';

interface Bash {
  exec(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

function question(rl: readline.Interface, prompt: string): Promise<string | null> {
  return new Promise((resolve) => {
    rl.once('close', () => resolve(null));
    rl.question(prompt, (answer) => resolve(answer));
  });
}

/**
 * Spawns an interactive REPL that runs bash commands against a Mesa virtual filesystem.
 */
export default async function tinyBashRepl(bash: Bash): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  while (true) {
    const input = await question(rl, '$ ');

    if (input === null) {
      break;
    }

    const trimmed = input.trim();
    if (!trimmed) continue;
    if (trimmed === 'exit') break;

    const { stdout, stderr, exitCode } = await bash.exec(trimmed);

    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);

    if (exitCode !== 0) {
      console.error(`[exit ${exitCode}]`);
    }
  }
}
