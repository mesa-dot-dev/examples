# just-bash-langchain

AI agent (Claude) with bash access to a [Mesa](https://mesa.dev) repo, built with [LangChain](https://js.langchain.com).

Same functionality as [just-bash-ai-sdk](../just-bash-ai-sdk), but using LangChain's `createAgent` with `tool` and the LangGraph runtime for streaming.

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
3. A `bash` tool is defined using LangChain's `tool()`
4. `createAgent()` wires up the model + tools into a LangGraph runtime that handles the tool-calling loop
5. Dual-stream mode: `"values"` gives canonical history for the next turn, `"messages"` gives token-level chunks for the UI

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
