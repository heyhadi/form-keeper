import { browser } from 'wxt/browser';
import { ALL_SITES_ORIGINS, sitePattern, type SiteSettings } from '@/core';
import type { RestoreFromReport, TabRequest, TabResponses, TabState } from '@/messages';
import { loadSettings, saveSettings } from '@/storage';

export interface ActiveTab {
  id: number;
  url?: string;
}

export async function getActiveTab(): Promise<ActiveTab | undefined> {
  // `?tab=<id>` lets the e2e tests open the popup as a normal page pointed at a fixture tab.
  const override = new URLSearchParams(location.search).get('tab');
  const tab = override
    ? await browser.tabs.get(Number(override))
    : (await browser.tabs.query({ active: true, currentWindow: true }))[0];
  return tab?.id === undefined ? undefined : { id: tab.id, url: tab.url };
}

export async function askTab<T extends TabRequest>(tabId: number, request: T): Promise<TabResponses[T['type']] | undefined> {
  // Rejects when no content script is listening, i.e. the page isn't an enabled site.
  return browser.tabs.sendMessage(tabId, request).catch(() => undefined);
}

export async function getTabState(tabId: number): Promise<TabState | undefined> {
  return askTab(tabId, { type: 'getState' });
}

export async function restoreFrom(tabId: number, page: string): Promise<RestoreFromReport | undefined> {
  return (await askTab(tabId, { type: 'restoreFrom', page })) ?? undefined;
}

/** Waits for the content script to answer, e.g. right after injecting it. */
async function waitForTab(tabId: number, timeoutMs = 1500): Promise<boolean> {
  for (const started = Date.now(); Date.now() - started < timeoutMs; ) {
    if (await getTabState(tabId)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

/**
 * Turns form-keeper on for more sites. `permissions.request` must be the first await so it still
 * counts as part of the click; Chrome shows its prompt only for hosts not yet granted.
 */
async function grant(origins: string[], update: (settings: SiteSettings) => SiteSettings, tabId?: number): Promise<boolean> {
  if (!(await browser.permissions.request({ origins }))) return false;
  await saveSettings(update(await loadSettings()));
  if (tabId === undefined) return true;
  // The page is already loaded, so the newly registered script won't run there until reload;
  // inject it now unless an existing (previously disabled) copy woke up from the settings change.
  if (!(await waitForTab(tabId, 300))) {
    await browser.scripting.executeScript({ target: { tabId }, files: ['/content-scripts/content.js'] }).catch(() => {});
    await waitForTab(tabId);
  }
  return true;
}

export function enableSite(site: string, tabId?: number): Promise<boolean> {
  return grant([sitePattern(site)], (s) => ({ ...s, sites: s.sites.includes(site) ? s.sites : [...s.sites, site] }), tabId);
}

export function enableAllSites(tabId?: number): Promise<boolean> {
  return grant(ALL_SITES_ORIGINS, (s) => ({ ...s, allSites: true }), tabId);
}

export async function disableSite(site: string): Promise<void> {
  const settings = await loadSettings();
  await saveSettings({ ...settings, sites: settings.sites.filter((s) => s !== site) });
  // Keep the host permission if "all sites" still needs it.
  if (!settings.allSites) await browser.permissions.remove({ origins: [sitePattern(site)] }).catch(() => {});
}

export async function disableAllSites(): Promise<void> {
  const settings = await loadSettings();
  await saveSettings({ ...settings, allSites: false });
  await browser.permissions.remove({ origins: ALL_SITES_ORIGINS }).catch(() => {});
}
