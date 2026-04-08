# daytona-python-shell

Interactive shell over repos in a [Mesa](https://mesa.dev) org running inside a [Daytona](https://daytona.io) sandbox, written in Python.

Spins up a Daytona sandbox, installs the Mesa CLI, mounts your org's repos via FUSE, and drops you into a minimal shell. Commands execute inside the sandbox against the mounted filesystem.

## Quick start

```bash
# Install uv if you don't have it
curl -LsSf https://astral.sh/uv/install.sh | sh

# Create a .env in this directory (gitignored)
cp .env.example .env

# Now populate your .env file with the required API keys

# Run
uv run main.py
```

```
Creating Daytona sandbox...
Installing Mesa...
Configuring FUSE...
Mounting Mesa...
Connected to your-org. Type 'exit' or Ctrl+D to quit.

$ ls
repo-one  repo-two  repo-three
$ cd repo-one
$ ls
README.md  src/  package.json
$ cat README.md
# My Project
...
$ exit
Cleaning up sandbox...
Bye!
```

## How it works

1. Creates a Daytona sandbox (default image)
2. Installs the [Mesa CLI](https://docs.mesa.dev/content/virtual-filesystem/os-level) inside the sandbox
3. Configures FUSE (`user_allow_other`) so Mesa can serve the mount
4. Runs `mesa mount -d -y` with your org and API key to start the FUSE daemon
5. Drops you into a REPL where commands run inside the sandbox via `sandbox.process.exec()`

The REPL (`repl.py`) tracks your working directory and handles `cd`, `~` expansion, and relative paths.

## Files

| File | Description |
|------|-------------|
| `main.py` | Sandbox setup, Mesa installation and mount |
| `repl.py` | Tiny REPL with `cd` and tilde expansion |
| `pyproject.toml` | Dependencies: `daytona`, `mesa-sdk`, `python-dotenv` |

## Environment variables

| Variable | Description |
|----------|-------------|
| `MESA_ORG` | Your Mesa organization slug |
| `MESA_API_KEY` | Mesa API key ([get one here](https://mesa.dev)) |
| `DAYTONA_API_KEY` | Daytona API key ([get one here](https://app.daytona.io)) |

## Requirements

- Python >= 3.11
- [uv](https://docs.astral.sh/uv/) (recommended) or pip
