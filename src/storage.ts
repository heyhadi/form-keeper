import { browser } from 'wxt/browser';
import {
  areFieldsEqual,
  checkForUpdate,
  DEFAULT_SITE_SETTINGS,
  type Recipe,
  type SavedFields,
  type SiteSettings,
  type Snapshot,
  type UpdateCheckResult,
  type WorkingDraft,
} from './core';

export type { Snapshot, UpdateCheckResult, WorkingDraft };

/** Stored record for a single page: a live working draft plus point-in-time snapshots. */
export interface PageRecord {
  version: 2;
  savedAt: number;
  fields: SavedFields;
  draft: WorkingDraft;
  snapshots: Snapshot[];
}

export const MAX_UNPINNED_SNAPSHOTS = 20;
export const MAX_SNAPSHOT_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const PAGE_PREFIX = 'page:';
const PAUSED_PREFIX = 'paused:';
export const SETTINGS_KEY = 'settings';

export const pageStorageKey = (page: string) => PAGE_PREFIX + page;
export const pausedStorageKey = (origin: string) => PAUSED_PREFIX + origin;

/** Migrates a raw storage object (v1 or unversioned) to a normalized PageRecord (v2). */
export function migrateRecord(raw: unknown): PageRecord | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;

  if (obj.version === 2) {
    const draftObj = (obj.draft && typeof obj.draft === 'object' ? obj.draft : {}) as Record<string, unknown>;
    const draftFields = (draftObj.fields ?? obj.fields ?? {}) as SavedFields;
    const draftSavedAt =
      typeof draftObj.savedAt === 'number'
        ? draftObj.savedAt
        : typeof obj.savedAt === 'number'
          ? obj.savedAt
          : Date.now();
    const rawSnapshots = Array.isArray(obj.snapshots) ? (obj.snapshots as Snapshot[]) : [];
    const snapshots = [...rawSnapshots].sort((a, b) => b.savedAt - a.savedAt);

    return {
      version: 2,
      savedAt: draftSavedAt,
      fields: draftFields,
      draft: {
        savedAt: draftSavedAt,
        fields: draftFields,
      },
      snapshots,
    };
  }

  // Version 1 or legacy unversioned record
  if (obj.version === 1 || (!obj.version && obj.fields && typeof obj.fields === 'object')) {
    const savedAt = typeof obj.savedAt === 'number' ? obj.savedAt : Date.now();
    const fields = (obj.fields as SavedFields) ?? {};
    return {
      version: 2,
      savedAt,
      fields,
      draft: {
        savedAt,
        fields,
      },
      snapshots: [],
    };
  }

  return undefined;
}

/** Prunes snapshots according to retention rules (max unpinned count & age limit). Pinned snapshots are always kept. */
export function pruneSnapshots(
  snapshots: Snapshot[],
  maxUnpinned = MAX_UNPINNED_SNAPSHOTS,
  now = Date.now(),
): Snapshot[] {
  const pinned: Snapshot[] = [];
  const unpinned: Snapshot[] = [];

  for (const s of snapshots) {
    if (s.pinned) {
      pinned.push(s);
    } else {
      if (now - s.savedAt <= MAX_SNAPSHOT_AGE_MS) {
        unpinned.push(s);
      }
    }
  }

  unpinned.sort((a, b) => b.savedAt - a.savedAt);
  const keptUnpinned = unpinned.slice(0, maxUnpinned);

  return [...pinned, ...keptUnpinned].sort((a, b) => b.savedAt - a.savedAt);
}

export async function loadRecord(page: string): Promise<PageRecord | undefined> {
  const key = pageStorageKey(page);
  const raw = (await browser.storage.local.get(key))[key];
  return migrateRecord(raw);
}

export async function loadFields(page: string): Promise<SavedFields | undefined> {
  return (await loadRecord(page))?.draft.fields;
}

/** Same fields with every file's contents dropped, keeping names so the popup can say what was lost. */
function withoutFileData(fields: SavedFields): SavedFields {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) =>
      value.kind === 'file'
        ? [
            key,
            {
              ...value,
              files: value.files.map(({ data: _data, ...rest }) => ({
                ...rest,
                skipped: rest.skipped ?? 'budget',
              })),
            },
          ]
        : [key, value],
    ),
  );
}

function recordWithoutFileData(record: PageRecord, unpinnedOnly = false): PageRecord {
  const snapshots = record.snapshots.map((s) => {
    if (unpinnedOnly && s.pinned) return s;
    return { ...s, fields: withoutFileData(s.fields) };
  });

  const draftFields = unpinnedOnly ? record.draft.fields : withoutFileData(record.draft.fields);
  return {
    ...record,
    fields: draftFields,
    draft: { ...record.draft, fields: draftFields },
    snapshots,
  };
}

