#!/usr/bin/env node

// To run this example, create a .env file in this directory with:
//   MESA_ORG=your-org
//   MESA_REPO=your-repo
//   MESA_API_KEY=your-mesa-key
//
// Then run:
//   npm start

import 'dotenv/config';
import { Mesa } from '@mesadev/sdk';
import tinyBashRepl from './repl.ts';

if (!process.env.MESA_API_KEY) {
  throw Error('$MESA_API_KEY not set.');
}
const ORG =
  process.env.MESA_ORG ??
  (() => {
    throw Error('$MESA_ORG not set.');
  })();
const REPO =
  process.env.MESA_REPO ??
  (() => {
    throw Error('$MESA_REPO not set.');
  })();

const mesa = new Mesa();

// The Mesa SDK's `fs.mount()` creates a virtual filesystem backed by Mesa's cloud storage.
// You get a full bash interface — ls, cat, grep, find, etc. — against files in a Mesa repo,
// no cloning, no sandbox required.
console.log(`Connecting to ${ORG}/${REPO} via Mesa...`);
const mesaFs = await mesa.fs.mount({
  repos: [{ name: REPO, bookmark: 'main' }],
  mode: 'rw',
});

// `mesaFs.bash()` returns a bash instance that executes commands against the virtual filesystem.
const bash = mesaFs.bash({ cwd: `/${ORG}/${REPO}`, python: true });

await tinyBashRepl(bash);
