import { describe, expect, it } from 'vitest';
import { areFieldsEqual, areValuesEqual } from '../src/core/compare';
import type { SavedFields } from '../src/core/types';

describe('areValuesEqual', () => {
  it('compares text values', () => {
    expect(areValuesEqual({ kind: 'text', value: 'hello' }, { kind: 'text', value: 'hello' })).toBe(true);
    expect(areValuesEqual({ kind: 'text', value: 'hello' }, { kind: 'text', value: 'world' })).toBe(false);
  });

  it('compares checkbox values', () => {
    expect(areValuesEqual({ kind: 'checkbox', checked: true }, { kind: 'checkbox', checked: true })).toBe(true);
    expect(areValuesEqual({ kind: 'checkbox', checked: true }, { kind: 'checkbox', checked: false })).toBe(false);
  });

  it('compares radio values', () => {
    expect(areValuesEqual({ kind: 'radio', value: 'opt1' }, { kind: 'radio', value: 'opt1' })).toBe(true);
    expect(areValuesEqual({ kind: 'radio', value: 'opt1' }, { kind: 'radio', value: null })).toBe(false);
  });

  it('compares multi-select values', () => {
    expect(areValuesEqual({ kind: 'multi', values: ['a', 'b'] }, { kind: 'multi', values: ['a', 'b'] })).toBe(true);
    expect(areValuesEqual({ kind: 'multi', values: ['a', 'b'] }, { kind: 'multi', values: ['a', 'c'] })).toBe(false);
    expect(areValuesEqual({ kind: 'multi', values: ['a', 'b'] }, { kind: 'multi', values: ['a'] })).toBe(false);
  });

  it('compares widget values', () => {
    expect(
      areValuesEqual(
        { kind: 'widget', widget: 'combobox', labels: ['Option 1'] },
        { kind: 'widget', widget: 'combobox', labels: ['Option 1'] },
      ),
    ).toBe(true);
    expect(
      areValuesEqual(
        { kind: 'widget', widget: 'combobox', labels: ['Option 1'] },
        { kind: 'widget', widget: 'chips', labels: ['Option 1'] },
      ),
    ).toBe(false);
    expect(
      areValuesEqual(
        { kind: 'widget', widget: 'combobox', labels: ['Option 1'] },
        { kind: 'widget', widget: 'combobox', labels: ['Option 2'] },
      ),
    ).toBe(false);
  });

  it('compares file values', () => {
    const fileA = { name: 'avatar.png', type: 'image/png', size: 1024, lastModified: 1000, data: 'base64...' };
    const fileB = { name: 'avatar.png', type: 'image/png', size: 1024, lastModified: 1000, data: 'base64...' };
    const fileC = { name: 'avatar.png', type: 'image/png', size: 2048, lastModified: 1000, data: 'base64...' };

    expect(areValuesEqual({ kind: 'file', files: [fileA] }, { kind: 'file', files: [fileB] })).toBe(true);
    expect(areValuesEqual({ kind: 'file', files: [fileA] }, { kind: 'file', files: [fileC] })).toBe(false);
    expect(areValuesEqual({ kind: 'file', files: [fileA] }, { kind: 'file', files: [] })).toBe(false);
  });

  it('returns false for kind mismatch', () => {
    expect(areValuesEqual({ kind: 'text', value: 'true' }, { kind: 'checkbox', checked: true })).toBe(false);
  });
});

describe('areFieldsEqual', () => {
  it('returns true for identical references and empty objects', () => {
    const obj: SavedFields = {};
    expect(areFieldsEqual(obj, obj)).toBe(true);
    expect(areFieldsEqual({}, {})).toBe(true);
  });

  it('compares records with matching keys and values', () => {
    const f1: SavedFields = {
      'page name=email': { kind: 'text', value: 'user@example.com' },
      'page name=subscribe': { kind: 'checkbox', checked: true },
    };
    const f2: SavedFields = {
      'page name=email': { kind: 'text', value: 'user@example.com' },
      'page name=subscribe': { kind: 'checkbox', checked: true },
    };
    expect(areFieldsEqual(f1, f2)).toBe(true);
  });

  it('detects mismatched keys or values', () => {
    const f1: SavedFields = {
      'page name=email': { kind: 'text', value: 'user@example.com' },
    };
    const f2: SavedFields = {
      'page name=email': { kind: 'text', value: 'other@example.com' },
    };
    const f3: SavedFields = {
      'page name=email': { kind: 'text', value: 'user@example.com' },
      'page name=name': { kind: 'text', value: 'Alice' },
    };
    expect(areFieldsEqual(f1, f2)).toBe(false);
    expect(areFieldsEqual(f1, f3)).toBe(false);
    expect(areFieldsEqual(f3, f1)).toBe(false);
  });
});
