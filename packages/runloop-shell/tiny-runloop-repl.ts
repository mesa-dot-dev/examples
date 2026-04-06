import { Devbox } from "@runloop/api-client";
import * as readline from "node:readline";

export default class TinyRunloopRepl {
  #readline = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  #devbox: Devbox

  constructor(devbox: Devbox) {
    this.#devbox = devbox;
  }

  /** Spawns the REPL so that users can use it. */
  run() {
    this.#readline.question("$ ", async (input: string) => {
      const trimmed = input.trim();

      if (!trimmed) {
        return this.run();
      }

      const result = await this.#devbox.cmd.exec(trimmed);
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

      this.run();
    });
  }
}
