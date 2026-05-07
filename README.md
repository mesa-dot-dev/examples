# Mesa Examples

Example projects showing how to use [Mesa](https://mesa.dev). Each subdirectory is a self-contained project with its own dependencies, `.env.example`, and README.

To get started, pick an example, `cd` into it, and follow its README:

```bash
cd just-bash-shell
npm install
cp .env.example .env
# populate .env with your keys
npm start
```

## just-bash (App-level Mesa virtual filesystem)

These examples use the `@mesadev/sdk` to mount a Mesa repo as a virtual filesystem. You get `ls`, `cat`, `grep`, `find`, and every other bash command against files in a Mesa repo. No cloning, no sandbox needed.

| Example | Description |
|---------|-------------|
| [just-bash-shell](just-bash-shell/) | Interactive bash REPL over a Mesa repo. No AI, just bash. |
| [just-bash-ai-sdk](just-bash-ai-sdk/) | AI agent with bash access, built with the Vercel AI SDK |
| [just-bash-mastra](just-bash-mastra/) | AI agent with bash access, built with Mastra |
| [just-bash-langchain](just-bash-langchain/) | AI agent with bash access, built with LangChain |

## Cloud sandboxes (OS-level Mesa virtual filesystem)

These examples mount Mesa repos inside cloud sandboxes using the Mesa CLI. The CLI runs a FUSE filesystem inside the sandbox. The repo's files appear as a normal directory.

| Example | Description |
|---------|-------------|
| [runloop-shell](runloop-shell/) | Interactive shell in a Runloop devbox |
| [daytona-shell](daytona-shell/) | Interactive shell in a Daytona sandbox (TypeScript) |
| [daytona-python-shell](daytona-python-shell/) | Interactive shell in a Daytona sandbox (Python) |
| [blaxel-shell](blaxel-shell/) | Interactive shell in a Blaxel sandbox |
| [e2b-shell](e2b-shell/) | Interactive shell in an E2B sandbox |
| [sprites-shell](sprites-shell/) | Interactive shell in a Sprites sandbox |
| [superserve-shell](superserve-shell/) | Interactive shell in a Superserve sandbox |

## Other

| Example | Description |
|---------|-------------|
| [change-management](change-management/) | Create changes and bookmarks programmatically |
