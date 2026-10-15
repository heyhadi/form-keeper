import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SITE_SETTINGS,
  findPatternSiblings,
  groupPagesByPattern,
  isAllowedUrl,
  isDevHost,
  isIdSegment,
  matchesPattern,
  pageKey,
  patternKey,
  patternOfPath,
  shouldSaveFiles,
  siteOf,
  userSiteMatches,
} from '../src/core';

describe('isDevHost', () => {
  it.each(['http://localhost:5173/x', 'http://127.0.0.1:3000/', 'https://app.localhost/', 'http://myapp.local/a'])(
    'allows %s',
    (url) => expect(isDevHost(url)).toBe(true),
  );

  it.each(['https://example.com/', 'https://localhost.example.com/', 'https://local/', 'not a url'])(
    'rejects %s',
    (url) => expect(isDevHost(url)).toBe(false),
  );
});

describe('pageKey', () => {
  it('keeps origin and path, drops query and hash', () => {
    expect(pageKey('http://localhost:5173/users/1/edit?tab=2#top')).toBe('http://localhost:5173/users/1/edit');
  });
});

describe('site settings', () => {
  const none = DEFAULT_SITE_SETTINGS;
  const base = DEFAULT_SITE_SETTINGS;

  it('normalises a URL to protocol and hostname, any port', () => {
    expect(siteOf('https://app.example.com:8443/a?b')).toBe('https://app.example.com');
    expect(siteOf('chrome://extensions')).toBeUndefined();
  });

  it('always allows dev hosts', () => {
    expect(isAllowedUrl('http://localhost:3000/', none)).toBe(true);
  });

  it('allows enabled sites only, matching protocol', () => {
    const settings = { ...base, sites: ['https://example.com'] };
    expect(isAllowedUrl('https://example.com:8443/x', settings)).toBe(true);
    expect(isAllowedUrl('http://example.com/x', settings)).toBe(false);
    expect(isAllowedUrl('https://other.com/', settings)).toBe(false);
  });

  it('allows every web page when all sites is on', () => {
    expect(isAllowedUrl('https://anything.io/', { ...base, allSites: true })).toBe(true);
    expect(isAllowedUrl('file:///tmp/a.html', { ...base, allSites: true })).toBe(false);
  });

  it('builds content-script match patterns', () => {
    expect(userSiteMatches({ ...base, sites: ['https://example.com'] })).toEqual(['https://example.com/*']);
    expect(userSiteMatches({ ...base, allSites: true, sites: ['https://example.com'] })).toEqual(['http://*/*', 'https://*/*']);
  });

  it('saves files on dev hosts always, and elsewhere only when opted in', () => {
    expect(shouldSaveFiles('http://localhost:3000/', none)).toBe(true);
    expect(shouldSaveFiles('https://example.com/', none)).toBe(false);
    expect(shouldSaveFiles('https://example.com/', { ...none, saveFilesOnOtherSites: true })).toBe(true);
  });
});

