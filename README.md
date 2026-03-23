# mesa-just-bash-example

Example projects showing how to use [Mesa's](https://mesa.dev) cloud filesystem with [just-bash](https://github.com/vercel-labs/just-bash).

The [`@mesadev/sdk`](https://www.npmjs.com/package/@mesadev/sdk) provides a `MesaFileSystem` that implements the just-bash `IFileSystem` interface, backed by Mesa's native Rust addon. You get `ls`, `cat`, `grep`, `find`, and every other bash command — against files in a Mesa repo, no cloning, no local disk.

## Setup

```bash
npm install
```

Create a `.env` file at the repo root (see `.env.example`):

```
MESA_ADMIN_API_KEY=your_mesa_admin_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
```

## Examples

### `shell` — Interactive bash over a Mesa repo

The simplest possible example. Connects to a Mesa repo and gives you a `$` prompt. You type bash commands, you see output. No AI, no agent — just bash.

```bash
cd examples/shell
npm start -- <org> <repo>
```

```
$ ls
README.md  package.json  src/
$ cat package.json | jq '.name'
"my-project"
$ exit
```

~90 lines of TypeScript. Dependencies: `@mesadev/sdk`, `dotenv`.

### `agent` — AI agent with bash access

An AI agent (Claude) that can run bash commands to explore and answer questions about a Mesa repo. Uses the Vercel AI SDK's `fullStream` to render reasoning, tool calls, and text as the agent works.

```bash
cd examples/agent
npm start -- <org> <repo>
```

```
> what languages is this project written in?
[bash] find . -name "*.ts" -o -name "*.js" -o -name "*.py" | head -20
src/index.ts
src/utils.ts
[exit 0]

This project is written in TypeScript.

> find all TODO comments
> summarize the project structure
> exit
```

~200 lines of TypeScript. Dependencies: `@mesadev/sdk`, `ai`, `@ai-sdk/anthropic`, `zod`, `dotenv`.

## How it works

1. `Mesa` client creates a scoped API key and initializes `MesaFileSystem` (native Rust via NAPI)
2. `mesaFs.bash()` returns a just-bash `Bash` instance backed by the Mesa filesystem
3. Commands run against the virtual filesystem — reads hit Mesa's cloud storage, writes stay in the session

The `agent` example adds one more layer:

4. A `bash` tool is defined inline using the AI SDK's `tool()` helper
5. `streamText` runs Claude in a tool loop, streaming `fullStream` events (reasoning, tool calls, text) to the terminal

## Project structure

```
├── .env                          # shared secrets (gitignored)
├── .env.example
├── package.json                  # npm workspaces root
├── tsconfig.json                 # shared base TS config
├── examples/
│   ├── shell/                    # bare bash REPL
│   │   ├── package.json
│   │   └── src/index.ts
│   └── agent/                    # AI agent with streaming
│       ├── package.json
│       └── src/index.ts
```

## Requirements

- Node.js >= 18
- Mesa account with an admin API key
- Anthropic API key (for the `agent` example only)
