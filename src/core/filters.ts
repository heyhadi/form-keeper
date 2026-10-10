import type { FormControl } from './types';

/**
 * Input types we never capture. `hidden` usually carries CSRF tokens or server state that must
 * not be replayed; `file` is deferred to M3; the rest are buttons, not values.
 */
export const EXCLUDED_INPUT_TYPES = new Set([
  'password',
  'hidden',
  'file',
  'submit',
  'button',
  'reset',
  'image',
]);

/** Ancestors (or the field itself) with this attribute are ignored. */
export const OPT_OUT_SELECTOR = '[data-form-keeper="off"]';

export function isFormControl(node: unknown): node is FormControl {
  if (typeof node !== 'object' || node === null || !('tagName' in node)) return false;
  // Compare tag names rather than `instanceof`: content scripts run in an isolated world and
  // tests run in jsdom, so constructor identity is not something to rely on.
  const tag = (node as Element).tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function isCreditCardField(el: FormControl): boolean {
  // autocomplete is a token list, e.g. "billing cc-number".
  const tokens = (el.getAttribute('autocomplete') ?? '').toLowerCase().split(/\s+/);
  return tokens.some((token) => token.startsWith('cc-'));
}

export function isExcluded(el: FormControl): boolean {
  // aria-hidden inputs are implementation details of custom widgets (MUI's native select input,
  // date-field mirrors); the user never sees them.
  if (el.getAttribute('aria-hidden') === 'true') return true;
  if (el.tagName === 'INPUT' && EXCLUDED_INPUT_TYPES.has((el as HTMLInputElement).type)) {
    return true;
  }
  return isCreditCardField(el) || el.closest(OPT_OUT_SELECTOR) !== null;
}
