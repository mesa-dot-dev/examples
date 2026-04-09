# just-bash-mastra

AI agent (Claude) with bash access to a [Mesa](https://mesa.dev) repo, built with [Mastra](https://mastra.ai).

Same functionality as [just-bash-ai-sdk](../just-bash-ai-sdk), but using Mastra's `Agent` class with `createTool` and the built-in model router for Anthropic.

## Quick start

```bash
npm install

# Create a .env in this directory (gitignored)
cp .env.example .env

# Now populate your .env file with the required values

# Run
npm start
```

## How it works

1. `Mesa` client initializes a virtual filesystem via `mesa.fs.mount()` (native Rust via NAPI)
2. `mesaFs.bash()` returns a bash instance backed by the virtual filesystem
3. A `bash` tool is defined using Mastra's `createTool()`
4. Mastra's `Agent` class wraps the model + tools, streaming reasoning, tool calls, and text to the terminal

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
