#!/usr/bin/env node

// To run this example, create a .env file in this directory with:
//   MESA_ORG=your-org
//   MESA_API_KEY=your-mesa-key
//   SUPERSERVE_API_KEY=your-superserve-key
//
// Then run:
//   npm start

import 'dotenv/config';
import { Sandbox } from '@superserve/sdk';
import { Mesa } from '@mesadev/sdk';
import tinySuperserveRepl from './repl.ts';

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
if (!process.env.SUPERSERVE_API_KEY) {
  throw Error('$SUPERSERVE_API_KEY not set.');
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

console.log('Creating Superserve sandbox...');
const sandbox = await Sandbox.create({ name: 'mesa-shell' });

try {
  // Set up Mesa within the Superserve sandbox.
  //
  // We recommend installing Mesa as part of a custom template, but here we
  // install it directly to keep the example small.

  // You can install Mesa as per the guide in https://docs.mesa.dev/content/virtual-filesystem/os-level.
  //
  // Mesa's installer will install all its dependencies through your system's package manager.
  console.log('Installing Mesa...');
  await sandbox.commands.run('curl -fsSL https://mesa.dev/install.sh | sh -s -- --yes');

  // Superserve sandboxes run as root inside a Firecracker microVM with a
  // FUSE-enabled kernel, so the `user_allow_other` and `chmod 666 /dev/fuse`
  // steps that other sandbox providers require aren't needed here.

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
  await sandbox.commands.run('mesa mount -d -y', {
    env: {
      MESA_ORG: ORG,
      MESA_API_KEY: token, // the short-lived token, NOT the raw API key
    },
  });

  // You can now explore repos in your org. We've written a tiny REPL here you can use to explore the sandbox.
  //
  // The default configuration is created in ~/.config/mesa/config.toml
  // and your files will be in ~/.local/share/mesa/mnt/<org>/<repo>
  await tinySuperserveRepl(sandbox, { cwd: `~/.local/share/mesa/mnt/${ORG}` });
} finally {
  // No matter what happens, let's make sure we clean up the sandbox so we don't burn Superserve resources.
  console.log('\nCleaning up sandbox...');
  await sandbox.kill();
}
