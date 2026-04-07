import { Devbox } from "@runloop/api-client";
import * as readline from "node:readline";

/** Spawns the REPL so that users can use it. */
export default function tinyRunloopRepl(devbox: Devbox, maybeRl?): Promise<void> {
  const isFirstCall = !maybeRl;
  const rl = maybeRl ?? readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<void>((resolve) => {
    if (isFirstCall) {
      rl.on("close", () => resolve());
    }

    rl.question("$ ", async (input: string) => {
      const trimmed = input.trim();

      if (!trimmed) {
        resolve(tinyRunloopRepl(devbox, rl));
        return;
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

      resolve(tinyRunloopRepl(devbox, rl));
    });
  });
}
