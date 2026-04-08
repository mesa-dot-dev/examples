#!/usr/bin/env node
/**
 * Mesa changes demo — setup script
 *
 * Creates a Mesa repo with three changes, each containing a different
 * README.md, and three bookmarks (a, b, c) pointing to each change.
 *
 * Usage:
 *   npm run setup -- <org> <repo>
 *
 * Environment:
 *   MESA_API_KEY  — Mesa admin API key
 */

import { Mesa } from "@mesadev/sdk";

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

const [org, repo] = process.argv.slice(2);

if (!org || !repo) {
  console.error("Usage: npm run setup -- <org> <repo>");
  process.exit(1);
}

const mesa = new Mesa({ org });

// // --- Create the repo ---

console.log(`Creating repo ${org}/${repo}...`);

let repoInfo: { name: string };
try {
  repoInfo = await mesa.repos.create({ name: repo });
  console.log(green(`  Created repo: ${repoInfo.name}`));
} catch (err: any) {
  // If repo already exists, that's fine — fetch it instead
  if (err?.status === 409 || err?.message?.includes("already exists")) {
    console.log(dim(`  Repo ${repo} already exists, fetching...`));
    repoInfo = await mesa.repos.get({ repo });
  } else {
    console.error(red("Failed to create repo:"), err);
    process.exit(1);
  }
}

// --- Create three changes, each with a different README.md ---

const changes: Array<{ bookmark: string; content: string; id?: string }> = [
  { bookmark: "a", content: "hello a" },
  { bookmark: "b", content: "hello b" },
  { bookmark: "c", content: "hello c" },
];

const fs = await mesa.fs.mount({
  repos: [{ name: repo, bookmark: "main" }],
  mode: "rw",
});

// Force repo state initialization (native layer initializes lazily on first path access)
await fs.exists(`/${org}/${repo}`);

for (const change of changes) {
  console.log(`Attemping to create change & bookmark "${change.bookmark}" with README.md = "${change.content}"...`);

  const { changeOid } = await fs.change.new({ repo, bookmark: "main" });
  console.log(`  Created change: ${changeOid}`);
  // Ensure repo state is settled after change switch before writing
  await fs.writeFile(`/${org}/${repo}/README.md`, change.content, { encoding: 'utf-8' });
  console.log(`  Wrote README.md`);
  await fs.bookmark.create({ repo, name: change.bookmark });
  console.log(`  Created bookmark: ${change.bookmark}`);
}


console.log(`\n${green("Setup complete!")} Repo ${org}/${repo} has three bookmarks:`);
for (const change of changes) {
  console.log(`  ${change.bookmark} -> README.md = "${change.content}"`);
}
