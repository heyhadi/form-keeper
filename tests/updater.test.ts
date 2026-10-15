import { describe, expect, it, vi } from 'vitest';

const store: Record<string, unknown> = {};
vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: store[key] })),
        set: vi.fn(async (obj: Record<string, unknown>) => {
          Object.assign(store, obj);
        }),
        remove: vi.fn(async (key: string) => {
          delete store[key];
        }),
      },
    },
  },
}));

import {
  checkForUpdate,
  compareSemver,
  GITHUB_RELEASES_PAGE,
  isNewerVersion,
  parseGitHubRelease,
} from '../src/core';
import { checkUpdateWithCache, loadCachedUpdateInfo, saveCachedUpdateInfo } from '../src/storage';

describe('compareSemver', () => {
  it('correctly compares version numbers', () => {
    expect(compareSemver('0.6.0', '0.5.0')).toBe(1);
    expect(compareSemver('1.0.0', '0.9.9')).toBe(1);
    expect(compareSemver('0.5.1', '0.5.0')).toBe(1);
    expect(compareSemver('0.5.0', '0.6.0')).toBe(-1);
    expect(compareSemver('0.5.0', '1.0.0')).toBe(-1);
    expect(compareSemver('0.5.0', '0.5.0')).toBe(0);
  });

  it('handles leading v and whitespace', () => {
    expect(compareSemver('v0.6.0', '0.5.0')).toBe(1);
    expect(compareSemver('0.6.0', 'v0.6.0')).toBe(0);
    expect(compareSemver('  v1.2.3  ', '1.2.3')).toBe(0);
  });

  it('handles versions with fewer or more segments', () => {
    expect(compareSemver('1.0', '1.0.0')).toBe(0);
    expect(compareSemver('1.0.1', '1.0')).toBe(1);
    expect(compareSemver('1', '1.0.0')).toBe(0);
    expect(compareSemver('2', '1.9.9')).toBe(1);
  });
});

describe('isNewerVersion', () => {
  it('returns true only when remote is newer than current', () => {
    expect(isNewerVersion('0.6.0', '0.5.0')).toBe(true);
    expect(isNewerVersion('v0.6.0', '0.5.0')).toBe(true);
    expect(isNewerVersion('0.5.0', '0.5.0')).toBe(false);
    expect(isNewerVersion('0.4.0', '0.5.0')).toBe(false);
  });
});

describe('parseGitHubRelease', () => {
  it('parses valid GitHub release and determines update availability', () => {
    const payload = {
      tag_name: 'v0.6.0',
      html_url: 'https://github.com/heyhadi/form-keeper/releases/tag/v0.6.0',
      body: 'Release notes for v0.6.0',
      published_at: '2026-10-15T12:00:00Z',
    };

    const res = parseGitHubRelease(payload, '0.5.0');
    expect(res.available).toBe(true);
    expect(res.currentVersion).toBe('0.5.0');
    expect(res.latestVersion).toBe('0.6.0');
    expect(res.releaseUrl).toBe('https://github.com/heyhadi/form-keeper/releases/tag/v0.6.0');
    expect(res.releaseNotes).toBe('Release notes for v0.6.0');
    expect(res.publishedAt).toBe('2026-10-15T12:00:00Z');
  });

  it('marks available false when release is same or older', () => {
    const payload = {
      tag_name: 'v0.5.0',
      html_url: 'https://github.com/heyhadi/form-keeper/releases/tag/v0.5.0',
    };

    const res = parseGitHubRelease(payload, '0.5.0');
    expect(res.available).toBe(false);
    expect(res.latestVersion).toBe('0.5.0');
  });

  it('handles invalid or empty payload safely', () => {
    const res = parseGitHubRelease(null, '0.5.0');
    expect(res.available).toBe(false);
    expect(res.latestVersion).toBe('0.5.0');
    expect(res.releaseUrl).toBe(GITHUB_RELEASES_PAGE);
  });
});

describe('checkForUpdate', () => {
  it('fetches release info and returns update result', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v0.6.0',
        html_url: 'https://github.com/heyhadi/form-keeper/releases/tag/v0.6.0',
      }),
    });

    const res = await checkForUpdate('0.5.0', mockFetch as unknown as typeof fetch);
    expect(res.available).toBe(true);
    expect(res.latestVersion).toBe('0.6.0');
  });

  it('handles HTTP error gracefully without throwing', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
    });

    const res = await checkForUpdate('0.5.0', mockFetch as unknown as typeof fetch);
    expect(res.available).toBe(false);
    expect(res.latestVersion).toBe('0.5.0');
  });

  it('handles network throw gracefully without throwing', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network offline'));

    const res = await checkForUpdate('0.5.0', mockFetch as unknown as typeof fetch);
    expect(res.available).toBe(false);
    expect(res.latestVersion).toBe('0.5.0');
  });
});

describe('checkUpdateWithCache', () => {
  it('saves and loads cached update info', async () => {
    const info = {
      available: true,
      currentVersion: '0.5.0',
      latestVersion: '0.6.0',
      releaseUrl: 'https://github.com/heyhadi/form-keeper/releases/tag/v0.6.0',
      checkedAt: Date.now(),
    };

    await saveCachedUpdateInfo(info);
    const loaded = await loadCachedUpdateInfo();
    expect(loaded).toEqual(info);
  });

  it('returns cached info when fresh', async () => {
    const mockFetch = vi.fn();
    const info = {
      available: true,
      currentVersion: '0.5.0',
      latestVersion: '0.6.0',
      releaseUrl: 'https://github.com/heyhadi/form-keeper/releases/tag/v0.6.0',
      checkedAt: Date.now(),
    };
    await saveCachedUpdateInfo(info);

    const res = await checkUpdateWithCache('0.5.0', false, 60_000, mockFetch as unknown as typeof fetch);
    expect(res).toEqual(info);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches new info when force is true', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v0.7.0',
        html_url: 'https://github.com/heyhadi/form-keeper/releases/tag/v0.7.0',
      }),
    });

    const res = await checkUpdateWithCache('0.5.0', true, 60_000, mockFetch as unknown as typeof fetch);
    expect(res.latestVersion).toBe('0.7.0');
    expect(mockFetch).toHaveBeenCalled();
  });
});
