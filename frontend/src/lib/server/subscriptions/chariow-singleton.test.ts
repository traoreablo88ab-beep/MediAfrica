import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getChariowClient,
  ChariowUnconfiguredError,
  __resetChariowClientSingleton,
} from './chariow-singleton';

beforeEach(() => {
  __resetChariowClientSingleton();
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetChariowClientSingleton();
});

describe('getChariowClient', () => {
  it('throws ChariowUnconfiguredError when CHARIOW_API_KEY is missing', () => {
    vi.stubEnv('CHARIOW_API_KEY', '');
    vi.stubEnv('CHARIOW_WEBHOOK_SECRET', 'whsec');
    expect(() => getChariowClient()).toThrow(ChariowUnconfiguredError);
  });

  it('throws ChariowUnconfiguredError when CHARIOW_WEBHOOK_SECRET is missing', () => {
    vi.stubEnv('CHARIOW_API_KEY', 'key');
    vi.stubEnv('CHARIOW_WEBHOOK_SECRET', '');
    expect(() => getChariowClient()).toThrow(ChariowUnconfiguredError);
  });

  it('constructs and caches a client when env is fully configured', () => {
    vi.stubEnv('CHARIOW_API_KEY', 'key');
    vi.stubEnv('CHARIOW_WEBHOOK_SECRET', 'whsec');
    const first = getChariowClient();
    const second = getChariowClient();
    expect(first).toBe(second);
  });
});
