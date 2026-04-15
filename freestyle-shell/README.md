# e2b-shell

Interactive shell over repos in a [Mesa](https://mesa.dev) org running inside a [Freestyle](https://freestyle.sh) sandbox, written in TypeScript.

Spins up a Freestyle sandbox, installs Mesa, mounts your org's repos via FUSE, and drops you into a minimal shell. Commands execute inside the sandbox against the mounted filesystem.

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
Creating Freestyle sandbox...
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

1. Creates a Freestyle sandbox with a 1-hour timeout
2. Installs Mesa CLI and FUSE inside the sandbox
3. Starts the FUSE daemon (`mesa mount --daemonize`) with your org credentials
4. Drops you into a REPL rooted at the mounted org directory

## Environment variables

| Variable | Description |
|----------|-------------|
| `MESA_ORG` | Your Mesa organization slug |
| `MESA_API_KEY` | Mesa API key ([get one here](https://mesa.dev)) |
| `FREESTYLE_API_KEY` | Freestyle API key ([get one here](https://freestyle.sh)) |

## Requirements

- Node.js >= 18
- Mesa account with an API key
- Freestyle account with an API key
