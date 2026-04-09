# just-bash-ai-sdk

AI agent (Claude) with bash access to a [Mesa](https://mesa.dev) repo, built with the [Vercel AI SDK](https://sdk.vercel.ai).

The agent can run bash commands (`ls`, `cat`, `grep`, `find`, etc.) to explore and answer questions about a repo — all against files in Mesa's cloud storage, no cloning, no local disk.

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
Connected. You can now chat with the agent about your-org/your-repo.
Type "exit" or Ctrl+C to quit.

> what languages is this project written in?
[bash] find . -name "*.ts" -o -name "*.js" -o -name "*.py" | head -20
src/index.ts
src/utils.ts

This project is written in TypeScript.

> exit
```

## How it works

1. `Mesa` client initializes a virtual filesystem via `mesa.fs.mount()` (native Rust via NAPI)
2. `mesaFs.bash()` returns a bash instance backed by the virtual filesystem
3. A `bash` tool is defined using the Vercel AI SDK's `tool()` function
4. `streamText()` runs Claude in a tool loop, streaming reasoning, tool calls, and text to the terminal

## Environment variables

| Variable | Description |
|----------|-------------|
| `MESA_ORG` | Your Mesa organization slug |
| `MESA_REPO` | The repository to mount |
| `MESA_API_KEY` | Mesa API key ([get one here](https://mesa.dev)) |
| `ANTHROPIC_API_KEY` | Anthropic API key ([get one here](https://console.anthropic.com)) |

## Requirements

- Node.js >= 18
- Mesa account with an API key
- Anthropic API key
