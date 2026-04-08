#!/usr/bin/env node
/**
 * Mesa + just-bash interactive CLI agent (Mastra)
 *
 * Connects to a Mesa repo via MesaFS, gives an AI agent bash access
 * to explore and work with the repo's files.
 *
 * Usage:
 *   npx tsx src/index.ts <org> <repo>
 *
 * Environment:
 *   MESA_API_KEY  — Mesa admin API key
 *   ANTHROPIC_API_KEY   — Anthropic API key
 */

import * as readline from "node:readline";
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { Mesa } from "@mesadev/sdk";
import { z } from "zod";
import { type ModelMessage, stepCountIs } from "ai";

// --- ANSI helpers (zero deps) ---

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const blue = (s: string) => `\x1b[34m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

const [org, repo] = process.argv.slice(2);

if (!org || !repo) {
  console.error("Usage: npx tsx src/index.ts <org> <repo>");
  process.exit(1);
}

// --- Bootstrap ---

console.log(`Connecting to ${org}/${repo} via Mesa...`);

const mesa = new Mesa({ org });

const mesaFs = await mesa.fs.mount({
  repos: [{ name: repo, bookmark: "main" }],
  mode: "rw",
});

const bash = mesaFs.bash({ cwd: `/${org}/${repo}` });

// --- Tool ---

const bashInputSchema = z.object({
  command: z.string().describe("The bash command to execute"),
});

const bashOutputSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number(),
});

const bashTool = createTool({
  id: "bash",
  description: [
    "Execute a bash command against the repository filesystem.",
    `You have bash access to the "${repo}" repository owned by "${org}".`,
    "Use standard unix commands (ls, cat, grep, find, head, etc.) to explore.",
  ].join("\n"),
  inputSchema: bashInputSchema,
  outputSchema: bashOutputSchema,
  execute: ({ command }) => bash.exec(command),
});

// --- Agent ---

const agent = new Agent({
  id: "mesa-bash-agent",
  name: "Mesa Bash Agent",
  instructions: [
    `You have bash access to the "${repo}" repository owned by "${org}".`,
    "Use the bash tool to explore and answer questions about the repo.",
  ].join("\n"),
  model: "anthropic/claude-sonnet-4-20250514",
  tools: { bash: bashTool },
});

console.log(`Connected. You can now chat with the agent about ${org}/${repo}.`);
console.log('Type "exit" or Ctrl+C to quit.\n');

// --- REPL ---

const messages: ModelMessage[] = [];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.on("close", () => {
  console.log("\nDisconnected.");
  process.exit(0);
});

/** Truncate text to first N lines with a summary suffix. */
function truncate(text: string, maxLines = 10): string {
  const lines = text.trimEnd().split("\n");
  if (lines.length <= maxLines) return text.trimEnd();
  return (
    lines.slice(0, maxLines).join("\n") +
    `\n  ... (${lines.length - maxLines} more lines)`
  );
}

function prompt(): void {
  rl.question("> ", async (input) => {
    const trimmed = input.trim();
    if (!trimmed) return prompt();
    if (trimmed === "exit") {
      rl.close();
    }

    messages.push({ role: "user", content: trimmed });

    const stream = await agent.stream(messages, {
      stopWhen: stepCountIs(50),
    });

    // Stream text output
    for await (const chunk of stream.fullStream) {
      switch (chunk.type) {
        // --- Reasoning / thinking ---
        case "reasoning-start":
          console.log(dim("--- thinking ---"));
          break;
        case "reasoning-delta":
          process.stdout.write(dim(chunk.payload.text));
          break;
        case "reasoning-end":
          console.log(`\n${dim("--- /thinking ---")}\n`);
          break;

        // --- Text output ---
        case "text-delta":
          process.stdout.write(chunk.payload.text);
          break;
        case "text-end":
          console.log("\n");
          break;

        // --- Tool use ---
        case "tool-call": {
          if (chunk.payload.toolName !== "bash") throw new Error(`Unexpected tool name: ${chunk.payload.toolName}`);
          const { command } = bashInputSchema.parse(chunk.payload.args);
          console.log(`${blue("[bash]")} ${command.trim()}`);
          break;
        }

        case "tool-result": {
          if (chunk.payload.toolName !== "bash") throw new Error(`Unexpected tool name: ${chunk.payload.toolName}`);
          const { stdout, stderr, exitCode } = bashOutputSchema.parse(chunk.payload.result);
          const text = stdout || stderr;
          if (text) console.log(dim(truncate(text)));
          if (exitCode !== 0) console.log(red(`[exit ${exitCode}] (non-zero)`));
          break;
        }

        // --- Errors ---
        case "error":
          console.error(red(`[error] ${chunk.payload.error}`));
          break;

        default:
          break;
      }
    }
    console.log();

    // Save assistant response to history
    const response = await stream.response;
    messages.push(...response.messages ?? []);

    prompt();
  });
}

prompt();
