import { beforeEach, describe, expect, it } from 'vitest';
import { remapToPage, restoreForm, serializeForm, type SavedFields } from '../src/core';

beforeEach(() => {
  document.body.innerHTML = '';
});

const text = (value: string) => ({ kind: 'text', value }) as const;

describe('remapToPage', () => {
  it('keeps exact key matches', () => {
    document.body.innerHTML = `<form id="f"><input name="email"></form>`;
    expect(remapToPage(document, { 'form#f name=email': text('a') })).toEqual({
      fields: { 'form#f name=email': text('a') },
      unmatched: [],
    });
  });

  it('matches by field name across a different form', () => {
    document.body.innerHTML = `<form id="edit-user-2"><input name="email"><input type="radio" name="role" value="admin"></form>`;
    const saved: SavedFields = {
      'form#edit-user-1 name=email': text('a@b.co'),
      'form#edit-user-1 radio=role': { kind: 'radio', value: 'admin' },
      'form#edit-user-1 name=phone': text('123'),
    };
    expect(remapToPage(document, saved)).toEqual({
      fields: {
        'form#edit-user-2 name=email': text('a@b.co'),
        'form#edit-user-2 radio=role': { kind: 'radio', value: 'admin' },
      },
      unmatched: ['form#edit-user-1 name=phone'],
    });
  });

  it('matches fields outside a form to fields inside one, and back', () => {
    document.body.innerHTML = `<form><input name="q"></form>`;
    expect(remapToPage(document, { 'page name=q': text('x') }).fields).toEqual({ 'form0 name=q': text('x') });
  });

  it('does not match across kinds', () => {
    document.body.innerHTML = `<input type="checkbox" name="a">`;
    expect(remapToPage(document, { 'form#x name=a': text('1') }).unmatched).toEqual(['form#x name=a']);
  });

  it('fills each target field at most once, in DOM order', () => {
    document.body.innerHTML = `<form id="one"><input name="email"></form><form id="two"><input name="email"></form>`;
    const { fields } = remapToPage(document, { 'form#a name=email': text('1'), 'form#b name=email': text('2') });
    expect(fields).toEqual({ 'form#one name=email': text('1'), 'form#two name=email': text('2') });
  });

  it('prefers the exact match over a looser one for the same field', () => {
    document.body.innerHTML = `<form id="f"><input name="email"></form>`;
    const { fields, unmatched } = remapToPage(document, {
      'form#other name=email': text('loose'),
      'form#f name=email': text('exact'),
    });
    expect(fields).toEqual({ 'form#f name=email': text('exact') });
    expect(unmatched).toEqual(['form#other name=email']);
  });

  it('round-trips into restoreForm', () => {
    document.body.innerHTML = `<form id="src"><input name="name" value="Hadi"><select name="c"><option>sg</option><option selected>id</option></select></form>`;
    const saved = serializeForm(document);
    document.body.innerHTML = `<form id="dst"><select name="c"><option>sg</option><option>id</option></select><input name="name"></form>`;
    restoreForm(document, remapToPage(document, saved).fields);
    expect(serializeForm(document)).toEqual({ 'form#dst name=c': text('id'), 'form#dst name=name': text('Hadi') });
  });
});
