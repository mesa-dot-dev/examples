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
 *   MESA_ADMIN_API_KEY  — Mesa admin API key
 *   ANTHROPIC_API_KEY   — Anthropic API key
 */

import * as readline from "node:readline";
import { createAgent, tool } from "langchain";
import { ChatAnthropic } from "@langchain/anthropic";
import { AIMessageChunk } from "@langchain/core/messages";
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

const mesaFs = await mesa.fs.create({
  repos: [{ name: repo, desiredBookmark: "main" }],
  mode: "rw",
});

const bash = mesaFs.bash({ cwd: `/${org}/${repo}` });

// --- Tool ---

const bashInputSchema = z.object({
  command: z.string().describe("The bash command to execute"),
});

const bashTool = tool(
  async ({ command }: { command: string }) => {
    const result = await bash.exec(command);
    const output = result.stdout || result.stderr;
    return [output, `[exit ${result.exitCode}]`].filter(Boolean).join("\n");
  },
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

let history: BaseMessage[] = [];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.on("close", () => {
  console.log("\nBye!");
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
      console.log("Bye!");
      rl.close();
      process.exit(0);
    }

    history.push({ role: "user", content: trimmed } as any);

    try {
      // Multi-mode streaming:
      // - "messages": token-level AIMessageChunks (text deltas, reasoning blocks)
      // - "updates":  complete messages per step (tool calls, tool results, history)
      const stream = await agent.stream(
        { messages: history },
        { streamMode: ["messages", "updates"] }
      );

      // Track state for rendering newlines between sections
      let lastType = "";

      for await (const [mode, data] of stream) {
        // --- Token-level streaming (text + reasoning) ---
        if (mode === "messages") {
          const [chunk] = data as [AIMessageChunk, any];
          if (!AIMessageChunk.isInstance(chunk)) continue;

          for (const block of chunk.contentBlocks) {
            switch (block.type) {
              case "reasoning":
                if (lastType !== "reasoning") {
                  console.log(dim("--- thinking ---"));
                  lastType = "reasoning";
                }
                if (block.reasoning) {
                  process.stdout.write(dim(block.reasoning));
                }
                break;

              case "text":
                if (lastType === "reasoning") {
                  console.log("\n" + dim("--- /thinking ---"));
                }
                if (lastType && lastType !== "text") console.log();
                lastType = "text";
                if (block.text) {
                  process.stdout.write(block.text);
                }
                break;
            }
          }
        }

        // --- Step-level updates (tool calls, tool results, history) ---
        if (mode === "updates") {
          const update = data as Record<string, any>;
          const [, content] = Object.entries(update)[0];
          const messages: BaseMessage[] = content?.messages ?? [];

          for (const msg of messages) {
            history.push(msg); // accumulate for multi-turn

            if (AIMessageChunk.isInstance(msg)) {
              // Render tool calls from the completed model response
              const toolCalls = msg.tool_calls ?? [];
              if (!toolCalls.length) continue;
              if (lastType === "text" || lastType === "reasoning") {
                console.log();
              }
              console.log(); // blank line before tool calls
              lastType = "tool";
              for (const tc of toolCalls) {
                const { command } = bashInputSchema.parse(tc.args);
                console.log(`${blue("[bash]")} ${command.trim()}`);
              }
            } else {
              // Tool result — print the content directly
              const raw =
                typeof msg.content === "string" ? msg.content : "";
              if (raw) console.log(dim(truncate(raw)));
            }
          }
        }
      }

      // Final newline after text output
      if (lastType === "text") console.log();
      if (lastType === "reasoning") {
        console.log("\n" + dim("--- /thinking ---"));
      }
    } catch (err) {
      console.error(
        red("Error:"),
        err instanceof Error ? `${err.message}\n${err.stack}` : err
      );
    }

    prompt();
  });
}

prompt();
