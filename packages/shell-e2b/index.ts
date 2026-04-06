#!/usr/bin/env node
/**
 * Mesa + E2B interactive shell
 *
 * Starts an E2B sandbox, installs Mesa, mounts a Mesa repo inside it,
 * and gives you a tiny shell REPL for the mounted repo.
 */

import * as readline from "node:readline"
import "dotenv/config"
import { stdin as input, stdout as output } from "node:process"
import { Sandbox } from "e2b"

const SANDBOX_USER = "user"
const MESA_ORG = "examples"
const MESA_REPO = "e2b-repl"
const MOUNT_POINT = `/home/${SANDBOX_USER}/mesa/mnt`
const CONFIG_PATH = `/home/${SANDBOX_USER}/.config/mesa/config.toml`
const MESA_API_KEY = process.env.MESA_API_KEY
const cwd = `${MOUNT_POINT}/${MESA_ORG}/${MESA_REPO}`

const MESA_CONFIG = `
  mount-point = "${MOUNT_POINT}"

  [organizations.${MESA_ORG}]
  api-key = "${MESA_API_KEY}"
`

async function main() {
  console.log("Creating E2B sandbox...")
  const sandbox = await Sandbox.create({ timeoutMs: 60 * 60 * 1000 })

  try {
    // Install Mesa & configure FUSE
    await sandbox.commands.run(
      [
        "apt-get update",
        "apt-get install -y --no-install-recommends ca-certificates curl fuse3 gpg",
        "sed -i 's/^#user_allow_other/user_allow_other/' /etc/fuse.conf",
        // E2B exposes /dev/fuse as root-only by default.
        "chmod 666 /dev/fuse",
        "curl -fsSL https://mesa.dev/install.sh | sh -s -- --yes",
      ].join(" && "),
      { user: "root" },
    )

    console.log(`Mounting ${MESA_ORG}/${MESA_REPO}...`)

    // Write Mesa config file
    await sandbox.files.write(
      CONFIG_PATH, MESA_CONFIG,
      { user: SANDBOX_USER },
    )

    // Run Mesa
    await sandbox.commands.run(
      `mesa mount --daemonize`,
      { user: SANDBOX_USER },
    )

    console.log(`Connected to ${MESA_ORG}/${MESA_REPO}. Type "exit" or Ctrl+C to quit.\n`)

    const rl = readline.createInterface({ input, output })
    rl.on("SIGINT", () => rl.close())
    rl.on("SIGTERM", () => rl.close())
    process.stdout.write("$ ")

    for await (const line of rl) {
      const command = line.trim()
      if (!command) {
        process.stdout.write("$ ")
        continue
      }
      if (command === "exit") break

      const result = await sandbox.commands.run(command, { cwd, user: SANDBOX_USER })
      if (result.stdout) process.stdout.write(result.stdout)
      if (result.stderr) process.stderr.write(result.stderr)
      if (result.exitCode !== 0) console.error(`[exit ${result.exitCode}]`)

      process.stdout.write("$ ")
    }

    rl.close()
  } finally {
    console.log("\nCleaning up sandbox...")
    await sandbox.kill()
    console.log("Bye!")
  }
}

main().catch((error) => {
  console.error("Error:", error instanceof Error ? error.message : String(error))
  process.exit(1)
})
