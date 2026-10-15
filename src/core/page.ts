/**
 * Hosts the content script runs on. Chrome match patterns ignore the port, so `localhost`
 * covers every dev server.
 */
export const DEV_HOST_MATCHES = ['*://localhost/*', '*://127.0.0.1/*', '*://*.localhost/*', '*://*.local/*'];

/** Second line of defence behind the manifest `matches`; also what the tests exercise. */
export function isDevHost(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return false;
  }
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local')
  );
}

/** Storage key for a page: query and hash are dropped. */
export function pageKey(url: string): string {
  const { origin, pathname } = new URL(url);
  return origin + pathname;
}

/**
 * Checks whether a path segment represents an ID/parameter:
 * - Integer ID: "123", "42"
 * - UUID / GUID: "550e8400-e29b-41d4-a716-446655440000"
 * - 24-character Hex / Mongo ObjectID: "64b5f891a2e3d4c5b6a78901"
 * - Prefixed slug ID: "usr_12345", "item-8891"
 */
export function isIdSegment(segment: string): boolean {
  if (!segment) return false;
  // 1. Numeric ID
  if (/^\d+$/.test(segment)) return true;
  // 2. Standard UUID
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) return true;
  // 3. 24-character hex ID (e.g. MongoDB ObjectId)
  if (/^[0-9a-f]{24}$/i.test(segment)) return true;
  // 4. Prefix ID with digits: e.g. "usr_12345", "item-8891"
  if (/^[a-z]{1,6}[_-][0-9a-z]{3,}$/i.test(segment) && /\d/.test(segment)) return true;
  return false;
}

/**
 * Tests whether a URL pathname matches a parameterized pattern (e.g. `/users/:id/edit`).
 */
export function matchesPattern(pathname: string, pattern: string): boolean {
  const pathParts = pathname.split('/').filter(Boolean);
  const patternParts = pattern.split('/').filter(Boolean);
  if (pathParts.length !== patternParts.length) return false;

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i]!;
    const pathPart = pathParts[i]!;
    if (patternPart.startsWith(':')) {
      if (!pathPart) return false;
    } else if (patternPart !== pathPart) {
      return false;
    }
  }

  return true;
}

/**
 * Converts a pathname into a generalized route pattern (e.g. `/users/123/edit` -> `/users/:id/edit`).
 * Checks custom patterns first if provided.
 */
export function patternOfPath(pathname: string, customPatterns: string[] = []): string {
  for (const custom of customPatterns) {
    if (matchesPattern(pathname, custom)) return custom;
  }

  const parts = pathname.split('/');
  const mapped = parts.map((part) => (isIdSegment(part) ? ':id' : part));
  return mapped.join('/');
}

/**
 * Storage / grouping key for a URL's pattern: `http://localhost:3000/users/:id/edit`
 */
export function patternKey(url: string, customPatterns: string[] = []): string {
  try {
    const { origin, pathname } = new URL(url);
    return origin + patternOfPath(pathname, customPatterns);
  } catch {
    return url;
  }
}

export interface PatternGroup<T = { page: string; savedAt: number; fieldCount: number; snapshotCount?: number; pinnedCount?: number }> {
  pattern: string;
  displayPattern: string;
  host: string;
  isParameterized: boolean;
  pages: T[];
  totalFieldCount: number;
  totalSnapshotCount: number;
  pinnedCount: number;
  lastSavedAt: number;
}

/**
 * Groups pages by their generalized URL pattern (e.g. all `/users/:id/edit` pages grouped together).
 */
export function groupPagesByPattern<T extends { page: string; savedAt: number; fieldCount: number; snapshotCount?: number; pinnedCount?: number }>(
  pages: T[],
  customPatterns: string[] = [],
): PatternGroup<T>[] {
  const map = new Map<string, T[]>();

  for (const page of pages) {
    const pKey = patternKey(page.page, customPatterns);
    const existing = map.get(pKey) ?? [];
    existing.push(page);
    map.set(pKey, existing);
  }

  const groups: PatternGroup<T>[] = [];
  for (const [pKey, pageList] of map.entries()) {
    let host = '';
    let displayPattern = pKey;
    try {
      const u = new URL(pKey);
      host = u.host;
      displayPattern = u.pathname;
    } catch {
      // fallback
    }

    const isParameterized = displayPattern.includes(':');
    const totalFieldCount = pageList.reduce((sum, p) => sum + p.fieldCount, 0);
    const totalSnapshotCount = pageList.reduce((sum, p) => sum + (p.snapshotCount ?? 0), 0);
    const pinnedCount = pageList.reduce((sum, p) => sum + (p.pinnedCount ?? 0), 0);
    const lastSavedAt = Math.max(...pageList.map((p) => p.savedAt));

    groups.push({
      pattern: pKey,
      displayPattern,
      host,
      isParameterized,
      pages: pageList.sort((a, b) => b.savedAt - a.savedAt),
      totalFieldCount,
      totalSnapshotCount,
      pinnedCount,
      lastSavedAt,
    });
  }

  return groups.sort((a, b) => b.lastSavedAt - a.lastSavedAt);
}

/**
 * Finds other saved pages that match the same URL pattern as the given URL.
 */
export function findPatternSiblings<T extends { page: string }>(
  url: string,
  pages: T[],
  customPatterns: string[] = [],
): T[] {
  let currentKey = url;
  try {
    currentKey = pageKey(url);
  } catch {
    // ignore
  }
  const targetPattern = patternKey(url, customPatterns);
  return pages.filter((p) => p.page !== currentKey && patternKey(p.page, customPatterns) === targetPattern);
}

/** Sites the user enabled beyond the dev hosts. A site is `protocol//hostname`, any port. */
export interface SiteSettings {
  allSites: boolean;
  sites: string[];
  /** Also save attached files on enabled sites. Dev hosts always do. */
  saveFilesOnOtherSites: boolean;
  /** Custom URL patterns (e.g. ['/users/:id/edit', '/teams/:team/projects/:project']) */
  patterns?: string[];
}

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  allSites: false,
  sites: [],
  saveFilesOnOtherSites: false,
  patterns: [],
};

/** `https://example.com:8443/a` -> `https://example.com`. Undefined for non-web URLs. */
export function siteOf(url: string): string | undefined {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'http:' || protocol === 'https:' ? `${protocol}//${hostname}` : undefined;
  } catch {
    return undefined;
  }
}

export function isAllowedUrl(url: string, settings: SiteSettings): boolean {
  if (isDevHost(url)) return true;
  const site = siteOf(url);
  return site !== undefined && (settings.allSites || settings.sites.includes(site));
}

export const ALL_SITES_ORIGINS = ['http://*/*', 'https://*/*'];

/** Host permission / match patterns for a site; Chrome patterns without a port match any port. */
export function sitePattern(site: string): string {
  return `${site}/*`;
}

/** Match patterns for the dynamically registered content script (dev hosts are static). */
export function userSiteMatches(settings: SiteSettings): string[] {
  return settings.allSites ? ALL_SITES_ORIGINS : settings.sites.map(sitePattern);
}

/** Files are saved on dev hosts, and elsewhere only when the user has opted in. */
export function shouldSaveFiles(url: string, settings: SiteSettings): boolean {
  return isDevHost(url) || settings.saveFilesOnOtherSites;
}
