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

const mkdirProc = await sb.exec(["mkdir", "-p", "/etc/mesa", MOUNT_POINT], {
  stdout: "pipe",
  stderr: "pipe",
});
const mkdirExit = await mkdirProc.wait();
if (mkdirExit !== 0) {
  const mkdirErr = await mkdirProc.stderr.readText();
  console.error(red(`mkdir failed (exit ${mkdirExit}): ${mkdirErr}`));
  process.exit(1);
}

const handle = await sb.open(CONFIG_PATH, "w");
await handle.write(new TextEncoder().encode(mesaConfig));
await handle.close();
console.log(dim("Mesa config written."));

const mountProc = await sb.exec(
  ["mesa", "-c", CONFIG_PATH, "mount", "--daemonize"],
  { stdout: "pipe", stderr: "pipe" },
);
const [mountOut, mountErr] = await Promise.all([
  mountProc.stdout.readText(),
  mountProc.stderr.readText(),
]);
const mountExit = await mountProc.wait();
if (mountOut) console.log(dim(`[mesa mount stdout] ${mountOut}`));
if (mountErr) console.error(dim(`[mesa mount stderr] ${mountErr}`));
if (mountExit !== 0) {
  console.error(red(`mesa mount failed with exit code ${mountExit}`));
  // Try to grab daemon logs before bailing
  const logProc = await sb.exec(
    ["sh", "-c", "find /tmp /var/log /root -name '*.log' -path '*mesa*' 2>/dev/null -exec cat {} +"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const logOut = await logProc.stdout.readText();
  if (logOut) console.error(dim(`[mesa daemon logs]\n${logOut}`));
  process.exit(1);
}

// Wait for the FUSE mount to be ready (daemonize returns before mount is live)
const cwd = `${MOUNT_POINT}/${org}/${repo}`;
let mounted = false;
for (let i = 0; i < 30; i++) {
  const check = await sb.exec(["ls", cwd], { stdout: "pipe", stderr: "pipe" });
  const checkErr = await check.stderr.readText();
  const checkExit = await check.wait();
  if (checkExit === 0) {
    mounted = true;
    break;
  }
  if (i % 5 === 0 && checkErr) {
    console.log(dim(`[waiting for mount] ${checkErr.trim()}`));
  }
  await new Promise((r) => setTimeout(r, 200));
}

if (!mounted) {
  console.error(red(`FUSE mount not ready after 6s at ${cwd}`));

  // Dump all diagnostics
  const diags = [
    ["mesa processes", "ps aux | grep mesa || true"],
    ["mount points", "mount | grep fuse || true"],
    ["mount point contents", `ls -la ${MOUNT_POINT} 2>&1 || true`],
    ["mesa config", `cat ${CONFIG_PATH} 2>&1`],
    ["mesa version", "mesa --version 2>&1 || true"],
    ["all log files", "find / -name '*.log' 2>/dev/null | head -50 || true"],
    ["mesa logs (any)", "find / \\( -name '*mesa*' -o -name '*fuse*' \\) -type f 2>/dev/null | head -20 || true"],
    ["syslog/journal", "cat /var/log/syslog 2>/dev/null || journalctl -u mesa 2>/dev/null || echo 'no syslog/journal'"],
    ["dmesg (fuse)", "dmesg 2>/dev/null | grep -i fuse || echo 'no dmesg access'"],
    ["tmp dir", "ls -la /tmp/ 2>&1 || true"],
  ];

  for (const [label, cmd] of diags) {
    const proc = await sb.exec(["sh", "-c", cmd], { stdout: "pipe", stderr: "pipe" });
    const [out, err] = await Promise.all([proc.stdout.readText(), proc.stderr.readText()]);
    const output = (out + err).trim();
    if (output) console.error(dim(`[${label}]\n${output}\n`));
  }

  process.exit(1);
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
