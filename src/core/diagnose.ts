import { collectFields } from './collect';
import { isFormControl } from './filters';
import { readField } from './serialize';
import { findWidgets } from './widgets';

export interface Diagnostics {
  /** Origin and path only; no query string. */
  page: string;
  counts: Record<string, number>;
  fields: { key: string; kind: string; adapter?: string; value: unknown }[];
  /** Widget-looking elements nothing claimed. These are what teach mode is for. */
  unrecognised: { tag: string; classes: string; role?: string; text: string }[];
  /** Trimmed markup of each recognised widget, to see which library built it. */
  widgetMarkup: { key: string; html: string }[];
}

const MAX_HTML = 1800;
const MAX_TEXT = 60;
const LOOKS_LIKE_WIDGET = '[class*="select" i], [class*="dropdown" i], [class*="combo" i], [class*="picker" i], [class*="date" i], [class*="autocomplete" i], [role="listbox"], [aria-haspopup]';

/** Markup with the page's own text and any typed values cut down, so it is safe to paste. */
function sanitize(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('script, style, svg, img').forEach((n) => n.replaceChildren());
  clone.querySelectorAll('[value]').forEach((n) => n.setAttribute('value', '…'));
  const walker = el.ownerDocument.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? '';
    if (text.trim().length > MAX_TEXT) node.textContent = `${text.trim().slice(0, MAX_TEXT)}…`;
  }
  const html = clone.outerHTML.replace(/\s+/g, ' ');
  return html.length > MAX_HTML ? `${html.slice(0, MAX_HTML)}…` : html;
}

export function diagnose(root: Document): Diagnostics {
  const fields = collectFields(root);
  const widgets = findWidgets(root);
  const counts: Record<string, number> = {};
  for (const f of fields) counts[f.kind] = (counts[f.kind] ?? 0) + 1;

  const claimed = (el: Element) => widgets.some((w) => w.el.contains(el)) || (isFormControl(el) && fields.some((f) => ('el' in f ? f.el === el : f.els.includes(el as HTMLInputElement))));
  const unrecognised = Array.from(root.querySelectorAll(LOOKS_LIKE_WIDGET))
    .filter((el) => !claimed(el) && !el.closest('form-keeper-banner') && !Array.from(el.querySelectorAll(LOOKS_LIKE_WIDGET)).length)
    .slice(0, 20)
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      classes: String(el.getAttribute('class') ?? '').slice(0, 120),
      role: el.getAttribute('role') ?? undefined,
      text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT),
    }));

  return {
    page: root.location.origin + root.location.pathname,
    counts,
    fields: fields.map((f) => ({ key: f.key, kind: f.kind, adapter: f.kind === 'widget' ? f.adapter.id : undefined, value: readField(f) })),
    unrecognised,
    widgetMarkup: fields.flatMap((f) => (f.kind === 'widget' ? [{ key: f.key, html: sanitize(f.el) }] : [])),
  };
}
