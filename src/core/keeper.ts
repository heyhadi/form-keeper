import { collectFields } from './collect';
import { isExcluded, isFormControl } from './filters';
import { pageKey } from './page';
import { remapToPage } from './remap';
import { restoreAll } from './restore';
import { serializeForm } from './serialize';
import type { RestoreReport, SavedFields } from './types';

export interface KeeperOptions {
  root: Document;
  /** Read on every event, so single-page-app navigations are picked up immediately. */
  getUrl(): string;
  load(page: string): Promise<SavedFields | undefined>;
  save(page: string, fields: SavedFields): Promise<void>;
  /** A new page (full load or SPA navigation) is now being kept. */
  onPage?(page: string): void;
  /** Restoring for `page` is over: everything matched, the user typed, or the window closed. */
  onRestore?(page: string, report: RestoreReport): void;
  debounceMs?: number;
  /** How long after a page opens we keep filling fields that show up late. */
  restoreWindowMs?: number;
  /** Mutations arrive in bursts while a framework renders; wait this long before retrying. */
  settleMs?: number;
}

export interface Keeper {
  /** Storage key of the page currently shown. */
  page(): string;
  /** Write any pending change now. */
  flush(): Promise<void>;
  /** Fill the page from storage right away (the popup's "Restore now"). */
  restoreNow(): Promise<RestoreReport>;
  /**
   * Fill the page from values saved elsewhere (another URL or form), matching fields by name.
   * `unmatched` lists source keys with no counterpart here.
   */
  restoreFrom(saved: SavedFields): Promise<RestoreReport & { unmatched: string[] }>;
  /** Drop everything known about the current page, e.g. after its storage was cleared. */
  forget(): void;
  stop(): void;
}

export const DEFAULT_DEBOUNCE_MS = 300;
export const DEFAULT_RESTORE_WINDOW_MS = 10_000;
export const DEFAULT_SETTLE_MS = 50;

interface RestoreRun {
  pending: SavedFields;
  total: RestoreReport;
  windowTimer: ReturnType<typeof setTimeout>;
  attemptTimer?: ReturnType<typeof setTimeout>;
  /** An attempt is in flight (widgets take real time); another request is queued behind it. */
  busy?: boolean;
  again?: boolean;
}

interface PageState {
  key: string;
  ready: Promise<void>;
  /** What storage holds for this page, as of load or our last write. */
  stored: SavedFields;
  lastWritten: string;
  /** Page fields as of the latest user edit, waiting to be written. */
  latest?: SavedFields;
  saveTimer?: ReturnType<typeof setTimeout>;
  restore?: RestoreRun;
}

const POKE_DELAY_MS = 150;
const SCAN_DELAY_MS = 250;
const FIELD_SELECTOR = 'input, textarea, select, option';

/** Could this mutation have produced a field we are still waiting to fill? */
function touchesFields(record: MutationRecord): boolean {
  // Attribute records are already filtered to `disabled` / `readonly`.
  if (record.type === 'attributes') return true;
  for (const node of record.addedNodes) {
    if (node.nodeType !== 1) continue;
    const el = node as Element;
    if (el.matches(FIELD_SELECTOR) || el.querySelector(FIELD_SELECTOR)) return true;
  }
  return false;
}

/**
 * Keeps form state for whatever page `root` is showing: restores saved fields as they appear and
 * saves user edits. Follows single-page-app navigations, treating each URL as its own page.
 */
