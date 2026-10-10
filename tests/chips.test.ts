import { beforeEach, describe, expect, it } from 'vitest';
import { findWidgets, restoreAll, serializeForm } from '../src/core';

beforeEach(() => {
  document.body.innerHTML = '';
});

const html = (s: string) => (document.body.innerHTML = s);
const chip = (label: string, on = false) => `<button type="button" class="chip${on ? ' chip-on' : ''}">${label}</button>`;
const widgetKeys = () => findWidgets(document).map((w) => w.adapter.id);

/** Wire up click handlers like an app would: toggle (multi) or choose (single). */
function behave(group: Element, mode: 'multi' | 'single') {
  group.querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => {
      if (mode === 'single') group.querySelectorAll('button').forEach((o) => o.classList.remove('chip-on'));
      b.classList.toggle('chip-on', mode === 'single' ? true : !b.classList.contains('chip-on'));
    }),
  );
}

describe('chip groups', () => {
  it('is recognised when it has a label, and reads the highlighted buttons', () => {
    html(`<div><label>Fuel Type</label><div class="chips">${chip('Diesel', true)}${chip('Electric')}${chip('Hybrid', true)}</div></div>`);
    expect(widgetKeys()).toEqual(['chips']);
    expect(serializeForm(document)['page widget=Fuel Type']).toEqual({ kind: 'widget', widget: 'chips', labels: [] });
    // Untouched, so it reads as empty; a change is what gets saved.
    document.querySelector('button:nth-child(2)')!.classList.add('chip-on');
    expect(serializeForm(document)['page widget=Fuel Type']).toMatchObject({ labels: ['Diesel', 'Electric', 'Hybrid'] });
  });

  it.each([
    ['aria-pressed', `<button aria-pressed="true">A</button><button aria-pressed="false">B</button>`],
    ['data-state', `<button data-state="on">A</button><button data-state="off">B</button>`],
    ['a differing class', `<button class="x y">A</button><button class="x">B</button><button class="x">C</button>`],
  ])('reads the selection from %s', async (_, buttons) => {
    html(`<form><div><label>Pick</label><div>${buttons}</div></div></form>`);
    const group = findWidgets(document)[0]!;
    expect(group.adapter.read(group.el)).toEqual(['A']);
  });

  it('restores a multi-choice group by clicking the buttons that differ', async () => {
    html(`<div><label>Fuel</label><div id="g">${chip('Diesel')}${chip('Electric')}${chip('Hybrid')}</div></div>`);
    behave(document.getElementById('g')!, 'multi');
    const report = await restoreAll(document, { 'page widget=Fuel': { kind: 'widget', widget: 'chips', labels: ['Diesel', 'Hybrid'] } });
    expect(report.restored).toEqual(['page widget=Fuel']);
    expect(Array.from(document.querySelectorAll('.chip-on'), (b) => b.textContent)).toEqual(['Diesel', 'Hybrid']);
  });

  it('restores a single-choice group and replaces the previous choice', async () => {
    html(`<div><label>Gearbox</label><div id="g">${chip('Auto', true)}${chip('Manual')}</div></div>`);
    behave(document.getElementById('g')!, 'single');
    await restoreAll(document, { 'page widget=Gearbox': { kind: 'widget', widget: 'chips', labels: ['Manual'] } });
    expect(Array.from(document.querySelectorAll('.chip-on'), (b) => b.textContent)).toEqual(['Manual']);
  });

  it('deselects extra buttons when the saved choice is smaller', async () => {
    html(`<div><label>Fuel</label><div id="g">${chip('Diesel', true)}${chip('Electric', true)}${chip('Hybrid')}</div></div>`);
    behave(document.getElementById('g')!, 'multi');
    await restoreAll(document, { 'page widget=Fuel': { kind: 'widget', widget: 'chips', labels: ['Electric'] } });
    expect(Array.from(document.querySelectorAll('.chip-on'), (b) => b.textContent)).toEqual(['Electric']);
  });

  it('reports a saved option that no longer exists', async () => {
    html(`<div><label>Fuel</label><div id="g">${chip('Diesel')}${chip('Electric')}</div></div>`);
    const report = await restoreAll(document, { 'page widget=Fuel': { kind: 'widget', widget: 'chips', labels: ['Steam'] } });
    expect(report.skipped).toEqual([{ key: 'page widget=Fuel', reason: 'no-option' }]);
  });

  it.each([
    ['navigation', `<nav><label>Pages</label><div>${chip('1', true)}${chip('2')}${chip('3')}</div></nav>`],
    ['pagination', `<div><label>x</label><div class="pagination">${chip('1', true)}${chip('2')}</div></div>`],
    ['a tab list', `<div><label>x</label><div role="tablist">${chip('One', true)}${chip('Two')}</div></div>`],
    ['an unlabelled, form-less group', `<div><div>${chip('A', true)}${chip('B')}</div></div>`],
    ['buttons that submit', `<form><label>x</label><div><button type="submit">Save</button><button type="submit">Save and new</button></div></form>`],
    ['menu buttons', `<div><label>x</label><div><button aria-haspopup="menu">File</button><button aria-haspopup="menu">Edit</button></div></div>`],
    ['a single button', `<div><label>x</label><div>${chip('Only')}</div></div>`],
  ])('is not treated as a field: %s', (_, markup) => {
    html(markup);
    expect(widgetKeys()).not.toContain('chips');
  });
});
