#!/usr/bin/env node

// To run this example, create a .env file in this directory with:
//   MESA_ORG=your-org
//   MESA_API_KEY=your-mesa-key
//   BL_API_KEY=your-blaxel-key
//   BL_WORKSPACE=your-blaxel-workspace
//
// Then run:
//   npm start

import 'dotenv/config';
import { SandboxInstance } from '@blaxel/core';
import { Mesa } from '@mesadev/sdk';
import tinyBlaxelRepl from './repl.ts';

const ORG =
  process.env.MESA_ORG ??
  (() => {
    throw Error('$MESA_ORG not set.');
  })();
const MESA_API_KEY =
  process.env.MESA_API_KEY ??
  (() => {
    throw Error('$MESA_API_KEY not set.');
  })();

// Mint a short-lived access token OUTSIDE the sandbox, where your API key lives.
// Only this token is injected into the sandbox below — your long-lived API key
// never crosses the boundary. Signing is local (no network round-trip) and the
// token expires on its own, so a compromised sandbox leaks at most a
// soon-to-expire, narrowly-scoped credential.
const mesa = new Mesa({ apiKey: MESA_API_KEY, org: ORG });
const { token } = await mesa.tokens.create({
  scopes: ['read', 'write'],
  // Optionally restrict the token to specific repos (full `org/repo` names):
  //   repos: [`${ORG}/my-repo`],
  ttl_seconds: 60 * 60, // 1 hour (max 24h). The mount lasts exactly this long.
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
      'apk add --no-cache curl ca-certificates gcompat fuse3 && curl -fsSL https://mesa.dev/install.sh | sh -s -- --yes',
    waitForCompletion: true,
  });

  // We pass two environment variables:
  //   MESA_ORG       tells mesa which organization to add to config.toml.
  //   MESA_API_KEY   provides the credential for this process. It accepts an
  //                  API key OR an access token; here we pass the short-lived
  //                  token we minted above, so the raw API key never enters the
  //                  sandbox. The token is read from the environment and is
  //                  never persisted to disk.
  console.log('mounting mesa...');
  await sandbox.process.exec({
    // MESA_API_KEY is set to the short-lived token, NOT the raw API key.
    command: `MESA_ORG=${ORG} MESA_API_KEY=${token} mesa mount -d -y`,
    waitForCompletion: true,
  });

  // You can now explore repos in your org. We've written a tiny REPL here you can use to explore the container.
  //
  // The default configuration is created in ~/.config/mesa/config.toml
  // and your files will be in ~/.local/share/mesa/mnt/<org>/<repo>
  await tinyBlaxelRepl(sandbox, { cwd: `~/.local/share/mesa/mnt/${ORG}` });
} finally {
  // No matter what happens, let's make sure we clean up the sandbox so we don't burn Blaxel tokens!
  console.log('deleting sandbox...');
  await sandbox.delete();
}
