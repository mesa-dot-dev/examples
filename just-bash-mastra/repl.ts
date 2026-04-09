/**
 * A tiny REPL that renders a Mastra agent streaming response.
 *
 * This is boilerplate — the interesting parts (Mesa setup, tool definition, agent config)
 * live in index.ts. This file just handles readline and stream chunk rendering.
 */

import * as readline from 'node:readline';
import type { Agent } from '@mastra/core/agent';
import { type ModelMessage, stepCountIs } from 'ai';

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

export async function mastraRepl(agent: Agent): Promise<void> {
  const messages: ModelMessage[] = [];

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

    messages.push({ role: 'user', content: trimmed });

    const stream = await agent.stream(messages, {
      stopWhen: stepCountIs(50),
    });

    for await (const chunk of stream.fullStream) {
      switch (chunk.type) {
        case 'reasoning-start':
          console.log('--- thinking ---');
          break;
        case 'reasoning-delta':
          process.stdout.write(chunk.payload.text);
          break;
        case 'reasoning-end':
          console.log('\n--- /thinking ---\n');
          break;

        case 'text-delta':
          process.stdout.write(chunk.payload.text);
          break;
        case 'text-end':
          console.log('\n');
          break;

        case 'tool-call':
          console.log(`[${chunk.payload.toolName}] ${JSON.stringify(chunk.payload.args)}`);
          break;

        case 'tool-result': {
          const { stdout, stderr, exitCode } = chunk.payload.result as {
            stdout: string;
            stderr: string;
            exitCode: number;
          };
          if (stdout) console.log(truncate(stdout));
          if (stderr) console.log(truncate(stderr));
          if (exitCode !== 0) console.log(`[exit ${exitCode}]`);
          break;
        }

        case 'error':
          console.error(`[error] ${chunk.payload.error}`);
          break;

        default:
          break;
      }
    }
    console.log();

    const response = await stream.response;
    messages.push(...(response.messages ?? []));
  }
}
