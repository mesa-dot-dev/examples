import { Devbox } from "@runloop/api-client";
import * as readline from "node:readline";

function question(rl: readline.Interface, prompt: string): Promise<string | null> {
  return new Promise((resolve) => {
    rl.once("close", () => resolve(null));
    rl.question(prompt, (answer) => resolve(answer));
  });
}

/** Spawns the REPL so that users can use it. */
export default async function tinyRunloopRepl(devbox: Devbox): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  while (true) {
    const input = await question(rl, "$ ");

    if (input === null) {
      break;
    }

    const trimmed = input.trim();
    if (!trimmed) {
      continue;
    }

    const result = await devbox.cmd.exec(trimmed);
    const exitCode = result.exitCode;
    const stdout = await result.stdout();
    const stderr = await result.stderr();

    if (stdout) {
      process.stdout.write(stdout);
    }

    if (stderr) {
      process.stderr.write(stderr);
    }

    if (exitCode !== null && exitCode !== 0) {
      console.error(`The process exited with a non-zero exit code: ${exitCode}`);
    }
  }
}
