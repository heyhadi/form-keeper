import { browser } from 'wxt/browser';
import { DEFAULT_SITE_SETTINGS, type Recipe, type SavedFields, type SiteSettings } from './core';

/** One working copy per page for now; M4 turns this into a snapshot history. */
export interface PageRecord {
  version: 1;
  savedAt: number;
  fields: SavedFields;
}

const PAGE_PREFIX = 'page:';
const PAUSED_PREFIX = 'paused:';
export const SETTINGS_KEY = 'settings';

export const pageStorageKey = (page: string) => PAGE_PREFIX + page;
export const pausedStorageKey = (origin: string) => PAUSED_PREFIX + origin;

export async function loadRecord(page: string): Promise<PageRecord | undefined> {
  const key = pageStorageKey(page);
  const record = (await browser.storage.local.get(key))[key] as PageRecord | undefined;
  return record?.version === 1 ? record : undefined;
}

export async function loadFields(page: string): Promise<SavedFields | undefined> {
  return (await loadRecord(page))?.fields;
}

/** Same fields with every file's contents dropped, keeping names so the popup can say what was lost. */
function withoutFileData(fields: SavedFields): SavedFields {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) =>
      value.kind === 'file' ? [key, { ...value, files: value.files.map(({ data: _data, ...rest }) => ({ ...rest, skipped: rest.skipped ?? 'budget' })) }] : [key, value],
    ),
  );
}

export async function saveFields(page: string, fields: SavedFields): Promise<void> {
  const write = (f: SavedFields) => browser.storage.local.set({ [pageStorageKey(page)]: { version: 1, savedAt: Date.now(), fields: f } satisfies PageRecord });
  try {
    await write(fields);
  } catch (error) {
    // Out of space (files are big): keep the form, forget the files, rather than losing everything.
    if (!Object.values(fields).some((v) => v.kind === 'file')) throw error;
    await write(withoutFileData(fields));
  }
}

export async function clearPage(page: string): Promise<void> {
  await browser.storage.local.remove(pageStorageKey(page));
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
}

/** Every saved page, most recently saved first. */
export async function listPages(): Promise<PageSummary[]> {
  const all = await browser.storage.local.get(null);
  return Object.entries(all)
    .filter(([key, record]) => key.startsWith(PAGE_PREFIX) && (record as PageRecord)?.version === 1)
    .map(([key, record]) => ({
      page: key.slice(PAGE_PREFIX.length),
      savedAt: (record as PageRecord).savedAt,
      fieldCount: Object.keys((record as PageRecord).fields).length,
    }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

export async function loadSettings(): Promise<SiteSettings> {
  const stored = (await browser.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] as Partial<SiteSettings> | undefined;
  return { ...DEFAULT_SITE_SETTINGS, ...stored };
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
