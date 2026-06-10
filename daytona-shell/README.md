# daytona-shell

Interactive shell over repos in a [Mesa](https://mesa.dev) org running inside a [Daytona](https://daytona.io) sandbox, written in TypeScript.

Spins up a Daytona sandbox with a custom Docker image (Mesa CLI pre-installed), mounts your org's repos via FUSE, and drops you into a minimal shell. Commands execute inside the sandbox against the mounted filesystem.

See also: [daytona-python-shell](../daytona-python-shell) for the Python version.

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
Creating Daytona sandbox...
Mounting your-org...
Connected to your-org. Type "exit" or Ctrl+C to quit.

$ ls
repo-one  repo-two  repo-three
$ cd repo-one
$ ls
README.md  src/  package.json
$ exit
Cleaning up sandbox...
Bye!
```

## How it works

1. Builds a custom Docker image with Mesa CLI and FUSE pre-installed
2. Creates a Daytona sandbox from that image
3. Mints a scoped, short-lived access token from your API key (outside the sandbox) — your long-lived API key never enters the sandbox
4. Writes a Mesa config file and starts the FUSE daemon (`mesa mount --daemonize`)
5. Waits for the mount to become ready, then drops you into a REPL

## Environment variables

| Variable | Description |
|----------|-------------|
| `MESA_ORG` | Your Mesa organization slug |
| `MESA_API_KEY` | Mesa API key with at least `write` scope ([get one here](https://mesa.dev)) — the short-lived token minted for the sandbox cannot exceed the key's scopes |
| `DAYTONA_API_KEY` | Daytona API key ([get one here](https://app.daytona.io)) |

## Requirements

- Node.js >= 18
- Mesa account with an API key
- Daytona account with an API key
