import type { RestoreReport } from './types';

/** What the toolbar icon should say about the current tab. */
export interface TabStatus {
  state: 'active' | 'paused' | 'inactive';
  badge: string;
  title: string;
}

export const INACTIVE_STATUS: TabStatus = {
  state: 'inactive',
  badge: '',
  title: 'form-keeper: inactive on this page (runs on localhost, 127.0.0.1, *.localhost and *.local)',
};

/** Active page, restore not finished yet (or nothing was saved). */
export function activeStatus(page: string): TabStatus {
  return { state: 'active', badge: 'ON', title: `form-keeper: active\nSaving forms on ${page}` };
}

export function restoredStatus(page: string, report: RestoreReport): TabStatus {
  const restored = report.restored.length;
  const matched = restored + report.unchanged.length;
  const total = matched + report.missing.length + report.skipped.length;
  const lines = [`form-keeper: active`, `Saving forms on ${page}`];
  if (total > 0) lines.push(`Restored ${restored} field${restored === 1 ? '' : 's'} (${matched} of ${total} matched)`);
  return { state: 'active', badge: restored > 0 ? String(restored) : 'ON', title: lines.join('\n') };
}

export function pausedStatus(origin: string): TabStatus {
  return { state: 'paused', badge: 'OFF', title: `form-keeper: paused on ${origin}\nOpen the popup to resume` };
}
