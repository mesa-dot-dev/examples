#!/usr/bin/env node

// To run this example, you'll need to set two environment variables:
//   MESA_PRIVATE_KEY - Your Mesa signing private key
//   MESA_REPO        - The repository to mount
//   RUNLOOP_API_KEY  - Your runloop API key

import 'dotenv/config';
import { RunloopSDK } from '@runloop/api-client';
import { Mesa, repo } from '@mesadev/sdk';
import tinyRunloopRepl from './tiny-runloop-repl.ts';

const MESA_PRIVATE_KEY =
  process.env.MESA_PRIVATE_KEY ??
  (() => {
    throw Error('$MESA_PRIVATE_KEY not set.');
  })();
const RUNLOOP_API_KEY =
  process.env.RUNLOOP_API_KEY ??
  (() => {
    throw Error('$RUNLOOP_API_KEY not set.');
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

console.log('creating a devbox...');
const devbox = await new RunloopSDK({ bearerToken: RUNLOOP_API_KEY }).devbox.create({ name: `mesa-example-shell` });

try {
  // Set up mesa within the Runloop container.
  //
  // We recommend installing mesa as part of the container definition, but here we install it directly to keep the
  // example small.

  // You can install mesa as per the guide in https://docs.mesa.dev/content/mesafs/posix-mount.
  //
  // Mesa's installer will install all its dependencies through your system's package manager.
  console.log('installing mesa...');
  await devbox.cmd.exec('curl -fsSL https://mesa.dev/install.sh | sh -s -- --version 0.46.0');

  // It is critical that you enable the user_allow_other flag in your fuse configuration.
  //
  // This allows users outside of yourself to also access the mesa mount you mounted. Mesa requires this for operation.
  // See https://www.man7.org/linux/man-pages/man8/mount.fuse3.8.html for more details.
  console.log('configuring fuse...');
  await devbox.cmd.exec("sudo sed -i 's/^#user_allow_other/user_allow_other/' /etc/fuse.conf");

  // Runloop does not allow changing the groups of any users, so you must allow everyone to access the fuse device.
  //
  // /dev/fuse is owned by root:fuse so normally you just add your user to the fuse group but unfortunately, runloop
  // doesn't allow that.
  await devbox.cmd.exec('sudo chmod 666 /dev/fuse');

  // You can run mesa in daemon mode to kick it off in the background.
  //
  // The flag we are using here is:
  //   -d, --daemonize  Spawns mesa in the background.
  //
  console.log('mounting mesa...');
  // The same layout the token was scoped to also describes the mount, so write
  // it into the devbox and point `mesa mount` at it.
  await devbox.cmd.exec(`cat > /tmp/layout.json <<'MESA_LAYOUT'\n${workspace.layout()}\nMESA_LAYOUT`);
  await devbox.cmd.exec(`MESA_ACCESS_TOKEN=${token} mesa mount -d --layout /tmp/layout.json`);

  // You can now explore the layout. We've written a tiny REPL here you can use to explore the container.
  //
  // A layout mount presents exactly its declared paths, so your files are at
  // ~/.local/share/mesa/mnt/workspace — the org browse tree is not present.
  await tinyRunloopRepl(devbox, { cwd: '~/.local/share/mesa/mnt/workspace' });
} finally {
  // No matter what happens, let's make sure we close the devbox so we don't burn Runloop tokens!
  console.log('shutting down devbox...');
  await devbox.shutdown();
}
