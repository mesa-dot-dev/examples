#!/usr/bin/env node

// To run this example, create a .env file in this directory with:
//   MESA_ORG=your-org
//   MESA_REPO=your-repo
//   MESA_API_KEY=your-mesa-key
//   ANTHROPIC_API_KEY=your-anthropic-key
//
// Then run:
//   npm start

import 'dotenv/config';
import { anthropic } from '@ai-sdk/anthropic';
import { Mesa } from '@mesadev/sdk';
import { type ModelMessage, stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';
import { aiSdkRepl } from './repl.ts';

if (!process.env.MESA_API_KEY) {
  throw Error('$MESA_API_KEY not set.');
}
const ORG =
  process.env.MESA_ORG ??
  (() => {
    throw Error('$MESA_ORG not set.');
  })();
const REPO =
  process.env.MESA_REPO ??
  (() => {
    throw Error('$MESA_REPO not set.');
  })();

// The Mesa SDK's `fs.mount()` creates a virtual filesystem backed by Mesa's cloud storage.
// `mesaFs.bash()` returns a bash instance that executes commands against the virtual filesystem.
console.log(`Connecting to ${ORG}/${REPO} via Mesa...`);
const mesa = new Mesa();
const mesaFs = await mesa.fs.mount({
  repos: [{ name: REPO, bookmark: 'main' }],
  mode: 'rw',
});

const bash = mesaFs.bash({ cwd: `/${ORG}/${REPO}` });

// Define a bash tool that the AI agent can call to run commands against the repo.
// The Vercel AI SDK's `tool()` function wraps the bash execution with a typed schema.
const bashTool = tool({
  description: [
    'Execute a bash command against the repository filesystem.',
    `You have bash access to the "${REPO}" repository owned by "${ORG}".`,
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

console.log(`Connected. You can now chat with the agent about ${ORG}/${REPO}.`);
console.log('Type "exit" or Ctrl+C to quit.\n');

await aiSdkRepl(send);
