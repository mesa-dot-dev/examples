export type SandboxStatus = 'idle' | 'creating' | 'ready';

export type ServerEvent =
  | { type: 'connected' }
  | { type: 'file-change'; path: string; recursive: boolean }
  | { type: 'sandbox'; status: SandboxStatus; repoPath: string | null };

export type LocalEvent = { type: 'local-save' };
export type MesaEvent = (ServerEvent | LocalEvent) & { timestamp: number };
