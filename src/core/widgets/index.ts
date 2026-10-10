import type { WidgetAdapter } from '../types';
import { chipsAdapter } from './chips';
import { comboboxAdapter } from './combobox';
import { learnedAdapter } from './learned';
import { richTextAdapter } from './richtext';
import { segmentedDateAdapter } from './segmentedDate';
import { radioGroupAdapter, toggleAdapter } from './toggle';

/**
 * Controls the user taught us come first, so a lesson always wins over a guess. Then, tried in order; a widget claimed by an earlier adapter is not offered to later ones. Adapters
 * target standards (ARIA roles, contenteditable) rather than single libraries, so unknown
 * libraries that follow them work without special cases.
 */
export const ADAPTERS: WidgetAdapter[] = [learnedAdapter, segmentedDateAdapter, comboboxAdapter, radioGroupAdapter, toggleAdapter, chipsAdapter, richTextAdapter];

export interface FoundWidget {
  el: HTMLElement;
  adapter: WidgetAdapter;
}

/** Widgets under `root`, outermost-first, with no widget nested inside another. */
export function findWidgets(root: ParentNode): FoundWidget[] {
  const found: FoundWidget[] = [];
  for (const adapter of ADAPTERS) {
    for (const el of adapter.find(root)) {
      if (el.closest('[data-form-keeper="off"]')) continue;
      if (found.some((f) => f.el === el || f.el.contains(el) || el.contains(f.el))) continue;
      found.push({ el, adapter });
    }
  }
  return found;
}