describe('URL pattern recognition and grouping', () => {
  it('identifies dynamic ID segments (numeric, UUID, mongo objectId, prefixed slugs)', () => {
    // Numeric
    expect(isIdSegment('1')).toBe(true);
    expect(isIdSegment('42')).toBe(true);
    expect(isIdSegment('999999')).toBe(true);

    // UUID
    expect(isIdSegment('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isIdSegment('C2D34E5F-6789-4ABC-DEF0-123456789ABC')).toBe(true);

    // Mongo ObjectID (24 hex chars)
    expect(isIdSegment('64b5f891a2e3d4c5b6a78901')).toBe(true);

    // Prefixed slug with digits
    expect(isIdSegment('usr_12345')).toBe(true);
    expect(isIdSegment('item-8891')).toBe(true);

    // Static words that should not be IDs
    expect(isIdSegment('')).toBe(false);
    expect(isIdSegment('edit')).toBe(false);
    expect(isIdSegment('users')).toBe(false);
    expect(isIdSegment('new')).toBe(false);
    expect(isIdSegment('settings')).toBe(false);
    expect(isIdSegment('profile')).toBe(false);
  });

  it('matches route patterns with parameter placeholders', () => {
    expect(matchesPattern('/users/123/edit', '/users/:id/edit')).toBe(true);
    expect(matchesPattern('/users/abc/edit', '/users/:id/edit')).toBe(true);
    expect(matchesPattern('/teams/alpha/projects/beta', '/teams/:team/projects/:project')).toBe(true);

    // Mismatched length or segment
    expect(matchesPattern('/users/123', '/users/:id/edit')).toBe(false);
    expect(matchesPattern('/posts/123/edit', '/users/:id/edit')).toBe(false);
    expect(matchesPattern('/users/123/edit/details', '/users/:id/edit')).toBe(false);
  });

  it('converts pathnames into generalized patterns', () => {
    expect(patternOfPath('/users/123/edit')).toBe('/users/:id/edit');
    expect(patternOfPath('/posts/550e8400-e29b-41d4-a716-446655440000/comments/42')).toBe('/posts/:id/comments/:id');
    expect(patternOfPath('/admin/settings')).toBe('/admin/settings');
    expect(patternOfPath('/users/new')).toBe('/users/new');

    // With custom pattern precedence
    const custom = ['/teams/:team/settings'];
    expect(patternOfPath('/teams/engineering/settings', custom)).toBe('/teams/:team/settings');
  });

  it('computes full pattern keys with origin and generalized path', () => {
    expect(patternKey('http://localhost:3000/users/42/edit?tab=1#info')).toBe('http://localhost:3000/users/:id/edit');
    expect(patternKey('https://example.com/items/item-1234')).toBe('https://example.com/items/:id');
  });

  it('groups saved pages by generalized pattern and sorts by lastSavedAt', () => {
    const pages = [
      { page: 'http://localhost:3000/users/1/edit', savedAt: 1000, fieldCount: 5, snapshotCount: 2, pinnedCount: 1 },
      { page: 'http://localhost:3000/users/2/edit', savedAt: 2000, fieldCount: 6, snapshotCount: 1, pinnedCount: 0 },
      { page: 'http://localhost:3000/settings', savedAt: 1500, fieldCount: 3, snapshotCount: 0, pinnedCount: 0 },
    ];

    const groups = groupPagesByPattern(pages);
    expect(groups).toHaveLength(2);

    // Group 1: /users/:id/edit (latest savedAt: 2000)
    const userGroup = groups[0]!;
    expect(userGroup.displayPattern).toBe('/users/:id/edit');
    expect(userGroup.isParameterized).toBe(true);
    expect(userGroup.pages).toHaveLength(2);
    expect(userGroup.totalFieldCount).toBe(11);
    expect(userGroup.totalSnapshotCount).toBe(3);
    expect(userGroup.pinnedCount).toBe(1);
    expect(userGroup.lastSavedAt).toBe(2000);

    // Group 2: /settings (savedAt: 1500)
    const settingsGroup = groups[1]!;
    expect(settingsGroup.displayPattern).toBe('/settings');
    expect(settingsGroup.isParameterized).toBe(false);
    expect(settingsGroup.pages).toHaveLength(1);
    expect(settingsGroup.totalFieldCount).toBe(3);
  });

  it('finds sibling pages matching the same pattern', () => {
    const pages = [
      { page: 'http://localhost:3000/users/1/edit', savedAt: 1000 },
      { page: 'http://localhost:3000/users/2/edit', savedAt: 2000 },
      { page: 'http://localhost:3000/settings', savedAt: 1500 },
    ];

    // Current page: /users/3/edit (which has no entry in pages yet)
    const siblingsForNew = findPatternSiblings('http://localhost:3000/users/3/edit', pages);
    expect(siblingsForNew).toHaveLength(2);
    expect(siblingsForNew.map((p) => p.page)).toEqual([
      'http://localhost:3000/users/1/edit',
      'http://localhost:3000/users/2/edit',
    ]);

    // Current page: /users/1/edit (excludes itself)
    const siblingsForUser1 = findPatternSiblings('http://localhost:3000/users/1/edit', pages);
    expect(siblingsForUser1).toHaveLength(1);
    expect(siblingsForUser1[0]!.page).toBe('http://localhost:3000/users/2/edit');

    // Page with no pattern siblings
    const siblingsForSettings = findPatternSiblings('http://localhost:3000/settings', pages);
    expect(siblingsForSettings).toHaveLength(0);
  });
});

