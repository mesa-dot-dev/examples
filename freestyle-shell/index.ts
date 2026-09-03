#!/usr/bin/env node

// To run this example, create a .env file in this directory with:
//   MESA_PRIVATE_KEY=your-signing-private-key
//   MESA_REPO=the-repo-to-mount
//   FREESTYLE_API_KEY=your-freestyle-key
//
// Then run:
//   pnpm run start

import 'dotenv/config';
import { Freestyle } from 'freestyle';
import { Mesa, repo } from '@mesadev/sdk';
import tinyFreestyleRepl from './repl.ts';

const MESA_PRIVATE_KEY =
  process.env.MESA_PRIVATE_KEY ??
  (() => {
    throw Error('$MESA_PRIVATE_KEY not set.');
  })();
if (!process.env.FREESTYLE_API_KEY) {
  throw Error('$FREESTYLE_API_KEY not set.');
}

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

const freestyle = new Freestyle({ apiKey: process.env.FREESTYLE_API_KEY });
console.log('Creating Freestyle sandbox...');

const { vm } = await freestyle.vms.create();

try {
  // Set up Mesa within the Freestyle sandbox.
  //
  // We recommend installing Mesa as part of the container definition (e.g. Docker image),
  // but here we install it directly to keep the example small.

  // You can install Mesa as per the guide in https://docs.mesa.dev/content/mesafs/posix-mount.
  //
  // Mesa's installer will install all its dependencies through your system's package manager.
  console.log('Installing Mesa...');
  await vm.exec('curl -fsSL https://mesa.dev/install.sh | sh -s -- --version 0.46.0');

  // It is critical that you enable the user_allow_other flag in your fuse configuration.
  //
  // This allows users outside of yourself to also access the mesa mount you mounted. Mesa requires this for
  // operation. See https://www.man7.org/linux/man-pages/man8/mount.fuse3.8.html for more details.
  console.log('Configuring FUSE...');
  await vm.exec(
    [
      "sed -i 's/^#user_allow_other/user_allow_other/' /etc/fuse.conf",
      // Some sandbox images expose /dev/fuse as root-only by default.
      'chmod 666 /dev/fuse',
    ].join(' && ')
  );

  // You can run mesa in daemon mode to kick it off in the background.
  //
  // The flag we are using here is:
  //   -d, --daemonize  Spawns mesa in the background.
  //
  console.log('Mounting layout...');
  // The same layout the token was scoped to also describes the mount, so write
  // it into the VM and point `mesa mount` at it.
  await vm.exec(`cat > /tmp/layout.json <<'MESA_LAYOUT'\n${workspace.layout()}\nMESA_LAYOUT`);
  await vm.exec(`MESA_ACCESS_TOKEN=${token} mesa mount -d --layout /tmp/layout.json`);

  // You can now explore the layout. We've written a tiny REPL here you can use to explore the sandbox.
  //
  // A layout mount presents exactly its declared paths, so your files are at
  // /root/.local/share/mesa/mnt/workspace — the org browse tree is not present.
  await tinyFreestyleRepl(vm, { cwd: '/root/.local/share/mesa/mnt/workspace' });
} finally {
  // No matter what happens, let's make sure we clean up the sandbox.
  console.log('\nCleaning up sandbox...');
  await vm.delete();
}
