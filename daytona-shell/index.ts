#!/usr/bin/env node
/**
 * Mesa + Daytona interactive shell
 *
 * Spins up a Daytona sandbox, mounts a Mesa repo via FUSE inside it,
 * and gives you a bash prompt that executes in the sandbox.
 *
 * Usage:
 *   npx tsx index.ts <org> <repo>
 *
 * Environment:
 *   MESA_API_KEY   — Mesa API key
 *   DAYTONA_API_KEY — Daytona API key
 */

import * as readline from "node:readline";
import { Mesa } from "@mesadev/sdk";
import { Daytona, Image } from "@daytonaio/sdk";

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

const [org, repo] = process.argv.slice(2);

if (!org || !repo) {
  console.error("Usage: npx tsx index.ts <org> <repo>");
  process.exit(1);
}

// --- Bootstrap ---

console.log(dim("Creating Daytona sandbox..."));

const image = Image.base("debian:bookworm-slim").dockerfileCommands([
  // This installs the necessary packages for the sandbox to work
  // These deps are already available on most base Docker images,
  // but slim images don't include them by default
  "RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl fuse3 libssl3 openssl && rm -rf /var/lib/apt/lists/*",
  // Enable non-root users to access the FUSE mount
  "RUN sed -i 's/^#user_allow_other/user_allow_other/' /etc/fuse.conf",
  // Install Mesa CLI
  "RUN curl -fsSL https://mesa.dev/install.sh | sh",
]);

const daytona = new Daytona();
const sandbox = await daytona.create({ image });

// Generate a scoped, short-lived API key for the sandbox
const mesa = new Mesa({ org });
const ephemeralKey = await mesa.apiKeys.create({
  name: `daytona-shell-${Date.now()}`,
  scopes: ["read", "write"],
  expires_in_seconds: 360000,
});

// Write Mesa config and start the FUSE mount
const MOUNT_POINT = `/home/daytona/mesa/mnt`;
const CONFIG_PATH = `/etc/mesa/config.toml`;

console.log(dim(`Mounting ${org}/${repo}...`));

const mesaConfig = `
  mount-point = "${MOUNT_POINT}"
  [organizations.${org}]
  api-key = "${ephemeralKey.key}"
`;

await sandbox.process.executeCommand(`mkdir -p /etc/mesa ${MOUNT_POINT}`);
await sandbox.fs.uploadFile(Buffer.from(mesaConfig), CONFIG_PATH);
await sandbox.process.executeCommand(`mesa -c ${CONFIG_PATH} mount --daemonize`);

// Wait for the FUSE mount to be ready (daemonize returns before mount is live)
const cwd = `${MOUNT_POINT}/${org}/${repo}`;
for (let i = 0; i < 30; i++) {
  const check = await sandbox.process.executeCommand(`ls ${cwd} 2>/dev/null`);
  if (check.exitCode === 0) break;
  await new Promise((r) => setTimeout(r, 200));
}

console.log(`Connected to ${org}/${repo}. Type "exit" or Ctrl+C to quit.\n`);

// --- REPL ---

async function cleanup() {
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
      const result = await sandbox.process.executeCommand(trimmed, cwd);
      if (result.result) process.stdout.write(result.result);
      if (!result.result?.endsWith("\n")) process.stdout.write("\n");
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
