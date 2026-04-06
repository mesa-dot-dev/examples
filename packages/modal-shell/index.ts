#!/usr/bin/env node
/**
 * Mesa + Modal interactive shell
 *
 * Spins up a Modal sandbox, mounts a Mesa repo via FUSE inside it,
 * and gives you a bash prompt that executes in the sandbox.
 *
 * Usage:
 *   npx tsx index.ts <org> <repo>
 *
 * Environment:
 *   MESA_API_KEY       — Mesa API key
 *   MODAL_TOKEN_ID     — Modal token ID
 *   MODAL_TOKEN_SECRET — Modal token secret
 */

import * as readline from "node:readline";
import { Mesa } from "@mesadev/sdk";
import { ModalClient } from "modal";

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

const [org, repo] = process.argv.slice(2);

if (!org || !repo) {
  console.error("Usage: npx tsx index.ts <org> <repo>");
  process.exit(1);
}

// --- Bootstrap ---

console.log(dim("Creating Modal sandbox..."));

const modal = new ModalClient();
const app = await modal.apps.fromName("mesa-shell", { createIfMissing: true });

const image = modal.images
  .fromRegistry("debian:bookworm-slim")
  .dockerfileCommands([
    // Install Mesa required system dependencies
    // These deps are already available on most base Docker images,
    // but slim images don't include them by default
    "RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl fuse3 libssl3 openssl && rm -rf /var/lib/apt/lists/*",
    // Enable non-root users to access the FUSE mount
    "RUN sed -i 's/^#user_allow_other/user_allow_other/' /etc/fuse.conf",
    // Install Mesa CLI
    "RUN curl -fsSL https://mesa.dev/install.sh | sh",
  ]);

const sb = await modal.sandboxes.create(app, image);
console.log(dim(`Sandbox ${sb.sandboxId} created.`));

// Generate a scoped, short-lived API key for the sandbox
const mesa = new Mesa({ org });
const ephemeralKey = await mesa.apiKeys.create({
  name: `modal-shell-${Date.now()}`,
  scopes: ["read", "write"],
  expires_in_seconds: 360000,
});

// Write Mesa config and start the FUSE mount
const MOUNT_POINT = `/root/mesa/mnt`;
const CONFIG_PATH = `/etc/mesa/config.toml`;

console.log(dim(`Mounting ${org}/${repo}...`));

const mesaConfig = `
  mount-point = "${MOUNT_POINT}"
  [organizations.${org}]
  api-key = "${ephemeralKey.key}"
`;

await sb.exec(["mkdir", "-p", "/etc/mesa", MOUNT_POINT]).then((p) => p.wait());

const handle = await sb.open(CONFIG_PATH, "w");
await handle.write(new TextEncoder().encode(mesaConfig));
await handle.close();

await sb.exec(["mesa", "-c", CONFIG_PATH, "mount", "--daemonize"]).then((p) => p.wait());

// Wait for the FUSE mount to be ready (daemonize returns before mount is live)
const cwd = `${MOUNT_POINT}/${org}/${repo}`;
for (let i = 0; i < 30; i++) {
  const check = await sb.exec(["ls", cwd], { stdout: "pipe", stderr: "pipe" });
  if ((await check.wait()) === 0) break;
  await new Promise((r) => setTimeout(r, 200));
}

console.log(`Connected to ${org}/${repo}. Type "exit" or Ctrl+C to quit.\n`);

// --- REPL ---

async function cleanup() {
  console.log(dim("\nCleaning up sandbox..."));
  await sb.terminate();
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
      const result = await sb.exec(["sh", "-c", trimmed], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr] = await Promise.all([
        result.stdout.readText(),
        result.stderr.readText(),
      ]);
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
      if (!stdout?.endsWith("\n")) process.stdout.write("\n");
      const exitCode = await result.wait();
      if (exitCode !== 0) {
        console.error(red(`[exit ${exitCode}]`));
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
