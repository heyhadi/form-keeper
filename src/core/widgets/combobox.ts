import { labelFor } from '../label';
import type { WidgetAdapter, WriteOutcome } from '../types';
import { focus, isVisible, normalize, pressKey, pressUntil, sleep, trace, typeInto, waitFor } from './interact';

/**
 * Dropdowns, selects and autocompletes from any UI library, found by their accessibility markup
 * rather than class names. Libraries differ in markup but nearly all follow the ARIA combobox /
 * listbox pattern: a trigger with role=combobox (or a button with aria-haspopup=listbox), and a
 * list of role=option elements, often rendered in a portal at the end of <body>.
 */

/**
 * Standard markup first. The extra entries are for older libraries that predate (or skip) the ARIA
 * combobox role but still leave tell-tale attributes: react-select 1-4 (`react-select-N-input`),
 * and anything with an autocomplete-list input or a listbox popup.
 */
const TRIGGER = [
  '[role="combobox"]',
  '[aria-haspopup="listbox"]',
  'input[aria-autocomplete="list"]',
  'input[id^="react-select-"][id$="-input"]',
].join(', ');
const GROUPING_STOP = 'label, [role="combobox"], select, textarea, input:not([type="hidden"]):not([aria-hidden="true"])';

/** Elements that each stand for one chosen value, in the popular libraries and by convention. */
const TOKEN =
  '[class*="multiValue"]:not([class*="multiValue__"]), [class*="singleValue"], [class*="multi-value"]:not([class*="multi-value__"]), [class*="single-value"], [class*="selection-item"]:not([class*="selection-item-"]), [class*="select-selection-item"], .MuiChip-root, [class*="chip" i]:not([class*="chip-"]), [class*="tag" i]:not([class*="tags"]):not([class*="tag-"]):not(svg)';
const PLACEHOLDER = '[class*="placeholder" i], [data-placeholder], [aria-hidden="true"], [aria-live], svg, input, textarea, [role="img"], [role="button"], button, .MuiSelect-icon';

/** Widget root for a trigger: the largest ancestor that still holds only this one control. */
export function rootOf(trigger: HTMLElement): HTMLElement {
  let root = trigger;
  for (let i = 0; i < 5; i++) {
    const parent = root.parentElement;
    if (!parent || parent === trigger.ownerDocument.body) break;
    const others = Array.from(parent.querySelectorAll(GROUPING_STOP)).filter(
      (el) => el !== trigger && !trigger.contains(el) && !root.contains(el),
    );
    if (others.length > 0) break;
    root = parent;
  }
  return root;
}

/** Text the control shows, minus icons, buttons and placeholders. The root itself is always read. */
function visibleText(el: Element): string {
  let text = '';
  const walk = (node: Node) => {
    if (node.nodeType === 3) text += node.textContent;
    else if (node.nodeType === 1 && !(node as Element).matches(PLACEHOLDER) && isVisible(node as Element, { opacity: false })) node.childNodes.forEach(walk);
  };
  el.childNodes.forEach(walk);
  return normalize(text);
}

function tokenLabel(token: Element): string {
  // Drop the "remove" button/icon inside chips by reading only content text.
  return visibleText(token) || normalize(token.getAttribute('title'));
}

export function readCombobox(root: HTMLElement): string[] {
  // Radix and others flag the trigger itself while it shows its placeholder.
  if (root.matches('[data-placeholder]')) return [];

  const tokens = Array.from(root.querySelectorAll(TOKEN)).filter((t) => !t.parentElement?.closest(TOKEN) || t.parentElement.closest(TOKEN) === t);
  const fromTokens = tokens.map(tokenLabel).filter(Boolean);
  if (fromTokens.length) return fromTokens;

  // An editable input holds the value as text (autocompletes, comboboxes). When it is empty the
  // choice may still be shown next to it (svelte-select), so fall through to what the control displays.
  const input = root.matches('input') ? (root as HTMLInputElement) : root.querySelector<HTMLInputElement>('input:not([type="hidden"]):not([aria-hidden="true"])');
  if (input && !input.readOnly && input.value) return [normalize(input.value)];

  // Otherwise whatever text the control shows (MUI Select, Radix and Headless UI triggers).
  const shown = visibleText(root);
  return shown ? [shown] : [];
}

