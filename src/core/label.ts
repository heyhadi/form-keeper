/**
 * Human-visible label for a field or widget, used both as a stable key (when there is no `name`)
 * and as the name shown in the popup. Tries, in order: aria-labelledby, aria-label, <label for>,
 * a wrapping <label>, then nearby text before the field (the common `<div><label/>…<Widget/></div>`
 * shape that UI libraries produce without wiring `for`).
 */
export function labelFor(el: Element, control: Element = el, widget = false): string | undefined {
  const doc = el.ownerDocument;

  // Names that point at the control itself or its parts (MUI lists the value display in
  // aria-labelledby; antd puts the chosen option in aria-label) change with the value, which
  // would change the field's key. Skip them.
  const own = (node: Element | null) => !!node && (el.contains(node) || control.contains(node) || node.contains(el));

  const fromLabelledBy = () => {
    const ids = control.getAttribute('aria-labelledby');
    if (!ids) return undefined;
    const parts = ids
      .split(/\s+/)
      .map((id) => doc.getElementById(id))
      .filter((node): node is HTMLElement => !!node && !own(node));
    return clean(parts.map((node) => node.textContent ?? '').join(' '));
  };
  const fromAria = () => clean(control.getAttribute('aria-label'));
  const fromLabelFor = () => {
    const id = control.getAttribute('id');
    if (!id) return undefined;
    const label = Array.from(doc.querySelectorAll('label')).find((l) => l.htmlFor === id);
    return label && textOutsideControls(label);
  };
  const fromWrapping = () => {
    const wrapping = control.closest('label');
    return wrapping ? textOutsideControls(wrapping) : undefined;
  };
  // The element right before the field, or before one of its first few ancestors, is its label
  // in the common `<div><label/><Widget/></div>` shape. Only the adjacent sibling counts, so
  // page headings further up never become a field's name.
  const fromNeighbour = () => {
    let node: Element | null = el;
    for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
      // Up to three previous siblings: libraries slip hidden helpers (live regions for screen
      // readers, which echo the chosen value) in between the label and the control.
      const candidates: Element[] = [];
      for (let sib = node.previousElementSibling; sib && candidates.length < 3; sib = sib.previousElementSibling) {
        if (sib.querySelector(CONTROL_SELECTOR) || sib.matches(CONTROL_SELECTOR)) break;
        if (isHelper(sib)) continue;
        candidates.push(sib);
      }
      const ordered = [...candidates.filter((c) => c.matches('label, legend')), ...candidates];
      for (const sib of ordered) {
        const text = textOutsideControls(sib);
        if (text) return text;
      }
    }
    return undefined;
  };
  // Widgets: visible labels first, ARIA naming last, because ARIA naming on them can echo the value.
  const order = widget
    ? [fromLabelFor, fromWrapping, fromLabelledBy, fromNeighbour, fromAria]
    : [fromLabelledBy, fromAria, fromLabelFor, fromWrapping, fromNeighbour];
  for (const source of order) {
    const text = source();
    if (text) return text;
  }
  return undefined;
}

/** Elements that are not visible labels: live regions, screen-reader-only text, hidden nodes. */
function isHelper(el: Element): boolean {
  if (el.matches('[aria-live], [aria-hidden="true"], [hidden], [role="status"], [role="log"], [role="alert"], [class*="sr-only" i], [class*="visually-hidden" i], [class*="VisuallyHidden"], script, style')) return true;
  const style = (el as HTMLElement).style;
  return style?.opacity === '0' || style?.display === 'none' || style?.visibility === 'hidden' || (style?.width === '0px' && style?.height === '0px');
}

const CONTROL_SELECTOR = 'input, select, textarea, [role="combobox"], [role="listbox"], button';
const MAX_LABEL = 60;

function textOutsideControls(el: Element): string | undefined {
  let text = '';
  const walk = (node: Node) => {
    if (node.nodeType === 3) text += node.textContent;
    else if (node.nodeType === 1 && !(node as Element).matches('input, select, textarea, option')) {
      node.childNodes.forEach(walk);
    }
  };
  walk(el);
  return clean(text);
}

/** Collapses whitespace and drops trailing required markers / colons. Too-long text isn't a label. */
function clean(text: string | null | undefined): string | undefined {
  const value = (text ?? '').replace(/\s+/g, ' ').replace(/[\s:*]+$/, '').trim();
  return value && value.length <= MAX_LABEL ? value : undefined;
}

/**
 * Ids that libraries generate per render or per instance, so they change between loads or
 * routes: React useId (`:r1:`, `«r1»`, `_r_1_`), react-select, MUI, Headless UI, Radix, Downshift,
 * Ant Design (rc_select_0).
 */
const GENERATED_ID = [
  /^:r[\w-]*:$/,
  /^«r[\w-]*»$/,
  /^_r_[\w-]*_$/,
  /^react-select-\d+/,
  /^(mui|downshift)-\d+/,
  /^(headlessui|radix)-/,
  /^rc_\w+_\d+/,
  /\d{4,}/, // long numeric runs: counters and timestamps
];

export function isStableId(id: string): boolean {
  return !GENERATED_ID.some((re) => re.test(id));
}
