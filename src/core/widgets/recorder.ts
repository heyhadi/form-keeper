import { labelFor } from '../label';
import { readCombobox } from './combobox';
import { normalize } from './interact';
import { locate, pathFrom, stableClasses, type Recipe } from './learned';

export type TeachResult = { ok: true; recipe: Recipe; chosen: string[] } | { ok: false; reason: 'cancelled' | 'nothing-changed' };

const IDLE_MS = 1200;
const MAX_TEXT = 80;
const CONTROLS = 'label, select, textarea, input:not([type="hidden"]), [role="combobox"], button';

/**
 * The control around the first thing the user clicked: the largest ancestor that does not yet
 * share a parent with a label or another form control.
 */
export function controlRoot(target: HTMLElement): HTMLElement {
  const doc = target.ownerDocument;
  let root = target;
  for (let i = 0; i < 4; i++) {
    const parent = root.parentElement;
    if (!parent || parent === doc.body || parent === doc.documentElement) break;
    if (Array.from(parent.querySelectorAll(CONTROLS)).some((el) => !root.contains(el))) break;
    root = parent;
  }
  return root;
}

/**
 * Teach mode: watch the user open a control and pick a value, then turn that into a recipe.
 * Clicks are only observed, never blocked, so the control behaves normally while being taught.
 * `ignore` excludes our own UI (the banner) from what counts as a click on the page.
 */
export function startTeaching(doc: Document, ignore: (el: Element) => boolean, done: (result: TeachResult) => void): () => void {
  let root: HTMLElement | undefined;
  let openTarget: HTMLElement | undefined;
  let baseline: string[] = [];
  let clicks = 0;
  let picks = 0;
  let idle: ReturnType<typeof setTimeout> | undefined;
  let finished = false;

  function finish(result: TeachResult): void {
    if (finished) return;
    finished = true;
    if (idle !== undefined) clearTimeout(idle);
    doc.removeEventListener('pointerdown', onPointerDown, true);
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('keydown', onKey, true);
    done(result);
  }

  function conclude(): void {
    if (!root || !openTarget) return finish({ ok: false, reason: 'nothing-changed' });
    const chosen = readCombobox(root);
    if (chosen.length === 0 || JSON.stringify(chosen) === JSON.stringify(baseline)) return finish({ ok: false, reason: 'nothing-changed' });
    const form = root.closest('form') ?? doc.body;
    const recipe: Recipe = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      label: labelFor(root, root, true),
      tag: root.tagName.toLowerCase(),
      classes: stableClasses(root),
      path: pathFrom(root, form),
      openPath: pathFrom(openTarget, root),
      multiple: chosen.length > 1,
      baseline,
    };
    // A recipe that cannot find its own control again is useless; say so now, not after a reload.
    if (locate(doc, recipe) !== root) return finish({ ok: false, reason: 'nothing-changed' });
    finish({ ok: true, recipe, chosen });
  }

  function onPointerDown(event: Event): void {
    const target = event.target as HTMLElement;
    if (ignore(target) || root) return;
    // The very first press picks the control. Read it now, before the page reacts.
    root = controlRoot(target);
    openTarget = target;
    baseline = readCombobox(root);
  }

  function onClick(event: Event): void {
    const target = event.target as HTMLElement;
    if (ignore(target) || !root) return;
    // The first click is the one that opened the control; every later click with a short label
    // on it is the user choosing something.
    clicks++;
    const text = normalize(target.textContent);
    if (clicks > 1 && text.length > 0 && text.length <= MAX_TEXT) picks++;
    if (picks > 0) {
      if (idle !== undefined) clearTimeout(idle);
      idle = setTimeout(conclude, IDLE_MS);
    }
  }

  function onKey(event: Event): void {
    if ((event as KeyboardEvent).key === 'Escape' && !root) finish({ ok: false, reason: 'cancelled' });
  }

  doc.addEventListener('pointerdown', onPointerDown, true);
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('keydown', onKey, true);
  return () => finish({ ok: false, reason: 'cancelled' });
}
