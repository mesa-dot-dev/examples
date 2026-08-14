#!/usr/bin/env node

// To run this example, create a .env file in this directory with:
//   MESA_REPO=your-repo
//   MESA_PRIVATE_KEY=your-signing-private-key
//   ANTHROPIC_API_KEY=your-anthropic-key
//
// Then run:
//   npm start

import 'dotenv/config';
import { anthropic } from '@ai-sdk/anthropic';
import { Mesa, repo } from '@mesadev/sdk';
import { type ModelMessage, stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';
import { aiSdkRepl } from './repl.ts';

if (!process.env.MESA_PRIVATE_KEY) {
  throw Error('$MESA_PRIVATE_KEY not set.');
}
const REPO =
  process.env.MESA_REPO ??
  (() => {
    throw Error('$MESA_REPO not set.');
  })();

// The Mesa SDK's layout mount creates a virtual filesystem backed by Mesa's cloud storage.
// `mesaFs.bash()` returns a bash instance that executes commands against the virtual filesystem.
const mesa = new Mesa({ privateKey: process.env.MESA_PRIVATE_KEY });
const org = mesa.org.slug;
console.log(`Connecting to ${org}/${REPO} via Mesa...`);
const mesaFs = await mesa
  .fs({
    layout: { [`/${org}/${REPO}`]: repo(REPO, { mode: 'rw', at: { bookmark: 'main' } }) },
    authors: [{ name: 'App Agent', email: 'agent@example.com' }],
  })
  .mount();

const bash = mesaFs.bash({ cwd: `/${org}/${REPO}` });

// Define a bash tool that the AI agent can call to run commands against the repo.
// The Vercel AI SDK's `tool()` function wraps the bash execution with a typed schema.
const bashTool = tool({
  description: [
    'Execute a bash command against the repository filesystem.',
    `You have bash access to the "${REPO}" repository owned by "${org}".`,
    'Use standard unix commands (ls, cat, grep, find, head, etc.) to explore.',
  ].join('\n'),
  inputSchema: z.object({ command: z.string().describe('The bash command to execute') }),
  outputSchema: z.object({ stdout: z.string(), stderr: z.string(), exitCode: z.number() }),
  execute: ({ command }) => bash.exec(command),
});

// Send a message to the agent and get a streaming response.
// `streamText` runs Claude in a tool loop — it calls tools automatically and streams
// reasoning, tool calls, and text as they happen.
const send = (messages: ModelMessage[]) => {
  return streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    tools: { bash: bashTool },
    stopWhen: stepCountIs(50),
    messages,
  });
};

console.log(`Connected. You can now chat with the agent about ${org}/${REPO}.`);
console.log('Type "exit" or Ctrl+C to quit.\n');

await aiSdkRepl(send);
