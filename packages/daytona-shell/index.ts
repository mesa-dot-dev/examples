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
 *   MESA_ADMIN_API_KEY  — Mesa admin API key
 *   DAYTONA_API_KEY     — Daytona API key
 */

import * as readline from "node:readline";
import { Mesa } from "@mesadev/sdk";
import { Daytona, Image } from "@daytonaio/sdk";

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;

const [org, repo] = process.argv.slice(2);

if (!org || !repo) {
  console.error("Usage: npx tsx index.ts <org> <repo>");
  process.exit(1);
}

// --- Bootstrap ---

console.log(dim("Creating Daytona sandbox with FUSE support..."));

const image = Image.base("debian:bookworm-slim").dockerfileCommands([
  "RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl fuse3 libssl3 openssl && rm -rf /var/lib/apt/lists/*",
  "RUN sed -i 's/^#user_allow_other/user_allow_other/' /etc/fuse.conf",
]);

const daytona = new Daytona();
const sandbox = await daytona.create(
  {
    image,
    envVars: { TERM: "dumb" },
  },
  { onSnapshotCreateLogs: (line) => process.stderr.write(dim(line)) }
);

console.log(dim("Sandbox created. Installing Mesa CLI..."));

await sandbox.process.executeCommand(
  "curl -fsSL https://mesa.dev/install.sh | sh"
);

console.log(dim("Generating ephemeral Mesa API key..."));

const mesa = new Mesa({ org });
const ephemeralKey = await mesa.apiKeys.create({
  name: `daytona-shell-${Date.now()}`,
  scopes: ["read", "write"],
  expires_in_seconds: 3600,
});

console.log(green(`  Created ephemeral key: ${ephemeralKey.key}`));

const mountPoint = `/home/daytona/mesa/mnt`;
const mesaConfig = `
mount-point = "${mountPoint}"

[organizations.${org}]
api-key = "${ephemeralKey.key}"
`.trim();

console.log(dim("Configuring Mesa mount..."));

await sandbox.process.executeCommand(`mkdir -p /home/daytona/.config/mesa`);
await sandbox.process.executeCommand(
  `cat > /home/daytona/.config/mesa/config.toml << 'MESAEOF'\n${mesaConfig}\nMESAEOF`
);

console.log(dim("Mounting Mesa FUSE filesystem..."));

await sandbox.process.executeCommand("mesa mount --daemonize");

const cwd = `${mountPoint}/${org}/${repo}`;
await sandbox.process.executeCommand(`ls ${cwd}`);

console.log(`\nConnected to ${org}/${repo} in Daytona sandbox.`);
console.log('Type "exit" or Ctrl+C to quit.\n');

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
