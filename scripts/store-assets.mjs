// Generates the Chrome Web Store screenshots and promo tiles from the real extension.
// Needs the e2e build (hosts pre-granted): FK_E2E=1 npx wxt build
// Run: node scripts/store-assets.mjs
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXTENSION = resolve(ROOT, '.output-e2e/chrome-mv3');
const ORIGIN = 'http://localhost:5174';
const OUT = resolve(ROOT, 'store');
mkdirSync(`${OUT}/screenshots`, { recursive: true });
mkdirSync(`${OUT}/promo`, { recursive: true });

const server = spawn('npm', ['run', 'fixtures'], { cwd: ROOT, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 50; i++) {
  try { if ((await fetch(ORIGIN)).ok) break; } catch { /* not up yet */ }
  await sleep(200);
}

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  viewport: { width: 880, height: 640 },
  deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
});
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
const extensionId = new URL(worker.url()).host;

async function fresh(path) {
  for (const p of context.pages()) await p.close();
  const page = await context.newPage();
  await page.goto(ORIGIN + path);
  await sleep(700);
  return page;
}
const tabId = () => worker.evaluate(async () => (await chrome.tabs.query({}))[0].id);
async function popupShot(height = 560) {
  const id = await tabId();
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 360, height });
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tab=${id}`);
  await sleep(500);
  return { popup, png: await popup.screenshot() };
}
const data = (png) => `data:image/png;base64,${png.toString('base64')}`;

/** A 1280x800 marketing frame: headline, caption, the page on the left, the popup on the right. */
async function compose(name, { title, caption, pagePng, popupPng, wide = false }) {
  const html = `<!doctype html><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; }
    body { width: 1280px; height: 800px; font: 16px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif; color: #fff;
      background: radial-gradient(1200px 700px at 15% 0%, #4f46e5 0%, #312e81 55%, #1e1b4b 100%); padding: 56px 64px; overflow: hidden; position: relative; }
    h1 { font-size: 44px; line-height: 1.1; letter-spacing: -0.02em; max-width: 760px; }
    p { margin-top: 14px; font-size: 20px; opacity: .85; max-width: 640px; }
    .page { position: absolute; left: 64px; bottom: -40px; width: ${wide ? 1000 : 700}px; border-radius: 14px 14px 0 0; box-shadow: 0 30px 80px rgba(0,0,0,.5); background: #fff; }
    .popup { position: absolute; right: 64px; bottom: 44px; width: 340px; border-radius: 14px; box-shadow: 0 30px 80px rgba(0,0,0,.55); background: #fff; }
    img { display: block; width: 100%; border-radius: inherit; }
  </style>
  <h1>${title}</h1><p>${caption}</p>
  <div class="page"><img src="${data(pagePng)}"></div>
  ${popupPng ? `<div class="popup"><img src="${data(popupPng)}"></div>` : ''}`;
  const shot = await context.newPage();
  await shot.setViewportSize({ width: 1280, height: 800 });
  await shot.setContent(html);
  await sleep(200);
  // 'css' scale: the store wants exactly 1280x800, whatever the device pixel ratio.
  await shot.screenshot({ path: `${OUT}/screenshots/${name}.png`, scale: 'css' });
  await shot.close();
}

// 1. A plain form, filled in and restored.
let page = await fresh('/plain.html');
await page.fill('[name=name]', 'Ayu Lestari');
await page.fill('[name=email]', 'ayu@example.com');
await page.fill('[name=bio]', 'Building the onboarding flow.');
await page.check('[value=pro]');
await page.selectOption('[name=country]', 'id');
await sleep(900);
page = await fresh('/plain.html');
await page.fill('[name=bio]', 'Building the onboarding flow.').catch(() => {});
let pagePng = await page.screenshot({ clip: { x: 0, y: 0, width: 880, height: 640 } });
let { png: popupPng } = await popupShot();
await compose('1-restores-your-form', { title: 'Reload. Your form is still filled in.', caption: 'form-keeper saves what you type on your dev sites and puts it back after a refresh.', pagePng, popupPng });

// 2. UI-library widgets restored.
page = await fresh('/widgets.html');
const field = (label) => page.locator('.widget-field', { has: page.locator('label', { hasText: new RegExp(`^${label.replace(/[()]/g, '\\$&')}$`) }) });
await field('React Select (single)').locator('[class*="control"]').click();
await page.getByRole('option', { name: 'Jakarta' }).click();
await field('Ant Select (multiple)').locator('.ant-select').click();
await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last().locator('.ant-select-item-option[title="Singapore"]').click();
await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last().locator('.ant-select-item-option[title="Bangkok"]').click();
await page.keyboard.press('Escape');
await field('Ant Switch').getByRole('switch').click();
await field('MUI Select').getByRole('combobox').click();
await page.getByRole('option', { name: 'Bangkok' }).click();
await sleep(1200);
page = await fresh('/widgets.html');
await sleep(6000);
pagePng = await page.screenshot({ clip: { x: 0, y: 0, width: 880, height: 640 } });
({ png: popupPng } = await popupShot());
await compose('2-dropdowns-and-pickers', { title: 'Even custom dropdowns and date pickers.', caption: 'Works with react-select, Ant Design, MUI, Radix, Headless UI and more, with nothing to configure.', pagePng, popupPng });

// 3. Saved pages list.
page = await fresh('/plain.html');
await page.fill('[name=name]', 'Ayu');
await sleep(900);
page = await fresh('/spa/users/1/edit');
await page.fill('[name=name]', 'Budi');
await sleep(900);
page = await fresh('/react.html');
await sleep(1500);
pagePng = await page.screenshot({ clip: { x: 0, y: 0, width: 880, height: 640 } });
{
  const id = await tabId();
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 360, height: 420 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tab=${id}`);
  await popup.getByRole('tab', { name: /Saved pages/ }).click();
  await popup.locator('.page-main').first().click();
  await sleep(300);
  popupPng = await popup.screenshot();
}
await compose('3-fill-from-another-page', { title: 'Reuse a form on any other page.', caption: 'Every saved page is listed. Fill the form you are on from any of them with one click.', pagePng, popupPng });

// 4. Teach mode: use a control once, and it is learned.
page = await fresh('/custom.html');
const id4 = await tabId();
const p4 = await context.newPage();
await p4.goto(`chrome-extension://${extensionId}/popup.html?tab=${id4}`);
await p4.getByRole('button', { name: 'Teach a control' }).click();
await p4.close();
await page.bringToFront();
await page.evaluate(() => (document.body.style.paddingTop = '64px')); // keep the banner off the heading
await page.locator('#city .pk-v').click();
await page.locator('.pk-row', { hasText: /^Jakarta$/ }).click();
await page.locator('form-keeper-banner').getByText('Learned').waitFor();
await sleep(300);
pagePng = await page.screenshot({ clip: { x: 0, y: 0, width: 880, height: 640 } });
({ png: popupPng } = await popupShot(520));
await compose('4-teach-any-control', { title: 'Something unusual? Teach it once.', caption: 'Use a custom control one time and form-keeper learns how to save and restore it.', pagePng, popupPng });

// 5. Private, and only where you allow it.
page = await fresh('/plain.html');
{
  const id = await tabId();
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 360, height: 430 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tab=${id}`);
  await popup.getByRole('button', { name: 'Site settings' }).click();
  await sleep(300);
  popupPng = await popup.screenshot();
}
pagePng = await page.screenshot({ clip: { x: 0, y: 0, width: 880, height: 640 } });
await compose('5-private-by-design', { title: 'Private. Local. Only where you say.', caption: 'Nothing leaves your browser. Passwords and card numbers are never saved. Other sites need your permission.', pagePng, popupPng });

// Promo tile 440x280.
const tile = await context.newPage();
await tile.setViewportSize({ width: 440, height: 280 });
const icon = (await import('node:fs')).readFileSync(`${ROOT}/public/icon/128.png`);
await tile.setContent(`<!doctype html><meta charset="utf-8"><style>
  body { margin: 0; width: 440px; height: 280px; display: grid; place-content: center; justify-items: center; gap: 12px; text-align: center;
    font: 16px/1.3 system-ui, -apple-system, sans-serif; color: #fff; background: radial-gradient(500px 300px at 20% 0%, #4f46e5, #1e1b4b); }
  img { width: 84px; height: 84px; } h1 { margin: 0; font-size: 34px; letter-spacing: -0.02em; } p { margin: 0; opacity: .85; font-size: 16px; }
</style><img src="${data(icon)}"><h1>form-keeper</h1><p>Reload without losing your forms.</p>`);
await tile.screenshot({ path: `${OUT}/promo/small-tile-440x280.png`, scale: 'css' });

await context.close();
server.kill();
console.log('store assets written to', OUT);
