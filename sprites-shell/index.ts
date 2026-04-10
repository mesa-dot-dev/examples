#!/usr/bin/env node

// To run this example, create a .env file in this directory with:
//   MESA_ORG=your-org
//   MESA_API_KEY=your-mesa-key
//   SPRITES_TOKEN=your-sprites-token
//
// Then run:
//   npm start

import 'dotenv/config';
import { SpritesClient } from '@fly/sprites';
import tinySpritesRepl from './repl.ts';

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
const SPRITES_TOKEN =
  process.env.SPRITES_TOKEN ??
  (() => {
    throw Error('$SPRITES_TOKEN not set.');
  })();

console.log('creating sprite...');
const client = new SpritesClient(SPRITES_TOKEN);
const sprite = await client.createSprite(`mesa-${ORG}`);

try {
  // Set up Mesa within the Sprites sandbox.
  //
  // You can install Mesa as per the guide in https://docs.mesa.dev/content/virtual-filesystem/os-level.
  //
  // Mesa's installer will install all its dependencies through your system's package manager.
  console.log('Installing Mesa...');
  await sprite.execFile('sh', ['-c', 'curl -fsSL https://mesa.dev/install.sh | sh']);

  // It is critical that you enable the user_allow_other flag in your fuse configuration.
  //
  // This allows users outside of yourself to also access the mesa mount you mounted. Mesa requires this for
  // operation. See https://www.man7.org/linux/man-pages/man8/mount.fuse3.8.html for more details.
  //
  // We also need to modify the permissions of /dev/fuse to allow other users to access it,
  // because Sprites exposes /dev/fuse as root-only by default.
  console.log('Configuring FUSE...');
  await sprite.execFile('sh', [
    '-c',
    `sed -i 's/^#user_allow_other/user_allow_other/' /etc/fuse.conf \
     && chmod 666 /dev/fuse`,
  ]);

  // You can run mesa in daemon mode to kick it off in the background.
  //
  // The flags we are using here are:
  //   -d, --daemonize        Spawns mesa in the background
  //   -y, --non-interactive  Tells mesa to use the default values for all its configuration values. It will create a
  //                          new config file for you.
  //
  // We also pass the environment variable:
  //   MESA_ORGS=<org>:<api-key>,... Tells mesa to configure the given organization with the given API key.
  //                                 Mesa will store this information in its configuration file. See
  //                                 https://docs.mesa.dev/content/reference/mesa-cli-configuration for more details.
  console.log(`mounting mesa...`);
  await sprite.execFile('sh', ['-c', `MESA_ORGS=${ORG}:${MESA_API_KEY} mesa mount -d -y`]);

  // You can now explore repos in your org. We've written a tiny REPL here you can use to explore the sandbox.
  //
  // Your files will be at ~/.local/share/mesa/mnt/<org>/<repo>
  await tinySpritesRepl(sprite, { cwd: `~/.local/share/mesa/mnt/${ORG}` });
} finally {
  // No matter what happens, let's make sure we clean up the sprite!
  console.log('\nCleaning up sprite...');
  await sprite.destroy();
}
