# change-management

Demo showing how to create [Mesa](https://mesa.dev) changes and bookmarks programmatically.

Creates a temporary repo in your org, sets up three changes — each with a different `README.md` — and three bookmarks (`a`, `b`, `c`) pointing to them, then tears it down. This demonstrates Mesa's change-based workflow: changes are like lightweight branches that track file modifications, and bookmarks are named pointers to them.

## Quick start

```bash
npm install

# Create a .env in this directory (gitignored)
cp .env.example .env

# Now populate your .env file with the required values

# Run — creates a temporary repo, sets up changes/bookmarks, then deletes it
npm start
```

```
creating repo change-mgmt-example-a1b2c3d4...
created change abc123, writing README.md = "hello a"
created bookmark: a
created change def456, writing README.md = "hello b"
created bookmark: b
created change 789abc, writing README.md = "hello c"
created bookmark: c

done! repo change-mgmt-example-a1b2c3d4 has three bookmarks:
  a -> README.md = "hello a"
  b -> README.md = "hello b"
  c -> README.md = "hello c"

cleaning up repo change-mgmt-example-a1b2c3d4...
deleted.
```

## How it works

1. Creates a temporary Mesa repo with a random name
2. Mounts the repo's virtual filesystem in read-write mode via `mesa.fs.mount()`
3. For each change: creates a new change on "main", writes a file, creates a bookmark
4. Each bookmark points to a different change with different file contents
5. Cleans up the repo in a `finally` block

## Environment variables

| Variable | Description |
|----------|-------------|
| `MESA_API_KEY` | Mesa API key ([get one here](https://mesa.dev)) |

## Requirements

- Node.js >= 18
- Mesa account with an API key
