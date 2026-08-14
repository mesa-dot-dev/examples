#!/usr/bin/env node

// To run this example, create a .env file in this directory with:
//   MESA_PRIVATE_KEY=your-signing-private-key
//   E2B_API_KEY=your-e2b-key
//
// Then run:
//   npm start

import 'dotenv/config';
import { Sandbox } from 'e2b';
import { Mesa } from '@mesadev/sdk';
import tinyE2bRepl from './repl.ts';

const MESA_PRIVATE_KEY =
  process.env.MESA_PRIVATE_KEY ??
  (() => {
    throw Error('$MESA_PRIVATE_KEY not set.');
  })();
if (!process.env.E2B_API_KEY) {
  throw Error('$E2B_API_KEY not set.');
}

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

console.log('Creating E2B sandbox...');
const sandbox = await Sandbox.create();

try {
  // Set up Mesa within the E2B sandbox.
  //
  // We recommend installing Mesa as part of the container definition (e.g. Docker image),
  // but here we install it directly to keep the example small.

  // You can install Mesa as per the guide in https://docs.mesa.dev/content/mesafs/posix-mount.
  //
  // Mesa's installer will install all its dependencies through your system's package manager.
  console.log('Installing Mesa...');
  await sandbox.commands.run('curl -fsSL https://mesa.dev/install.sh | sh -s -- --version 0.46.0');

  // It is critical that you enable the user_allow_other flag in your fuse configuration.
  //
  // This allows users outside of yourself to also access the mesa mount you mounted. Mesa requires this for
  // operation. See https://www.man7.org/linux/man-pages/man8/mount.fuse3.8.html for more details.
  console.log('Configuring FUSE...');
  await sandbox.commands.run(
    [
      "sed -i 's/^#user_allow_other/user_allow_other/' /etc/fuse.conf",
      // E2B exposes /dev/fuse as root-only by default.
      'chmod 666 /dev/fuse',
    ].join(' && '),
    { user: 'root' }
  );

  // You can run mesa in daemon mode to kick it off in the background.
  //
  // The flag we are using here is:
  //   -d, --daemonize  Spawns mesa in the background.
  //
  console.log(`Mounting ${org}...`);
  await sandbox.commands.run('mesa mount -d', {
    envs: {
      MESA_ACCESS_TOKEN: token,
    },
  });

  // You can now explore repos in your org. We've written a tiny REPL here you can use to explore the sandbox.
  //
  // Your files will be in ~/.local/share/mesa/mnt/<org>/<repo>
  await tinyE2bRepl(sandbox, { cwd: `~/.local/share/mesa/mnt/${org}` });
} finally {
  // No matter what happens, let's make sure we clean up the sandbox so we don't burn E2B tokens!
  console.log('\nCleaning up sandbox...');
  await sandbox.kill();
}
