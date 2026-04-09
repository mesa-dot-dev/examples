# runloop-shell

Interactive shell over repos in a [Mesa](https://mesa.dev) org running inside a [Runloop](https://runloop.ai) devbox.

Spins up a Runloop devbox, installs the Mesa CLI, mounts your org's repos via FUSE, and drops you into a minimal shell. Commands execute inside the devbox against the mounted filesystem.

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
creating a devbox...
installing mesa...
configuring fuse...
mounting mesa...
$ ls
repo-one  repo-two  repo-three
$ cd repo-one
$ ls
README.md  src/  package.json
$ cat README.md
# My Project
...
$ exit
shutting down devbox...
```

## How it works

1. Creates a Runloop devbox
2. Installs the [Mesa CLI](https://docs.mesa.dev/content/virtual-filesystem/os-level) inside the devbox
3. Configures FUSE (`user_allow_other`) and `/dev/fuse` permissions so Mesa can serve the mount
4. Runs `mesa mount -d -y` with your org and API key to start the FUSE daemon
5. Drops you into a REPL where commands run inside the devbox via `devbox.cmd.exec()`

The REPL (`tiny-runloop-repl.ts`) tracks your working directory and handles `cd`, `~` expansion, and relative paths.

## Files

| File | Description |
|------|-------------|
| `index.ts` | Devbox setup, Mesa installation and mount |
| `tiny-runloop-repl.ts` | Tiny REPL with `cd` and tilde expansion |

## Environment variables

| Variable | Description |
|----------|-------------|
| `MESA_ORG` | Your Mesa organization slug |
| `MESA_API_KEY` | Mesa API key ([get one here](https://mesa.dev)) |
| `RUNLOOP_API_KEY` | Runloop API key ([get one here](https://runloop.ai)) |

## Requirements

- Node.js >= 18
- Mesa account with an API key
- Runloop account with an API key
