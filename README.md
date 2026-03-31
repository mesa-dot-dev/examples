# Mesa Examples

Example projects showing how to use [Mesa](https://mesa.dev). Each subdirectory is a self-contained project you can run independently.

## Setup

```bash
npm install
```

Create a `.env` file at the repo root (see `.env.example`):

```
MESA_ADMIN_API_KEY=your_mesa_admin_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
```

Each example's start script uses `tsx --env-file=../../.env` to load it automatically — no `dotenv` package needed.

## just-bash

These examples use Mesa's cloud filesystem with [just-bash](https://github.com/vercel-labs/just-bash). The [`@mesadev/sdk`](https://www.npmjs.com/package/@mesadev/sdk) provides a `MesaFileSystem` that implements the just-bash `IFileSystem` interface, backed by Mesa's native Rust addon. You get `ls`, `cat`, `grep`, `find`, and every other bash command — against files in a Mesa repo, no cloning, no local disk.

### `just-bash-shell` — Interactive bash over a Mesa repo

The simplest possible example. Connects to a Mesa repo and gives you a `$` prompt. You type bash commands, you see output. No AI, no agent — just bash.

```bash
cd packages/just-bash-shell
npm start -- <org> <repo>
```

```
$ ls
README.md  package.json  src/
$ cat package.json | jq '.name'
"my-project"
$ exit
```

~85 lines of TypeScript. Dependencies: `@mesadev/sdk`.

### `just-bash-ai-sdk` — AI agent with bash access (Vercel AI SDK)

An AI agent (Claude) that can run bash commands to explore and answer questions about a Mesa repo. Uses the [Vercel AI SDK](https://sdk.vercel.ai)'s `streamText` and `fullStream` to render reasoning, tool calls, and text as the agent works.

```bash
cd packages/just-bash-ai-sdk
npm start -- <org> <repo>
```

```
> what languages is this project written in?
[bash] find . -name "*.ts" -o -name "*.js" -o -name "*.py" | head -20
src/index.ts
src/utils.ts
[exit 0]

This project is written in TypeScript.

> exit
```

~200 lines of TypeScript. Dependencies: `@mesadev/sdk`, `ai`, `@ai-sdk/anthropic`, `zod`.

### `just-bash-mastra` — AI agent with bash access (Mastra)

The same AI agent implemented using [Mastra](https://mastra.ai). Uses Mastra's `Agent` class with `createTool` and the built-in model router for Anthropic.

```bash
cd packages/just-bash-mastra
npm start -- <org> <repo>
```

~180 lines of TypeScript. Dependencies: `@mesadev/sdk`, `@mastra/core`, `zod`.

### `just-bash-langchain` — AI agent with bash access (LangChain)

The same AI agent implemented using [LangChain](https://js.langchain.com). Uses LangChain's `createAgent` with `tool` and streams updates via the LangGraph runtime.

```bash
cd packages/just-bash-langchain
npm start -- <org> <repo>
```

~220 lines of TypeScript. Dependencies: `@mesadev/sdk`, `langchain`, `@langchain/anthropic`, `zod`.

## How it works

1. `Mesa` client creates a scoped API key and initializes `MesaFileSystem` (native Rust via NAPI)
2. `mesaFs.bash()` returns a just-bash `Bash` instance backed by the Mesa filesystem
3. Commands run against the virtual filesystem — reads hit Mesa's cloud storage, writes stay in the session

The agent examples add one more layer:

4. A `bash` tool is defined using each framework's tool API
5. The agent runs Claude in a tool loop, streaming events (tool calls, text) to the terminal

## Project structure

```
├── .env                          # shared secrets (gitignored)
├── .env.example
├── package.json                  # npm workspaces root
├── tsconfig.json                 # shared base TS config
├── packages/
│   ├── just-bash-shell/          # bare bash REPL
│   │   ├── package.json
│   │   └── index.ts
│   ├── just-bash-ai-sdk/         # AI agent — Vercel AI SDK
│   │   ├── package.json
│   │   └── index.ts
│   ├── just-bash-mastra/         # AI agent — Mastra
│   │   ├── package.json
│   │   └── index.ts
│   └── just-bash-langchain/      # AI agent — LangChain
│       ├── package.json
│       └── index.ts
```

## Requirements

- Node.js >= 18
- Mesa account with an admin API key
- Anthropic API key (for the agent examples)
