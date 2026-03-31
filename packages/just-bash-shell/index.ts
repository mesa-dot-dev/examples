#!/usr/bin/env node
/**
 * Mesa + just-bash interactive shell
 *
 * Connects to a Mesa repo via MesaFS and gives you a bash prompt
 * to explore and work with the repo's files directly. No AI — just bash.
 *
 * Usage:
 *   npx tsx src/index.ts <org> <repo>
 *
 * Environment:
 *   MESA_ADMIN_API_KEY  — Mesa admin API key
 */

import * as readline from "node:readline";
import { Mesa } from "@mesadev/sdk";

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
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

console.log(`Connected to ${org}/${repo}.`);
console.log('Type "exit" or Ctrl+C to quit.\n');

// --- REPL ---

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.on("close", () => {
  console.log("\nBye!");
  process.exit(0);
});

function prompt(): void {
  rl.question("$ ", async (input) => {
    const trimmed = input.trim();
    if (!trimmed) return prompt();
    if (trimmed === "exit") {
      console.log("Bye!");
      rl.close();
      process.exit(0);
    }

    try {
      const result = await bash.exec(trimmed);
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(dim(result.stderr));
      if (result.exitCode !== 0) {
        console.error(red(`[exit ${result.exitCode}]`));
      }
    } catch (err) {
      console.error(
        red("Error:"),
        err instanceof Error ? err.message : err
      );
    }

    prompt();
  });
}

prompt();
