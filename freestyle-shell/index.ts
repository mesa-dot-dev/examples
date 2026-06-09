#!/usr/bin/env node

// To run this example, create a .env file in this directory with:
//   MESA_ORG=your-org
//   MESA_API_KEY=your-mesa-key
//   FREESTYLE_API_KEY=your-freestyle-key
//
// Then run:
//   pnpm run start

import 'dotenv/config';
import { Freestyle } from 'freestyle';
import { Mesa } from '@mesadev/sdk';
import tinyFreestyleRepl from './repl.ts';

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
if (!process.env.FREESTYLE_API_KEY) {
  throw Error('$FREESTYLE_API_KEY not set.');
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

const freestyle = new Freestyle({ apiKey: process.env.FREESTYLE_API_KEY });
console.log('Creating Freestyle sandbox...');

const { vm } = await freestyle.vms.create();

try {
  // Set up Mesa within the Freestyle sandbox.
  //
  // We recommend installing Mesa as part of the container definition (e.g. Docker image),
  // but here we install it directly to keep the example small.

  // You can install Mesa as per the guide in https://docs.mesa.dev/content/virtual-filesystem/os-level.
  //
  // Mesa's installer will install all its dependencies through your system's package manager.
  console.log('Installing Mesa...');
  await vm.exec('curl -fsSL https://mesa.dev/install.sh | sh');

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
  // The flags we are using here are:
  //   -d, --daemonize        Spawns mesa in the background.
  //   -y, --non-interactive  Tells mesa to use defaults for all configuration
  //                          values. It will create a new config file for you.
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
  console.log(`Mounting ${ORG}...`);
  await vm.exec(`MESA_ORG=${ORG} MESA_API_KEY=${token} mesa mount -d -y`);

  // You can now explore repos in your org. We've written a tiny REPL here you can use to explore the sandbox.
  //
  // The default configuration is created in ~/.config/mesa/config.toml
  // and your files will be in /root/.local/share/mesa/mnt/<org>/<repo>
  await tinyFreestyleRepl(vm, { cwd: `/root/.local/share/mesa/mnt/${ORG}` });
} finally {
  // No matter what happens, let's make sure we clean up the sandbox.
  console.log('\nCleaning up sandbox...');
  await vm.kill();
}
