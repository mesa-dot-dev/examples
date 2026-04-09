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
import { ChatAnthropic } from '@langchain/anthropic';
import { Mesa } from '@mesadev/sdk';
import { createAgent, tool } from 'langchain';
import { z } from 'zod';
import { langchainRepl } from './repl.ts';

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

// Define a bash tool using LangChain's `tool()`. The agent will call this to run commands
// against the repo's virtual filesystem.
const bashTool = tool(({ command }) => bash.exec(command), {
  name: 'bash',
  description: [
    'Execute a bash command against the repository filesystem.',
    `You have bash access to the "${REPO}" repository owned by "${ORG}".`,
    'Use standard unix commands (ls, cat, grep, find, head, etc.) to explore.',
  ].join('\n'),
  schema: z.object({ command: z.string().describe('The bash command to execute') }),
});

// LangChain's `createAgent()` wires up the model + tools into a LangGraph runtime
// that handles the tool-calling loop automatically.
const agent = createAgent({
  model: new ChatAnthropic({ model: 'claude-sonnet-4-20250514' }),
  tools: [bashTool],
});

console.log(`Connected. You can now chat with the agent about ${ORG}/${REPO}.`);
console.log('Type "exit" or Ctrl+C to quit.\n');

await langchainRepl(agent);
console.log('Disconnected.');
