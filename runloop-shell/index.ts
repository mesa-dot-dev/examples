#!/usr/bin/env node

// To run this example, you'll need to set three environment variables:
//   MESA_ORG        - The organization you want to mount within the container
//   MESA_API_KEY    - Your mesa API key
//   RUNLOOP_API_KEY - Your runloop API key

import 'dotenv/config';
import { RunloopSDK } from '@runloop/api-client';
import { Mesa } from '@mesadev/sdk';
import tinyRunloopRepl from './tiny-runloop-repl.ts';

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
const RUNLOOP_API_KEY =
  process.env.RUNLOOP_API_KEY ??
  (() => {
    throw Error('$RUNLOOP_API_KEY not set.');
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

console.log('creating a devbox...');
const devbox = await new RunloopSDK({ bearerToken: RUNLOOP_API_KEY }).devbox.create({ name: `mesa-example-shell` });

try {
  // Set up mesa within the Runloop container.
  //
  // We recommend installing mesa as part of the container definition, but here we install it directly to keep the
  // example small.

  // You can install mesa as per the guide in https://docs.mesa.dev/content/virtual-filesystem/os-level.
  //
  // Mesa's installer will install all its dependencies through your system's package manager.
  console.log('installing mesa...');
  await devbox.cmd.exec('curl -fsSL https://mesa.dev/install.sh | sh');

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
  // The flags we are using here are:
  //   -d,--daemonize       Spawns mesa in the background
  //   -y,--non-interactive Tells mesa to use the default values for all its configuration values. It will create a new
  //                        config file for you.
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
  console.log('mounting mesa...');
  await devbox.cmd.exec(`MESA_ORG=${ORG} MESA_API_KEY=${token} mesa mount -d -y`);

  // You can now explore repos in your org. We've written a tiny REPL here you can use to explore the container.
  //
  // The default configuration is created in ~/.config/mesa/config.toml
  // and your files will be in ~/.local/share/mesa/mnt
  await tinyRunloopRepl(devbox, { cwd: '~/.local/share/mesa/mnt' });
} finally {
  // No matter what happens, let's make sure we close the devbox so we don't burn Runloop tokens!
  console.log('shutting down devbox...');
  await devbox.shutdown();
}
