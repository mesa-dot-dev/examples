import { Buffer } from 'node:buffer';
import { Daytona, type PtyHandle, type Sandbox } from '@daytonaio/sdk';
import { ANTHROPIC_API_KEY, MESA_ORG, MESA_REPO } from './env';
import type { SandboxStatus } from './events';

const DAYTONA_HOME = '/home/daytona';
const MOUNT_POINT = `${DAYTONA_HOME}/.local/share/mesa/mnt`;
const REPO_PATH = `${MOUNT_POINT}/${MESA_ORG}/${MESA_REPO}`;

interface SandboxState {
  sandbox: Sandbox | null;
  initPromise: Promise<void> | null;
}

declare global {
  var __sandboxState: SandboxState | undefined;
}

const state = (globalThis.__sandboxState ??= {
  sandbox: null,
  initPromise: null,
});

export function getSandboxStatus() {
  const status: SandboxStatus = state.sandbox ? 'ready' : state.initPromise ? 'creating' : 'idle';
  return {
    status,
    repoPath: REPO_PATH,
  };
}

export async function ensureSandbox(mesaApiKey: string): Promise<void> {
  if (state.sandbox) return;
  state.initPromise ??= (async () => {
    console.log('[sandbox] Creating Daytona sandbox...');
    const daytona = new Daytona();
    const sandbox = await daytona.create({
      name: `mesa-realtime-nextjs-${Date.now()}`,
      envVars: { ANTHROPIC_API_KEY },
    });

    try {
      // Install and configure Claude Code
      await sandbox.process.executeCommand(`npm install -g --prefix ${DAYTONA_HOME}/.local @anthropic-ai/claude-code`);
      await sandbox.fs.createFolder(`${DAYTONA_HOME}/.claude`, '755');
      await sandbox.fs.uploadFile(
        Buffer.from(
          JSON.stringify(
            {
              hasCompletedOnboarding: true,
              projects: {
                [REPO_PATH]: {
                  hasTrustDialogAccepted: true,
                  hasCompletedProjectOnboarding: true,
                  projectOnboardingSeenCount: 1,
                },
              },
            },
            null,
            2
          )
        ),
        `${DAYTONA_HOME}/.claude.json`
      );

      // Install Mesa CLI and enable FUSE
      await sandbox.process.executeCommand('curl -fsSL https://mesa.dev/install.sh | sh');
      await sandbox.process.executeCommand("sudo sed -i 's/^#user_allow_other/user_allow_other/' /etc/fuse.conf");

      // Mount Mesa and switch to the main bookmark
      await sandbox.process.executeCommand('mesa mount -d -y', undefined, { MESA_ORGS: `${MESA_ORG}:${mesaApiKey}` });
      await sandbox.process.executeCommand('mesa edit main', REPO_PATH);

      state.sandbox = sandbox;
      console.log(`[sandbox] Ready. Repo: ${REPO_PATH}`);
    } catch (err) {
      await sandbox.delete();
      state.initPromise = null;
      throw err;
    }
  })();
  await state.initPromise;
}

export async function createSandboxPty(options: {
  cols?: number;
  rows?: number;
  onData: (data: Uint8Array) => void | Promise<void>;
}): Promise<PtyHandle> {
  if (!state.sandbox) throw new Error('Sandbox not ready');

  const pty = await state.sandbox.process.createPty({
    id: crypto.randomUUID(),
    cwd: REPO_PATH,
    cols: options.cols,
    rows: options.rows,
    envs: {
      TERM: 'xterm-256color',
      ANTHROPIC_API_KEY,
    },
    onData: options.onData,
  });
  await pty.waitForConnection();
  return pty;
}

export async function destroySandbox(): Promise<void> {
  if (state.sandbox) {
    console.log('[sandbox] Destroying...');
    await state.sandbox.delete();
    state.sandbox = null;
    state.initPromise = null;
  }
}
