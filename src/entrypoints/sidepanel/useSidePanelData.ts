import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { DEFAULT_SITE_SETTINGS, siteOf, type SiteSettings } from '@/core';
import type { TabState } from '@/messages';
import {
  bytesInUse,
  listPages,
  loadSettings,
  type PageSummary,
} from '@/storage';
import { getActiveTab, getTabState, type ActiveTab } from '../popup/api';

export interface SidePanelData {
  loading: boolean;
  activeTab?: ActiveTab;
  site?: string;
  tabState?: TabState;
  pages: PageSummary[];
  bytes: number;
  settings: SiteSettings;
}

const EMPTY_DATA: SidePanelData = {
  loading: true,
  pages: [],
  bytes: 0,
  settings: DEFAULT_SITE_SETTINGS,
};

export function useSidePanelData() {
  const [data, setData] = useState<SidePanelData>(EMPTY_DATA);

  const refresh = useCallback(async () => {
    const active = await getActiveTab();
    const tabState = active?.id !== undefined ? await getTabState(active.id) : undefined;
    const [pages, bytes, settings] = await Promise.all([
      listPages(),
      bytesInUse(),
      loadSettings(),
    ]);

    setData({
      loading: false,
      activeTab: active,
      site: active?.url ? siteOf(active.url) : undefined,
      tabState,
      pages,
      bytes,
      settings,
    });
  }, []);

  useEffect(() => {
    void refresh();

    const onActivated = () => void refresh();
    const onUpdated = (_tabId: number, changeInfo: { status?: string; url?: string }) => {
      if (changeInfo.status === 'complete' || changeInfo.url) void refresh();
    };
    const onStorage = (_changes: Record<string, unknown>, area: string) => {
      if (area === 'local') void refresh();
    };

    browser.tabs.onActivated.addListener(onActivated);
    browser.tabs.onUpdated.addListener(onUpdated);
    browser.storage.onChanged.addListener(onStorage);
    window.addEventListener('focus', refresh);

    return () => {
      browser.tabs.onActivated.removeListener(onActivated);
      browser.tabs.onUpdated.removeListener(onUpdated);
      browser.storage.onChanged.removeListener(onStorage);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  return { data, refresh };
}
