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

import "dotenv/config";
import * as readline from "node:readline";
import { anthropic } from "@ai-sdk/anthropic";
import { Mesa } from "@mesadev/sdk";
import { streamText, stepCountIs, type ModelMessage } from "ai";
import { createBashTool } from "bash-tool";

const [org, repo] = process.argv.slice(2);

if (!org || !repo) {
  console.error("Usage: npx tsx src/index.ts <org> <repo>");
  process.exit(1);
}

// --- Bootstrap ---

console.log(`Connecting to ${org}/${repo} via Mesa...`);

const mesa = new Mesa({ org });

const mesaFs = await mesa.fs.create({
  repos: [{ name: repo }],
  mode: "ro",
});

const bash = mesaFs.bash();

const { tools } = await createBashTool({
  sandbox: bash,
  extraInstructions: [
    `You have bash access to the "${repo}" repository owned by "${org}".`,
    `Files are mounted at /${org}/${repo}.`,
    "Use standard unix commands (ls, cat, grep, find, head, etc.) to explore.",
    `Always use absolute paths starting with /${org}/${repo}/.`,
  ].join("\n"),
});

console.log(`Connected. You can now chat with the agent about ${org}/${repo}.`);
console.log('Type "exit" or Ctrl+C to quit.\n');

// --- REPL ---

const history: ModelMessage[] = [];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

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
      let fullText = "";

      const result = streamText({
        model: anthropic("claude-sonnet-4-20250514"),
        tools,
        stopWhen: stepCountIs(50),
        messages: history,
      });

      for await (const chunk of result.textStream) {
        process.stdout.write(chunk);
        fullText += chunk;
      }

      // Newline after streamed output
      if (fullText) console.log();

      history.push({ role: "assistant", content: fullText });
    } catch (err) {
      console.error("Error:", err instanceof Error ? err.message : err);
    }

    prompt();
  });
}

prompt();
