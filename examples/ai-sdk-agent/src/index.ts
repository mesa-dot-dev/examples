#!/usr/bin/env node
/**
 * Mesa + just-bash interactive CLI agent
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
import { anthropic } from "@ai-sdk/anthropic";
import { Mesa } from "@mesadev/sdk";
import { streamText, tool, stepCountIs, type ModelMessage } from "ai";
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

const bashOutputSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number(),
});

const bashTool = tool({
  description: [
    "Execute a bash command against the repository filesystem.",
    `You have bash access to the "${repo}" repository owned by "${org}".`,
    "Use standard unix commands (ls, cat, grep, find, head, etc.) to explore.",
  ].join("\n"),
  inputSchema: bashInputSchema,
  outputSchema: bashOutputSchema,
  execute: async ({ command }) => {
    const result = await bash.exec(command);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  },
});

console.log(`Connected. You can now chat with the agent about ${org}/${repo}.`);
console.log('Type "exit" or Ctrl+C to quit.\n');

// --- REPL ---

const history: ModelMessage[] = [];

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

    history.push({ role: "user", content: trimmed });

    try {
      const result = streamText({
        model: anthropic("claude-sonnet-4-20250514"),
        tools: { bash: bashTool },
        stopWhen: stepCountIs(50),
        messages: history,
      });

      // Track state for rendering newlines between sections
      let lastType = "";

      for await (const chunk of result.fullStream) {
        switch (chunk.type) {
          // --- Reasoning / thinking ---
          case "reasoning-start":
            console.log(dim("--- thinking ---"));
            lastType = "reasoning";
            break;
          case "reasoning-delta":
            process.stdout.write(dim(chunk.text));
            break;
          case "reasoning-end":
            console.log("\n" + dim("--- /thinking ---"));
            break;

          // --- Text output ---
          case "text-start":
            if (lastType && lastType !== "text") console.log();
            lastType = "text";
            break;
          case "text-delta":
            process.stdout.write(chunk.text);
            break;
          case "text-end":
            console.log();
            break;

          // --- Tool use ---
          case "tool-call": {
            if (lastType === "text") console.log();
            lastType = "tool";
            if (chunk.toolName === "bash") {
              const { command } = bashInputSchema.parse(chunk.input);
              console.log(`${blue("[bash]")} ${command.trim()}`);
            }
            break;
          }

          case "tool-result": {
            if (chunk.toolName === "bash") {
              const { stdout, stderr, exitCode } = bashOutputSchema.parse(chunk.output);
              const text = stdout || stderr;
              if (text) console.log(dim(truncate(text)));
              console.log(
                dim(`[exit ${exitCode}]`) +
                  (exitCode !== 0 ? " " + red("(non-zero)") : "")
              );
            }
            break;
          }

          // --- Errors ---
          case "error":
            console.error(red(`[error] ${chunk.error}`));
            break;

          default:
            break;
        }
      }

      // Save response messages into history for multi-turn
      const response = await result.response;
      for (const msg of response.messages) {
        history.push(msg as ModelMessage);
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
