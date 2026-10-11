/** Low-level helpers for driving widgets the way a person would. */

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Set when a real person starts using the page while we are driving a widget. Every wait and
 * press loop here gives up straight away, so we stop clicking around under their hands.
 */
/**
 * Events our own dispatches cause, even ones the browser flags as trusted (the `input`/`change`
 * a scripted `click()` on a checkbox produces), happen synchronously inside the dispatch. Anything
 * observed while this is positive is ours, not a person's.
 */
let ownDispatch = 0;
export function ours<T>(fn: () => T): T {
  ownDispatch++;
  try {
    return fn();
  } finally {
    ownDispatch--;
  }
}
export const inOurDispatch = () => ownDispatch > 0;

let aborted = false;
export const abortWidgets = (value: boolean): void => {
  aborted = value;
};
export const widgetsAborted = () => aborted;

/** Polls `check` until it returns something truthy or the timeout passes. */
export async function waitFor<T>(check: () => T | undefined | null | false, timeoutMs: number, intervalMs = 30): Promise<T | undefined> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    if (aborted) return undefined;
    const value = check();
    if (value) return value;
    if (Date.now() >= end) return undefined;
    await sleep(intervalMs);
  }
}

/** Gives frameworks a moment to re-render (React flushes discrete events sync; others use rAF). */
export const settle = () => sleep(30);

export function normalize(text: string | null | undefined): string {
  return (text ?? '').replace(/[\s​]+/g, ' ').trim();
}

/**
 * True when a user could see the element: rendered, not hidden by CSS (display, visibility,
 * opacity) and not parked off-screen. Libraries hide closed popups at negative coordinates or at
 * opacity 0 rather than removing them, so size alone is not enough. Content below or to the right
 * of the window is still visible: the page can scroll to it. jsdom has no layout, so there
 * everything not explicitly hidden counts as visible.
 */
