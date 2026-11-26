import { describe, it, expect } from 'vitest';
import { accountsFromEnv } from '../../scripts/ensure-e2e-users';

describe('ensure-e2e-users accountsFromEnv', () => {
  it('reads all three accounts with their roles', () => {
    const { accounts, missing } = accountsFromEnv({
      E2E_ADMIN_USER: 'a', E2E_ADMIN_PASS: 'pa',
      E2E_EDITOR_USER: 'e', E2E_EDITOR_PASS: 'pe',
      E2E_VIEWER_USER: 'v', E2E_VIEWER_PASS: 'pv',
    });
    expect(missing).toEqual([]);
    expect(accounts.map(a => [a.username, a.role])).toEqual([['a', 'ADMIN'], ['e', 'EDITOR'], ['v', 'VIEWER']]);
  });

  it('skips accounts missing a user or password', () => {
    const { accounts, missing } = accountsFromEnv({ E2E_ADMIN_USER: 'a', E2E_ADMIN_PASS: 'pa', E2E_EDITOR_USER: 'e' });
    expect(accounts.map(a => a.role)).toEqual(['ADMIN']);
    expect(missing).toEqual(['EDITOR', 'VIEWER']);
  });
});
