#!/usr/bin/env node
/**
 * Mesa + Runloop interactive shell
 *
 * Spins up a Runloop devbox, mounts a Mesa repo via FUSE inside it,
 * and gives you a bash prompt that executes in the devbox.
 *
 * Usage:
 *   npx tsx index.ts <org> <repo>
 *
 * Environment:
 *   MESA_API_KEY    — Mesa API key
 *   RUNLOOP_API_KEY — Runloop API key
 */

import * as readline from "node:readline";
import { Mesa } from "@mesadev/sdk";
import { RunloopSDK } from "@runloop/api-client";

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

const [org, repo] = process.argv.slice(2);

if (!org || !repo) {
  console.error("Usage: npx tsx index.ts <org> <repo>");
  process.exit(1);
}

// --- Bootstrap ---

console.log(dim("Creating Runloop devbox..."));

const sdk = new RunloopSDK();

// launch_commands install Mesa CLI and FUSE deps into the devbox.
// For production use, consider a Runloop Blueprint (cached Docker image) instead.
const devbox = await sdk.devbox.create({
  name: `mesa-shell-${Date.now()}`,
  launch_parameters: {
    resource_size_request: "SMALL",
    keep_alive_time_seconds: 3600,
    launch_commands: [
      "apt-get update && apt-get install -y --no-install-recommends ca-certificates curl fuse3 libssl3 openssl && rm -rf /var/lib/apt/lists/*",
      "sed -i 's/^#user_allow_other/user_allow_other/' /etc/fuse.conf",
      "curl -fsSL https://mesa.dev/install.sh | sh",
    ],
  },
});

// Generate a scoped, short-lived API key for the devbox
const mesa = new Mesa({ org });
const ephemeralKey = await mesa.apiKeys.create({
  name: `runloop-shell-${Date.now()}`,
  scopes: ["read", "write"],
  expires_in_seconds: 360000,
});

// Write Mesa config and start the FUSE mount
const MOUNT_POINT = `/home/user/mesa/mnt`;
const CONFIG_PATH = `/etc/mesa/config.toml`;

console.log(dim(`Mounting ${org}/${repo}...`));

const mesaConfig = `
mount-point = "${MOUNT_POINT}"
[organizations.${org}]
api-key = "${ephemeralKey.key}"
`;

await devbox.cmd.exec(`mkdir -p /etc/mesa ${MOUNT_POINT}`);
await devbox.file.write({ file_path: CONFIG_PATH, contents: mesaConfig });
await devbox.cmd.exec(`mesa -c ${CONFIG_PATH} mount --daemonize`);

// Wait for the FUSE mount to be ready (daemonize returns before mount is live)
const cwd = `${MOUNT_POINT}/${org}/${repo}`;
for (let i = 0; i < 30; i++) {
  const check = await devbox.cmd.exec(`ls ${cwd} 2>/dev/null`);
  if (check.exitCode === 0) break;
  await new Promise((r) => setTimeout(r, 200));
}

console.log(`Connected to ${org}/${repo}. Type "exit" or Ctrl+C to quit.\n`);

// --- REPL ---

async function cleanup() {
  console.log(dim("\nShutting down devbox..."));
  await devbox.shutdown();
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
      const result = await devbox.cmd.exec(`cd ${cwd} && ${trimmed}`);
      const stdout = await result.stdout();
      if (stdout) process.stdout.write(stdout);
      if (!stdout?.endsWith("\n")) process.stdout.write("\n");
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
