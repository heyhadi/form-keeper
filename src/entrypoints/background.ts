import { browser } from 'wxt/browser';
import { DEV_HOST_MATCHES, INACTIVE_STATUS, userSiteMatches, type SiteSettings, type TabStatus } from '@/core';
import type { StatusMessage } from '@/messages';
import { loadSettings, saveSettings, SETTINGS_KEY } from '@/storage';

const SIZES = [16, 32, 48, 128] as const;
const iconSet = (dir: string) => Object.fromEntries(SIZES.map((size) => [size, `/${dir}/${size}.png`]));
const ICONS = { active: iconSet('icon'), paused: iconSet('icon-inactive'), inactive: iconSet('icon-inactive') };
const BADGE_COLORS = { active: '#16a34a', paused: '#6b7280', inactive: '#6b7280' };
const USER_SITES_SCRIPT = 'user-sites';

/**
 * The toolbar icon is per tab: coloured with an ON (or restored-count) badge where the content
 * script is running, grey everywhere else. Only the content script knows it is running, so it
 * reports in and we paint.
 */
async function paint(tabId: number, status: TabStatus): Promise<void> {
  await Promise.all([
    browser.action.setIcon({ tabId, path: ICONS[status.state] }),
    browser.action.setBadgeText({ tabId, text: status.badge }),
    browser.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLORS[status.state] }),
    browser.action.setTitle({ tabId, title: status.title }),
  ]).catch(() => {}); // the tab may have closed meanwhile
}

/**
 * Dev hosts are covered by the manifest. Sites the user enables get a content script registered
 * at runtime, limited to the host permissions they actually granted.
 */
async function registerUserSites(settings: SiteSettings): Promise<void> {
  await browser.scripting.unregisterContentScripts({ ids: [USER_SITES_SCRIPT] }).catch(() => {});
  const matches = [];
  for (const pattern of userSiteMatches(settings)) {
    if (await browser.permissions.contains({ origins: [pattern] })) matches.push(pattern);
  }
  if (matches.length === 0) return;
  await browser.scripting.registerContentScripts([
    {
      id: USER_SITES_SCRIPT,
      js: ['content-scripts/content.js'],
      matches,
      excludeMatches: DEV_HOST_MATCHES,
      runAt: 'document_idle',
      persistAcrossSessions: true,
    },
  ]);
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: StatusMessage, sender) => {
    if (message?.type === 'status' && sender.tab?.id !== undefined) void paint(sender.tab.id, message.status);
  });

  // A full navigation starts out inactive; the content script repaints if it runs on the new page.
  browser.tabs.onUpdated.addListener((tabId, info) => {
    if (info.status === 'loading') void paint(tabId, INACTIVE_STATUS);
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[SETTINGS_KEY]) void registerUserSites(changes[SETTINGS_KEY].newValue as SiteSettings);
  });

  // Access revoked from Chrome's own UI: forget those sites too.
  browser.permissions.onRemoved.addListener(async ({ origins = [] }) => {
    const settings = await loadSettings();
    const revoked = new Set(origins);
    const next: SiteSettings = {
      allSites: settings.allSites && !origins.some((o) => o === 'http://*/*' || o === 'https://*/*'),
      sites: settings.sites.filter((site) => !revoked.has(`${site}/*`)),
    };
    if (next.allSites !== settings.allSites || next.sites.length !== settings.sites.length) await saveSettings(next);
  });

  browser.runtime.onInstalled.addListener(async () => registerUserSites(await loadSettings()));
  browser.runtime.onStartup.addListener(async () => registerUserSites(await loadSettings()));
});
