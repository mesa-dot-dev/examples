#!/usr/bin/env node

// To run this example, create a .env file in this directory with:
//   MESA_REPO=your-repo
//   MESA_PRIVATE_KEY=your-signing-private-key
//
// Then run:
//   npm start

import 'dotenv/config';
import { Mesa, repo } from '@mesadev/sdk';
import tinyBashRepl from './repl.ts';

if (!process.env.MESA_PRIVATE_KEY) {
  throw Error('$MESA_PRIVATE_KEY not set.');
}
const REPO =
  process.env.MESA_REPO ??
  (() => {
    throw Error('$MESA_REPO not set.');
  })();

const mesa = new Mesa({ privateKey: process.env.MESA_PRIVATE_KEY });
const org = mesa.org.slug;

// The Mesa SDK's layout mount creates a virtual filesystem backed by Mesa's cloud storage.
// You get a full bash interface — ls, cat, grep, find, etc. — against files in a Mesa repo,
// no cloning, no sandbox required.
console.log(`Connecting to ${org}/${REPO} via Mesa...`);
const mesaFs = await mesa
  .fs({
    layout: { [`/${org}/${REPO}`]: repo(REPO, { mode: 'rw', at: { bookmark: 'main' } }) },
    authors: [{ name: 'App Agent', email: 'agent@example.com' }],
  })
  .mount();

const newChange = await mesaFs.change.new({ repo: REPO, bookmark: 'main' });

// `mesaFs.bash()` returns a bash instance that executes commands against the virtual filesystem.
const bash = mesaFs.bash({ cwd: `/${org}/${REPO}`, python: true });

await tinyBashRepl(bash, async () => {
  await mesaFs.bookmark.move({ repo: REPO, name: 'main', changeId: newChange.changeOid });
});
