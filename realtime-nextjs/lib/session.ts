import { Mesa, repo, type MesaFileSystem, type MesaFileSystemSubscription, type WatchEvent } from '@mesadev/sdk';
import { MESA_PRIVATE_KEY, MESA_REPO } from './env';
import type { ServerEvent } from './events';
import { ensureSandbox } from './sandbox';

export const DEMO_FILE = 'index.html';

type EventSender = (event: ServerEvent) => void;

interface SessionStore {
  fs: MesaFileSystem | null;
  subscription: MesaFileSystemSubscription | null;
  subscribers: Set<EventSender>;
  initPromise: Promise<void> | null;
  demoFilePath: string | null;
}

declare global {
  var __mesaSession: SessionStore | undefined;
}

const store = (globalThis.__mesaSession ??= {
  fs: null,
  subscription: null,
  subscribers: new Set<EventSender>(),
  initPromise: null,
  demoFilePath: null,
});

export async function ensureDemoSession(): Promise<void> {
  if (store.fs) return;
  store.initPromise ??= (async () => {
    let subscription: MesaFileSystemSubscription | null = null;
    try {
      const mesa = new Mesa({ privateKey: MESA_PRIVATE_KEY });
      const org = mesa.org.slug;
      const fs = await mesa
        .fs({
          layout: { [`/${org}/${MESA_REPO}`]: repo(MESA_REPO, { mode: 'rw', at: { bookmark: 'main' } }) },
          authors: [{ name: 'Realtime App', email: 'realtime@example.com' }],
        })
        .mount();
      await fs.change.edit({ repo: MESA_REPO, bookmark: 'main' });

      subscription = fs.subscribe((event: WatchEvent) => {
        for (const send of store.subscribers) {
          send({ type: 'file-change', path: event.path, recursive: event.recursive });
        }
      });

      await ensureSandbox(mesa, org);
      store.fs = fs;
      store.subscription = subscription;
      store.demoFilePath = `/${org}/${MESA_REPO}/${DEMO_FILE}`;
    } catch (error) {
      subscription?.unsubscribe();
      store.fs = null;
      store.subscription = null;
      store.demoFilePath = null;
      throw error;
    } finally {
      store.initPromise = null;
    }
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
  if (!store.fs || !store.demoFilePath) throw new Error('Demo session has not been initialized');
  return store.fs.readFile(store.demoFilePath, 'utf-8');
}

export async function writeDemoFile(content: string): Promise<void> {
  await ensureDemoSession();
  if (!store.fs || !store.demoFilePath) throw new Error('Demo session has not been initialized');
  await store.fs.writeFile(store.demoFilePath, content, 'utf-8');
}
