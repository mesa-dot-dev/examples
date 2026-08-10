import { Mesa, type MesaFileSystem, type MesaFileSystemSubscription, type WatchEvent } from '@mesadev/sdk';
import { MESA_ORG, MESA_PRIVATE_KEY, MESA_REPO } from './env';
import type { ServerEvent } from './events';
import { ensureSandbox } from './sandbox';

export const DEMO_FILE = 'index.html';
const DEMO_FILE_PATH = `/${MESA_ORG}/${MESA_REPO}/${DEMO_FILE}`;

type EventSender = (event: ServerEvent) => void;

interface SessionStore {
  fs: MesaFileSystem | null;
  subscription: MesaFileSystemSubscription | null;
  subscribers: Set<EventSender>;
  initPromise: Promise<void> | null;
}

declare global {
  var __mesaSession: SessionStore | undefined;
}

const store = (globalThis.__mesaSession ??= {
  fs: null,
  subscription: null,
  subscribers: new Set<EventSender>(),
  initPromise: null,
});

export async function ensureDemoSession(): Promise<void> {
  if (store.fs) return;
  store.initPromise ??= (async () => {
    const mesa = new Mesa({ privateKey: MESA_PRIVATE_KEY });
    const fs = await mesa.fs.mount({
      authors: [{ name: 'Realtime App', email: 'realtime@example.com' }],
      repos: [{ name: MESA_REPO, bookmark: 'main' }],
    });
    await fs.change.edit({ repo: MESA_REPO, bookmark: 'main' });

    const subscription = fs.subscribe((event: WatchEvent) => {
      for (const send of store.subscribers) {
        send({ type: 'file-change', path: event.path, recursive: event.recursive });
      }
    });

    store.fs = fs;
    store.subscription = subscription;
    await ensureSandbox(MESA_PRIVATE_KEY);
  })();
  await store.initPromise;
}

export function subscribeToDemoEvents(send: EventSender): () => void {
  if (!store.fs) throw new Error('Demo session has not been initialized');
  store.subscribers.add(send);
  return () => {
    store.subscribers.delete(send);
  };
}

export async function readDemoFile(): Promise<string> {
  await ensureDemoSession();
  if (!store.fs) throw new Error('Demo session has not been initialized');
  return store.fs.readFile(DEMO_FILE_PATH, 'utf-8');
}

export async function writeDemoFile(content: string): Promise<void> {
  await ensureDemoSession();
  if (!store.fs) throw new Error('Demo session has not been initialized');
  await store.fs.writeFile(DEMO_FILE_PATH, content, 'utf-8');
}
