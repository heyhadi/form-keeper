import { labelFor } from '../label';
import type { WidgetAdapter } from '../types';
import { noteBaseline } from './baseline';
import { readCombobox, TEXT_STRATEGY, writeCombobox } from './combobox';

/**
 * A control the user taught us by doing it once. It records how to find the control again and
 * which part to click to open it; picking an option is then driven by text alone, so it works for
 * any markup, including controls with no roles, no classes and no library we have heard of.
 */
export interface Recipe {
  id: string;
  /** Visible label of the control, when it has one. */
  label?: string;
  tag: string;
  /** Class names that look hand-written (not generated hashes). */
  classes: string[];
  /** Tag path from the form (or body) down to the control's root. */
  path: string;
  /** Tag path from the root down to the element that opens it when clicked. */
  openPath: string;
  multiple: boolean;
  /** What the control showed before it was touched (a placeholder, an empty state). */
  baseline: string[];
}

let recipes: Recipe[] = [];
const byElement = new WeakMap<HTMLElement, Recipe>();

export function setRecipes(next: Recipe[]): void {
  recipes = next;
}

export const getRecipes = () => recipes;

/** Hashed or generated class names change between builds; they make poor identifiers. */
export function stableClasses(el: Element): string[] {
  return Array.from(el.classList)
    .filter((c) => /^[A-Za-z][A-Za-z_-]*$/.test(c) && c.length <= 32 && !/^(css|jsx|sc|svelte|emotion|tw)-?/i.test(c))
    .slice(0, 4);
}

/** `div2>span1` style path from `root` (exclusive) down to `el`. */
export function pathFrom(el: Element, root: Element): string {
  const segments: string[] = [];
  for (let node: Element | null = el; node && node !== root; node = node.parentElement) {
    let nth = 1;
    for (let sib = node.previousElementSibling; sib; sib = sib.previousElementSibling) if (sib.tagName === node.tagName) nth++;
    segments.unshift(`${node.tagName.toLowerCase()}${nth}`);
  }
  return segments.join('>');
}

/** Inverse of `pathFrom`. An empty path is `root` itself. */
export function followPath(root: Element, path: string): Element | undefined {
  let node: Element = root;
  if (!path) return node;
  for (const segment of path.split('>')) {
    const match = /^([a-z0-9-]+?)(\d+)$/.exec(segment);
    if (!match) return undefined;
    const [, tag, nth] = match;
    const children = Array.from(node.children).filter((c) => c.tagName.toLowerCase() === tag);
    const next = children[Number(nth) - 1];
    if (!next) return undefined;
    node = next;
  }
  return node;
}

export function locate(root: ParentNode, recipe: Recipe): HTMLElement | undefined {
  const body = (root as Document).body ?? (root as Element).ownerDocument.body;
  const candidates = Array.from(root.querySelectorAll<HTMLElement>(recipe.tag)).filter((el) => recipe.classes.every((c) => el.classList.contains(c)));
  const pathOf = (el: HTMLElement) => pathFrom(el, el.closest('form') ?? body);
  const byLabel = recipe.label ? candidates.filter((el) => labelFor(el, el, true) === recipe.label) : candidates;
  const pool = byLabel.length ? byLabel : candidates;
  return pool.find((el) => pathOf(el) === recipe.path) ?? (byLabel.length ? byLabel[0] : undefined);
}

export const learnedAdapter: WidgetAdapter = {
  id: 'learned',
  find(root) {
    const found: HTMLElement[] = [];
    for (const recipe of recipes) {
      const el = locate(root, recipe);
      if (!el || found.includes(el)) continue;
      byElement.set(el, recipe);
      // The user's own choice is already on screen when we learn it, so the "untouched" look
      // has to come from the recipe.
      noteBaseline(el, recipe.baseline);
      found.push(el);
    }
    return found;
  },
  read: readCombobox,
  async write(el, labels) {
    const recipe = byElement.get(el);
    const trigger = (recipe && (followPath(el, recipe.openPath) as HTMLElement | undefined)) ?? el;
    return writeCombobox(el, trigger, labels, recipe?.multiple ?? labels.length > 1, TEXT_STRATEGY);
  },
};

