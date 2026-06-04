'use client';

import { useEffect, useRef, useState } from 'react';
import TerminalView from '@/components/terminal';
import type { MesaEvent, SandboxStatus, ServerEvent } from '@/lib/events';

const DEFAULT_FILE = 'index.html';

export default function Home() {
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [events, setEvents] = useState<MesaEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [sandboxStatus, setSandboxStatus] = useState<SandboxStatus>('idle');
  const eventsEndRef = useRef<HTMLDivElement>(null);

  const addEvent = (event: MesaEvent) => {
    setEvents((prev) => [...prev.slice(-99), event]);
  };

  const loadFile = async () => {
    const res = await fetch('/api/file');
    if (!res.ok) throw new Error('Failed to load file');
    const { content: c } = await res.json();
    setContent(c);
    setDirty(false);
  };

  useEffect(() => {
    const es = new EventSource('/api/events');

    es.onmessage = (msg) => {
      const data = JSON.parse(msg.data) as ServerEvent;

      if (data.type === 'connected') {
        setConnected(true);
        void loadFile();
      }

      if (data.type === 'file-change') {
        void loadFile();
      }

      if (data.type === 'sandbox') {
        setSandboxStatus(data.status);
      }

      addEvent({ ...data, timestamp: Date.now() });
    };

    return () => es.close();
  }, []);
  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  const handleSave = async () => {
    if (!connected) return;
    const res = await fetch('/api/file', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error('Failed to save file');
    setDirty(false);
    addEvent({ type: 'local-save', timestamp: Date.now() });
  };

  return (
    <main className="h-screen flex flex-col">
      <header className="shrink-0 border-b border-zinc-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold">Mesa Realtime</h1>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-yellow-400 animate-pulse'}`} />
            <span className="text-xs text-zinc-500">{connected ? 'connected' : 'connecting'}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">sandbox: {sandboxStatus}</span>
          <div className="bg-zinc-800 rounded-full px-2.5 py-0.5 text-xs">watching files</div>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 min-h-0">
        <section className="min-h-0 flex flex-col bg-[#09090b] border-b lg:border-b-0 lg:border-r border-zinc-800">
          <div className="shrink-0 px-4 py-3 border-b border-zinc-800/70">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-normal text-zinc-300">Sandbox Terminal</span>
              <span className="text-[11px] text-zinc-600">Daytona PTY</span>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              This is an interactive shell inside the Daytona sandbox, starting in the Mesa-mounted repo. Run{' '}
              <span className="font-mono text-zinc-300">claude</span> here to edit files through FUSE.
            </p>
          </div>
          <div className="flex-1 min-h-0">
            {sandboxStatus !== 'ready' ? (
              <div className="flex items-center justify-center h-full text-xs text-zinc-600">
                Waiting for sandbox...
              </div>
            ) : (
              <TerminalView />
            )}
          </div>
        </section>

        <section className="min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 flex flex-col border-b border-zinc-800">
            <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-zinc-800/50">
              <span className="text-xs text-zinc-500 font-mono">{DEFAULT_FILE}</span>
              <button
                onClick={handleSave}
                disabled={!dirty || !connected}
                className="px-2.5 py-1 text-xs rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                {dirty ? 'Save' : 'Saved'}
              </button>
            </div>
            <textarea
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setDirty(true);
              }}
              disabled={!connected}
              className="flex-1 bg-transparent p-4 font-mono text-sm resize-none focus:outline-none disabled:opacity-40"
              placeholder={connected ? '' : 'Connecting...'}
              spellCheck={false}
            />
          </div>

          <div className="h-36 shrink-0 flex flex-col">
            <div className="shrink-0 px-4 py-2 border-b border-zinc-800/50">
              <span className="text-xs text-zinc-500">Events</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px] space-y-0.5">
              {events.length === 0 && <p className="text-zinc-700">Waiting for events...</p>}
              {events.map((event, i) => (
                <div key={i} className="flex gap-1.5">
                  <span className="text-zinc-700 shrink-0">{new Date(event.timestamp).toLocaleTimeString()}</span>
                  <span className="text-zinc-500">{event.type}</span>
                  <span className="text-zinc-600">
                    {'path' in event ? event.path : 'status' in event ? event.status : ''}
                  </span>
                </div>
              ))}
              <div ref={eventsEndRef} />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