export function isVisible(el: Element, { opacity = true }: { opacity?: boolean } = {}): boolean {
  if (el.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
  const doc = el.ownerDocument;
  const check = (el as Element & { checkVisibility?: (o: object) => boolean }).checkVisibility;
  if (check && !check.call(el, { visibilityProperty: true, opacityProperty: opacity })) return false;
  const hasLayout = doc.documentElement.getBoundingClientRect().height > 0 || doc.body.getBoundingClientRect().height > 0;
  if (!hasLayout) return true;
  const rect = el.getBoundingClientRect();
  return rect.width > 1 && rect.height > 1 && rect.right > 0 && rect.bottom > 0;
}

function mouseInit(el: Element): MouseEventInit {
  const rect = el.getBoundingClientRect();
  return {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: el.ownerDocument.defaultView,
    button: 0,
    buttons: 1,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
  };
}

/** Build an event, dropping optional members an environment rejects (jsdom is strict about `view`). */
function makeEvent(Ctor: typeof MouseEvent, type: string, init: MouseEventInit & { pointerId?: number; pointerType?: string; isPrimary?: boolean }): Event {
  try {
    return new Ctor(type, init);
  } catch {
    const { view: _view, ...rest } = init;
    try {
      return new Ctor(type, rest);
    } catch {
      return new Event(type, { bubbles: true, cancelable: true });
    }
  }
}

function pointer(el: Element, type: string): void {
  const win = el.ownerDocument.defaultView as (Window & typeof globalThis) | null;
  const init = { ...mouseInit(el), pointerId: 1, pointerType: 'mouse', isPrimary: true };
  const Ctor = (win && 'PointerEvent' in win ? win.PointerEvent : MouseEvent) as typeof MouseEvent;
  ours(() => el.dispatchEvent(makeEvent(Ctor, type, init)));
}

function mouse(el: Element, type: string): void {
  ours(() => el.dispatchEvent(makeEvent(MouseEvent, type, mouseInit(el))));
}

/** Mouse interaction split into phases, so callers can stop as soon as the widget reacts. */
export const PRESS_PHASES: ((el: Element) => void)[] = [
  (el) => {
    pointer(el, 'pointerover');
    pointer(el, 'pointerenter');
    mouse(el, 'mouseover');
    mouse(el, 'mousemove');
  },
  (el) => {
    pointer(el, 'pointerdown');
    mouse(el, 'mousedown');
  },
  (el) => {
    pointer(el, 'pointerup');
    mouse(el, 'mouseup');
  },
  (el) => mouse(el, 'click'),
];

/** Runs the press phases until `done()` says the widget reacted. Returns whether it did. */
export async function pressUntil(el: Element, done: () => boolean): Promise<boolean> {
  (el as HTMLElement).scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  for (const phase of PRESS_PHASES) {
    if (aborted) return false;
    phase(el);
    await settle();
    if (done()) return true;
  }
  return done();
}

const KEY_CODES: Record<string, number> = { Enter: 13, Escape: 27, ' ': 32, ArrowDown: 40, ArrowUp: 38, Backspace: 8, Tab: 9 };

/** Keydown + keyup, with legacy keyCode/which set for libraries that still read them. */
export function pressKey(el: Element, key: string): void {
  for (const type of ['keydown', 'keyup']) {
    const event = new KeyboardEvent(type, { key, code: key === ' ' ? 'Space' : key, bubbles: true, cancelable: true, composed: true });
    const code = KEY_CODES[key] ?? 0;
    Object.defineProperty(event, 'keyCode', { get: () => code });
    Object.defineProperty(event, 'which', { get: () => code });
    ours(() => el.dispatchEvent(event));
  }
}

export function fire(el: Element, ...types: string[]): void {
  ours(() => {
    for (const type of types) el.dispatchEvent(new Event(type, { bubbles: true }));
  });
}

/**
 * Sets `value` through the prototype setter so framework-controlled inputs see a real change.
 * React keeps its own record of the last value on the element; assigning `el.value` updates that
 * record too, so the following `input` event looks like a no-op. The prototype setter bypasses it.
 */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  for (let proto = Object.getPrototypeOf(el); proto; proto = Object.getPrototypeOf(proto)) {
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) {
      setter.call(el, value);
      return;
    }
  }
  el.value = value;
}

/** Type `text` into an input as one edit: native value + input event. */
export function typeInto(el: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  setNativeValue(el, text);
  fire(el, 'input');
}

export function focus(el: Element): void {
  const target = el as HTMLElement;
  ours(() => target.focus?.({ preventScroll: true }));
  const doc = el.ownerDocument;
  // When the window itself is not focused (DevTools in front, another app, a background tab),
  // Chrome moves the cursor but delivers no focus events, and libraries that open on focus never
  // hear about it. Announce it ourselves.
  if (!doc.hasFocus() && doc.activeElement === el) {
    ours(() => {
      el.dispatchEvent(new FocusEvent('focus', { bubbles: false }));
      el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });
  }
}

export function blurActive(doc: Document): void {
  const active = doc.activeElement as HTMLElement | null;
  if (active && active !== doc.body) active.blur();
}

const ring: string[] = [];
const RING_SIZE = 300;

const show = (value: unknown): string => {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

/**
 * Records what a widget attempt did. The last few hundred lines are always kept (and included in
 * "Copy diagnostics"), and echoed to the console when `localStorage['form-keeper:debug']` is set.
 */
export function trace(...args: unknown[]): void {
  const line = `${new Date().toISOString().slice(11, 23)} ${args.map(show).join(' ')}`;
  ring.push(line);
  if (ring.length > RING_SIZE) ring.shift();
  try {
    if (globalThis.localStorage?.getItem('form-keeper:debug')) console.debug('[form-keeper:debug]', ...args);
  } catch {
    // storage can be blocked; the ring buffer still has it
  }
}

export const getTrace = (): string[] => [...ring];
