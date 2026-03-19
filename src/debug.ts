import "dotenv/config";
import { Mesa } from "@mesadev/sdk";

const [org, repo] = process.argv.slice(2);
if (!org || !repo) {
  console.error("Usage: npx tsx src/debug.ts <org> <repo>");
  process.exit(1);
}

console.log("Step 1: Creating Mesa client...");
const mesa = new Mesa({ org });

console.log("Step 2: Creating MesaFS...");
const mesaFs = await mesa.fs.create({
  repos: [{ name: repo }],
  mode: "rw",
});

console.log("Step 3: Calling getAllPaths()...");
try {
  const paths = mesaFs.getAllPaths();
  console.log(`  Found ${paths.length} paths:`, paths.slice(0, 10));
} catch (e) {
  console.error("  getAllPaths failed:", e);
}

console.log("Step 4: Trying readdir('/')...");
try {
  const entries = await mesaFs.readdir("/");
  console.log("  /:", entries);
} catch (e) {
  console.error("  readdir('/') failed:", e);
}

console.log(`Step 5: Trying readdir('/${org}')...`);
try {
  const entries = await mesaFs.readdir(`/${org}`);
  console.log(`  /${org}:`, entries);
} catch (e) {
  console.error(`  readdir('/${org}') failed:`, e);
}

console.log(`Step 6: Trying readdir('/${org}/${repo}')...`);
try {
  const entries = await mesaFs.readdir(`/${org}/${repo}`);
  console.log(`  /${org}/${repo}:`, entries);
} catch (e) {
  console.error(`  readdir('/${org}/${repo}') failed:`, e);
}

console.log("Step 7: Creating Bash instance (no cwd)...");
const bash = mesaFs.bash();
console.log("  Bash created.");

console.log("Step 8: bash.exec('echo hello')...");
try {
  const r = await bash.exec("echo hello");
  console.log(`  stdout: ${JSON.stringify(r.stdout)}, exit: ${r.exitCode}`);
} catch (e) {
  console.error("  exec failed:", e);
}

console.log("Step 9: bash.exec('ls /')...");
try {
  const r = await bash.exec("ls /");
  console.log(`  stdout: ${JSON.stringify(r.stdout)}, exit: ${r.exitCode}`);
} catch (e) {
  console.error("  exec failed:", e);
}

console.log(`Step 10: bash.exec('ls /${org}/${repo}')...`);
try {
  const r = await bash.exec(`ls /${org}/${repo}`);
  console.log(`  stdout: ${JSON.stringify(r.stdout)}, exit: ${r.exitCode}`);
} catch (e) {
  console.error("  exec failed:", e);
}

console.log("Done.");
process.exit(0);
