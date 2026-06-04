import { getSandboxStatus } from '@/lib/sandbox';
import { ensureDemoSession, subscribeToDemoEvents } from '@/lib/session';
import type { ServerEvent } from '@/lib/events';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  await ensureDemoSession();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: ServerEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const sendSandboxStatus = () => {
        const sandbox = getSandboxStatus();
        send({ type: 'sandbox', status: sandbox.status, repoPath: sandbox.repoPath });
      };

      const unsubscribe = subscribeToDemoEvents(send);
      const statusInterval = setInterval(sendSandboxStatus, 2000);
      const close = () => {
        unsubscribe();
        clearInterval(statusInterval);
      };

      send({ type: 'connected' });
      sendSandboxStatus();
      request.signal.addEventListener('abort', close, { once: true });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
