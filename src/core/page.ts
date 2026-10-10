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

/** Storage key for a page: query and hash are dropped. URL patterns (/users/:id) come in M6. */
export function pageKey(url: string): string {
  const { origin, pathname } = new URL(url);
  return origin + pathname;
}

/** Sites the user enabled beyond the dev hosts. A site is `protocol//hostname`, any port. */
export interface SiteSettings {
  allSites: boolean;
  sites: string[];
  /** Also save attached files on enabled sites. Dev hosts always do. */
  saveFilesOnOtherSites: boolean;
}

export const DEFAULT_SITE_SETTINGS: SiteSettings = { allSites: false, sites: [], saveFilesOnOtherSites: false };

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
