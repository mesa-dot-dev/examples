import path from 'node:path';
import * as readline from 'node:readline';
import type { Sprite } from '@fly/sprites';

/**
 * Options parameter for the @see tinySpritesRepl function.
 */
export interface ISpritesReplOptions {
  /** The current working directory. */
  cwd: string | undefined;
}

type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

class ShellState {
  #cwd: string;
  #sprite: Sprite;

  private constructor(cwd: string, sprite: Sprite) {
    this.#cwd = cwd;
    this.#sprite = sprite;
  }

  static create(sprite: Sprite, cwd: string): ShellState {
    return new ShellState(cwd, sprite);
  }

  /** Execute a shell command. Handles `cd` gracefully enough. */
  async run(cmd: string): Promise<CommandResult | null> {
    const trimmed: string = cmd.trim();
    if (!trimmed) {
      return null;
    }

    const splitCommand = trimmed.split(/\s+/);
    if (splitCommand[0] === 'cd') {
      const target = splitCommand[1] ?? this.#cwd;
      this.#cwd = path.posix.isAbsolute(target) ? target : path.posix.join(this.#cwd, target);
      return null;
    }

    // const { exitCode, stdout, stderr } = await this.#sprite.exec(`cd ${this.#cwd} && ${trimmed}`);
    const { exitCode, stdout, stderr } = await this.#sprite.execFile('sh', ['-c', `cd ${this.#cwd} && ${trimmed}`]);
    return {
      exitCode: exitCode,
      stdout: String(stdout),
      stderr: String(stderr),
    };
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
export default async function tinySpritesRepl(sprite: Sprite, options: ISpritesReplOptions | undefined): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const shell = ShellState.create(sprite, options?.cwd ?? '/');

  console.log(`Connected to ${options?.cwd ?? '/'}. Type "exit" or Ctrl+C to quit.\n`);

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
