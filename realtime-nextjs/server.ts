import { createServer } from 'node:http';
import { parse } from 'node:url';
import type { PtyHandle } from '@daytona/sdk';
import next from 'next';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { createSandboxPty, destroySandbox } from './lib/sandbox';

const app = next({ dev: process.env.NODE_ENV !== 'production' });
const handle = app.getRequestHandler();

function handleTerminalConnection(ws: WebSocket) {
  let pty: PtyHandle | null = null;
  let ptyPromise: Promise<PtyHandle> | null = null;
  let cols = 120;
  let rows = 30;
  const decoder = new TextDecoder();

  const openPty = async () => {
    if (pty) return pty;
    ptyPromise ??= createSandboxPty({
      cols,
      rows,
      onData: (data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(decoder.decode(data, { stream: true }));
        }
      },
    })
      .then((handle) => (pty = handle))
      .finally(() => {
        ptyPromise = null;
      });
    return ptyPromise;
  };

  const handleMessage = async (data: RawData, isBinary: boolean) => {
    if (isBinary) return;

    const text = data.toString();
    if (text.startsWith('resize:')) {
      [, cols, rows] = text.split(':').map(Number);
      const activePty = await openPty();
      await activePty.resize(cols, rows);
      return;
    }

    const activePty = await openPty();
    await activePty.sendInput(text);
  };

  ws.on('message', (data, isBinary) => {
    void handleMessage(data, isBinary).catch((error) => {
      console.error('[terminal] Message failed:', error);
      ws.close(1011, 'Terminal command failed');
    });
  });

  ws.on('close', () => {
    decoder.decode();
    const activePty = pty ? Promise.resolve(pty) : ptyPromise;
    void activePty
      ?.then((handle) => handle.disconnect())
      .catch((error) => {
        console.error('[terminal] Disconnect failed:', error);
      });
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

let shutdownPromise: Promise<void> | null = null;
const shutdown = () => {
  shutdownPromise ??= (async () => {
    console.log('\n[server] Shutting down...');
    try {
      await destroySandbox();
      process.exit(0);
    } catch (error) {
      console.error('[server] Shutdown failed:', error);
      process.exit(1);
    }
  })();
  return shutdownPromise;
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
