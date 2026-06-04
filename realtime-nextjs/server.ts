import { createServer } from 'node:http';
import { parse } from 'node:url';
import type { PtyHandle } from '@daytonaio/sdk';
import next from 'next';
import { WebSocket, WebSocketServer } from 'ws';
import { createSandboxPty, destroySandbox } from './lib/sandbox';

const app = next({ dev: process.env.NODE_ENV !== 'production' });
const handle = app.getRequestHandler();

function handleTerminalConnection(ws: WebSocket) {
  let pty: PtyHandle | null = null;
  let cols = 120;
  let rows = 30;
  const decoder = new TextDecoder();

  const openPty = async () => {
    if (pty) return pty;
    pty = await createSandboxPty({
      cols,
      rows,
      onData: (data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(decoder.decode(data, { stream: true }));
        }
      },
    });
    return pty;
  };

  ws.on('message', async (data, isBinary) => {
    if (isBinary) return;

    const text = data.toString();
    if (text.startsWith('resize:')) {
      [, cols, rows] = text.split(':').map(Number);
      if (pty) {
        await pty.resize(cols, rows);
      } else {
        await openPty();
      }
      return;
    }

    const activePty = await openPty();
    await activePty.sendInput(text);
  });

  ws.on('close', () => {
    decoder.decode();
    void pty?.disconnect();
  });
}

await app.prepare();

const server = createServer((req, res) => {
  handle(req, res, parse(req.url!, true));
});
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const { pathname } = parse(req.url!, true);
  if (pathname !== '/ws/terminal') {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, handleTerminalConnection);
});

server.listen(3000, () => {
  console.log('> Ready on http://localhost:3000');
});

const shutdown = async () => {
  console.log('\n[server] Shutting down...');
  await destroySandbox();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
