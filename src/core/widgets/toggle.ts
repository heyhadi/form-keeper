import type { WidgetAdapter, WriteOutcome } from '../types';
import { normalize, pressUntil } from './interact';

/** Switches and checkboxes built from divs/buttons with ARIA roles instead of <input>. */
export const toggleAdapter: WidgetAdapter = {
  id: 'toggle',
  find: (root) =>
    Array.from(root.querySelectorAll<HTMLElement>('[role="switch"], [role="checkbox"]')).filter((el) => el.tagName !== 'INPUT'),
  read: (el) => (el.getAttribute('aria-checked') === 'true' ? ['on'] : ['off']),
  async write(el, labels): Promise<WriteOutcome> {
    if (el.matches('[disabled], [aria-disabled="true"]')) return 'disabled';
    const want = labels[0] === 'on';
    const isOn = () => el.getAttribute('aria-checked') === 'true';
    if (isOn() === want) return 'unchanged';
    await pressUntil(el, () => isOn() === want);
    return isOn() === want ? 'restored' : 'rejected';
  },
};

/** Radio groups made of role="radio" elements. The saved value is the chosen option's label. */
export const radioGroupAdapter: WidgetAdapter = {
  id: 'radiogroup',
  find: (root) =>
    Array.from(root.querySelectorAll<HTMLElement>('[role="radiogroup"]')).filter((g) => g.querySelector('[role="radio"]:not(input)')),
  read(group) {
    const checked = group.querySelector<HTMLElement>('[role="radio"][aria-checked="true"], [role="radio"][data-state="checked"]');
    return checked ? [normalize(checked.getAttribute('aria-label') ?? checked.textContent)] : [];
  },
  async write(group, labels): Promise<WriteOutcome> {
    const want = normalize(labels[0]).toLowerCase();
    const radios = Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]'));
    const target = radios.find((r) => normalize(r.getAttribute('aria-label') ?? r.textContent).toLowerCase() === want);
    if (!target) return 'no-option';
    if (target.matches('[disabled], [aria-disabled="true"]')) return 'disabled';
    const isOn = () => target.getAttribute('aria-checked') === 'true' || target.getAttribute('data-state') === 'checked';
    if (isOn()) return 'unchanged';
    await pressUntil(target, isOn);
    return isOn() ? 'restored' : 'rejected';
  },
};
