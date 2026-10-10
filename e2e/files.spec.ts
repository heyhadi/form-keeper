import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import type { Page } from '@playwright/test';
import { badge, expect, openPopup, ORIGIN, reopen, SETTLE_MS, test } from './fixtures';

const URL = `${ORIGIN}/files.html`;

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (b: Buffer) => (b.reduce((c, byte) => crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8), 0xffffffff) ^ 0xffffffff) >>> 0;
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
}
/** A real, decodable 24x24 PNG in one colour. */
function png([r, g, b]: [number, number, number]) {
  const size = 24;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(Array(size).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
}

const state = async (page: Page) => JSON.parse(await page.getByTestId('state').innerText()) as Record<string, string[]>;
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const inPageSha = (page: Page, id: string, index = 0) =>
  page.evaluate(
    async ([id, index]) => {
      const file = (document.getElementById(id as string) as HTMLInputElement).files![index as number]!;
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      return Array.from(new Uint8Array(digest), (x) => x.toString(16).padStart(2, '0')).join('');
    },
    [id, index] as const,
  );

async function ready(page: Page, worker: Parameters<typeof badge>[0]) {
  await expect.poll(() => badge(worker)).not.toBe('');
  await page.waitForTimeout(300);
}

test('re-attaches chosen files with identical bytes and working previews', async ({ context, worker }) => {
  const avatar = png([200, 40, 40]);
  const banner = png([40, 90, 200]);
  const report = Buffer.from('quarterly numbers\n'.repeat(50));

  let page = await reopen(context, URL);
  await ready(page, worker);
  await page.setInputFiles('#avatar', { name: 'me.png', mimeType: 'image/png', buffer: avatar });
  await page.setInputFiles('#docs', [
    { name: 'report.txt', mimeType: 'text/plain', buffer: report },
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') },
  ]);
  await page.setInputFiles('#banner', { name: 'banner.png', mimeType: 'image/png', buffer: banner }); // hidden input
  await page.waitForTimeout(SETTLE_MS + 500);

  page = await reopen(context, URL);
  await expect
    .poll(() => state(page), { timeout: 10_000 })
    .toEqual({
      avatar: [`me.png:${avatar.length}:image/png`],
      docs: [`report.txt:${report.length}:text/plain`, 'notes.txt:5:text/plain'],
      banner: [`banner.png:${banner.length}:image/png`],
    });

  // The app rebuilt its previews from the restored files, as if the user had just picked them.
  await expect(page.locator('#avatar-preview img')).toHaveCount(1);
  expect(await page.locator('#avatar-preview img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(24);
  await expect(page.locator('#docs-preview .doc')).toHaveText(['report.txt', 'notes.txt']);
  await expect(page.locator('#banner-preview img')).toHaveCount(1);

  // And they are the same bytes, not just the same names.
  expect(await inPageSha(page, 'avatar')).toBe(sha(avatar));
  expect(await inPageSha(page, 'docs', 0)).toBe(sha(report));
  expect(await inPageSha(page, 'banner')).toBe(sha(banner));
});

test('shows saved files with thumbnails in the popup', async ({ context, worker, extensionId }) => {
  let page = await reopen(context, URL);
  await ready(page, worker);
  await page.setInputFiles('#avatar', { name: 'me.png', mimeType: 'image/png', buffer: png([200, 40, 40]) });
  await page.setInputFiles('#docs', { name: 'report.txt', mimeType: 'text/plain', buffer: Buffer.from('x'.repeat(2048)) });
  await page.waitForTimeout(SETTLE_MS + 500);

  const popup = await openPopup(context, worker, extensionId);
  const avatar = popup.locator('.field-list li', { hasText: 'avatar' });
  await expect(avatar.locator('img.thumb')).toHaveCount(1);
  await expect(avatar).toContainText('me.png');
  await expect(popup.locator('.field-list li', { hasText: 'docs' })).toContainText('2.0 KB');
  await popup.screenshot({ path: 'test-results/popup-files.png' });
});

test('keeps only the name of a file that is too large', async ({ context, worker, extensionId }) => {
  let page = await reopen(context, URL);
  await ready(page, worker);
  await page.setInputFiles('#docs', { name: 'video.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(9 * 1024 * 1024, 1) });
  await page.waitForTimeout(SETTLE_MS + 1000);

  const popup = await openPopup(context, worker, extensionId);
  await expect(popup.locator('.field-list li', { hasText: 'docs' })).toContainText('not kept');
  await popup.close();

  page = await reopen(context, URL);
  await page.waitForTimeout(1500);
  expect((await state(page)).docs).toEqual([]);
});

test('on other sites, files are only saved after opting in', async ({ context, worker }) => {
  // Enable a non-dev host (as the popup would), without the opt-in for files.
  await worker.evaluate(() => chrome.storage.local.set({ settings: { allSites: false, sites: ['http://not-dev.test'], saveFilesOnOtherSites: false } }));
  const other = 'http://not-dev.test:5174/files.html';
  const file = { name: 'me.png', mimeType: 'image/png', buffer: png([10, 160, 90]) };

  let page = await reopen(context, other);
  await expect.poll(() => badge(worker), { timeout: 8000 }).toBe('ON');
  await page.waitForTimeout(300);
  await page.setInputFiles('#avatar', file);
  await page.waitForTimeout(SETTLE_MS + 500);
  page = await reopen(context, other);
  await page.waitForTimeout(1500);
  expect((await state(page)).avatar).toEqual([]);

  await worker.evaluate(() => chrome.storage.local.set({ settings: { allSites: false, sites: ['http://not-dev.test'], saveFilesOnOtherSites: true } }));
  page = await reopen(context, other);
  await expect.poll(() => badge(worker)).not.toBe('');
  await page.waitForTimeout(300);
  await page.setInputFiles('#avatar', file);
  await page.waitForTimeout(SETTLE_MS + 500);
  page = await reopen(context, other);
  await expect.poll(async () => (await state(page)).avatar, { timeout: 10_000 }).toEqual([`me.png:${file.buffer.length}:image/png`]);
});
