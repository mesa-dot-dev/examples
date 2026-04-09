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

console.log('creating blaxel sandbox...');

const sandbox = await SandboxInstance.create({ region: 'us-pdx-1' });

try {
  console.log('installing system dependencies...');
  // Blaxel's base image is Alpine and very thin, so we need to install some system dependencies.
  // gcompat (not libc6-compat) is required because the Mesa daemon's gRPC connections deadlock under libc6-compat's musl shim.
  await sandbox.process.exec({
    command: 'apk add --no-cache curl ca-certificates gcompat dpkg fuse3',
    waitForCompletion: true,
  });

  console.log('installing mesa...');
  // The Mesa CLI is distributed as a .deb package and the install script (https://mesa.dev/install.sh) currently requires apt.
  // To work around this, we download the .deb and use dpkg-deb to extract the binary directly into the filesystem.
  // Alternatively, you can build a custom Debian-based Blaxel template — see
  // https://docs.mesa.dev/content/integration-guides/blaxel#debian-based-setup-custom-template
  await sandbox.process.exec({
    command: [
      // Pin to a specific version; update when upgrading Mesa.
      `curl -fsSL "https://packages.buildkite.com/mesa-dot-dev/debian-public/any/pool/any/main/m/mesa/mesa_0.20.0_amd64.deb" -o /tmp/mesa.deb`,
      `dpkg-deb -x /tmp/mesa.deb /`,
      `rm -f /tmp/mesa.deb`,
    ].join(' && '),
    waitForCompletion: true,
  });

  console.log('mounting mesa...');
  await sandbox.process.exec({ command: `MESA_ORGS=${ORG}:${MESA_API_KEY} mesa mount -d -y`, waitForCompletion: true });

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
