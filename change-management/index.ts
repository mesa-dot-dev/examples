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
import { Mesa, repo } from '@mesadev/sdk';

if (!process.env.MESA_PRIVATE_KEY) {
  throw Error('$MESA_PRIVATE_KEY not set.');
}

const mesa = new Mesa({ privateKey: process.env.MESA_PRIVATE_KEY });
const org = mesa.org.slug;
const repoName = `change-mgmt-example-${randomBytes(4).toString('hex')}`;

console.log(`creating repo ${repoName}...`);
await mesa.repos.create({ name: repoName });

try {
  // Mount the repo's virtual filesystem in read-write mode.
  const fs = await mesa
    .fs({
      layout: { [`/${org}/${repoName}`]: repo(repoName, { mode: 'rw', at: { bookmark: 'main' } }) },
      authors: [{ name: 'App Agent', email: 'agent@example.com' }],
    })
    .mount();

  // Changes are Mesa's unit of work — like lightweight branches that track file modifications.
  // Each change gets a bookmark (a named pointer) so you can switch between them.
  const CHANGES = [
    { bookmark: 'a', content: 'hello a' },
    { bookmark: 'b', content: 'hello b' },
    { bookmark: 'c', content: 'hello c' },
  ];

  for (const { bookmark, content } of CHANGES) {
    // Create a new change on the "main" bookmark. This is like creating a new branch.
    const { changeOid } = await fs.change.new({ repo: repoName, bookmark: 'main' });
    console.log(`created change ${changeOid}, writing README.md = "${content}"`);

    // Write a file to the change. The file is written to the virtual filesystem,
    // which is backed by Mesa's cloud storage.
    await fs.writeFile(`/${org}/${repoName}/README.md`, content, { encoding: 'utf-8' });

    // Create a bookmark pointing to this change.
    await fs.bookmark.create({ repo: repoName, name: bookmark });
    console.log(`created bookmark: ${bookmark}`);
  }

  console.log(`done! repo ${repoName} has three bookmarks:`);
  for (const { bookmark, content } of CHANGES) {
    console.log(`  ${bookmark} -> README.md = "${content}"`);
  }
} finally {
  console.log(`cleaning up repo ${repoName}...`);
  await mesa.repos.delete({ repo: repoName });
  console.log('deleted.');
}
