# blaxel-shell

Interactive shell over repos in a [Mesa](https://mesa.dev) org running inside a [Blaxel](https://blaxel.ai) sandbox.

Spins up a Blaxel sandbox, installs the Mesa CLI (working around Alpine's lack of apt), mounts your org's repos via FUSE, and drops you into a minimal shell.

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
Creating Blaxel sandbox...
Installing Mesa CLI...
Mounting your-org...
Connected to your-org. Type "exit" or Ctrl+C to quit.

$ ls
repo-one  repo-two  repo-three
$ exit
Cleaning up sandbox...
Bye!
```

## How it works

1. Creates a Blaxel sandbox (Alpine-based, runs as root)
2. Installs Mesa CLI by extracting the `.deb` package directly (Alpine doesn't have apt)
   - Uses `gcompat` instead of `libc6-compat` to avoid gRPC deadlocks
3. Generates a scoped, short-lived API key for the sandbox
4. Writes a Mesa config file and starts the FUSE daemon
5. Waits for the mount to become ready, then drops you into a REPL

The code includes a commented-out Dockerfile showing how to build a custom Debian-based Blaxel image that avoids the Alpine workarounds.

## Environment variables

| Variable | Description |
|----------|-------------|
| `MESA_ORG` | Your Mesa organization slug |
| `MESA_API_KEY` | Mesa API key ([get one here](https://mesa.dev)) |
| `BL_API_KEY` | Blaxel API key |
| `BL_WORKSPACE` | Blaxel workspace name (read automatically by the Blaxel SDK) |

## Requirements

- Node.js >= 18
- Mesa account with an API key
- Blaxel account with an API key and workspace