/** How to recognise an open list and its options. Pluggable so unknown widgets can use text alone. */
export interface Strategy {
  /** Visible option elements for the list `trigger` opened, excluding anything in `stale`. */
  options(trigger: HTMLElement, stale?: Set<Element>): HTMLElement[];
  /** Everything this strategy could mistake for an option on screen right now (the "stale" set). */
  snapshot(doc: Document): HTMLElement[];
  /** Pop-up lists on screen, used to wait for an old popup to finish closing. */
  popups(doc: Document): HTMLElement[];
  isOpen(trigger: HTMLElement, stale?: Set<Element>): boolean;
  /** True when this trigger is already holding its own list open (e.g. a multi-select mid-way). */
  heldOpen(trigger: HTMLElement): boolean;
}

function ariaOptions(doc: Document, scopes: ParentNode[] = [doc]): HTMLElement[] {
  const options = scopes.flatMap((scope) => Array.from(scope.querySelectorAll<HTMLElement>('[role="option"], [role="menuitem"], [role="menuitemradio"]')));
  const visible = options.filter((el) => isVisible(el));
  if (visible.length) return visible;
  // Libraries that don't set roles on visible items: fall back to class-name hints.
  return Array.from(doc.querySelectorAll<HTMLElement>('[class*="option" i], [class*="select-item"], [class*="dropdown-item" i], [class*="menu-item" i]')).filter(
    (el) => isVisible(el) && !el.querySelector('[class*="option" i]') && !!normalize(el.textContent),
  );
}

/** The standard case: ARIA roles, with class-name hints as a fallback. */
export const ARIA_STRATEGY: Strategy = {
  options(trigger, stale) {
    const doc = trigger.ownerDocument;
    const owned = (trigger.getAttribute('aria-controls') ?? trigger.getAttribute('aria-owns'))
      ?.split(/\s+/)
      .map((id) => doc.getElementById(id))
      .filter((el): el is HTMLElement => !!el);
    const options = ariaOptions(doc, owned?.length ? owned : [doc]);
    return stale ? options.filter((o) => !stale.has(o)) : options;
  },
  snapshot: (doc) => ariaOptions(doc),
  popups: (doc) => ariaOptions(doc),
  isOpen(trigger, stale) {
    return trigger.getAttribute('aria-expanded') === 'true' || this.options(trigger, stale).length > 0;
  },
  heldOpen: (trigger) => trigger.getAttribute('aria-expanded') === 'true',
};

const OPTION_WAIT_MS = 1500;
const TEXT_CANDIDATES = 'li, div, span, a, button, p, td, label, [role], [class*="item" i], [class*="option" i]';
/** Text that is announced to screen readers or hidden from users, never an option. */
const NOT_AN_OPTION = '[aria-live], [role="status"], [role="alert"], [role="log"], [aria-hidden="true"], [class*="a11y" i], [class*="sr-only" i], [class*="visually-hidden" i]';
const MAX_OPTION_TEXT = 80;

/**
 * For widgets with no standard markup: an option is any short, visible piece of text that was not
 * on screen before the control was opened, outside the control itself. Needs no roles or classes.
 */
export const TEXT_STRATEGY: Strategy = {
  options(trigger, stale) {
    const doc = trigger.ownerDocument;
    const texty = Array.from(doc.querySelectorAll<HTMLElement>(TEXT_CANDIDATES)).filter((el) => {
      if (trigger.contains(el) || el.contains(trigger) || (stale && stale.has(el)) || el.closest(NOT_AN_OPTION)) return false;
      const text = normalize(el.textContent);
      if (!text || text.length > MAX_OPTION_TEXT) return false;
      // Innermost element carrying the text, so we click the option and not its wrapper.
      return !Array.from(el.children).some((child) => normalize(child.textContent) === text) && isVisible(el);
    });
    return texty;
  },
  snapshot: (doc) =>
    Array.from(doc.querySelectorAll<HTMLElement>(TEXT_CANDIDATES)).filter((el) => {
      const text = normalize(el.textContent);
      return !!text && text.length <= MAX_OPTION_TEXT && isVisible(el) && !el.closest(NOT_AN_OPTION);
    }),
  popups: () => [],
  // No aria-expanded to read: "open" means something new appeared.
  isOpen(trigger, stale) {
    return this.options(trigger, stale).length > 0;
  },
  heldOpen: () => false,
};

