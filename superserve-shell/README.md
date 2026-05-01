# superserve-shell

Interactive shell over repos in a [Mesa](https://mesa.dev) org running inside a [Superserve](https://superserve.ai) sandbox, written in TypeScript.

Spins up a Superserve sandbox (Firecracker microVM, sub-second cold start), installs the Mesa CLI, mounts your org's repos via FUSE, and drops you into a minimal shell. Commands execute inside the sandbox against the mounted filesystem.

## Quick start

```bash
npm install

# Create a .env in this directory (gitignored)
cp .env.example .env

# Now populate your .env file with the required values

# Run
npm start
```

```
Creating Superserve sandbox...
Installing Mesa...
Mounting your-org...
Connected to ~/.local/share/mesa/mnt/your-org. Type "exit" or Ctrl+C to quit.

$ ls
repo-one  repo-two  repo-three
$ cd repo-one
$ ls
README.md  src/  package.json
$ exit
Cleaning up sandbox...
```

## How it works

1. Creates a Superserve sandbox from the default `superserve/base` template
2. Installs the [Mesa CLI](https://docs.mesa.dev/content/virtual-filesystem/os-level) inside the sandbox
3. Runs `mesa mount -d -y` with your org and API key to start the FUSE daemon
4. Drops you into a REPL where commands run inside the sandbox via `sandbox.commands.run()`

Superserve sandboxes are full Firecracker microVMs running as root with a FUSE-enabled kernel, so the `user_allow_other` and `chmod 666 /dev/fuse` steps that other sandbox providers require aren't needed.

The REPL (`repl.ts`) tracks your working directory and handles `cd`, `~` expansion, and relative paths.

## Files

| File | Description |
|------|-------------|
| `index.ts` | Sandbox setup, Mesa installation and mount |
| `repl.ts` | Tiny REPL with `cd` and tilde expansion |

## Environment variables

| Variable | Description |
|----------|-------------|
| `MESA_ORG` | Your Mesa organization slug |
| `MESA_API_KEY` | Mesa API key ([get one here](https://mesa.dev)) |
| `SUPERSERVE_API_KEY` | Superserve API key ([get one here](https://superserve.ai)) |

## Requirements

- Node.js >= 18
- Mesa account with an API key
- Superserve account with an API key
