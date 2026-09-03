#!/usr/bin/env node

// To run this example, create a .env file in this directory with:
//   MESA_PRIVATE_KEY=your-signing-private-key
//   DAYTONA_API_KEY=your-daytona-key
//
// Then run:
//   npm start

import 'dotenv/config';
import { Daytona, Image } from '@daytona/sdk';
import { Mesa, repo } from '@mesadev/sdk';
import tinyDaytonaRepl from './repl.ts';

const privateKey =
  process.env.MESA_PRIVATE_KEY ??
  (() => {
    throw Error('$MESA_PRIVATE_KEY not set.');
  })();

// Install Mesa and configure FUSE when Daytona builds the image. New sandboxes
// can then start without repeating this setup.
const image = Image.base('ubuntu:24.04').runCommands(
  'apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*',
  'curl -fsSL https://mesa.dev/install.sh | sh -s -- --version 0.46.0 --yes',
  // Enable user_allow_other in FUSE config. This is required for non-root users
  // to access the mounted filesystem.
  "sed -i 's/^#user_allow_other/user_allow_other/' /etc/fuse.conf"
);

const mesa = new Mesa({ privateKey });
console.log('Creating Daytona sandbox...');

const daytona = new Daytona();
const sandbox = await daytona.create(
  {
    image,
    ephemeral: true,
    ttlMinutes: 30, // 30 minutes
  },
  {
    timeout: 10 * 60, // 10 minutes
  }
);

let created: { name: string; org: string } | undefined;

try {
  created = await mesa.repos.create({ name: `daytona-${Date.now()}` });

  // Declare the namespace the sandbox gets: this layout is both what the mount
  // presents and what the token is scoped to. Nothing outside it is reachable.
  const workspace = mesa.fs({
    layout: { '/workspace': repo(created.name, { mode: 'rw' }) },
    authors: [{ name: 'Sandbox Agent', email: 'agent@example.com' }],
    ttl: 30 * 60, // 30 minutes
  });

  // Mint the short-lived access token OUTSIDE the sandbox, where your private
  // key lives. Only this token is injected below — your signing private key
  // never crosses the boundary. Signing is local (no network round-trip) and
  // the token expires on its own, so a compromised sandbox leaks at most a
  // soon-to-expire credential scoped to the layout's repositories.
  const { token } = await workspace.token();

  // You can run mesa in daemon mode to kick it off in the background.
  //
  // The flag we are using here is:
  //   -d, --daemonize  Spawns mesa in the background.
  //
  // The same layout the token was scoped to also describes the mount, so write
  // it into the sandbox and point `mesa mount` at it.
  console.log('Mounting Mesa...');
  const writeLayout = await sandbox.process.executeCommand(
    `cat > /tmp/layout.json <<'MESA_LAYOUT'\n${workspace.layout()}\nMESA_LAYOUT`
  );
  if (writeLayout.exitCode !== 0) throw new Error(writeLayout.result);
  const mount = await sandbox.process.executeCommand('mesa mount --daemonize --layout /tmp/layout.json', undefined, {
    MESA_ACCESS_TOKEN: token,
  });
  if (mount.exitCode !== 0) throw new Error(mount.result);

  // You can now explore the temporary repo. We've written a tiny REPL here you
  // can use to explore the sandbox.
  //
  // A layout mount presents exactly its declared paths, so the repo is at
  // ~/.local/share/mesa/mnt/workspace — the org browse tree is not present.
  await tinyDaytonaRepl(sandbox, { cwd: '~/.local/share/mesa/mnt/workspace' });
} finally {
  // No matter what happens, let's make sure we clean up the temporary resources
  // so we don't burn Daytona tokens!
  console.log('\nCleaning up sandbox and temporary repo...');
  try {
    await sandbox.delete();
  } finally {
    if (created) await mesa.repos.delete({ repo: created.name });
  }
}