export async function saveRecord(page: string, record: PageRecord): Promise<void> {
  const key = pageStorageKey(page);
  const write = (r: PageRecord) => browser.storage.local.set({ [key]: r });

  try {
    await write(record);
  } catch (error) {
    // Out of space (files are big):
    // 1. Try stripping file data from unpinned snapshots first
    try {
      await write(recordWithoutFileData(record, true));
      return;
    } catch {
      // 2. Strip file data everywhere (draft + snapshots) rather than losing the entire form
      if (
        !Object.values(record.draft.fields).some((v) => v.kind === 'file') &&
        !record.snapshots.some((s) => Object.values(s.fields).some((v) => v.kind === 'file'))
      ) {
        throw error;
      }
      await write(recordWithoutFileData(record, false));
    }
  }
}

export async function saveFields(page: string, fields: SavedFields): Promise<void> {
  const existing = await loadRecord(page);
  const now = Date.now();
  const draft: WorkingDraft = { savedAt: now, fields };
  const snapshots = existing?.snapshots ?? [];

  const record: PageRecord = {
    version: 2,
    savedAt: now,
    fields,
    draft,
    snapshots,
  };

  await saveRecord(page, record);
}

export interface CreateSnapshotOptions {
  label?: string;
  pinned?: boolean;
  trigger?: Snapshot['trigger'];
  fields?: SavedFields;
}

/**
 * Creates a point-in-time snapshot of the given fields (or current draft).
 * Deduplicates against the latest snapshot if values are identical.
 */
