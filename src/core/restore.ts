import { collectFields } from './collect';
import { effectiveLabels } from './widgets/baseline';
import { setNativeValue, trace } from './widgets/interact';
import { readField } from './serialize';
import type { Field, FieldValue, RestoreReport, SavedFields, SkipReason, WriteOutcome } from './types';

type Outcome = 'restored' | 'unchanged' | SkipReason;

export { setNativeValue };

function fire(el: Element, ...types: string[]): void {
  for (const type of types) el.dispatchEvent(new Event(type, { bubbles: true }));
}

/**
 * Checkboxes and radios are toggled with a real `click()`: it flips `checked` and fires `click`,
 * `input` and `change` exactly like a user would. React's `onChange` for these is driven by
 * `click`, so setting `checked` and firing `change` alone would be ignored.
 */
function toggleTo(el: HTMLInputElement, checked: boolean): Outcome {
  if (el.checked === checked) return 'unchanged';
  el.click();
  // A page handler can cancel the click; report it instead of claiming success.
  return el.checked === checked ? 'restored' : 'rejected';
}

function applyField(field: Exclude<Field, { kind: 'widget' }>, saved: FieldValue): Outcome {
  if (field.kind !== saved.kind) return 'kind-mismatch';

  if (field.kind === 'radio') {
    const value = (saved as Extract<FieldValue, { kind: 'radio' }>).value;
    const current = readField(field) as Extract<FieldValue, { kind: 'radio' }>;
    if (current.value === value) return 'unchanged';
    // Browsers offer no user action that clears a radio group, so we don't either.
    if (value === null) return 'rejected';
    const target = field.els.find((r) => r.value === value);
    if (!target) return 'no-option';
    if (target.disabled) return 'disabled';
    return toggleTo(target, true);
  }

  const el = field.el;
  if (el.disabled) return 'disabled';

  switch (field.kind) {
    case 'checkbox':
      return toggleTo(field.el, (saved as Extract<FieldValue, { kind: 'checkbox' }>).checked);

    case 'text': {
      const value = (saved as Extract<FieldValue, { kind: 'text' }>).value;
      if (field.el.value === value) return 'unchanged';
      if ('readOnly' in field.el && field.el.readOnly) return 'readonly';
      if (field.el.tagName === 'SELECT' && !Array.from((field.el as HTMLSelectElement).options).some((o) => o.value === value)) {
        return 'no-option';
      }
      setNativeValue(field.el, value);
      fire(field.el, 'input', 'change');
      // Pickers that only commit a typed value when the field loses focus.
      if (field.el.tagName === 'INPUT' && field.el.closest('[class*="picker" i], [class*="date" i]')) fire(field.el, 'blur', 'focusout');
      return 'restored';
    }

    case 'multi': {
      const wanted = new Set((saved as Extract<FieldValue, { kind: 'multi' }>).values);
      const options = Array.from(field.el.options);
      if (options.every((o) => o.selected === wanted.has(o.value))) return 'unchanged';
      for (const option of options) option.selected = wanted.has(option.value);
      fire(field.el, 'input', 'change');
      return 'restored';
    }
  }
}

function record(report: RestoreReport, key: string, outcome: Outcome): void {
  if (outcome === 'restored' || outcome === 'unchanged') report[outcome].push(key);
  else report.skipped.push({ key, reason: outcome });
}

const emptyReport = (): RestoreReport => ({ restored: [], unchanged: [], skipped: [], missing: [] });

/**
 * Writes saved values into the page's real form fields, in DOM order. Fields are collected once
 * up front, so a field that only appears after an earlier one is restored (e.g. a "show more"
 * checkbox) is reported as missing and picked up by the session's next attempt.
 *
 * Custom widgets need real interaction over time, so they are handled by `restoreWidgets`;
 * their keys count as present here so they are not reported missing.
 */
export function restoreForm(root: ParentNode, saved: SavedFields): RestoreReport {
  const report = emptyReport();
  const seen = new Set<string>();

  for (const field of collectFields(root)) {
    const value = saved[field.key];
    if (!value) continue;
    seen.add(field.key);
    if (field.kind === 'widget') continue;
    record(report, field.key, applyField(field, value));
  }

  report.missing = Object.keys(saved).filter((key) => !seen.has(key));
  return report;
}

/** Drives custom widgets (dropdowns, switches, rich text...) like a user would, one at a time. */
export async function restoreWidgets(root: ParentNode, saved: SavedFields, cancelled: () => boolean = () => false): Promise<RestoreReport> {
  const report = emptyReport();
  for (const field of collectFields(root)) {
    if (cancelled()) break;
    const value = saved[field.key];
    if (!value || field.kind !== 'widget') continue;
    let outcome: WriteOutcome | SkipReason;
    if (value.kind !== 'widget' || value.widget !== field.adapter.id) outcome = 'kind-mismatch';
    else if (value.labels.length === 0) {
      // Saved as empty (or untouched). Nothing to put back; fine if it is still empty.
      outcome = effectiveLabels(field.el, field.adapter.read(field.el)).length === 0 ? 'unchanged' : 'rejected';
    } else {
      try {
        outcome = await field.adapter.write(field.el, value.labels);
      } catch {
        outcome = 'rejected'; // a widget we misread must never break restoring the rest
      }
    }
    trace('widget', field.key, JSON.stringify(value.kind === 'widget' ? value.labels : value), '->', outcome);
    record(report, field.key, outcome);
  }
  return report;
}

/** Native fields first (instant), then widgets (interactive). */
export async function restoreAll(root: ParentNode, saved: SavedFields, cancelled?: () => boolean): Promise<RestoreReport> {
  const native = restoreForm(root, saved);
  const widgets = await restoreWidgets(root, saved, cancelled);
  return {
    restored: [...native.restored, ...widgets.restored],
    unchanged: [...native.unchanged, ...widgets.unchanged],
    skipped: [...native.skipped, ...widgets.skipped],
    missing: native.missing,
  };
}
