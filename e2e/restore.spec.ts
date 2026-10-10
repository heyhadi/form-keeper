import { badge, expect, ORIGIN, reopen, SETTLE_MS, test } from './fixtures';

test('restores a plain HTML form and never restores sensitive fields', async ({ context }) => {
  let page = await reopen(context, `${ORIGIN}/plain.html`);
  await page.fill('[name=name]', 'Hadi');
  await page.fill('[name=email]', 'hadi@example.com');
  await page.fill('[name=start]', '2026-10-09');
  await page.fill('[name=bio]', 'line one\nline two');
  await page.check('[value=pro]');
  await page.check('[value=backend]');
  await page.selectOption('[name=country]', 'id');
  await page.selectOption('[name=langs]', ['ts', 'rs']);
  await page.fill('[name=password]', 'hunter2');
  await page.fill('[name=card]', '4242424242424242');
  await page.fill('[name=secret]', 'nope');
  await page.waitForTimeout(SETTLE_MS);

  page = await reopen(context, `${ORIGIN}/plain.html`);
  await expect(page.locator('[name=name]')).toHaveValue('Hadi');
  await expect(page.locator('[name=email]')).toHaveValue('hadi@example.com');
  await expect(page.locator('[name=start]')).toHaveValue('2026-10-09');
  await expect(page.locator('[name=bio]')).toHaveValue('line one\nline two');
  await expect(page.locator('[value=pro]')).toBeChecked();
  await expect(page.locator('[value=backend]')).toBeChecked();
  await expect(page.locator('[value=frontend]')).not.toBeChecked();
  await expect(page.locator('[name=country]')).toHaveValue('id');
  await expect(page.locator('[name=langs]')).toHaveValues(['ts', 'rs']);

  await expect(page.locator('[name=password]')).toHaveValue('');
  await expect(page.locator('[name=card]')).toHaveValue('');
  await expect(page.locator('[name=secret]')).toHaveValue('');
  await expect(page.locator('[name=csrf]')).toHaveValue('server-token');
});

const FRAMEWORKS = [
  { name: 'React', path: '/react.html' },
  { name: 'React, rendered after 6 s', path: '/react.html?delay=6000' },
  { name: 'Vue', path: '/vue.html' },
  { name: 'Svelte', path: '/svelte.html' },
];

for (const { name, path } of FRAMEWORKS) {
  test(`restores into ${name} state`, async ({ context }) => {
    test.slow();
    let page = await reopen(context, ORIGIN + path);
    await page.fill('[name=name]', 'Hadi', { timeout: 10_000 });
    await page.fill('[name=email]', 'hadi@example.com');
    await page.check('[value=pro]');
    await page.check('[name=newsletter]');
    await page.selectOption('[name=frequency]', 'weekly');
    await page.selectOption('[name=country]', 'id');
    await page.waitForTimeout(SETTLE_MS);

    page = await reopen(context, ORIGIN + path);
    const state = () => page.getByTestId('state').innerText().then(JSON.parse);
    // `frequency` only renders once `newsletter` is restored, so it lands on a later pass.
    await expect
      .poll(state, { timeout: 12_000 })
      .toMatchObject({ name: 'Hadi', email: 'hadi@example.com', plan: 'pro', newsletter: true, frequency: 'weekly', country: 'id' });

    await page.click('button[type=submit]');
    expect(JSON.parse(await page.getByTestId('submitted').innerText())).toEqual(await state());
  });
}

test('keeps each single-page-app route separate', async ({ context }) => {
  let page = await reopen(context, `${ORIGIN}/spa/users/1/edit`);
  await page.fill('[name=name]', 'Alice');
  await page.selectOption('[name=role]', 'admin');
  // Navigate client-side straight away, before the save debounce fires.
  await page.click('text=User 2');
  await expect(page.locator('h2')).toHaveText('Edit user 2');
  await page.fill('[name=name]', 'Bob');
  await page.waitForTimeout(SETTLE_MS);

  page = await reopen(context, `${ORIGIN}/spa/users/1/edit`);
  await expect.poll(() => page.getByTestId('state').innerText().then(JSON.parse)).toEqual({ name: 'Alice', role: 'admin' });

  page = await reopen(context, `${ORIGIN}/spa/users/2/edit`);
  await expect.poll(() => page.getByTestId('state').innerText().then(JSON.parse)).toEqual({ name: 'Bob', role: 'viewer' });
});

test('does nothing on non-dev hosts', async ({ context, worker }) => {
  const url = 'http://not-dev.test:5174/plain.html';
  let page = await reopen(context, url);
  await page.fill('[name=name]', 'Hadi');
  await page.waitForTimeout(SETTLE_MS);

  page = await reopen(context, url);
  await page.waitForTimeout(1_000);
  await expect(page.locator('[name=name]')).toHaveValue('');
  expect(await badge(worker)).toBe('');
});
