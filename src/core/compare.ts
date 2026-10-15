import type { FieldValue, SavedFields } from './types';

/**
 * Checks whether two individual field values are strictly equal.
 */
export function areValuesEqual(a: FieldValue, b: FieldValue): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'text':
      return a.value === (b as typeof a).value;
    case 'checkbox':
      return a.checked === (b as typeof a).checked;
    case 'radio':
      return a.value === (b as typeof a).value;
    case 'multi': {
      const other = b as typeof a;
      return a.values.length === other.values.length && a.values.every((v, i) => v === other.values[i]);
    }
    case 'widget': {
      const other = b as typeof a;
      return (
        a.widget === other.widget &&
        a.labels.length === other.labels.length &&
        a.labels.every((l, i) => l === other.labels[i])
      );
    }
    case 'file': {
      const other = b as typeof a;
      if (a.files.length !== other.files.length) return false;
      return a.files.every((fA, i) => {
        const fB = other.files[i];
        if (!fB) return false;
        return (
          fA.name === fB.name &&
          fA.size === fB.size &&
          fA.lastModified === fB.lastModified &&
          fA.data === fB.data &&
          fA.skipped === fB.skipped
        );
      });
    }
  }
}

/**
 * Checks whether two SavedFields records have identical keys and values.
 * Used for deduplicating snapshots.
 */
export function areFieldsEqual(a: SavedFields, b: SavedFields): boolean {
  if (a === b) return true;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    const valA = a[key];
    const valB = b[key];
    if (!valA || !valB) return false;
    if (!areValuesEqual(valA, valB)) return false;
  }

  return true;
}
