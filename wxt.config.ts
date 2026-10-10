import { defineConfig } from 'wxt';

const inactiveIcons = Object.fromEntries([16, 32, 48, 128].map((size) => [size, `icon-inactive/${size}.png`]));

/**
 * `FK_E2E=1` builds a test copy into .output-e2e with all hosts pre-granted, because Playwright
 * cannot click Chrome's permission prompt. Never load that build day to day.
 */
const e2e = process.env.FK_E2E === '1';

export default defineConfig({
  srcDir: 'src',
  outDir: e2e ? '.output-e2e' : '.output',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'form-keeper',
    description: 'Saves what you type in forms and puts it back after a reload. Runs on dev sites by default; enable any site you choose.',
    homepage_url: 'https://github.com/heyhadi/form-keeper',
    // activeTab: read the current tab's URL when the popup opens, to offer "Enable on this site".
    permissions: ['storage', 'unlimitedStorage', 'scripting', 'activeTab'],
    // Requested at runtime, per site or for all sites, from the popup.
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    ...(e2e && { host_permissions: ['http://*/*', 'https://*/*'] }),
    action: {
      // Grey until the content script reports in from an enabled host; see background.ts.
      default_icon: inactiveIcons,
      default_title: 'form-keeper',
    },
  },
});
