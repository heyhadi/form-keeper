import { collectFields } from './collect';
import type { Field, FieldValue, SavedFields } from './types';
import { effectiveLabels } from './widgets/baseline';

export function readField(field: Field): FieldValue {
  switch (field.kind) {
    case 'text':
      return { kind: 'text', value: field.el.value };
    case 'checkbox':
      return { kind: 'checkbox', checked: field.el.checked };
    case 'radio':
      return { kind: 'radio', value: field.els.find((r) => r.checked)?.value ?? null };
    case 'multi':
      return { kind: 'multi', values: Array.from(field.el.selectedOptions, (o) => o.value) };
    case 'widget':
      return { kind: 'widget', widget: field.adapter.id, labels: effectiveLabels(field.el, field.adapter.read(field.el)) };
  }
}

export function serializeForm(root: ParentNode): SavedFields {
  const saved: SavedFields = {};
  for (const field of collectFields(root)) saved[field.key] = readField(field);
  return saved;
}
