import { baseKey, createKeyAllocator, radioGroupKey, widgetIdentity, widgetScope } from './fieldKey';
import { isExcluded, isFormControl } from './filters';
import type { Field } from './types';
import { findWidgets } from './widgets';
import { noteBaseline } from './widgets/baseline';

/** All capturable fields under `root`, in DOM order. */
export function collectFields(root: ParentNode): Field[] {
  const fields: Field[] = [];
  const radioGroups = new Map<string, HTMLInputElement[]>();
  const allocate = createKeyAllocator();
  const widgets = findWidgets(root);

  for (const el of root.querySelectorAll('input, textarea, select')) {
    // Inner parts of a custom widget (react-select's search box, its hidden input) are not fields.
    if (!isFormControl(el) || isExcluded(el) || widgets.some((w) => w.el.contains(el))) continue;

    if (el.tagName === 'SELECT') {
      const select = el as HTMLSelectElement;
      const key = allocate(baseKey(select));
      fields.push(select.multiple ? { kind: 'multi', key, el: select } : { kind: 'text', key, el: select });
      continue;
    }

    const type = el.tagName === 'INPUT' ? (el as HTMLInputElement).type : 'textarea';
    if (type === 'radio') {
      const input = el as HTMLInputElement;
      const groupKey = radioGroupKey(input);
      const group = radioGroups.get(groupKey);
      if (group) {
        group.push(input);
      } else {
        const els = [input];
        radioGroups.set(groupKey, els);
        fields.push({ kind: 'radio', key: allocate(groupKey), els });
      }
    } else if (type === 'checkbox') {
      fields.push({ kind: 'checkbox', key: allocate(baseKey(el)), el: el as HTMLInputElement });
    } else {
      fields.push({ kind: 'text', key: allocate(baseKey(el)), el: el as HTMLInputElement | HTMLTextAreaElement });
    }
  }

  for (const { el, adapter } of widgets) {
    noteBaseline(el, adapter.read(el));
    const anchor = adapter.anchor?.(el) ?? el;
    fields.push({ kind: 'widget', key: allocate(`${widgetScope(el)} ${widgetIdentity(el, anchor)}`), el, adapter });
  }

  // Natives and widgets were collected separately; put them back in page order.
  const first = (f: Field) => (f.kind === 'radio' ? f.els[0]! : f.el);
  return fields.sort((a, b) => (first(a).compareDocumentPosition(first(b)) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
}
