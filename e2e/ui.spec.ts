import { badge, expect, openPopup, ORIGIN, reopen, SETTLE_MS, test } from './fixtures';

test('toolbar badge shows ON, then the restored count', async ({ context, worker }) => {
  let page = await reopen(context, `${ORIGIN}/plain.html`);
  await expect.poll(() => badge(worker)).toBe('ON');
  await page.fill('[name=name]', 'Hadi');
  await page.fill('[name=email]', 'hadi@example.com');
  await page.waitForTimeout(SETTLE_MS);

  page = await reopen(context, `${ORIGIN}/plain.html`);
  await expect(page.locator('[name=name]')).toHaveValue('Hadi');
  await expect.poll(() => badge(worker)).toBe('2');
});

test('popup shows saved fields, restores on demand, clears, and pauses', async ({ context, worker, extensionId }) => {
  const page = await reopen(context, `${ORIGIN}/plain.html`);
  await page.fill('[name=name]', 'Hadi');
  await page.check('[value=pro]');
  await page.waitForTimeout(SETTLE_MS);
  // Change the value the way app code would (no input events), so it isn't saved over.
  await page.locator('[name=name]').evaluate((el: HTMLInputElement) => (el.value = 'changed'));

  const popup = await openPopup(context, worker, extensionId);
  await expect(popup.locator('.pill')).toHaveText('Active');
  await expect(popup.locator('.page .page-path')).toHaveText('/plain.html');
  await expect(popup.locator('.field-list li', { hasText: 'plan' })).toContainText('pro');
  await popup.screenshot({ path: 'test-results/popup-active.png' });

  await popup.click('text=Restore now');
  await expect(popup.getByRole('status')).toContainText('Restored');
  await expect(page.locator('[name=name]')).toHaveValue('Hadi');

  await popup.click('text=Clear this page');
  await expect(popup.locator('.empty')).toBeVisible();

  await popup.click('text=Pause on localhost:5174');
  await expect(popup.locator('.pill')).toHaveText('Paused');
  await page.fill('[name=email]', 'while-paused@example.com');
  await page.waitForTimeout(SETTLE_MS);
  await popup.click('text=Resume on localhost:5174');
  await expect(popup.locator('.pill')).toHaveText('Active');
  await expect(popup.locator('.empty')).toBeVisible(); // nothing was saved while paused
});

test('saved pages lists every URL and fills the current form from another one', async ({ context, worker, extensionId }) => {
  // Save a plain HTML form, then fill the React form (different page, different form) from it.
  let page = await reopen(context, `${ORIGIN}/plain.html`);
  await page.fill('[name=name]', 'Hadi');
  await page.fill('[name=email]', 'hadi@example.com');
  await page.check('[value=pro]');
  await page.selectOption('[name=country]', 'id');
  await page.waitForTimeout(SETTLE_MS);
  page = await reopen(context, `${ORIGIN}/spa/users/1/edit`);
  await page.fill('[name=name]', 'Alice');
  await page.waitForTimeout(SETTLE_MS);

  page = await reopen(context, `${ORIGIN}/react.html`);
  await page.waitForSelector('[name=name]');
  const popup = await openPopup(context, worker, extensionId);
  await popup.click('role=tab[name=/Saved pages/]');
  const rows = popup.locator('.page-list > li');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('/spa/users/1/edit');
  await expect(rows.nth(1)).toContainText('/plain.html');

  await popup.fill('input[type=search]', 'plain');
  await expect(rows).toHaveCount(1);
  await rows.first().locator('.page-main').click(); // peek at its fields
  await expect(rows.first().locator('.field-list')).toContainText('hadi@example.com');
  await popup.screenshot({ path: 'test-results/popup-saved.png' });

  await rows.first().getByRole('button', { name: 'Fill here' }).click();
  await expect(popup.getByRole('status')).toContainText('Filled 4 of');
  await expect
    .poll(() => page.getByTestId('state').innerText().then(JSON.parse))
    .toMatchObject({ name: 'Hadi', email: 'hadi@example.com', plan: 'pro', country: 'id' });

  // The filled values were saved for this page too.
  await popup.fill('input[type=search]', '');
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText('this page');
});

test('enables a non-dev site on request, then stops when it is removed', async ({ context, worker, extensionId }) => {
  const url = 'http://not-dev.test:5174/plain.html';
  let page = await reopen(context, url);
  let popup = await openPopup(context, worker, extensionId, 420);
  await expect(popup.locator('.pill')).toHaveText('Inactive');
  await popup.screenshot({ path: 'test-results/popup-inactive.png' });

  await popup.click('text=Enable on not-dev.test');
  await expect(popup.locator('.pill')).toHaveText('Active'); // injected into the open page
  await page.fill('[name=name]', 'on a real site');
  await page.waitForTimeout(SETTLE_MS);

  page = await reopen(context, url); // now via the registered content script
  await expect(page.locator('[name=name]')).toHaveValue('on a real site');
  await expect.poll(() => badge(worker)).toBe('1');

  popup = await openPopup(context, worker, extensionId);
  await popup.click('role=button[name="Site settings"]');
  await expect(popup.locator('.site-list')).toContainText('not-dev.test');
  await popup.screenshot({ path: 'test-results/popup-settings.png' });
  await popup.click('.site-list >> text=Remove');
  await expect(popup.locator('.site-list')).toHaveCount(0);

  page = await reopen(context, url);
  await page.waitForTimeout(1_000);
  await expect(page.locator('[name=name]')).toHaveValue('');
});
