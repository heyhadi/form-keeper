import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startKeeper, type Keeper, type RestoreReport, type SavedFields } from '../src/core';

const ORIGIN = 'http://localhost:5173';
let keeper: Keeper | undefined;
let url: string;

beforeEach(() => {
  vi.useFakeTimers();
  url = `${ORIGIN}/form`;
  document.body.innerHTML = `<input name="a"><input name="b">`;
});

afterEach(() => {
  keeper?.stop();
  vi.useRealTimers();
});

const $ = (name: string) => document.querySelector<HTMLInputElement>(`[name=${name}]`)!;

function type(name: string, value: string) {
  $(name).value = value;
  $(name).dispatchEvent(new Event('input', { bubbles: true }));
}

const text = (value: string) => ({ kind: 'text', value }) as const;

function start(storage: Record<string, SavedFields> = {}) {
  const save = vi.fn(async (page: string, fields: SavedFields) => {
    storage[page] = fields;
  });
  const onRestore = vi.fn((_page: string, _report: RestoreReport) => {});
  const onPage = vi.fn((_page: string) => {});
  keeper = startKeeper({
    root: document,
    getUrl: () => url,
    load: async (page) => storage[page],
    save,
    onPage,
    onRestore,
    restoreWindowMs: 10_000,
  });
  return { save, onRestore, onPage, storage };
}

describe('saving', () => {
  it('debounces edits into one save keyed by page', async () => {
    const { save } = start();
    type('a', '1');
    type('a', '12');
    await vi.advanceTimersByTimeAsync(299);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledExactlyOnceWith(`${ORIGIN}/form`, {
      'page name=a': text('12'),
      'page name=b': text(''),
    });
  });

  it('skips writing when the page already matches storage', async () => {
    const { save } = start({ [`${ORIGIN}/form`]: { 'page name=a': text('x'), 'page name=b': text('') } });
    await vi.runAllTimersAsync();
    type('a', 'x');
    await vi.runAllTimersAsync();
    expect(save).not.toHaveBeenCalled();
  });

  it('keeps fields that are unmounted between writes', async () => {
    const { storage } = start();
    type('a', '1');
    await vi.runAllTimersAsync();
    document.body.innerHTML = `<input name="b">`; // "a" unmounted, e.g. next wizard step
    type('b', '2');
    await vi.runAllTimersAsync();
    expect(storage[`${ORIGIN}/form`]).toEqual({ 'page name=a': text('1'), 'page name=b': text('2') });
  });

  it('flushes a pending save when the page is hidden', async () => {
    const { save } = start();
    await vi.advanceTimersByTimeAsync(0);
    type('a', '1');
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledOnce();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('ignores edits to excluded fields', async () => {
    document.body.innerHTML = `<input type="password" name="pw">`;
    const { save } = start();
    type('pw', 'secret');
    await vi.runAllTimersAsync();
    expect(save).not.toHaveBeenCalled();
  });
});

describe('restoring', () => {
  it('reports an empty restore when nothing is stored', async () => {
    const { onRestore } = start();
    await vi.runAllTimersAsync();
    expect(onRestore).toHaveBeenCalledExactlyOnceWith(`${ORIGIN}/form`, { restored: [], unchanged: [], skipped: [], missing: [] });
  });

  it('restores on start without saving the restore back', async () => {
    const { save, onRestore } = start({ [`${ORIGIN}/form`]: { 'page name=a': text('saved') } });
    await vi.runAllTimersAsync();
    expect($('a').value).toBe('saved');
    expect(onRestore).toHaveBeenCalledWith(`${ORIGIN}/form`, expect.objectContaining({ restored: ['page name=a'] }));
    expect(save).not.toHaveBeenCalled();
  });

  it('fills fields that render long after load', async () => {
    document.body.innerHTML = '';
    const { onRestore } = start({ [`${ORIGIN}/form`]: { 'page name=late': text('v') } });
    await vi.advanceTimersByTimeAsync(6_000);
    document.body.innerHTML = `<div><input name="late"></div>`;
    await vi.advanceTimersByTimeAsync(100);
    expect($('late').value).toBe('v');
    expect(onRestore).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ restored: ['page name=late'], missing: [] }));
  });

  it('fills a select once its options load', async () => {
    document.body.innerHTML = `<select name="city"></select>`;
    start({ [`${ORIGIN}/form`]: { 'page name=city': text('sg') } });
    await vi.advanceTimersByTimeAsync(100);
    document.querySelector('select')!.innerHTML = `<option value="">-</option><option value="sg">SG</option>`;
    await vi.advanceTimersByTimeAsync(100);
    expect(document.querySelector('select')!.value).toBe('sg');
  });

  it('fills a field once it is enabled', async () => {
    document.body.innerHTML = `<input name="a" disabled>`;
    start({ [`${ORIGIN}/form`]: { 'page name=a': text('v') } });
    await vi.advanceTimersByTimeAsync(100);
    expect($('a').value).toBe('');
    $('a').disabled = false;
    await vi.advanceTimersByTimeAsync(100);
    expect($('a').value).toBe('v');
  });

  it('gives up when the restore window closes', async () => {
    document.body.innerHTML = '';
    const { onRestore } = start({ [`${ORIGIN}/form`]: { 'page name=never': text('v') } });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onRestore).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ missing: ['page name=never'] }));
    document.body.innerHTML = `<input name="never">`;
    await vi.advanceTimersByTimeAsync(100);
    expect($('never').value).toBe('');
  });

  it('stops restoring once the user starts typing', async () => {
    document.body.innerHTML = `<input name="a">`;
    start({ [`${ORIGIN}/form`]: { 'page name=a': text('saved'), 'page name=late': text('v') } });
    await vi.advanceTimersByTimeAsync(0);
    type('a', 'mine');
    document.body.insertAdjacentHTML('beforeend', `<input name="late">`);
    await vi.runAllTimersAsync();
    expect($('a').value).toBe('mine');
    expect($('late').value).toBe('');
  });

  it('restoreNow fills the page on demand', async () => {
    start({ [`${ORIGIN}/form`]: { 'page name=a': text('saved') } });
    await vi.runAllTimersAsync();
    type('a', 'changed');
    const report = await keeper!.restoreNow();
    expect($('a').value).toBe('saved');
    expect(report.restored).toEqual(['page name=a']);
  });

  it('restoreFrom fills from another page and saves the result here', async () => {
    const { storage } = start({ [`${ORIGIN}/form`]: {} });
    await vi.runAllTimersAsync();
    const report = await keeper!.restoreFrom({ 'form#elsewhere name=a': text('copied'), 'form#elsewhere name=zzz': text('x') });
    await vi.runAllTimersAsync();
    expect($('a').value).toBe('copied');
    expect(report).toMatchObject({ restored: ['page name=a'], unmatched: ['form#elsewhere name=zzz'] });
    expect(storage[`${ORIGIN}/form`]).toMatchObject({ 'page name=a': text('copied') });
  });

  it('forget drops the page so the next edit starts fresh', async () => {
    const { storage } = start({ [`${ORIGIN}/form`]: { 'form#gone name=x': text('old') } });
    await vi.runAllTimersAsync();
    keeper!.forget();
    type('a', '1');
    await vi.runAllTimersAsync();
    expect(storage[`${ORIGIN}/form`]).not.toHaveProperty(['form#gone name=x']);
  });
});