/**
 * The default for dropdowns found by their markup: trust ARIA options when the library provides
 * them, and otherwise fall back to "whatever text newly appeared". Libraries such as svelte-select
 * render options as plain `list-item` elements with no role and no recognisable class, so the
 * fallback is what makes them work without a special case.
 */
export const AUTO_STRATEGY: Strategy = {
  options(trigger, stale) {
    const aria = ARIA_STRATEGY.options(trigger, stale);
    return aria.length ? aria : TEXT_STRATEGY.options(trigger, stale);
  },
  snapshot: (doc) => [...ARIA_STRATEGY.snapshot(doc), ...TEXT_STRATEGY.snapshot(doc)],
  popups: (doc) => ARIA_STRATEGY.popups(doc),
  isOpen(trigger, stale) {
    return trigger.getAttribute('aria-expanded') === 'true' || this.options(trigger, stale).length > 0;
  },
  heldOpen: (trigger) => ARIA_STRATEGY.heldOpen(trigger),
};

function findOption(strategy: Strategy, trigger: HTMLElement, label: string, stale?: Set<Element>): HTMLElement | undefined {
  const options = strategy.options(trigger, stale);
  const want = normalize(label).toLowerCase();
  const text = (el: HTMLElement) => normalize(el.getAttribute('aria-label') ?? el.textContent).toLowerCase();
  return options.find((o) => text(o) === want) ?? options.find((o) => text(o).startsWith(want)) ?? options.find((o) => text(o).includes(want));
}

async function open(strategy: Strategy, trigger: HTMLElement, stale: Set<Element>): Promise<boolean> {
  if (strategy.isOpen(trigger, stale)) return true;
  focus(trigger);
  if (await pressUntil(trigger, () => strategy.isOpen(trigger, stale))) return true;
  for (const key of ['ArrowDown', ' ', 'Enter']) {
    pressKey(trigger, key);
    if (await waitFor(() => strategy.isOpen(trigger, stale), 120)) return true;
  }
  return false;
}

/** Waits until no option list is on screen, e.g. a previous dropdown finishing its close animation. */
const quiet = (strategy: Strategy, doc: Document) => waitFor(() => strategy.popups(doc).length === 0, 800);

async function close(strategy: Strategy, trigger: HTMLElement, stale: Set<Element>): Promise<void> {
  const doc = trigger.ownerDocument;
  const open = () => strategy.isOpen(trigger, stale);
  if (!open()) return;
  pressKey(trigger, 'Escape');
  if (await waitFor(() => !open(), 250)) return;
  // Most libraries also close on a press outside, which they detect on mousedown/pointerdown.
  await pressUntil(doc.body, () => !open());
}

/** `isSelected` lets pickers that stay open after a choice (multi-selects) still count as done. */
async function choose(strategy: Strategy, trigger: HTMLElement, label: string, isSelected: () => boolean, stale: Set<Element>): Promise<boolean> {
  trace('choose', label, 'expanded:', trigger.getAttribute('aria-expanded'));
  const opened = await open(strategy, trigger, stale);
  trace('opened:', opened, 'options:', strategy.options(trigger, stale).map((o) => normalize(o.textContent)).slice(0, 12));
  if (!opened) return false;
  // Lists are often fetched when the control opens, so give them time to arrive.
  let option = await waitFor(() => findOption(strategy, trigger, label, stale), OPTION_WAIT_MS);
  if (!option) {
    // Long or virtualised lists: narrow them by typing, if there is somewhere to type.
    const input = trigger.matches('input') ? (trigger as HTMLInputElement) : trigger.querySelector<HTMLInputElement>('input:not([type="hidden"])') ?? trigger.parentElement?.querySelector<HTMLInputElement>('input:not([type="hidden"])');
    if (input && !input.readOnly) {
      focus(input);
      typeInto(input, label);
      option = await waitFor(() => findOption(strategy, trigger, label, stale), OPTION_WAIT_MS);
    }
  }
  trace('option found:', !!option);
  if (!option) return false;
  const done = () => isSelected() || !option!.isConnected || !strategy.isOpen(trigger, stale) || !isVisible(option!);
  if (await pressUntil(option, done)) return true;
  // Some libraries only commit a choice from the keyboard: Enter on the focused option, or on
  // the trigger when the option is "active" through aria-activedescendant.
  for (const target of [option, trigger]) {
    if (!option.isConnected) break;
    focus(target);
    pressKey(target, 'Enter');
    await sleep(60);
    if (done()) return true;
  }
  return isSelected() || !option.isConnected;
}

