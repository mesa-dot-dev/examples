#!/usr/bin/env node
/**
 * Access a cloud repo like a local directory
 *
 * This spins up a disposable Sprite, mounts your Mesa org inside it,
 * and drops you into a tiny shell rooted at that mounted repo.
 *
 * Env:   MESA_API_KEY, SPRITES_TOKEN
 */

import * as readline from "node:readline";
import { SpritesClient } from "@fly/sprites";

const ORG = "your-organization"
const SPRITES_TOKEN = process.env.SPRITES_TOKEN;
const MESA_API_KEY = process.env.MESA_API_KEY;

if (!SPRITES_TOKEN || !MESA_API_KEY) {
  console.error("Missing env: SPRITES_TOKEN and MESA_API_KEY are required.");
  process.exit(1);
}
console.log(`Starting sprite for ${ORG}...`);
const client = new SpritesClient(SPRITES_TOKEN);
const sprite = await client.createSprite(`mesa-${ORG}`);

try {

  // Mesa mounts the org into the filesystem, so repo commands feel local.
  await sprite.exec("apt-get update -qq && apt-get install -y -qq fuse3 curl ca-certificates > /dev/null 2>&1");
  await sprite.exec("curl -fsSL https://mesa.dev/install.sh | sh -s -- -y");
  await sprite.exec("sed -i 's/^#user_allow_other/user_allow_other/' /etc/fuse.conf");


  // Flags: -d: (daemonize) runs in the background & -y: (non-interactive) skips the setup wizard.
  console.log("Mounting Mesa...");
  await sprite.exec(`MESA_ORGS=${ORG}:${MESA_API_KEY} MESA_MOUNT_POINT=/mnt/mesa mesa mount -d -y`);

  // Mesa makes the org show up under /mnt/mesa, so normal shell commands feel local.
  const cwd = `/mnt/mesa/${ORG}`;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "$ " });
  console.log('Type commands to explore your org...')
  rl.prompt();

  // Every command runs from the mounted org directory.
  for await (const line of rl) {
    const cmd = line.trim();
    if (!cmd) { rl.prompt(); continue; }
    if (cmd === "exit") break;

    try {
      const result = await sprite.exec(cmd, { cwd });
      const stdout = String(result.stdout);
      const stderr = String(result.stderr);
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
      if (!stdout.endsWith("\n") && !stderr.endsWith("\n")) process.stdout.write("\n");
      if (result.exitCode !== 0) console.error(`[exit ${result.exitCode}]`);
    } catch (err) {
      console.error("Error:", err instanceof Error ? err.message : err);
    }

    rl.prompt();
  }
} finally {
  // Tear down the disposable machine when the demo ends.
  await sprite.destroy().catch(() => {});
}
