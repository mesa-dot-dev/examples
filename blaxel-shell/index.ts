#!/usr/bin/env node

// To run this example, create a .env file in this directory with:
//   MESA_PRIVATE_KEY=your-signing-private-key
//   MESA_REPO=the-repo-to-mount
//   BL_API_KEY=your-blaxel-key
//   BL_WORKSPACE=your-blaxel-workspace
//
// Then run:
//   npm start

import 'dotenv/config';
import { SandboxInstance } from '@blaxel/core';
import { Mesa, repo } from '@mesadev/sdk';
import tinyBlaxelRepl from './repl.ts';

const MESA_PRIVATE_KEY =
  process.env.MESA_PRIVATE_KEY ??
  (() => {
    throw Error('$MESA_PRIVATE_KEY not set.');
  })();

const MESA_REPO =
  process.env.MESA_REPO ??
  (() => {
    throw Error('$MESA_REPO not set.');
  })();

// Declare the namespace the sandbox gets: this layout is both what the mount
// presents and what the token is scoped to. Nothing outside it is reachable.
const mesa = new Mesa({ privateKey: MESA_PRIVATE_KEY });
const workspace = mesa.fs({
  layout: { '/workspace': repo(MESA_REPO, { mode: 'rw' }) },
  authors: [{ name: 'Sandbox Agent', email: 'agent@example.com' }],
  ttl: 60 * 60, // 1 hour (max 4h). The mount lasts exactly this long.
});

// Mint the short-lived access token OUTSIDE the sandbox, where your private key
// lives. Only this token is injected below — your signing private key never
// crosses the boundary. Signing is local (no network round-trip) and the token
// expires on its own, so a compromised sandbox leaks at most a soon-to-expire
// credential scoped to the repositories the layout names.
const { token } = await workspace.token();

console.log('creating blaxel sandbox...');

const sandbox = await SandboxInstance.create({ region: 'us-pdx-1' });

try {
  console.log('installing mesa...');
  // Blaxel's base image is Alpine. The Mesa install script (https://mesa.dev/install.sh) handles
  // Alpine natively — it detects the architecture, adds the correct APK repository, and installs mesa.
  // gcompat (not libc6-compat) is required because the Mesa daemon's gRPC connections deadlock under libc6-compat's musl shim.
  await sandbox.process.exec({
    command:
      'apk add --no-cache curl ca-certificates gcompat fuse3 && curl -fsSL https://mesa.dev/install.sh | sh -s -- --version 0.46.0 --yes',
    waitForCompletion: true,
  });

  console.log('mounting mesa...');
  // The same layout the token was scoped to also describes the mount, so write
  // it into the sandbox and point `mesa mount` at it.
  await sandbox.process.exec({
    command: `cat > /tmp/layout.json <<'MESA_LAYOUT'\n${workspace.layout()}\nMESA_LAYOUT`,
    waitForCompletion: true,
  });
  await sandbox.process.exec({
    command: `MESA_ACCESS_TOKEN=${token} mesa mount -d --layout /tmp/layout.json`,
    waitForCompletion: true,
  });

  // You can now explore the layout. We've written a tiny REPL here you can use to explore the container.
  //
  // A layout mount presents exactly its declared paths, so your files are at
  // ~/.local/share/mesa/mnt/workspace — the org browse tree is not present.
  await tinyBlaxelRepl(sandbox, { cwd: '~/.local/share/mesa/mnt/workspace' });
} finally {
  // No matter what happens, let's make sure we clean up the sandbox so we don't burn Blaxel tokens!
  console.log('deleting sandbox...');
  await sandbox.delete();
}