/** Disabled by attribute, by ARIA, or by the class names libraries use (`is-disabled`, `--disabled`). */
function isDisabledControl(root: HTMLElement, trigger: HTMLElement): boolean {
  const flagged = '[disabled], [aria-disabled="true"], [class*="is-disabled" i], [class*="--disabled" i], [class*="-disabled" i], [class*="disabled" i]';
  for (let el: HTMLElement | null = trigger; el; el = el.parentElement) {
    if (el.matches(flagged)) return true;
    if (el === root) break;
  }
  return root.matches(flagged);
}

export function writeCombobox(root: HTMLElement, trigger: HTMLElement, labels: string[], multiple: boolean, strategy: Strategy = AUTO_STRATEGY): Promise<WriteOutcome> {
  return (async () => {
    const doc = trigger.ownerDocument;
    if (isDisabledControl(root, trigger)) return 'disabled';
    const have = () => readCombobox(root).map((l) => l.toLowerCase());
    const missing = labels.filter((l) => !have().includes(normalize(l).toLowerCase()));
    if (labels.length && missing.length === 0 && have().length === labels.length) return 'unchanged';
    if (!labels.length) return 'rejected';

    // Anything on screen before we open the list belongs to something else (a stuck animation,
    // a pinned list); a list this trigger already holds open (multi-selects) is its own.
    const alreadyOpen = strategy.heldOpen(trigger);
    if (!alreadyOpen) await quiet(strategy, doc);
    const stale = new Set<Element>(alreadyOpen ? [] : strategy.snapshot(doc));

    let found = true;
    for (const label of multiple ? missing : labels.slice(0, 1)) {
      if (!(await choose(strategy, trigger, label, () => have().includes(normalize(label).toLowerCase()), stale))) {
        found = false;
        break;
      }
      await sleep(30);
    }
    await close(strategy, trigger, stale);
    await quiet(strategy, doc);
    if (!found) return 'no-option';
    const now = have();
    return labels.every((l) => now.includes(normalize(l).toLowerCase())) ? 'restored' : 'rejected';
  })();
}

export const comboboxAdapter: WidgetAdapter = {
  id: 'combobox',
  find(root) {
    const found = new Set<HTMLElement>();
    for (const trigger of root.querySelectorAll<HTMLElement>(TRIGGER)) {
      // Pop-up lists and nested controls are not fields of their own.
      if (trigger.closest('[role="listbox"], [role="menu"], [role="dialog"][aria-modal="true"] [role="listbox"]')) continue;
      found.add(rootOf(trigger));
    }
    return [...found];
  },
  read: readCombobox,
  write(root, labels) {
    const trigger = root.matches(TRIGGER) ? root : root.querySelector<HTMLElement>(TRIGGER)!;
    const multiple = trigger.getAttribute('aria-multiselectable') === 'true' || !!root.querySelector('[class*="multiValue"], [class*="selection-item"], .MuiChip-root') || root.matches('[class*="multiple"]') || labels.length > 1;
    return writeCombobox(root, trigger, labels, multiple);
  },
  anchor: (root) => (root.matches(TRIGGER) ? root : root.querySelector<HTMLElement>(TRIGGER) ?? root),
};

export { labelFor };
