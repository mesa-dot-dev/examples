#!/usr/bin/env node

// To run this example, create a .env file in this directory with:
//   MESA_PRIVATE_KEY=your-signing-private-key
//   MESA_REPO=the-repo-to-mount
//   VERCEL_TEAM_ID=your-vercel-team-id
//   VERCEL_PROJECT_ID=your-vercel-project-id
//   VERCEL_TOKEN=your-vercel-access-token
//
// Then run:
//   npm start

import 'dotenv/config';
import { Sandbox } from '@vercel/sandbox';
import { Mesa, repo } from '@mesadev/sdk';
import tinyVercelRepl from './repl.ts';

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
if (!process.env.VERCEL_TEAM_ID || !process.env.VERCEL_PROJECT_ID || !process.env.VERCEL_TOKEN) {
  throw Error('$VERCEL_TEAM_ID, $VERCEL_PROJECT_ID, or $VERCEL_TOKEN not set.');
}

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

console.log('Creating Vercel sandbox...');

const sandbox = await Sandbox.create({
  teamId: process.env.VERCEL_TEAM_ID,
  projectId: process.env.VERCEL_PROJECT_ID,
  token: process.env.VERCEL_TOKEN,
});

try {
  // Set up Mesa within the Vercel sandbox.
  //
  // You can install Mesa as per the guide in https://docs.mesa.dev/content/mesafs/posix-mount.
  //
  // Mesa's installer will install all its dependencies through your system's package manager.
  console.log('Installing Mesa...');
  await sandbox.runCommand({
    cmd: 'sh',
    args: ['-c', 'curl -fsSL https://mesa.dev/install.sh | sh -s -- --version 0.46.0'],
  });

  // It is critical that you enable the user_allow_other flag in your fuse configuration.
  //
  // This allows users outside of yourself to also access the mesa mount you mounted. Mesa requires this for
  // operation. See https://www.man7.org/linux/man-pages/man8/mount.fuse3.8.html for more details.
  console.log('Configuring FUSE...');
  await sandbox.runCommand({
    cmd: 'dnf',
    args: ['install', '-y', 'fuse3'],
    sudo: true,
  });
  await sandbox.runCommand({
    cmd: 'sh',
    args: ['-c', ['echo user_allow_other >> /etc/fuse.conf', 'chmod 666 /dev/fuse'].join('\n')],
    sudo: true,
  });

  // You can run mesa as a detached command to keep the mount process alive in the background.
  //
  // The same layout the token was scoped to also describes the mount, so write
  // it into the sandbox and point `mesa mount` at it.
  console.log('Mounting Mesa...');
  await sandbox.runCommand({
    cmd: 'sh',
    args: ['-c', `cat > /tmp/layout.json <<'MESA_LAYOUT'\n${workspace.layout()}\nMESA_LAYOUT`],
  });
  await sandbox.runCommand({
    cmd: 'mesa',
    args: ['mount', '--layout', '/tmp/layout.json'],
    detached: true,
    env: {
      MESA_ACCESS_TOKEN: token, // the short-lived token, NOT the private key
    },
  });

  // You can now explore the layout. We've written a tiny REPL here you can use to explore the sandbox.
  //
  // A layout mount presents exactly its declared paths, so your files are at
  // ~/.local/share/mesa/mnt/workspace — the org browse tree is not present.
  await tinyVercelRepl(sandbox, { cwd: '~/.local/share/mesa/mnt/workspace' });
} finally {
  // No matter what happens, let's make sure we clean up the sandbox so we don't burn Vercel credits!
  console.log('\nCleaning up sandbox...');
  await sandbox.delete();
}
