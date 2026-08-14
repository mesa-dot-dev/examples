#!/usr/bin/env node

// To run this example, create a .env file in this directory with:
//   MESA_PRIVATE_KEY=your-signing-private-key
//   BL_API_KEY=your-blaxel-key
//   BL_WORKSPACE=your-blaxel-workspace
//
// Then run:
//   npm start

import 'dotenv/config';
import { SandboxInstance } from '@blaxel/core';
import { Mesa } from '@mesadev/sdk';
import tinyBlaxelRepl from './repl.ts';

const MESA_PRIVATE_KEY =
  process.env.MESA_PRIVATE_KEY ??
  (() => {
    throw Error('$MESA_PRIVATE_KEY not set.');
  })();

// Mint a short-lived access token OUTSIDE the sandbox, where your private key lives.
// Only this token is injected into the sandbox below — your signing private key
// never crosses the boundary. Signing is local (no network round-trip) and the
// token expires on its own, so a compromised sandbox leaks at most a
// soon-to-expire, narrowly-scoped credential.
const mesa = new Mesa({ privateKey: MESA_PRIVATE_KEY });
const org = mesa.org.slug;
const { token } = await mesa.tokens.create({
  authors: [{ name: 'Sandbox Agent', email: 'agent@example.com' }],
  scopes: ['read', 'write'],
  // Optionally restrict the token to specific repos (full `org/repo` names):
  //   repos: [`${org}/my-repo`],
  ttl_seconds: 60 * 60, // 1 hour (max 4h). The mount lasts exactly this long.
});

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
  await sandbox.process.exec({
    command: `MESA_ACCESS_TOKEN=${token} mesa mount -d`,
    waitForCompletion: true,
  });

  // You can now explore repos in your org. We've written a tiny REPL here you can use to explore the container.
  //
  // Your files will be in ~/.local/share/mesa/mnt/<org>/<repo>
  await tinyBlaxelRepl(sandbox, { cwd: `~/.local/share/mesa/mnt/${org}` });
} finally {
  // No matter what happens, let's make sure we clean up the sandbox so we don't burn Blaxel tokens!
  console.log('deleting sandbox...');
  await sandbox.delete();
}
