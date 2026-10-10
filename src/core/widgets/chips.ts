import { labelFor } from '../label';
import type { WidgetAdapter, WriteOutcome } from '../types';
import { isVisible, normalize, pressUntil, sleep } from './interact';

/**
 * A row of buttons where the chosen ones are highlighted ("chips", segmented controls, toggle
 * groups). They are not form fields: the state is only a colour. Selection is read from ARIA
 * (`aria-pressed`/`aria-checked`/`aria-selected`), `data-state`, a class such as `active`/`selected`,
 * or, failing all of those, from the buttons whose classes differ from the rest.
 *
 * Because clicking a button can do anything, a group is only treated as a field when it looks like
 * one: it has a label or sits in a form, and is not navigation, a toolbar, a menu or pagination.
 */

const BUTTONS = 'button, [role="button"]';
const NOT_A_FIELD = 'nav, [role="tablist"], [role="toolbar"], [role="menu"], [role="menubar"], [role="navigation"], [class*="pagination" i], [class*="breadcrumb" i], [class*="toolbar" i], [class*="navbar" i]';
const SELECTED_CLASS = /(^|[-_\s])(active|selected|checked|chosen|pressed|on)([-_\s]|$)/i;

const labelOf = (button: Element) => normalize(button.getAttribute('aria-label') ?? button.textContent);
const signature = (el: Element) => Array.from(el.classList).sort().join(' ');

function explicitlySelected(button: Element): boolean | undefined {
  for (const attr of ['aria-pressed', 'aria-checked', 'aria-selected']) {
    const value = button.getAttribute(attr);
    if (value !== null) return value === 'true';
  }
  const state = button.getAttribute('data-state');
  if (state !== null) return /^(on|checked|active|selected|open)$/i.test(state);
  return undefined;
}

/** The buttons of a group that look selected. */
function selectedButtons(buttons: Element[]): Element[] {
  const explicit = buttons.map(explicitlySelected);
  if (explicit.every((v) => v !== undefined)) return buttons.filter((_, i) => explicit[i]);

  const byClass = buttons.filter((b) => Array.from(b.classList).some((c) => SELECTED_CLASS.test(c)));
  if (byClass.length) return byClass;

  // Otherwise: the minority whose classes differ from the majority's.
  const counts = new Map<string, number>();
  for (const b of buttons) counts.set(signature(b), (counts.get(signature(b)) ?? 0) + 1);
  if (counts.size < 2) return [];
  const [majority] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
  const different = buttons.filter((b) => signature(b) !== majority);
  return different.length <= buttons.length / 2 ? different : [];
}

function buttonsOf(group: Element): HTMLElement[] {
  return Array.from(group.children).filter((c): c is HTMLElement => c.matches(BUTTONS) && isVisible(c));
}

export const chipsAdapter: WidgetAdapter = {
  id: 'chips',
  find(root) {
    const groups = new Set<HTMLElement>();
    for (const button of root.querySelectorAll<HTMLElement>(BUTTONS)) {
      const parent = button.parentElement;
      if (!parent || groups.has(parent) || parent.closest(NOT_A_FIELD)) continue;
      const buttons = buttonsOf(parent);
      // Mostly buttons, at least two of them, and none that open a menu or submit the form.
      if (buttons.length < 2 || buttons.length < parent.children.length * 0.8) continue;
      if (buttons.some((b) => b.matches('[type="submit"], [aria-haspopup], [aria-expanded], [aria-controls]') || b.querySelector('a'))) continue;
      if (!labelFor(parent, parent, true) && !parent.closest('form')) continue;
      groups.add(parent);
    }
    return [...groups];
  },
  read: (group) => selectedButtons(buttonsOf(group)).map(labelOf),
  async write(group, labels): Promise<WriteOutcome> {
    const buttons = buttonsOf(group);
    const want = new Set(labels.map((l) => normalize(l).toLowerCase()));
    const norm = (b: Element) => labelOf(b).toLowerCase();
    const missing = [...want].filter((w) => !buttons.some((b) => norm(b) === w));
    if (missing.length) return 'no-option';
    const current = () => new Set(selectedButtons(buttonsOf(group)).map(norm));
    const done = () => current().size === want.size && [...want].every((w) => current().has(w));
    if (done()) return 'unchanged';
    if (buttons.some((b) => b.matches('[disabled], [aria-disabled="true"]'))) return 'disabled';

    // Select what is missing first (a single-choice group deselects the others by itself),
    // then deselect anything still selected that should not be.
    for (const target of buttons.filter((b) => want.has(norm(b)) && !current().has(norm(b)))) {
      await pressUntil(target, () => current().has(norm(target)));
      await sleep(20);
    }
    for (const target of buttonsOf(group).filter((b) => !want.has(norm(b)) && current().has(norm(b)))) {
      await pressUntil(target, () => !current().has(norm(target)));
      await sleep(20);
    }
    return done() ? 'restored' : 'rejected';
  },
};
