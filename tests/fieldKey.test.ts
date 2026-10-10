import { beforeEach, describe, expect, it } from 'vitest';
import { collectFields } from '../src/core';

const keys = () => collectFields(document).map((f) => f.key);

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('field keys', () => {
  it('prefers form id, then form name, then form index for scope', () => {
    document.body.innerHTML = `
      <form id="signup"><input name="a"></form>
      <form name="billing"><input name="a"></form>
      <form><input name="a"></form>`;
    expect(keys()).toEqual(['form#signup name=a', 'form[name=billing] name=a', 'form2 name=a']);
  });

  it('uses "page" scope for controls outside a form', () => {
    document.body.innerHTML = `<input name="q">`;
    expect(keys()).toEqual(['page name=q']);
  });

  it('is not fooled by controls named "id" shadowing form.id', () => {
    document.body.innerHTML = `<form><input name="id"></form>`;
    expect(keys()).toEqual(['form0 name=id']);
  });

  it('falls back from name to id to DOM path', () => {
    document.body.innerHTML = `
      <form id="f">
        <input name="byName" id="ignored">
        <input id="byId">
        <div><label><input></label></div>
      </form>`;
    expect(keys()).toEqual(['form#f name=byName', 'form#f id=byId', 'form#f path=div1>label1>input1']);
  });

  it('distinguishes same-name checkboxes by value', () => {
    document.body.innerHTML = `<input type="checkbox" name="tags" value="a"><input type="checkbox" name="tags" value="b">`;
    expect(keys()).toEqual(['page name=tags value=a', 'page name=tags value=b']);
  });

  it('suffixes true duplicates in DOM order', () => {
    document.body.innerHTML = `<input name="items[]"><input name="items[]"><input name="items[]">`;
    expect(keys()).toEqual(['page name=items[]', 'page name=items[] #2', 'page name=items[] #3']);
  });

  it('groups radios by name within a form', () => {
    document.body.innerHTML = `
      <form id="a"><input type="radio" name="size" value="s"><input type="radio" name="size" value="m"></form>
      <form id="b"><input type="radio" name="size" value="s"></form>`;
    const fields = collectFields(document);
    expect(fields.map((f) => f.key)).toEqual(['form#a radio=size', 'form#b radio=size']);
    expect(fields[0]?.kind === 'radio' && fields[0].els).toHaveLength(2);
  });

  it('is stable across identical renders', () => {
    const html = `<form><input name="a"><div><input></div><select name="s"></select></form>`;
    document.body.innerHTML = html;
    const first = keys();
    document.body.innerHTML = html;
    expect(keys()).toEqual(first);
  });
});

describe('widget labels', () => {
  it('ignores hidden live regions that echo the chosen value', () => {
    document.body.innerHTML = `
      <div><label>City</label><span aria-live="polite" style="width:0px;height:0px;opacity:0">Jakarta</span>
      <div class="select"><input role="combobox" readonly></div></div>`;
    expect(keys()).toEqual(['page widget=City']);
  });

  it('ignores aria-labelledby pointing at the widget itself', () => {
    document.body.innerHTML = `
      <div><label id="l">City</label>
      <div role="combobox" id="v" aria-labelledby="l v" tabindex="0">Jakarta</div></div>`;
    expect(keys()).toEqual(['page widget=City']);
  });

  it('does not use an aria-label that echoes the value over the visible label', () => {
    document.body.innerHTML = `<div><label>City</label><div role="combobox" aria-label="Jakarta" tabindex="0">Jakarta</div></div>`;
    expect(keys()).toEqual(['page widget=City']);
  });

  it('keeps the same key before and after a value is chosen', () => {
    document.body.innerHTML = `<div><label>City</label><div role="combobox" tabindex="0"></div></div>`;
    const before = keys();
    document.querySelector('[role=combobox]')!.textContent = 'Jakarta';
    expect(keys()).toEqual(before);
  });
});
