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
import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { Mesa } from '@mesadev/sdk';
import { z } from 'zod';
import { mastraRepl } from './repl.ts';

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

// Define a bash tool using Mastra's `createTool()`. The agent will call this to run commands
// against the repo's virtual filesystem.
const bashTool = createTool({
  id: 'bash',
  description: [
    'Execute a bash command against the repository filesystem.',
    `You have bash access to the "${REPO}" repository owned by "${ORG}".`,
    'Use standard unix commands (ls, cat, grep, find, head, etc.) to explore.',
  ].join('\n'),
  inputSchema: z.object({ command: z.string().describe('The bash command to execute') }),
  outputSchema: z.object({ stdout: z.string(), stderr: z.string(), exitCode: z.number() }),
  execute: ({ command }) => bash.exec(command),
});

// Mastra's `Agent` class wraps the model + tools into a single object with built-in
// model routing (the "anthropic/" prefix routes to Anthropic's API).
const agent = new Agent({
  id: 'mesa-bash-agent',
  name: 'Mesa Bash Agent',
  instructions: [
    `You have bash access to the "${REPO}" repository owned by "${ORG}".`,
    'Use the bash tool to explore and answer questions about the repo.',
  ].join('\n'),
  model: 'anthropic/claude-sonnet-4-20250514',
  tools: { bash: bashTool },
});

console.log(`Connected. You can now chat with the agent about ${ORG}/${REPO}.`);
console.log('Type "exit" or Ctrl+C to quit.\n');

await mastraRepl(agent);
