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
