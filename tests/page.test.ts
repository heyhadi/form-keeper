import { describe, expect, it } from 'vitest';
import { isAllowedUrl, isDevHost, pageKey, siteOf, userSiteMatches } from '../src/core';

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
  const none = { allSites: false, sites: [] };

  it('normalises a URL to protocol and hostname, any port', () => {
    expect(siteOf('https://app.example.com:8443/a?b')).toBe('https://app.example.com');
    expect(siteOf('chrome://extensions')).toBeUndefined();
  });

  it('always allows dev hosts', () => {
    expect(isAllowedUrl('http://localhost:3000/', none)).toBe(true);
  });

  it('allows enabled sites only, matching protocol', () => {
    const settings = { allSites: false, sites: ['https://example.com'] };
    expect(isAllowedUrl('https://example.com:8443/x', settings)).toBe(true);
    expect(isAllowedUrl('http://example.com/x', settings)).toBe(false);
    expect(isAllowedUrl('https://other.com/', settings)).toBe(false);
  });

  it('allows every web page when all sites is on', () => {
    expect(isAllowedUrl('https://anything.io/', { allSites: true, sites: [] })).toBe(true);
    expect(isAllowedUrl('file:///tmp/a.html', { allSites: true, sites: [] })).toBe(false);
  });

  it('builds content-script match patterns', () => {
    expect(userSiteMatches({ allSites: false, sites: ['https://example.com'] })).toEqual(['https://example.com/*']);
    expect(userSiteMatches({ allSites: true, sites: ['https://example.com'] })).toEqual(['http://*/*', 'https://*/*']);
  });
});
