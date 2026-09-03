import { Buffer } from 'node:buffer';
import { Daytona, Image, type PtyHandle, type Sandbox } from '@daytona/sdk';
import { type Mesa, repo } from '@mesadev/sdk';
import { ANTHROPIC_API_KEY, MESA_REPO } from './env';
import type { SandboxStatus } from './events';

const DAYTONA_HOME = '/home/daytona';
const MOUNT_POINT = `${DAYTONA_HOME}/.local/share/mesa/mnt`;
const image = Image.base('daytonaio/sandbox:0.10.0').runCommands(
  'curl --retry 5 --retry-all-errors -fsSL https://mesa.dev/install.sh -o /tmp/install-mesa.sh && sudo sh /tmp/install-mesa.sh --version 0.46.0 --yes && rm /tmp/install-mesa.sh',
  'grep -qxF user_allow_other /etc/fuse.conf || echo user_allow_other | sudo tee -a /etc/fuse.conf >/dev/null',
  'mesa --version && test -x /usr/bin/zsh && npm --version && claude --version'
);

interface SandboxState {
  sandbox: Sandbox | null;
  initPromise: Promise<void> | null;
  repoPath: string | null;
}

declare global {
  var __sandboxState: SandboxState | undefined;
}

const state = (globalThis.__sandboxState ??= {
  sandbox: null,
  initPromise: null,
  repoPath: null,
});

export function getSandboxStatus() {
  const status: SandboxStatus = state.sandbox ? 'ready' : state.initPromise ? 'creating' : 'idle';
  return {
    status,
    repoPath: state.repoPath,
  };
}

async function executeCommand(sandbox: Sandbox, command: string, cwd?: string, timeout?: number): Promise<string> {
  const response = await sandbox.process.executeCommand(command, cwd, undefined, timeout);
  if (response.exitCode !== 0) {
    throw new Error(`Sandbox command failed (${response.exitCode}): ${command}\n${response.result}`);
  }
  return response.result;
}

export async function ensureSandbox(mesa: Mesa): Promise<void> {
  if (state.sandbox) return;
  state.initPromise ??= (async () => {
    let sandbox: Sandbox | null = null;
    try {
      // A layout mount presents exactly its declared paths, so the repo lives
      // at the layout path rather than under the org browse tree.
      const repoPath = `${MOUNT_POINT}/workspace`;
      // The layout is both what the mount presents and what the token is scoped
      // to. Minting happens on the trusted host; the signing private key never
      // enters the sandbox.
      const workspace = mesa.fs({
        layout: { '/workspace': repo(MESA_REPO, { mode: 'rw' }) },
        authors: [{ name: 'Realtime Agent', email: 'agent@example.com' }],
        ttl: 60 * 60,
      });
      const { token } = await workspace.token();

      console.log('[sandbox] Creating Daytona sandbox...');
      const daytona = new Daytona();
      sandbox = await daytona.create(
        {
          name: `mesa-realtime-nextjs-${Date.now()}`,
          image,
          ephemeral: true,
          ttlMinutes: 30, // 30 minutes
          envVars: {
            ANTHROPIC_API_KEY,
            MESA_ACCESS_TOKEN: token,
          },
        },
        {
          timeout: 10 * 60, // 10 minutes
          onSnapshotCreateLogs: console.log,
        }
      );

      // Configure Claude Code
      await sandbox.fs.createFolder(`${DAYTONA_HOME}/.claude`, '755');
      await sandbox.fs.uploadFile(
        Buffer.from(
          JSON.stringify(
            {
              hasCompletedOnboarding: true,
              projects: {
                [repoPath]: {
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

      await executeCommand(sandbox, `cat > /tmp/layout.json <<'MESA_LAYOUT'\n${workspace.layout()}\nMESA_LAYOUT`);
      await executeCommand(sandbox, 'mesa mount --daemonize --layout /tmp/layout.json');
      await executeCommand(
        sandbox,
        `for attempt in $(seq 1 60); do if test -d ${JSON.stringify(repoPath)} && test -r ${JSON.stringify(repoPath)} && test -w ${JSON.stringify(repoPath)}; then exit 0; fi; sleep 1; done; echo 'Mesa repo did not become ready: ${repoPath}' >&2; exit 1`,
        undefined,
        90 // 90 seconds
      );
      await executeCommand(sandbox, 'mesa edit main', repoPath);

      state.sandbox = sandbox;
      state.repoPath = repoPath;
      console.log(`[sandbox] Ready. Repo: ${repoPath}`);
    } catch (err) {
      if (sandbox) {
        try {
          await sandbox.delete();
        } catch (cleanupError) {
          console.error('[sandbox] Cleanup failed after setup error:', cleanupError);
        }
      }
      throw err;
    } finally {
      state.initPromise = null;
      if (!state.sandbox) state.repoPath = null;
    }
  })();
  await state.initPromise;
}

export async function createSandboxPty(options: {
  cols?: number;
  rows?: number;
  onData: (data: Uint8Array) => void | Promise<void>;
}): Promise<PtyHandle> {
  if (!state.sandbox || !state.repoPath) throw new Error('Sandbox not ready');

  const pty = await state.sandbox.process.createPty({
    id: crypto.randomUUID(),
    cwd: state.repoPath,
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
  const sandbox = state.sandbox;
  if (!sandbox) return;

  state.sandbox = null;
  state.initPromise = null;
  state.repoPath = null;
  console.log('[sandbox] Destroying...');
  await sandbox.delete();
}
