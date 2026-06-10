# vercel-shell

Interactive shell over repos in a [Mesa](https://mesa.dev) org running inside a [Vercel sandbox](https://vercel.com/docs/sandbox/quickstart), written in TypeScript.

Spins up a Vercel sandbox, mounts your org's repos via FUSE, and drops you into a minimal shell. Commands execute inside the sandbox against the mounted filesystem.

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
Creating Vercel sandbox...
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

1. Creates a Vercel sandbox
2. Runs Mesa setup commands and starts the FUSE daemon (`mesa mount --daemonize`)
3. Waits for the mount to become ready, then drops you into a REPL

## Environment variables

| Variable | Description |
|----------|-------------|
| `MESA_ORG` | Your Mesa organization slug |
| `MESA_API_KEY` | Mesa API key with at least `write` scope ([get one here](https://mesa.dev)) — the short-lived token minted for the sandbox cannot exceed the key's scopes |
| `VERCEL_TEAM_ID` | Vercel team ID ([get one here](https://vercel.com/)) |
| `VERCEL_PROJECT_ID` | Vercel project ID ([get one here](https://vercel.com/)) |
| `VERCEL_TOKEN` | Vercel token ([get one here](https://vercel.com/)) |

## Requirements

- Node.js >= 18
- Mesa account with an API key
- Vercel account and access tokens