describe('single-page-app navigation', () => {
  it('keeps each URL separate', async () => {
    const { storage, onPage } = start();
    type('a', 'first');
    url = `${ORIGIN}/other`;
    document.body.innerHTML = `<input name="a">`; // the router swaps the view
    await vi.advanceTimersByTimeAsync(0);
    type('a', 'second');
    await vi.runAllTimersAsync();

    expect(onPage.mock.calls.map(([page]) => page)).toEqual([`${ORIGIN}/form`, `${ORIGIN}/other`]);
    expect(storage[`${ORIGIN}/form`]).toMatchObject({ 'page name=a': text('first') });
    expect(storage[`${ORIGIN}/other`]).toEqual({ 'page name=a': text('second') });
  });

  it('saves the old page with what was typed there, not the new DOM', async () => {
    const { storage } = start();
    type('a', 'typed');
    // Navigate before the debounce fires; the new view has different fields.
    url = `${ORIGIN}/other`;
    document.body.innerHTML = `<input name="z">`;
    await vi.runAllTimersAsync();
    expect(storage[`${ORIGIN}/form`]).toEqual({ 'page name=a': text('typed'), 'page name=b': text('') });
    expect(storage[`${ORIGIN}/other`]).toBeUndefined();
  });

  it('restores the new page after navigating', async () => {
    start({ [`${ORIGIN}/other`]: { 'page name=x': text('there') } });
    await vi.runAllTimersAsync();
    url = `${ORIGIN}/other`;
    document.body.innerHTML = `<input name="x">`;
    await vi.advanceTimersByTimeAsync(100);
    expect($('x').value).toBe('there');
  });

  it('treats query-only changes as the same page', async () => {
    const { onPage } = start();
    url = `${ORIGIN}/form?tab=2`;
    document.body.append(document.createElement('div'));
    await vi.advanceTimersByTimeAsync(0);
    expect(onPage).toHaveBeenCalledOnce();
  });
});
