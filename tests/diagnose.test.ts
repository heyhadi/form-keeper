import { beforeEach, describe, expect, it } from 'vitest';
import { diagnose } from '../src/core';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('diagnose', () => {
  it('describes fields, recognised widgets and unrecognised ones, without typed text', () => {
    document.body.innerHTML = `
      <form id="f">
        <input name="email" value="secret@example.com">
        <div><label>City</label><div role="combobox" tabindex="0" class="x-select">Jakarta</div></div>
        <div><label>Mystery</label><div class="fancy-dropdown">Pick one</div></div>
      </form>`;
    const report = diagnose(document);

    expect(report.counts).toMatchObject({ text: 1, widget: 1 });
    expect(report.fields.map((f) => f.key)).toContain('form#f widget=City');
    expect(report.fields.find((f) => f.kind === 'widget')?.adapter).toBe('combobox');
    expect(report.unrecognised).toEqual([expect.objectContaining({ tag: 'div', classes: 'fancy-dropdown' })]);
    expect(report.widgetMarkup[0]?.html).toContain('role="combobox"');
    // Typed values in the markup are blanked.
    expect(JSON.stringify(report.widgetMarkup)).not.toContain('secret@example.com');
    expect(report.page).toMatch(/^https?:\/\/[^?]*$/);
  });
});
