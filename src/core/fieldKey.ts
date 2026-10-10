import { isStableId, labelFor } from './label';
import type { FormControl } from './types';

/**
 * Field keys must survive a reload, so they are built only from markup, never from runtime
 * identity. A key is `<scope> <identity>`:
 *
 * - scope: the owning form's `id`, else its `name`, else its index in `document.forms`;
 *   `page` for controls outside any form (common in SPAs).
 * - identity: the control's `name`, else its `id` (unless a library generated it), else its
 *   visible label, else its tag path from the scope root. Checkboxes add their `value` so
 *   `tags[]` checkboxes stay distinct.
 *
 * `name` comes first because it is what the server receives, so apps keep it stable. Ids are
 * often generated (React `useId`, react-select, MUI), so those are skipped. Labels are what the
 * user sees and survive markup changes. The DOM path is the last resort and breaks when markup
 * above the field changes. Duplicates get a ` #n` suffix in DOM order.
 */
export function scopeKey(el: FormControl): string {
  const form = el.form;
  if (!form) return 'page';
  // Read attributes, not properties: a control named "id" or "name" shadows `form.id`.
  const id = form.getAttribute('id');
  if (id) return `form#${id}`;
  const name = form.getAttribute('name');
  if (name) return `form[name=${name}]`;
  return `form${Array.prototype.indexOf.call(el.ownerDocument.forms, form)}`;
}

export function identityKey(el: FormControl): string {
  const name = el.getAttribute('name');
  const isCheckbox = el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'checkbox';
  if (name) return isCheckbox ? `name=${name} value=${(el as HTMLInputElement).value}` : `name=${name}`;
  const id = el.getAttribute('id');
  if (id && isStableId(id)) return `id=${id}`;
  const label = labelFor(el);
  if (label) return `label=${label}`;
  return `path=${domPath(el, el.form ?? el.ownerDocument.body)}`;
}

/** Radio inputs are grouped by name within a scope, matching how browsers group them. */
export function radioGroupKey(el: HTMLInputElement): string {
  const name = el.getAttribute('name');
  return `${scopeKey(el)} ${name ? `radio=${name}` : identityKey(el)}`;
}

export function baseKey(el: FormControl): string {
  return `${scopeKey(el)} ${identityKey(el)}`;
}

/** Identity for a custom widget: its label, its id when stable, else its tag path. */
export function widgetIdentity(el: HTMLElement, anchor: HTMLElement = el): string {
  const label = labelFor(el, anchor, true);
  if (label) return `widget=${label}`;
  const id = anchor.getAttribute('id') ?? el.getAttribute('id');
  if (id && isStableId(id)) return `widget id=${id}`;
  const form = (anchor as Partial<FormControl>).form ?? el.closest('form');
  return `widget path=${domPath(el, form ?? el.ownerDocument.body)}`;
}

export function widgetScope(el: HTMLElement): string {
  const form = el.closest('form');
  if (!form) return 'page';
  const id = form.getAttribute('id');
  if (id) return `form#${id}`;
  const name = form.getAttribute('name');
  if (name) return `form[name=${name}]`;
  return `form${Array.prototype.indexOf.call(el.ownerDocument.forms, form)}`;
}

/** `div2>label1>input1`: tag plus 1-based position among same-tag siblings, up to `root`. */
export function domPath(el: Element, root: Element): string {
  const segments: string[] = [];
  let node: Element | null = el;
  while (node && node !== root) {
    const parent: Element | null = node.parentElement;
    let nth = 1;
    for (let sib = node.previousElementSibling; sib; sib = sib.previousElementSibling) {
      if (sib.tagName === node.tagName) nth++;
    }
    segments.unshift(`${node.tagName.toLowerCase()}${nth}`);
    node = parent;
  }
  return segments.join('>');
}

/** Hands out unique keys for one pass over the page, suffixing repeats with ` #2`, ` #3`... */
export function createKeyAllocator(): (base: string) => string {
  const seen = new Map<string, number>();
  return (base) => {
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} #${count}`;
  };
}
