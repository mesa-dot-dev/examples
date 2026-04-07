import { Devbox } from "@runloop/api-client";
import * as readline from "node:readline";
import path from "path";

/**
 * Options parameter for the @see tinyRunloopRepl function.
 */
export interface IRunloopReplOptions {
  /** The current working directory. */
  cwd: string | undefined;
}

function expandTilde(filePath: string, homedir: string): string {
  return filePath.startsWith("~") ? path.posix.join(homedir, filePath.slice(1)): filePath;
}

class ShellState {
  #homedir: string;
  #cwd: string;
  #devbox: Devbox;

  private constructor(homedir: string, cwd: string, devbox: Devbox) {
    this.#homedir = homedir;
    this.#cwd = cwd;
    this.#devbox = devbox;
  }

  static async create(devbox: Devbox, cwd: string): Promise<ShellState> {
    const homedir = await ShellState.probeHome(devbox);
    return new ShellState(homedir, expandTilde(cwd, homedir), devbox);
  }

  /** Execute a shell command. Handles `cd` gracefully enough. */
  async run(cmd: string): Promise<[number | null, string | null , string | null] | null> {
    const trimmed: string = cmd.trim();
    if (!trimmed) {
      return null;
    }

    const splitCommand = trimmed.split(/\s+/);
    if (splitCommand[0] === "cd") {
      const target = splitCommand[1] ?? "~";
      this.#cwd = path.posix.isAbsolute(target)
        ? splitCommand[1]
        : path.posix.join(this.#cwd, this.expandTilde(target));
      return null;
    }

    const result = await this.#devbox.cmd.exec(`cd ${this.#cwd} && ${trimmed}`);
    return [result.exitCode, await result.stdout(), await result.stderr()];
  }

  private static async probeHome(devbox: Devbox): Promise<string> {
    const result = await devbox.cmd.exec("echo $HOME");
    const stdout = await result.stdout();
    return stdout.trim();
  }

  private expandTilde(filePath: string): string {
    return expandTilde(filePath, this.#homedir);
  }
}

function question(rl: readline.Interface, prompt: string): Promise<string | null> {
  return new Promise((resolve) => {
    rl.once("close", () => resolve(null));
    rl.question(prompt, (answer) => resolve(answer));
  });
}

/**
 * Spawns the REPL so that users can use it.
 *
 * This is a tiny REPL and is not a full shell, so it has an incredibly limited subset of regular shell commands.
 */
export default async function tinyRunloopRepl(
  devbox: Devbox,
  options: IRunloopReplOptions | undefined,
): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let shell = await ShellState.create(devbox, options?.cwd ?? "~");

  while (true) {
    const input = await question(rl, "$ ");

    if (input === null) {
      break;
    }

    const res = await shell.run(input);
    if (res === null) {
      continue;
    }

    const [exitCode, stdout, stderr] = res;

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
