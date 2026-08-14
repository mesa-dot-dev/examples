# py-repl-app-mount

Interactive bash REPL over a [Mesa](https://mesa.dev) repo using the Mesa Python SDK. No AI, no agent, no sandbox, just bash through an app-level virtual filesystem mount.

Connects to a Mesa repo via `mesa.fs(layout=...).mount()` and gives you a `$` prompt. You type bash commands (`ls`, `cat`, `grep`, `find`, etc.), you see output, all against files in a Mesa repo with no cloning and no local disk checkout.

## Quick start

```bash
# Install uv if you don't have it
curl -LsSf https://astral.sh/uv/install.sh | sh

# Create a .env in this directory (gitignored)
cp .env.example .env

# Now populate your .env file with the required values

# Run
uv run main.py
```

```
Connecting to your-org/your-repo via Mesa...
Connected to your-org/your-repo.
Type "exit" or Ctrl+C to quit.

$ ls
README.md  src/  package.json
$ cat README.md
# My Project
...
$ exit
Bye!
```

## How it works

1. `Mesa` initializes a Python SDK client for your org.
2. `mesa.fs(layout=...).mount()` mounts the repo at the `main` bookmark as a virtual filesystem.
3. `mesa_fs.changes.new()` creates a working change from `main` for REPL edits.
4. `mesa_fs.bash()` returns a bash instance backed by the virtual filesystem.
5. After each command, the REPL callback moves the `main` bookmark to the working change.

## Files

| File | Description |
|------|-------------|
| `main.py` | Environment loading, Mesa client setup, and virtual filesystem mount |
| `repl.py` | Tiny async REPL that executes commands with `bash.exec()` |
| `pyproject.toml` | uv project metadata and dependencies |

## Environment variables

| Variable | Description |
|----------|-------------|
| `MESA_REPO` | The repository to mount |
| `MESA_PRIVATE_KEY` | Mesa signing private key ([get one here](https://mesa.dev)) |

## Requirements

- Python >= 3.10
- [uv](https://docs.astral.sh/uv/)
- Mesa account with a signing key
