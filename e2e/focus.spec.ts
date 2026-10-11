import type { Page } from '@playwright/test';
import { badge, expect, ORIGIN, reopen, SETTLE_MS, test } from './fixtures';

const URL = `${ORIGIN}/widgets.html`;
const state = async (page: Page) => JSON.parse(await page.getByTestId('state').innerText()) as Record<string, unknown>;

/**
 * The page is open but its window does not have focus (DevTools focused, another app in front, a
 * background tab). Chrome then moves `activeElement` on `focus()` but delivers no focus events, and
 * `document.hasFocus()` is false. Headless Chromium is always focused, so model exactly that.
 */
async function openUnfocused(context: Parameters<typeof reopen>[0], url: string) {
  for (const p of context.pages()) await p.close();
  const page = await context.newPage();
  await page.addInitScript(() => {
    document.hasFocus = () => false;
    for (const type of ['focus', 'focusin', 'blur', 'focusout']) {
      window.addEventListener(type, (e) => e.isTrusted && e.stopImmediatePropagation(), true);
    }
    // Only genuine focus events are dropped; ones a script dispatches on purpose get through.
  });
  await page.goto(url);
  return { page };
}

test('restores dropdowns even when the page does not have window focus', async ({ context, worker }) => {
  let page = await reopen(context, URL);
  await expect.poll(() => badge(worker)).not.toBe('');
  await page.waitForTimeout(300);
  const f = (label: string) => page.locator('.widget-field', { has: page.locator('label', { hasText: new RegExp(`^${label.replace(/[()]/g, '\\$&')}$`) }) });
  await f('React Select v4 (legacy)').locator('[class*="control"]').click();
  await page.locator('[class*="option"]', { hasText: /^Jakarta$/ }).click();
  await f('React Select (single)').locator('[class*="control"]').click();
  await page.getByRole('option', { name: 'Bangkok' }).click();
  await page.waitForTimeout(SETTLE_MS + 400);

  const opened = await openUnfocused(context, URL);
  page = opened.page;
  expect(await page.evaluate(() => document.hasFocus())).toBe(false); // this really is the unfocused case
  await expect.poll(() => state(page), { timeout: 15_000 }).toMatchObject({ rsV4: 'Jakarta', rsSingle: 'Bangkok' });
});
