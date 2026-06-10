# Mesa Realtime Next.js Demo

Real-time file editing with a sandboxed agent terminal. Shows Mesa file-watch
events flowing between an in-browser editor and a Daytona sandbox running Mesa
FUSE + Claude Code.

## What it does

- **File editor** — edit files stored in Mesa's virtual filesystem
- **Live events** — filesystem change events stream to the browser via SSE
- **Sandbox terminal** — full PTY in a Daytona sandbox, opened in the Mesa repo
- **Agent support** — run `claude` interactively; edits via FUSE trigger real-time events in the editor

## Quick start

```bash
cd packages/examples/realtime-nextjs
cp .env.example .env.local
# Fill in all values in .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The sandbox may take a bit to provision.

### The demo

1. The editor loads `index.html` from your Mesa repo
2. Edit and save — the file persists in Mesa
3. Once the sandbox is ready, use the terminal (it starts in your repo path)
4. Run `echo "hello from sandbox" > index.html` in the terminal — watch the editor update
5. Run `claude` in the terminal — watch the agent edit in real time

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `MESA_API_KEY` | Yes | Mesa API key with at least `write` scope — the short-lived token minted for the sandbox cannot exceed the key's scopes |
| `MESA_ORG` | Yes | Mesa organization name |
| `MESA_REPO` | Yes | Name of an existing repo in your org |
| `DAYTONA_API_KEY` | Yes | Daytona API key for sandbox creation |
| `ANTHROPIC_API_KEY` | Yes | Passed to Claude Code in the sandbox |

## Architecture

```
Browser                          Server                         Daytona Sandbox
┌──────────────┐                ┌──────────────┐               ┌──────────────┐
│ File Editor  │◄──SSE events───│ Mesa SDK     │               │ Mesa FUSE    │
│ xterm.js     │◄──WebSocket───►│ WS Bridge    │◄──Daytona───►│ ~/.local/... │
│ Event Feed   │                │ Daytona SDK  │   PTY API     │ Claude Code  │
└──────────────┘                └──────────────┘               └──────────────┘
```

The sandbox terminal starts in:

```text
/home/daytona/.local/share/mesa/mnt/$MESA_ORG/$MESA_REPO
```

## Requirements

- Node.js 20+
- [Mesa](https://mesa.dev) account + API key
- [Daytona](https://daytona.io) account + API key
- An existing repo in your Mesa org
