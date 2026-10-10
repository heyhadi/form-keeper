import { beforeEach, describe, expect, it } from 'vitest';
import { serializeForm } from '../src/core';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('serializeForm', () => {
  it('captures every supported field kind', () => {
    document.body.innerHTML = `
      <input name="text" value="hello">
      <input name="email" type="email" value="a@b.co">
      <input name="date" type="date" value="2026-10-09">
      <textarea name="bio">multi
line</textarea>
      <input type="checkbox" name="agree" checked>
      <input type="radio" name="plan" value="free"><input type="radio" name="plan" value="pro" checked>
      <input type="radio" name="none" value="x">
      <select name="country"><option value="sg">SG</option><option value="id" selected>ID</option></select>
      <select name="langs" multiple><option value="ts" selected>TS</option><option value="go">Go</option><option value="rs" selected>Rust</option></select>`;

    expect(serializeForm(document)).toEqual({
      'page name=text': { kind: 'text', value: 'hello' },
      'page name=email': { kind: 'text', value: 'a@b.co' },
      'page name=date': { kind: 'text', value: '2026-10-09' },
      'page name=bio': { kind: 'text', value: 'multi\nline' },
      'page name=agree value=on': { kind: 'checkbox', checked: true },
      'page radio=plan': { kind: 'radio', value: 'pro' },
      'page radio=none': { kind: 'radio', value: null },
      'page name=country': { kind: 'text', value: 'id' },
      'page name=langs': { kind: 'multi', values: ['ts', 'rs'] },
    });
  });

  it.each([
    ['password', `<input type="password" name="x" value="secret">`],
    ['hidden', `<input type="hidden" name="csrf" value="tok">`],
    ['file', `<input type="file" name="avatar">`],
    ['submit', `<input type="submit" value="Go">`],
    ['button', `<input type="button" value="Go">`],
    ['reset', `<input type="reset">`],
    ['credit card', `<input name="cc" autocomplete="cc-number" value="4242">`],
    ['credit card with section token', `<input name="cc" autocomplete="billing cc-csc" value="123">`],
    ['opted-out field', `<input name="x" data-form-keeper="off" value="1">`],
    ['opted-out ancestor', `<div data-form-keeper="off"><input name="x" value="1"></div>`],
  ])('skips %s', (_, html) => {
    document.body.innerHTML = html;
    expect(serializeForm(document)).toEqual({});
  });
});
