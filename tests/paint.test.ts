import { describe, expect, it, vi } from 'vitest';
import { activeStatus } from '../src/core';
import { paint, type ActionApi } from '../src/background/paint';

const fake = (overrides: Partial<ActionApi> = {}): ActionApi & { setIcon: ReturnType<typeof vi.fn> } => ({
  setIcon: vi.fn(async () => {}),
  setBadgeText: vi.fn(async () => {}),
  setBadgeBackgroundColor: vi.fn(async () => {}),
  setTitle: vi.fn(async () => {}),
  ...overrides,
}) as never;

describe('paint', () => {
  it('sets icon, badge, colour and title for a tab', async () => {
    const action = fake();
    await paint(action, 7, activeStatus('http://localhost/x'));
    expect(action.setIcon).toHaveBeenCalledWith(expect.objectContaining({ tabId: 7 }));
    expect(action.setBadgeText).toHaveBeenCalledWith({ tabId: 7, text: 'ON' });
  });

  it.each([undefined, -1, 1.5, Number.NaN])('ignores events without a real tab (%s)', async (tabId) => {
    const action = fake();
    await expect(paint(action, tabId, activeStatus('http://localhost/x'))).resolves.toBeUndefined();
    expect(action.setIcon).not.toHaveBeenCalled();
  });

  it('does not reject when the tab closed before Chrome applied the change', async () => {
    const closed = () => Promise.reject(new Error('No tab with id: 552945566.'));
    const action = fake({ setIcon: closed, setBadgeText: closed, setBadgeBackgroundColor: closed, setTitle: closed });
    await expect(paint(action, 552945566, activeStatus('http://localhost/x'))).resolves.toBeUndefined();
  });

  it('does not throw when an API throws synchronously for a bad tab id', async () => {
    const action = fake({
      setIcon: () => {
        throw new TypeError("Error at property 'tabId': Value must be at least 0.");
      },
    });
    await expect(paint(action, 3, activeStatus('http://localhost/x'))).resolves.toBeUndefined();
  });
});
