import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';

describe('loadConfig', () => {
  it('allows APP_ORIGIN and the deployment’s own Vercel URLs', () => {
    const config = loadConfig({
      DATABASE_URL: 'pglite://memory',
      APP_ORIGIN: 'https://sanchari.example',
      VERCEL: '1',
      VERCEL_ENV: 'production',
      VERCEL_URL: 'sanchari-abc123-team.vercel.app',
      VERCEL_BRANCH_URL: 'sanchari-git-main-team.vercel.app',
      VERCEL_PROJECT_PRODUCTION_URL: 'sanchari.vercel.app',
    });
    expect(config.allowedOrigins.sort()).toEqual([
      'https://sanchari-abc123-team.vercel.app',
      'https://sanchari-git-main-team.vercel.app',
      'https://sanchari.example',
      'https://sanchari.vercel.app',
    ]);
    expect(config.trustProxy).toBe(true);
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });
});
