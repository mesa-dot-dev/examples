# daytona-python-shell

Interactive shell over a temporary [Mesa](https://mesa.dev) repo running inside a [Daytona](https://daytona.io) sandbox, written in Python.

Spins up a Daytona sandbox from an image with Mesa installed, creates and mounts a temporary repo via FUSE, and drops you into a minimal shell. Commands execute inside the sandbox against the mounted filesystem.

## Quick start

```bash
# Install uv if you don't have it
curl -LsSf https://astral.sh/uv/install.sh | sh

# Create a .env in this directory (gitignored)
cp .env.example .env

# Now populate your .env file with the required credentials

# Run
uv run main.py
```

```
Creating Daytona sandbox...
Mounting Mesa...
Connected to ~/.local/share/mesa/mnt/acme/daytona-123456789. Type 'exit' or Ctrl+D to quit.

$ printf 'Hello from Daytona and Mesa!\n' > hello.txt
$ cat hello.txt
Hello from Daytona and Mesa!
$ exit
Cleaning up sandbox and temporary repo...
Bye!
```

## How it works

1. Builds a Daytona image with Mesa and its FUSE configuration.
2. Creates a temporary Mesa repo and a Daytona sandbox.
3. Mints a 30-minute access token restricted to the temporary repo.
4. Passes `MESA_ORG` and `MESA_ACCESS_TOKEN` only to the `mesa mount` command. The private key never enters the sandbox.
5. Starts the FUSE daemon (`mesa mount --daemonize`), then drops you into a REPL in the mounted repo.
6. Deletes the sandbox and temporary repo when the shell exits.

By default, MesaFS mounts every repo the access token can access. Since this token is restricted to the temporary repo, that is the only repo in the mount.

The REPL (`repl.py`) tracks your working directory and handles `cd`, `~` expansion, and relative paths.

## Files

| File | Description |
|------|-------------|
| `main.py` | Sandbox setup, Mesa mount, and cleanup |
| `repl.py` | Tiny REPL with `cd` and tilde expansion |
| `pyproject.toml` | Dependencies: `daytona`, `mesa-sdk`, `python-dotenv` |

## Environment variables

| Variable | Description |
|----------|-------------|
| `MESA_PRIVATE_KEY` | Mesa signing private key stored only in the trusted host process |
| `DAYTONA_API_KEY` | Daytona API key ([get one here](https://app.daytona.io)) |

## Requirements

- Python >= 3.11
- [uv](https://docs.astral.sh/uv/) (recommended) or pip
