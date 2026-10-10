import { collectFields } from './collect';
import type { SavedFields } from './types';

/** Key minus its form scope: `form#signup name=email #2` -> `name=email #2`. */
export function identityOf(key: string): string {
  return key.slice(key.indexOf(' ') + 1);
}

export interface Remapped {
  /** Saved values re-keyed to fields on this page. */
  fields: SavedFields;
  /** Source keys that found no field here. */
  unmatched: string[];
}

/**
 * Re-keys values saved on one page or form so they fit the fields on `root`, for filling a
 * different page (`/users/1/edit` into `/users/2/edit`) or a different form.
 *
 * Exact key matches win. Otherwise a value goes to the first unclaimed field, in DOM order, with
 * the same identity (`name=email`) and kind, whatever form it is in. Only used when the user
 * explicitly asks; automatic restore stays exact so it can never put values in the wrong form.
 */
export function remapToPage(root: ParentNode, saved: SavedFields): Remapped {
  const pageFields = collectFields(root);
  const fields: SavedFields = {};
  const claimed = new Set<string>();
  const unmatched: string[] = [];
  const pending: string[] = [];

  for (const key of Object.keys(saved)) {
    const field = pageFields.find((f) => f.key === key);
    if (field && field.kind === saved[key]!.kind) {
      fields[key] = saved[key]!;
      claimed.add(key);
    } else {
      pending.push(key);
    }
  }

  for (const key of pending) {
    const value = saved[key]!;
    const identity = identityOf(key);
    const field = pageFields.find((f) => !claimed.has(f.key) && f.kind === value.kind && identityOf(f.key) === identity);
    if (!field) {
      unmatched.push(key);
      continue;
    }
    fields[field.key] = value;
    claimed.add(field.key);
  }

  return { fields, unmatched };
}
