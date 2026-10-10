import { act, useState, type FormEvent } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { restoreForm, type SavedFields } from '../src/core';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Values {
  name: string;
  plan: string;
  agree: boolean;
  country: string;
}

let submitted: Values | undefined;

/** A fully controlled form: the DOM only shows what React state says. */
function ControlledForm() {
  const [values, setValues] = useState<Values>({ name: '', plan: 'free', agree: false, country: 'sg' });
  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((v) => ({ ...v, [key]: value }));
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submitted = values;
  };
  return (
    <form id="f" onSubmit={onSubmit}>
      <input name="name" value={values.name} onChange={(e) => set('name', e.target.value)} />
      {(['free', 'pro'] as const).map((plan) => (
        <input key={plan} type="radio" name="plan" value={plan} checked={values.plan === plan} onChange={() => set('plan', plan)} />
      ))}
      <input type="checkbox" name="agree" checked={values.agree} onChange={(e) => set('agree', e.target.checked)} />
      <select name="country" value={values.country} onChange={(e) => set('country', e.target.value)}>
        <option value="sg">SG</option>
        <option value="id">ID</option>
      </select>
      {/* Conditionally rendered: only appears once `agree` is restored. */}
      {values.agree && <input name="terms-version" defaultValue="" />}
      <output>{JSON.stringify(values)}</output>
      <button type="submit">Save</button>
    </form>
  );
}

const SAVED: SavedFields = {
  'form#f name=name': { kind: 'text', value: 'Hadi' },
  'form#f radio=plan': { kind: 'radio', value: 'pro' },
  'form#f name=agree value=on': { kind: 'checkbox', checked: true },
  'form#f name=country': { kind: 'text', value: 'id' },
  'form#f name=terms-version': { kind: 'text', value: 'v2' },
};

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  submitted = undefined;
  container = document.body.appendChild(document.createElement('div'));
  root = createRoot(container);
  await act(async () => root.render(<ControlledForm />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const state = () => JSON.parse(container.querySelector('output')!.textContent!) as Values;

describe('restoring into a React controlled form', () => {
  it('updates React state, not just the DOM', async () => {
    await act(async () => void restoreForm(document, SAVED));

    expect(state()).toEqual({ name: 'Hadi', plan: 'pro', agree: true, country: 'id' });
    // A re-render would wipe values React did not accept; they survive because state matches.
    expect(container.querySelector<HTMLInputElement>('[name=name]')!.value).toBe('Hadi');
  });

  it('submits the restored values', async () => {
    await act(async () => void restoreForm(document, SAVED));
    await act(async () => container.querySelector('button')!.click());
    expect(submitted).toEqual({ name: 'Hadi', plan: 'pro', agree: true, country: 'id' });
  });

  it('fills fields revealed by earlier restored fields on the next pass', async () => {
    let first!: ReturnType<typeof restoreForm>;
    await act(async () => void (first = restoreForm(document, SAVED)));
    expect(first.missing).toEqual(['form#f name=terms-version']);

    let second!: ReturnType<typeof restoreForm>;
    await act(async () => void (second = restoreForm(document, SAVED)));
    expect(second.restored).toEqual(['form#f name=terms-version']);
    expect(container.querySelector<HTMLInputElement>('[name=terms-version]')!.value).toBe('v2');
  });

  it('would not work with a plain `el.value =` assignment (why setNativeValue exists)', async () => {
    const input = container.querySelector<HTMLInputElement>('[name=name]')!;
    await act(async () => {
      input.value = 'Hadi';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(state().name).toBe('');
  });
});
