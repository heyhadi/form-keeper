import type { Page } from '@playwright/test';
import { badge, expect, ORIGIN, reopen, SETTLE_MS, test } from './fixtures';

const URL = `${ORIGIN}/widgets.html`;
const antdOption = (page: Page, title: string) => page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last().locator(`.ant-select-item-option[title="${title}"]`);
const field = (page: Page, label: string) => page.locator('.widget-field', { has: page.locator('label', { hasText: new RegExp(`^${label.replace(/[()]/g, '\\$&')}$`) }) });

interface Case {
  name: string;
  /** Which key of the page's state output this widget drives. */
  key: string;
  expected: unknown;
  fill(page: Page): Promise<void>;
}

const cases: Case[] = [
  {
    name: 'a dropdown that is disabled until another is set, with options loaded later',
    key: 'city',
    expected: 'Malang',
    async fill(page) {
      await field(page, 'Province').locator('[class*="control"]').click();
      await page.getByRole('option', { name: 'East Java' }).click();
      // Wait for the "server" to answer and the city list to be enabled.
      await expect(field(page, 'City (needs a province)').locator('[class*="control"][class*="disabled"]')).toHaveCount(0, { timeout: 5000 });
      await page.waitForTimeout(1800); // options arrive after the field is enabled
      await field(page, 'City (needs a province)').locator('[class*="control"]').click();
      await page.getByRole('option', { name: 'Malang' }).click();
    },
  },
  {
    name: 'react-select v4 (older version, no ARIA roles)',
    key: 'rsV4',
    expected: 'Jakarta',
    async fill(page) {
      await field(page, 'React Select v4 (legacy)').locator('[class*="control"]').click();
      await page.locator('[class*="option"]', { hasText: /^Jakarta$/ }).click();
    },
  },
  {
    name: 'react-select v4 multi',
    key: 'rsV4Multi',
    expected: ['Singapore', 'Bangkok'],
    async fill(page) {
      const f = field(page, 'React Select v4 (multi, legacy)');
      await f.locator('[class*="control"]').click();
      await page.locator('[class*="option"]', { hasText: /^Singapore$/ }).click();
      await f.locator('[class*="control"]').click();
      await page.locator('[class*="option"]', { hasText: /^Bangkok$/ }).click();
    },
  },
  {
    name: 'react-select v4 with a custom classNamePrefix',
    key: 'rsV4Prefixed',
    expected: 'Kuala Lumpur',
    async fill(page) {
      await field(page, 'React Select v4 (custom class prefix)').locator('.select__control').click();
      await page.locator('.select__option', { hasText: /^Kuala Lumpur$/ }).click();
    },
  },
  {
    name: 'react-select (single)',
    key: 'rsSingle',
    expected: 'Jakarta',
    async fill(page) {
      await field(page, 'React Select (single)').locator('[class*="control"]').click();
      await page.getByRole('option', { name: 'Jakarta' }).click();
    },
  },
  {
    name: 'react-select (multi)',
    key: 'rsMulti',
    expected: ['Singapore', 'Bangkok'],
    async fill(page) {
      const f = field(page, 'React Select (multi)');
      await f.locator('[class*="control"]').click();
      await page.getByRole('option', { name: 'Singapore' }).click();
      await f.locator('[class*="control"]').click();
      await page.getByRole('option', { name: 'Bangkok' }).click();
    },
  },
  {
    name: 'Ant Design Select (single)',
    key: 'antSingle',
    expected: 'Jakarta',
    async fill(page) {
      await field(page, 'Ant Select (single)').locator('.ant-select').click();
      await antdOption(page, "Jakarta").click();
    },
  },
  {
    name: 'Ant Design Select (multiple)',
    key: 'antMulti',
    expected: ['Singapore', 'Bangkok'],
    async fill(page) {
      const f = field(page, 'Ant Select (multiple)').locator('.ant-select');
      await f.click();
      await antdOption(page, "Singapore").click();
      await antdOption(page, "Bangkok").click();
      await page.keyboard.press('Escape');
    },
  },
  {
    name: 'Ant Design DatePicker',
    key: 'antDate',
    expected: '2026-10-15',
    async fill(page) {
      const input = field(page, 'Ant DatePicker').locator('input');
      await input.click();
      await input.fill('2026-10-15');
      await input.press('Enter');
    },
  },
  {
    name: 'Ant Design Switch',
    key: 'antOn',
    expected: true,
    async fill(page) {
      await field(page, 'Ant Switch').getByRole('switch').click();
    },
  },
  {
    name: 'MUI Select',
    key: 'muiSelect',
    expected: 'Jakarta',
    async fill(page) {
      await field(page, 'MUI Select').getByRole('combobox').click();
      await page.getByRole('option', { name: 'Jakarta' }).click();
    },
  },
  {
    name: 'MUI Autocomplete',
    key: 'muiAuto',
    expected: 'Bangkok',
    async fill(page) {
      await field(page, 'MUI Autocomplete').getByRole('combobox').click();
      await page.getByRole('option', { name: 'Bangkok' }).click();
    },
  },
  {
    name: 'MUI DateField (segmented)',
    key: 'muiDate',
    expected: '2026-10-15',
    async fill(page) {
      await field(page, 'MUI DateField (segmented)').getByRole('spinbutton').first().click();
      await page.keyboard.type('15102026');
    },
  },
  {
    name: 'Radix Select',
    key: 'radix',
    expected: 'Kuala Lumpur',
    async fill(page) {
      await field(page, 'Radix Select').getByRole('combobox').click();
      await page.getByRole('option', { name: 'Kuala Lumpur' }).click();
    },
  },
  {
    name: 'Headless UI Listbox',
    key: 'headless',
    expected: 'Bangkok',
    async fill(page) {
      await field(page, 'Headless UI Listbox').getByRole('button').click();
      await page.getByRole('option', { name: 'Bangkok' }).click();
    },
  },
  {
    name: 'Headless UI Combobox',
    key: 'hCombo',
    expected: 'Jakarta',
    async fill(page) {
      await field(page, 'Headless UI Combobox').getByRole('button').click();
      await page.getByRole('option', { name: 'Jakarta' }).click();
    },
  },
  {
    name: 'react-datepicker',
    key: 'rdp',
    expected: '2026-10-15',
    async fill(page) {
      const input = field(page, 'react-datepicker').locator('input');
      await input.click();
      await input.fill('15/10/2026');
      await input.press('Enter');
    },
  },
  {
    name: 'contenteditable',
    key: 'notes',
    expected: 'remember to hydrate',
    async fill(page) {
      await field(page, 'Notes (contenteditable)').locator('[contenteditable]').click();
      await page.keyboard.type('remember to hydrate');
    },
  },
];

const state = async (page: Page) => JSON.parse(await page.getByTestId('state').innerText()) as Record<string, unknown>;

for (const c of cases) {
  test(`restores ${c.name}`, async ({ context, worker }) => {
    let page = await reopen(context, URL);
    // A person can't touch a page within milliseconds of load; wait for the extension to start.
    await expect.poll(() => badge(worker)).not.toBe('');
    await page.waitForTimeout(300);
    await c.fill(page);
    await expect.poll(async () => (await state(page))[c.key], { message: 'the widget took the value' }).toEqual(c.expected);
    await page.waitForTimeout(SETTLE_MS + 400);

    page = await reopen(context, URL);
    await expect.poll(async () => (await state(page))[c.key], { timeout: 15_000, message: 'restored into the app state' }).toEqual(c.expected);
    if (c.key === 'city') expect((await state(page)).province).toBe('East Java');
  });
}
