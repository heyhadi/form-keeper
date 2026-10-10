import { beforeEach, describe, expect, it } from 'vitest';
import { captureFiles, MAX_FILE_BYTES, serializeForm, setFilesEnabled } from '../src/core';
import { describeFiles } from '../src/core/files';

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

describe('file inputs', () => {
  const input = () => document.querySelector<HTMLInputElement>('input[type=file]')!;
  /** jsdom cannot assign `files`, so give the element the files directly. */
  const choose = (...files: File[]) => Object.defineProperty(input(), 'files', { configurable: true, value: files });
  const file = (name: string, bytes: number | string, type = 'text/plain') => new File([typeof bytes === 'number' ? new Uint8Array(bytes) : bytes], name, { type, lastModified: 1 });

  beforeEach(() => {
    setFilesEnabled(true);
    document.body.innerHTML = `<input type="file" name="avatar" multiple>`;
  });

  it('is not captured where files are switched off', () => {
    setFilesEnabled(false);
    expect(serializeForm(document)).toEqual({});
  });

  it('saves the file contents as base64 once they have been read', async () => {
    choose(file('a.txt', 'hello'));
    expect(describeFiles(input())).toEqual([]); // not read yet, so not claimed
    await captureFiles(input());
    expect(serializeForm(document)['page name=avatar']).toEqual({
      kind: 'file',
      files: [{ name: 'a.txt', type: 'text/plain', size: 5, lastModified: 1, data: btoa('hello') }],
    });
  });

  it('keeps only the name of a file over the size limit', async () => {
    choose(file('big.bin', MAX_FILE_BYTES + 1, 'application/octet-stream'));
    await captureFiles(input());
    expect(describeFiles(input())).toEqual([
      { name: 'big.bin', type: 'application/octet-stream', size: MAX_FILE_BYTES + 1, lastModified: 1, skipped: 'too-large' },
    ]);
  });

  it('stops keeping contents once the page budget is used', async () => {
    const seven = 7 * 1024 * 1024;
    choose(file('1.bin', seven), file('2.bin', seven), file('3.bin', seven));
    await captureFiles(input());
    const stored = describeFiles(input());
    expect(stored.map((f) => [f.name, f.data !== undefined, f.skipped])).toEqual([
      ['1.bin', true, undefined],
      ['2.bin', true, undefined],
      ['3.bin', false, 'budget'],
    ]);
  });

  it('records an empty input as no files', () => {
    expect(serializeForm(document)['page name=avatar']).toEqual({ kind: 'file', files: [] });
  });
});
