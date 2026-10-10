import { describe, expect, it } from 'vitest';
import { formatBytes, labelForKey, previewValue, timeAgo } from '../src/entrypoints/popup/format';

describe('labelForKey', () => {
  it.each([
    ['page name=email', { name: 'email' }],
    ['form#signup name=email', { name: 'email', scope: '#signup' }],
    ['form[name=billing] name=zip', { name: 'zip', scope: 'billing' }],
    ['form0 name=tags value=a', { name: 'tags (a)', scope: 'form0' }],
    ['page radio=plan', { name: 'plan' }],
    ['page id=search', { name: '#search' }],
    ['page path=div1>input1', { name: 'unnamed field' }],
    ['page name=items[] #2', { name: 'items[] #2' }],
  ])('%s', (key, expected) => {
    expect(labelForKey(key)).toEqual(expected);
  });
});

describe('previewValue', () => {
  it('collapses whitespace and truncates long text', () => {
    expect(previewValue({ kind: 'text', value: 'a\n  b' }).text).toBe('a b');
    expect(previewValue({ kind: 'text', value: 'x'.repeat(100) }).text).toHaveLength(48);
  });

  it('marks empty values', () => {
    expect(previewValue({ kind: 'text', value: ' ' })).toEqual({ text: 'empty', empty: true });
    expect(previewValue({ kind: 'radio', value: null })).toEqual({ text: 'none', empty: true });
    expect(previewValue({ kind: 'multi', values: [] })).toEqual({ text: 'none', empty: true });
    expect(previewValue({ kind: 'checkbox', checked: false })).toEqual({ text: 'unchecked', empty: true });
  });

  it('formats selections', () => {
    expect(previewValue({ kind: 'multi', values: ['ts', 'go'] }).text).toBe('ts, go');
    expect(previewValue({ kind: 'checkbox', checked: true }).text).toBe('checked');
  });
});

describe('formatBytes / timeAgo', () => {
  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
  });

  it('formats relative times', () => {
    const now = 1_000_000_000;
    expect(timeAgo(now - 3_000, now)).toBe('just now');
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe('3 h ago');
  });
});
