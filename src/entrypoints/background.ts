import { browser } from 'wxt/browser';
import { paint } from '@/background/paint';
import { DEV_HOST_MATCHES, INACTIVE_STATUS, userSiteMatches, type SiteSettings } from '@/core';
import type { StatusMessage } from '@/messages';
import { loadSettings, saveSettings, SETTINGS_KEY } from '@/storage';

const USER_SITES_SCRIPT = 'user-sites';

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
    if (message?.type === 'status' && sender.tab?.id !== undefined) void paint(browser.action, sender.tab.id, message.status);
  });

  // A full navigation starts out inactive; the content script repaints if it runs on the new page.
  browser.tabs.onUpdated.addListener((tabId, info) => {
    if (info.status === 'loading') void paint(browser.action, tabId, INACTIVE_STATUS);
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[SETTINGS_KEY]) void registerUserSites(changes[SETTINGS_KEY].newValue as SiteSettings).catch(() => {});
  });

  // Access revoked from Chrome's own UI: forget those sites too.
  browser.permissions.onRemoved.addListener(async ({ origins = [] }) => {
    const settings = await loadSettings();
    const revoked = new Set(origins);
    const next: SiteSettings = {
      ...settings,
      allSites: settings.allSites && !origins.some((o) => o === 'http://*/*' || o === 'https://*/*'),
      sites: settings.sites.filter((site) => !revoked.has(`${site}/*`)),
    };
    if (next.allSites !== settings.allSites || next.sites.length !== settings.sites.length) await saveSettings(next);
  });

  // A failed (re-)registration must not surface as an extension error; sites simply stay off.
  const register = async () => registerUserSites({ ...(await loadSettings()) }).catch(() => {});
  browser.runtime.onInstalled.addListener(register);
  browser.runtime.onStartup.addListener(register);
});
