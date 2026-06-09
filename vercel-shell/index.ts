#!/usr/bin/env node

// To run this example, create a .env file in this directory with:
//   MESA_ORG=your-org
//   MESA_API_KEY=your-mesa-key
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
const MESA_API_KEY =
  process.env.MESA_API_KEY ??
  (() => {
    throw Error('$MESA_API_KEY not set.');
  })();
if (!process.env.VERCEL_TEAM_ID || !process.env.VERCEL_PROJECT_ID || !process.env.VERCEL_TOKEN) {
  throw Error('$VERCEL_TEAM_ID, $VERCEL_PROJECT_ID, or $VERCEL_TOKEN not set.');
}

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

console.log('Creating Vercel sandbox...');

const sandbox = await Sandbox.create({
  teamId: process.env.VERCEL_TEAM_ID,
  projectId: process.env.VERCEL_PROJECT_ID,
  token: process.env.VERCEL_TOKEN,
});

try {
  // Set up Mesa within the Vercel sandbox.
  //
  // You can install Mesa as per the guide in https://docs.mesa.dev/content/virtual-filesystem/os-level.
  //
  // Mesa's installer will install all its dependencies through your system's package manager.
  console.log('Installing Mesa...');
  await sandbox.runCommand({
    cmd: 'sh',
    args: ['-c', 'curl -fsSL https://mesa.dev/install.sh | sh'],
  });

  // It is critical that you enable the user_allow_other flag in your fuse configuration.
  //
  // This allows users outside of yourself to also access the mesa mount you mounted.Mesa requires this for
  // operation.See https://www.man7.org/linux/man-pages/man8/mount.fuse3.8.html for more details.
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
  // The flags we are using here are:
  //   -y, --non-interactive  Tells mesa to use the default values for all its configuration values. It will create a
  //                          new config file for you.
  //
  // We pass two environment variables:
  //   MESA_ORG       tells mesa which organization to add to config.toml.
  //   MESA_API_KEY   provides the credential for this process. It accepts an
  //                  API key OR an access token; here we pass the short-lived
  //                  token we minted above, so the raw API key never enters the
  //                  sandbox. See
  //                  https://docs.mesa.dev/content/reference/mesa-cli-configuration.
  //
  // Mesa writes only the organization to config.toml on first boot; the token
  // is read from the environment and is never persisted to disk.
  console.log('Mounting Mesa...');
  await sandbox.runCommand({
    cmd: 'mesa',
    args: ['mount', '-y'],
    detached: true,
    env: {
      MESA_ORG: ORG,
      MESA_API_KEY: token, // the short-lived token, NOT the raw API key
    },
  });

  // You can now explore repos in your org. We've written a tiny REPL here you can use to explore the sandbox.
  //
  // The default configuration is created in ~/.config/mesa/config.toml
  // and your files will be in ~/.local/share/mesa/mnt/<org>/<repo>
  await tinyVercelRepl(sandbox, { cwd: `~/.local/share/mesa/mnt/${ORG}` });
} finally {
  // No matter what happens, let's make sure we clean up the sandbox so we don't burn Vercel credits!
  console.log('\nCleaning up sandbox...');
  await sandbox.delete();
}
