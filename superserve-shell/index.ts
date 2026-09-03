#!/usr/bin/env node

// To run this example, create a .env file in this directory with:
//   MESA_PRIVATE_KEY=your-signing-private-key
//   MESA_REPO=the-repo-to-mount
//   SUPERSERVE_API_KEY=your-superserve-key
//
// Then run:
//   npm start

import 'dotenv/config';
import { Sandbox } from '@superserve/sdk';
import { Mesa, repo } from '@mesadev/sdk';
import tinySuperserveRepl from './repl.ts';

const MESA_PRIVATE_KEY =
  process.env.MESA_PRIVATE_KEY ??
  (() => {
    throw Error('$MESA_PRIVATE_KEY not set.');
  })();
if (!process.env.SUPERSERVE_API_KEY) {
  throw Error('$SUPERSERVE_API_KEY not set.');
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

console.log('Creating Superserve sandbox...');
const sandbox = await Sandbox.create({ name: 'mesa-shell' });

try {
  // Set up Mesa within the Superserve sandbox.
  //
  // We recommend installing Mesa as part of a custom template, but here we
  // install it directly to keep the example small.

  // You can install Mesa as per the guide in https://docs.mesa.dev/content/mesafs/posix-mount.
  //
  // Mesa's installer will install all its dependencies through your system's package manager.
  console.log('Installing Mesa...');
  await sandbox.commands.run('curl -fsSL https://mesa.dev/install.sh | sh -s -- --version 0.46.0 --yes');

  // Superserve sandboxes run as root inside a Firecracker microVM with a
  // FUSE-enabled kernel, so the `user_allow_other` and `chmod 666 /dev/fuse`
  // steps that other sandbox providers require aren't needed here.

  // You can run mesa in daemon mode to kick it off in the background.
  //
  // The flag we are using here is:
  //   -d, --daemonize  Spawns mesa in the background.
  //
  console.log('Mounting layout...');
  // The same layout the token was scoped to also describes the mount, so write
  // it into the sandbox and point `mesa mount` at it.
  await sandbox.commands.run(`cat > /tmp/layout.json <<'MESA_LAYOUT'\n${workspace.layout()}\nMESA_LAYOUT`);
  await sandbox.commands.run('mesa mount -d --layout /tmp/layout.json', {
    env: {
      MESA_ACCESS_TOKEN: token,
    },
  });

  // You can now explore the layout. We've written a tiny REPL here you can use to explore the sandbox.
  //
  // A layout mount presents exactly its declared paths, so your files are at
  // ~/.local/share/mesa/mnt/workspace — the org browse tree is not present.
  await tinySuperserveRepl(sandbox, { cwd: '~/.local/share/mesa/mnt/workspace' });
} finally {
  // No matter what happens, let's make sure we clean up the sandbox so we don't burn Superserve resources.
  console.log('\nCleaning up sandbox...');
  await sandbox.kill();
}
