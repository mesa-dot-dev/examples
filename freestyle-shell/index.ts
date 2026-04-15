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
  //   -d, --daemonize        Spawns mesa in the background
  //   -y, --non-interactive  Tells mesa to use the default values for all its configuration values. It will create a
  //                          new config file for you.
  //
  // We also pass the environment variable:
  //   MESA_ORGS=<org>:<api-key>,... Tells mesa to configure the given organization with the given API key.
  //                                 Mesa will store this information in its configuration file. See
  //                                 https://docs.mesa.dev/content/reference/mesa-cli-configuration for more details.
  //
  // Note that mesa will write the orgs to the config file the first time it is booted up, so you do not need to
  // specify it again. When mesa is already configured, it will append the orgs given through the environment to the
  // ones in the config.toml.
  //
  // Additionally, we recommend creating and specifying an ephemeral key which persists for the lifetime of the sandbox,
  // rather than using the main API key. In the spirit of keeping this example small, we use the main API key. See
  // https://docs.mesa.dev/content/getting-started/auth-and-permissions for more details.
  console.log(`Mounting ${ORG}...`);
  await vm.exec(`MESA_ORGS=${ORG}:${MESA_API_KEY} mesa mount -d -y`);

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
