import type { Page } from '@playwright/test';
import { badge, expect, ORIGIN, reopen, SETTLE_MS, test } from './fixtures';

const URL = `${ORIGIN}/svelte-widgets.html`;
const state = async (page: Page) => JSON.parse(await page.getByTestId('state').innerText()) as Record<string, unknown>;

test('restores svelte-select dropdowns and button chip groups into Svelte state', async ({ context, worker }) => {
  let page = await reopen(context, URL);
  await expect.poll(() => badge(worker)).not.toBe('');
  await page.waitForTimeout(300);

  await page.locator('.svelte-select').first().click();
  await page.locator('.list-item', { hasText: /^Webfleet$/ }).click();
  await page.locator('.svelte-select').nth(1).click();
  await page.locator('.list-item', { hasText: /^320d$/ }).click();
  for (const fuel of ['Diesel', 'Hybrid']) await page.getByRole('button', { name: fuel, exact: true }).click();
  await page.getByRole('button', { name: 'Manual', exact: true }).click();
  await expect.poll(() => state(page)).toEqual({ provider: 'Webfleet', model: '320d', fuelTypes: ['Diesel', 'Hybrid'], single: 'Manual' });
  await page.waitForTimeout(SETTLE_MS + 400);

  page = await reopen(context, URL);
  await expect
    .poll(() => state(page), { timeout: 15_000 })
    .toEqual({ provider: 'Webfleet', model: '320d', fuelTypes: ['Diesel', 'Hybrid'], single: 'Manual' });
});
