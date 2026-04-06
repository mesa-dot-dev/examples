#!/usr/bin/env node
/**
 * Mesa + Blaxel interactive shell
 *
 * Spins up a Blaxel sandbox, clones a Mesa repo into it via Git,
 * and gives you a bash prompt that executes in the sandbox.
 *
 * Usage:
 *   npx tsx index.ts <org> <repo>
 *
 * Environment:
 *   MESA_API_KEY  — Mesa API key
 *   BL_API_KEY    — Blaxel API key
 *   BL_WORKSPACE  — Blaxel workspace name
 */

import * as readline from "node:readline";
import { SandboxInstance } from "@blaxel/core";

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

const [org, repo] = process.argv.slice(2);

if (!org || !repo) {
  console.error("Usage: npx tsx index.ts <org> <repo>");
  process.exit(1);
}

async function run(sandbox: SandboxInstance, command: string) {
  const result = await sandbox.process.exec({ command, waitForCompletion: true });
  if (result.exitCode !== 0) {
    // Redact API keys from error output
    const safeCmd = command.replace(/mesa_[A-Za-z0-9]+/g, "mesa_***");
    console.error(red(`Command failed: ${safeCmd}`));
    if (result.stdout) console.error(dim(result.stdout));
    if (result.stderr) console.error(red(result.stderr));
    throw new Error(`Command exited with code ${result.exitCode}`);
  }
  return result;
}

// --- Bootstrap ---

const apiKey = process.env.MESA_API_KEY;
if (!apiKey) {
  console.error("MESA_API_KEY environment variable is required");
  process.exit(1);
}

console.log(dim("Creating Blaxel sandbox..."));

const sandbox = await SandboxInstance.create({
  image: "blaxel/base-image:latest",
  memory: 4096,
  region: "us-pdx-1",
});

const cwd = `/home/user/${repo}`;

try {
  // Mesa repos are Git-compatible — clone directly via Mesa's Git HTTP endpoint.
  // Blaxel sandboxes are Firecracker microVMs whose minimal guest kernel does not
  // support user-space FUSE daemons, so we use git clone instead of mesa mount.
  console.log(dim(`Cloning ${org}/${repo}...`));
  await run(sandbox, `git clone https://t:${apiKey}@api.mesa.dev/${org}/${repo}.git ${cwd}`);
} catch (err) {
  console.error(red("Bootstrap failed:"), err instanceof Error ? err.message : err);
  await sandbox.delete().catch(() => {});
  process.exit(1);
}

console.log(`Connected to ${org}/${repo}. Type "exit" or Ctrl+C to quit.\n`);

// --- REPL ---

let cleaningUp = false;
async function cleanup() {
  if (cleaningUp) return;
  cleaningUp = true;
  console.log(dim("\nCleaning up sandbox..."));
  await sandbox.delete();
  console.log("Bye!");
  process.exit(0);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.on("close", cleanup);

function prompt(): void {
  rl.question("$ ", async (input) => {
    const trimmed = input.trim();
    if (!trimmed) return prompt();
    if (trimmed === "exit") return cleanup();

    try {
      const result = await sandbox.process.exec({
        command: trimmed,
        workingDir: cwd,
        waitForCompletion: true,
      });
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      if (!result.stdout?.endsWith("\n") && !result.stderr?.endsWith("\n")) {
        process.stdout.write("\n");
      }
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
