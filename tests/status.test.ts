import { describe, expect, it } from 'vitest';
import { activeStatus, restoredStatus } from '../src/core';

const report = (restored: number, unchanged = 0, missing = 0) => ({
  restored: Array.from({ length: restored }, (_, i) => `r${i}`),
  unchanged: Array.from({ length: unchanged }, (_, i) => `u${i}`),
  skipped: [],
  missing: Array.from({ length: missing }, (_, i) => `m${i}`),
});

describe('tab status', () => {
  it('shows ON while active', () => {
    expect(activeStatus('http://localhost/x')).toMatchObject({ state: 'active', badge: 'ON' });
  });

  it('shows the restored count', () => {
    const status = restoredStatus('http://localhost/x', report(3, 1, 1));
    expect(status.badge).toBe('3');
    expect(status.title).toContain('Restored 3 fields (4 of 5 matched)');
  });

  it('falls back to ON when nothing needed restoring', () => {
    expect(restoredStatus('http://localhost/x', report(0, 2)).badge).toBe('ON');
  });
});
