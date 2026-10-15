/**
 * Checks for new versions of form-keeper published on GitHub Releases.
 */

export interface UpdateCheckResult {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseNotes?: string;
  publishedAt?: string;
  checkedAt: number;
}

export const GITHUB_RELEASES_URL = 'https://api.github.com/repos/heyhadi/form-keeper/releases/latest';
export const GITHUB_RELEASES_PAGE = 'https://github.com/heyhadi/form-keeper/releases';

/**
 * Compares two semantic version strings (e.g. "0.5.0" vs "v0.6.0").
 * Returns:
 *   1 if a > b
 *  -1 if a < b
 *   0 if a == b
 */
export function compareSemver(a: string, b: string): number {
  const cleanA = (a || '').trim().replace(/^v/i, '').trim();
  const cleanB = (b || '').trim().replace(/^v/i, '').trim();

  const partsA = cleanA.split('.').map((p) => {
    const num = parseInt(p, 10);
    return isNaN(num) ? 0 : num;
  });
  const partsB = cleanB.split('.').map((p) => {
    const num = parseInt(p, 10);
    return isNaN(num) ? 0 : num;
  });

  const maxLen = Math.max(partsA.length, partsB.length, 3);
  for (let i = 0; i < maxLen; i++) {
    const numA = partsA[i] ?? 0;
    const numB = partsB[i] ?? 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }

  return 0;
}

/**
 * Returns true if remoteVersion is strictly newer than currentVersion.
 */
export function isNewerVersion(remoteVersion: string, currentVersion: string): boolean {
  return compareSemver(remoteVersion, currentVersion) > 0;
}

/**
 * Parses GitHub API release payload and checks if an update is available.
 */
export function parseGitHubRelease(data: unknown, currentVersion: string): UpdateCheckResult {
  const now = Date.now();
  if (!data || typeof data !== 'object') {
    return {
      available: false,
      currentVersion,
      latestVersion: currentVersion,
      releaseUrl: GITHUB_RELEASES_PAGE,
      checkedAt: now,
    };
  }

  const obj = data as Record<string, unknown>;
  const tagName = typeof obj.tag_name === 'string' ? obj.tag_name : '';
  const latestVersion = tagName.replace(/^v/i, '') || currentVersion;
  const releaseUrl = typeof obj.html_url === 'string' ? obj.html_url : GITHUB_RELEASES_PAGE;
  const releaseNotes = typeof obj.body === 'string' ? obj.body : undefined;
  const publishedAt = typeof obj.published_at === 'string' ? obj.published_at : undefined;

  const available = isNewerVersion(latestVersion, currentVersion);

  return {
    available,
    currentVersion,
    latestVersion,
    releaseUrl,
    releaseNotes,
    publishedAt,
    checkedAt: now,
  };
}

/**
 * Queries GitHub Releases API for the latest release.
 */
export async function checkForUpdate(
  currentVersion: string,
  fetchFn: typeof fetch = fetch,
): Promise<UpdateCheckResult> {
  try {
    const res = await fetchFn(GITHUB_RELEASES_URL, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!res.ok) {
      return {
        available: false,
        currentVersion,
        latestVersion: currentVersion,
        releaseUrl: GITHUB_RELEASES_PAGE,
        checkedAt: Date.now(),
      };
    }

    const json = await res.json();
    return parseGitHubRelease(json, currentVersion);
  } catch {
    return {
      available: false,
      currentVersion,
      latestVersion: currentVersion,
      releaseUrl: GITHUB_RELEASES_PAGE,
      checkedAt: Date.now(),
    };
  }
}
