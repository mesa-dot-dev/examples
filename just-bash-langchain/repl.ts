/**
 * A tiny REPL that renders a LangChain/LangGraph agent streaming response.
 *
 * This is boilerplate — the interesting parts (Mesa setup, tool definition, agent config)
 * live in index.ts. This file just handles readline and stream chunk rendering.
 */

import * as readline from 'node:readline';
import type { BaseMessage } from '@langchain/core/messages';
import { HumanMessage } from '@langchain/core/messages';
import type { StreamMode } from '@langchain/langgraph';
import { z } from 'zod';

const bashOutputSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number(),
});

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

interface LangChainAgent {
  stream(input: { messages: BaseMessage[] }, opts: { streamMode: StreamMode[] }): Promise<AsyncIterable<[string, any]>>;
}

export async function langchainRepl(agent: LangChainAgent): Promise<void> {
  let messages: BaseMessage[] = [];
  let lastBlockType: string | undefined;

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

    messages.push(new HumanMessage(trimmed));

    // LangGraph uses a dual-stream approach:
    //   "values" = full graph state after each step (canonical history for the next turn)
    //   "messages" = token-level chunks for rendering in the UI
    //
    // Do not persist "messages" stream chunks: they are partial and may be empty text blocks,
    // which Anthropic rejects on the following request.
    for await (const [mode, data] of await agent.stream(
      { messages },
      { streamMode: ['values', 'messages'] satisfies StreamMode[] }
    )) {
      if (mode === 'values') {
        messages = data.messages;
        continue;
      }

      if (mode === 'messages') {
        const [chunk] = data;

        for (const block of chunk.contentBlocks) {
          switch (block.type) {
            case 'reasoning': {
              if (lastBlockType !== 'reasoning') console.log('\n--- thinking ---');
              process.stdout.write(truncate(block.reasoning));
              lastBlockType = block.type;
              break;
            }
            case 'text': {
              if (chunk.type === 'tool') {
                const { stdout, stderr, exitCode } = bashOutputSchema.parse(JSON.parse(block.text));
                if (stdout) console.log(`\n${truncate(stdout)}`);
                if (stderr) console.log(`\n${truncate(stderr)}`);
                if (exitCode !== 0) console.error(`\n[exit ${exitCode}]`);
                lastBlockType = 'tool_call_result';
                break;
              }
              if (lastBlockType !== 'text') console.log('\n');
              process.stdout.write(block.text);
              lastBlockType = block.type;
              break;
            }
            case 'tool_call': {
              console.log(`\n[bash] ${block.name}`);
              lastBlockType = block.type;
              break;
            }
          }
        }
      }
    }
  }
}
