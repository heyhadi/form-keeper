import { trace } from './interact';

/**
 * What each widget showed the first time we saw it. Placeholders ("Choose…"), "None" entries and
 * untouched defaults all look like values when read, so a widget still showing its first reading
 * is treated as empty. Restoring a different value changes what it shows, so it is saved normally.
 */
const seen = new WeakMap<HTMLElement, string>();

const same = (labels: string[], remembered: string) => JSON.stringify(labels) === remembered;

/** Remember the reading the first time; later calls leave it alone. */
export function noteBaseline(el: HTMLElement, labels: string[]): void {
  if (!seen.has(el)) seen.set(el, JSON.stringify(labels));
}

/** Labels to save: empty while the widget still shows its first reading. */
export function effectiveLabels(el: HTMLElement, labels: string[]): string[] {
  noteBaseline(el, labels);
  trace('baseline', el.className.slice(0, 30), 'reads', JSON.stringify(labels), 'baseline', seen.get(el));
  return same(labels, seen.get(el)!) ? [] : labels;
}
