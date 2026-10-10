import { resolve } from 'node:path';
import { chromium, test as base, type BrowserContext, type Worker } from '@playwright/test';

const EXTENSION = resolve(import.meta.dirname, '../.output-e2e/chrome-mv3');
export const ORIGIN = 'http://localhost:5174';
/** Wait longer than the save debounce. */
export const SETTLE_MS = 600;

export const test = base.extend<{ context: BrowserContext; worker: Worker; extensionId: string }>({
  // Extensions need a persistent context; `chromium` channel allows them in headless mode.
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${EXTENSION}`,
        `--load-extension=${EXTENSION}`,
        // A non-dev hostname that still reaches the fixture server.
        '--host-resolver-rules=MAP not-dev.test 127.0.0.1',
      ],
    });
    await use(context);
    await context.close();
  },
  worker: async ({ context }, use) => {
    await use(context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker')));
  },
  extensionId: async ({ worker }, use) => {
    await use(new URL(worker.url()).host);
  },
});

export { expect } from '@playwright/test';

/**
 * Opens the URL in a brand-new tab. A fresh navigation (not `reload()`) rules out Chrome's own
 * form-state restoration, so anything we see filled came from the extension.
 */
export async function reopen(context: BrowserContext, url: string) {
  for (const page of context.pages()) await page.close();
  const page = await context.newPage();
  await page.goto(url);
  return page;
}

/** The toolbar badge for the only open tab, read from the extension's service worker. */
export async function badge(worker: Worker): Promise<string> {
  return worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({});
    return chrome.action.getBadgeText({ tabId: tab!.id! });
  });
}

/** Opens the popup as a page, pointed at the (only) fixture tab. */
export async function openPopup(context: BrowserContext, worker: Worker, extensionId: string, height = 600) {
  const id = await tabId(worker);
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 360, height });
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tab=${id}`);
  return popup;
}

export async function tabId(worker: Worker): Promise<number> {
  return worker.evaluate(async () => (await chrome.tabs.query({}))[0]!.id!);
}
