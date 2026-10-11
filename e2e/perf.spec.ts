import type { Page, Worker } from '@playwright/test';
import { expect, ORIGIN, test } from './fixtures';

/** What a user would have saved, written straight to storage so the benchmark needs no clicking. */
const SAVED: Record<string, { label: string; stateKey: string }> = {
  'React Select (single)': { label: 'Bangkok', stateKey: 'rsSingle' },
  'React Select v4 (legacy)': { label: 'Jakarta', stateKey: 'rsV4' },
  'Ant Select (single)': { label: 'Jakarta', stateKey: 'antSingle' },
  'MUI Select': { label: 'Jakarta', stateKey: 'muiSelect' },
  'Radix Select': { label: 'Kuala Lumpur', stateKey: 'radix' },
  'Headless UI Listbox': { label: 'Bangkok', stateKey: 'headless' },
  Department: { label: 'Finance', stateKey: 'department' },
};

async function seed(worker: Worker, filler: number) {
  const url = `${ORIGIN}/widgets.html`;
  const fields = Object.fromEntries(Object.entries(SAVED).map(([name, v]) => [`form#widgets widget=${name}`, { kind: 'widget', widget: 'combobox', labels: [v.label] }]));
  await worker.evaluate(
    async ([key, fields]) => {
      await chrome.storage.local.clear();
      await chrome.storage.local.set({ [key as string]: { version: 1, savedAt: Date.now(), fields } });
    },
    [`page:${url}`, fields] as const,
  );
  return filler ? `${url}?filler=${filler}` : url;
}

const complete = async (page: Page) => {
  try {
    const state = JSON.parse(await page.getByTestId('state').innerText({ timeout: 500 }));
    return Object.values(SAVED).every((v) => state[v.stateKey] === v.label);
  } catch {
    return false; // the page has not rendered yet
  }
};

for (const filler of [0, 4000]) {
  test(`restores seven dropdowns quickly${filler ? ` on a page with ${filler} extra elements` : ''}`, async ({ context, worker }) => {
    const url = await seed(worker, filler);
    // Time from the start of the navigation, which is what a user experiences. Restore now begins
    // at DOMContentLoaded, so it overlaps with the rest of the page load.
    for (const open of context.pages()) await open.close();
    const page = await context.newPage();
    const started = Date.now();
    await page.goto(url, { waitUntil: 'commit' });
    await expect.poll(() => complete(page), { timeout: 60_000, intervals: [50] }).toBe(true);
    const ms = Date.now() - started;
    console.log(`PERF filler=${filler}: ${ms} ms from navigation start to all seven dropdowns restored`);
    // Deliberately loose: timings swing a lot on a busy machine. The number printed above is the signal; this only catches something badly broken.
    expect(ms).toBeLessThan(filler ? 20_000 : 15_000);
  });
}
