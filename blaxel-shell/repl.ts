import path from 'node:path';
import * as readline from 'node:readline';
import type { SandboxInstance } from '@blaxel/core';

/**
 * Options parameter for the @see tinyBlaxelRepl function.
 */
export interface IReplOptions {
  /** The current working directory. */
  cwd: string | undefined;
}

function expandTilde(filePath: string, homedir: string): string {
  return filePath.startsWith('~') ? path.posix.join(homedir, filePath.slice(1)) : filePath;
}

class ShellState {
  #homedir: string;
  #cwd: string;
  #sandbox: SandboxInstance;

  private constructor(homedir: string, cwd: string, sandbox: SandboxInstance) {
    this.#homedir = homedir;
    this.#cwd = cwd;
    this.#sandbox = sandbox;
  }

  static async create(sandbox: SandboxInstance, cwd: string): Promise<ShellState> {
    const homedir = await ShellState.probeHome(sandbox);
    return new ShellState(homedir, expandTilde(cwd, homedir), sandbox);
  }

  /** Execute a shell command. Handles `cd` gracefully enough. */
  async run(cmd: string): Promise<[number | null, string | null, string | null] | null> {
    const trimmed: string = cmd.trim();
    if (!trimmed) {
      return null;
    }

    const splitCommand = trimmed.split(/\s+/);
    if (splitCommand[0] === 'cd') {
      const target = splitCommand[1] ?? '~';
      this.#cwd = path.posix.isAbsolute(target)
        ? splitCommand[1]
        : path.posix.join(this.#cwd, this.expandTilde(target));
      return null;
    }

    const result = await this.#sandbox.process.exec({
      command: `cd ${this.#cwd} && ${trimmed}`,
      waitForCompletion: true,
    });
    return [result.exitCode, result.stdout, result.stderr];
  }

  private static async probeHome(sandbox: SandboxInstance): Promise<string> {
    const result = await sandbox.process.exec({ command: 'echo $HOME', waitForCompletion: true });
    return result.stdout.trim();
  }

  private expandTilde(filePath: string): string {
    return expandTilde(filePath, this.#homedir);
  }
}

function question(rl: readline.Interface, prompt: string): Promise<string | null> {
  return new Promise((resolve) => {
    rl.once('close', () => resolve(null));
    rl.question(prompt, (answer) => resolve(answer));
  });
}

/**
 * Spawns the REPL so that users can use it.
 *
 * This is a tiny REPL and is not a full shell, so it has an incredibly limited subset of regular shell commands.
 */
export default async function tinyBlaxelRepl(
  sandbox: SandboxInstance,
  options: IReplOptions | undefined
): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const shell = await ShellState.create(sandbox, options?.cwd ?? '~');

  while (true) {
    const input = await question(rl, '$ ');

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
