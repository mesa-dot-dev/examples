/**
 * A tiny REPL that renders a Vercel AI SDK streaming response.
 *
 * This is boilerplate — the interesting parts (Mesa setup, tool definition, model config)
 * live in index.ts. This file just handles readline and stream chunk rendering.
 */

import * as readline from 'node:readline';
import type { ModelMessage, Output as OutputHelpers, StreamTextResult, ToolSet } from 'ai';

/** Stream-text output mode (`output.text()`, `output.object()`, …) — the `Output` *type* lives on the merged `output` helper export. */
type StreamOutput = OutputHelpers.Output;

type Send<TOOLS extends ToolSet, OUTPUT extends StreamOutput = StreamOutput> = (
  messages: ModelMessage[]
) => StreamTextResult<TOOLS, OUTPUT>;

function truncate(text: string, maxLines = 10): string {
  const lines = text.trimEnd().split('\n');
  if (lines.length <= maxLines) return text.trimEnd();
  return `${lines.slice(0, maxLines).join('\n')}\n  ... (${lines.length - maxLines} more lines)`;
}

function question(rl: readline.Interface, prompt: string): Promise<string | null> {
  return new Promise((resolve) => {
    rl.once('close', () => resolve(null));
    rl.question(prompt, (answer) => resolve(answer));
  });
}

export async function aiSdkRepl<TOOLS extends ToolSet, OUTPUT extends StreamOutput = StreamOutput>(
  send: Send<TOOLS, OUTPUT>
): Promise<void> {
  const history: ModelMessage[] = [];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  while (true) {
    const input = await question(rl, '> ');
    if (input === null) break;

    const trimmed = input.trim();
    if (!trimmed) continue;
    if (trimmed === 'exit') break;

    history.push({ role: 'user', content: trimmed });
    const result = send(history);

    for await (const chunk of result.fullStream) {
      switch (chunk.type) {
        case 'reasoning-start':
          console.log('--- thinking ---');
          break;
        case 'reasoning-delta':
          process.stdout.write(chunk.text);
          break;
        case 'reasoning-end':
          console.log('\n--- /thinking ---\n');
          break;

        case 'text-delta':
          process.stdout.write(chunk.text);
          break;
        case 'text-end':
          console.log('\n');
          break;

        case 'tool-call':
          console.log(`[${chunk.toolName}] ${JSON.stringify(chunk.input)}`);
          break;

        case 'tool-result': {
          const { stdout, stderr, exitCode } = chunk.output as { stdout: string; stderr: string; exitCode: number };
          if (stdout) {
            console.log(truncate(stdout));
          }
          if (stderr) {
            console.log(truncate(stderr));
          }
          if (exitCode !== 0) {
            console.log(`[exit ${exitCode}]`);
          }
          break;
        }

        case 'error':
          console.error(`[error] ${chunk.error}`);
          break;

        default:
          break;
      }
    }

    const response = await result.response;
    history.push(...response.messages);
  }
}
