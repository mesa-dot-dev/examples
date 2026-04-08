#!/usr/bin/env node
/**
 * Mesa + just-bash interactive CLI agent (LangChain)
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
import { createAgent, tool } from "langchain";
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { Mesa } from "@mesadev/sdk";
import { z } from "zod";

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

const bashTool = tool(
  ({ command }) => bash.exec(command),
  {
    name: "bash",
    description: [
      "Execute a bash command against the repository filesystem.",
      `You have bash access to the "${repo}" repository owned by "${org}".`,
      "Use standard unix commands (ls, cat, grep, find, head, etc.) to explore.",
    ].join("\n"),
    schema: bashInputSchema,

  }
);

// --- Agent ---

const agent = createAgent({
  model: new ChatAnthropic({ model: "claude-sonnet-4-20250514" }),
  tools: [bashTool],
});

console.log(`Connected. You can now chat with the agent about ${org}/${repo}.`);
console.log('Type "exit" or Ctrl+C to quit.\n');

// --- REPL ---

let messages: BaseMessage[] = [];

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

let lastBlockType: string | undefined;

function prompt(): void {
  rl.question("> ", async (input) => {
    const trimmed = input.trim();
    if (!trimmed) return prompt();
    if (trimmed === "exit") {
      rl.close();
    }

    messages.push(new HumanMessage(trimmed));

    // "messages" = token-level chunks for the UI; "values" = canonical history for the next request.
    for await (const [mode, data] of await agent.stream(
      { messages },
      // "values" = full graph state after each step (canonical messages for the next turn).
      // Do not persist "messages" stream chunks: they are partial and may be empty text blocks,
      // which Anthropic rejects on the following request.
      { streamMode: ["values", "messages"] }
    )) {
      if (mode === "values") {
        messages = data.messages;
        continue;
      }

      if (mode === "messages") {
        const [chunk] = data;

        for (const block of chunk.contentBlocks) {
          switch (block.type) {
            case "reasoning": {
              if (lastBlockType !== "reasoning") console.log(dim("\n--- thinking ---"));
              process.stdout.write(dim(truncate(block.reasoning)));
              lastBlockType = block.type;
              break;
            }
            case "text": {
              if (chunk.type === "tool") {
                const output = bashOutputSchema.parse(JSON.parse(block.text));
                const text = output.stdout || output.stderr;
                if (text) console.log("\n" + dim(truncate(text)));
                if (output.exitCode !== 0) console.error(red(`\n[exit ${output.exitCode}]`));
                lastBlockType = 'tool_call_result';
                break;
              }
              if (lastBlockType !== "text") console.log("\n");
              process.stdout.write(block.text);
              lastBlockType = block.type;
              break;
            }
            case "tool_call": {
              console.log("\n" + `${blue("[bash]")} ${block.name}`);
              lastBlockType = block.type;
              break;
            }
          }
        }
      }
    }

    prompt();
  });
}

prompt();
