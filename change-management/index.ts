#!/usr/bin/env node

// To run this example, create a .env file in this directory with:
//   MESA_PRIVATE_KEY=your-signing-private-key
//
// Then run:
//   npm start
//
// This will create a temporary repo in your org, set up three changes with
// bookmarks (a, b, c) each with a different README.md, then tear it down.

import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { Mesa } from '@mesadev/sdk';

if (!process.env.MESA_PRIVATE_KEY) {
  throw Error('$MESA_PRIVATE_KEY not set.');
}

const mesa = new Mesa({ privateKey: process.env.MESA_PRIVATE_KEY });
const org = mesa.org.slug;
const repo = `change-mgmt-example-${randomBytes(4).toString('hex')}`;

console.log(`creating repo ${repo}...`);
await mesa.repos.create({ name: repo });

try {
  // Mount the repo's virtual filesystem in read-write mode.
  const fs = await mesa.fs.mount({
    authors: [{ name: 'App Agent', email: 'agent@example.com' }],
    repos: [{ name: repo, bookmark: 'main' }],
  });

  // Changes are Mesa's unit of work — like lightweight branches that track file modifications.
  // Each change gets a bookmark (a named pointer) so you can switch between them.
  const CHANGES = [
    { bookmark: 'a', content: 'hello a' },
    { bookmark: 'b', content: 'hello b' },
    { bookmark: 'c', content: 'hello c' },
  ];

  for (const { bookmark, content } of CHANGES) {
    // Create a new change on the "main" bookmark. This is like creating a new branch.
    const { changeOid } = await fs.change.new({ repo: repo, bookmark: 'main' });
    console.log(`created change ${changeOid}, writing README.md = "${content}"`);

    // Write a file to the change. The file is written to the virtual filesystem,
    // which is backed by Mesa's cloud storage.
    await fs.writeFile(`/${org}/${repo}/README.md`, content, { encoding: 'utf-8' });

    // Create a bookmark pointing to this change.
    await fs.bookmark.create({ repo: repo, name: bookmark });
    console.log(`created bookmark: ${bookmark}`);
  }

  console.log(`done! repo ${repo} has three bookmarks:`);
  for (const { bookmark, content } of CHANGES) {
    console.log(`  ${bookmark} -> README.md = "${content}"`);
  }
} finally {
  console.log(`cleaning up repo ${repo}...`);
  await mesa.repos.delete({ repo: repo });
  console.log('deleted.');
}
