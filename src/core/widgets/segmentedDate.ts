import type { WidgetAdapter, WriteOutcome } from '../types';
import { focus, normalize, sleep, trace } from './interact';

/**
 * Date/time fields split into editable sections (MUI X fields, React Aria, Spectrum...), exposed
 * as role="spinbutton" parts inside a group. They can't be set through a value property, but they
 * accept pasted text, so we paste the full date string into the first section.
 */
export const segmentedDateAdapter: WidgetAdapter = {
  id: 'segmented-date',
  find: (root) =>
    Array.from(root.querySelectorAll<HTMLElement>('[role="group"], [class*="DateField"], [class*="date-field" i], [class*="DateInput"]')).filter(
      (el) => el.querySelectorAll('[role="spinbutton"]').length >= 2 && !el.parentElement?.closest('[role="group"]:has([role="spinbutton"])'),
    ),
  read(el) {
    // MUI keeps the formatted value in a hidden, read-only input next to the sections.
    const mirror = el.parentElement?.querySelector<HTMLInputElement>('input[aria-hidden="true"], input[readonly]') ?? el.querySelector<HTMLInputElement>('input');
    if (mirror?.value) return [normalize(mirror.value)];
    const parts = Array.from(el.querySelectorAll<HTMLElement>('[role="spinbutton"]'));
    const text = parts.map((p) => normalize(p.getAttribute('aria-valuetext') ?? p.textContent)).join('');
    // Empty sections show their format ("MM/DD/YYYY") or "Empty".
    return /[A-Za-z]/.test(text.replace(/[APap][Mm]/g, '')) ? [] : [text];
  },
  async write(el, labels): Promise<WriteOutcome> {
    const want = labels[0] ?? '';
    const have = () => this.read(el)[0] ?? '';
    if (have() === want) return 'unchanged';
    if (!want) return 'rejected';
    const first = el.querySelector<HTMLElement>('[role="spinbutton"]');
    if (!first) return 'rejected';
    const doc = el.ownerDocument;
    focus(first);

    // 1. Select every section (Ctrl/Cmd+A), then paste the whole date.
    for (const type of ['keydown', 'keyup']) {
      first.dispatchEvent(new KeyboardEvent(type, { key: 'a', code: 'KeyA', ctrlKey: true, metaKey: true, bubbles: true, cancelable: true }));
    }
    const data = new DataTransfer();
    data.setData('text', want);
    first.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    await sleep(60);
    trace('segmented paste', want, '-> reads', have());
    if (have() === want) return 'restored';

    // 2. Type it one character at a time through the browser's editing pipeline; the field moves
    //    to the next section by itself as each one fills.
    focus(first);
    for (const ch of want.replace(/[^0-9A-Za-z]/g, '')) {
      doc.execCommand('insertText', false, ch);
      await sleep(25);
    }
    await sleep(60);
    trace('segmented typed', want, '-> reads', have());
    return have() === want ? 'restored' : 'rejected';
  },
};
