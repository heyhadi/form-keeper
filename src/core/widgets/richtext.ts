import type { WidgetAdapter, WriteOutcome } from '../types';
import { fire, focus, sleep } from './interact';

/** contenteditable boxes: Quill, Slate, Lexical, TipTap, ProseMirror, Draft.js and friends. */
export const richTextAdapter: WidgetAdapter = {
  id: 'richtext',
  find: (root) =>
    Array.from(root.querySelectorAll<HTMLElement>('[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]')).filter(
      // Only the outermost editable region; nested ones belong to the editor.
      (el) => !el.parentElement?.closest('[contenteditable]'),
    ),
  read(el) {
    const text = (el.innerText ?? el.textContent ?? '').replace(/​/g, '').trim();
    return text ? [text] : [];
  },
  async write(el, labels): Promise<WriteOutcome> {
    const text = labels[0] ?? '';
    const current = (el.innerText ?? el.textContent ?? '').trim();
    if (current === text) return 'unchanged';
    if (!text) return 'rejected';
    focus(el);
    const doc = el.ownerDocument;
    // Editing commands go through the browser's own input pipeline, so editor frameworks that
    // listen to `beforeinput` see a normal typing event and update their model.
    doc.execCommand('selectAll', false);
    let done = doc.execCommand('insertText', false, text);
    await sleep(30);
    if (!done || (el.innerText ?? '').trim() !== text) {
      // Fallback for editors that ignore execCommand: write the DOM and announce it.
      el.textContent = text;
      fire(el, 'input');
      done = true;
    }
    return (el.innerText ?? el.textContent ?? '').trim() === text ? 'restored' : 'rejected';
  },
};
