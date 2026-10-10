import type { Page } from '@playwright/test';
import { badge, expect, openPopup, ORIGIN, reopen, SETTLE_MS, test } from './fixtures';

const URL = `${ORIGIN}/custom.html`;
const state = async (page: Page) => JSON.parse(await page.getByTestId('state').innerText()) as Record<string, unknown>;

/** A user choosing a value in one of the plain-div dropdowns. */
async function pick(page: Page, id: 'city' | 'fruit', value: string) {
  await page.locator(`#${id} .pk-v`).click();
  await page.locator('.pk-row', { hasText: new RegExp(`^${value}$`) }).click();
}

test('an unrecognised custom dropdown only restores after it has been taught', async ({ context, worker, extensionId }) => {
  let page = await reopen(context, URL);
  await expect.poll(() => badge(worker)).not.toBe('');
  await page.waitForTimeout(300);

  // 1. Nothing about this markup is standard, so it is not recognised and nothing comes back.
  await pick(page, 'city', 'Bangkok');
  await page.waitForTimeout(SETTLE_MS);
  page = await reopen(context, URL);
  await page.waitForTimeout(1500);
  expect((await state(page)).city).toBeNull();

  // 2. Teach both controls: start teach mode from the popup, then use the control once.
  await expect.poll(() => badge(worker)).not.toBe('');
  for (const [id, value] of [['city', 'Singapore'], ['fruit', 'Durian']] as const) {
    const popup = await openPopup(context, worker, extensionId);
    await popup.getByRole('button', { name: 'Teach a control' }).click();
    await expect(page.locator('form-keeper-banner')).toContainText('Teach mode');
    await pick(page, id, value);
    await expect(page.locator('form-keeper-banner')).toContainText('Learned', { timeout: 5000 });
    await popup.close().catch(() => {});
    await expect(page.locator('form-keeper-banner')).toHaveCount(0, { timeout: 6000 });
  }

  // 3. Use them normally; now both are saved and restored.
  await pick(page, 'city', 'Jakarta');
  await pick(page, 'fruit', 'Rambutan');
  await page.waitForTimeout(SETTLE_MS + 400);

  page = await reopen(context, URL);
  await expect.poll(() => state(page), { timeout: 12_000 }).toEqual({ city: 'Jakarta', fruit: 'Rambutan' });
});

test('the popup lists what could not be restored and what was taught', async ({ context, worker, extensionId }) => {
  let page = await reopen(context, URL);
  await expect.poll(() => badge(worker)).not.toBe('');
  const popup = await openPopup(context, worker, extensionId);
  await popup.getByRole('button', { name: 'Teach a control' }).click();
  await pick(page, 'city', 'Bangkok');
  await expect(page.locator('form-keeper-banner')).toContainText('Learned', { timeout: 5000 });

  const again = await openPopup(context, worker, extensionId);
  await expect(again.locator('.recipe-list')).toContainText('Favourite city');
  await again.screenshot({ path: 'test-results/popup-taught.png' });
  await again.getByRole('button', { name: 'Forget' }).click();
  await expect(again.locator('.recipe-list')).toHaveCount(0);
});
