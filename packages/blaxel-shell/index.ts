#!/usr/bin/env node
/**
 * Mesa + Blaxel interactive shell
 *
 * Spins up a Blaxel sandbox, mounts a Mesa repo via FUSE inside it,
 * and gives you a bash prompt that executes in the sandbox.
 *
 * Usage:
 *   npx tsx index.ts <org> <repo>
 *
 * Environment:
 *   MESA_API_KEY  — Mesa API key
 *   BL_API_KEY    — Blaxel API key
 *   BL_WORKSPACE  — Blaxel workspace name (read automatically by the Blaxel SDK)
 */

import * as readline from "node:readline";
import { Mesa } from "@mesadev/sdk";
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
    const safeCmd = command.replace(/mesa_[A-Za-z0-9]+/g, "mesa_***");
    console.error(red(`Command failed: ${safeCmd}`));
    if (result.stdout) console.error(dim(result.stdout));
    if (result.stderr) console.error(red(result.stderr));
    throw new Error(`Command exited with code ${result.exitCode}`);
  }
  return result;
}

// --- Bootstrap ---

console.log(dim("Creating Blaxel sandbox..."));

const sandbox = await SandboxInstance.create({
  image: "blaxel/base-image:latest",
  memory: 4096,
  region: "us-pdx-1",
});

// Blaxel runs as root, so /mnt is a natural mount point
const MOUNT_POINT = "/mnt/mesa";
const CONFIG_PATH = "/etc/mesa/config.toml";
const cwd = `${MOUNT_POINT}/${org}/${repo}`;

try {
  console.log(dim("Installing Mesa CLI..."));

  // Blaxel's base image is Alpine, but the Mesa CLI is distributed as a .deb
  // package and the install script (https://mesa.dev/install.sh) requires apt.
  // To work around this, we download the .deb and use dpkg-deb to extract the
  // binary directly into the filesystem — no apt or Debian infrastructure needed.
  // gcompat (not libc6-compat) is required because the mesa daemon's gRPC
  // connections deadlock under libc6-compat's musl shim.
  //
  // Alternatively, you can build a custom Debian-based Blaxel template that
  // uses the standard install script. Create a Dockerfile:
  //
  //   FROM debian:bookworm-slim
  //   COPY --from=ghcr.io/blaxel-ai/sandbox:latest /sandbox-api /usr/local/bin/sandbox-api
  //   RUN apt-get update && apt-get install -y curl fuse3 ca-certificates \
  //       && curl -fsSL https://mesa.dev/install.sh | sh -s -- -y \
  //       && rm -rf /var/lib/apt/lists/*
  //   ENTRYPOINT ["/usr/local/bin/sandbox-api"]
  //
  // Then deploy with `bl deploy` and reference your template in create():
  //   SandboxInstance.create({ image: "your-template:latest", ... })
  await run(sandbox, "apk add --no-cache curl ca-certificates gcompat dpkg fuse3");
  // Pin to a specific version; update when upgrading Mesa
  await run(
    sandbox,
    [
      `curl -fsSL "https://packages.buildkite.com/mesa-dot-dev/debian-public/any/pool/any/main/m/mesa/mesa_0.15.0_amd64.deb" -o /tmp/mesa.deb`,
      `dpkg-deb -x /tmp/mesa.deb /`,
      `rm -f /tmp/mesa.deb`,
    ].join(" && "),
  );

  // Generate a scoped, short-lived API key for the sandbox
  const mesa = new Mesa({ org });
  const ephemeralKey = await mesa.apiKeys.create({
    name: `blaxel-shell-${Date.now()}`,
    scopes: ["read", "write"],
    expires_in_seconds: 360000,
  });

  // Write Mesa config and start the FUSE mount
  console.log(dim(`Mounting ${org}/${repo}...`));

  const mesaConfig = [
    `mount-point = "${MOUNT_POINT}"`,
    `[organizations.${org}]`,
    `api-key = "${ephemeralKey.key}"`,
  ].join("\n");

  await run(sandbox, `mkdir -p /etc/mesa ${MOUNT_POINT}`);
  await sandbox.fs.write(CONFIG_PATH, mesaConfig);
  await run(sandbox, `mesa -c ${CONFIG_PATH} mount --daemonize`);

  // Wait for the FUSE mount to be ready (daemonize returns before mount is live)
  for (let i = 0; i < 30; i++) {
    const check = await sandbox.process.exec({
      command: `timeout 5 ls ${cwd} 2>/dev/null`,
      waitForCompletion: true,
    });
    if (check.exitCode === 0) break;
    if (i === 29) throw new Error("Timed out waiting for FUSE mount");
    await new Promise((r) => setTimeout(r, 200));
  }
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
