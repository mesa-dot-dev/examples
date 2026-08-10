#!/usr/bin/env node

// To run this example, create a .env file in this directory with:
//   MESA_ORG=your-org
//   MESA_PRIVATE_KEY=your-signing-private-key
//   VERCEL_TEAM_ID=your-vercel-team-id
//   VERCEL_PROJECT_ID=your-vercel-project-id
//   VERCEL_TOKEN=your-vercel-access-token
//
// Then run:
//   npm start

import 'dotenv/config';
import { Sandbox } from '@vercel/sandbox';
import { Mesa } from '@mesadev/sdk';
import tinyVercelRepl from './repl.ts';

const ORG =
  process.env.MESA_ORG ??
  (() => {
    throw Error('$MESA_ORG not set.');
  })();
const MESA_PRIVATE_KEY =
  process.env.MESA_PRIVATE_KEY ??
  (() => {
    throw Error('$MESA_PRIVATE_KEY not set.');
  })();
if (!process.env.VERCEL_TEAM_ID || !process.env.VERCEL_PROJECT_ID || !process.env.VERCEL_TOKEN) {
  throw Error('$VERCEL_TEAM_ID, $VERCEL_PROJECT_ID, or $VERCEL_TOKEN not set.');
}

// Mint a short-lived access token OUTSIDE the sandbox, where your private key lives.
// Only this token is injected into the sandbox below — your signing private key
// never crosses the boundary. Signing is local (no network round-trip) and the
// token expires on its own, so a compromised sandbox leaks at most a
// soon-to-expire, narrowly-scoped credential.
const mesa = new Mesa({ privateKey: MESA_PRIVATE_KEY });
const { token } = await mesa.tokens.create({
  authors: [{ name: 'Sandbox Agent', email: 'agent@example.com' }],
  scopes: ['read', 'write'],
  // Optionally restrict the token to specific repos (full `org/repo` names):
  //   repos: [`${ORG}/my-repo`],
  ttl_seconds: 60 * 60, // 1 hour (max 4h). The mount lasts exactly this long.
});

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
    args: ['-c', 'curl -fsSL https://mesa.dev/install.sh | sh'],
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
  // We pass two environment variables:
  //   MESA_ORG           tells mesa which organization to mount.
  //   MESA_ACCESS_TOKEN  provides the credential for this process; here we pass
  //                      the short-lived token we minted above, so the private
  //                      key never enters the sandbox. See
  //                      https://docs.mesa.dev/content/reference/mesa-cli-configuration.
  //
  // The token is read from the environment and is never persisted to disk.
  console.log('Mounting Mesa...');
  await sandbox.runCommand({
    cmd: 'mesa',
    args: ['mount'],
    detached: true,
    env: {
      MESA_ORG: ORG,
      MESA_ACCESS_TOKEN: token, // the short-lived token, NOT the private key
    },
  });

  // You can now explore repos in your org. We've written a tiny REPL here you can use to explore the sandbox.
  //
  // Your files will be in ~/.local/share/mesa/mnt/<org>/<repo>
  await tinyVercelRepl(sandbox, { cwd: `~/.local/share/mesa/mnt/${ORG}` });
} finally {
  // No matter what happens, let's make sure we clean up the sandbox so we don't burn Vercel credits!
  console.log('\nCleaning up sandbox...');
  await sandbox.delete();
}