export async function createSnapshot(
  page: string,
  options: CreateSnapshotOptions = {},
): Promise<Snapshot | undefined> {
  const record = (await loadRecord(page)) ?? {
    version: 2,
    savedAt: Date.now(),
    fields: {},
    draft: { savedAt: Date.now(), fields: {} },
    snapshots: [],
  };

  const fields = options.fields ?? record.draft.fields;
  if (!fields || Object.keys(fields).length === 0) return undefined;

  // Deduplication: check against the most recent snapshot
  const latest = record.snapshots[0];
  if (latest && areFieldsEqual(latest.fields, fields)) {
    let modified = false;
    if (options.pinned && !latest.pinned) {
      latest.pinned = true;
      modified = true;
    }
    if (options.label && options.label !== latest.label) {
      latest.label = options.label;
      modified = true;
    }
    if (modified) await saveRecord(page, record);
    return latest;
  }

  const now = Date.now();
  const id = `${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const snapshot: Snapshot = {
    id,
    savedAt: now,
    fields,
    label: options.label,
    pinned: options.pinned ?? false,
    trigger: options.trigger ?? 'manual',
  };

  const updatedSnapshots = pruneSnapshots([snapshot, ...record.snapshots]);
  const updatedRecord: PageRecord = {
    ...record,
    snapshots: updatedSnapshots,
  };

  await saveRecord(page, updatedRecord);
  return snapshot;
}

export async function togglePinSnapshot(page: string, snapshotId: string): Promise<boolean> {
  const record = await loadRecord(page);
  if (!record) return false;
  const snapshot = record.snapshots.find((s) => s.id === snapshotId);
  if (!snapshot) return false;
  snapshot.pinned = !snapshot.pinned;
  await saveRecord(page, record);
  return snapshot.pinned;
}

export async function deleteSnapshot(page: string, snapshotId: string): Promise<void> {
  const record = await loadRecord(page);
  if (!record) return;
  record.snapshots = record.snapshots.filter((s) => s.id !== snapshotId);
  await saveRecord(page, record);
}

export async function renameSnapshot(page: string, snapshotId: string, label: string): Promise<void> {
  const record = await loadRecord(page);
  if (!record) return;
  const snapshot = record.snapshots.find((s) => s.id === snapshotId);
  if (!snapshot) return;
  snapshot.label = label.trim() || undefined;
  await saveRecord(page, record);
}

export async function getSnapshot(page: string, snapshotId: string): Promise<Snapshot | undefined> {
  const record = await loadRecord(page);
  return record?.snapshots.find((s) => s.id === snapshotId);
}

export async function clearPage(page: string, keepPinned = false): Promise<void> {
  if (!keepPinned) {
    await browser.storage.local.remove(pageStorageKey(page));
    return;
  }
  const record = await loadRecord(page);
  if (!record) return;
  const pinned = record.snapshots.filter((s) => s.pinned);
  if (pinned.length === 0) {
    await browser.storage.local.remove(pageStorageKey(page));
  } else {
    const now = Date.now();
    await saveRecord(page, {
      version: 2,
      savedAt: now,
      fields: {},
      draft: { savedAt: now, fields: {} },
      snapshots: pinned,
    });
  }
}

/** Removes every saved page; pause settings are kept. */
export async function clearAllPages(): Promise<void> {
  const all = await browser.storage.local.get(null);
  await browser.storage.local.remove(Object.keys(all).filter((key) => key.startsWith(PAGE_PREFIX)));
}

export async function countPages(): Promise<number> {
  const all = await browser.storage.local.get(null);
  return Object.keys(all).filter((key) => key.startsWith(PAGE_PREFIX)).length;
}

export async function bytesInUse(): Promise<number> {
  return browser.storage.local.getBytesInUse(null);
}

export async function isPaused(origin: string): Promise<boolean> {
  const key = pausedStorageKey(origin);
  return (await browser.storage.local.get(key))[key] === true;
}

export async function setPaused(origin: string, paused: boolean): Promise<void> {
  if (paused) await browser.storage.local.set({ [pausedStorageKey(origin)]: true });
  else await browser.storage.local.remove(pausedStorageKey(origin));
}

export interface PageSummary {
  page: string;
  savedAt: number;
  fieldCount: number;
  snapshotCount: number;
  pinnedCount: number;
}

/** Every saved page, most recently saved first. */
export async function listPages(): Promise<PageSummary[]> {
  const all = await browser.storage.local.get(null);
  return Object.entries(all)
    .filter(([key]) => key.startsWith(PAGE_PREFIX))
    .map(([key, raw]) => {
      const rec = migrateRecord(raw);
      if (!rec) return null;
      return {
        page: key.slice(PAGE_PREFIX.length),
        savedAt: rec.savedAt,
        fieldCount: Object.keys(rec.draft.fields).length,
        snapshotCount: rec.snapshots.length,
        pinnedCount: rec.snapshots.filter((s) => s.pinned).length,
      };
    })
    .filter((summary): summary is PageSummary => summary !== null)
    .sort((a, b) => b.savedAt - a.savedAt);
}

export async function loadSettings(): Promise<SiteSettings> {
  const stored = (await browser.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] as Partial<SiteSettings> | undefined;
  return {
    ...DEFAULT_SITE_SETTINGS,
    ...stored,
    patterns: stored?.patterns ?? DEFAULT_SITE_SETTINGS.patterns ?? [],
  };
}

export async function saveSettings(settings: SiteSettings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
}

const RECIPES_PREFIX = 'recipes:';
export const recipesStorageKey = (origin: string) => RECIPES_PREFIX + origin;

/** Controls the user taught us on this site. */
export async function loadRecipes(origin: string): Promise<Recipe[]> {
  const key = recipesStorageKey(origin);
  const stored = (await browser.storage.local.get(key))[key];
  return Array.isArray(stored) ? (stored as Recipe[]) : [];
}

export async function addRecipe(origin: string, recipe: Recipe): Promise<void> {
  // Teaching the same control again replaces the old lesson instead of piling up copies.
  const others = (await loadRecipes(origin)).filter((r) => !(r.label && r.label === recipe.label && r.path === recipe.path));
  await browser.storage.local.set({ [recipesStorageKey(origin)]: [...others, recipe] });
}

export async function removeRecipe(origin: string, id: string): Promise<void> {
  const rest = (await loadRecipes(origin)).filter((r) => r.id !== id);
  const key = recipesStorageKey(origin);
  if (rest.length) await browser.storage.local.set({ [key]: rest });
  else await browser.storage.local.remove(key);
}

export const UPDATE_INFO_KEY = 'update_info';
export const DEFAULT_UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function loadCachedUpdateInfo(): Promise<UpdateCheckResult | undefined> {
  const stored = (await browser.storage.local.get(UPDATE_INFO_KEY))[UPDATE_INFO_KEY];
  return stored as UpdateCheckResult | undefined;
}

export async function saveCachedUpdateInfo(info: UpdateCheckResult): Promise<void> {
  await browser.storage.local.set({ [UPDATE_INFO_KEY]: info });
}

export async function checkUpdateWithCache(
  currentVersion: string,
  force = false,
  cacheMaxAgeMs = DEFAULT_UPDATE_CHECK_INTERVAL_MS,
  fetchFn: typeof fetch = fetch,
): Promise<UpdateCheckResult> {
  if (!force) {
    const cached = await loadCachedUpdateInfo();
    if (cached && Date.now() - cached.checkedAt < cacheMaxAgeMs) {
      return cached;
    }
  }

  const result = await checkForUpdate(currentVersion, fetchFn);
  await saveCachedUpdateInfo(result);
  return result;
}
