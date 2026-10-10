import type { TabStatus } from '@/core';

/** The slice of `browser.action` we use, so painting can be tested without a browser. */
export interface ActionApi {
  setIcon(details: { tabId: number; path: Record<string, string> }): Promise<void>;
  setBadgeText(details: { tabId: number; text: string }): Promise<void>;
  setBadgeBackgroundColor(details: { tabId: number; color: string }): Promise<void>;
  setTitle(details: { tabId: number; title: string }): Promise<void>;
}

const SIZES = [16, 32, 48, 128] as const;
const iconSet = (dir: string) => Object.fromEntries(SIZES.map((size) => [size, `/${dir}/${size}.png`]));
const ICONS = { active: iconSet('icon'), paused: iconSet('icon-inactive'), inactive: iconSet('icon-inactive') };
const BADGE_COLORS = { active: '#16a34a', paused: '#6b7280', inactive: '#6b7280' };

/**
 * Paints one tab's toolbar icon. A tab can close or navigate between the moment we decide to paint
 * and the moment Chrome applies it ("No tab with id"), and some events carry no real tab at all
 * (id -1). Neither is an error worth surfacing, so this never throws or rejects.
 */
export async function paint(action: ActionApi, tabId: number | undefined, status: TabStatus): Promise<void> {
  if (tabId === undefined || !Number.isInteger(tabId) || tabId < 0) return;
  try {
    // allSettled: each call's failure is handled here, none is left unobserved.
    await Promise.allSettled([
      action.setIcon({ tabId, path: ICONS[status.state] }),
      action.setBadgeText({ tabId, text: status.badge }),
      action.setBadgeBackgroundColor({ tabId, color: BADGE_COLORS[status.state] }),
      action.setTitle({ tabId, title: status.title }),
    ]);
  } catch {
    // an API that throws synchronously for a bad tab id
  }
}
