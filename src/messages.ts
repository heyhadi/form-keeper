import type { Diagnostics, RestoreReport, TabStatus } from './core';

/** Content script -> background: update this tab's toolbar icon. */
export interface StatusMessage {
  type: 'status';
  status: TabStatus;
}

/** Popup -> content script. */
export type TabRequest =
  | { type: 'getState' }
  | { type: 'restoreNow' }
  | { type: 'clearPage' }
  /** Fill this page with values saved on another page. */
  | { type: 'restoreFrom'; page: string }
  /** Start teach mode on this page (the popup closes so the user can use the page). */
  | { type: 'teach' }
  /** Describe what was found on this page, for troubleshooting. */
  | { type: 'diagnose' };

export type RestoreFromReport = RestoreReport & { unmatched: string[] };

export interface TabState {
  page: string;
  origin: string;
  paused: boolean;
  /** Result of the last restore on this page, if one has finished. */
  report?: RestoreReport;
}

export interface TabResponses {
  getState: TabState;
  restoreNow: RestoreReport | null;
  clearPage: null;
  restoreFrom: RestoreFromReport | null;
  teach: null;
  diagnose: Diagnostics;
}
