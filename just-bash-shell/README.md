# just-bash-shell

Interactive bash shell over a [Mesa](https://mesa.dev) repo. No AI, no agent — just bash.

Connects to a Mesa repo via the SDK's virtual filesystem and gives you a `$` prompt. You type bash commands (`ls`, `cat`, `grep`, `find`, etc.), you see output — all against files in a Mesa repo, no cloning, no local disk.

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

1. `Mesa` client initializes a virtual filesystem via `mesa.fs.mount()` (native Rust via NAPI)
2. `mesaFs.bash()` returns a bash instance backed by the virtual filesystem
3. Commands run against the virtual filesystem — reads hit Mesa's cloud storage, writes stay in the session

## Environment variables

| Variable | Description |
|----------|-------------|
| `MESA_ORG` | Your Mesa organization slug |
| `MESA_REPO` | The repository to mount |
| `MESA_API_KEY` | Mesa API key ([get one here](https://mesa.dev)) |

## Requirements

- Node.js >= 18
- Mesa account with an API key