export function startKeeper({
  root,
  getUrl,
  load,
  save,
  onPage,
  onRestore,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  restoreWindowMs = DEFAULT_RESTORE_WINDOW_MS,
  settleMs = DEFAULT_SETTLE_MS,
}: KeeperOptions): Keeper {
  const win = root.defaultView ?? globalThis;
  let restoring = false;
  let stopped = false;
  let current = openPage(pageKey(getUrl()));

  function openPage(key: string): PageState {
    const state: PageState = { key, ready: Promise.resolve(), stored: {}, lastWritten: '{}' };
    state.ready = load(key).then((saved) => {
      // Set even if the user has already navigated away: a pending write still merges over it.
      state.stored = saved ?? {};
      state.lastWritten = JSON.stringify(state.stored);
      if (state === current && !stopped) beginRestore(state);
    });
    onPage?.(key);
    return state;
  }

  /** Switch pages if the URL changed. Called before handling any event. */
  function sync(): void {
    if (stopped) return;
    const key = pageKey(getUrl());
    if (key === current.key) return;
    const previous = current;
    endRestore(previous);
    // `latest` was captured at edit time, so this writes the old page's fields even though the
    // DOM may already show the new page.
    void writeNow(previous);
    current = openPage(key);
  }

  async function writeNow(state: PageState): Promise<void> {
    if (state.saveTimer !== undefined) clearTimeout(state.saveTimer);
    state.saveTimer = undefined;
    const latest = state.latest;
    if (!latest) return;
    state.latest = undefined;
    await state.ready;
    // Merge over storage so fields that are not mounted right now (other wizard steps,
    // collapsed sections) are kept rather than silently dropped.
    const fields = { ...state.stored, ...latest };
    const json = JSON.stringify(fields);
    if (json === state.lastWritten) return;
    state.stored = fields;
    state.lastWritten = json;
    await save(state.key, fields);
  }

  function onEdit(event: Event): void {
    // Our own restore fires input/change/click synchronously; ignoring them here is what keeps
    // restore -> event -> save from looping.
    if (restoring || !isFormControl(event.target) || isExcluded(event.target)) return;
    sync();
    const state = current;
    // Once the user is typing, restoring further would overwrite their input.
    endRestore(state);
    // Serialize now rather than when the debounce fires: by then an SPA may have swapped the DOM
    // for another page.
    state.latest = serializeForm(root);
    if (state.saveTimer !== undefined) clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => void writeNow(state), debounceMs);
  }

  /**
   * Many custom controls (calendar days, dropdown options) change what the user sees without
   * firing `input`/`change` on a field. After a click, key press or blur, compare the page with
   * what is stored and save if it differs. Ignored while a restore is pending, when the page is
   * expected to differ from storage.
   */
  let pokeTimer: ReturnType<typeof setTimeout> | undefined;
  function onPoke(): void {
    if (restoring || stopped) return;
    if (pokeTimer !== undefined) clearTimeout(pokeTimer);
    // Wait for the widget to finish rendering the new value.
    pokeTimer = setTimeout(() => {
      pokeTimer = undefined;
      sync();
      const state = current;
      if (restoring || state.restore) return;
      const fields = serializeForm(root);
      const json = JSON.stringify({ ...state.stored, ...fields });
      if (json === state.lastWritten) return;
      state.latest = fields;
      state.saveTimer = setTimeout(() => void writeNow(state), debounceMs);
    }, POKE_DELAY_MS);
  }

  function beginRestore(state: PageState): void {
    if (Object.keys(state.stored).length === 0) {
      onRestore?.(state.key, { restored: [], unchanged: [], skipped: [], missing: [] });
      return;
    }
    state.restore = {
      pending: state.stored,
      total: { restored: [], unchanged: [], skipped: [], missing: [] },
      windowTimer: setTimeout(() => endRestore(state), restoreWindowMs),
    };
    void attempt(state);
  }

  async function attempt(state: PageState): Promise<void> {
    const run = state.restore;
    if (!run) return;
    // Widget restores take real time; never run two at once.
    if (run.busy) {
      run.again = true;
      return;
    }
    run.busy = true;
    restoring = true;
    let report: RestoreReport;
    try {
      report = await restoreAll(root, run.pending, () => state.restore !== run || stopped);
    } finally {
      restoring = false;
      run.busy = false;
    }
    // The restore may have been cancelled (user typed, navigated, stopped) while we were busy.
    if (state.restore !== run) return;
    run.total.restored.push(...report.restored);
    run.total.unchanged.push(...report.unchanged);
    // Skipped fields may become settable later (enabled, options loaded), so keep them pending.
    run.total.skipped = report.skipped;
    const retry = new Set([...report.missing, ...report.skipped.map((s) => s.key)]);
    run.pending = Object.fromEntries(Object.entries(run.pending).filter(([key]) => retry.has(key)));
    if (retry.size === 0) return endRestore(state);
    if (run.again) {
      run.again = false;
      void attempt(state);
    }
  }

  function cancelRestore(state: PageState): RestoreRun | undefined {
    const run = state.restore;
    if (!run) return undefined;
    state.restore = undefined;
    clearTimeout(run.windowTimer);
    if (run.attemptTimer !== undefined) clearTimeout(run.attemptTimer);
    return run;
  }

  function endRestore(state: PageState): void {
    const run = cancelRestore(state);
    if (!run) return;
    const skippedKeys = new Set(run.total.skipped.map((s) => s.key));
    run.total.missing = Object.keys(run.pending).filter((key) => !skippedKeys.has(key));
    onRestore?.(state.key, run.total);
  }

  // Custom widgets are built from plain elements, so we scan (debounced) to note how each one
  // looks before the user touches it; see widgets/baseline.ts.
  let scanTimer: ReturnType<typeof setTimeout> | undefined;
  function scheduleScan(): void {
    if (scanTimer !== undefined) return;
    scanTimer = setTimeout(() => {
      scanTimer = undefined;
      if (!stopped && !restoring) collectFields(root);
    }, SCAN_DELAY_MS);
  }
  scheduleScan();
  // Note each widget's look just before the user's first touch, in case they beat the scan.
  const onFirstTouch = () => {
    if (!restoring && !stopped) collectFields(root);
  };

  const observer = new MutationObserver((records) => {
    sync();
    if (records.some((r) => r.type === 'childList')) scheduleScan();
    const run = current.restore;
    if (!run || run.attemptTimer !== undefined || !records.some(touchesFields)) return;
    const state = current;
    run.attemptTimer = setTimeout(() => {
      run.attemptTimer = undefined;
      void attempt(state);
    }, settleMs);
  });
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled', 'readonly'],
  });

  function onHide(): void {
    if (root.visibilityState === 'hidden') void writeNow(current);
  }

  // Navigation API catches pushState navigations that don't touch the DOM; popstate covers
  // back/forward where it isn't available.
  const navigation = (win as { navigation?: EventTarget }).navigation;

  // Capture phase, so a page that stops propagation still gets saved.
  root.addEventListener('input', onEdit, true);
  root.addEventListener('change', onEdit, true);
  for (const type of ['click', 'keyup', 'focusout']) root.addEventListener(type, onPoke, true);
  for (const type of ['pointerdown', 'focusin']) root.addEventListener(type, onFirstTouch, true);
  root.addEventListener('visibilitychange', onHide);
  win.addEventListener('pagehide', onHide);
  win.addEventListener('popstate', sync);
  navigation?.addEventListener('navigatesuccess', sync);

  return {
    page() {
      sync();
      return current.key;
    },
    flush: () => writeNow(current),
    async restoreNow() {
      sync();
      const state = current;
      await state.ready;
      cancelRestore(state);
      restoring = true;
      let report: RestoreReport;
      try {
        report = await restoreAll(root, state.stored);
      } finally {
        restoring = false;
      }
      onRestore?.(state.key, report);
      return report;
    },
    async restoreFrom(saved) {
      sync();
      cancelRestore(current);
      const { fields, unmatched } = remapToPage(root, saved);
      restoring = true;
      let report: RestoreReport;
      try {
        report = await restoreAll(root, fields);
      } finally {
        restoring = false;
      }
      // Our own events are ignored for saving, so record the result as if the user had typed it.
      current.latest = serializeForm(root);
      void writeNow(current);
      return { ...report, unmatched };
    },
    forget() {
      sync();
      cancelRestore(current);
      if (current.saveTimer !== undefined) clearTimeout(current.saveTimer);
      current.saveTimer = undefined;
      current.latest = undefined;
      current.stored = {};
      current.lastWritten = '{}';
    },
    stop() {
      stopped = true;
      observer.disconnect();
      if (scanTimer !== undefined) clearTimeout(scanTimer);
      cancelRestore(current);
      if (current.saveTimer !== undefined) clearTimeout(current.saveTimer);
      root.removeEventListener('input', onEdit, true);
      root.removeEventListener('change', onEdit, true);
      for (const type of ['click', 'keyup', 'focusout']) root.removeEventListener(type, onPoke, true);
      for (const type of ['pointerdown', 'focusin']) root.removeEventListener(type, onFirstTouch, true);
      if (pokeTimer !== undefined) clearTimeout(pokeTimer);
      root.removeEventListener('visibilitychange', onHide);
      win.removeEventListener('pagehide', onHide);
      win.removeEventListener('popstate', sync);
      navigation?.removeEventListener('navigatesuccess', sync);
    },
  };
}
