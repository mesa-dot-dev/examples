import path from 'node:path';
import * as readline from 'node:readline';
import type { Sandbox } from '@superserve/sdk';

/**
 * Options parameter for the @see tinySuperserveRepl function.
 */
export interface ISuperserveReplOptions {
  /** The current working directory. */
  cwd: string | undefined;
}

type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

function expandTilde(filePath: string, homedir: string): string {
  return filePath.startsWith('~') ? path.posix.join(homedir, filePath.slice(1)) : filePath;
}

class ShellState {
  #homedir: string;
  #cwd: string;
  #sandbox: Sandbox;

  private constructor(homedir: string, cwd: string, sandbox: Sandbox) {
    this.#homedir = homedir;
    this.#cwd = cwd;
    this.#sandbox = sandbox;
  }

  static async create(sandbox: Sandbox, cwd: string): Promise<ShellState> {
    const homedir = await ShellState.probeHome(sandbox);
    return new ShellState(homedir, expandTilde(cwd, homedir), sandbox);
  }

  /** Execute a shell command. Handles `cd` gracefully enough. */
  async run(cmd: string): Promise<CommandResult | null> {
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

    const result = await this.#sandbox.commands.run(`cd ${this.#cwd} && ${trimmed}`);
    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  private static async probeHome(sandbox: Sandbox): Promise<string> {
    const result = await sandbox.commands.run('echo $HOME');
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
export default async function tinySuperserveRepl(
  sandbox: Sandbox,
  options: ISuperserveReplOptions | undefined
): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const shell = await ShellState.create(sandbox, options?.cwd ?? '~');

  console.log(`Connected to ${options?.cwd ?? '~'}. Type "exit" or Ctrl+C to quit.\n`);

  while (true) {
    const input = await question(rl, '$ ');

    if (input === null) {
      break;
    }

    if (input.trim() === 'exit') {
      break;
    }

    const result = await shell.run(input);
    if (result === null) {
      continue;
    }

    const { exitCode, stdout, stderr } = result;

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
