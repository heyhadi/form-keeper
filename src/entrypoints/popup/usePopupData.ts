import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SITE_SETTINGS, siteOf, type Recipe, type SiteSettings } from '@/core';
import type { TabState } from '@/messages';
import { bytesInUse, listPages, loadRecipes, loadRecord, loadSettings, type PageRecord, type PageSummary } from '@/storage';
import { getActiveTab, getTabState } from './api';

export interface PopupData {
  loading: boolean;
  tabId?: number;
  /** `protocol//hostname` of the current tab, when it is a web page. */
  site?: string;
  /** Set when the content script is running on the current tab. */
  tab?: TabState;
  record?: PageRecord;
  pages: PageSummary[];
  bytes: number;
  settings: SiteSettings;
  /** Controls taught on this site. */
  recipes: Recipe[];
}

const EMPTY: PopupData = { loading: true, pages: [], bytes: 0, settings: DEFAULT_SITE_SETTINGS, recipes: [] };

export function usePopupData() {
  const [data, setData] = useState<PopupData>(EMPTY);

  const refresh = useCallback(async () => {
    const active = await getActiveTab();
    const tab = active ? await getTabState(active.id) : undefined;
    const [record, pages, bytes, settings, recipes] = await Promise.all([
      tab ? loadRecord(tab.page) : undefined,
      listPages(),
      bytesInUse(),
      loadSettings(),
      tab ? loadRecipes(tab.origin) : Promise.resolve([]),
    ]);
    setData({ loading: false, tabId: active?.id, site: active?.url ? siteOf(active.url) : undefined, tab, record, pages, bytes, settings, recipes });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, refresh };
}
