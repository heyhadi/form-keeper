import { browser } from 'wxt/browser';
import {
  activeStatus,
  DEFAULT_SITE_SETTINGS,
  DEV_HOST_MATCHES,
  diagnose,
  withoutFileContents,
  INACTIVE_STATUS,
  isAllowedUrl,
  pageKey,
  pausedStatus,
  restoredStatus,
  getRecipes,
  setFilesEnabled,
  setRecipes,
  shouldSaveFiles,
  startKeeper,
  startTeaching,
  type Keeper,
  type RestoreReport,
  type SiteSettings,
  type TabStatus,
} from '@/core';
import type { StatusMessage, TabRequest, TabResponses } from '@/messages';
import { createBanner, type Banner } from '@/ui/banner';
import { addRecipe, clearPage, isPaused, loadFields, loadRecipes, loadSettings, pausedStorageKey, recipesStorageKey, saveFields, SETTINGS_KEY } from '@/storage';

const RUNNING = Symbol.for('form-keeper.running');

export default defineContentScript({
  // Dev hosts are declared here; sites the user enables are registered at runtime by the
  // background worker, which injects this same script.
  matches: DEV_HOST_MATCHES,
  // DOMContentLoaded, not `load`: a page with slow images or ads can take seconds to fire `load`,
  // and a form that renders later is picked up by the observer anyway.
  runAt: 'document_end',
  async main(ctx) {
    // The popup also injects this script right after a site is enabled; don't run twice.
    const scope = globalThis as { [RUNNING]?: boolean };
    if (scope[RUNNING]) return;
    scope[RUNNING] = true;

    // Independent storage reads, started together.
    const [initial, recipes, startPaused] = await Promise.all([loadSettings(), loadRecipes(location.origin), isPaused(location.origin)]);
    if (!isAllowedUrl(location.href, initial)) return;
    setFilesEnabled(shouldSaveFiles(location.href, initial));
    const origin = location.origin;
    let keeper: Keeper | undefined;
    let lastReport: RestoreReport | undefined;
    let allowed = true;
    let stopTeaching: (() => void) | undefined;
    let banner: Banner | undefined;
    setRecipes(recipes);

    function announce(status: TabStatus): void {
      const message: StatusMessage = { type: 'status', status };
      // Fails harmlessly if the extension was reloaded underneath this page.
      browser.runtime.sendMessage(message).catch(() => {});
    }

    function resume(): void {
      if (keeper || !allowed) return;
      keeper = startKeeper({
        root: document,
        getUrl: () => location.href,
        load: loadFields,
        save: saveFields,
        onPage: (page) => {
          lastReport = undefined;
          announce(activeStatus(page));
        },
        onRestore: (page, report) => {
          lastReport = report;
          announce(restoredStatus(page, report));
          console.debug('[form-keeper] restored', JSON.stringify(report));
        },
      });
    }

    function halt(status: TabStatus): void {
      if (keeper) {
        void keeper.flush();
        keeper.stop();
        keeper = undefined;
      }
      lastReport = undefined;
      announce(status);
    }

    /** Teach mode: the user shows us a control once; we remember how to drive it. */
    function teach(): void {
      stopTeaching?.();
      banner?.remove();
      const bar = (banner = createBanner(document));
      bar.show('Teach mode: click the control, then choose a value.', { cancel: () => stopTeaching?.() });
      const closeSoon = () => setTimeout(() => bar.remove(), 3500);
      stopTeaching = startTeaching(
        document,
        (el) => el === bar.host || bar.host.contains(el),
        async (result) => {
          stopTeaching = undefined;
          if (result.ok) {
            await addRecipe(origin, result.recipe);
            setRecipes(await loadRecipes(origin));
            // Nudge the keeper to save what is on screen now that the control is recognised.
            document.dispatchEvent(new Event('focusout', { bubbles: true }));
            bar.show(`Learned ${result.recipe.label ? `“${result.recipe.label}”` : 'this control'}. It will be saved and restored from now on.`, { tone: 'ok' });
            closeSoon();
          } else if (result.reason === 'cancelled') {
            bar.remove();
          } else {
            bar.show('Nothing changed. Open the control and pick a value, then try again.', { tone: 'error' });
            closeSoon();
          }
        },
      );
    }

    async function handle(request: TabRequest): Promise<TabResponses[TabRequest['type']] | undefined> {
      // Once the site is disabled, behave as if the script weren't here.
      if (!allowed) return undefined;
      switch (request.type) {
        case 'getState':
          return { page: keeper?.page() ?? pageKey(location.href), origin, paused: !keeper, report: lastReport };
        case 'restoreNow':
          return keeper ? keeper.restoreNow() : null;
        case 'restoreFrom': {
          const fields = await loadFields(request.page);
          return keeper && fields ? keeper.restoreFrom(fields) : null;
        }
        case 'teach':
          teach();
          return null;
        case 'diagnose': {
          const page = keeper?.page() ?? pageKey(location.href);
          const saved = await loadFields(page);
          return { ...diagnose(document), lastRestore: lastReport, saved: saved && withoutFileContents(saved) };
        }
        case 'clearPage': {
          const page = keeper?.page() ?? pageKey(location.href);
          keeper?.forget();
          await clearPage(page);
          lastReport = undefined;
          if (keeper) announce(activeStatus(page));
          return null;
        }
      }
    }

    const onMessage = (request: TabRequest, _sender: unknown, sendResponse: (response: unknown) => void) => {
      if (!allowed) return false;
      void handle(request).then(sendResponse);
      return true; // keep the channel open for the async response
    };

    const onStorageChange = async (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== 'local') return;
      const settings = changes[SETTINGS_KEY];
      if (settings) {
        const next = { ...DEFAULT_SITE_SETTINGS, ...(settings.newValue as Partial<SiteSettings> | undefined) };
        allowed = isAllowedUrl(location.href, next);
        setFilesEnabled(shouldSaveFiles(location.href, next));
        if (!allowed) halt(INACTIVE_STATUS);
        else if (!keeper && !(await isPaused(origin))) resume();
      }
      const recipes = changes[recipesStorageKey(origin)];
      if (recipes) setRecipes(Array.isArray(recipes.newValue) ? (recipes.newValue as ReturnType<typeof getRecipes>) : []);
      const paused = changes[pausedStorageKey(origin)];
      if (paused && allowed) {
        if (paused.newValue === true) halt(pausedStatus(origin));
        else resume();
      }
    };

    browser.runtime.onMessage.addListener(onMessage);
    browser.storage.onChanged.addListener(onStorageChange);
    ctx.onInvalidated(() => {
      stopTeaching?.();
      banner?.remove();
      keeper?.stop();
      scope[RUNNING] = false;
      browser.runtime.onMessage.removeListener(onMessage);
      browser.storage.onChanged.removeListener(onStorageChange);
    });

    if (startPaused) announce(pausedStatus(origin));
    else resume();
  },
});
