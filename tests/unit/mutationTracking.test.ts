/**
 * Mutation tracking in src/utils/api.ts powers the admin's optimistic UI:
 * the admin resyncs only after in-flight writes land, drops GETs that raced
 * ahead of a write, and rolls back when a write fails.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, mutations } from '../../src/utils/api';

describe('mutation tracking', () => {
  const originalFetch = global.fetch;
  let releaseWrite: (ok: boolean) => void;

  beforeEach(() => {
    api.clearCsrf();
    global.fetch = vi.fn((url: string) => {
      if (url === '/api/auth/csrf') {
        return Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve({ token: 't' }) });
      }
      return new Promise(resolve => {
        releaseWrite = ok => resolve({
          ok, status: ok ? 200 : 500, statusText: ok ? 'OK' : 'Error',
          json: () => Promise.resolve(ok ? { ok: true } : { error: 'boom' }),
        });
      });
    }) as unknown as typeof fetch;
  });

  afterEach(() => { global.fetch = originalFetch; });

  const tick = () => new Promise(r => setTimeout(r, 0));

  it('counts a write as pending until it settles, and bumps the epoch', async () => {
    const epoch = mutations.epoch;
    const p = api.del('/api/services/1');
    expect(mutations.pending).toBe(1);
    expect(mutations.epoch).toBe(epoch + 1);

    let idle = false;
    mutations.whenIdle().then(() => { idle = true; });
    await tick();
    expect(idle).toBe(false);

    releaseWrite(true);
    await p;
    await tick();
    expect(mutations.pending).toBe(0);
    expect(idle).toBe(true);
  });

  it('whenIdle resolves immediately when nothing is in flight', async () => {
    await expect(mutations.whenIdle()).resolves.toBeUndefined();
  });

  it('notifies error listeners when a write fails', async () => {
    const onError = vi.fn();
    const unsubscribe = mutations.onError(onError);
    const p = api.del('/api/services/1').catch(() => {});
    await tick();
    releaseWrite(false);
    await p;
    await tick();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(mutations.pending).toBe(0);
    unsubscribe();
  });
});
