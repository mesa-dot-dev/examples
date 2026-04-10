# sprites-shell

Interactive shell over repos in a [Mesa](https://mesa.dev) org running inside a [Sprites](https://sprites.dev) sandbox, written in TypeScript.

Spins up a disposable Sprite, installs Mesa, mounts your org's repos via FUSE, and drops you into a minimal shell. Commands execute inside the sprite against the mounted filesystem.

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
Starting sprite...
Mounting your-org...
Connected to /mnt/mesa/your-org. Type "exit" or Ctrl+C to quit.

$ ls
repo-one  repo-two  repo-three
$ cd repo-one
$ ls
README.md  src/  package.json
$ exit
Cleaning up sprite...
Bye!
```

## How it works

1. Creates a disposable Sprite via the Sprites SDK
2. Installs Mesa CLI and FUSE inside the sprite
3. Starts the FUSE daemon (`mesa mount --daemonize`) with your org credentials
4. Drops you into a REPL rooted at the mounted org directory

## Environment variables

| Variable | Description |
|----------|-------------|
| `MESA_ORG` | Your Mesa organization slug |
| `MESA_API_KEY` | Mesa API key ([get one here](https://mesa.dev)) |
| `SPRITES_TOKEN` | Sprites token ([get one here](https://sprites.dev)) |

## Requirements

- Node.js >= 18
- Mesa account with an API key
- Sprites account with a token
