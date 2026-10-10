import type { SavedFields } from '@/core';
import { labelForKey, previewValue } from './format';

/** Saved fields as name/value rows. `missing` keys are dimmed (not on the page right now). */
export function FieldList({ fields, missing }: { fields: SavedFields; missing?: Set<string> }) {
  const entries = Object.entries(fields);
  // Only worth showing which form a field belongs to when there is more than one.
  const showScope = new Set(entries.map(([key]) => labelForKey(key).scope)).size > 1;
  return (
    <ul className="field-list">
      {entries.map(([key, value]) => {
        const label = labelForKey(key);
        const preview = previewValue(value);
        return (
          <li key={key} className={missing?.has(key) ? 'is-missing' : undefined} title={key}>
            <span className="field-name">
              {label.name}
              {showScope && label.scope && <span className="field-scope">{label.scope}</span>}
            </span>
            <span className={preview.empty ? 'field-value is-empty' : 'field-value'}>{preview.text}</span>
          </li>
        );
      })}
    </ul>
  );
}
