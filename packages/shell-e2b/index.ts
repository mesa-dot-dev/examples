#!/usr/bin/env node
/**
 * Mesa + E2B interactive shell
 *
 * Spins up an E2B sandbox, installs Mesa and its FUSE dependencies,
 * mounts a Mesa repo inside it, and gives you a bash REPL that
 * executes in the sandbox.
 *
 * Usage:
 *   npx tsx index.ts
 * 
 * Environment:
 *   MESA_API_KEY  - Mesa API key
 *   E2B_API_KEY   - E2B API key
 */

import * as readline from "node:readline"
import * as dotenv from "dotenv"
import { Sandbox } from "e2b"
import { Mesa } from "@mesadev/sdk"

dotenv.config()

const SANDBOX_USER = "user"
const SANDBOX_ROOT_USER = "root"
const SANDBOX_TIMEOUT_MS = 60 * 60 * 1000
const COMMAND_TIMEOUT_MS = 10 * 60 * 1000
const MOUNT_POINT = `/home/${SANDBOX_USER}/mesa/mnt`
const CONFIG_PATH = `/home/${SANDBOX_USER}/.config/mesa/config.toml`
const DAEMON_DIR = `/home/${SANDBOX_USER}/mesa`
const DAEMON_LOG_PATH = `${DAEMON_DIR}/daemon.log`
const DAEMON_PID_PATH = `${DAEMON_DIR}/mesa.pid`
const MESA_ORG = 'examples'
const MESA_REPO = 'e2b-repl'

let sandbox: Sandbox | undefined
let rl: readline.Interface | undefined
let cleaningUp = false

async function cleanup(exitCode = 0) {
  if (cleaningUp) return
  cleaningUp = true

  rl?.removeAllListeners("close")
  rl?.close()

  if (sandbox) {
    console.log("\nCleaning up sandbox...")
    await sandbox.kill()
  }

  console.log("Bye!")
  process.exit(exitCode)
}

async function main() {
  console.log("Creating E2B sandbox...")
  sandbox = await Sandbox.create({ timeoutMs: SANDBOX_TIMEOUT_MS })

  await sandbox.commands.run([
    "apt-get update",
    "apt-get install -y --no-install-recommends ca-certificates curl fuse3 gpg",
    "rm -rf /var/lib/apt/lists/*",
    "sed -i 's/^#user_allow_other/user_allow_other/' /etc/fuse.conf",
    "chmod 666 /dev/fuse",
    "curl -fsSL https://mesa.dev/install.sh | sh -s -- --yes",
  ].join(" && "), { user: SANDBOX_ROOT_USER })

  const mesaConfig = `
  mount-point = "${MOUNT_POINT}"
  [daemon]
  pid-file = "${DAEMON_PID_PATH}"

  [daemon.log]
  target = { file = "${DAEMON_LOG_PATH}" }

  [organizations.${MESA_ORG}]
  api-key = "${process.env.MESA_API_KEY}"
`
  await sandbox.files.write(CONFIG_PATH, mesaConfig, { user: SANDBOX_ROOT_USER })

  const cwd = `${MOUNT_POINT}/${MESA_ORG}/${MESA_REPO}`

  await sandbox.commands.run(`mesa -c ${CONFIG_PATH} mount --daemonize`, { user: SANDBOX_ROOT_USER })

  const readDaemonLogSummary = async () => {
    if (!(await sandbox!.files.exists(DAEMON_LOG_PATH, { user: SANDBOX_ROOT_USER }))) {
      return undefined
    }

    const log = await sandbox!.files.read(DAEMON_LOG_PATH, { user: SANDBOX_ROOT_USER })
    const summary = log
      .trim()
      .split("\n")
      .slice(-12)
      .join("\n")

    return summary || undefined
  }

  for (let i = 0; i < 30; i++) {
    if (await sandbox.files.exists(cwd, { user: SANDBOX_ROOT_USER })) break
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  if (!(await sandbox.files.exists(cwd, { user: SANDBOX_ROOT_USER }))) {
    throw new Error(
      `Mesa mount did not become ready at ${cwd}`
    )
  }

  console.log(`Connected to ${MESA_ORG}/${MESA_REPO}. Type "exit" or Ctrl+C to quit.\n`)

  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  rl.on("close", () => {
    void cleanup(0)
  })

  process.on("SIGINT", () => {
    void cleanup(0)
  })

  process.on("SIGTERM", () => {
    void cleanup(0)
  })

  function prompt(): void {
    if (cleaningUp || !rl) return

    rl!.question("$ ", async (input) => {
      const trimmed = input.trim()
      if (cleaningUp) return
      if (!trimmed) return prompt()
      if (trimmed === "exit") return cleanup(0)

      try {
        await sandbox!.setTimeout(SANDBOX_TIMEOUT_MS)

        const result = await sandbox!.commands.run(trimmed, {
          cwd,
          user: SANDBOX_ROOT_USER,
          timeoutMs: COMMAND_TIMEOUT_MS,
          requestTimeoutMs: COMMAND_TIMEOUT_MS,
        })

        if (result.stdout) process.stdout.write(result.stdout)
        if (result.stderr) process.stderr.write(result.stderr)
        if (result.exitCode !== 0) {
          console.error(`[exit ${result.exitCode}]`)
        }
      } catch (err) {
        console.error(("Error:"), String(err))
      }

      if (cleaningUp) return
      prompt()
    })
  }

  prompt()
}

main().catch(async (err) => {
  console.error(("Error:"), err)

  await cleanup(1)
})
