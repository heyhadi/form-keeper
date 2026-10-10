import { beforeEach, describe, expect, it, vi } from 'vitest';
import { restoreForm, serializeForm } from '../src/core';

const FORM = `
  <form id="f">
    <input name="name">
    <textarea name="bio"></textarea>
    <input type="checkbox" name="agree">
    <input type="radio" name="plan" value="free" checked><input type="radio" name="plan" value="pro">
    <select name="country"><option value="sg">SG</option><option value="id">ID</option></select>
    <select name="langs" multiple><option value="ts">TS</option><option value="go">Go</option></select>
  </form>`;

beforeEach(() => {
  document.body.innerHTML = FORM;
});

function fillAndCapture() {
  const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;
  $<HTMLInputElement>('[name=name]').value = 'Hadi';
  $<HTMLTextAreaElement>('[name=bio]').value = 'hi';
  $<HTMLInputElement>('[name=agree]').checked = true;
  $<HTMLInputElement>('[value=pro]').checked = true;
  $<HTMLSelectElement>('[name=country]').value = 'id';
  $<HTMLOptionElement>('[name=langs] [value=go]').selected = true;
  return serializeForm(document);
}

describe('restoreForm', () => {
  it('round-trips every field kind', () => {
    const saved = fillAndCapture();
    document.body.innerHTML = FORM;

    const report = restoreForm(document, saved);

    expect(serializeForm(document)).toEqual(saved);
    expect(report.restored).toHaveLength(6);
    expect(report).toMatchObject({ unchanged: [], skipped: [], missing: [] });
  });

  it('fires bubbling input and change events for text fields', () => {
    const events: string[] = [];
    document.addEventListener('input', (e) => events.push(`input:${(e.target as HTMLInputElement).name}`));
    document.addEventListener('change', (e) => events.push(`change:${(e.target as HTMLInputElement).name}`));

    restoreForm(document, { 'form#f name=name': { kind: 'text', value: 'x' } });

    expect(events).toEqual(['input:name', 'change:name']);
  });

  it('toggles checkboxes with a click so click-driven listeners run', () => {
    const onClick = vi.fn();
    document.querySelector('[name=agree]')!.addEventListener('click', onClick);

    restoreForm(document, { 'form#f name=agree value=on': { kind: 'checkbox', checked: true } });

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is idempotent and fires nothing when values already match', () => {
    const saved = fillAndCapture();
    const onEvent = vi.fn();
    document.addEventListener('input', onEvent);
    document.addEventListener('click', onEvent);

    const report = restoreForm(document, saved);

    expect(report.restored).toEqual([]);
    expect(report.unchanged).toHaveLength(6);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('reports saved fields that are not on the page', () => {
    const report = restoreForm(document, { 'form#gone name=x': { kind: 'text', value: '1' } });
    expect(report.missing).toEqual(['form#gone name=x']);
  });

  it.each([
    ['disabled', `<input name="a" disabled>`, { 'page name=a': { kind: 'text', value: '1' } }],
    ['readonly', `<input name="a" readonly>`, { 'page name=a': { kind: 'text', value: '1' } }],
    ['kind-mismatch', `<input name="a">`, { 'page name=a': { kind: 'checkbox', checked: true } }],
    ['no-option', `<select name="a"><option value="x">x</option></select>`, { 'page name=a': { kind: 'text', value: 'gone' } }],
    ['no-option', `<input type="radio" name="r" value="x">`, { 'page radio=r': { kind: 'radio', value: 'gone' } }],
    ['rejected', `<input type="radio" name="r" value="x" checked>`, { 'page radio=r': { kind: 'radio', value: null } }],
  ] as const)('skips with reason %s', (reason, html, saved) => {
    document.body.innerHTML = html;
    const report = restoreForm(document, saved);
    expect(report.skipped).toEqual([{ key: Object.keys(saved)[0], reason }]);
  });

  it('reports a checkbox whose click the page cancels', () => {
    document.body.innerHTML = `<input type="checkbox" name="a" onclick="return false">`;
    const report = restoreForm(document, { 'page name=a value=on': { kind: 'checkbox', checked: true } });
    expect(report.skipped).toEqual([{ key: 'page name=a value=on', reason: 'rejected' }]);
  });
});
