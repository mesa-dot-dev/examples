# mesa-just-bash-example

Minimal interactive CLI agent that uses [Mesa's](https://mesa.dev) cloud filesystem with [just-bash](https://github.com/vercel-labs/just-bash).

An AI agent gets bash access to files in a Mesa repo — no cloning, no local disk. The [`@mesadev/sdk`](https://www.npmjs.com/package/@mesadev/sdk) provides a `MesaFileSystem` that implements the just-bash `IFileSystem` interface, backed by Mesa's native Rust addon. The agent can `ls`, `cat`, `grep`, `find`, and use any other bash command to explore and work with your repo.

## Setup

```bash
npm install
```

Create a `.env` file (see `.env.example`):

```bash
MESA_ADMIN_API_KEY=your_mesa_admin_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
```

## Usage

```bash
npx tsx src/index.ts <org> <repo>
```

For example:

```bash
npx tsx src/index.ts acme my-repo
```

This starts an interactive REPL. Ask the agent anything about the repo:

```
> what languages is this project written in?
> find all TODO comments
> summarize the project structure
> exit
```

## How it works

1. `Mesa` client creates a scoped API key and initializes `MesaFileSystem` (native Rust via NAPI)
2. `mesaFs.bash()` returns a just-bash `Bash` instance backed by the Mesa filesystem
3. `bash-tool` wraps that `Bash` instance as AI SDK tools (bash, readFile, writeFile)
4. `streamText` from the Vercel AI SDK runs Claude in a tool loop, streaming responses to the terminal

## Requirements

- Node.js >= 18
- Mesa account with an admin API key
- Anthropic API key
