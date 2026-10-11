import { describe, expect, it } from 'vitest';
import { bestMatch } from '../src/core/widgets/combobox';

describe('bestMatch', () => {
  const pick = (options: string[], wanted: string) => options[bestMatch(options, wanted)];

  it('prefers an exact match', () => {
    expect(pick(['Finance', 'Finance North', 'Finance South'], 'Finance')).toBe('Finance');
  });

  it('ignores case, accents, extra spaces and punctuation', () => {
    expect(pick(['Community Experience, Trust & Safety'], 'Community Experience , Trust & Safety')).toBe('Community Experience, Trust & Safety');
    expect(pick(['Cafe Creme'], 'Café  Crème')).toBe('Cafe Creme');
    expect(pick(['Dollar ($)'], 'Dollar($)')).toBe('Dollar ($)');
  });

  it('finds an option that carries a count or code the control did not show', () => {
    expect(pick(['Operations (12)', 'Finance (4)'], 'Operations')).toBe('Operations (12)');
  });

  it('finds an option when the control showed more than the menu does', () => {
    expect(pick(['Operations', 'Finance'], 'Operations (12)')).toBe('Operations');
  });

  it('chooses the least embellished of several loose matches', () => {
    expect(pick(['Finance North East', 'Finance North'], 'Finance N')).toBe('Finance North');
  });

  it('returns nothing rather than a wrong option', () => {
    expect(bestMatch(['Alpha', 'Beta'], 'Gamma')).toBe(-1);
    expect(bestMatch(['Alpha'], '   ')).toBe(-1);
    expect(bestMatch([], 'Alpha')).toBe(-1);
  });

  it('does not match a too-short menu entry inside a longer saved label', () => {
    expect(bestMatch(['No', 'Yes'], 'No longer available')).toBe(-1);
  });
});
