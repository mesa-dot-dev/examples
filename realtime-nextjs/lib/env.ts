import { config } from 'dotenv';

config({ path: ['.env.local', '.env'], quiet: true });

export const MESA_PRIVATE_KEY =
  process.env.MESA_PRIVATE_KEY ??
  (() => {
    throw Error('$MESA_PRIVATE_KEY not set.');
  })();

export const MESA_REPO =
  process.env.MESA_REPO ??
  (() => {
    throw Error('$MESA_REPO not set.');
  })();

export const ANTHROPIC_API_KEY =
  process.env.ANTHROPIC_API_KEY ??
  (() => {
    throw Error('$ANTHROPIC_API_KEY not set.');
  })();

if (!process.env.DAYTONA_API_KEY) {
  throw Error('$DAYTONA_API_KEY not set.');
}
