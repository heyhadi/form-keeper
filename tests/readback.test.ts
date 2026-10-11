import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findWidgets } from '../src/core';
import { isVisible } from '../src/core/widgets/interact';

type Checkable = { checkVisibility?: (options: { opacityProperty?: boolean; visibilityProperty?: boolean }) => boolean };
const proto = Element.prototype as unknown as Checkable;
const original = proto.checkVisibility;

beforeEach(() => {
  document.body.innerHTML = '';
  // jsdom has no checkVisibility; model Chrome's: opacity only counts when asked about.
  proto.checkVisibility = function (this: HTMLElement, options) {
    return !(options.opacityProperty && parseFloat(this.style.opacity || '1') === 0);
  };
});

afterEach(() => {
  proto.checkVisibility = original;
});

describe('reading a control that is animating', () => {
  const html = (opacity: string) =>
    (document.body.innerHTML = `<div><label>City</label><div role="combobox" tabindex="0"><span class="value" style="opacity:${opacity}">Jakarta</span></div></div>`);
  const read = () => {
    const widget = findWidgets(document)[0]!;
    return widget.adapter.read(widget.el);
  };

  it('treats a value that is still fading in as already chosen', () => {
    html('0');
    expect(read()).toEqual(['Jakarta']);
  });

  it('reads a fully visible value normally', () => {
    html('1');
    expect(read()).toEqual(['Jakarta']);
  });

  it('still treats transparent elements as hidden when deciding whether a popup is open', () => {
    html('0');
    expect(isVisible(document.querySelector('.value')!)).toBe(false);
    expect(isVisible(document.querySelector('.value')!, { opacity: false })).toBe(true);
  });
});

describe('reading a control that is scrolled out of view', () => {
  const rects = new WeakMap<Element, { left: number; top: number; width: number; height: number }>();
  const original = Element.prototype.getBoundingClientRect;

  beforeEach(() => {
    // jsdom has no layout; give the document a size so position-based checks run, and let each test place elements.
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const r = rects.get(this) ?? (this === document.documentElement || this === document.body ? { left: 0, top: 0, width: 1000, height: 3000 } : { left: 0, top: 0, width: 100, height: 20 });
      return { ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON: () => r } as DOMRect;
    };
  });
  afterEach(() => {
    Element.prototype.getBoundingClientRect = original;
  });

  const build = () => {
    document.body.innerHTML = `<div><label>City</label><div role="combobox" tabindex="0"><span class="value">Jakarta</span></div></div>`;
    const widget = findWidgets(document)[0]!;
    return { widget, value: document.querySelector<HTMLElement>('.value')! };
  };

  it('still reads the value after the page has scrolled the control above the window', () => {
    const { widget, value } = build();
    rects.set(value, { left: 28, top: -66, width: 566, height: 22 }); // 44px above the top edge
    expect(widget.adapter.read(widget.el)).toEqual(['Jakarta']);
  });

  it('still treats a closed popup parked at negative coordinates as not visible', () => {
    const { value } = build();
    rects.set(value, { left: -9999, top: -9999, width: 100, height: 20 });
    expect(isVisible(value)).toBe(false);
    expect(isVisible(value, { offscreen: true })).toBe(true);
  });
});
